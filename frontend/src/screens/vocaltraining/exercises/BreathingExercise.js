import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Dimensions,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Polygon } from 'react-native-svg';
import CantDoNow from '../../../components/CantDoNow';
import ScreenHeader from '../../../components/ScreenHeader';
import SpeakerButton from '../../../components/SpeakerButton';

const { width: W, height: H } = Dimensions.get('window');

// ── Steps ─────────────────────────────────────────────────────────────────────
const STEP_TITLE    = 0;
const STEP_VIDEO    = 1;
const STEP_DRILL    = 2;
const STEP_BASELINE = 3; // baseline-only intro — replaces title + instructions

// AsyncStorage key — once written, the intro is skipped on all future sessions.
const DEMO_KEY = '@eloqua_breathing_demo_seen';

// ── Timing ────────────────────────────────────────────────────────────────────
const INHALE_S  = 4;
const HOLD_S    = 2;
const EXHALE_S  = 4;
const INHALE_MS = INHALE_S * 1000;
const HOLD_MS   = HOLD_S   * 1000;
const EXHALE_MS = EXHALE_S * 1000;
const TOTAL_CYCLES = 3;

// ── Bubble geometry ───────────────────────────────────────────────────────────
const BUBBLE_BASE = 280;
const SCALE_SMALL = 0.30;
const SCALE_LARGE = 1.0;

// ── Shared gradient ───────────────────────────────────────────────────────────
const BG_GRADIENT  = ['#37767A', '#1C4047', '#0A1618'];
const BG_LOCATIONS = [0.2, 0.44, 1.0];
const BG_START     = { x: 1, y: 0.1 };
const BG_END       = { x: 0, y: 0.9 };

// ── Fade-in wrapper — each screen fades in on mount ───────────────────────────
function FadeIn({ children }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={{ flex: 1, opacity }}>
      {children}
    </Animated.View>
  );
}

// ── Session progress bar (TitleScreen only) ───────────────────────────────────
function SessionBar({ fill = 0.14 }) {
  return (
    <View style={sb.track}>
      <View style={[sb.fill, { width: `${fill * 100}%` }]} />
    </View>
  );
}
const sb = StyleSheet.create({
  track: {
    position: 'absolute', bottom: 28, left: 47,
    width: W - 94, height: 12, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  fill: { height: '100%', borderRadius: 13, backgroundColor: '#FFA940' },
});

// ── Cycle progress pills ──────────────────────────────────────────────────────
function CyclePills({ current, done, total = TOTAL_CYCLES }) {
  return (
    <View style={cp.row}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            cp.pill,
            i < done                    && cp.pillDone,
            i === current && i >= done  && cp.pillActive,
          ]}
        />
      ))}
    </View>
  );
}
const cp = StyleSheet.create({
  row:        { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  pill:       { width: 96, height: 10, borderRadius: 43, backgroundColor: 'rgba(255,255,255,0.22)' },
  pillActive: { backgroundColor: '#2D9BA2' },
  pillDone:   { backgroundColor: '#1A6068' },
});

// ── Shared header button styles — larger for accessibility ────────────────────
const hb = StyleSheet.create({
  closeBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center', alignItems: 'center',
  },
  closeText: { color: '#FFFFFF', fontSize: 20, fontWeight: '500', includeFontPadding: false, textAlign: 'center', lineHeight: 20 },
  helpBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#FFA940',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#FFA940', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },
  helpText: { color: '#1A1A1A', fontSize: 24, fontWeight: '900', includeFontPadding: false, textAlign: 'center', lineHeight: 24 },
});

// ── Screen 0: Title ───────────────────────────────────────────────────────────
function TitleScreen({ onNext, onExit, sessionFill = 0.14 }) {
  const MOTIVATIONAL_TEXT = 'Breathing. Your voice starts with your breath.';
  return (
    <FadeIn>
      <View style={{ flex: 1, backgroundColor: '#1C4047' }}>
        <StatusBar barStyle="light-content" />

        {/* Header now rendered by shared ScreenHeader component.
            onBack uses the exercise's own exit handler (✕ to leave the session). */}
        <ScreenHeader
          navigation={null}
          title="Breathing"
          backIcon="✕"
          backLabel="Exit exercise"
          onBack={onExit}
          rightAction={<SpeakerButton text={MOTIVATIONAL_TEXT} />}
        />

        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <Text style={ts.title} numberOfLines={1} adjustsFontSizeToFit>Breathing</Text>
          <Text style={ts.motivational}>Your voice starts with your breath.</Text>
          <View style={ts.bubbleWrap}>
            <Image
              source={require('../../../../assets/images/bubble2.png')}
              style={{ width: 200, height: 200 }}
              resizeMode="contain"
              accessible={false}
            />
          </View>
        </View>

        {/* Arrow button — must sit above the progress bar (bottom: 28 + 12h + 16 gap = 56) */}
        <TouchableOpacity style={ts.arrowBtn} onPress={onNext} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Continue">
          <Text style={ts.arrowText}>→</Text>
        </TouchableOpacity>

        <SessionBar fill={sessionFill} />
      </View>
    </FadeIn>
  );
}

const ts = StyleSheet.create({
  // Header now rendered by shared ScreenHeader component
  title: {
    color: '#FFFFFF', fontSize: 56, fontWeight: '800',
    letterSpacing: 1.5, textAlign: 'center', marginBottom: 12,
  },
  motivational: {
    color: '#C3DECE', fontSize: 17, fontWeight: '400',
    letterSpacing: 0.4, textAlign: 'center', opacity: 0.85,
    marginBottom: 32,
  },
  bubbleWrap: { alignItems: 'center' },
  arrowBtn: {
    alignSelf: 'center', marginBottom: 60,
    width: 80, height: 64, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center', alignItems: 'center',
  },
  arrowText: { color: '#FFFFFF', fontSize: 26, fontWeight: '300' },
});

const INSTRUCTIONS = [
  { step: '1', text: 'Sit upright with one hand on your chest and one on your abdomen.' },
  { step: '2', text: 'Breathe in slowly through your nose for 4 counts. Feel your abdomen rise.' },
  { step: '3', text: 'Hold gently for 2 counts.' },
  { step: '4', text: 'Breathe out through your mouth for 4 counts. Let your abdomen fall.' },
];

// The instruction text concatenated for SpeakerButton so users can hear
// all four steps read aloud before attempting the breathing exercise.
const BREATHING_INSTRUCTIONS_TEXT = INSTRUCTIONS.map(
  (instr) => `Step ${instr.step}: ${instr.text}`
).join('. ');

// ── Screen 1: Instructions ────────────────────────────────────────────────────
function VideoScreen({ onNext, onExit }) {
  return (
    <FadeIn>
      <LinearGradient
        colors={['#1C3242', '#0D1E2B']}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <StatusBar barStyle="light-content" />

      {/* Header now rendered by shared ScreenHeader component.
          onBack goes back to the title screen (not the full exit). */}
      <ScreenHeader
        navigation={null}
        title="Breathing"
        onBack={onExit}
        rightAction={<SpeakerButton text={BREATHING_INSTRUCTIONS_TEXT} />}
      />

      <Text style={vs.heading}>Diaphragmatic{'\n'}Breathing Technique</Text>

      <View style={vs.cardBox}>
        {INSTRUCTIONS.map(({ step, text }) => (
          <View key={step} style={vs.instrRow}>
            <View style={vs.stepBadge}>
              <Text style={vs.stepNum}>{step}</Text>
            </View>
            <Text style={vs.instrText}>{text}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={vs.startBtn} onPress={onNext} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Begin exercise">
        <Text style={vs.startText}>Begin Exercise  →</Text>
      </TouchableOpacity>
    </FadeIn>
  );
}

const vs = StyleSheet.create({
  // Header now rendered by shared ScreenHeader component
  pill: {
    flex: 1, backgroundColor: '#FFA940', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 6, alignItems: 'center',
  },
  pillText: { color: '#1A1A1A', fontSize: 16, fontWeight: '800', letterSpacing: 0.8 },
  heading: {
    color: 'rgba(255,255,255,0.90)', fontSize: 20, fontWeight: '700',
    textAlign: 'center', letterSpacing: 0.4, lineHeight: 28,
    marginTop: 18, marginBottom: 24, paddingHorizontal: 24,
  },
  cardBox: {
    marginHorizontal: 24, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    padding: 20, gap: 18,
  },
  instrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  stepBadge: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#FFA940',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepNum: { color: '#1A1A1A', fontSize: 16, fontWeight: '800' },
  instrText: {
    flex: 1, color: 'rgba(255,255,255,0.85)',
    fontSize: 16, lineHeight: 23, fontWeight: '400',
  },
  startBtn: {
    alignSelf: 'center', marginTop: 32,
    backgroundColor: '#FFA940', borderRadius: 28,
    paddingHorizontal: 40, paddingVertical: 20,
    shadowColor: '#FFA940', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },
  startText: { color: '#1A1A1A', fontSize: 18, fontWeight: '700', letterSpacing: 0.4 },
});

// ── Screen 3: Baseline intro ──────────────────────────────────────────────────
// Shown instead of the regular Title + Instructions screens during the baseline
// session. Single card: a short "let's get started" prompt before one breath cycle.

// Text for the baseline intro screen SpeakerButton — the "settle in" prompt
// before the first breathing cycle of the baseline assessment.
const BASELINE_INTRO_TEXT =
  "Before we start, settle in and take one slow, deep breath. " +
  "Breathe in through your nose, and out through your mouth.";

function BaselineIntroScreen({ onNext, onExit }) {
  return (
    <FadeIn>
      <LinearGradient
        colors={BG_GRADIENT} locations={BG_LOCATIONS}
        start={BG_START} end={BG_END}
        style={StyleSheet.absoluteFillObject}
      />
      <StatusBar barStyle="light-content" />

      {/* Header now rendered by shared ScreenHeader component.
          backIcon is ✕ because this exits the baseline session entirely. */}
      <ScreenHeader
        navigation={null}
        title="Breathing"
        backIcon="✕"
        backLabel="Exit exercise"
        onBack={onExit}
        rightAction={<SpeakerButton text={BASELINE_INTRO_TEXT} />}
      />

      <View style={bi.body}>
        <Text style={bi.title}>Let's begin.</Text>
        <Text style={bi.sub}>
          {"Before we start — settle in and take one slow, deep breath.\n\nBreathe in through your nose… and out through your mouth."}
        </Text>
        <Image
          source={require('../../../../assets/images/bubble2.png')}
          style={{ width: 140, height: 140, marginTop: 24 }}
          resizeMode="contain"
          accessible={false}
        />
      </View>

      <TouchableOpacity
        style={bi.btn}
        onPress={onNext}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="I'm ready"
      >
        <Text style={bi.btnText}>I'm ready  →</Text>
      </TouchableOpacity>
    </FadeIn>
  );
}

const bi = StyleSheet.create({
  // Header now rendered by shared ScreenHeader component
  body: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 36,
  },
  title: {
    color: '#FFFFFF', fontSize: 52, fontWeight: '800',
    letterSpacing: 1.5, textAlign: 'center', marginBottom: 20,
  },
  sub: {
    color: '#C3DECE', fontSize: 18, fontWeight: '400',
    textAlign: 'center', lineHeight: 28, opacity: 0.90,
  },
  btn: {
    alignSelf: 'center', marginBottom: 60,
    backgroundColor: '#FFA940', borderRadius: 28,
    paddingHorizontal: 40, paddingVertical: 20,
    shadowColor: '#FFA940', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },
  btnText: { color: '#1A1A1A', fontSize: 18, fontWeight: '700', letterSpacing: 0.4 },
});

// ── Screen 2: Drill ───────────────────────────────────────────────────────────
//
// Auto-starts on mount. Phase label crossfades so text changes are seamless.
// Bubble expands on inhale, holds at full size, then contracts on exhale —
// no "flying away". No timer shown.

// maxCycles defaults to TOTAL_CYCLES (3). Baseline passes 1 to keep it short.
function DrillScreen({ onComplete, onExit, onShowVideo, onSkip, maxCycles = TOTAL_CYCLES }) {
  const { top: safeTop } = useSafeAreaInsets();
  const [cycleIndex, setCycleIndex] = useState(0);
  const [doneCount,  setDoneCount]  = useState(0);
  // showHelpOverlay: true when ? is pressed — exercise paused, overlay shown
  const [showHelpOverlay, setShowHelpOverlay] = useState(false);

  const bubbleScale  = useRef(new Animated.Value(SCALE_SMALL)).current;
  const labelOpacity = useRef(new Animated.Value(0)).current;
  const [label, setLabel] = useState('');

  const taskRefs = useRef([]);

  function schedule(fn, delay) {
    const id = setTimeout(fn, delay);
    taskRefs.current.push(id);
    return id;
  }

  // Cross-fade the phase label: fade out → swap text → fade in
  function crossfade(newLabel) {
    Animated.timing(labelOpacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => {
      setLabel(newLabel);
      Animated.timing(labelOpacity, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    });
  }

  function runCycle(index) {
    setCycleIndex(index);

    // INHALE — bubble expands
    crossfade('Breathe in');
    bubbleScale.setValue(SCALE_SMALL);
    Animated.timing(bubbleScale, {
      toValue: SCALE_LARGE, duration: INHALE_MS, useNativeDriver: true,
    }).start();

    // HOLD — bubble stays large
    schedule(() => crossfade('Hold'), INHALE_MS);

    // EXHALE — bubble contracts (does not fly away)
    schedule(() => {
      crossfade('Breathe out');
      Animated.timing(bubbleScale, {
        toValue: SCALE_SMALL, duration: EXHALE_MS, useNativeDriver: true,
      }).start();
    }, INHALE_MS + HOLD_MS);

    // END OF CYCLE
    schedule(() => {
      setDoneCount(index + 1);
      if (index < maxCycles - 1) {
        runCycle(index + 1);
      } else {
        crossfade('Well done');
        schedule(onComplete, 1500);
      }
    }, INHALE_MS + HOLD_MS + EXHALE_MS + 350);
  }

  // Pause the breathing drill and show inline instructions.
  // Clears all pending breath timers so the bubble stops mid-cycle.
  function showHelp() {
    taskRefs.current.forEach(clearTimeout);
    taskRefs.current = [];
    bubbleScale.stopAnimation();
    Animated.timing(labelOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    setShowHelpOverlay(true);
  }

  // Dismiss overlay and restart from the current cycle index.
  function closeHelp() {
    setShowHelpOverlay(false);
    runCycle(cycleIndex);
  }

  useEffect(() => {
    const t = setTimeout(() => runCycle(0), 500);
    return () => {
      clearTimeout(t);
      taskRefs.current.forEach(clearTimeout);
    };
  }, []);

  return (
    <FadeIn>
      <LinearGradient
        colors={BG_GRADIENT} locations={BG_LOCATIONS}
        start={BG_START} end={BG_END}
        style={StyleSheet.absoluteFillObject}
      />
      <StatusBar barStyle="light-content" />

      {/* Header: close (X) and help (?) */}
      <View style={[ds.header, { paddingTop: safeTop + 14 }]}>
        <TouchableOpacity style={hb.closeBtn} onPress={onExit} accessibilityRole="button" accessibilityLabel="Exit exercise">
          <Text style={hb.closeText}>✕</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={hb.helpBtn} onPress={showHelp} accessibilityRole="button" accessibilityLabel="Show instructions">
          <Text style={hb.helpText}>?</Text>
        </TouchableOpacity>
      </View>

      {/* Phase label — above bubble, crossfades so text never snaps */}
      <Animated.Text
        style={[ds.phaseLabel, { opacity: labelOpacity }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Animated.Text>

      {/* Animated bubble — glow ring expands on inhale for clear visual feedback */}
      <View style={ds.bubbleArea}>
        <View style={{ width: BUBBLE_BASE * 1.5, height: BUBBLE_BASE * 1.5, alignItems: 'center', justifyContent: 'center' }}>
          {/* Glow ring: faint when small, prominent when fully expanded */}
          <Animated.View style={{
            position: 'absolute',
            width: BUBBLE_BASE * 1.5, height: BUBBLE_BASE * 1.5,
            borderRadius: BUBBLE_BASE * 0.75,
            backgroundColor: 'rgba(80,190,200,0.45)',
            opacity: bubbleScale.interpolate({ inputRange: [SCALE_SMALL, SCALE_LARGE], outputRange: [0.0, 0.28] }),
            transform: [{ scale: bubbleScale }],
          }} />
          <Animated.View style={{ transform: [{ scale: bubbleScale }] }}>
            <Image
              source={require('../../../../assets/images/bubble2.png')}
              style={{ width: BUBBLE_BASE, height: BUBBLE_BASE }}
              resizeMode="contain"
              accessible={false}
            />
          </Animated.View>
        </View>
      </View>

      {/* Can't do now — above the cycle progress pills */}
      <View style={ds.bottom}>
        <CantDoNow onSkip={onSkip} onEnd={onExit} style={{ marginBottom: 20 }} />
        <CyclePills current={cycleIndex} done={doneCount} total={maxCycles} />
      </View>

      {/* Help overlay — shown when ? is pressed; cycleIndex is preserved */}
      {showHelpOverlay && (
        <View style={brHelp.overlay}>
          <View style={[brHelp.header, { paddingTop: safeTop + 14 }]}>
            <TouchableOpacity style={brHelp.closeBtn} onPress={closeHelp} accessibilityRole="button" accessibilityLabel="Close instructions">
              <Text style={brHelp.closeText}>✕</Text>
            </TouchableOpacity>
            <Text style={brHelp.headerTitle}>Instructions</Text>
            <View style={{ width: 56 }} />
          </View>
          <Text style={brHelp.exTitle} numberOfLines={1} adjustsFontSizeToFit>Breathing</Text>
          <View style={brHelp.card}>
            {INSTRUCTIONS.map(({ step, text }) => (
              <View key={step} style={brHelp.row}>
                <View style={brHelp.badge}><Text style={brHelp.badgeNum}>{step}</Text></View>
                <Text style={brHelp.stepText}>{text}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={brHelp.continueBtn} onPress={closeHelp} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Continue exercise">
            <Text style={brHelp.continueText}>Continue Exercise  →</Text>
          </TouchableOpacity>
        </View>
      )}
    </FadeIn>
  );
}

const ds = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18,
  },
  phaseLabel: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    marginTop: 52,
    marginBottom: 0,
    paddingHorizontal: 24,
  },
  bubbleArea: {
    flex: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  bottom: {
    alignItems: 'center',
    paddingBottom: 44,
  },
});

// Help overlay styles
const brHelp = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1C4047',
    zIndex: 200,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, marginBottom: 0,
  },
  closeBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center', alignItems: 'center',
  },
  closeText: { color: '#FFFFFF', fontSize: 22, fontWeight: '600', includeFontPadding: false, textAlign: 'center', lineHeight: 22 },
  headerTitle: {
    flex: 1, color: '#FFFFFF', fontSize: 17, fontWeight: '600',
    textAlign: 'center', letterSpacing: 0.3, opacity: 0.75,
  },
  exTitle: {
    color: '#FFFFFF', fontSize: 44, fontWeight: '800',
    letterSpacing: 1.0, textAlign: 'center',
    marginTop: 8, marginBottom: 28, paddingHorizontal: 24,
  },
  card: {
    marginHorizontal: 24, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    padding: 20, gap: 18,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  badge: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFA940',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  badgeNum: { color: '#1A1A1A', fontSize: 16, fontWeight: '800' },
  stepText: {
    flex: 1, color: 'rgba(255,255,255,0.85)',
    fontSize: 17, lineHeight: 24, fontWeight: '400',
  },
  continueBtn: {
    alignSelf: 'center', marginTop: 32,
    backgroundColor: '#FFA940', borderRadius: 28,
    paddingHorizontal: 40, paddingVertical: 20,
    shadowColor: '#FFA940', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },
  continueText: { color: '#1A1A1A', fontSize: 18, fontWeight: '700', letterSpacing: 0.4 },
});

// ── Root ──────────────────────────────────────────────────────────────────────

// baseline=true: skip AsyncStorage check, show the "Let's begin" screen,
// run only 1 breath cycle, and skip the detailed instructions screen.
// All other sessions: existing behavior (AsyncStorage-gated intro, 3 cycles).
export default function BreathingExercise({
  onComplete,
  onExit,
  onSkip,
  exerciseIndex  = 0,
  totalExercises = 8,
  baseline       = false,
}) {
  // Baseline starts immediately at the simplified intro screen — no AsyncStorage needed.
  // Regular sessions: null while the AsyncStorage check is in flight.
  const [step, setStep] = useState(baseline ? STEP_BASELINE : null);
  const sessionFill = totalExercises > 0 ? exerciseIndex / totalExercises : 0;

  useEffect(() => {
    // Skip AsyncStorage check entirely for the baseline session.
    if (baseline) return;
    AsyncStorage.getItem(DEMO_KEY)
      .then(val => setStep(val ? STEP_DRILL : STEP_TITLE))
      .catch(() => setStep(STEP_TITLE));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (step === null) return null;

  // ── Baseline intro: one simple card, then straight to 1 breath cycle ─────────
  if (step === STEP_BASELINE) {
    return (
      <BaselineIntroScreen
        onNext={() => setStep(STEP_DRILL)}
        onExit={onExit}
      />
    );
  }

  // ── Regular session: title → instructions → drill ─────────────────────────────
  if (step === STEP_TITLE) {
    return (
      <TitleScreen
        onNext={() => setStep(STEP_VIDEO)}
        onExit={onExit}
        sessionFill={sessionFill}
      />
    );
  }
  if (step === STEP_VIDEO) {
    return (
      <VideoScreen
        onNext={() => {
          // Mark the intro as seen so future sessions skip straight to the drill.
          AsyncStorage.setItem(DEMO_KEY, '1').catch(() => {});
          setStep(STEP_DRILL);
        }}
        onExit={() => setStep(STEP_TITLE)}
      />
    );
  }
  return (
    <DrillScreen
      onComplete={onComplete}
      onExit={onExit}
      onShowVideo={() => setStep(STEP_VIDEO)}
      onSkip={onSkip ?? onComplete}
      maxCycles={baseline ? 1 : TOTAL_CYCLES}
    />
  );
}
