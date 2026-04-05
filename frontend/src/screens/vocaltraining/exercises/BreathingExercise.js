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

// ── Steps ─────────────────────────────────────────────────────────────────────
const STEP_TITLE = 0; // "Breathing" intro card — solid dark bg
const STEP_INFO  = 1; // "Diaphragmatic Breathing" — gradient, large sphere
const STEP_VIDEO = 2; // Video tutorial — gradient + overlay
const STEP_DRILL = 3; // Animated breathing drill — gradient, cycling bubble

// ── Timing (ms) ───────────────────────────────────────────────────────────────
const INHALE_S   = 4;
const HOLD_S     = 2;
const EXHALE_S   = 4;
const INHALE_MS  = INHALE_S * 1000;
const HOLD_MS    = HOLD_S   * 1000;
const EXHALE_MS  = EXHALE_S * 1000;

const TOTAL_CYCLES = 3;

// ── Bubble geometry ───────────────────────────────────────────────────────────
// The bubble is a fixed 244×244 container; scale transform drives the size.
// Small state (pre-start): 58 / 244 ≈ 0.24
// Large state (inhale complete / exhale): scale 1.0
const BUBBLE_BASE = 244;
const SCALE_SMALL = 58 / BUBBLE_BASE;  // ≈ 0.24
const SCALE_LARGE = 1.0;

// Exhale: bubble rises from its resting centre to above the top of the screen.
// BUBBLE_RISE is the translateY needed to push the 244px sphere fully off-screen.
const BUBBLE_RISE = -(H * 0.55 + BUBBLE_BASE / 2);

// ── Shared gradient (all screens except title) ────────────────────────────────
// Approximates the Figma 264° gradient: teal-green top-right → near-black bottom-left.
const BG_GRADIENT  = ['#2D858B', '#37767A', '#0A1618'];
const BG_LOCATIONS = [0.2, 0.44, 1.0];
const BG_START     = { x: 1, y: 0.1 };
const BG_END       = { x: 0, y: 0.9 };

// ── Reusable header elements ──────────────────────────────────────────────────

function CloseButton({ onPress }) {
  return (
    <TouchableOpacity style={h.closeBtn} onPress={onPress} accessibilityLabel="Exit exercise">
      <Text style={h.closeText}>✕</Text>
    </TouchableOpacity>
  );
}

function HelpButton() {
  return (
    <View style={h.helpCircle}>
      <Text style={h.helpText}>?</Text>
    </View>
  );
}

const h = StyleSheet.create({
  closeBtn: {
    width: 53, height: 53, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  closeText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  helpCircle: {
    width: 39, height: 39, borderRadius: 20,
    backgroundColor: '#FFA940',
    justifyContent: 'center', alignItems: 'center',
  },
  helpText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
});

// ── Dark glassy sphere component ──────────────────────────────────────────────
// Three layered circles recreate the dark glassy bubble from Figma:
//   outer circle  — dark near-black teal with a teal glow shadow
//   inner shadow  — mid-grey highlight floating upper-left
//   specular dot  — small white dot, top-right (light reflection point)

function GlassSphere({ size = BUBBLE_BASE }) {
  const r = size / 2;
  const innerSize  = size * 0.37;
  const innerR     = innerSize / 2;
  const specSize   = size * 0.115;
  const specR      = specSize / 2;
  return (
    <View style={[gs.sphere, { width: size, height: size, borderRadius: r,
      shadowRadius: size * 0.13 }]}>
      {/* Upper-left glass reflection */}
      <View style={[gs.inner, {
        width: innerSize, height: innerSize, borderRadius: innerR,
        top: size * 0.15, left: size * 0.22,
      }]} />
      {/* Specular highlight dot — top right */}
      <View style={[gs.spec, {
        width: specSize, height: specSize, borderRadius: specR,
        top: size * 0.08, right: size * 0.21,
      }]} />
    </View>
  );
}

const gs = StyleSheet.create({
  sphere: {
    backgroundColor: '#0D2028',
    shadowColor: '#2D858B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    elevation: 12,
    overflow: 'visible',
  },
  inner: {
    position: 'absolute',
    backgroundColor: 'rgba(80,150,160,0.28)',
  },
  spec: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
});

// ── Progress bar (session-level, shown on title card) ─────────────────────────

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
    width: 314, height: 12, borderRadius: 13,
    backgroundColor: '#D9D9D9',
  },
  fill: {
    height: '100%', borderRadius: 13,
    backgroundColor: '#FE9C2D',
  },
});

// ── Cycle progress pills (3 pills, one per breathing cycle) ───────────────────

function CyclePills({ currentCycle, phase }) {
  return (
    <View style={cp.row}>
      {[0, 1, 2].map(i => {
        const isActive = i === currentCycle && phase !== 'idle';
        const isDone   = i < currentCycle;
        return (
          <View
            key={i}
            style={[
              cp.pill,
              isDone   && cp.pillDone,
              isActive && cp.pillActive,
            ]}
          />
        );
      })}
    </View>
  );
}

const cp = StyleSheet.create({
  row: {
    flexDirection: 'row', gap: 6,
    justifyContent: 'center',
    position: 'absolute', bottom: 28,
  },
  pill: {
    width: 100, height: 12, borderRadius: 43,
    backgroundColor: '#D9D9D9',
  },
  pillActive: { backgroundColor: '#2D868B' },
  pillDone:   { backgroundColor: '#1A5A62' },
});

// ── Screen 0: Title card ──────────────────────────────────────────────────────

function TitleScreen({ onNext, onExit }) {
  return (
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#1C4047' }]}>
      <StatusBar barStyle="light-content" />

      {/* Header row */}
      <View style={ts.header}>
        <CloseButton onPress={onExit} />
      </View>

      {/* "Breathing" title */}
      <Text style={ts.title}>Breathing</Text>

      {/* Resting sphere + timer */}
      <View style={ts.sphereArea}>
        <GlassSphere size={173} />
        <Text style={ts.timer}>0:00</Text>
      </View>

      {/* → proceed button */}
      <TouchableOpacity style={ts.arrowBtn} onPress={onNext} activeOpacity={0.85}>
        <Text style={ts.arrowText}>→</Text>
      </TouchableOpacity>

      {/* Session progress bar */}
      <SessionBar fill={0.14} />
    </View>
  );
}

const ts = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 21, paddingHorizontal: 14,
  },
  title: {
    color: '#FFFFFF', fontSize: 64, fontWeight: '800',
    letterSpacing: 3.2, textAlign: 'center',
    marginTop: 60,
  },
  sphereArea: {
    alignItems: 'center', marginTop: 56,
  },
  timer: {
    color: '#FFFFFF', fontSize: 24, fontWeight: '700',
    letterSpacing: 1.2, marginTop: 14,
  },
  arrowBtn: {
    alignSelf: 'center', marginTop: 48,
    backgroundColor: '#37767A', borderRadius: 14,
    width: 76, height: 64,
    justifyContent: 'center', alignItems: 'center',
  },
  arrowText: { color: '#FFFFFF', fontSize: 28, fontWeight: '700' },
});

// ── Screen 1: Diaphragmatic Breathing info ────────────────────────────────────

function InfoScreen({ onNext, onExit }) {
  return (
    <LinearGradient colors={BG_GRADIENT} locations={BG_LOCATIONS}
      start={BG_START} end={BG_END} style={StyleSheet.absoluteFillObject}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={is.header}>
        <TouchableOpacity style={is.backBtn} onPress={onExit}>
          <Text style={is.backText}>←  Back</Text>
        </TouchableOpacity>
        <HelpButton />
      </View>

      {/* Large sphere with title overlaid */}
      <View style={is.sphereWrap}>
        <GlassSphere size={319} />
        <View style={is.sphereLabel}>
          <Text style={is.sphereTitle}>Diaphragmatic{'\n'}Breathing{'\n'}Technique</Text>
        </View>
      </View>

      {/* Small satellite bubbles */}
      <GlassSphere size={88} />
      <View style={is.satelliteSmall}>
        <GlassSphere size={51} />
      </View>

      {/* Timer */}
      <Text style={is.timer}>0:10</Text>

      {/* Start button */}
      <TouchableOpacity style={is.startBtn} onPress={onNext} activeOpacity={0.85}>
        <Text style={is.startBtnText}>Start  ▶</Text>
      </TouchableOpacity>

      {/* Progress bar — teal fill */}
      <View style={is.barTrack}>
        <View style={[is.barFill, { width: 128 }]} />
      </View>
    </LinearGradient>
  );
}

const is = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 48, paddingHorizontal: 32, paddingBottom: 12,
  },
  backBtn: {
    backgroundColor: '#37767A', borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  backText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  sphereWrap: {
    alignSelf: 'center', marginTop: 12,
    width: 319, height: 319, justifyContent: 'center', alignItems: 'center',
  },
  sphereLabel: {
    position: 'absolute',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 16,
  },
  sphereTitle: {
    color: '#FFFFFF', fontSize: 36, fontWeight: '800',
    letterSpacing: 1.8, textAlign: 'center', lineHeight: 44,
  },
  satelliteSmall: {
    position: 'absolute', top: 70, right: 32,
  },
  timer: {
    color: '#FFFFFF', fontSize: 24, fontWeight: '700',
    letterSpacing: 1.2, textAlign: 'center', marginTop: 8,
  },
  startBtn: {
    alignSelf: 'center', marginTop: 18,
    backgroundColor: 'rgba(254,156,45,0.9)',
    borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10,
  },
  startBtnText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  barTrack: {
    position: 'absolute', bottom: 28, left: 47,
    width: 314, height: 12, borderRadius: 13,
    backgroundColor: '#D9D9D9',
  },
  barFill: {
    height: '100%', borderRadius: 13,
    backgroundColor: '#24899B',
  },
});

// ── Screen 2: Video placeholder ───────────────────────────────────────────────

function VideoScreen({ onNext, onExit }) {
  return (
    <LinearGradient colors={BG_GRADIENT} locations={BG_LOCATIONS}
      start={BG_START} end={BG_END} style={StyleSheet.absoluteFillObject}>
      <StatusBar barStyle="light-content" />

      {/* Dark overlay */}
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />

      {/* Header */}
      <View style={vs.header}>
        <TouchableOpacity style={vs.backBtn} onPress={onExit}>
          <Text style={vs.backText}>←  Back</Text>
        </TouchableOpacity>
        <HelpButton />
      </View>

      {/* Video container — rounded rectangle placeholder */}
      <View style={vs.videoBox}>
        <View style={vs.playCircle}>
          <Text style={vs.playIcon}>▶</Text>
        </View>
        <Text style={vs.videoCaption}>Video coming soon</Text>
      </View>

      {/* Timer */}
      <Text style={vs.timer}>0:10</Text>

      {/* Start button */}
      <TouchableOpacity style={vs.startBtn} onPress={onNext} activeOpacity={0.85}>
        <Text style={vs.startBtnText}>Start  ▶</Text>
      </TouchableOpacity>

      {/* Progress bar */}
      <View style={vs.barTrack}>
        <View style={[vs.barFill, { width: 128 }]} />
      </View>
    </LinearGradient>
  );
}

const vs = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 48, paddingHorizontal: 32, paddingBottom: 12,
    zIndex: 2,
  },
  backBtn: {
    backgroundColor: '#37767A', borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  backText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  videoBox: {
    alignSelf: 'center', marginTop: 8,
    width: 314, height: 400, borderRadius: 35,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center', alignItems: 'center', gap: 14,
    zIndex: 2,
  },
  playCircle: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  playIcon: { color: '#FFFFFF', fontSize: 22, marginLeft: 4 },
  videoCaption: { color: 'rgba(255,255,255,0.5)', fontSize: 13, letterSpacing: 0.5 },
  timer: {
    color: '#FFFFFF', fontSize: 24, fontWeight: '700',
    letterSpacing: 1.2, textAlign: 'center', marginTop: 12, zIndex: 2,
  },
  startBtn: {
    alignSelf: 'center', marginTop: 16,
    backgroundColor: 'rgba(254,156,45,0.9)',
    borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10, zIndex: 2,
  },
  startBtnText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  barTrack: {
    position: 'absolute', bottom: 28, left: 47,
    width: 314, height: 12, borderRadius: 13,
    backgroundColor: '#D9D9D9', zIndex: 2,
  },
  barFill: { height: '100%', borderRadius: 13, backgroundColor: '#24899B' },
});

// ── Screen 3: Drill ───────────────────────────────────────────────────────────
// Phases: idle → inhale → hold → exhale → (next cycle or complete)

const PHASE_LABELS = {
  idle:   'Breath in',
  inhale: 'Breath in',
  hold:   'Hold',
  exhale: 'Breath Out',
  done:   'Well done',
};

function DrillScreen({ onComplete, onExit }) {
  const [phase, setPhase]           = useState('idle');
  const [cycleIndex, setCycleIndex] = useState(0);
  const [timeLeft, setTimeLeft]     = useState(INHALE_S);

  const bubbleScale = useRef(new Animated.Value(SCALE_SMALL)).current;
  const bubbleY     = useRef(new Animated.Value(0)).current;
  const timerRef    = useRef(null);
  const taskRefs    = useRef([]);

  useEffect(() => {
    return () => {
      taskRefs.current.forEach(clearTimeout);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function schedule(fn, delay) {
    const id = setTimeout(fn, delay);
    taskRefs.current.push(id);
  }

  function startTimer(seconds) {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(seconds);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); return 0; }
        return t - 1;
      });
    }, 1000);
  }

  function runCycle(index) {
    setCycleIndex(index);

    // — Inhale —
    setPhase('inhale');
    startTimer(INHALE_S);
    bubbleScale.setValue(SCALE_SMALL);
    bubbleY.setValue(0);
    Animated.timing(bubbleScale, {
      toValue: SCALE_LARGE, duration: INHALE_MS, useNativeDriver: true,
    }).start();

    // — Hold —
    schedule(() => {
      setPhase('hold');
      startTimer(HOLD_S);
    }, INHALE_MS);

    // — Exhale —
    schedule(() => {
      setPhase('exhale');
      startTimer(EXHALE_S);
      // Bubble rises up and out of the screen (stays large, just translates up)
      Animated.timing(bubbleY, {
        toValue: BUBBLE_RISE, duration: EXHALE_MS, useNativeDriver: true,
      }).start();
    }, INHALE_MS + HOLD_MS);

    // — Cycle end —
    schedule(() => {
      if (index < TOTAL_CYCLES - 1) {
        runCycle(index + 1);
      } else {
        setPhase('done');
        schedule(onComplete, 1000);
      }
    }, INHALE_MS + HOLD_MS + EXHALE_MS + 300);
  }

  // Format time as M:SS
  const mins = Math.floor(timeLeft / 60);
  const secs = String(timeLeft % 60).padStart(2, '0');
  const timerDisplay = `${mins}:${secs}`;

  return (
    <LinearGradient colors={BG_GRADIENT} locations={BG_LOCATIONS}
      start={BG_START} end={BG_END} style={StyleSheet.absoluteFillObject}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={ds.header}>
        <CloseButton onPress={onExit} />
        <View style={{ flex: 1 }} />
        <HelpButton />
      </View>

      {/* Phase title */}
      <Text style={ds.phaseTitle}>{PHASE_LABELS[phase]}</Text>

      {/* Animated bubble — centred in the space below the title */}
      <View style={ds.bubbleArea}>
        <Animated.View style={{
          transform: [
            { scale: bubbleScale },
            { translateY: bubbleY },
          ],
        }}>
          <GlassSphere size={BUBBLE_BASE} />
        </Animated.View>
      </View>

      {/* Timer */}
      <Text style={ds.timer}>{timerDisplay}</Text>

      {/* Start button — only shown before the drill begins */}
      {phase === 'idle' && (
        <TouchableOpacity style={ds.startBtn} onPress={() => runCycle(0)} activeOpacity={0.85}>
          <Text style={ds.startBtnText}>Start  ▶</Text>
        </TouchableOpacity>
      )}

      {/* 3-cycle progress pills */}
      <CyclePills currentCycle={cycleIndex} phase={phase} />
    </LinearGradient>
  );
}

const ds = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 21, paddingHorizontal: 14,
  },
  phaseTitle: {
    color: '#FFFFFF', fontSize: 64, fontWeight: '800',
    letterSpacing: 3.2, textAlign: 'center',
    marginTop: 28, paddingHorizontal: 20,
  },
  bubbleArea: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
  },
  timer: {
    color: '#FFFFFF', fontSize: 24, fontWeight: '700',
    letterSpacing: 1.2, textAlign: 'center',
    marginBottom: 16,
  },
  startBtn: {
    alignSelf: 'center', marginBottom: 8,
    backgroundColor: 'rgba(254,156,45,0.9)',
    borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10,
  },
  startBtnText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
});

// ── Root export ───────────────────────────────────────────────────────────────

export default function BreathingExercise({ onComplete, onExit }) {
  const [step, setStep] = useState(STEP_TITLE);

  if (step === STEP_TITLE) return <TitleScreen onNext={() => setStep(STEP_INFO)}  onExit={onExit} />;
  if (step === STEP_INFO)  return <InfoScreen  onNext={() => setStep(STEP_VIDEO)} onExit={onExit} />;
  if (step === STEP_VIDEO) return <VideoScreen onNext={() => setStep(STEP_DRILL)} onExit={onExit} />;
  return <DrillScreen onComplete={onComplete} onExit={onExit} />;
}
