/**
 * DolphinVowelsExercise — LSVT LOUD sustained vowel phonation training.
 *
 * Flow: Title → Demo slides → Exercise
 *
 * Exercise mechanics:
 *   - Adaptive threshold calibration (1.5 s ambient sampling), same as
 *     SustainedPhonationExercise.
 *   - 5 rounds, one vowel per round: A → E → I → O → U.
 *   - Current vowel shown in very large text. User holds the vowel loudly
 *     and clearly for MIN_HOLD_MS (1500 ms) above the adaptive threshold.
 *   - The dolphin swims left-to-right; after each completed vowel it animates
 *     forward through the corresponding coloured hoop.
 *   - If volume drops below threshold mid-hold, the hold timer resets.
 *   - After all 5 vowels the dolphin exits to the right and onComplete fires.
 *   - Idle for 8 s with no speech → gentle encouragement overlay for 3 s.
 *   - Orange vertical volume bar on the left shows real-time loudness.
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
  Image,
} from 'react-native';
import { Audio } from 'expo-av';
import Svg, { Ellipse, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import CantDoNow from '../../../components/CantDoNow';

const { width: W, height: H } = Dimensions.get('window');

// ── Steps ─────────────────────────────────────────────────────────────────────
const STEP_TITLE    = 0;
const STEP_DEMO     = 1;
const STEP_EXERCISE = 2;

// ── Config ────────────────────────────────────────────────────────────────────
const VOWELS         = ['A', 'E', 'I', 'O', 'U'];
const VOWEL_COLORS   = ['#FF6B6B', '#FF9A3D', '#FFD93D', '#6BCB77', '#4ECDC4'];
const MIN_HOLD_MS    = 1500;   // must sustain above threshold for this long
const CALIBRATION_MS = 1500;   // ambient noise sampling window
const MIN_THRESHOLD  = 0.30;
const MAX_THRESHOLD  = 0.70;
const BAR_INTERVAL_MS = 80;    // mic polling & volume bar refresh interval
const IDLE_WARN_MS   = 8000;   // no speech for this long → show encouragement
const IDLE_HIDE_MS   = 3000;   // how long encouragement stays visible
const TRAVEL_MS      = 700;    // dolphin swim animation per hoop

// ── Layout ────────────────────────────────────────────────────────────────────
// The dolphin scene occupies the bottom portion of the exercise screen.
// Hoops are vertical rings (tall narrow ellipses) at staggered heights.
const SCENE_BASE_Y = H * 0.65;  // baseline Y for hoop centres
const HOOP_RX     = 14;         // narrow (vertical ring appearance)
const HOOP_RY     = 46;         // tall
// Per-hoop Y offsets from SCENE_BASE_Y — creates visual variety
const HOOP_Y_OFFSETS = [12, -22, 8, -30, 0];
function hoopCY(idx) { return SCENE_BASE_Y + HOOP_Y_OFFSETS[idx]; }
// 5 hoops evenly spaced across the width with a small margin on each side
const HOOP_MARGIN = 42;
const HOOP_SPACING = (W - HOOP_MARGIN * 2) / (VOWELS.length - 1);
function hoopCX(idx) { return HOOP_MARGIN + idx * HOOP_SPACING; }

// Dolphin image is 60 × 40 logical pixels
const DOLPHIN_W = 70;
const DOLPHIN_H = 46;

// Dolphin X positions: starts off left, moves to each hoop, then exits right
const DOLPHIN_START_X = -DOLPHIN_W - 10;
const DOLPHIN_EXIT_X  = W + 20;
function dolphinTargetX(vowelIndex) {
  // Centre the dolphin on the corresponding hoop
  return hoopCX(vowelIndex) - DOLPHIN_W / 2;
}
// Build full interpolation: position 0 = start, 1-5 = hoops, 6 = exit
const DOLPHIN_INPUT_RANGE = [0, 1, 2, 3, 4, 5, 6];
const DOLPHIN_OUTPUT_X    = [
  DOLPHIN_START_X,
  dolphinTargetX(0),
  dolphinTargetX(1),
  dolphinTargetX(2),
  dolphinTargetX(3),
  dolphinTargetX(4),
  DOLPHIN_EXIT_X,
];

// ── Colours ───────────────────────────────────────────────────────────────────
const DARK_TEAL      = '#1C4047';
const INSTRUCTION_BG = '#1C3242';
const ORANGE         = '#FFA940';
const WHITE          = '#FFFFFF';

// ── Volume bar geometry ───────────────────────────────────────────────────────
const VOL_BAR_X = 18;
const VOL_BAR_W = 10;
const VOL_BAR_H = H * 0.28;
const VOL_BAR_TOP = H * 0.30;

// ══════════════════════════════════════════════════════════════════════════════
// Shared primitives
// ══════════════════════════════════════════════════════════════════════════════

/** Smooth fade-in wrapper — every screen mounts with a gentle opacity fade. */
function FadeIn({ children, duration = 340 }) {
  const op = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(op, { toValue: 1, duration, useNativeDriver: true }).start();
  }, []);
  return <Animated.View style={{ flex: 1, opacity: op }}>{children}</Animated.View>;
}

// Button size — identical across all exercise screens in the app
const BTN = 56;

const hb = StyleSheet.create({
  ghost: {
    width: BTN, height: BTN, borderRadius: BTN / 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center', alignItems: 'center',
  },
  ghostText: {
    color: WHITE, fontSize: 20, fontWeight: '500',
    includeFontPadding: false, textAlign: 'center', lineHeight: 20,
  },
  orange: {
    width: BTN, height: BTN, borderRadius: BTN / 2,
    backgroundColor: ORANGE,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },
  orangeText: {
    color: '#1A1A1A', fontSize: 24, fontWeight: '900',
    includeFontPadding: false, textAlign: 'center', lineHeight: 24,
  },
});

/** Amber "INSTRUCTIONS" pill — shown on title and demo slides. */
function InstructionsBadge() {
  return (
    <View style={badge.pill}>
      <Text style={badge.text}>INSTRUCTIONS</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  pill: {
    backgroundColor: ORANGE, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 6,
    alignSelf: 'center', marginTop: 12,
  },
  text: {
    color: '#1A1A1A', fontSize: 16, fontWeight: '800', letterSpacing: 0.8,
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// STEP_TITLE — Title screen
// ══════════════════════════════════════════════════════════════════════════════
function TitleScreen({ onNext, onExit }) {
  return (
    <FadeIn>
      <View style={{ flex: 1, backgroundColor: DARK_TEAL }}>
        <StatusBar barStyle="light-content" />

        {/* Header */}
        <View style={{ paddingTop: 56, paddingHorizontal: 20 }}>
          <TouchableOpacity style={hb.ghost} onPress={onExit} accessibilityRole="button" accessibilityLabel="Exit exercise">
            <Text style={hb.ghostText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Title */}
        <Text style={ts.title}>Dolphin{'\n'}Vowels</Text>

        {/* Vowel previews + dolphin hint */}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 28 }}>
          {/* Dolphin image centred */}
          <Image
            source={require('../../../../assets/images/Dolphin2.png')}
            style={{ width: 140, height: 92, resizeMode: 'contain' }}
          />
          {/* Five coloured vertical hoop previews */}
          <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center' }}>
            {VOWELS.map((v, i) => (
              <View key={i} style={{ alignItems: 'center', gap: 8 }}>
                <Svg width={40} height={72}>
                  <Ellipse
                    cx={20} cy={36}
                    rx={14} ry={30}
                    stroke={VOWEL_COLORS[i]} strokeWidth={4} fill="none"
                  />
                </Svg>
                <Text style={{ color: VOWEL_COLORS[i], fontSize: 16, fontWeight: '800' }}>
                  {v}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Continue button */}
        <TouchableOpacity style={ts.arrowBtn} onPress={onNext} activeOpacity={0.8}
          accessibilityRole="button" accessibilityLabel="Continue to instructions">
          <Text style={ts.arrowText}>→</Text>
        </TouchableOpacity>

        <View style={{ height: 64 }} />
      </View>
    </FadeIn>
  );
}

const ts = StyleSheet.create({
  title: {
    color: WHITE, fontSize: 52, fontWeight: '800',
    letterSpacing: 1.5, textAlign: 'center',
    marginTop: 28, lineHeight: 62,
  },
  arrowBtn: {
    alignSelf: 'center',
    width: 80, height: 62, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center', alignItems: 'center',
  },
  arrowText: {
    color: WHITE, fontSize: 26,
    includeFontPadding: false, lineHeight: 26, textAlign: 'center',
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// STEP_DEMO — Instruction slides (3 slides)
// ══════════════════════════════════════════════════════════════════════════════
const SLIDES = [
  {
    heading: "Say each vowel\nloudly and clearly",
    body: "A, E, I, O, U. Guide the\ndolphin through the hoops!",
  },
  {
    heading: "Hold for 2\nseconds",
    body: "Keep your voice loud and\nsteady. The dolphin moves!",
  },
  {
    heading: "THINK\nLOUD",
    body: "Big, full voice. Make your\ndolphin swim!",
  },
];

function DemoScreen({ onFinish, onExit }) {
  const [slide, setSlide] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  function go(next) {
    Animated.timing(fadeAnim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
      setSlide(next);
      Animated.timing(fadeAnim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    });
  }

  function next() { if (slide < SLIDES.length - 1) go(slide + 1); else onFinish(); }
  function back() { if (slide > 0) go(slide - 1); else onExit(); }

  const s = SLIDES[slide];

  return (
    <FadeIn>
      <View style={{ flex: 1, backgroundColor: INSTRUCTION_BG }}>
        <StatusBar barStyle="light-content" />

        {/* Header */}
        <View style={{ paddingTop: 56, paddingHorizontal: 20 }}>
          <TouchableOpacity style={hb.ghost} onPress={back} accessibilityRole="button" accessibilityLabel="Go back">
            <Text style={hb.ghostText}>←</Text>
          </TouchableOpacity>
        </View>

        <InstructionsBadge />

        {/* Slide content */}
        <Animated.View style={{
          flex: 1, justifyContent: 'center', alignItems: 'center',
          opacity: fadeAnim, paddingHorizontal: 36,
        }}>
          {/* Dolphin image on every slide */}
          <Image
            source={require('../../../../assets/images/Dolphin2.png')}
            style={{ width: 110, height: 72, resizeMode: 'contain', marginBottom: 28 }}
          />
          <Text style={dm.heading}>{s.heading}</Text>
          <Text style={dm.body}>{s.body}</Text>
        </Animated.View>

        {/* Footer: dots + next button */}
        <View style={dm.footer}>
          <View style={dm.dots}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[dm.dot, i === slide && dm.dotActive]} />
            ))}
          </View>
          <TouchableOpacity style={dm.nextBtn} onPress={next} activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel={slide < SLIDES.length - 1 ? 'Next slide' : 'Start exercise'}>
            <Text style={dm.nextText}>{slide < SLIDES.length - 1 ? '→' : '✓'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </FadeIn>
  );
}

const dm = StyleSheet.create({
  heading: {
    color: WHITE, fontSize: 34, fontWeight: '800',
    textAlign: 'center', lineHeight: 44, letterSpacing: 0.4,
  },
  body: {
    color: 'rgba(255,255,255,0.70)', fontSize: 18,
    textAlign: 'center', lineHeight: 28, marginTop: 16,
  },
  footer: {
    paddingHorizontal: 40, paddingBottom: 52,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dots:      { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.26)' },
  dotActive: { backgroundColor: WHITE, width: 24, borderRadius: 4 },
  nextBtn: {
    width: 64, height: 56, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center', alignItems: 'center',
  },
  nextText: {
    color: WHITE, fontSize: 22,
    includeFontPadding: false, lineHeight: 22, textAlign: 'center',
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// STEP_EXERCISE — The main game screen
// ══════════════════════════════════════════════════════════════════════════════

/**
 * ExerciseScreen
 *
 * Phases:
 *   calibrating  — 1.5 s ambient sampling; threshold computed at the end
 *   listening    — mic open, waiting for voice above adaptive threshold
 *   holding      — voice detected; counting toward MIN_HOLD_MS
 *   done         — all 5 vowels completed
 */
function ExerciseScreen({ onComplete, onExit, onShowDemo, onSkip }) {
  // Which vowel (0-4) is current; -1 means not yet started
  const [vowelIndex, setVowelIndex] = useState(0);
  // How many vowels have been successfully completed
  const [doneCt,     setDoneCt]     = useState(0);
  const [phase,      setPhase]      = useState('calibrating');
  const [volume,     setVolume]     = useState(0);
  const [hintText,   setHintText]   = useState('Listening to room...');
  // Fractional progress (0-1) toward the current hold target — drives progress ring
  const [holdFrac,   setHoldFrac]   = useState(0);
  // Idle encouragement overlay visibility
  const [showIdle,   setShowIdle]   = useState(false);

  // Refs — kept current across async callbacks & timers
  const phaseRef          = useRef('calibrating');
  const vowelIndexRef     = useRef(0);
  const doneCtRef         = useRef(0);
  const volumeRef         = useRef(0);
  const adaptiveThreshRef = useRef(MIN_THRESHOLD);
  const ambientSamplesRef = useRef([]);

  const recordingRef      = useRef(null);
  const barTimerRef       = useRef(null);       // volume bar refresh interval
  const calibrateTimerRef = useRef(null);
  const holdStartRef      = useRef(null);       // timestamp when current hold began
  const holdCheckRef      = useRef(null);       // interval that checks hold progress
  const idleTimerRef      = useRef(null);       // idle warning timer
  const idleHideRef       = useRef(null);       // timer to hide idle overlay

  // Animated values
  const volBarAnim      = useRef(new Animated.Value(0)).current;
  const dolphinProgress = useRef(new Animated.Value(0)).current; // 0→6 across the 5 hoops + exit
  const idleOpacity     = useRef(new Animated.Value(0)).current;

  // Derived animated dolphin X position
  const dolphinX = dolphinProgress.interpolate({
    inputRange:  DOLPHIN_INPUT_RANGE,
    outputRange: DOLPHIN_OUTPUT_X,
  });
  // Dolphin Y animates to each hoop's centre as it swims through
  const DOLPHIN_OUTPUT_Y = [
    hoopCY(0) - DOLPHIN_H / 2 - 4,  // start near first hoop
    hoopCY(0) - DOLPHIN_H / 2 - 4,
    hoopCY(1) - DOLPHIN_H / 2 - 4,
    hoopCY(2) - DOLPHIN_H / 2 - 4,
    hoopCY(3) - DOLPHIN_H / 2 - 4,
    hoopCY(4) - DOLPHIN_H / 2 - 4,
    hoopCY(4) - DOLPHIN_H / 2 - 4,  // exit at last hoop height
  ];
  const dolphinY = dolphinProgress.interpolate({
    inputRange:  DOLPHIN_INPUT_RANGE,
    outputRange: DOLPHIN_OUTPUT_Y,
  });

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  useEffect(() => {
    openMic();
    return () => cleanupAll();
  }, []);

  // Volume bar refresh — runs independently of phase changes
  useEffect(() => {
    barTimerRef.current = setInterval(() => {
      const v = volumeRef.current;
      setVolume(v);
      Animated.timing(volBarAnim, { toValue: v, duration: BAR_INTERVAL_MS, useNativeDriver: false }).start();
    }, BAR_INTERVAL_MS);
    return () => clearInterval(barTimerRef.current);
  }, []);

  // ── Idle encouragement timer ────────────────────────────────────────────────
  function resetIdleTimer() {
    if (idleTimerRef.current)  { clearTimeout(idleTimerRef.current);  idleTimerRef.current  = null; }
    if (idleHideRef.current)   { clearTimeout(idleHideRef.current);   idleHideRef.current   = null; }
    // Fade out overlay immediately if it was showing
    Animated.timing(idleOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setShowIdle(false));

    // Schedule the next idle warning
    idleTimerRef.current = setTimeout(showIdleWarning, IDLE_WARN_MS);
  }

  function showIdleWarning() {
    setShowIdle(true);
    Animated.timing(idleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    idleHideRef.current = setTimeout(() => {
      Animated.timing(idleOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => setShowIdle(false));
    }, IDLE_HIDE_MS);
  }

  // ── Mic setup ───────────────────────────────────────────────────────────────
  async function openMic() {
    ambientSamplesRef.current = [];
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        {
          android: Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
          ios:     Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
          web:     {},
          isMeteringEnabled: true,
        },
        onMeter,
        BAR_INTERVAL_MS,
      );
      recordingRef.current = recording;
      calibrateTimerRef.current = setTimeout(finishCalibration, CALIBRATION_MS);
    } catch (_) {
      // Mic unavailable — fall back to default threshold and start immediately
      adaptiveThreshRef.current = MIN_THRESHOLD;
      transitionToListening();
    }
  }

  function finishCalibration() {
    calibrateTimerRef.current = null;
    const samples = ambientSamplesRef.current;
    if (samples.length > 0) {
      const sorted = [...samples].sort((a, b) => a - b);
      const p90 = sorted[Math.floor(sorted.length * 0.90)] ?? MIN_THRESHOLD;
      // Threshold = p90 × 1.6 + 0.12, clamped to [MIN, MAX]
      adaptiveThreshRef.current = Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, p90 * 1.6 + 0.12));
    }
    ambientSamplesRef.current = [];
    transitionToListening();
  }

  function transitionToListening() {
    phaseRef.current = 'listening';
    setPhase('listening');
    const v = VOWELS[vowelIndexRef.current];
    setHintText(`Say  ${v}  clearly and loudly`);
    resetIdleTimer();
  }

  // ── Meter callback ───────────────────────────────────────────────────────────
  function onMeter(status) {
    if (!status.isRecording) return;
    const db  = status.metering ?? -160;
    const vol = Math.min(1, Math.max(0, (db + 70) / 60));
    volumeRef.current = vol;

    if (phaseRef.current === 'calibrating') {
      ambientSamplesRef.current.push(vol);
      return;
    }

    if (phaseRef.current === 'listening' && vol >= adaptiveThreshRef.current) {
      // Voice started — begin hold countdown
      beginHold();
      return;
    }

    if (phaseRef.current === 'holding') {
      if (vol < adaptiveThreshRef.current) {
        // Voice dropped — reset the hold
        cancelHold();
      }
      // (if still above threshold the hold interval handles completion)
    }
  }

  // ── Hold logic ───────────────────────────────────────────────────────────────
  function beginHold() {
    if (phaseRef.current !== 'listening') return;
    phaseRef.current = 'holding';
    setPhase('holding');
    holdStartRef.current = Date.now();
    // Clear idle timer while user is speaking
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    if (idleHideRef.current)  { clearTimeout(idleHideRef.current);  idleHideRef.current  = null; }
    Animated.timing(idleOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setShowIdle(false));

    const v = VOWELS[vowelIndexRef.current];
    setHintText(`Holding  ${v}...`);

    // Poll every 50 ms to update the progress ring and detect completion
    holdCheckRef.current = setInterval(() => {
      if (phaseRef.current !== 'holding') {
        clearInterval(holdCheckRef.current);
        holdCheckRef.current = null;
        return;
      }
      const elapsed = Date.now() - holdStartRef.current;
      const frac = Math.min(1, elapsed / MIN_HOLD_MS);
      setHoldFrac(frac);
      if (frac >= 1) {
        clearInterval(holdCheckRef.current);
        holdCheckRef.current = null;
        completeVowel();
      }
    }, 50);
  }

  function cancelHold() {
    if (phaseRef.current !== 'holding') return;
    if (holdCheckRef.current) { clearInterval(holdCheckRef.current); holdCheckRef.current = null; }
    phaseRef.current = 'listening';
    setPhase('listening');
    setHoldFrac(0);
    const v = VOWELS[vowelIndexRef.current];
    setHintText(`Say  ${v}  clearly and loudly`);
    resetIdleTimer();
  }

  // ── Vowel completed ──────────────────────────────────────────────────────────
  function completeVowel() {
    phaseRef.current = 'flying';
    setPhase('flying');
    setHoldFrac(0);
    setHintText('');

    const completedIndex = vowelIndexRef.current;
    const nextProgress   = completedIndex + 1; // dolphinProgress target (1-5)

    // Animate dolphin to the just-completed hoop position
    Animated.timing(dolphinProgress, {
      toValue:  nextProgress,
      duration: TRAVEL_MS,
      useNativeDriver: false,
    }).start(() => {
      const nextVowelIndex = completedIndex + 1;

      if (nextVowelIndex >= VOWELS.length) {
        // All 5 vowels done — dolphin exits to the right
        setHintText('Amazing!');
        Animated.timing(dolphinProgress, {
          toValue:  VOWELS.length + 1, // position 6 = off-screen right
          duration: TRAVEL_MS + 200,
          useNativeDriver: false,
        }).start(() => {
          phaseRef.current = 'done';
          setPhase('done');
          setTimeout(onComplete, 800);
        });
        return;
      }

      // Advance to next vowel
      vowelIndexRef.current = nextVowelIndex;
      doneCtRef.current     = nextVowelIndex;
      setVowelIndex(nextVowelIndex);
      setDoneCt(nextVowelIndex);
      transitionToListening();
    });
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  async function cleanupAll() {
    if (barTimerRef.current)       { clearInterval(barTimerRef.current);    barTimerRef.current    = null; }
    if (calibrateTimerRef.current) { clearTimeout(calibrateTimerRef.current); calibrateTimerRef.current = null; }
    if (holdCheckRef.current)      { clearInterval(holdCheckRef.current);   holdCheckRef.current   = null; }
    if (idleTimerRef.current)      { clearTimeout(idleTimerRef.current);    idleTimerRef.current   = null; }
    if (idleHideRef.current)       { clearTimeout(idleHideRef.current);     idleHideRef.current    = null; }
    try {
      if (recordingRef.current) { await recordingRef.current.stopAndUnloadAsync(); recordingRef.current = null; }
    } catch (_) {}
  }

  // ── Derived display values ───────────────────────────────────────────────────
  const isAboveThresh  = volume >= adaptiveThreshRef.current;
  const currentVowel   = VOWELS[vowelIndex] ?? 'U';
  const currentColor   = VOWEL_COLORS[vowelIndex] ?? VOWEL_COLORS[4];

  return (
    <View style={{ flex: 1, backgroundColor: DARK_TEAL }}>
      <StatusBar barStyle="light-content" />

      {/* ── Header buttons ─────────────────────────────────────────────────── */}
      <View style={{ position: 'absolute', top: 52, left: 20, zIndex: 20 }}>
        <TouchableOpacity style={hb.ghost} onPress={onExit} accessibilityRole="button" accessibilityLabel="Exit exercise">
          <Text style={hb.ghostText}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={{ position: 'absolute', top: 52, right: 20, zIndex: 20 }}>
        <TouchableOpacity style={hb.orange} onPress={onShowDemo} accessibilityRole="button" accessibilityLabel="Show instructions">
          <Text style={hb.orangeText}>?</Text>
        </TouchableOpacity>
      </View>

      {/* ── Calibration notice ─────────────────────────────────────────────── */}
      {phase === 'calibrating' && (
        <View style={{ position: 'absolute', top: 118, left: 0, right: 0, alignItems: 'center', zIndex: 10 }}>
          <Text style={ex.hintText}>Listening to room...</Text>
          <Text style={ex.subHint}>Calibrating microphone</Text>
        </View>
      )}

      {/* ── Current vowel — large centred display ──────────────────────────── */}
      {phase !== 'calibrating' && phase !== 'done' && (
        <View style={ex.vowelWrap}>
          {/* Circular progress ring around the vowel during holding */}
          {phase === 'holding' && (
            <View style={ex.ringContainer}>
              <Svg width={160} height={160} style={StyleSheet.absoluteFill}>
                {/* Background track */}
                <Circle
                  cx={80} cy={80} r={72}
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth={6}
                  fill="none"
                />
                {/* Progress arc */}
                <Circle
                  cx={80} cy={80} r={72}
                  stroke={currentColor}
                  strokeWidth={6}
                  fill="none"
                  strokeDasharray={2 * Math.PI * 72}
                  strokeDashoffset={2 * Math.PI * 72 * (1 - holdFrac)}
                  strokeLinecap="round"
                  transform="rotate(-90 80 80)"
                />
              </Svg>
            </View>
          )}

          <Text style={[ex.vowelText, { color: currentColor }]}>{currentVowel}</Text>
        </View>
      )}

      {/* ── Hint text below vowel ───────────────────────────────────────────── */}
      {phase !== 'calibrating' && phase !== 'done' && (
        <View style={{ alignItems: 'center', marginTop: 4 }}>
          <Text style={ex.hintText}>{hintText}</Text>
        </View>
      )}

      {/* ── Done message ─────────────────────────────────────────────────────── */}
      {phase === 'done' && (
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={ex.doneText}>Amazing!</Text>
        </View>
      )}

      {/* ── Dolphin scene ──────────────────────────────────────────────────── */}

      {/* 5 vertical hoops at different heights */}
      {VOWELS.map((v, i) => {
        const cx   = hoopCX(i);
        const cy   = hoopCY(i);
        const done = i < doneCt;
        const isCurrent = i === vowelIndex;
        return (
          <Svg
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: cx - HOOP_RX - 6,
              top:  cy - HOOP_RY - 6,
            }}
            width={(HOOP_RX + 6) * 2}
            height={(HOOP_RY + 6) * 2}
          >
            <Ellipse
              cx={HOOP_RX + 6} cy={HOOP_RY + 6}
              rx={HOOP_RX} ry={HOOP_RY}
              stroke={done ? '#64C882' : VOWEL_COLORS[i]}
              strokeWidth={done ? 3 : isCurrent ? 5 : 3.5}
              fill={done ? 'rgba(100,200,130,0.12)' : `${VOWEL_COLORS[i]}22`}
              opacity={done ? 1 : isCurrent ? 1 : 0.50}
            />
          </Svg>
        );
      })}

      {/* Vowel letter labels above each hoop */}
      {VOWELS.map((v, i) => {
        const cx   = hoopCX(i);
        const cy   = hoopCY(i);
        const done = i < doneCt;
        return (
          <Text key={`lbl-${i}`} pointerEvents="none" style={{
            position: 'absolute',
            left:  cx - 11,
            top:   cy - HOOP_RY - 28,
            color: done ? '#64C882' : 'rgba(255,255,255,0.55)',
            fontSize: 16, fontWeight: '800',
          }}>
            {done ? '✓' : v}
          </Text>
        );
      })}

      {/* Dolphin image — animated both horizontally and vertically */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          transform: [{ translateX: dolphinX }, { translateY: dolphinY }],
        }}
      >
        <Image
          source={require('../../../../assets/images/Dolphin2.png')}
          style={{ width: DOLPHIN_W, height: DOLPHIN_H, resizeMode: 'contain' }}
        />
      </Animated.View>

      {/* ── Vertical volume bar — left side ───────────────────────────────── */}
      {/* Track */}
      <View style={{
        position: 'absolute',
        left: VOL_BAR_X,
        top:  VOL_BAR_TOP,
        width: VOL_BAR_W, height: VOL_BAR_H,
        borderRadius: VOL_BAR_W / 2,
        backgroundColor: 'rgba(255,255,255,0.12)',
        overflow: 'hidden',
        justifyContent: 'flex-end',
      }}>
        {/* Fill — orange when above threshold, dim white otherwise */}
        <Animated.View style={{
          width: '100%',
          height: volBarAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          backgroundColor: isAboveThresh ? ORANGE : 'rgba(255,255,255,0.35)',
          borderRadius: VOL_BAR_W / 2,
        }} />
      </View>
      {/* Threshold line on volume bar */}
      <View style={{
        position: 'absolute',
        left:   VOL_BAR_X - 3,
        top:    VOL_BAR_TOP + VOL_BAR_H - VOL_BAR_H * adaptiveThreshRef.current - 2,
        width:  VOL_BAR_W + 6,
        height: 2,
        backgroundColor: 'rgba(255,169,64,0.60)',
        borderRadius: 1,
      }} />

      {/* ── Dual-colour progress bar at very bottom ────────────────────────── */}
      <View style={ex.barTrack}>
        <View style={[ex.barDone,   { width: `${(doneCt / VOWELS.length) * 100}%` }]} />
        <View style={[ex.barRemain, { width: `${((VOWELS.length - doneCt) / VOWELS.length) * 100}%` }]} />
      </View>

      {/* ── Can't do now ──────────────────────────────────────────────────── */}
      <View style={{ position: 'absolute', bottom: 20, left: 0, right: 0, alignItems: 'center', zIndex: 15 }}>
        <CantDoNow onSkip={onSkip} onEnd={onExit} />
      </View>

      {/* ── Idle encouragement overlay ─────────────────────────────────────── */}
      {showIdle && (
        <Animated.View
          pointerEvents="none"
          style={[ex.idleOverlay, { opacity: idleOpacity }]}
        >
          <Text style={ex.idleText}>{'Take your time.\nYou\'ve got this!'}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const ex = StyleSheet.create({
  vowelWrap: {
    marginTop: 100,
    alignItems: 'center',
    justifyContent: 'center',
    height: 160,
  },
  // Container sized to match the SVG ring so the ring sits exactly behind the vowel letter
  ringContainer: {
    position: 'absolute',
    width: 160, height: 160,
  },
  vowelText: {
    fontSize: 120, fontWeight: '900',
    includeFontPadding: false, textAlign: 'center', lineHeight: 130,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 16,
  },
  hintText: {
    color: 'rgba(255,255,255,0.80)', fontSize: 20, fontWeight: '700',
    letterSpacing: 0.4, textAlign: 'center',
    includeFontPadding: false,
  },
  subHint: {
    color: 'rgba(255,255,255,0.55)', fontSize: 16, marginTop: 4,
    letterSpacing: 0.3, textAlign: 'center',
  },
  doneText: {
    color: WHITE, fontSize: 56, fontWeight: '900',
    textAlign: 'center', lineHeight: 72,
  },
  barTrack: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 8, flexDirection: 'row',
  },
  barDone: {
    height: '100%',
    backgroundColor: ORANGE,
  },
  barRemain: {
    height: '100%',
    backgroundColor: '#3D9DAA',
  },
  idleOverlay: {
    position: 'absolute',
    left: 0, right: 0,
    top: H * 0.35,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 28,
    marginHorizontal: 28,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignSelf: 'center',
  },
  idleText: {
    color: WHITE, fontSize: 28, fontWeight: '700',
    textAlign: 'center', lineHeight: 40,
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// Root — step router
// ══════════════════════════════════════════════════════════════════════════════
export default function DolphinVowelsExercise({ onComplete, onExit }) {
  const [step, setStep] = useState(STEP_TITLE);

  if (step === STEP_TITLE) {
    return (
      <TitleScreen
        onNext={() => setStep(STEP_DEMO)}
        onExit={onExit}
      />
    );
  }
  if (step === STEP_DEMO) {
    return (
      <DemoScreen
        onFinish={() => setStep(STEP_EXERCISE)}
        onExit={() => setStep(STEP_TITLE)}
      />
    );
  }
  return (
    <ExerciseScreen
      onComplete={onComplete}
      onExit={onExit}
      onShowDemo={() => setStep(STEP_DEMO)}
      onSkip={onComplete}
    />
  );
}
