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
const STEP_TITLE = 0;
const STEP_INFO  = 1;
const STEP_VIDEO = 2;
const STEP_DRILL = 3;

// ── Timing ────────────────────────────────────────────────────────────────────
const INHALE_S  = 4;
const HOLD_S    = 2;
const EXHALE_S  = 4;
const INHALE_MS = INHALE_S * 1000;
const HOLD_MS   = HOLD_S   * 1000;
const EXHALE_MS = EXHALE_S * 1000;
const TOTAL_CYCLES = 3;

// ── Bubble geometry ───────────────────────────────────────────────────────────
const BUBBLE_BASE = 244;
const SCALE_SMALL = 58 / BUBBLE_BASE;   // ≈ 0.24  (resting / idle)
const SCALE_LARGE = 1.0;                // full size on inhale complete
const BUBBLE_RISE = -(H * 0.55 + BUBBLE_BASE / 2);  // exhale: rise off screen top

// ── Shared gradient ───────────────────────────────────────────────────────────
const BG_GRADIENT  = ['#2D858B', '#37767A', '#0A1618'];
const BG_LOCATIONS = [0.2, 0.44, 1.0];
const BG_START     = { x: 1, y: 0.1 };
const BG_END       = { x: 0, y: 0.9 };

// ── Header buttons ────────────────────────────────────────────────────────────

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
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center', alignItems: 'center',
  },
  closeText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  helpCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#FFA940',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#FFA940', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45, shadowRadius: 6, elevation: 6,
  },
  helpText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
});

// ── Glass Bubble ──────────────────────────────────────────────────────────────
// Two-layer design:
//   Outer view  — carries the teal glow/shadow (no overflow clip so shadow shows)
//   Inner view  — clips all highlight layers to the circular boundary
//
// The resulting look: a deep dark-navy sphere with a teal outer glow, a large
// frosted-glass arc upper-left, a secondary bright streak, a specular pinpoint
// top-right, and a faint teal caustic at the base.

function GlassSphere({ size = BUBBLE_BASE }) {
  const r = size / 2;

  return (
    // Outer: glow only — no clip
    <View style={{
      width: size, height: size, borderRadius: r,
      shadowColor: '#1ED8E8',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.75,
      shadowRadius: size * 0.26,
      elevation: 22,
    }}>
      {/* Inner: clips all layers to circle */}
      <View style={{
        width: size, height: size, borderRadius: r,
        backgroundColor: '#091D26',
        overflow: 'hidden',
      }}>

        {/* Subtle inner teal tint — creates depth / liquid feel */}
        <View style={{
          position: 'absolute',
          width: size * 0.72, height: size * 0.72,
          borderRadius: size * 0.36,
          top: size * 0.14, left: size * 0.14,
          backgroundColor: 'rgba(20,110,122,0.14)',
        }} />

        {/* Primary highlight arc — large frosted crescent, upper-left */}
        <View style={{
          position: 'absolute',
          width: size * 0.60, height: size * 0.30,
          borderRadius: size * 0.18,
          top: size * 0.10, left: size * 0.06,
          backgroundColor: 'rgba(255,255,255,0.13)',
          transform: [{ rotate: '-20deg' }],
        }} />

        {/* Secondary highlight — brighter, tighter, inside the arc */}
        <View style={{
          position: 'absolute',
          width: size * 0.32, height: size * 0.13,
          borderRadius: size * 0.08,
          top: size * 0.15, left: size * 0.10,
          backgroundColor: 'rgba(200,245,252,0.24)',
          transform: [{ rotate: '-14deg' }],
        }} />

        {/* Specular dot — bright pinpoint, top-right */}
        <View style={{
          position: 'absolute',
          width: size * 0.09, height: size * 0.09,
          borderRadius: size * 0.045,
          top: size * 0.10, right: size * 0.18,
          backgroundColor: 'rgba(255,255,255,0.68)',
        }} />

        {/* Bottom caustic glow — faint teal reflection */}
        <View style={{
          position: 'absolute',
          width: size * 0.48, height: size * 0.20,
          borderRadius: size * 0.15,
          bottom: size * 0.08,
          left: size * 0.26,
          backgroundColor: 'rgba(30,210,230,0.10)',
        }} />

        {/* Inner rim ring — thin teal border inside the sphere */}
        <View style={{
          position: 'absolute',
          width: size * 0.88, height: size * 0.88,
          borderRadius: size * 0.44,
          top: size * 0.06, left: size * 0.06,
          borderWidth: 1,
          borderColor: 'rgba(80,220,232,0.13)',
          backgroundColor: 'transparent',
        }} />

      </View>
    </View>
  );
}

// ── Progress bar — shown on TitleScreen ───────────────────────────────────────

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
  fill: { height: '100%', borderRadius: 13, backgroundColor: '#FE9C2D' },
});

// ── Cycle progress pills ──────────────────────────────────────────────────────

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
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  pill: {
    width: 96, height: 10, borderRadius: 43,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  pillActive: { backgroundColor: '#2D9BA2' },
  pillDone:   { backgroundColor: '#1A6068' },
});

// ── Start / action button (shared style) ──────────────────────────────────────

function StartButton({ onPress, label = 'Start  ▶' }) {
  return (
    <TouchableOpacity style={btn.wrap} onPress={onPress} activeOpacity={0.82}>
      <Text style={btn.text}>{label}</Text>
    </TouchableOpacity>
  );
}
const btn = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    backgroundColor: '#FE9C2D',
    borderRadius: 14,
    paddingHorizontal: 36, paddingVertical: 15,
    shadowColor: '#FE9C2D', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },
  text: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', letterSpacing: 0.6 },
});

// ── Screen 0: Title card ──────────────────────────────────────────────────────

function TitleScreen({ onNext, onExit }) {
  return (
    <LinearGradient
      colors={BG_GRADIENT} locations={BG_LOCATIONS}
      start={BG_START} end={BG_END}
      style={StyleSheet.absoluteFillObject}
    >
      <StatusBar barStyle="light-content" />

      <View style={ts.header}>
        <CloseButton onPress={onExit} />
      </View>

      <Text style={ts.title}>Breathing</Text>

      <View style={ts.sphereArea}>
        <GlassSphere size={173} />
      </View>

      <Text style={ts.timer}>0:00</Text>

      <TouchableOpacity style={ts.arrowBtn} onPress={onNext} activeOpacity={0.8}>
        <Text style={ts.arrowText}>→</Text>
      </TouchableOpacity>

      <SessionBar fill={0.14} />
    </LinearGradient>
  );
}

const ts = StyleSheet.create({
  header: {
    paddingTop: 52, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center',
  },
  title: {
    color: '#FFFFFF', fontSize: 64, fontWeight: '800',
    letterSpacing: 3.2, textAlign: 'center',
    marginTop: 48,
  },
  sphereArea: {
    alignItems: 'center',
    marginTop: 48,
  },
  timer: {
    color: 'rgba(255,255,255,0.7)', fontSize: 22, fontWeight: '600',
    letterSpacing: 2, textAlign: 'center',
    marginTop: 20,
  },
  arrowBtn: {
    alignSelf: 'center', marginTop: 48,
    width: 76, height: 62,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center', alignItems: 'center',
  },
  arrowText: { color: '#FFFFFF', fontSize: 26, fontWeight: '300' },
});

// ── Screen 1: Info ────────────────────────────────────────────────────────────

function InfoScreen({ onNext, onExit }) {
  return (
    <LinearGradient
      colors={BG_GRADIENT} locations={BG_LOCATIONS}
      start={BG_START} end={BG_END}
      style={StyleSheet.absoluteFillObject}
    >
      <StatusBar barStyle="light-content" />

      {/* Satellite bubbles — absolutely positioned behind everything */}
      <View style={is.sat1}><GlassSphere size={82} /></View>
      <View style={is.sat2}><GlassSphere size={48} /></View>

      {/* Header */}
      <View style={is.header}>
        <TouchableOpacity style={is.backBtn} onPress={onExit} activeOpacity={0.8}>
          <Text style={is.backText}>← Back</Text>
        </TouchableOpacity>
        <HelpButton />
      </View>

      {/* Main sphere + label */}
      <View style={is.sphereWrap}>
        <GlassSphere size={310} />
        <View style={is.sphereLabel}>
          <Text style={is.sphereTitle}>Diaphragmatic{'\n'}Breathing{'\n'}Technique</Text>
        </View>
      </View>

      {/* Timer */}
      <Text style={is.timer}>0:10</Text>

      {/* Start */}
      <View style={{ marginTop: 20 }}>
        <StartButton onPress={onNext} />
      </View>

      {/* Progress bar */}
      <View style={is.barTrack}>
        <View style={[is.barFill, { width: '40%' }]} />
      </View>
    </LinearGradient>
  );
}

const is = StyleSheet.create({
  // Satellite bubbles
  sat1: {
    position: 'absolute',
    top: H * 0.13,
    right: 14,
  },
  sat2: {
    position: 'absolute',
    top: H * 0.54,
    left: 18,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 24, paddingBottom: 4,
  },
  backBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 22, paddingHorizontal: 18, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  backText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', letterSpacing: 0.3 },
  sphereWrap: {
    alignSelf: 'center', marginTop: 8,
    width: 310, height: 310,
    justifyContent: 'center', alignItems: 'center',
  },
  sphereLabel: {
    position: 'absolute',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 24,
  },
  sphereTitle: {
    color: '#FFFFFF', fontSize: 26, fontWeight: '800',
    letterSpacing: 1.0, textAlign: 'center', lineHeight: 36,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  timer: {
    color: 'rgba(255,255,255,0.7)', fontSize: 22, fontWeight: '600',
    letterSpacing: 2, textAlign: 'center', marginTop: 14,
  },
  barTrack: {
    position: 'absolute', bottom: 28, left: 47,
    width: W - 94, height: 12, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  barFill: { height: '100%', borderRadius: 13, backgroundColor: '#2D9BA2' },
});

// ── Screen 2: Video placeholder ───────────────────────────────────────────────

function VideoScreen({ onNext, onExit }) {
  return (
    <LinearGradient
      colors={BG_GRADIENT} locations={BG_LOCATIONS}
      start={BG_START} end={BG_END}
      style={StyleSheet.absoluteFillObject}
    >
      <StatusBar barStyle="light-content" />

      {/* Dark overlay — sits behind header/content via render order */}
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.38)' }]} />

      {/* Header */}
      <View style={vs.header}>
        <TouchableOpacity style={vs.backBtn} onPress={onExit} activeOpacity={0.8}>
          <Text style={vs.backText}>← Back</Text>
        </TouchableOpacity>
        <HelpButton />
      </View>

      {/* Video box */}
      <View style={vs.videoBox}>
        <View style={vs.playCircle}>
          <Text style={vs.playIcon}>▶</Text>
        </View>
        <Text style={vs.videoCaption}>Video coming soon</Text>
      </View>

      {/* Timer */}
      <Text style={vs.timer}>0:10</Text>

      {/* Start */}
      <View style={{ marginTop: 18 }}>
        <StartButton onPress={onNext} />
      </View>

      {/* Progress bar */}
      <View style={vs.barTrack}>
        <View style={[vs.barFill, { width: '40%' }]} />
      </View>
    </LinearGradient>
  );
}

const vs = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 24, paddingBottom: 4,
  },
  backBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 22, paddingHorizontal: 18, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  backText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', letterSpacing: 0.3 },
  videoBox: {
    alignSelf: 'center', marginTop: 16,
    width: W - 52, height: H * 0.42, borderRadius: 32,
    backgroundColor: 'rgba(5,18,24,0.6)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center', alignItems: 'center', gap: 18,
  },
  playCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  playIcon: { color: '#FFFFFF', fontSize: 24, marginLeft: 5 },
  videoCaption: {
    color: 'rgba(255,255,255,0.40)', fontSize: 13, letterSpacing: 1,
    textTransform: 'uppercase',
  },
  timer: {
    color: 'rgba(255,255,255,0.7)', fontSize: 22, fontWeight: '600',
    letterSpacing: 2, textAlign: 'center', marginTop: 16,
  },
  barTrack: {
    position: 'absolute', bottom: 28, left: 47,
    width: W - 94, height: 12, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  barFill: { height: '100%', borderRadius: 13, backgroundColor: '#2D9BA2' },
});

// ── Screen 3: Drill ───────────────────────────────────────────────────────────

const PHASE_LABELS = {
  idle:   'Breathe in',
  inhale: 'Breathe in',
  hold:   'Hold',
  exhale: 'Breathe out',
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

    // Inhale: bubble grows from small → large
    setPhase('inhale');
    startTimer(INHALE_S);
    bubbleScale.setValue(SCALE_SMALL);
    bubbleY.setValue(0);
    Animated.timing(bubbleScale, {
      toValue: SCALE_LARGE, duration: INHALE_MS, useNativeDriver: true,
    }).start();

    // Hold: bubble stays large
    schedule(() => {
      setPhase('hold');
      startTimer(HOLD_S);
    }, INHALE_MS);

    // Exhale: bubble rises up and off screen
    schedule(() => {
      setPhase('exhale');
      startTimer(EXHALE_S);
      Animated.timing(bubbleY, {
        toValue: BUBBLE_RISE, duration: EXHALE_MS, useNativeDriver: true,
      }).start();
    }, INHALE_MS + HOLD_MS);

    // Next cycle or complete
    schedule(() => {
      if (index < TOTAL_CYCLES - 1) {
        runCycle(index + 1);
      } else {
        setPhase('done');
        schedule(onComplete, 1200);
      }
    }, INHALE_MS + HOLD_MS + EXHALE_MS + 400);
  }

  const mins = Math.floor(timeLeft / 60);
  const secs = String(timeLeft % 60).padStart(2, '0');

  return (
    <LinearGradient
      colors={BG_GRADIENT} locations={BG_LOCATIONS}
      start={BG_START} end={BG_END}
      style={StyleSheet.absoluteFillObject}
    >
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={ds.header}>
        <CloseButton onPress={onExit} />
        <View style={{ flex: 1 }} />
        <HelpButton />
      </View>

      {/* Phase label */}
      <Text style={ds.phaseTitle}>{PHASE_LABELS[phase]}</Text>

      {/* Animated bubble — centred in the available vertical space */}
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

      {/* Bottom section — timer, optional start button, cycle pills */}
      <View style={ds.bottom}>
        <Text style={ds.timer}>{`${mins}:${secs}`}</Text>

        {phase === 'idle' && (
          <StartButton onPress={() => runCycle(0)} />
        )}

        <CyclePills currentCycle={cycleIndex} phase={phase} />
      </View>
    </LinearGradient>
  );
}

const ds = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 18,
  },
  phaseTitle: {
    color: '#FFFFFF', fontSize: 64, fontWeight: '800',
    letterSpacing: 3.2, textAlign: 'center',
    marginTop: 16, paddingHorizontal: 16,
  },
  bubbleArea: {
    flex: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  bottom: {
    alignItems: 'center',
    paddingBottom: 36,
    gap: 14,
  },
  timer: {
    color: 'rgba(255,255,255,0.75)', fontSize: 22, fontWeight: '600',
    letterSpacing: 2,
  },
});

// ── Root ──────────────────────────────────────────────────────────────────────

export default function BreathingExercise({ onComplete, onExit }) {
  const [step, setStep] = useState(STEP_TITLE);

  if (step === STEP_TITLE) return <TitleScreen onNext={() => setStep(STEP_INFO)}  onExit={onExit} />;
  if (step === STEP_INFO)  return <InfoScreen  onNext={() => setStep(STEP_VIDEO)} onExit={() => setStep(STEP_TITLE)} />;
  if (step === STEP_VIDEO) return <VideoScreen onNext={() => setStep(STEP_DRILL)} onExit={() => setStep(STEP_INFO)} />;
  return <DrillScreen onComplete={onComplete} onExit={onExit} />;
}
