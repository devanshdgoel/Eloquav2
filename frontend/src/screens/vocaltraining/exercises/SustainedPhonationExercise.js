/**
 * SustainedPhonationExercise — LSVT-inspired maximum phonation time training.
 *
 * Flow: Title (SP1) → Demo slides (SP2-SP4) → Ready countdown (SP5) → Exercise (SP6+)
 *
 * Key mechanics:
 *   - Adaptive threshold: mic samples ambient noise for 1.5 s, then sets a
 *     per-session threshold well above the noise floor.
 *   - Score = whole seconds of voice sustained above the adaptive threshold.
 *   - Silence for 800 ms ends the round; 6.5 s breathing rest follows each round.
 *   - 3 rounds per session. Best score tracked with gold star marker.
 *   - ? button returns to demo slides from the exercise screen.
 *   - "Can't do now" is available on every screen.
 */
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
import { Audio } from 'expo-av';
import Svg, { Circle, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import CantDoNow from '../../../components/CantDoNow';

const { width: W, height: H } = Dimensions.get('window');

// ── Steps ──────────────────────────────────────────────────────────────────────
const STEP_TITLE    = 0;
const STEP_DEMO     = 1;
const STEP_READY    = 2;
const STEP_EXERCISE = 3;

// ── Timing config ──────────────────────────────────────────────────────────────
const TOTAL_ROUNDS    = 3;
const BARS_COUNT      = 26;
const BAR_INTERVAL_MS = 80;
const COUNTDOWN_S     = 3;
const CALIBRATION_MS  = 1500;
const MAX_PHONATE_MS  = 20000;
const SILENCE_END_MS  = 800;
const REST_MS         = 6500;

// ── Tier configuration (difficulty_tier 1–5) ───────────────────────────────────
// targetSeconds: visual goal shown to the user during scoring
// minVolume: minimum adaptive threshold floor (0–1 normalised dB scale)
const PHONATION_TIERS = [
  { targetSeconds: 4,  minVolume: 0.40 },  // Tier 1
  { targetSeconds: 5,  minVolume: 0.45 },  // Tier 2
  { targetSeconds: 7,  minVolume: 0.50 },  // Tier 3
  { targetSeconds: 9,  minVolume: 0.55 },  // Tier 4
  { targetSeconds: 12, minVolume: 0.60 },  // Tier 5
];

// ── Adaptive threshold bounds ──────────────────────────────────────────────────
const MIN_THRESHOLD = 0.30;
const MAX_THRESHOLD = 0.70;

// ── Layout ─────────────────────────────────────────────────────────────────────
const SPLIT_RATIO = 0.54;
const TOP_H  = H * SPLIT_RATIO;
const BAR_W  = Math.max(3, Math.floor((W - 48) / BARS_COUNT) - 2);

// ── Colors ─────────────────────────────────────────────────────────────────────
const DARK_TEAL  = '#1C4047';
const DARK_GREEN = '#1E3828';
const TEAL_MID   = '#2D6974';
const ORANGE     = '#FFA940';
const MINT       = '#C3DECE';
const WHITE      = '#FFFFFF';
const GREEN_BAR  = 'rgba(72,210,140,0.90)';
const WHITE_BAR  = 'rgba(255,255,255,0.88)';
const DIM_BAR    = 'rgba(255,255,255,0.14)';
const MID_BAR    = 'rgba(255,255,255,0.28)';

// ── Fade-in wrapper ────────────────────────────────────────────────────────────
function FadeIn({ children, duration = 380 }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }).start();
  }, []);
  return <Animated.View style={{ flex: 1, opacity }}>{children}</Animated.View>;
}

// ── Header button styles ───────────────────────────────────────────────────────
const BTN = 56;
const hb = StyleSheet.create({
  ghostBtn: {
    width: BTN, height: BTN, borderRadius: BTN / 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center', alignItems: 'center',
  },
  ghostText: {
    color: WHITE, fontSize: 20, fontWeight: '500',
    includeFontPadding: false, textAlign: 'center', lineHeight: 20,
  },
  orangeBtn: {
    width: BTN, height: BTN, borderRadius: BTN / 2,
    backgroundColor: ORANGE,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },
  orangeText: {
    color: WHITE, fontSize: 24, fontWeight: '900',
    includeFontPadding: false, textAlign: 'center', lineHeight: 24,
  },
});

// ── Waveform bars (static illustration) ───────────────────────────────────────
const BELL_V = [0.10, 0.22, 0.38, 0.54, 0.70, 0.84, 0.94, 1.0, 0.94, 0.84, 0.70, 0.54, 0.38, 0.22, 0.10];

function BellWaveform() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 96, gap: 5 }}>
      {BELL_V.map((v, i) => (
        <View key={i} style={{
          flex: 1,
          height: Math.max(6, v * 96),
          borderRadius: 5,
          backgroundColor: i < 7
            ? `rgba(72,210,140,${0.55 + v * 0.40})`
            : `rgba(195,222,206,${0.35 + v * 0.40})`,
        }} />
      ))}
    </View>
  );
}

// ── Session progress bar ───────────────────────────────────────────────────────
function SessionBar({ fill = 0.28 }) {
  return (
    <View style={sb.track}>
      <View style={[sb.fill, { width: `${fill * 100}%` }]} />
    </View>
  );
}
const sb = StyleSheet.create({
  track: {
    position: 'absolute', bottom: 30, left: 44,
    width: W - 88, height: 8, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  fill: { height: '100%', borderRadius: 8, backgroundColor: ORANGE },
});

// ══════════════════════════════════════════════════════════════════════════════
// SP1 — Title screen
// ══════════════════════════════════════════════════════════════════════════════
function TitleScreen({ onNext, onExit, onSkip }) {
  return (
    <FadeIn>
      <View style={{ flex: 1, backgroundColor: DARK_TEAL }}>
        <StatusBar barStyle="light-content" />

        <View style={ts.header}>
          <TouchableOpacity style={hb.ghostBtn} onPress={onExit} accessibilityRole="button" accessibilityLabel="Exit exercise">
            <Text style={hb.ghostText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }}>
          <Text style={ts.tag}>VOCAL TRAINING</Text>
          <Text style={ts.title}>Sustained{'\n'}Phonation</Text>
          <Text style={ts.subtitle}>Hold a steady "Aah" to build{'\n'}vocal strength and endurance</Text>
          <View style={ts.waveWrap}>
            <BellWaveform />
          </View>
        </View>

        <TouchableOpacity style={ts.arrowBtn} onPress={onNext} activeOpacity={0.8}
          accessibilityRole="button" accessibilityLabel="Continue to instructions">
          <Text style={ts.arrowText}>Get started  →</Text>
        </TouchableOpacity>

        <CantDoNow onSkip={onSkip} onEnd={onExit} style={ts.cantDo} />

        <SessionBar fill={0.28} />
      </View>
    </FadeIn>
  );
}

const ts = StyleSheet.create({
  header: { paddingTop: 56, paddingHorizontal: 20, flexDirection: 'row' },
  tag: {
    color: MINT, fontSize: 16, fontWeight: '700',
    letterSpacing: 2, opacity: 0.7, marginBottom: 12,
  },
  title: {
    color: WHITE, fontSize: 48, fontWeight: '800',
    letterSpacing: 0.8, textAlign: 'center',
    marginBottom: 14, lineHeight: 56,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.60)', fontSize: 17, fontWeight: '400',
    letterSpacing: 0.3, textAlign: 'center', lineHeight: 24,
    marginBottom: 40,
  },
  waveWrap: { width: '100%', paddingHorizontal: 12 },
  arrowBtn: {
    alignSelf: 'center', marginBottom: 16,
    paddingHorizontal: 32, paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: TEAL_MID,
    borderWidth: 1, borderColor: 'rgba(195,222,206,0.25)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 6,
  },
  arrowText: { color: WHITE, fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  cantDo: { marginBottom: 56 },
});

// ══════════════════════════════════════════════════════════════════════════════
// SP2-SP4 — Demo slides
// ══════════════════════════════════════════════════════════════════════════════
const SP2_BARS = [0.14, 0.26, 0.46, 0.66, 0.82, 0.90, 0.86, 0.76, 0.84, 0.88, 0.72, 0.56, 0.40, 0.26, 0.14];

function Slide1() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      {/* Decorative large soft circle */}
      <View style={{
        position: 'absolute', width: W * 0.85, height: W * 0.85,
        borderRadius: W * 0.425, backgroundColor: 'rgba(45,105,116,0.22)',
        top: -W * 0.22, alignSelf: 'center',
      }} />
      <Text style={sl.stepNum}>01</Text>
      <Text style={sl.title1}>Say "Aah" for as long as you can</Text>
      <Text style={sl.body1}>At a comfortable volume — loud enough that your voice is clear and steady.</Text>
      <View style={sl.waveRow}>
        {SP2_BARS.map((v, i) => (
          <View key={i} style={{
            width: 14, height: Math.max(5, v * 84),
            borderRadius: 5,
            backgroundColor: i < 8 ? GREEN_BAR : WHITE_BAR,
            marginHorizontal: 3,
          }} />
        ))}
      </View>
    </View>
  );
}

function Slide2() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
      <View style={{
        position: 'absolute', width: W * 0.90, height: W * 0.90,
        borderRadius: W * 0.45, backgroundColor: 'rgba(24,76,46,0.45)',
        alignSelf: 'center', top: H * 0.02,
      }} />
      <Text style={sl.stepNum}>02</Text>
      <Text style={sl.bigNum}>11</Text>
      <Text style={sl.body2}>Each second your voice is{'\n'}above the threshold scores a point.</Text>
      <View style={sl.scoreTag}>
        <Text style={sl.scoreTagText}>Best score wins</Text>
      </View>
    </View>
  );
}

function Slide3() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
      <Text style={sl.stepNum}>03</Text>
      <Text style={sl.andRemember}>and remember...</Text>
      <Text style={sl.thinkLoud}>THINK{'\n'}LOUD</Text>
      <Text style={sl.body2}>Project your voice as if{'\n'}speaking across a room.</Text>
    </View>
  );
}

const sl = StyleSheet.create({
  stepNum: {
    color: MINT, fontSize: 16, fontWeight: '800',
    letterSpacing: 2, opacity: 0.6, marginBottom: 16,
  },
  title1: {
    color: WHITE, fontSize: 28, fontWeight: '700',
    textAlign: 'center', lineHeight: 38, marginBottom: 14,
    letterSpacing: 0.2,
  },
  body1: {
    color: 'rgba(255,255,255,0.60)', fontSize: 16,
    textAlign: 'center', lineHeight: 24, letterSpacing: 0.2,
    marginBottom: 36,
  },
  waveRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    justifyContent: 'center',
  },
  bigNum: {
    color: WHITE, fontSize: 120, fontWeight: '900',
    letterSpacing: -4, lineHeight: 128,
    includeFontPadding: false,
    textShadowColor: 'rgba(72,210,140,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  body2: {
    color: 'rgba(255,255,255,0.70)', fontSize: 17,
    textAlign: 'center', lineHeight: 26, letterSpacing: 0.2, marginTop: 16,
  },
  scoreTag: {
    marginTop: 20, paddingHorizontal: 16, paddingVertical: 6,
    backgroundColor: 'rgba(254,156,45,0.18)',
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(254,156,45,0.35)',
  },
  scoreTagText: { color: ORANGE, fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  andRemember: {
    color: 'rgba(255,255,255,0.60)', fontSize: 17,
    fontStyle: 'italic', letterSpacing: 1.5, marginBottom: 16,
  },
  thinkLoud: {
    color: WHITE, fontSize: 68, fontWeight: '900',
    letterSpacing: 3, textAlign: 'center', lineHeight: 76, marginBottom: 20,
    textShadowColor: 'rgba(72,210,140,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
});

function DemoScreen({ onFinish, onExit, onSkip }) {
  const [slide, setSlide] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  function go(next) {
    Animated.timing(fadeAnim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
      setSlide(next);
      Animated.timing(fadeAnim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    });
  }

  function next() { if (slide < 2) go(slide + 1); else onFinish(); }
  function back() { if (slide > 0) go(slide - 1); else onExit(); }

  return (
    <FadeIn>
      <LinearGradient colors={['#1C3242', '#0D1E2B']} style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" />

        <View style={dm.header}>
          <TouchableOpacity style={hb.ghostBtn} onPress={back} accessibilityRole="button" accessibilityLabel="Go back">
            <Text style={hb.ghostText}>←</Text>
          </TouchableOpacity>

          <View style={dm.pill}>
            <Text style={dm.pillText}>INSTRUCTIONS</Text>
          </View>

          {/* Step indicator */}
          <View style={dm.stepWrap}>
            <Text style={dm.stepText}>{slide + 1} / 3</Text>
          </View>
        </View>

        <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
          {slide === 0 && <Slide1 />}
          {slide === 1 && <Slide2 />}
          {slide === 2 && <Slide3 />}
        </Animated.View>

        <View style={dm.footer}>
          {/* Progress dots */}
          <View style={dm.dots}>
            {[0, 1, 2].map(i => (
              <View key={i} style={[dm.dot, i === slide && dm.dotActive, i < slide && dm.dotDone]} />
            ))}
          </View>

          {/* Next / Done */}
          <TouchableOpacity style={dm.nextBtn} onPress={next} activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel={slide < 2 ? 'Next slide' : 'Start exercise'}>
            {slide < 2
              ? <Text style={dm.nextText}>Next  →</Text>
              : <Text style={dm.nextText}>Ready  ✓</Text>
            }
          </TouchableOpacity>
        </View>

        <CantDoNow onSkip={onSkip} onEnd={onExit} style={{ marginBottom: 24 }} />
      </LinearGradient>
    </FadeIn>
  );
}

const dm = StyleSheet.create({
  header: {
    paddingTop: 56, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  pill: {
    flex: 1, backgroundColor: ORANGE, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 6, alignItems: 'center',
  },
  pillText: { color: WHITE, fontSize: 16, fontWeight: '800', letterSpacing: 0.8 },
  stepWrap: {
    width: 52, alignItems: 'center',
  },
  stepText: {
    color: 'rgba(255,255,255,0.60)', fontSize: 16, fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 32, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dots: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.20)' },
  dotActive: { width: 24, backgroundColor: WHITE, borderRadius: 4 },
  dotDone:   { backgroundColor: MINT, opacity: 0.6 },
  nextBtn: {
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14,
    backgroundColor: TEAL_MID,
    borderWidth: 1, borderColor: 'rgba(195,222,206,0.25)',
  },
  nextText: { color: WHITE, fontSize: 16, fontWeight: '700', letterSpacing: 0.4 },
});

// ══════════════════════════════════════════════════════════════════════════════
// SP5 — Ready countdown
// ══════════════════════════════════════════════════════════════════════════════
function ReadyScreen({ onDone, onSkip, onExit }) {
  const [progress, setProgress] = useState(0);
  const [countdown, setCountdown] = useState(COUNTDOWN_S);

  const SIZE    = 160;
  const r       = SIZE / 2;
  const strokeW = 14;
  const innerR  = r - strokeW / 2;
  const circ    = 2 * Math.PI * innerR;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Pulse ring
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.06, duration: 600, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1.00, duration: 600, useNativeDriver: true }),
    ]));
    pulse.start();

    // Countdown
    const start    = Date.now();
    const duration = COUNTDOWN_S * 1000;
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / duration);
      setProgress(p);
      setCountdown(Math.max(1, Math.ceil(COUNTDOWN_S * (1 - p))));
      if (p >= 1) { clearInterval(id); pulse.stop(); setTimeout(onDone, 300); }
    }, 50);
    return () => { clearInterval(id); pulse.stop(); };
  }, []);

  return (
    <FadeIn>
      <LinearGradient
        colors={['#1E3A4A', '#0D2530']}
        start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }}
        style={{ flex: 1 }}
      >
        <StatusBar barStyle="light-content" />

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 40 }}>
          <Text style={rdy.preLabel}>Get ready to say</Text>
          <Text style={rdy.vowel}>"Aah"</Text>

          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Svg width={SIZE} height={SIZE}>
              <Circle
                cx={r} cy={r} r={innerR}
                stroke="rgba(195,222,206,0.15)"
                strokeWidth={strokeW} fill="none"
              />
              <Circle
                cx={r} cy={r} r={innerR}
                stroke={MINT}
                strokeWidth={strokeW} fill="none"
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - progress)}
                strokeLinecap="round"
                transform={`rotate(-90 ${r} ${r})`}
              />
            </Svg>
            {/* Countdown number inside ring */}
            <View style={rdy.countWrap}>
              <Text style={rdy.countNum}>{countdown}</Text>
            </View>
          </Animated.View>

          <Text style={rdy.hint}>Breathe in now...</Text>
        </View>

        <CantDoNow onSkip={onSkip} onEnd={onExit} style={{ marginBottom: 52 }} />
      </LinearGradient>
    </FadeIn>
  );
}

const rdy = StyleSheet.create({
  preLabel: {
    color: 'rgba(255,255,255,0.60)', fontSize: 16, fontWeight: '500', letterSpacing: 0.5,
  },
  vowel: {
    color: WHITE, fontSize: 52, fontWeight: '800', letterSpacing: 1,
    textShadowColor: 'rgba(72,210,140,0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  countWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  countNum: {
    color: WHITE, fontSize: 62, fontWeight: '900',
    includeFontPadding: false,
  },
  hint: {
    color: MINT, fontSize: 18, fontWeight: '500',
    letterSpacing: 0.5, opacity: 0.75,
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// SP6+ — Exercise screen
// ══════════════════════════════════════════════════════════════════════════════

function ExerciseScreen({ onComplete, onExit, onShowDemo, onSkip, tier = 1 }) {
  const tierConfig = PHONATION_TIERS[Math.max(0, Math.min(4, tier - 1))];
  const [score,     setScore]     = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [bars,      setBars]      = useState(Array(BARS_COUNT).fill(0.02));
  const [phase,     setPhase]     = useState('calibrating');
  const [round,     setRound]     = useState(1);
  const [restLabel, setRestLabel] = useState('');

  // Refs
  const phaseRef          = useRef('calibrating');
  const roundRef          = useRef(1);
  const scoreRef          = useRef(0);
  const bestRef           = useRef(0);
  const volumeRef         = useRef(0);
  const adaptiveThreshRef = useRef(MIN_THRESHOLD);
  const ambientSamplesRef = useRef([]);

  const recordingRef      = useRef(null);
  const barTimerRef       = useRef(null);
  const scoreTimerRef     = useRef(null);
  const silenceTimerRef   = useRef(null);
  const maxTimerRef       = useRef(null);
  const calibrateTimerRef = useRef(null);
  const idleTimerRef      = useRef(null);

  // Animated
  const restOverlayAnim = useRef(new Animated.Value(0)).current;
  const idleOverlayAnim = useRef(new Animated.Value(0)).current;
  const scoreScaleAnim  = useRef(new Animated.Value(1)).current;
  const [showIdleMsg,   setShowIdleMsg]   = useState(false);
  const [restMsgQueue,  setRestMsgQueue]  = useState([]);
  const [currentMsg,    setCurrentMsg]    = useState('');

  // ── Cross-fade rest message ─────────────────────────────────────────────────
  const msgFadeAnim = useRef(new Animated.Value(0)).current;
  const msgSlideAnim = useRef(new Animated.Value(12)).current;

  function showMsg(text) {
    // Fade out → swap → fade in
    Animated.parallel([
      Animated.timing(msgFadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(msgSlideAnim, { toValue: 12, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      setCurrentMsg(text);
      Animated.parallel([
        Animated.timing(msgFadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(msgSlideAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]).start();
    });
  }

  useEffect(() => {
    startMicSession();
    return () => cleanupAll();
  }, []);

  // Idle timer
  useEffect(() => {
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    if (phase !== 'listening') {
      setShowIdleMsg(false);
      Animated.timing(idleOverlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      return;
    }
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
      setShowIdleMsg(true);
      Animated.timing(idleOverlayAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start(() => {
        setTimeout(() => {
          Animated.timing(idleOverlayAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(
            () => setShowIdleMsg(false)
          );
        }, 3500);
      });
    }, 7000);
    return () => { if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; } };
  }, [phase]);

  // Score pop animation
  useEffect(() => {
    if (phase !== 'scoring') return;
    Animated.sequence([
      Animated.timing(scoreScaleAnim, { toValue: 1.08, duration: 120, useNativeDriver: true }),
      Animated.timing(scoreScaleAnim, { toValue: 1.00, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [score]);

  async function startMicSession() {
    ambientSamplesRef.current = [];
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
        onMeter,
        BAR_INTERVAL_MS,
      );
      recordingRef.current = recording;
      barTimerRef.current = setInterval(() => {
        const v = volumeRef.current;
        setBars(prev => [...prev.slice(1), Math.max(0.015, v + Math.random() * 0.018)]);
      }, BAR_INTERVAL_MS);
      calibrateTimerRef.current = setTimeout(finishCalibration, CALIBRATION_MS);
    } catch (_) {
      adaptiveThreshRef.current = tierConfig.minVolume;
      phaseRef.current = 'listening';
      setPhase('listening');
    }
  }

  function finishCalibration() {
    calibrateTimerRef.current = null;
    const samples = ambientSamplesRef.current;
    if (samples.length > 0) {
      const sorted = [...samples].sort((a, b) => a - b);
      const p90    = sorted[Math.floor(sorted.length * 0.90)] ?? MIN_THRESHOLD;
      adaptiveThreshRef.current = Math.min(MAX_THRESHOLD, Math.max(tierConfig.minVolume, p90 * 1.6 + 0.12));
    }
    phaseRef.current = 'listening';
    setPhase('listening');
    ambientSamplesRef.current = [];
  }

  function onMeter(status) {
    if (!status.isRecording) return;
    const db  = status.metering ?? -160;
    const vol = Math.min(1, Math.max(0, (db + 70) / 60));
    volumeRef.current = vol;
    if (phaseRef.current === 'calibrating') { ambientSamplesRef.current.push(vol); return; }
    if (phaseRef.current === 'listening' && vol >= adaptiveThreshRef.current) {
      beginScoring();
    } else if (phaseRef.current === 'scoring') {
      if (vol < adaptiveThreshRef.current) {
        if (!silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            silenceTimerRef.current = null;
            if (phaseRef.current === 'scoring') finishRound();
          }, SILENCE_END_MS);
        }
      } else {
        if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      }
    }
  }

  function beginScoring() {
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    setShowIdleMsg(false);
    Animated.timing(idleOverlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();

    phaseRef.current = 'scoring';
    setPhase('scoring');
    scoreRef.current = 0;
    setScore(0);
    scoreTimerRef.current = setInterval(() => {
      scoreRef.current += 1;
      setScore(scoreRef.current);
    }, 1000);
    maxTimerRef.current = setTimeout(finishRound, MAX_PHONATE_MS);
  }

  function finishRound() {
    if (phaseRef.current !== 'scoring') return;
    phaseRef.current = 'resting';
    setPhase('resting');
    Animated.timing(restOverlayAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    if (scoreTimerRef.current)   { clearInterval(scoreTimerRef.current);   scoreTimerRef.current  = null; }
    if (maxTimerRef.current)     { clearTimeout(maxTimerRef.current);      maxTimerRef.current    = null; }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current);  silenceTimerRef.current = null; }

    const final = scoreRef.current;
    bestRef.current = Math.max(bestRef.current, final);
    setBestScore(bestRef.current);

    // Breathing guidance sequence — matches the Breathing exercise style
    const REST_SETS = [
      { praise: 'Great start!',    breatheIn: 'Breathe in slowly...',   breatheOut: 'And breathe out...',   rest: 'Almost ready...' },
      { praise: 'Keep it up!',     breatheIn: 'Inhale deeply...',        breatheOut: 'Breathe out gently...', rest: 'One more round...' },
      { praise: 'Excellent work!', breatheIn: 'One last deep breath...', breatheOut: 'Release slowly...',     rest: 'Well done!' },
    ];
    const msgs = REST_SETS[(roundRef.current - 1) % REST_SETS.length];
    const nextRound = roundRef.current + 1;

    showMsg(msgs.praise);
    const t1 = setTimeout(() => showMsg(msgs.breatheIn),   2200);
    const t2 = setTimeout(() => showMsg(msgs.breatheOut),  4400);

    if (nextRound > TOTAL_ROUNDS) {
      setTimeout(() => {
        showMsg(msgs.rest);
        setTimeout(() => {
          Animated.timing(restOverlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
          phaseRef.current = 'done';
          setPhase('done');
          // V2: pass exercise score — best hold time vs tier target (0–100)
          setTimeout(async () => {
            // Release mic before onComplete so the next exercise (PitchGlides WebView) can claim it
            if (barTimerRef.current) { clearInterval(barTimerRef.current); barTimerRef.current = null; }
            try {
              if (recordingRef.current) {
                await recordingRef.current.stopAndUnloadAsync();
                recordingRef.current = null;
              }
              await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
            } catch (_) {}
            const exerciseScore = Math.min(100, Math.round((bestRef.current / tierConfig.targetSeconds) * 100));
            onComplete(exerciseScore);
          }, 1800);
        }, REST_MS - 800);
      }, 6000);
      return;
    }

    setTimeout(async () => {
      Animated.timing(restOverlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      setCurrentMsg('');
      roundRef.current = nextRound;
      setRound(nextRound);
      scoreRef.current = 0;
      setScore(0);
      setBars(Array(BARS_COUNT).fill(0.015));

      if (barTimerRef.current)       { clearInterval(barTimerRef.current);  barTimerRef.current = null; }
      if (calibrateTimerRef.current) { clearTimeout(calibrateTimerRef.current); calibrateTimerRef.current = null; }
      try {
        if (recordingRef.current) { await recordingRef.current.stopAndUnloadAsync(); recordingRef.current = null; }
      } catch (_) {}

      phaseRef.current = 'calibrating';
      setPhase('calibrating');
      await startMicSession();
    }, REST_MS);
  }

  async function cleanupAll() {
    [barTimerRef, scoreTimerRef, maxTimerRef, silenceTimerRef, calibrateTimerRef, idleTimerRef]
      .forEach(r => {
        if (r.current) {
          if (r === barTimerRef || r === scoreTimerRef) clearInterval(r.current);
          else clearTimeout(r.current);
          r.current = null;
        }
      });
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
    } catch (_) {}
  }

  function barColor(v, idx) {
    if (phase === 'scoring' && v >= adaptiveThreshRef.current) {
      return (BARS_COUNT - 1 - idx) < 4 ? WHITE_BAR : GREEN_BAR;
    }
    if (v < 0.05) return DIM_BAR;
    return MID_BAR;
  }

  function phaseLabel() {
    if (phase === 'calibrating') return 'Listening to room...';
    if (phase === 'listening')   return 'Say  "Aah"...';
    if (phase === 'done')        return 'Session complete!';
    return '';
  }

  const isScoring  = phase === 'scoring';
  const isResting  = phase === 'resting';
  const showScore  = isScoring || (isResting && scoreRef.current > 0);
  const showBest   = bestScore > 0 && !['calibrating', 'done'].includes(phase);
  const showStar   = bestScore > 0 && isScoring && score > bestScore;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />

      {/* Split background */}
      <View style={StyleSheet.absoluteFillObject}>
        <View style={{ height: TOP_H, backgroundColor: DARK_GREEN }} />
        <View style={{ flex: 1, backgroundColor: DARK_TEAL }} />
      </View>

      {/* Header buttons — X and ? */}
      <View style={exc.headerLeft}>
        <TouchableOpacity style={hb.ghostBtn} onPress={onExit} accessibilityRole="button" accessibilityLabel="Exit exercise">
          <Text style={hb.ghostText}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={exc.headerRight}>
        <TouchableOpacity style={hb.orangeBtn} onPress={onShowDemo} accessibilityRole="button" accessibilityLabel="Show instructions">
          <Text style={hb.orangeText}>?</Text>
        </TouchableOpacity>
      </View>

      {/* Green zone — score / phase label */}
      <View style={exc.topZone}>
        {/* Round pills */}
        <View style={exc.roundRow}>
          {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
            <View key={i} style={[
              exc.roundDot,
              i < round - 1  && exc.roundDone,
              i === round - 1 && exc.roundActive,
            ]} />
          ))}
        </View>

        {/* Score / phase message */}
        {showScore ? (
          <Animated.Text style={[exc.scoreNum, { transform: [{ scale: scoreScaleAnim }] }]}>
            {score}
          </Animated.Text>
        ) : (
          <Text style={[exc.phaseLabel, phase === 'listening' && exc.phaseLabelLoud]}>
            {phaseLabel()}
          </Text>
        )}

        {/* Best score */}
        {showBest && (
          <View style={exc.bestRow}>
            <Text style={exc.bestLabel}>Best  {bestScore}s</Text>
          </View>
        )}

        {/* Tier goal indicator */}
        {isScoring && score < tierConfig.targetSeconds && (
          <Text style={exc.goalHint}>Goal  {tierConfig.targetSeconds}s</Text>
        )}
        {isScoring && score >= tierConfig.targetSeconds && (
          <Text style={exc.goalReached}>✓ Goal reached!</Text>
        )}
      </View>

      {/* Waveform — straddles the split line */}
      <View style={exc.waveWrap}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
          {bars.map((v, i) => (
            <View key={i} style={{
              width: BAR_W,
              height: Math.max(4, v * 120),
              borderRadius: 3,
              backgroundColor: barColor(v, i),
            }} />
          ))}
        </View>
        {showStar && (
          <View style={exc.starWrap}>
            <Text style={exc.star}>★</Text>
            <View style={exc.starLine} />
          </View>
        )}
      </View>

      {/* Bottom zone — tap hint + cant do */}
      <View style={exc.bottomZone}>
        {phase === 'listening' && (
          <Text style={exc.tapHint}>Your mic is listening — speak clearly.</Text>
        )}
        {phase === 'calibrating' && (
          <Text style={exc.tapHint}>Calibrating to your environment...</Text>
        )}

        <CantDoNow
          onSkip={onSkip}
          onEnd={onExit}
          style={exc.cantDo}
        />
      </View>

      {/* Rest motivational overlay */}
      {isResting && (
        <Animated.View style={[exc.restOverlay, { opacity: restOverlayAnim }]} pointerEvents="none">
          <Animated.Text style={[exc.restMsg, { opacity: msgFadeAnim, transform: [{ translateY: msgSlideAnim }] }]}>
            {currentMsg}
          </Animated.Text>
        </Animated.View>
      )}

      {/* Idle encouragement overlay */}
      {showIdleMsg && (
        <Animated.View style={[exc.idleOverlay, { opacity: idleOverlayAnim }]} pointerEvents="none">
          <Text style={exc.idleTitle}>Take your time.</Text>
          <Text style={exc.idleBody}>You can do this!</Text>
        </Animated.View>
      )}
    </View>
  );
}

const exc = StyleSheet.create({
  headerLeft:  { position: 'absolute', top: 56, left: 20,  zIndex: 20 },
  headerRight: { position: 'absolute', top: 56, right: 20, zIndex: 20 },

  topZone: {
    height: TOP_H,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 56,
  },

  // Round indicators
  roundRow:   { flexDirection: 'row', gap: 10, marginBottom: 8 },
  roundDot:   { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.18)' },
  roundActive: { backgroundColor: WHITE, width: 28, borderRadius: 5 },
  roundDone:  { backgroundColor: '#64C882' },

  scoreNum: {
    color: WHITE, fontSize: 128, fontWeight: '900', letterSpacing: -5,
    includeFontPadding: false,
    textShadowColor: 'rgba(72,210,140,0.30)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  phaseLabel: {
    color: 'rgba(255,255,255,0.60)', fontSize: 26, fontWeight: '600',
    letterSpacing: 0.8, includeFontPadding: false, textAlign: 'center',
    paddingHorizontal: 32,
  },
  phaseLabelLoud: {
    color: 'rgba(255,255,255,0.82)', fontSize: 30, fontWeight: '700',
    letterSpacing: 1.5,
  },
  bestRow: { marginTop: 4 },
  bestLabel: {
    color: 'rgba(255,255,255,0.38)', fontSize: 16, letterSpacing: 0.8,
    includeFontPadding: false,
  },

  // Waveform
  waveWrap: {
    position: 'absolute',
    top: TOP_H - 124,
    height: 124,
    left: 20, right: 20,
    justifyContent: 'flex-end',
  },
  starWrap: { position: 'absolute', right: 0, bottom: 0, alignItems: 'center' },
  star:     { color: '#FFD700', fontSize: 20, includeFontPadding: false },
  starLine: { width: 1.5, height: 50, backgroundColor: '#FFD700', opacity: 0.45 },

  // Bottom zone
  bottomZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 36,
    gap: 16,
  },
  tapHint: {
    color: 'rgba(255,255,255,0.38)', fontSize: 16, fontWeight: '400',
    letterSpacing: 0.3, textAlign: 'center',
    paddingHorizontal: 32,
  },
  goalHint: {
    color: 'rgba(255,255,255,0.38)', fontSize: 16, fontWeight: '400',
    letterSpacing: 0.3, textAlign: 'center',
  },
  goalReached: {
    color: '#68D88C', fontSize: 16, fontWeight: '700',
    letterSpacing: 0.3, textAlign: 'center',
  },
  cantDo: {},

  // Rest overlay
  restOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: TOP_H,
    backgroundColor: 'rgba(0,0,0,0.52)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32,
  },
  restMsg: {
    fontSize: 36, fontWeight: '900', color: WHITE,
    textAlign: 'center', letterSpacing: 0.5,
    includeFontPadding: false,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },

  // Idle overlay
  idleOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: TOP_H * 0.55,
    backgroundColor: 'rgba(0,0,0,0.40)',
    justifyContent: 'center', alignItems: 'center',
    gap: 8,
  },
  idleTitle: {
    fontSize: 28, color: WHITE, fontWeight: '800',
    letterSpacing: 0.5, textAlign: 'center',
    includeFontPadding: false,
  },
  idleBody: {
    fontSize: 18, color: MINT, fontWeight: '500',
    textAlign: 'center', letterSpacing: 0.3, opacity: 0.8,
    includeFontPadding: false,
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// Root
// ══════════════════════════════════════════════════════════════════════════════
export default function SustainedPhonationExercise({ onComplete, onExit, tier = 1 }) {
  const [step, setStep] = useState(STEP_TITLE);

  const handleSkip = onComplete; // skip this exercise = advance to next

  if (step === STEP_TITLE) {
    return <TitleScreen onNext={() => setStep(STEP_DEMO)} onExit={onExit} onSkip={handleSkip} />;
  }
  if (step === STEP_DEMO) {
    return <DemoScreen onFinish={() => setStep(STEP_READY)} onExit={() => setStep(STEP_TITLE)} onSkip={handleSkip} />;
  }
  if (step === STEP_READY) {
    return <ReadyScreen onDone={() => setStep(STEP_EXERCISE)} onSkip={handleSkip} onExit={onExit} />;
  }
  return (
    <ExerciseScreen
      onComplete={onComplete}
      onExit={onExit}
      onShowDemo={() => setStep(STEP_DEMO)}
      onSkip={handleSkip}
      tier={tier}
    />
  );
}
