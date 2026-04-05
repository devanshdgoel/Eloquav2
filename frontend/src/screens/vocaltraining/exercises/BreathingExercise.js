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
const STEP_VIDEO = 1;
const STEP_DRILL = 2;

// ── Timing ────────────────────────────────────────────────────────────────────
const INHALE_S  = 4;
const HOLD_S    = 2;
const EXHALE_S  = 4;
const INHALE_MS = INHALE_S * 1000;
const HOLD_MS   = HOLD_S   * 1000;
const EXHALE_MS = EXHALE_S * 1000;
const TOTAL_CYCLES = 3;

// ── Bubble geometry ───────────────────────────────────────────────────────────
const BUBBLE_BASE = 240;
const SCALE_SMALL = 0.34;
const SCALE_LARGE = 1.0;

// ── Shared gradient ───────────────────────────────────────────────────────────
const BG_GRADIENT  = ['#2D858B', '#37767A', '#0A1618'];
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

// ── Glass Bubble ──────────────────────────────────────────────────────────────
// Soap-bubble aesthetic: near-transparent body, thin white rim, soft highlight
// arc in the upper-left with a bright specular dot, and a faint teal reflection
// at the base. Two layers: outer carries the glow shadow; inner clips highlights.

function GlassBubble({ size = BUBBLE_BASE }) {
  const r = size / 2;
  return (
    <View style={{
      width: size, height: size, borderRadius: r,
      shadowColor: '#70D8E8',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.60,
      shadowRadius: size * 0.24,
      elevation: 20,
    }}>
      <View style={{
        width: size, height: size, borderRadius: r,
        backgroundColor: 'rgba(155, 215, 230, 0.08)',
        borderWidth: 2.5,
        borderColor: 'rgba(255, 255, 255, 0.50)',
        overflow: 'hidden',
      }}>

        {/* Large soft highlight arc — upper-left */}
        <View style={{
          position: 'absolute',
          width: size * 0.62, height: size * 0.28,
          borderRadius: size * 0.18,
          top: size * 0.07, left: size * 0.04,
          backgroundColor: 'rgba(255, 255, 255, 0.20)',
          transform: [{ rotate: '-24deg' }],
        }} />

        {/* Tighter inner highlight */}
        <View style={{
          position: 'absolute',
          width: size * 0.32, height: size * 0.12,
          borderRadius: size * 0.09,
          top: size * 0.13, left: size * 0.08,
          backgroundColor: 'rgba(255, 255, 255, 0.48)',
          transform: [{ rotate: '-18deg' }],
        }} />

        {/* Specular pinpoint */}
        <View style={{
          position: 'absolute',
          width: size * 0.08, height: size * 0.06,
          borderRadius: size * 0.04,
          top: size * 0.09, left: size * 0.25,
          backgroundColor: 'rgba(255, 255, 255, 0.88)',
        }} />

        {/* Bottom-right iridescent teal reflection */}
        <View style={{
          position: 'absolute',
          width: size * 0.40, height: size * 0.12,
          borderRadius: size * 0.09,
          bottom: size * 0.09, right: size * 0.14,
          backgroundColor: 'rgba(90, 215, 240, 0.14)',
          transform: [{ rotate: '14deg' }],
        }} />

      </View>
    </View>
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
  fill: { height: '100%', borderRadius: 13, backgroundColor: '#FE9C2D' },
});

// ── Cycle progress pills ──────────────────────────────────────────────────────
function CyclePills({ current, done }) {
  return (
    <View style={cp.row}>
      {[0, 1, 2].map(i => (
        <View
          key={i}
          style={[
            cp.pill,
            i < done            && cp.pillDone,
            i === current && i >= done && cp.pillActive,
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
    width: 54, height: 54, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center', alignItems: 'center',
  },
  closeText: { color: '#FFFFFF', fontSize: 20, fontWeight: '600' },
  helpBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#FFA940',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#FFA940', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.55, shadowRadius: 8, elevation: 8,
  },
  helpText: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
});

// ── Screen 0: Title ───────────────────────────────────────────────────────────
function TitleScreen({ onNext, onExit }) {
  return (
    <FadeIn>
      <LinearGradient
        colors={BG_GRADIENT} locations={BG_LOCATIONS}
        start={BG_START} end={BG_END}
        style={StyleSheet.absoluteFillObject}
      />
      <StatusBar barStyle="light-content" />

      <View style={ts.header}>
        <TouchableOpacity style={hb.closeBtn} onPress={onExit} accessibilityLabel="Exit exercise">
          <Text style={hb.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      <Text style={ts.title}>Breathing</Text>

      <View style={ts.bubbleWrap}>
        <GlassBubble size={164} />
      </View>

      <TouchableOpacity style={ts.arrowBtn} onPress={onNext} activeOpacity={0.8}>
        <Text style={ts.arrowText}>→</Text>
      </TouchableOpacity>

      <SessionBar fill={0.14} />
    </FadeIn>
  );
}

const ts = StyleSheet.create({
  header: {
    paddingTop: 52, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center',
  },
  title: {
    color: '#FFFFFF', fontSize: 64, fontWeight: '800',
    letterSpacing: 3.2, textAlign: 'center', marginTop: 52,
  },
  bubbleWrap: { alignItems: 'center', marginTop: 56 },
  arrowBtn: {
    alignSelf: 'center', marginTop: 56,
    width: 76, height: 62, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center', alignItems: 'center',
  },
  arrowText: { color: '#FFFFFF', fontSize: 26, fontWeight: '300' },
});

// ── Screen 1: Video (instruction screen) ─────────────────────────────────────
function VideoScreen({ onNext, onExit }) {
  return (
    <FadeIn>
      <LinearGradient
        colors={BG_GRADIENT} locations={BG_LOCATIONS}
        start={BG_START} end={BG_END}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Subtle dark overlay so the video box reads clearly */}
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.32)' }]} />
      <StatusBar barStyle="light-content" />

      <View style={vs.header}>
        <TouchableOpacity style={vs.backBtn} onPress={onExit} activeOpacity={0.8}>
          <Text style={vs.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {/* Video placeholder */}
      <View style={vs.videoBox}>
        <View style={vs.playCircle}>
          <Text style={vs.playIcon}>▶</Text>
        </View>
        <Text style={vs.caption}>Video coming soon</Text>
      </View>

      <Text style={vs.desc}>Diaphragmatic{'\n'}Breathing Technique</Text>

      {/* Begin exercise */}
      <TouchableOpacity style={vs.startBtn} onPress={onNext} activeOpacity={0.85}>
        <Text style={vs.startText}>Begin Exercise  →</Text>
      </TouchableOpacity>
    </FadeIn>
  );
}

const vs = StyleSheet.create({
  header: {
    paddingTop: 52, paddingHorizontal: 24,
    flexDirection: 'row', alignItems: 'center',
  },
  backBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 22, paddingHorizontal: 18, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  backText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', letterSpacing: 0.3 },
  videoBox: {
    alignSelf: 'center', marginTop: 22,
    width: W - 52, height: H * 0.42, borderRadius: 32,
    backgroundColor: 'rgba(5,18,24,0.60)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center', alignItems: 'center', gap: 18,
  },
  playCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  playIcon:  { color: '#FFFFFF', fontSize: 24, marginLeft: 5 },
  caption:   { color: 'rgba(255,255,255,0.40)', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  desc: {
    color: 'rgba(255,255,255,0.78)', fontSize: 22, fontWeight: '700',
    textAlign: 'center', letterSpacing: 0.5, lineHeight: 32, marginTop: 24,
  },
  startBtn: {
    alignSelf: 'center', marginTop: 30,
    backgroundColor: '#FE9C2D', borderRadius: 14,
    paddingHorizontal: 36, paddingVertical: 16,
    shadowColor: '#FE9C2D', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },
  startText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', letterSpacing: 0.4 },
});

// ── Screen 2: Drill ───────────────────────────────────────────────────────────
//
// Auto-starts on mount. Phase label crossfades so text changes are seamless.
// Bubble expands on inhale, holds at full size, then contracts on exhale —
// no "flying away". No timer shown.

function DrillScreen({ onComplete, onExit, onShowVideo }) {
  const [cycleIndex, setCycleIndex] = useState(0);
  const [doneCount,  setDoneCount]  = useState(0);

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
      if (index < TOTAL_CYCLES - 1) {
        runCycle(index + 1);
      } else {
        crossfade('Well done');
        schedule(onComplete, 1500);
      }
    }, INHALE_MS + HOLD_MS + EXHALE_MS + 350);
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
      <View style={ds.header}>
        <TouchableOpacity style={hb.closeBtn} onPress={onExit} accessibilityLabel="Exit exercise">
          <Text style={hb.closeText}>✕</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={hb.helpBtn} onPress={onShowVideo} accessibilityLabel="Show instructions">
          <Text style={hb.helpText}>?</Text>
        </TouchableOpacity>
      </View>

      {/* Phase label — crossfades so text never snaps */}
      <Animated.Text
        style={[ds.phaseLabel, { opacity: labelOpacity }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Animated.Text>

      {/* Animated bubble */}
      <View style={ds.bubbleArea}>
        <Animated.View style={{ transform: [{ scale: bubbleScale }] }}>
          <GlassBubble size={BUBBLE_BASE} />
        </Animated.View>
      </View>

      {/* Cycle pills */}
      <View style={ds.bottom}>
        <CyclePills current={cycleIndex} done={doneCount} />
      </View>
    </FadeIn>
  );
}

const ds = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 18,
  },
  phaseLabel: {
    color: '#FFFFFF', fontSize: 54, fontWeight: '800',
    letterSpacing: 2.5, textAlign: 'center',
    marginTop: 22, paddingHorizontal: 24,
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

// ── Root ──────────────────────────────────────────────────────────────────────

export default function BreathingExercise({ onComplete, onExit }) {
  const [step, setStep] = useState(STEP_TITLE);

  if (step === STEP_TITLE) {
    return (
      <TitleScreen
        onNext={() => setStep(STEP_VIDEO)}
        onExit={onExit}
      />
    );
  }
  if (step === STEP_VIDEO) {
    return (
      <VideoScreen
        onNext={() => setStep(STEP_DRILL)}
        onExit={() => setStep(STEP_TITLE)}
      />
    );
  }
  return (
    <DrillScreen
      onComplete={onComplete}
      onExit={onExit}
      onShowVideo={() => setStep(STEP_VIDEO)}
    />
  );
}
