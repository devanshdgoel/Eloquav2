/**
 * PitchGlidesExercise — dolphin-through-hoops pitch training.
 *
 * Pitch detection: a hidden WebView runs Web Audio API autocorrelation
 * (no native module needed — works in Expo Go). The WebView posts
 * { pitch: Hz, vol: 0-1 } messages at ~80 ms intervals.
 *
 * Flow: Title → Tutorial → Exercise (calibrate 1.5 s → 4 hoops)
 *
 * Exercise mechanics:
 *   - 1.5 s calibration: median of detected Hz becomes the baseline (low).
 *   - Dolphin position = (currentHz - baseline) / PITCH_RANGE_HZ, clamped 0–1.
 *   - Rounds alternate: high → low → high → low (TOTAL_HOOPS times).
 *   - Hold pitch in target zone for HOLD_MS to complete a hoop.
 *   - Vertical orange volume bar mirrors loudness.
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
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Svg, { Ellipse, Path } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CantDoNow from '../../../components/CantDoNow';
import ScreenHeader from '../../../components/ScreenHeader';
import SpeakerButton from '../../../components/SpeakerButton';
import { useHapticFeedback, useLargeText } from '../../../context/PrefsContext';
import { hapticSuccess } from '../../../utils/haptics';

const { width: W, height: H } = Dimensions.get('window');

// ── Scale helpers (Figma frame: 402 × 874) ───────────────────────────────────
const FW = 402;
const FH = 874;
const fs = x => (x * W) / FW;
const fv = y => (y * H) / FH;

// AsyncStorage key — once written, the intro is skipped on all future sessions.
const DEMO_KEY = '@eloqua_pitchglides_demo_seen';

// ── Config ────────────────────────────────────────────────────────────────────
const TOTAL_HOOPS    = 4;
const CALIBRATION_MS = 1500;
const HOLD_MS        = 700;
const PITCH_RANGE_HZ = 100;  // Hz span from baseline low to top of scale
const DEFAULT_BASE   = 130;  // Hz fallback if calibration gathers no samples
const TARGET_LO      = 0.22; // normalised level for "at low hoop"
const TARGET_HI      = 0.78; // normalised level for "at high hoop"
const MIN_PITCH_HZ   = 70;
const MAX_PITCH_HZ   = 600;

// ── Tier configuration (difficulty_tier 1–5) ───────────────────────────────────
// pitchRangeHz: Hz span from calibrated baseline to the top of the scale.
//               Ranges raised significantly (was 40–120 Hz) because the old values
//               were too narrow — a speaker could not glide enough to move the dolphin.
//               A typical conversational male voice spans ~80–250 Hz; female ~160–260 Hz.
//               With a calibrated base of ~130 Hz, a 100 Hz span covers 130–230 Hz,
//               which is achievable with deliberate effort at tier 1.
// holdMs:       milliseconds the pitch must stay in the target zone.
// totalHoops:   number of hoops to complete the exercise.
const PITCH_TIERS = [
  { pitchRangeHz: 100, holdMs:  700, totalHoops: 4 },  // Tier 1: ±50 Hz
  { pitchRangeHz: 130, holdMs:  700, totalHoops: 4 },  // Tier 2: ±65 Hz
  { pitchRangeHz: 160, holdMs:  700, totalHoops: 4 },  // Tier 3: ±80 Hz
  { pitchRangeHz: 190, holdMs:  900, totalHoops: 5 },  // Tier 4: ±95 Hz, one extra hoop
  { pitchRangeHz: 220, holdMs: 1200, totalHoops: 6 },  // Tier 5: ±110 Hz, sustained
];

// ── Colours ───────────────────────────────────────────────────────────────────
const TEAL_DARK  = '#1C4047';
const TEAL_MID   = '#2D6974';
const ORANGE     = '#FFA940';
const WHITE      = '#FFFFFF';
const GREEN_HOOP = '#45B013';

// ── Hoop geometry ─────────────────────────────────────────────────────────────
const HOOP_W  = fs(102);
const HOOP_H  = fv(135);
const HOOP_LL = { x: W * (74  / FW), y: H * (564 / FH) };
const HOOP_UR = { x: W * (305 / FW), y: H * (362 / FH) };

// ── Volume bar geometry ───────────────────────────────────────────────────────
const VBAR_LEFT = fs(35);
const VBAR_TOP  = fv(245);
const VBAR_W    = fs(25);
const VBAR_H    = fv(507);

// ── Dolphin size ──────────────────────────────────────────────────────────────
const DOLPH_W = fs(130);
const DOLPH_H = fv(90);


// ── WebView HTML: Web Audio API autocorrelation pitch detector ────────────────
// Runs entirely in the WebView JS context. Posts { pitch, vol } every ~80 ms.
// pitch = fundamental frequency in Hz, or -1 if silence / undetected.
// vol   = RMS volume normalised to 0–1.
//
// IMPORTANT — deferred start pattern:
// Audio is NOT started automatically on page load. WKWebView (iOS) starts
// AudioContext in 'suspended' state and requires a user-gesture-like trigger
// to resume it. Auto-running on load fails in Expo Go. Instead:
//   1. Page loads → posts { ready: true }
//   2. React Native receives 'ready' → injects window.startPitchDetection()
//   3. This injection acts as the gesture trigger needed by iOS WKWebView.
const PITCH_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body>
<script>
window.startPitchDetection = async function() {
  try {
    var stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false
    });
    window._stream = stream;
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    var ctx = new AudioCtx();
    // Resume suspended context — iOS WKWebView always starts AudioContext
    // in 'suspended' state; calling resume() here is required for audio to flow.
    if (ctx.state === 'suspended') { await ctx.resume(); }
    var src    = ctx.createMediaStreamSource(stream);
    var an     = ctx.createAnalyser();
    an.fftSize = 2048;
    an.smoothingTimeConstant = 0;
    src.connect(an);
    var buf    = new Float32Array(an.fftSize);
    var sr     = ctx.sampleRate;
    var minP   = Math.floor(sr / ${MAX_PITCH_HZ});
    var maxP   = Math.floor(sr / ${MIN_PITCH_HZ});
    window.ReactNativeWebView.postMessage(JSON.stringify({ started: true }));
    setInterval(function () {
      an.getFloatTimeDomainData(buf);
      var n = buf.length;
      // RMS
      var sq = 0;
      for (var i = 0; i < n; i++) sq += buf[i] * buf[i];
      var rms = Math.sqrt(sq / n);
      var vol = Math.min(1, rms * 7);
      // Pitch
      var pitch = -1;
      // Threshold raised from 0.008 to 0.025 so that near-silence (breath noise,
      // light ambient rumble) no longer triggers the autocorrelation path and
      // produces spurious pitch readings that confuse the dolphin position.
      if (rms > 0.025) {
        var cap = Math.min(maxP, Math.floor(n / 2) - 1);
        // Compute autocorrelation for each candidate period
        var acLen = cap - minP + 1;
        var acf = new Float32Array(acLen);
        for (var k = 0; k < acLen; k++) {
          var p = k + minP;
          var sum = 0, len = n - p;
          for (var i = 0; i < len; i++) sum += buf[i] * buf[i + p];
          acf[k] = sum / len;
        }
        // Find first trough then first peak after it
        var d = 0;
        while (d < acLen - 1 && acf[d] > acf[d + 1]) d++;
        var bv = -Infinity, bi = -1;
        for (var i = d; i < acLen; i++) {
          if (acf[i] > bv) { bv = acf[i]; bi = i; }
        }
        if (bv > 0.01 && bi >= 0) {
          var t0 = bi + minP;
          // Parabolic interpolation for sub-sample accuracy
          if (bi > 0 && bi < acLen - 1) {
            var c1 = acf[bi-1], c2 = acf[bi], c3 = acf[bi+1];
            var den = 2*(2*c2 - c1 - c3);
            if (Math.abs(den) > 1e-9) t0 += (c3 - c1) / den;
          }
          pitch = sr / t0;
        }
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({ pitch: pitch, vol: vol }));
    }, 80);
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ error: e.message }));
  }
};
// Signal that the page JS is ready — React Native will inject startPitchDetection().
window.ReactNativeWebView.postMessage(JSON.stringify({ ready: true }));
</script></body></html>`;

// ── FadeIn wrapper ────────────────────────────────────────────────────────────
function FadeIn({ children, duration = 300 }) {
  const op = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(op, { toValue: 1, duration, useNativeDriver: true }).start();
  }, []);
  return <Animated.View style={{ flex: 1, opacity: op }}>{children}</Animated.View>;
}

// ── Bottom wave ───────────────────────────────────────────────────────────────
function BottomWave() {
  const wh = fv(120);
  return (
    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: wh, overflow: 'hidden' }}>
      <Svg width={W} height={wh}>
        <Path
          d={`M0 ${wh*0.44} Q${W*0.25} ${wh*0.10} ${W*0.50} ${wh*0.38} Q${W*0.75} ${wh*0.65} ${W} ${wh*0.32} L${W} ${wh} L0 ${wh} Z`}
          fill="rgba(45,105,116,0.50)"
        />
        <Path
          d={`M0 ${wh*0.60} Q${W*0.30} ${wh*0.34} ${W*0.55} ${wh*0.56} Q${W*0.80} ${wh*0.78} ${W} ${wh*0.52} L${W} ${wh} L0 ${wh} Z`}
          fill="rgba(45,105,116,0.85)"
        />
      </Svg>
    </View>
  );
}

// ── Dual-colour progress bar ──────────────────────────────────────────────────
function DualProgressBar({ done, total }) {
  const barLeft  = fs(81);
  const barWidth = fs(256);
  const fillW    = barWidth * (done / total);
  return (
    <View style={{
      position: 'absolute', top: fv(192), left: barLeft,
      width: barWidth, height: 25, borderRadius: 10,
      backgroundColor: TEAL_MID, overflow: 'hidden', zIndex: 25,
    }}>
      {fillW > 0 && (
        <View style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: fillW, backgroundColor: ORANGE, borderRadius: 10,
        }} />
      )}
    </View>
  );
}

// ── Hoop ellipse ──────────────────────────────────────────────────────────────
function HoopEllipse({ state }) {
  const w = HOOP_W, h = HOOP_H;
  const isTarget = state === 'target';
  return (
    <Svg width={w} height={h}>
      <Ellipse
        cx={w / 2} cy={h / 2} rx={w / 2 - 3} ry={h / 2 - 3}
        stroke={isTarget ? 'rgba(195,222,206,0.92)' : 'rgba(195,222,206,0.26)'}
        strokeWidth={isTarget ? 3.5 : 2.5}
        fill="none"
      />
    </Svg>
  );
}

// ── Button styles ─────────────────────────────────────────────────────────────
const BTN_SZ = 56;
const bs = StyleSheet.create({
  close:        { width: BTN_SZ, height: BTN_SZ, borderRadius: BTN_SZ / 2, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.20)', justifyContent: 'center', alignItems: 'center' },
  closeText:    { color: WHITE, fontSize: 20, fontWeight: '500', includeFontPadding: false, textAlign: 'center', lineHeight: 20 },
  back:         { width: Math.round(fs(76)), height: Math.round(fv(64)), borderRadius: 14, backgroundColor: TEAL_MID, justifyContent: 'center', alignItems: 'center' },
  backText:     { color: WHITE, fontSize: 24, fontWeight: '700', includeFontPadding: false, textAlign: 'center', lineHeight: 24 },
  question:     { width: BTN_SZ, height: BTN_SZ, borderRadius: BTN_SZ / 2, backgroundColor: ORANGE, justifyContent: 'center', alignItems: 'center', shadowColor: ORANGE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 10, elevation: 8 },
  questionText: { color: '#1A1A1A', fontSize: 24, fontWeight: '900', includeFontPadding: false, textAlign: 'center', lineHeight: 24 },
});

// Instruction text for the title screen SpeakerButton — explains what
// Pitch Glides involves before the user starts the tutorial.
const PITCH_GLIDES_INTRO_TEXT =
  "Pitch Glides. Say 'ahh' continuously — your pitch moves the dolphin. " +
  "Glide your voice from low to high to guide the dolphin through each hoop. " +
  "Hold each pitch in the target zone to complete a hoop.";

// ══════════════════════════════════════════════════════════════════════════════
// Title screen
// ══════════════════════════════════════════════════════════════════════════════
function TitleScreen({ onNext, onExit, sessionFill = 0.25 }) {
  return (
    <FadeIn>
      <View style={{ flex: 1, backgroundColor: TEAL_DARK }}>
        <StatusBar barStyle="light-content" />
        {/* Header now rendered by shared ScreenHeader component.
            backIcon is ✕ because this exits the exercise entirely. */}
        <ScreenHeader
          navigation={null}
          title="Pitch Glides"
          backIcon="✕"
          backLabel="Exit exercise"
          onBack={onExit}
          rightAction={<SpeakerButton text={PITCH_GLIDES_INTRO_TEXT} />}
        />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: fv(30) }}>
          <Text style={tts.title}>Pitch{'\n'}Glides</Text>
          <View style={{ marginTop: fv(24), alignItems: 'center' }}>
            <View style={{ position: 'absolute', right: -fs(22), top: fv(8) }}>
              <Svg width={fs(88)} height={fv(112)}>
                <Ellipse cx={fs(44)} cy={fv(56)} rx={fs(40)} ry={fv(52)} stroke={GREEN_HOOP} strokeWidth={4} fill="none" />
              </Svg>
            </View>
            <Image
              source={require('../../../../assets/images/Dolphin2.png')}
              style={{ width: fs(130), height: fv(90), resizeMode: 'contain' }}
            />
          </View>
        </View>
        <TouchableOpacity style={tts.arrowBtn} onPress={onNext} activeOpacity={0.82} accessibilityRole="button" accessibilityLabel="Continue to tutorial">
          <Text style={tts.arrowText}>→</Text>
        </TouchableOpacity>
        <View style={{ position: 'absolute', bottom: fv(29), left: fs(47), width: fs(314), height: 12, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.18)' }}>
          <View style={{ width: `${sessionFill * 100}%`, height: '100%', borderRadius: 13, backgroundColor: ORANGE }} />
        </View>
      </View>
    </FadeIn>
  );
}
const tts = StyleSheet.create({
  title:    { color: WHITE, fontSize: 64, fontWeight: '800', letterSpacing: 3.2, textAlign: 'center', lineHeight: 74 },
  arrowBtn: { alignSelf: 'center', width: Math.round(fs(76)), height: Math.round(fv(64)), borderRadius: 14, backgroundColor: TEAL_MID, justifyContent: 'center', alignItems: 'center', marginBottom: fv(86) },
  arrowText:{ color: WHITE, fontSize: 26, fontWeight: '700', includeFontPadding: false, lineHeight: 26, textAlign: 'center' },
});

// ══════════════════════════════════════════════════════════════════════════════
// Tutorial screen — instruction card (replaces old 3-slide tutorial)
// ══════════════════════════════════════════════════════════════════════════════
const PITCH_INSTR_STEPS = [
  { step: '1', text: 'Say "ahh" continuously — your pitch moves the dolphin.' },
  { step: '2', text: 'Glide your voice from LOW to HIGH to guide the dolphin through each hoop.' },
  { step: '3', text: 'Hold your pitch in the target zone to complete a hoop. Four done = finished!' },
];
const PITCH_INSTR_TEXT =
  "Pitch Glides. Say ahh continuously. Your pitch controls the dolphin. Glide from low to high to guide it through each hoop. Hold your pitch in the target zone to complete a hoop.";

function TutorialScreen({ onFinish, onExit }) {
  return (
    <FadeIn>
      <View style={{ flex: 1, backgroundColor: TEAL_DARK }}>
        <StatusBar barStyle="light-content" />
        <ScreenHeader
          navigation={null}
          title="Instructions"
          backIcon="✕"
          backLabel="Exit exercise"
          onBack={onExit}
          rightAction={<SpeakerButton text={PITCH_INSTR_TEXT} />}
        />
        <Text style={tus.bigTitle} numberOfLines={1} adjustsFontSizeToFit>Pitch Glides</Text>
        <View style={tus.card}>
          {PITCH_INSTR_STEPS.map(({ step, text }) => (
            <View key={step} style={tus.row}>
              <View style={tus.badge}><Text style={tus.badgeNum}>{step}</Text></View>
              <Text style={tus.stepText}>{text}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity
          style={tus.startBtn}
          onPress={onFinish}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Begin exercise"
        >
          <Text style={tus.startText}>Let's Go  →</Text>
        </TouchableOpacity>
      </View>
    </FadeIn>
  );
}

const tus = StyleSheet.create({
  bigTitle: {
    color: WHITE, fontSize: 44, fontWeight: '800',
    textAlign: 'center', letterSpacing: 1.0,
    marginTop: 4, marginBottom: 28, paddingHorizontal: 24,
  },
  card: {
    marginHorizontal: 24, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    padding: 20, gap: 18,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  badge: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: ORANGE,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  badgeNum: { color: '#1A1A1A', fontSize: 16, fontWeight: '800' },
  stepText: {
    flex: 1, color: 'rgba(255,255,255,0.85)',
    fontSize: 17, lineHeight: 24, fontWeight: '400',
  },
  startBtn: {
    alignSelf: 'center', marginTop: 32,
    backgroundColor: ORANGE, borderRadius: 28,
    paddingHorizontal: 40, paddingVertical: 20,
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },
  startText: { color: '#1A1A1A', fontSize: 18, fontWeight: '700', letterSpacing: 0.4 },
});

// ══════════════════════════════════════════════════════════════════════════════
// Exercise screen — real pitch detection via hidden WebView
// ══════════════════════════════════════════════════════════════════════════════
function ExerciseScreen({ onComplete, onExit, onShowDemo, onSkip, tier = 1 }) {
  const { top: safeTop } = useSafeAreaInsets();
  const hapticEnabled = useHapticFeedback();
  const largeText = useLargeText();
  const fs = (n) => largeText ? Math.round(n * 1.25) : n;
  const tierConfig   = PITCH_TIERS[Math.max(0, Math.min(4, tier - 1))];
  const TOTAL_HOOPS  = tierConfig.totalHoops;
  const PITCH_RANGE_HZ = tierConfig.pitchRangeHz;
  const HOLD_MS      = tierConfig.holdMs;
  const [hoopsDone, setHoopsDone] = useState(0);
  const [phase,     setPhase]     = useState('calibrating'); // calibrating|listening|done
  const [pitchHz,   setPitchHz]   = useState(0);
  const [micError,  setMicError]  = useState(false);
  // showHelpOverlay: true when ? is pressed — exercise paused, overlay shown
  const [showHelpOverlay, setShowHelpOverlay] = useState(false);

  const hoopsDoneRef  = useRef(0);
  const webViewRef    = useRef(null);
  const phaseRef      = useRef('calibrating');
  const basePitchRef  = useRef(null);
  const calibSampRef  = useRef([]);
  const holdTimerRef  = useRef(null);
  const inTargetRef   = useRef(false);

  // pitchAnim: 0 = lower-left hoop, 1 = upper-right hoop
  const pitchAnim  = useRef(new Animated.Value(0)).current;
  const volBarAnim = useRef(new Animated.Value(0)).current;

  const dolphinX = pitchAnim.interpolate({ inputRange: [0, 1], outputRange: [HOOP_LL.x, HOOP_UR.x] });
  const dolphinY = pitchAnim.interpolate({ inputRange: [0, 1], outputRange: [HOOP_LL.y, HOOP_UR.y] });

  useEffect(() => {
    const t = setTimeout(finishCalibration, CALIBRATION_MS);
    return () => { clearTimeout(t); clearHoldTimer(); };
  }, []);

  function normalisePitch(hz) {
    const base = basePitchRef.current ?? DEFAULT_BASE;
    return Math.max(0, Math.min(1, (hz - base) / PITCH_RANGE_HZ));
  }

  function finishCalibration() {
    const samples = calibSampRef.current;
    if (samples.length > 0) {
      const sorted = [...samples].sort((a, b) => a - b);
      basePitchRef.current = sorted[Math.floor(sorted.length / 2)];
    } else {
      basePitchRef.current = DEFAULT_BASE;
    }
    calibSampRef.current = [];
    phaseRef.current = 'listening';
    setPhase('listening');
  }

  function clearHoldTimer() {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
  }

  function completeHoop() {
    holdTimerRef.current = null;
    inTargetRef.current  = false;
    const next = hoopsDoneRef.current + 1;
    hoopsDoneRef.current = next;
    setHoopsDone(next);
    if (next >= TOTAL_HOOPS) {
      phaseRef.current = 'done';
      setPhase('done');
      // Stop the getUserMedia stream so the next exercise can claim the mic
      webViewRef.current?.injectJavaScript(`
        try { if (window._stream) { window._stream.getTracks().forEach(function(t){t.stop();}); } } catch(e){}
        true;
      `);
      hapticSuccess(hapticEnabled);
      setTimeout(() => onComplete(100), 1400);
    }
  }

  // Pause exercise and show inline instructions — hoopsDone progress is preserved.
  function showHelp() {
    clearHoldTimer();
    inTargetRef.current = false;
    setShowHelpOverlay(true);
  }

  // Dismiss overlay — the WebView continues receiving pitch data automatically.
  function closeHelp() {
    setShowHelpOverlay(false);
    // Reset hold timer state so a fresh hold can begin
    inTargetRef.current = false;
  }

  // ── WebView message handler ─────────────────────────────────────────────────
  function handleWebViewMessage(e) {
    let data;
    try { data = JSON.parse(e.nativeEvent.data); } catch { return; }

    if (data.error) { setMicError(true); return; }
    // Page JS has loaded — inject the start call so iOS WKWebView receives it
    // as part of a script injection (acts as the gesture-equivalent trigger
    // that allows AudioContext to resume from its initial suspended state).
    if (data.ready) {
      webViewRef.current?.injectJavaScript('window.startPitchDetection(); true;');
      return;
    }

    const { pitch, vol } = data;

    // Volume bar — always update
    Animated.timing(volBarAnim, { toValue: vol, duration: 80, useNativeDriver: false }).start();

    const validPitch = typeof pitch === 'number' && pitch > MIN_PITCH_HZ && pitch < MAX_PITCH_HZ;

    if (phaseRef.current === 'calibrating') {
      if (validPitch) calibSampRef.current.push(pitch);
      return;
    }
    if (phaseRef.current !== 'listening') return;

    if (!validPitch) {
      clearHoldTimer();
      inTargetRef.current = false;
      return;
    }

    setPitchHz(Math.round(pitch));
    const level = normalisePitch(pitch);
    Animated.timing(pitchAnim, { toValue: level, duration: 100, useNativeDriver: false }).start();

    // Even hoopsDone → target is high (UR), odd → low (LL)
    const targetHigh = hoopsDoneRef.current % 2 === 0;
    const inZone     = targetHigh ? level >= TARGET_HI : level <= TARGET_LO;

    if (inZone && !inTargetRef.current) {
      inTargetRef.current  = true;
      holdTimerRef.current = setTimeout(completeHoop, HOLD_MS);
    } else if (!inZone && inTargetRef.current) {
      inTargetRef.current = false;
      clearHoldTimer();
    }
  }

  const targetHigh = hoopsDone % 2 === 0;
  const llState    = phase === 'done' ? 'target' : (targetHigh ? 'dim'    : 'target');
  const urState    = phase === 'done' ? 'target' : (targetHigh ? 'target' : 'dim');

  const promptText =
    micError             ? 'Mic unavailable'    :
    phase === 'done'     ? 'Amazing!'            :
    phase === 'calibrating' ? 'Say "ahh" to start…' :
    pitchHz > 0          ? `${pitchHz} Hz`       :
    "Say 'ahh'…";
  const promptBig = phase === 'done' || (phase === 'listening' && pitchHz > 0);

  return (
    <View style={{ flex: 1, backgroundColor: TEAL_DARK }}>
      <StatusBar barStyle="light-content" />
      <BottomWave />

      {/* Hidden WebView — handles mic + pitch detection */}
      <View style={xs.webviewWrap} pointerEvents="none">
        <WebView
          ref={webViewRef}
          source={{ html: PITCH_HTML, baseUrl: 'https://localhost' }}
          originWhitelist={['*']}
          javaScriptEnabled={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType={Platform.OS === 'ios' ? 'grant' : undefined}
          onMessage={handleWebViewMessage}
          onPermissionRequest={(e) => { e.nativeEvent.grant?.(e.nativeEvent.resources); }}
          onError={() => setMicError(true)}
          onHttpError={() => setMicError(true)}
        />
      </View>

      {/* Mic error fallback — shown when WebView or getUserMedia fails */}
      {micError && (
        <View style={xs.micErrorOverlay}>
          <Text style={xs.micErrorTitle}>Microphone unavailable</Text>
          <Text style={xs.micErrorBody}>
            Allow microphone access in your device settings, then restart the exercise.
          </Text>
          <TouchableOpacity style={xs.micErrorBtn} onPress={onSkip} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Skip this exercise">
            <Text style={xs.micErrorBtnText}>Skip this exercise</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Header */}
      <View style={{ position: 'absolute', top: safeTop + 14, left: fs(14), zIndex: 30 }}>
        <TouchableOpacity style={bs.close} onPress={onExit} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Exit exercise"><Text style={bs.closeText}>✕</Text></TouchableOpacity>
      </View>
      <View style={{ position: 'absolute', top: safeTop + 14, right: fs(14), zIndex: 30 }}>
        <TouchableOpacity style={bs.question} onPress={showHelp} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Show instructions"><Text style={bs.questionText}>?</Text></TouchableOpacity>
      </View>

      <Text style={[exs.prompt, promptBig && exs.promptBig]}>{promptText}</Text>

      <DualProgressBar done={hoopsDone} total={TOTAL_HOOPS} />

      {/* Hoops */}
      <View style={{ position: 'absolute', left: HOOP_LL.x - HOOP_W / 2, top: HOOP_LL.y - HOOP_H / 2 }}>
        <HoopEllipse state={llState} />
      </View>
      <View style={{ position: 'absolute', left: HOOP_UR.x - HOOP_W / 2, top: HOOP_UR.y - HOOP_H / 2 }}>
        <HoopEllipse state={urState} />
      </View>

      {/* Dolphin */}
      <Animated.View style={{
        position: 'absolute',
        transform: [
          { translateX: Animated.subtract(dolphinX, DOLPH_W / 2) },
          { translateY: Animated.subtract(dolphinY, DOLPH_H / 2) },
        ],
        zIndex: 10,
      }}>
        <Image source={require('../../../../assets/images/Dolphin2.png')} style={{ width: DOLPH_W, height: DOLPH_H, resizeMode: 'contain' }} />
      </Animated.View>

      {/* Volume bar */}
      <View style={{ position: 'absolute', left: VBAR_LEFT, top: VBAR_TOP, width: VBAR_W, height: VBAR_H, borderRadius: VBAR_W / 2, backgroundColor: TEAL_MID, overflow: 'hidden', justifyContent: 'flex-end' }}>
        <Animated.View style={{
          width: '100%',
          height: volBarAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          backgroundColor: ORANGE, borderRadius: VBAR_W / 2,
        }} />
      </View>

      <View style={{ position: 'absolute', bottom: fv(16), left: 0, right: 0, alignItems: 'center', zIndex: 20 }}>
        <CantDoNow onSkip={onSkip} onEnd={onExit} />
      </View>

      {/* Help overlay — shown when ? is pressed; hoopsDone count is preserved */}
      {showHelpOverlay && (
        <View style={pgHelp.overlay}>
          <View style={[pgHelp.header, { paddingTop: safeTop + 14 }]}>
            <TouchableOpacity style={pgHelp.closeBtn} onPress={closeHelp} accessibilityRole="button" accessibilityLabel="Close instructions">
              <Text style={pgHelp.closeText}>✕</Text>
            </TouchableOpacity>
            <Text style={pgHelp.headerTitle}>Instructions</Text>
            <SpeakerButton text={PITCH_INSTR_STEPS.map(s => s.text).join('. ')} size={44} />
          </View>
          <Text style={pgHelp.exTitle} numberOfLines={1} adjustsFontSizeToFit>Pitch Glides</Text>
          <View style={pgHelp.card}>
            {PITCH_INSTR_STEPS.map(({ step, text }) => (
              <View key={step} style={pgHelp.row}>
                <View style={pgHelp.badge}><Text style={pgHelp.badgeNum}>{step}</Text></View>
                <Text style={[pgHelp.stepText, { fontSize: fs(17) }]}>{text}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={pgHelp.continueBtn} onPress={closeHelp} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Continue exercise">
            <Text style={[pgHelp.continueText, { fontSize: fs(18) }]}>Continue Exercise  →</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const xs = StyleSheet.create({
  // Visible position at top-left but invisible — iOS suspends JS in fully off-screen WebViews.
  // opacity: 0 causes iOS to skip compositing, so use 0.001 (imperceptible, still rendered).
  webviewWrap: {
    position: 'absolute',
    width: 300,
    height: 300,
    top: 0,
    left: 0,
    opacity: 0.001,
    zIndex: -1,
  },
  micErrorOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: TEAL_DARK,
    alignItems: 'center',
    justifyContent: 'center',
    padding: fs(32),
    zIndex: 50,
  },
  micErrorTitle: {
    color: WHITE,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: fv(12),
    textAlign: 'center',
  },
  micErrorBody: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: fv(32),
  },
  micErrorBtn: {
    backgroundColor: ORANGE,
    paddingHorizontal: fs(28),
    paddingVertical: fv(14),
    borderRadius: 28,
  },
  micErrorBtnText: {
    color: '#1A1A1A',
    fontSize: 17,
    fontWeight: '700',
  },
});

const exs = StyleSheet.create({
  prompt:    { position: 'absolute', top: fv(100), left: 0, right: 0, zIndex: 25, color: WHITE, fontSize: 30, fontWeight: '800', letterSpacing: 1.5, textAlign: 'center' },
  promptBig: { top: fv(137), fontSize: 34, letterSpacing: 1.7 },
});

// Help overlay styles
const pgHelp = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: TEAL_DARK,
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
  closeText: { color: WHITE, fontSize: 22, fontWeight: '600', includeFontPadding: false, textAlign: 'center', lineHeight: 22 },
  headerTitle: {
    flex: 1, color: WHITE, fontSize: 17, fontWeight: '600',
    textAlign: 'center', letterSpacing: 0.3, opacity: 0.75,
  },
  exTitle: {
    color: WHITE, fontSize: 44, fontWeight: '800',
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
    width: 32, height: 32, borderRadius: 16, backgroundColor: ORANGE,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  badgeNum: { color: '#1A1A1A', fontSize: 16, fontWeight: '800' },
  stepText: {
    flex: 1, color: 'rgba(255,255,255,0.85)',
    fontSize: 17, lineHeight: 24, fontWeight: '400',
  },
  continueBtn: {
    alignSelf: 'center', marginTop: 32,
    backgroundColor: ORANGE, borderRadius: 28,
    paddingHorizontal: 40, paddingVertical: 20,
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },
  continueText: { color: '#1A1A1A', fontSize: 18, fontWeight: '700', letterSpacing: 0.4 },
});

// ══════════════════════════════════════════════════════════════════════════════
// Root
// ══════════════════════════════════════════════════════════════════════════════
const STEP_TITLE    = 0;
const STEP_TUTORIAL = 1;
const STEP_EXERCISE = 2;

export default function PitchGlidesExercise({ onComplete, onExit, onSkip, tier = 1, exerciseIndex = 0, totalExercises = 8 }) {
  // null = AsyncStorage check in progress; avoids a one-frame flash to the intro.
  const [step, setStep] = useState(null);
  const sessionFill = totalExercises > 0 ? exerciseIndex / totalExercises : 0;

  useEffect(() => {
    AsyncStorage.getItem(DEMO_KEY)
      .then(val => setStep(val ? STEP_EXERCISE : STEP_TITLE))
      .catch(() => setStep(STEP_TITLE));
  }, []);

  if (step === null) return null;

  if (step === STEP_TITLE)    return <TitleScreen onNext={() => setStep(STEP_TUTORIAL)} onExit={onExit} sessionFill={sessionFill} />;
  if (step === STEP_TUTORIAL) return (
    <TutorialScreen
      onFinish={() => {
        // Mark the intro as seen so future sessions skip straight to the exercise.
        AsyncStorage.setItem(DEMO_KEY, '1').catch(() => {});
        setStep(STEP_EXERCISE);
      }}
      onExit={() => setStep(STEP_TITLE)}
    />
  );
  return (
    <ExerciseScreen
      onComplete={onComplete}
      onExit={onExit}
      onShowDemo={() => setStep(STEP_TUTORIAL)}
      onSkip={onSkip ?? onComplete}
      tier={tier}
    />
  );
}
