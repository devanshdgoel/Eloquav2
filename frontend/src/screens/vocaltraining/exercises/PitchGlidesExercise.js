/**
 * PitchGlidesExercise — dolphin-through-hoops voice-effort training.
 *
 * Detection: expo-av metering (no WebView, no native pitch library).
 * The dolphin position maps to the user's normalised voice level:
 *   gentle voice → lower-left hoop, strong voice → upper-right hoop.
 *
 * Flow: Tutorial → Exercise (calibrate 1.5 s → 4 hoops)
 *
 * Exercise mechanics:
 *   - 1.5 s calibration: ambient noise sampled → adaptive threshold set.
 *   - normVol 0–1 = how far above ambient the user is speaking.
 *   - Rounds alternate: LOW effort → HIGH effort → LOW → HIGH (TOTAL_HOOPS times).
 *     Starting LOW builds confidence before asking for a strong voice.
 *   - Hold normalised level in target zone for HOLD_MS to complete a hoop.
 *   - Vertical orange volume bar mirrors current voice level.
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
import { Audio } from 'expo-av';
import { WebView } from 'react-native-webview';
import Svg, { Ellipse, Path } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CantDoNow from '../../../components/CantDoNow';
import ScreenHeader from '../../../components/ScreenHeader';
import SpeakerButton from '../../../components/SpeakerButton';
import { useHapticFeedback, useLargeText } from '../../../context/PrefsContext';
import { hapticSuccess } from '../../../utils/haptics';
import { fetchWithAuth } from '../../../utils/authHeaders';
import { API_BASE_URL } from '../../../config/env';

const { width: W, height: H } = Dimensions.get('window');

// ── Scale helpers (Figma frame: 402 × 874) ───────────────────────────────────
const FW = 402;
const FH = 874;
const fs = x => (x * W) / FW;
const fv = y => (y * H) / FH;

// AsyncStorage key — once written, the intro is skipped on all future sessions.
const DEMO_KEY = '@eloqua_pitchglides_demo_seen';

// ── Config ────────────────────────────────────────────────────────────────────
const CALIBRATION_MS = 1500;
// Normalised voice-level zones (0 = silence, 1 = maximum expected phonation).
// The dolphin moves to the lower-left hoop when in the GENTLE zone
// and to the upper-right hoop when in the STRONG zone.
const TARGET_LO_MIN  = 0.10; // gentle zone floor
const TARGET_LO_MAX  = 0.44; // gentle zone ceiling
const TARGET_HI_MIN  = 0.66; // strong zone floor (above this = top hoop)

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

// Instruction text for the title screen SpeakerButton.
// iOS: WebView cannot access the mic in real-time so the dolphin follows vocal EFFORT (loud/soft).
// Android: Web Audio autocorrelation tracks actual pitch in real-time.
const PITCH_GLIDES_INTRO_TEXT = Platform.OS === 'android'
  ? "Pitch Glides. Say 'ahh' and glide your pitch from low to high. The dolphin follows your pitch through each hoop. Hold in the target zone to complete a hoop."
  : "Pitch Glides. Say 'ahh' — speak SOFTLY for the lower hoop and LOUDLY for the upper hoop. The dolphin follows your voice. Your pitch range is measured automatically after you finish.";

// ══════════════════════════════════════════════════════════════════════════════
// Title screen
// ══════════════════════════════════════════════════════════════════════════════
function TitleScreen({ onNext, onExit }) {
  return (
    <FadeIn>
      <View style={{ flex: 1, backgroundColor: TEAL_DARK }}>
        <StatusBar barStyle="light-content" />
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
// Platform-specific tutorial steps.
// iOS: the dolphin follows vocal EFFORT (loud/soft) because iOS WKWebView cannot
//      access the microphone for real-time pitch.  Pitch is measured post-exercise.
// Android: Web Audio autocorrelation gives real-time pitch tracking.
const PITCH_INSTR_STEPS = Platform.OS === 'android' ? [
  { step: '1', text: 'Say "ahh" continuously — your pitch moves the dolphin.' },
  { step: '2', text: 'Glide from a LOW pitch (lower hoop) to a HIGH pitch (upper hoop).' },
  { step: '3', text: 'Hold your pitch in the target zone to complete a hoop. Four hoops = done!' },
] : [
  { step: '1', text: 'Say "ahh" continuously — your voice moves the dolphin.' },
  { step: '2', text: 'Speak SOFTLY for the lower hoop — LOUDLY for the upper hoop.' },
  { step: '3', text: 'Hold your voice in the glowing zone to complete a hoop. Four hoops = done!' },
];
const PITCH_INSTR_TEXT = Platform.OS === 'android'
  ? "Pitch Glides. Say ahh continuously. Glide your pitch from low to high to guide the dolphin through each hoop. Hold in the target zone to complete a hoop."
  : "Pitch Glides. Say ahh continuously. Speak softly for the lower hoop and loudly for the upper hoop. Hold in each zone to complete a hoop. Your pitch range is measured after.";

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

// ── Android WebView HTML — autocorrelation pitch detector ─────────────────────
// Runs entirely in the WebView's JS context (no native modules needed).
// Posts messages to React Native: { ready }, { cal, count, hz }, { baselineDone, baseline },
// { hz, rms, norm } during exercise, or { error } on failure.
// Receives: 'start' (begin mic), 'finish_cal' (end calibration), 'stop' (cleanup).
const PITCH_WEBVIEW_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:transparent;">
<script>
var ctx=null,analyser=null,buf=null,running=false;
var baseline=150,calSamples=[],calDone=false;
function post(o){try{window.ReactNativeWebView.postMessage(JSON.stringify(o));}catch(e){}}
function acf(buf,sr){
  var n=buf.length,sumSq=0;
  for(var i=0;i<n;i++)sumSq+=buf[i]*buf[i];
  var rms=Math.sqrt(sumSq/n);
  if(rms<0.008)return{hz:-1,rms:rms};
  var mn=Math.ceil(sr/500),mx=Math.floor(sr/70);
  if(mx>=n)mx=n-1;
  var best=-1,bestV=-1e9;
  for(var lag=mn;lag<=mx;lag++){
    var s=0,len=n-lag;
    for(var j=0;j<len;j++)s+=buf[j]*buf[j+lag];
    if(s>bestV){bestV=s;best=lag;}
  }
  if(best<=0||bestV<0)return{hz:-1,rms:rms};
  return{hz:sr/best,rms:rms};
}
function normHz(hz){
  if(hz<=0||baseline<=0)return -1;
  var lo=baseline*0.50,hi=baseline*1.65;
  var p=(hz-lo)/(hi-lo);
  return Math.max(0,Math.min(1,p));
}
function loop(){
  if(!running)return;
  analyser.getFloatTimeDomainData(buf);
  var r=acf(buf,ctx.sampleRate);
  if(!calDone){
    if(r.hz>0&&r.rms>0.015)calSamples.push(r.hz);
    post({cal:true,count:calSamples.length,hz:r.hz});
  }else{
    post({hz:r.hz,rms:r.rms,norm:normHz(r.hz)});
  }
  setTimeout(loop,80);
}
function start(){
  navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false})
  .then(function(stream){
    ctx=new(window.AudioContext||window.webkitAudioContext)();
    analyser=ctx.createAnalyser();
    analyser.fftSize=2048;
    ctx.createMediaStreamSource(stream).connect(analyser);
    buf=new Float32Array(analyser.fftSize);
    running=true;
    post({ready:true});
    loop();
  }).catch(function(e){post({error:e.toString()});});
}
function finishCal(){
  if(calSamples.length>3){
    var s=calSamples.slice().sort(function(a,b){return a-b;});
    baseline=s[Math.floor(s.length*0.5)];
  }
  calDone=true;
  post({baselineDone:true,baseline:baseline});
}
window.addEventListener('message',function(e){
  if(e.data==='start')start();
  else if(e.data==='finish_cal')finishCal();
  else if(e.data==='stop'){running=false;if(ctx)ctx.close();}
});
<\/script></body></html>`;

// ── Backend pitch analysis helper (iOS only) ───────────────────────────────────
// After the iOS exercise completes, the full recording is sent to the backend.
// parselmouth extracts f0_range_hz — how many Hz the user's voice spanned.
// This gives real clinical feedback and feeds into the expression score.
async function analyzeGlideRecording(uri) {
  const form = new FormData();
  form.append('file', { uri, type: 'audio/m4a', name: 'pitch_glide.m4a' });
  form.append('task_type', 'pitch_glide');
  form.append('audio_duration_s', '15');
  const res = await fetchWithAuth(`${API_BASE_URL}/api/analyze-voice`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`analyze failed: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

// ══════════════════════════════════════════════════════════════════════════════
// ExerciseScreenIOS — expo-av metering drives dolphin; audio is recorded and
// sent to the backend after completion for real pitch range feedback.
// ══════════════════════════════════════════════════════════════════════════════
function ExerciseScreenIOS({ onComplete, onExit, onShowDemo, onSkip, tier = 1 }) {
  const { top: safeTop } = useSafeAreaInsets();
  const hapticEnabled = useHapticFeedback();
  const largeText = useLargeText();
  const fsl = (n) => largeText ? Math.round(n * 1.25) : n;

  const tierConfig    = PITCH_TIERS[Math.max(0, Math.min(4, tier - 1))];
  const TOTAL_HOOPS_T = tierConfig.totalHoops;
  const HOLD_MS_T     = tierConfig.holdMs;

  const [hoopsDone,       setHoopsDone]       = useState(0);
  const [phase,           setPhase]           = useState('calibrating'); // calibrating|listening|done|analyzing|result
  const [micError,        setMicError]        = useState(false);
  const [showHelpOverlay, setShowHelpOverlay] = useState(false);
  // pitchResult: null while unknown, number = Hz range from backend, 'failed' = no data
  const [pitchResult,     setPitchResult]     = useState(null);

  const hoopsDoneRef      = useRef(0);
  const phaseRef          = useRef('calibrating');
  const recordingRef      = useRef(null);
  const calibrateTimerRef = useRef(null);
  const holdTimerRef      = useRef(null);
  const inTargetRef       = useRef(false);
  const adaptiveThreshRef = useRef(0.35);
  const ambientSamplesRef = useRef([]);

  const pitchAnim  = useRef(new Animated.Value(0)).current;
  const volBarAnim = useRef(new Animated.Value(0)).current;

  const dolphinX = pitchAnim.interpolate({ inputRange: [0, 1], outputRange: [HOOP_LL.x, HOOP_UR.x] });
  const dolphinY = pitchAnim.interpolate({ inputRange: [0, 1], outputRange: [HOOP_LL.y, HOOP_UR.y] });

  useEffect(() => {
    calibrateAmbient();
    return () => { cleanup(); };
  }, []);

  function normVol(rawVol) {
    const thresh = adaptiveThreshRef.current;
    const lo = thresh * 0.45; // ambient noise floor — below this counts as silence
    // Span = the actual achievable rawVol range above the floor.
    // The old formula used (thresh * 2.4) as the span, but that can exceed
    // (1.0 - lo) when thresh > ~0.38, making normVol top out below 0.66 and
    // the dolphin unable to reach the upper hoop at any volume.
    // Using (1.0 - lo) guarantees normVol reaches 1.0 at the device's max output.
    const span = Math.max(0.30, 1.0 - lo);
    return Math.max(0, Math.min(1, (rawVol - lo) / span));
  }

  async function calibrateAmbient() {
    ambientSamplesRef.current = [];
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
        (status) => {
          if (!status.isRecording) return;
          const db = status.metering ?? -160;
          const v  = Math.min(1, Math.max(0, (db + 70) / 60));
          ambientSamplesRef.current.push(v);
        },
        80,
      );
      calibrateTimerRef.current = setTimeout(async () => {
        calibrateTimerRef.current = null;
        const samples = ambientSamplesRef.current;
        if (samples.length > 0) {
          const sorted = [...samples].sort((a, b) => a - b);
          const p90 = sorted[Math.floor(samples.length * 0.90)] ?? 0.35;
          adaptiveThreshRef.current = Math.min(0.65, Math.max(0.26, p90 * 2.2 + 0.10));
        }
        try { await recording.stopAndUnloadAsync(); } catch (_) {}
        phaseRef.current = 'listening';
        setPhase('listening');
        await startMic();
      }, CALIBRATION_MS);
    } catch (_) {
      adaptiveThreshRef.current = 0.35;
      phaseRef.current = 'listening';
      setPhase('listening');
      startMic().catch(() => setMicError(true));
    }
  }

  async function startMic() {
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
        onMeter,
        80,
      );
      recordingRef.current = recording;
    } catch (_) {
      setMicError(true);
    }
  }

  function onMeter(status) {
    // Stop processing once we leave the active listening phase
    if (!status.isRecording) return;
    const p = phaseRef.current;
    if (p === 'done' || p === 'analyzing' || p === 'result') return;
    const db     = status.metering ?? -160;
    const rawVol = Math.min(1, Math.max(0, (db + 70) / 60));
    const norm   = normVol(rawVol);

    Animated.timing(pitchAnim,  { toValue: norm,   duration: 100, useNativeDriver: false }).start();
    Animated.timing(volBarAnim, { toValue: rawVol, duration: 80,  useNativeDriver: false }).start();

    if (p !== 'listening') return;

    // Even hoopsDone → target LOW (gentle voice, lower hoop) — start quiet so PD users
    // build confidence before attempting the louder zone.
    // Odd  hoopsDone → target HIGH (loud voice, upper hoop)
    const targetHigh = hoopsDoneRef.current % 2 === 1;
    const inZone = targetHigh
      ? norm >= TARGET_HI_MIN
      : (norm >= TARGET_LO_MIN && norm <= TARGET_LO_MAX);

    if (inZone && !inTargetRef.current) {
      inTargetRef.current  = true;
      holdTimerRef.current = setTimeout(completeHoop, HOLD_MS_T);
    } else if (!inZone && inTargetRef.current) {
      inTargetRef.current = false;
      if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    }
  }

  // Called when all hoops are done. Grabs the recording URI, stops recording,
  // then sends audio to the backend for real pitch-range analysis before advancing.
  async function finishExercise() {
    phaseRef.current = 'done';
    hapticSuccess(hapticEnabled);
    // Save URI before stopping — getURI() returns null after stopAndUnloadAsync
    const uri = recordingRef.current?.getURI?.() ?? null;
    await cleanup();
    setPhase('analyzing');

    let score = 100;
    let rangeHz = null;

    if (uri) {
      try {
        // Cap backend wait at 6 s so we never block the user for too long
        const data = await Promise.race([
          analyzeGlideRecording(uri),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
        ]);
        rangeHz = data?.features?.f0_range_hz ?? null;
        if (rangeHz != null) {
          // 15 Hz floor → score ~0;  100+ Hz full glide → score 100
          score = Math.min(100, Math.round(Math.max(0, (rangeHz - 15) / 85) * 100));
        }
      } catch (_) {}
    }

    setPitchResult(rangeHz != null ? Math.round(rangeHz) : null);
    setPhase('result');
    // Show result for 2.4 s then advance to the next exercise
    setTimeout(() => onComplete(score), 2400);
  }

  function completeHoop() {
    holdTimerRef.current = null;
    inTargetRef.current  = false;
    const next = hoopsDoneRef.current + 1;
    hoopsDoneRef.current = next;
    setHoopsDone(next);
    if (next >= TOTAL_HOOPS_T) {
      finishExercise();
    }
  }

  function showHelp() {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    inTargetRef.current = false;
    setShowHelpOverlay(true);
  }
  function closeHelp() { setShowHelpOverlay(false); inTargetRef.current = false; }

  async function cleanup() {
    if (calibrateTimerRef.current) { clearTimeout(calibrateTimerRef.current); calibrateTimerRef.current = null; }
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }
    } catch (_) {}
  }

  const isPostExercise = phase === 'analyzing' || phase === 'result';
  // Mirrors onMeter logic: even hoops = LOW (quiet), odd = HIGH (loud)
  const targetHigh = hoopsDone % 2 === 1;
  const llState    = isPostExercise ? 'target' : (targetHigh ? 'dim'    : 'target');
  const urState    = isPostExercise ? 'target' : (targetHigh ? 'target' : 'dim');

  const promptText =
    micError                ? 'Mic unavailable'       :
    phase === 'calibrating' ? 'Listening to room…'    :
    targetHigh              ? "Say 'ahh' — LOUD"      :
                              "Say 'ahh' — softly";

  // Pitch result card text
  const resultLabel = pitchResult != null
    ? (pitchResult >= 70 ? 'Excellent pitch range!' : pitchResult >= 35 ? 'Good pitch glide!' : 'Keep practising!')
    : 'Great vocal effort!';
  const resultSub = pitchResult != null ? `${pitchResult} Hz range detected` : '';

  return (
    <View style={{ flex: 1, backgroundColor: TEAL_DARK }}>
      <StatusBar barStyle="light-content" />
      <BottomWave />

      {/* Mic error overlay */}
      {micError && (
        <View style={xs.micErrorOverlay}>
          <Text style={xs.micErrorTitle}>Microphone unavailable</Text>
          <Text style={xs.micErrorBody}>Allow microphone access in your device settings, then restart the exercise.</Text>
          <TouchableOpacity style={xs.micErrorBtn} onPress={onSkip} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Skip this exercise">
            <Text style={xs.micErrorBtnText}>Skip this exercise</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Post-exercise overlay: 'analyzing' spinner then 'result' pitch card */}
      {isPostExercise && (
        <View style={xs.resultOverlay}>
          {phase === 'analyzing' ? (
            <Text style={xs.resultAnalysing}>Measuring your{'\n'}pitch range…</Text>
          ) : (
            <>
              <Text style={xs.resultLabel}>{resultLabel}</Text>
              {!!resultSub && <Text style={xs.resultSub}>{resultSub}</Text>}
            </>
          )}
        </View>
      )}

      {/* Header */}
      <View style={{ position: 'absolute', top: safeTop + 14, left: fs(14), zIndex: 30 }}>
        <TouchableOpacity style={bs.close} onPress={onExit} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Exit exercise">
          <Text style={bs.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={{ position: 'absolute', top: safeTop + 14, right: fs(14), zIndex: 30 }}>
        <TouchableOpacity style={bs.question} onPress={showHelp} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Show instructions">
          <Text style={bs.questionText}>?</Text>
        </TouchableOpacity>
      </View>

      {!isPostExercise && <Text style={exs.prompt}>{promptText}</Text>}

      <DualProgressBar done={hoopsDone} total={TOTAL_HOOPS_T} />

      {/* Hoops */}
      <View style={{ position: 'absolute', left: HOOP_LL.x - HOOP_W / 2, top: HOOP_LL.y - HOOP_H / 2 }}>
        <HoopEllipse state={llState} />
      </View>
      <View style={{ position: 'absolute', left: HOOP_UR.x - HOOP_W / 2, top: HOOP_UR.y - HOOP_H / 2 }}>
        <HoopEllipse state={urState} />
      </View>

      {/* Zone labels: LOUD (top) / quiet (bottom) on iOS */}
      <Text style={[exs.zoneLabel, { left: HOOP_UR.x + HOOP_W / 2 - fs(10), top: HOOP_UR.y - fv(14), color: urState === 'target' ? ORANGE : 'rgba(255,255,255,0.35)' }]}>LOUD</Text>
      <Text style={[exs.zoneLabel, { left: HOOP_LL.x + HOOP_W / 2 - fs(10), top: HOOP_LL.y + HOOP_H / 2 + fv(4), color: llState === 'target' ? ORANGE : 'rgba(255,255,255,0.35)' }]}>quiet</Text>

      {/* Dolphin */}
      <Animated.View style={{ position: 'absolute', transform: [{ translateX: Animated.subtract(dolphinX, DOLPH_W / 2) }, { translateY: Animated.subtract(dolphinY, DOLPH_H / 2) }], zIndex: 10 }}>
        <Image source={require('../../../../assets/images/Dolphin2.png')} style={{ width: DOLPH_W, height: DOLPH_H, resizeMode: 'contain' }} />
      </Animated.View>

      {/* Volume bar */}
      <View style={{ position: 'absolute', left: VBAR_LEFT, top: VBAR_TOP, width: VBAR_W, height: VBAR_H, borderRadius: VBAR_W / 2, backgroundColor: TEAL_MID, overflow: 'hidden', justifyContent: 'flex-end' }}>
        <Animated.View style={{ width: '100%', height: volBarAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), backgroundColor: ORANGE, borderRadius: VBAR_W / 2 }} />
      </View>

      {phase === 'listening' && (
        <View style={{ position: 'absolute', bottom: fv(16), left: 0, right: 0, alignItems: 'center', zIndex: 20 }}>
          <CantDoNow onSkip={onSkip} onEnd={onExit} />
        </View>
      )}

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
                <Text style={[pgHelp.stepText, { fontSize: fsl(17) }]}>{text}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={pgHelp.continueBtn} onPress={closeHelp} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Continue exercise">
            <Text style={[pgHelp.continueText, { fontSize: fsl(18) }]}>Continue Exercise  →</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ExerciseScreenAndroid — WebView autocorrelation provides real-time pitch Hz.
// The dolphin position maps directly to normalised pitch (0 = baseline, 1 = high).
// No audio recording needed — pitch is detected in real time.
// ══════════════════════════════════════════════════════════════════════════════
function ExerciseScreenAndroid({ onComplete, onExit, onShowDemo, onSkip, tier = 1 }) {
  const { top: safeTop } = useSafeAreaInsets();
  const hapticEnabled = useHapticFeedback();
  const largeText = useLargeText();
  const fsl = (n) => largeText ? Math.round(n * 1.25) : n;

  const tierConfig    = PITCH_TIERS[Math.max(0, Math.min(4, tier - 1))];
  const TOTAL_HOOPS_T = tierConfig.totalHoops;
  const HOLD_MS_T     = tierConfig.holdMs;

  const [hoopsDone,       setHoopsDone]       = useState(0);
  const [phase,           setPhase]           = useState('loading'); // loading|calibrating|listening|done
  const [micError,        setMicError]        = useState(false);
  const [showHelpOverlay, setShowHelpOverlay] = useState(false);

  const hoopsDoneRef = useRef(0);
  const phaseRef     = useRef('loading');
  const holdTimerRef = useRef(null);
  const inTargetRef  = useRef(false);
  const calTimerRef  = useRef(null);
  const webViewRef   = useRef(null);
  // Collect valid Hz readings during the exercise to compute actual pitch range at end.
  const hzSamplesRef = useRef([]);

  const pitchAnim  = useRef(new Animated.Value(0)).current;
  const volBarAnim = useRef(new Animated.Value(0)).current;

  const dolphinX = pitchAnim.interpolate({ inputRange: [0, 1], outputRange: [HOOP_LL.x, HOOP_UR.x] });
  const dolphinY = pitchAnim.interpolate({ inputRange: [0, 1], outputRange: [HOOP_LL.y, HOOP_UR.y] });

  useEffect(() => {
    return () => {
      if (calTimerRef.current) clearTimeout(calTimerRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      try { webViewRef.current?.postMessage('stop'); } catch (_) {}
    };
  }, []);

  function onWebViewMessage(event) {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.ready) {
        // WebView mic is active — enter calibration. After 1.5 s, finalise baseline.
        phaseRef.current = 'calibrating';
        setPhase('calibrating');
        calTimerRef.current = setTimeout(() => {
          calTimerRef.current = null;
          try { webViewRef.current?.postMessage('finish_cal'); } catch (_) {}
        }, 1500);
      } else if (data.baselineDone) {
        // Baseline pitch set — begin the exercise
        phaseRef.current = 'listening';
        setPhase('listening');
      } else if (data.error) {
        setMicError(true);
      } else if (data.hz !== undefined && phaseRef.current === 'listening') {
        const norm = data.norm ?? 0;
        const rms  = data.rms  ?? 0;
        const hz   = data.hz;

        // Animate dolphin only when pitch is detected (hz > 0)
        if (hz > 0) {
          Animated.timing(pitchAnim,  { toValue: norm,              duration: 100, useNativeDriver: false }).start();
          // Accumulate valid Hz readings for post-exercise range scoring (70–500 Hz = human voice)
          if (hz >= 70 && hz <= 500) hzSamplesRef.current.push(hz);
        }
        Animated.timing(volBarAnim, { toValue: Math.min(1, rms * 6), duration: 80,  useNativeDriver: false }).start();

        // Silence or no pitch detected → cancel hold timer
        if (hz <= 0 || rms < 0.012) {
          if (inTargetRef.current) {
            inTargetRef.current = false;
            if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
          }
          return;
        }

        // Zone check — same alternating LOW/HIGH pattern as iOS:
        // even hoop index → LOW (gentle, builds confidence first)
        // odd hoop index  → HIGH (strong voice)
        const targetHigh = hoopsDoneRef.current % 2 === 1;
        const inZone = targetHigh
          ? norm >= TARGET_HI_MIN
          : (norm >= TARGET_LO_MIN && norm <= TARGET_LO_MAX);

        if (inZone && !inTargetRef.current) {
          inTargetRef.current  = true;
          holdTimerRef.current = setTimeout(completeHoop, HOLD_MS_T);
        } else if (!inZone && inTargetRef.current) {
          inTargetRef.current = false;
          if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
        }
      }
    } catch (_) {}
  }

  function completeHoop() {
    holdTimerRef.current = null;
    inTargetRef.current  = false;
    const next = hoopsDoneRef.current + 1;
    hoopsDoneRef.current = next;
    setHoopsDone(next);
    if (next >= TOTAL_HOOPS_T) {
      phaseRef.current = 'done';
      setPhase('done');
      hapticSuccess(hapticEnabled);
      try { webViewRef.current?.postMessage('stop'); } catch (_) {}

      // Compute score from actual pitch range achieved — same formula as iOS backend:
      // 15 Hz floor = barely any glide (~0); 100+ Hz = full deliberate glide (100).
      // Floor at 30 to credit completing all hoops even when range is limited.
      const validHz = hzSamplesRef.current;
      let score = 100;
      if (validHz.length >= 20) {
        const rangeHz = Math.max(...validHz) - Math.min(...validHz);
        score = Math.max(30, Math.min(100, Math.round(Math.max(0, (rangeHz - 15) / 85) * 100)));
      }
      setTimeout(() => onComplete(score), 1200);
    }
  }

  function showHelp() {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    inTargetRef.current = false;
    setShowHelpOverlay(true);
  }
  function closeHelp() { setShowHelpOverlay(false); inTargetRef.current = false; }

  const targetHigh = hoopsDone % 2 === 0;
  const llState    = phase === 'done' ? 'target' : (targetHigh ? 'dim'    : 'target');
  const urState    = phase === 'done' ? 'target' : (targetHigh ? 'target' : 'dim');

  const promptText =
    micError                ? 'Mic unavailable'           :
    phase === 'done'        ? 'Amazing!'                  :
    phase === 'calibrating' ? "Say 'ahh' to calibrate…"  :
    phase === 'loading'     ? 'Starting…'                 :
    targetHigh              ? "Higher pitch → upper hoop" :
                              "Lower pitch → lower hoop";

  return (
    <View style={{ flex: 1, backgroundColor: TEAL_DARK }}>
      <StatusBar barStyle="light-content" />
      <BottomWave />

      {/* Hidden WebView — handles mic and autocorrelation pitch detection */}
      <WebView
        ref={webViewRef}
        source={{ html: PITCH_WEBVIEW_HTML, baseUrl: 'https://localhost' }}
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }}
        onMessage={onWebViewMessage}
        onError={() => setMicError(true)}
        javaScriptEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={['*']}
        onPermissionRequest={(e) => {
          // Grant microphone access to the WebView so getUserMedia can run
          try { e.nativeEvent.request.grant(e.nativeEvent.resources); } catch (_) {}
        }}
      />

      {/* Mic error overlay */}
      {micError && (
        <View style={xs.micErrorOverlay}>
          <Text style={xs.micErrorTitle}>Microphone unavailable</Text>
          <Text style={xs.micErrorBody}>Allow microphone access in device settings, then restart the exercise.</Text>
          <TouchableOpacity style={xs.micErrorBtn} onPress={onSkip} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Skip this exercise">
            <Text style={xs.micErrorBtnText}>Skip this exercise</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Header */}
      <View style={{ position: 'absolute', top: safeTop + 14, left: fs(14), zIndex: 30 }}>
        <TouchableOpacity style={bs.close} onPress={onExit} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Exit exercise">
          <Text style={bs.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={{ position: 'absolute', top: safeTop + 14, right: fs(14), zIndex: 30 }}>
        <TouchableOpacity style={bs.question} onPress={showHelp} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Show instructions">
          <Text style={bs.questionText}>?</Text>
        </TouchableOpacity>
      </View>

      <Text style={exs.prompt}>{promptText}</Text>
      <DualProgressBar done={hoopsDone} total={TOTAL_HOOPS_T} />

      {/* Hoops */}
      <View style={{ position: 'absolute', left: HOOP_LL.x - HOOP_W / 2, top: HOOP_LL.y - HOOP_H / 2 }}>
        <HoopEllipse state={llState} />
      </View>
      <View style={{ position: 'absolute', left: HOOP_UR.x - HOOP_W / 2, top: HOOP_UR.y - HOOP_H / 2 }}>
        <HoopEllipse state={urState} />
      </View>

      {/* Zone labels: HIGH pitch (top) / LOW pitch (bottom) on Android */}
      <Text style={[exs.zoneLabel, { left: HOOP_UR.x + HOOP_W / 2 - fs(10), top: HOOP_UR.y - fv(14), color: urState === 'target' ? ORANGE : 'rgba(255,255,255,0.35)' }]}>HIGH</Text>
      <Text style={[exs.zoneLabel, { left: HOOP_LL.x + HOOP_W / 2 - fs(10), top: HOOP_LL.y + HOOP_H / 2 + fv(4), color: llState === 'target' ? ORANGE : 'rgba(255,255,255,0.35)' }]}>LOW</Text>

      {/* Dolphin */}
      <Animated.View style={{ position: 'absolute', transform: [{ translateX: Animated.subtract(dolphinX, DOLPH_W / 2) }, { translateY: Animated.subtract(dolphinY, DOLPH_H / 2) }], zIndex: 10 }}>
        <Image source={require('../../../../assets/images/Dolphin2.png')} style={{ width: DOLPH_W, height: DOLPH_H, resizeMode: 'contain' }} />
      </Animated.View>

      {/* Volume / activity bar */}
      <View style={{ position: 'absolute', left: VBAR_LEFT, top: VBAR_TOP, width: VBAR_W, height: VBAR_H, borderRadius: VBAR_W / 2, backgroundColor: TEAL_MID, overflow: 'hidden', justifyContent: 'flex-end' }}>
        <Animated.View style={{ width: '100%', height: volBarAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), backgroundColor: ORANGE, borderRadius: VBAR_W / 2 }} />
      </View>

      {phase === 'listening' && (
        <View style={{ position: 'absolute', bottom: fv(16), left: 0, right: 0, alignItems: 'center', zIndex: 20 }}>
          <CantDoNow onSkip={onSkip} onEnd={onExit} />
        </View>
      )}

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
                <Text style={[pgHelp.stepText, { fontSize: fsl(17) }]}>{text}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={pgHelp.continueBtn} onPress={closeHelp} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Continue exercise">
            <Text style={[pgHelp.continueText, { fontSize: fsl(18) }]}>Continue Exercise  →</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Platform dispatcher ───────────────────────────────────────────────────────
// Android uses real-time WebView pitch detection; iOS uses expo-av metering
// for the dolphin game plus backend pitch analysis after completing all hoops.
function ExerciseScreen(props) {
  return Platform.OS === 'android'
    ? <ExerciseScreenAndroid {...props} />
    : <ExerciseScreenIOS {...props} />;
}

const xs = StyleSheet.create({
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
  // Post-exercise overlay shown while analysing pitch (iOS) or displaying result
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,64,71,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 60,
    padding: 32,
  },
  resultAnalysing: {
    color: WHITE,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 38,
    opacity: 0.85,
  },
  resultLabel: {
    color: WHITE,
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  resultSub: {
    color: ORANGE,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
});

const exs = StyleSheet.create({
  prompt:    { position: 'absolute', top: fv(100), left: 0, right: 0, zIndex: 25, color: WHITE, fontSize: 30, fontWeight: '800', letterSpacing: 1.5, textAlign: 'center' },
  promptBig: { top: fv(137), fontSize: 34, letterSpacing: 1.7 },
  zoneLabel: { position: 'absolute', fontSize: 13, fontWeight: '700', letterSpacing: 0.5, zIndex: 20 },
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
const STEP_TUTORIAL = 0;
const STEP_EXERCISE = 1;

export default function PitchGlidesExercise({ onComplete, onExit, onSkip, tier = 1, exerciseIndex = 0, totalExercises = 8 }) {
  // null = AsyncStorage check in progress; avoids a one-frame flash to the intro.
  const [step, setStep] = useState(null);
  const sessionFill = totalExercises > 0 ? exerciseIndex / totalExercises : 0;

  useEffect(() => {
    AsyncStorage.getItem(DEMO_KEY)
      // ExerciseTitleCard is shown by VocalTrainingSessionScreen before this component
      // mounts, so we skip straight to Tutorial on first visit (no separate TitleScreen).
      .then(val => setStep(val ? STEP_EXERCISE : STEP_TUTORIAL))
      .catch(() => setStep(STEP_TUTORIAL));
  }, []);

  if (step === null) return null;

  if (step === STEP_TUTORIAL) return (
    <TutorialScreen
      onFinish={() => {
        // Mark the intro as seen so future sessions skip straight to the exercise.
        AsyncStorage.setItem(DEMO_KEY, '1').catch(() => {});
        setStep(STEP_EXERCISE);
      }}
      onExit={onExit}
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
