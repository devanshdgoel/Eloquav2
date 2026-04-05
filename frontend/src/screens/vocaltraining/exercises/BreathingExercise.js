import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: W, height: H } = Dimensions.get('window');

// ── Steps within the breathing exercise ──────────────────────────────────────
const STEP_INTRO = 0; // "Breathing" title screen
const STEP_INFO  = 1; // "Diaphragmatic Breathing" explanation
const STEP_VIDEO = 2; // Instructional video placeholder
const STEP_DRILL = 3; // Animated breathing drill (3 cycles)

// ── Breathing drill timing (ms) ───────────────────────────────────────────────
const INHALE_MS  = 4000;
const HOLD_MS    = 2000;
const EXHALE_MS  = 4000;
const CYCLE_TOTAL_MS = INHALE_MS + HOLD_MS + EXHALE_MS + 300;

const TOTAL_CYCLES = 3;

// Maximum diameter of the bubble at full inhale
const BUBBLE_MAX = 200;

// ── Shared header component ───────────────────────────────────────────────────

function ExerciseHeader({ title, onExit }) {
  return (
    <View style={headerStyles.container}>
      <TouchableOpacity
        style={headerStyles.exitBtn}
        onPress={onExit}
        accessibilityRole="button"
        accessibilityLabel="Exit exercise"
      >
        <Text style={headerStyles.exitText}>X</Text>
      </TouchableOpacity>
      <Text style={headerStyles.title}>{title}</Text>
      <View style={headerStyles.spacer} />
    </View>
  );
}

const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#2D6974',
  },
  exitBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  spacer: { width: 38 },
});

// ── Step 0: Intro ─────────────────────────────────────────────────────────────

function IntroScreen({ onNext, onExit }) {
  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#2D6974', '#1C4047']} style={introStyles.header}>
        <ExerciseHeader title="Breathing" onExit={onExit} />
        <View style={introStyles.headerBody}>
          <Text style={introStyles.sessionLabel}>Exercise 1 of 7</Text>
          <Text style={introStyles.heroText}>Breathing</Text>
          <Text style={introStyles.heroPara}>
            Controlled breathing is the foundation of strong, clear speech. It
            steadies your voice, reduces tension, and prepares your breath
            support for the exercises ahead.
          </Text>
        </View>
      </LinearGradient>

      <View style={introStyles.body}>
        <View style={introStyles.tipCard}>
          <Text style={introStyles.tipTitle}>What to expect</Text>
          <Text style={introStyles.tipText}>
            3 gentle breathing cycles{'\n'}
            Approx. 30 seconds{'\n'}
            No equipment needed
          </Text>
        </View>
      </View>

      <View style={introStyles.footer}>
        <TouchableOpacity
          style={introStyles.startBtn}
          onPress={onNext}
          activeOpacity={0.85}
        >
          <Text style={introStyles.startBtnText}>Begin</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const introStyles = StyleSheet.create({
  header: { paddingBottom: 36 },
  headerBody: { paddingHorizontal: 28, paddingTop: 8 },
  sessionLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  heroText: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  heroPara: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0.2,
  },
  body: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 28,
    backgroundColor: '#F7FAF8',
  },
  tipCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    gap: 10,
  },
  tipTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C4047',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  tipText: {
    fontSize: 16,
    color: '#2D6974',
    lineHeight: 28,
    letterSpacing: 0.2,
  },
  footer: {
    backgroundColor: '#F7FAF8',
    paddingHorizontal: 28,
    paddingBottom: 32,
    paddingTop: 16,
  },
  startBtn: {
    backgroundColor: '#FFA940',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#FFA940',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  startBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

// ── Step 1: Info ──────────────────────────────────────────────────────────────

function InfoScreen({ onNext, onExit }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#F7FAF8' }}>
      <StatusBar barStyle="light-content" />
      <ExerciseHeader title="Diaphragmatic Breathing" onExit={onExit} />

      <View style={infoStyles.body}>
        <Text style={infoStyles.title}>Diaphragmatic{'\n'}Breathing</Text>
        <Text style={infoStyles.para}>
          Diaphragmatic breathing — also called belly breathing — uses the
          diaphragm fully rather than shallow chest muscles. For people with
          Parkinson's, this technique directly strengthens breath support,
          which is the single biggest driver of louder, clearer speech.
        </Text>

        <View style={infoStyles.divider} />

        <Text style={infoStyles.instructionTitle}>How to do it</Text>
        {[
          'Sit upright with your shoulders relaxed.',
          'Place one hand lightly on your belly.',
          'Breathe in slowly through your nose — your belly should rise.',
          'Breathe out through pursed lips — belly falls gently.',
          'Keep your chest as still as possible throughout.',
        ].map((step, i) => (
          <View key={i} style={infoStyles.step}>
            <View style={infoStyles.stepNum}>
              <Text style={infoStyles.stepNumText}>{i + 1}</Text>
            </View>
            <Text style={infoStyles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      <View style={infoStyles.footer}>
        <TouchableOpacity
          style={infoStyles.nextBtn}
          onPress={onNext}
          activeOpacity={0.85}
        >
          <Text style={infoStyles.nextBtnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1C4047',
    letterSpacing: 0.3,
    marginBottom: 16,
    lineHeight: 38,
  },
  para: {
    fontSize: 16,
    color: '#2D6974',
    lineHeight: 26,
    letterSpacing: 0.2,
    marginBottom: 20,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(44,105,116,0.15)',
    marginBottom: 20,
  },
  instructionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C4047',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
    gap: 14,
  },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#2D6974',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  stepNumText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  stepText: { fontSize: 15, color: '#1C4047', lineHeight: 22, flex: 1 },
  footer: {
    paddingHorizontal: 28,
    paddingBottom: 32,
    paddingTop: 16,
    backgroundColor: '#F7FAF8',
  },
  nextBtn: {
    backgroundColor: '#1C4047',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  nextBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});

// ── Step 2: Video placeholder ─────────────────────────────────────────────────

function VideoScreen({ onNext, onExit }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#F7FAF8' }}>
      <StatusBar barStyle="light-content" />
      <ExerciseHeader title="Watch First" onExit={onExit} />

      <View style={videoStyles.body}>
        <Text style={videoStyles.title}>See it in action</Text>
        <Text style={videoStyles.subtitle}>
          Watch this short demonstration before your first practice round.
        </Text>

        {/* Video placeholder — replace with a real <Video> component when asset is ready */}
        <View style={videoStyles.videoBox}>
          <View style={videoStyles.playCircle}>
            <Text style={videoStyles.playIcon}>▶</Text>
          </View>
          <Text style={videoStyles.videoCaption}>Video coming soon</Text>
        </View>
      </View>

      <View style={videoStyles.footer}>
        <TouchableOpacity
          style={videoStyles.nextBtn}
          onPress={onNext}
          activeOpacity={0.85}
        >
          <Text style={videoStyles.nextBtnText}>Start Exercise</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const videoStyles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1C4047',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#2D6974',
    lineHeight: 22,
    marginBottom: 28,
  },
  videoBox: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#1C4047',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  playCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: { color: '#FFFFFF', fontSize: 22, marginLeft: 4 },
  videoCaption: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  footer: {
    paddingHorizontal: 28,
    paddingBottom: 32,
    paddingTop: 16,
    backgroundColor: '#F7FAF8',
  },
  nextBtn: {
    backgroundColor: '#FFA940',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#FFA940',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  nextBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});

// ── Step 3: Breathing drill ───────────────────────────────────────────────────

// Phase labels shown to the user during each part of the cycle.
const PHASE_LABELS = {
  inhale: 'Breathe In',
  hold:   'Hold',
  exhale: 'Breathe Out',
  done:   'Well done',
};

function DrillScreen({ onComplete, onExit }) {
  const [phase, setPhase] = useState('inhale');
  const [currentCycle, setCurrentCycle] = useState(0);

  // Animated values for the bubble
  const scale         = useRef(new Animated.Value(0.25)).current;
  const floatY        = useRef(new Animated.Value(0)).current;
  const bubbleOpacity = useRef(new Animated.Value(0)).current;

  // Keeps references to scheduled timeouts so they can be cancelled on unmount.
  const timerRefs = useRef([]);

  useEffect(() => {
    runCycle(0);
    return () => timerRefs.current.forEach(clearTimeout);
  }, []);

  function schedule(fn, delay) {
    const id = setTimeout(fn, delay);
    timerRefs.current.push(id);
  }

  function runCycle(cycleIndex) {
    setCurrentCycle(cycleIndex);
    setPhase('inhale');

    // Reset bubble to starting state (small, invisible, centred).
    scale.setValue(0.25);
    floatY.setValue(0);
    bubbleOpacity.setValue(0);

    // Bubble fades in and expands during inhale.
    Animated.parallel([
      Animated.timing(bubbleOpacity, {
        toValue: 1, duration: 400, useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1, duration: INHALE_MS, useNativeDriver: true,
      }),
    ]).start();

    // Switch to Hold phase after inhale completes.
    schedule(() => setPhase('hold'), INHALE_MS);

    // Start exhale: bubble shrinks and floats upward.
    schedule(() => {
      setPhase('exhale');
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 0.25, duration: EXHALE_MS, useNativeDriver: true,
        }),
        Animated.timing(floatY, {
          toValue: -(H * 0.22), duration: EXHALE_MS, useNativeDriver: true,
        }),
        Animated.timing(bubbleOpacity, {
          toValue: 0, duration: EXHALE_MS - 400, useNativeDriver: true,
        }),
      ]).start();
    }, INHALE_MS + HOLD_MS);

    // After the full cycle, either start the next or finish.
    schedule(() => {
      if (cycleIndex < TOTAL_CYCLES - 1) {
        runCycle(cycleIndex + 1);
      } else {
        setPhase('done');
        schedule(onComplete, 1200);
      }
    }, CYCLE_TOTAL_MS);
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F7FAF8' }}>
      <StatusBar barStyle="light-content" />
      <ExerciseHeader title="Breathe" onExit={onExit} />

      {/* Instruction text */}
      <View style={drillStyles.instructionArea}>
        <Text style={drillStyles.instructionText}>
          {PHASE_LABELS[phase]}
        </Text>
      </View>

      {/* Animated bubble */}
      <View style={drillStyles.bubbleArea}>
        <Animated.View
          style={[
            drillStyles.bubbleWrap,
            {
              opacity: bubbleOpacity,
              transform: [{ scale }, { translateY: floatY }],
            },
          ]}
        >
          {/* Three concentric rings give the bubble depth and softness */}
          <View style={drillStyles.ringOuter} />
          <View style={drillStyles.ringMid} />
          <View style={drillStyles.ringInner} />
        </Animated.View>
      </View>

      {/* Cycle progress bars — one bar per breathing cycle */}
      <View style={drillStyles.cycleRow}>
        {Array.from({ length: TOTAL_CYCLES }, (_, i) => (
          <View
            key={i}
            style={[
              drillStyles.cycleBar,
              i < currentCycle                               && drillStyles.cycleBarDone,
              i === currentCycle && phase !== 'done'         && drillStyles.cycleBarActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const RING_OUTER = BUBBLE_MAX;
const RING_MID   = Math.round(BUBBLE_MAX * 0.78);
const RING_INNER = Math.round(BUBBLE_MAX * 0.55);

const drillStyles = StyleSheet.create({
  instructionArea: {
    paddingTop: 36,
    alignItems: 'center',
  },
  instructionText: {
    fontSize: 36,
    fontWeight: '800',
    color: '#1C4047',
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  bubbleArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleWrap: {
    width: RING_OUTER,
    height: RING_OUTER,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringOuter: {
    position: 'absolute',
    width: RING_OUTER,
    height: RING_OUTER,
    borderRadius: RING_OUTER / 2,
    backgroundColor: 'rgba(104,179,159,0.18)',
  },
  ringMid: {
    position: 'absolute',
    width: RING_MID,
    height: RING_MID,
    borderRadius: RING_MID / 2,
    backgroundColor: 'rgba(104,179,159,0.35)',
  },
  ringInner: {
    position: 'absolute',
    width: RING_INNER,
    height: RING_INNER,
    borderRadius: RING_INNER / 2,
    backgroundColor: '#2D6974',
    opacity: 0.85,
  },

  cycleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 36,
  },
  cycleBar: {
    width: 60,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(44,105,116,0.2)',
  },
  cycleBarActive: {
    backgroundColor: '#FFA940',
  },
  cycleBarDone: {
    backgroundColor: '#2D6974',
  },
});

// ── Main BreathingExercise export ─────────────────────────────────────────────

export default function BreathingExercise({ onComplete, onExit }) {
  const [step, setStep] = useState(STEP_INTRO);

  if (step === STEP_INTRO) {
    return <IntroScreen onNext={() => setStep(STEP_INFO)} onExit={onExit} />;
  }
  if (step === STEP_INFO) {
    return <InfoScreen onNext={() => setStep(STEP_VIDEO)} onExit={onExit} />;
  }
  if (step === STEP_VIDEO) {
    return <VideoScreen onNext={() => setStep(STEP_DRILL)} onExit={onExit} />;
  }
  return <DrillScreen onComplete={onComplete} onExit={onExit} />;
}
