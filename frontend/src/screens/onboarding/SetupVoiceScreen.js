import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MicIcon, StopIcon } from '../../components/Icons';
import { Audio } from 'expo-av';
import { auth } from '../../config/firebase';
import { cloneVoice, getVoiceStatus } from '../../services/voiceService';
import { setOnboardingComplete } from '../../utils/storage';
import { logScreenView, logFunnelEvent } from '../../utils/analytics';

// The three reference sentences used to capture a baseline voice profile.
const SENTENCES = [
  "I need to schedule an appointment with my doctor for next Tuesday, at three o'clock.",
  "I love spending time with my family, especially my grandchildren when they visit on weekends.",
  "The weather today is absolutely beautiful and I feel grateful to be outside enjoying it.",
];

export default function SetupVoiceScreen({ navigation }) {
  const [currentIndex, setCurrentIndex]   = useState(0);
  const [recordings, setRecordings]       = useState([null, null, null]);
  const [isRecording, setIsRecording]     = useState(false);
  const [isCloningVoice, setIsCloningVoice] = useState(false);
  const recordingRef = useRef(null);

  useEffect(() => {
    const logExit = logScreenView('SetupVoice');
    return () => {
      logExit();
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
    };
  }, []);

  function handleMicPress() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  async function startRecording() {
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
    } catch {
      Alert.alert('Error', 'Could not start recording. Please check microphone permissions.');
    }
  }

  async function stopRecording() {
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

        <Text style={styles.title}>Voice Setup</Text>
        <Text style={styles.subtitle}>Press the button and read this sentence aloud:</Text>

        <View style={styles.sentenceCard}>
          <Text style={styles.sentenceText}>"{SENTENCES[currentIndex]}"</Text>
        </View>
      </LinearGradient>

      {/* Bottom half — teal background with mic button and progress dots */}
      <LinearGradient colors={['#37767A', '#1C4047', '#0A1618']} style={styles.bottomHalf}>
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

        <Text style={styles.recordingStatus} accessibilityLiveRegion="polite">
          {isRecording ? 'Recording…  tap to stop' : `Sentence ${currentIndex + 1} of ${SENTENCES.length}`}
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
    fontSize: 16,
    color: '#1C4047',
    marginBottom: 24,
    lineHeight: 24,
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
    fontSize: 20,
    color: '#1C4047',
    lineHeight: 32,
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
