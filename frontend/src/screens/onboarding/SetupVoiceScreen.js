import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';

// Silence detection constants — same pattern used in AssessmentScreen.
// A sentence recording auto-stops after ~1.8s of silence post-speech.
const BAR_INTERVAL_MS    = 80;
const SPEAK_THRESHOLD    = 0.25;   // dBFS-normalised volume: above = speaking
const SILENCE_THRESHOLD  = 0.18;   // below = silence
const MIN_SPEAK_FRAMES   = 3;      // frames above threshold before "user has spoken"
const SILENCE_FRAMES     = Math.round(1800 / BAR_INTERVAL_MS); // ~22 frames = 1.8 s
import { LinearGradient } from 'expo-linear-gradient';
import { MicIcon, StopIcon } from '../../components/Icons';
import SpeakerButton from '../../components/SpeakerButton';
import { Audio } from 'expo-av';
import { auth } from '../../config/firebase';
import { cloneVoice, getVoiceStatus } from '../../services/voiceService';
import { setOnboardingComplete } from '../../utils/storage';
import { logScreenView, logFunnelEvent } from '../../utils/analytics';
import { useLargeText } from '../../context/PrefsContext';

// The three reference sentences used to capture a baseline voice profile.
const SENTENCES = [
  "I need to schedule an appointment with my doctor for next Tuesday, at three o'clock.",
  "I love spending time with my family, especially my grandchildren when they visit on weekends.",
  "The weather today is absolutely beautiful and I feel grateful to be outside enjoying it.",
];

export default function SetupVoiceScreen({ navigation }) {
  const largeText = useLargeText();
  const fs = (n) => largeText ? Math.round(n * 1.25) : n;

  const [currentIndex, setCurrentIndex]   = useState(0);
  const [recordings, setRecordings]       = useState([null, null, null]);
  const [isRecording, setIsRecording]     = useState(false);
  const [isCloningVoice, setIsCloningVoice] = useState(false);
  const recordingRef     = useRef(null);
  // Silence detection refs
  const meteringTimerRef = useRef(null);
  const volumeRef        = useRef(0);
  const hasSpokenRef     = useRef(false);
  const speakFramesRef   = useRef(0);
  const silenceCountRef  = useRef(0);
  // Prevents stopRecording from firing twice if both timer and tap happen simultaneously
  const stoppingRef      = useRef(false);
  // Pulsing ring animation — expands and fades while recording to signal active mic
  const pulseAnim        = useRef(new Animated.Value(1)).current;

  // Start / stop the pulsing ring whenever recording state changes.
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.65, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.00, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [isRecording]);

  useEffect(() => {
    const logExit = logScreenView('SetupVoice');
    return () => {
      logExit();
      // Stop any in-progress recording when the screen unmounts (e.g. user navigates back).
      clearInterval(meteringTimerRef.current);
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
    };
  }, []);

  function handleMicPress() {
    // Tap-to-stop is always available as a manual override during recording.
    if (isRecording) {
      if (!stoppingRef.current) {
        stoppingRef.current = true;
        stopRecording();
      }
    } else {
      startRecording();
    }
  }

  async function startRecording() {
    try {
      // Reset silence detection state for each new sentence.
      hasSpokenRef.current   = false;
      speakFramesRef.current = 0;
      silenceCountRef.current = 0;
      stoppingRef.current    = false;

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      // Enable metering so we can read volume during recording for silence detection.
      const { recording } = await Audio.Recording.createAsync(
        { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
        (status) => {
          // Convert dBFS (-160 … 0) to a normalised 0–1 volume value.
          const db = status.metering ?? -160;
          volumeRef.current = Math.min(1, Math.max(0, (db + 70) / 60));
        },
        BAR_INTERVAL_MS,
      );
      recordingRef.current = recording;
      setIsRecording(true);

      // Poll volume at BAR_INTERVAL_MS to detect silence after speech has begun.
      meteringTimerRef.current = setInterval(() => {
        if (stoppingRef.current) return;
        const vol = volumeRef.current;

        if (!hasSpokenRef.current) {
          // Wait for a run of loud frames before enabling silence detection —
          // avoids triggering on the quiet moment right at tap.
          if (vol > SPEAK_THRESHOLD) {
            speakFramesRef.current += 1;
            if (speakFramesRef.current >= MIN_SPEAK_FRAMES) hasSpokenRef.current = true;
          } else {
            speakFramesRef.current = 0;
          }
        } else {
          // User has spoken — now watch for sustained silence to auto-stop.
          if (vol < SILENCE_THRESHOLD) {
            silenceCountRef.current += 1;
            if (silenceCountRef.current >= SILENCE_FRAMES) {
              stoppingRef.current = true;
              stopRecording();
            }
          } else {
            silenceCountRef.current = 0;
          }
        }
      }, BAR_INTERVAL_MS);

    } catch {
      Alert.alert('Error', 'Could not start recording. Please check microphone permissions.');
    }
  }

  async function stopRecording() {
    // Clear the metering interval regardless of how stop was triggered.
    clearInterval(meteringTimerRef.current);
    meteringTimerRef.current = null;

    if (!recordingRef.current) return;
    setIsRecording(false);

    await recordingRef.current.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
    const uri = recordingRef.current.getURI();
    recordingRef.current = null;

    // Save the URI for this sentence and advance to the next one.
    const updated = [...recordings];
    updated[currentIndex] = uri;
    setRecordings(updated);

    if (currentIndex < SENTENCES.length - 1) {
      // Brief pause before showing the next sentence so the transition
      // feels deliberate rather than abrupt.
      setTimeout(() => setCurrentIndex(currentIndex + 1), 400);
    } else {
      await finishSetup(updated);
    }
  }

  /**
   * Called after all three sentences are recorded.
   * Attempts to clone the user's voice from the recordings, then navigates home.
   * Voice cloning runs in the background — a failure is non-fatal and the user
   * proceeds with the default voice instead.
   */
  async function finishSetup(recordedUris) {
    const user = auth.currentUser;

    if (user) {
      // Show a loading indicator while the voice samples are uploaded and
      // processed by ElevenLabs. This typically takes 10-30 seconds.
      setIsCloningVoice(true);
      try {
        const status = await getVoiceStatus().catch(() => ({ has_cloned_voice: false }));
        if (!status.has_cloned_voice) {
          const validUris = recordedUris.filter(Boolean);
          await cloneVoice(validUris, user.displayName || 'User');
        }
      } catch (err) {
        // Voice cloning failure is non-fatal — the app falls back to the
        // default voice. Log the error but do not block the user.
        console.warn('Voice cloning failed (non-fatal):', err.message);
      } finally {
        setIsCloningVoice(false);
      }
    }

    logFunnelEvent('voice_setup_completed');
    await setOnboardingComplete();
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  }

  async function handleSkip() {
    logFunnelEvent('voice_setup_skipped');
    await setOnboardingComplete();
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  }

  // Show a full-screen loading state while the voice clone is being created.
  if (isCloningVoice) {
    return (
      <LinearGradient colors={['#37767A', '#1C4047', '#0A1618']} style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.loadingTitle}>Creating your voice profile</Text>
        <Text style={styles.loadingSubtitle}>This may take up to 30 seconds...</Text>
      </LinearGradient>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Top half — light mint background with sentence card */}
      <LinearGradient colors={['#E0ECDE', '#C5E0D4']} style={styles.topHalf}>
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Skip voice setup">
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>

        <Text style={[styles.title, { fontSize: fs(38) }]}>Voice Setup</Text>
        <Text style={[styles.subtitle, { fontSize: fs(18), lineHeight: fs(18) * 1.55 }]}>Tap the mic button, then read the sentence aloud. Recording stops automatically when you finish.</Text>

        {/* Row that labels the card and offers a read-aloud button for accessibility */}
        <View style={styles.sentenceHeader}>
          <Text style={[styles.sentenceLabel, { fontSize: fs(17) }]}>Read this sentence:</Text>
          <SpeakerButton text={SENTENCES[currentIndex]} size={44} />
        </View>

        <View style={styles.sentenceCard}>
          <Text style={[styles.sentenceText, { fontSize: fs(22), lineHeight: fs(22) * 1.55 }]}>"{SENTENCES[currentIndex]}"</Text>
        </View>
      </LinearGradient>

      {/* Bottom half — teal background with mic button and progress dots */}
      <LinearGradient colors={['#37767A', '#1C4047', '#0A1618']} style={styles.bottomHalf}>
        {/* Mic button with animated pulse ring — ring scales in/out while recording
            to give a clear "mic is hot" signal, similar to Speech Enhancement */}
        <View style={styles.micWrapper}>
          <Animated.View
            style={[
              styles.micPulse,
              { transform: [{ scale: pulseAnim }], opacity: isRecording ? 1 : 0 },
            ]}
          />
          <TouchableOpacity
            style={[styles.micBtn, isRecording && styles.micBtnRecording]}
            onPress={handleMicPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
          >
            {isRecording
              ? <StopIcon size={28} color="#1A1A1A" />
              : <MicIcon  size={28} color="#FFFFFF" />
            }
          </TouchableOpacity>
        </View>

        <Text style={[styles.recordingStatus, { fontSize: fs(16) }]} accessibilityLiveRegion="polite">
          {isRecording ? 'Recording… stops when you finish' : `Sentence ${currentIndex + 1} of ${SENTENCES.length}`}
        </Text>

        {/* One dot per sentence; the current sentence is highlighted white. */}
        <View style={styles.dotsRow}>
          {SENTENCES.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === currentIndex ? styles.dotCurrent : styles.dotOther]}
            />
          ))}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  topHalf: {
    flex: 1,
    paddingTop: 52,
    paddingHorizontal: 28,
    paddingBottom: 24,
  },

  skipBtn: {
    alignSelf: 'flex-end',
    backgroundColor: '#FFA940',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 20,
  },
  skipText: {
    color: '#1A1A1A',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  title: {
    fontSize: 38,
    fontWeight: '700',
    color: '#1C4047',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 18,
    color: '#1C4047',
    marginBottom: 16,
    lineHeight: 28,
    letterSpacing: 0.3,
  },

  sentenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sentenceLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C4047',
    letterSpacing: 0.3,
  },

  sentenceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    flex: 1,
    justifyContent: 'center',
  },
  sentenceText: {
    fontSize: 22,
    color: '#1C4047',
    lineHeight: 34,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.3,
  },

  bottomHalf: {
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },

  micWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The pulsing halo ring behind the mic button — same visual language as
  // the waveform in SpeechEnhancementScreen to signal "mic is active".
  micPulse: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255,169,64,0.30)',
  },
  micBtn: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#2D6974',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  micBtnRecording: {
    backgroundColor: '#FFA940',
  },
  // Removed: micIcon text style replaced by MicIcon/StopIcon SVG components.

  dotsRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dotCurrent: {
    backgroundColor: '#FFFFFF',
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  dotOther: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },

  recordingStatus: {
    color: 'rgba(255,255,255,0.80)',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // Voice cloning loading screen
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 40,
  },
  loadingTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  loadingSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
