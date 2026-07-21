/**
 * VoiceSetupExercise
 *
 * The final exercise in the baseline session. Records two short sentences from
 * the user and uploads them to create a personal voice clone for Smart Speech.
 *
 * Three phases:
 *   intro      — explains what's happening; offers "Skip for now"
 *   recording  — shows one sentence at a time; tap mic to start/stop
 *   processing — ActivityIndicator while samples are uploaded to ElevenLabs
 *
 * Voice cloning is non-fatal: if upload fails, onComplete(100) is still called
 * so the session finishes normally. The user proceeds with the default voice.
 *
 * Props: onComplete(score), onSkip(), onExit(), exerciseIndex, totalExercises
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { MicIcon, StopIcon } from '../../../components/Icons';
import { auth } from '../../../config/firebase';
import { cloneVoice, getVoiceStatus } from '../../../services/voiceService';
import { getUserProfile } from '../../../utils/storage';
import { useLargeText } from '../../../context/PrefsContext';

const { width: W } = Dimensions.get('window');

const BG_GRADIENT  = ['#37767A', '#1C4047', '#0A1618'];
const BG_LOCATIONS = [0.2, 0.44, 1.0];
const BG_START     = { x: 1, y: 0.1 };
const BG_END       = { x: 0, y: 0.9 };

const ORANGE = '#FFA940';
const WHITE  = '#FFFFFF';
const MINT   = '#C3DECE';

// Two phonetically rich sentences that capture a broad sound range in a short read.
const SENTENCES = [
  "I need to schedule an appointment with my doctor for next Tuesday at three o'clock.",
  "The weather today is absolutely beautiful and I feel grateful to be outside enjoying it.",
];

// ── Fade-in wrapper — each screen fades in on mount ───────────────────────────
function FadeIn({ children }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);
  return <Animated.View style={{ flex: 1, opacity }}>{children}</Animated.View>;
}

// ── Session progress bar ───────────────────────────────────────────────────────
// Matches the SessionBar used in BreathingExercise and others.
function SessionBar({ fill = 0 }) {
  return (
    <View style={sb.track}>
      <View style={[sb.fill, { width: `${Math.min(1, fill) * 100}%` }]} />
    </View>
  );
}
const sb = StyleSheet.create({
  track: {
    position: 'absolute', bottom: 28, left: 47,
    width: W - 94, height: 12, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  fill: { height: '100%', borderRadius: 13, backgroundColor: ORANGE },
});

// ── Shared header button styles — matches BreathingExercise ───────────────────
const hb = StyleSheet.create({
  closeBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center', alignItems: 'center',
  },
  closeText: {
    color: WHITE, fontSize: 20, fontWeight: '500',
    includeFontPadding: false, textAlign: 'center', lineHeight: 20,
  },
});

// ── Phase 0: Intro ────────────────────────────────────────────────────────────
// Explains the purpose and lets the user skip without reading sentences.
function IntroPhase({ onBegin, onSkip, onExit, sessionFill }) {
  const largeText = useLargeText();
  const fs = (n) => largeText ? Math.round(n * 1.25) : n;
  return (
    <FadeIn>
      <LinearGradient
        colors={BG_GRADIENT} locations={BG_LOCATIONS}
        start={BG_START} end={BG_END}
        style={StyleSheet.absoluteFillObject}
      />
      <StatusBar barStyle="light-content" />

      <View style={ip.header}>
        <TouchableOpacity
          style={hb.closeBtn}
          onPress={onExit}
          accessibilityRole="button"
          accessibilityLabel="Exit exercise"
        >
          <Text style={hb.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={ip.content}>
        <Text style={ip.eyebrow}>SMART SPEECH</Text>
        <Text style={ip.title}>Create Your{'\n'}Voice Profile</Text>

        <View style={ip.card}>
          <View style={ip.cardRow}>
            <View style={ip.stepBadge}><Text style={ip.stepNum}>1</Text></View>
            <Text style={[ip.cardText, { fontSize: fs(16) }]}>Tap the mic and read the sentence aloud</Text>
          </View>
          <View style={ip.cardRow}>
            <View style={ip.stepBadge}><Text style={ip.stepNum}>2</Text></View>
            <Text style={[ip.cardText, { fontSize: fs(16) }]}>Tap stop when you finish</Text>
          </View>
          <View style={ip.cardRow}>
            <View style={ip.stepBadge}><Text style={ip.stepNum}>3</Text></View>
            <Text style={[ip.cardText, { fontSize: fs(16) }]}>Repeat for a second sentence — done</Text>
          </View>
        </View>
      </View>

      {/* Spacer pushes buttons toward the bottom */}
      <View style={{ flex: 1 }} />

      <View style={ip.btnArea}>
        <TouchableOpacity
          style={ip.primaryBtn}
          onPress={onBegin}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Begin voice recording"
        >
          <Text style={[ip.primaryText, { fontSize: fs(17) }]}>Let's go  →</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSkip}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Skip voice setup"
          hitSlop={{ top: 12, bottom: 12, left: 20, right: 20 }}
        >
          <Text style={[ip.skipLink, { fontSize: fs(15) }]}>Skip for now</Text>
        </TouchableOpacity>
      </View>

      <SessionBar fill={sessionFill} />
    </FadeIn>
  );
}

const ip = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 18,
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 28,
  },
  eyebrow: {
    color: MINT, fontSize: 14, fontWeight: '800',
    letterSpacing: 2, marginBottom: 10,
  },
  title: {
    color: WHITE, fontSize: 40, fontWeight: '800',
    letterSpacing: 0.5, lineHeight: 48, marginBottom: 24,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    padding: 20, gap: 16,
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  stepBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: ORANGE,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepNum: { color: '#1A1A1A', fontSize: 15, fontWeight: '800' },
  cardText: {
    flex: 1, color: 'rgba(255,255,255,0.85)',
    fontSize: 16, lineHeight: 22,
  },
  btnArea: {
    gap: 16,
    paddingHorizontal: 20,
    paddingBottom: 80, // sit above the session bar
    alignItems: 'center',
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: ORANGE, borderRadius: 28,
    paddingVertical: 18, alignItems: 'center',
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },
  primaryText: { color: '#1A1A1A', fontSize: 17, fontWeight: '800' },
  skipLink: {
    color: 'rgba(255,255,255,0.50)',
    fontSize: 15,
    textDecorationLine: 'underline',
    letterSpacing: 0.2,
  },
});

// ── Phase 1: Recording ────────────────────────────────────────────────────────
// Shows one sentence at a time with a mic button. Progress pill tracks position.
function RecordingPhase({ sentenceIndex, isRecording, onMicPress, onSkip, onExit, sessionFill }) {
  const largeText = useLargeText();
  const fs = (n) => largeText ? Math.round(n * 1.25) : n;
  return (
    <FadeIn>
      <LinearGradient
        colors={BG_GRADIENT} locations={BG_LOCATIONS}
        start={BG_START} end={BG_END}
        style={StyleSheet.absoluteFillObject}
      />
      <StatusBar barStyle="light-content" />

      <View style={rp.header}>
        <TouchableOpacity
          style={hb.closeBtn}
          onPress={onExit}
          accessibilityRole="button"
          accessibilityLabel="Exit exercise"
        >
          <Text style={hb.closeText}>✕</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {/* Progress indicator — "1 of 2" / "2 of 2" */}
        <View style={rp.progressPill}>
          <Text style={rp.progressText}>
            {sentenceIndex + 1} of {SENTENCES.length}
          </Text>
        </View>
      </View>

      {/* Sentence card — takes up the bulk of the screen */}
      <View style={rp.sentenceArea}>
        <Text style={rp.readLabel}>READ THIS ALOUD</Text>
        <View style={rp.sentenceCard}>
          <Text style={[rp.sentenceText, { fontSize: fs(20) }]}>"{SENTENCES[sentenceIndex]}"</Text>
        </View>
      </View>

      {/* Mic button and status label */}
      <View style={rp.micArea}>
        <TouchableOpacity
          style={[rp.micBtn, isRecording && rp.micBtnRecording]}
          onPress={onMicPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isRecording
            ? <StopIcon size={32} color="#1A1A1A" />
            : <MicIcon  size={32} color={WHITE} />
          }
        </TouchableOpacity>
        <Text style={[rp.micStatus, { fontSize: fs(16) }]} accessibilityLiveRegion="polite">
          {isRecording ? 'Recording…  tap to stop' : 'Tap to start recording'}
        </Text>
      </View>

      <TouchableOpacity
        style={rp.skipLink}
        onPress={onSkip}
        accessibilityRole="button"
        accessibilityLabel="Skip voice setup"
      >
        <Text style={[rp.skipLinkText, { fontSize: fs(15) }]}>Skip voice setup</Text>
      </TouchableOpacity>

      <SessionBar fill={sessionFill} />
    </FadeIn>
  );
}

const rp = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 18,
  },
  progressPill: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6,
  },
  progressText: { color: WHITE, fontSize: 15, fontWeight: '700' },
  sentenceArea: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 14,
  },
  readLabel: {
    color: MINT, fontSize: 13, fontWeight: '800',
    letterSpacing: 1.5, textAlign: 'center',
  },
  sentenceCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
    padding: 28,
    justifyContent: 'center',
  },
  sentenceText: {
    color: WHITE, fontSize: 20, lineHeight: 32,
    fontStyle: 'italic', textAlign: 'center', letterSpacing: 0.3,
  },
  micArea: {
    alignItems: 'center', gap: 14,
    paddingBottom: 16,
  },
  micBtn: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#2D6974',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30, shadowRadius: 8, elevation: 6,
  },
  micBtnRecording: { backgroundColor: ORANGE },
  micStatus: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 16, fontWeight: '600', letterSpacing: 0.4,
  },
  skipLink: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingBottom: 80, // above session bar
  },
  skipLinkText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 15,
    textDecorationLine: 'underline',
  },
});

// ── Phase 2: Processing ────────────────────────────────────────────────────────
// Shown while samples are uploaded to ElevenLabs. No user interaction — just wait.
function ProcessingPhase() {
  const largeText = useLargeText();
  const fs = (n) => largeText ? Math.round(n * 1.25) : n;
  return (
    <FadeIn>
      <LinearGradient
        colors={BG_GRADIENT} locations={BG_LOCATIONS}
        start={BG_START} end={BG_END}
        style={StyleSheet.absoluteFillObject}
      />
      <StatusBar barStyle="light-content" />
      <View style={pp.center}>
        <ActivityIndicator size="large" color={ORANGE} />
        <Text style={[pp.title, { fontSize: fs(24) }]}>Creating your voice profile</Text>
        <Text style={[pp.sub, { fontSize: fs(16) }]}>This may take up to 30 seconds…</Text>
      </View>
    </FadeIn>
  );
}

const pp = StyleSheet.create({
  center: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    gap: 20, paddingHorizontal: 40,
  },
  title: {
    color: WHITE, fontSize: 24, fontWeight: '700',
    textAlign: 'center', letterSpacing: 0.3,
  },
  sub: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 16, textAlign: 'center', letterSpacing: 0.2,
  },
});

// ── Root ──────────────────────────────────────────────────────────────────────
export default function VoiceSetupExercise({
  onComplete,
  onSkip,
  onExit,
  exerciseIndex = 5,
  totalExercises = 6,
}) {
  const [phase, setPhase]               = useState('intro');
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [isRecording, setIsRecording]   = useState(false);

  const recordingRef    = useRef(null);
  const recordedUrisRef = useRef([]); // accumulates URIs across both sentences

  const sessionFill = totalExercises > 0 ? exerciseIndex / totalExercises : 0;

  // Stop any active recording when the component unmounts (e.g. user presses exit).
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
    };
  }, []);

  async function startRecording() {
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
    } catch {
      // Mic unavailable — skip voice setup gracefully so the session still completes.
      onSkip();
    }
  }

  async function stopRecording() {
    if (!recordingRef.current) return;
    setIsRecording(false);

    await recordingRef.current.stopAndUnloadAsync();
    // Release the iOS audio session so other audio can resume after recording.
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
    const uri = recordingRef.current.getURI();
    recordingRef.current = null;

    if (uri) {
      recordedUrisRef.current.push(uri);
    }

    if (sentenceIndex < SENTENCES.length - 1) {
      // Brief pause before the next sentence to feel deliberate.
      setTimeout(() => setSentenceIndex(sentenceIndex + 1), 350);
    } else {
      // Both sentences captured — move to processing.
      await processRecordings();
    }
  }

  function handleMicPress() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  // Upload recordings to the voice clone API, then call onComplete.
  // Failure is logged and silently swallowed — the session always finishes.
  async function processRecordings() {
    setPhase('processing');
    const user = auth.currentUser;
    if (user && recordedUrisRef.current.length > 0) {
      try {
        const status = await getVoiceStatus().catch(() => ({ has_cloned_voice: false }));
        if (!status.has_cloned_voice) {
          // Firebase displayName is null for email/password users who didn't set one.
          // Fall back to the name stored in AsyncStorage during onboarding (SetupAboutYou).
          const profile = await getUserProfile().catch(() => null);
          const userName = profile?.name || user.displayName || 'User';
          await cloneVoice(recordedUrisRef.current, userName);
        }
      } catch (err) {
        // Non-fatal: default voice will be used if cloning fails.
        console.warn('[VoiceSetup] voice cloning failed (non-fatal):', err?.message);
      }
    }
    onComplete(100);
  }

  if (phase === 'intro') {
    return (
      <IntroPhase
        onBegin={() => setPhase('recording')}
        onSkip={onSkip}
        onExit={onExit}
        sessionFill={sessionFill}
      />
    );
  }

  if (phase === 'recording') {
    return (
      <RecordingPhase
        sentenceIndex={sentenceIndex}
        isRecording={isRecording}
        onMicPress={handleMicPress}
        onSkip={onSkip}
        onExit={onExit}
        sessionFill={sessionFill}
      />
    );
  }

  // Processing phase — no exit button, just wait for upload.
  return <ProcessingPhase />;
}
