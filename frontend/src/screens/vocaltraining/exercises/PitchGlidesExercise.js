/**
 * PitchGlidesExercise — Flappy Bird-style horizontal scrolling pitch glides game.
 *
 * MECHANIC OVERVIEW (why this design):
 *   The original two-fixed-hoop design asked users to move the dolphin diagonally
 *   between two static targets. This made it hard to read at a glance which hoop
 *   was "next" and gave no sense of forward momentum. The scrolling hoop design
 *   borrows from Flappy Bird: one hoop at a time slides in from the right, pauses
 *   at the dolphin's X position, and the user must hold their voice in the target
 *   zone long enough to "thread" the hoop. The kinetic approach cues the user to
 *   prepare before the hold window opens, and the flash feedback (green = success,
 *   orange = skipped) closes the loop without requiring text readouts.
 *
 * MISS / SKIP MECHANIC (why 3 misses before skip):
 *   A single hold failure should not count as a skip — PD users may momentarily
 *   lose breath support and re-enter the zone within the same hoop attempt. We allow
 *   up to MAX_HOOP_MISSES (3) entry-then-exit events per hoop before giving up and
 *   advancing. This keeps the session moving while still rewarding genuine effort.
 *
 * DUAL-PLATFORM DETECTION (unchanged from original):
 *   iOS:     expo-av metering drives pitchAnim as a vocal-effort proxy.
 *            Real pitch range is measured post-exercise by the backend (Praat).
 *   Android: Hidden WebView runs autocorrelation pitch detection on the mic stream
 *            in real time. Score is computed from the Hz range of valid samples.
 *
 * Flow: Tutorial → Exercise (calibrate 1.5 s → TOTAL_HOOPS scrolling hoops)
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
import { logUsageEvent } from '../../../utils/analytics';

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
// These thresholds define the LOW and HIGH target bands:
//   LOW zone: 0.10–0.44 (gentle phonation, starting point for PD users)
//   HIGH zone: ≥0.66    (strong effort, correlates with raised pitch)
const TARGET_LO_MIN  = 0.10;
const TARGET_LO_MAX  = 0.44;
const TARGET_HI_MIN  = 0.66;

// Maximum number of zone entries that end early (dolphin leaves before hold
// completes) before a hoop is skipped. 3 gives generous retry without stalling.
const MAX_HOOP_MISSES = 3;

// ── Tier configuration (difficulty_tier 1–5) ──────────────────────────────────
// pitchRangeHz: Target glide span in Hz for post-exercise scoring.
//               IMPORTANT: this value is NOT used by either platform's live detection.
//               On iOS, the dolphin follows voice level (not Hz); on Android it follows
//               live autocorrelation Hz but the WebView normalisation is independent of
//               this field. pitchRangeHz is the scoring target: achieving this many Hz
//               of glide above the 15 Hz floor earns a score of 100 at this tier.
// holdMs:       Milliseconds the voice must stay in the target zone to complete a hoop.
// totalHoops:   Number of hoops to complete the exercise.
const PITCH_TIERS = [
  { pitchRangeHz: 100, holdMs:  700, totalHoops: 4 },  // Tier 1: ±50 Hz
  { pitchRangeHz: 130, holdMs:  700, totalHoops: 4 },  // Tier 2: ±65 Hz
  { pitchRangeHz: 160, holdMs:  700, totalHoops: 4 },  // Tier 3: ±80 Hz
  { pitchRangeHz: 190, holdMs:  900, totalHoops: 5 },  // Tier 4: ±95 Hz, one extra hoop
  { pitchRangeHz: 220, holdMs: 1200, totalHoops: 6 },  // Tier 5: ±110 Hz, sustained
];

// ── Colours ───────────────────────────────────────────────────────────────────
const TEAL_DARK   = '#1C4047';
const TEAL_MID    = '#2D6974';
const ORANGE      = '#FFA940';
const WHITE       = '#FFFFFF';
const GREEN_HOOP  = '#45B013';

// ── Hoop geometry ─────────────────────────────────────────────────────────────
// HOOP_W/H define the ellipse size. DOLPHIN_X is the fixed left position where
// the dolphin sits — hoops approach from the right and pause here for the hold.
const HOOP_W    = fs(102);
const HOOP_H    = fv(135);

// Dolphin sits at 22% of screen width — left quarter, giving plenty of approach
// runway on the right side so the user can read the incoming hoop target.
const DOLPHIN_X = W * 0.22;

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

// ── Dot progress bar ──────────────────────────────────────────────────────────
// Shows filled orange dots for completed hoops out of total.
// Using dots (not a fill bar) makes each individual hoop feel like a discrete
// achievement, reinforcing the Flappy Bird "one hoop at a time" framing.
function DotProgressBar({ done, total }) {
  const barLeft = fs(81);
  const barWidth = fs(256);

  // Lay out dots evenly across the available width
  const dotSize = Math.min(20, Math.floor((barWidth - (total - 1) * 8) / total));
  const gap = total > 1 ? (barWidth - total * dotSize) / (total - 1) : 0;

  return (
    <View style={{
      position: 'absolute',
      top: fv(192),
      left: barLeft,
      width: barWidth,
      height: 25,
      flexDirection: 'row',
      alignItems: 'center',
      zIndex: 25,
    }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            // Filled (orange) if the hoop has been completed, hollow otherwise
            backgroundColor: i < done ? ORANGE : TEAL_MID,
            marginRight: i < total - 1 ? gap : 0,
          }}
        />
      ))}
    </View>
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
// iOS: The dolphin follows vocal effort as a proxy for pitch — rising in pitch naturally
//      requires more effort, so users achieve the glide goal even without real-time Hz feedback.
// Android: Web Audio autocorrelation tracks actual pitch in real-time.
const PITCH_GLIDES_INTRO_TEXT = Platform.OS === 'android'
  ? "Pitch Glides. Hoops scroll in from the right. Glide your pitch low or high to position the dolphin inside each hoop. Hold in the zone to complete it."
  : "Pitch Glides. Hoops scroll in from the right. Guide the dolphin through each hoop by adjusting your vocal effort — low for the bottom zone, high for the top. Your pitch range is measured automatically after you finish.";

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
// Tutorial screen — instruction card
// ══════════════════════════════════════════════════════════════════════════════
// Platform-specific tutorial steps.
// iOS: the dolphin follows vocal effort as a pitch proxy — rising in pitch typically
//      requires more effort. Instructions are framed as a pitch task because that is
//      the clinical goal; the live feedback is an effort bar rather than an Hz readout.
// Android: Web Audio autocorrelation gives real-time pitch tracking.
const PITCH_INSTR_STEPS = Platform.OS === 'android' ? [
  { step: '1', text: 'Say "ahh" continuously — your pitch moves the dolphin up and down.' },
  { step: '2', text: 'Hoops scroll in from the right — LOW or HIGH. Position the dolphin inside the hoop.' },
  { step: '3', text: 'Hold your pitch in the zone to complete the hoop. Three misses and it moves on!' },
] : [
  { step: '1', text: 'Say "ahh" continuously — your voice moves the dolphin up and down.' },
  { step: '2', text: 'Hoops scroll in from the right — LOW or HIGH. Guide the dolphin inside the hoop.' },
  { step: '3', text: 'Hold your voice in the zone to complete the hoop. Three misses and it moves on!' },
];
const PITCH_INSTR_TEXT = Platform.OS === 'android'
  ? "Pitch Glides. Say ahh continuously. Hoops scroll in from the right — glide your pitch low or high to guide the dolphin through each hoop. Hold in the target zone to complete a hoop."
  : "Pitch Glides. Say ahh continuously. Hoops scroll in from the right — guide the dolphin low or high through each hoop. Hold in each zone to complete it. Your pitch range is measured after.";

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
//
// SCROLLING HOOP GAME LOGIC:
//   After calibration, startNextHoop() launches the first hoop animation.
//   Each hoop slides from the far right to DOLPHIN_X, then pauses (hoopWaiting=true).
//   Zone detection only fires while hoopWaiting is true — this prevents false
//   completions during the approach animation. On completeHoop or skipHoop,
//   the hoop flashes the appropriate colour then exits left, and the next hoop
//   is queued immediately so there is no dead time between hoops.
// ══════════════════════════════════════════════════════════════════════════════
function ExerciseScreenIOS({ onComplete, onExit, onShowDemo, onSkip, tier = 1, analysisFallbackScore = 100 }) {
  const { top: safeTop } = useSafeAreaInsets();
  const hapticEnabled = useHapticFeedback();
  const largeText = useLargeText();
  const fsl = (n) => largeText ? Math.round(n * 1.25) : n;

  const tierConfig    = PITCH_TIERS[Math.max(0, Math.min(4, tier - 1))];
  const TOTAL_HOOPS_T = tierConfig.totalHoops;
  const HOLD_MS_T     = tierConfig.holdMs;

  // PLAY_TOP / PLAY_BOTTOM define the vertical corridor within which the dolphin
  // moves. These must be computed inside the component so safeTop is available.
  // We leave 155 px (scaled) below the UI header and 90 px above the bottom wave.
  const PLAY_TOP    = safeTop + fv(155);
  const PLAY_BOTTOM = H - fv(90);
  const PLAY_H      = PLAY_BOTTOM - PLAY_TOP;

  const [hoopsDone,       setHoopsDone]       = useState(0);
  const [hoopIndex,       setHoopIndex]       = useState(0);
  // hoopColor drives the ellipse stroke colour: 'normal' | 'success' | 'skipped'
  const [hoopColor,       setHoopColor]       = useState('normal');
  // hoopWaiting mirrors hoopWaitingRef — used for prompt text and accessibility
  const [hoopWaiting,     setHoopWaiting]     = useState(false);
  const [phase,           setPhase]           = useState('calibrating'); // calibrating|listening|done|analyzing|result
  const [micError,        setMicError]        = useState(false);
  const [showHelpOverlay, setShowHelpOverlay] = useState(false);
  // pitchResult: null while unknown, number = Hz range from backend, 'failed' = no data
  const [pitchResult,     setPitchResult]     = useState(null);

  const hoopsDoneRef      = useRef(0);
  const hoopIndexRef      = useRef(0);
  const hoopMissesRef     = useRef(0);
  const hoopWaitingRef    = useRef(false);
  const phaseRef          = useRef('calibrating');
  const recordingRef      = useRef(null);
  const calibrateTimerRef = useRef(null);
  const holdTimerRef      = useRef(null);
  const inTargetRef       = useRef(false);
  const adaptiveThreshRef = useRef(0.35);
  const ambientSamplesRef = useRef([]);

  const pitchAnim  = useRef(new Animated.Value(0)).current;
  const volBarAnim = useRef(new Animated.Value(0)).current;
  // hoopXAnim controls the horizontal scroll of the current hoop.
  // Starts at W + HOOP_W (off right edge), animates to DOLPHIN_X, then to -HOOP_W (off left).
  const hoopXAnim  = useRef(new Animated.Value(W + HOOP_W)).current;

  // Dolphin Y: pitchAnim=0 → bottom of play corridor, pitchAnim=1 → top.
  // This replaces the old diagonal interpolation between HOOP_LL and HOOP_UR —
  // now the dolphin moves purely vertically and the hoops come to it horizontally.
  const dolphinY = pitchAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [PLAY_BOTTOM - DOLPH_H / 2, PLAY_TOP - DOLPH_H / 2],
  });

  useEffect(() => {
    calibrateAmbient();
    return () => { cleanup(); };
  }, []);

  // ── Normalise raw volume from expo-av metering ──────────────────────────────
  // rawVol is a 0–1 linear scale from the dB metering value.
  // normVol maps it to 0–1 relative to the ambient threshold so that
  // ordinary speech can reach the HIGH zone (≥0.66) without shouting.
  function normVol(rawVol) {
    const thresh = adaptiveThreshRef.current;
    const lo     = thresh * 0.45;
    // Use (1.0 - lo) as the span so normVol can always reach 1.0 at device max.
    // The old formula (thresh * 2.4) could top out below 0.66 in quiet rooms.
    const span   = Math.max(0.30, 1.0 - lo);
    return Math.max(0, Math.min(1, (rawVol - lo) / span));
  }

  // ── Calibration: sample ambient noise for 1.5 s, then start the mic ────────
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
          // Multiply p90 by 2.2 and add 0.10 to set a threshold comfortably above
          // ambient so that quiet breathing does not register as a LOW zone hit.
          adaptiveThreshRef.current = Math.min(0.65, Math.max(0.26, p90 * 2.2 + 0.10));
        }
        try { await recording.stopAndUnloadAsync(); } catch (_) {}
        phaseRef.current = 'listening';
        setPhase('listening');
        // Start the exercise mic and kick off the first scrolling hoop
        await startMic();
        startNextHoop();
      }, CALIBRATION_MS);
    } catch (_) {
      // If calibration itself fails, use the default threshold and proceed
      adaptiveThreshRef.current = 0.35;
      phaseRef.current = 'listening';
      setPhase('listening');
      startMic().catch(() => setMicError(true));
      startNextHoop();
    }
  }

  // ── Start the exercise microphone (metering-only, full-quality recording) ───
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

  // ── onMeter: called ~12.5 times/sec by expo-av ──────────────────────────────
  // Drives the dolphin Y position and checks whether the dolphin is in the
  // current hoop's target zone. Zone detection is gated behind hoopWaitingRef
  // so early passes during the approach animation do not accidentally complete a hoop.
  function onMeter(status) {
    if (!status.isRecording) return;
    const p = phaseRef.current;
    if (p === 'done' || p === 'analyzing' || p === 'result') return;

    const db     = status.metering ?? -160;
    const rawVol = Math.min(1, Math.max(0, (db + 70) / 60));
    const norm   = normVol(rawVol);

    // Animate the dolphin vertically and the volume bar simultaneously
    Animated.timing(pitchAnim,  { toValue: norm,   duration: 100, useNativeDriver: false }).start();
    Animated.timing(volBarAnim, { toValue: rawVol, duration: 80,  useNativeDriver: false }).start();

    if (p !== 'listening') return;

    // Only check the zone when the hoop is paused at DOLPHIN_X (waiting for hold).
    // During the approach animation, the hoop is not yet at the dolphin — checking
    // early would give the user credit for being in zone before the hoop arrives.
    const targetHigh = hoopIndexRef.current % 2 !== 0;
    const inZone = hoopWaitingRef.current && (
      targetHigh
        ? norm >= TARGET_HI_MIN
        : (norm >= TARGET_LO_MIN && norm <= TARGET_LO_MAX)
    );

    if (inZone && !inTargetRef.current) {
      // Dolphin just entered the zone — start the hold countdown
      inTargetRef.current  = true;
      holdTimerRef.current = setTimeout(completeHoop, HOLD_MS_T);
    } else if (!inZone && inTargetRef.current) {
      // Dolphin left the zone before the hold completed — count as a miss.
      // If MAX_HOOP_MISSES is reached on this hoop, skip it so the session
      // does not stall on a hoop the user is struggling to hold.
      inTargetRef.current = false;
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      hoopMissesRef.current += 1;
      if (hoopMissesRef.current >= MAX_HOOP_MISSES) {
        skipHoop();
      }
    }
  }

  // ── startNextHoop: reset and animate the next hoop from right to DOLPHIN_X ──
  // Called after calibration and after each hoop completes or is skipped.
  // The hoop starts off-screen right so the user sees it approaching, giving
  // them time to prepare their voice before the hold window opens.
  function startNextHoop() {
    // Reset per-hoop state
    hoopMissesRef.current = 0;
    setHoopColor('normal');
    hoopXAnim.setValue(W + HOOP_W);
    hoopWaitingRef.current = false;
    setHoopWaiting(false);

    // Slide hoop from off-screen right to DOLPHIN_X over 1800 ms (approach).
    // 1800 ms gives enough runway for the user to see the incoming hoop and
    // begin adjusting their voice before the hold window opens.
    Animated.timing(hoopXAnim, {
      toValue:  DOLPHIN_X,
      duration: 1800,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        // Hoop has arrived — open the hold window
        hoopWaitingRef.current = true;
        setHoopWaiting(true);
      }
    });
  }

  // ── completeHoop: user held the zone for HOLD_MS_T ms — success! ─────────────
  // Flash green for 400 ms, then slide the hoop off left and queue the next one.
  function completeHoop() {
    holdTimerRef.current   = null;
    inTargetRef.current    = false;
    hoopWaitingRef.current = false;
    setHoopWaiting(false);

    // Flash green to confirm success
    setHoopColor('success');
    hapticSuccess(hapticEnabled);

    const next = hoopsDoneRef.current + 1;
    hoopsDoneRef.current = next;
    setHoopsDone(next);

    setTimeout(() => {
      // Slide completed hoop off the left edge (700 ms exit)
      Animated.timing(hoopXAnim, {
        toValue:  -HOOP_W,
        duration: 700,
        useNativeDriver: false,
      }).start(() => {
        if (next >= TOTAL_HOOPS_T) {
          // All hoops done — proceed to backend analysis and result screen
          finishExercise();
        } else {
          // Advance hoop index and immediately start the next approach
          const nextIdx = hoopIndexRef.current + 1;
          hoopIndexRef.current = nextIdx;
          setHoopIndex(nextIdx);
          startNextHoop();
        }
      });
    }, 400); // 400 ms flash duration before exit
  }

  // ── skipHoop: user missed MAX_HOOP_MISSES times — advance without credit ─────
  // Flash orange (≠ success green) so the user visually understands it moved on
  // due to misses, not a completion. Still increments hoopsDone so progress
  // tracks total hoops attempted (the session always finishes at TOTAL_HOOPS_T).
  function skipHoop() {
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current   = null;
    inTargetRef.current    = false;
    hoopWaitingRef.current = false;
    setHoopWaiting(false);

    setHoopColor('skipped');

    const next = hoopsDoneRef.current + 1;
    hoopsDoneRef.current = next;
    setHoopsDone(next);

    setTimeout(() => {
      Animated.timing(hoopXAnim, {
        toValue:  -HOOP_W,
        duration: 700,
        useNativeDriver: false,
      }).start(() => {
        if (next >= TOTAL_HOOPS_T) {
          finishExercise();
        } else {
          const nextIdx = hoopIndexRef.current + 1;
          hoopIndexRef.current = nextIdx;
          setHoopIndex(nextIdx);
          startNextHoop();
        }
      });
    }, 400);
  }

  // ── finishExercise: all hoops complete — upload recording for pitch analysis ──
  // Called when all hoops are done. Grabs the recording URI, stops recording,
  // then sends audio to the backend for real pitch-range analysis before advancing.
  async function finishExercise() {
    phaseRef.current = 'done';
    hapticSuccess(hapticEnabled);
    // Save URI before stopping — getURI() returns null after stopAndUnloadAsync
    const uri = recordingRef.current?.getURI?.() ?? null;
    await cleanup();
    setPhase('analyzing');

    // Default to analysisFallbackScore (100 in training sessions — lenient; 50 in
    // baseline — avoids placing a cold-start user at pitch tier 3 they never demonstrated).
    let score = analysisFallbackScore;
    let rangeHz = null;
    let analysisAttempted = false;

    if (uri) {
      analysisAttempted = true;
      try {
        // Cap backend wait at 6 s so we never block the user for too long
        const data = await Promise.race([
          analyzeGlideRecording(uri),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
        ]);
        rangeHz = data?.features?.f0_range_hz ?? null;
        if (rangeHz != null) {
          // Scale against this tier's pitchRangeHz target: achieving that many Hz earns 100.
          // 15 Hz is the floor below which the glide is too small to be clinically meaningful.
          const target = tierConfig.pitchRangeHz;
          score = Math.min(100, Math.round(Math.max(0, (rangeHz - 15) / Math.max(1, target - 15)) * 100));
        }
      } catch (_) {}
    }

    // Log fallback events so cold-start failure rates can be monitored
    if (analysisAttempted && rangeHz === null) {
      logUsageEvent({ event: 'pitch_analysis_fallback' }).catch(() => {});
    }

    setPitchResult(rangeHz != null ? Math.round(rangeHz) : null);
    setPhase('result');
    setTimeout(() => onComplete(score), 2400);
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

  // Prompt text: shows low/high instruction during approach, hold prompt once waiting.
  // We switch to the hold version when hoopWaiting becomes true because at that
  // moment the hoop has reached the dolphin and the actual hold window is open.
  const targetHigh = hoopIndex % 2 !== 0;
  const promptText =
    micError          ? 'Mic unavailable'       :
    phase === 'calibrating' ? 'Listening to room…'  :
    isPostExercise    ? ''                       :
    hoopWaiting       ? (targetHigh ? 'Hold HIGH' : 'Hold LOW')
                      : (targetHigh ? 'Go HIGH — loud and high' : 'Keep your voice LOW');

  // Hoop stroke colour: green = completed, orange = skipped, white = in progress
  const hoopStroke =
    hoopColor === 'success' ? '#68D88C' :
    hoopColor === 'skipped' ? ORANGE    :
    'rgba(195,222,206,0.92)';

  // Hoop vertical centre: even-index = LOW (76% down), odd-index = HIGH (22% down).
  // These percentages keep the hoop targets clearly separated from each other
  // and from the volume bar on the left.
  const hoopTargetCenterY = hoopIndex % 2 === 0
    ? PLAY_TOP + PLAY_H * 0.76   // LOW zone
    : PLAY_TOP + PLAY_H * 0.22;  // HIGH zone

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

      {/* Header buttons */}
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

      {/* Prompt text — hidden during post-exercise overlay */}
      {!isPostExercise && <Text style={exs.prompt}>{promptText}</Text>}

      {/* Dot progress bar — one dot per hoop */}
      <DotProgressBar done={hoopsDone} total={TOTAL_HOOPS_T} />

      {/* Scrolling hoop — rendered as an inline SVG on an Animated.View.
          translateX uses Animated.subtract so the ellipse centre (not left edge)
          aligns with hoopXAnim. translateY positions the hoop vertically. */}
      {!isPostExercise && (
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            // Centre the hoop horizontally at hoopXAnim
            transform: [
              { translateX: Animated.subtract(hoopXAnim, HOOP_W / 2) },
              { translateY: hoopTargetCenterY - HOOP_H / 2 },
            ],
            zIndex: 8,
          }}
        >
          <Svg width={HOOP_W} height={HOOP_H}>
            <Ellipse
              cx={HOOP_W / 2}
              cy={HOOP_H / 2}
              rx={HOOP_W / 2 - 3}
              ry={HOOP_H / 2 - 3}
              stroke={hoopStroke}
              strokeWidth={3.5}
              fill="none"
            />
          </Svg>
        </Animated.View>
      )}

      {/* Dolphin — fixed at DOLPHIN_X, moves vertically with pitchAnim */}
      <Animated.View
        style={{
          position: 'absolute',
          left: DOLPHIN_X - DOLPH_W / 2,
          top: 0,
          transform: [{ translateY: dolphinY }],
          zIndex: 10,
        }}
      >
        <Image
          source={require('../../../../assets/images/Dolphin2.png')}
          style={{ width: DOLPH_W, height: DOLPH_H, resizeMode: 'contain' }}
        />
      </Animated.View>

      {/* Volume bar — fills from bottom based on current vocal level */}
      <View style={{
        position: 'absolute', left: VBAR_LEFT, top: VBAR_TOP,
        width: VBAR_W, height: VBAR_H,
        borderRadius: VBAR_W / 2, backgroundColor: TEAL_MID,
        overflow: 'hidden', justifyContent: 'flex-end',
      }}>
        <Animated.View style={{
          width: '100%',
          height: volBarAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          backgroundColor: ORANGE,
          borderRadius: VBAR_W / 2,
        }} />
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
// The dolphin's Y position maps directly to normalised pitch (0 = low, 1 = high).
// No audio recording needed — pitch is detected and scored in real time.
//
// SCROLLING HOOP GAME LOGIC: identical to iOS — startNextHoop / completeHoop /
// skipHoop work the same way; only the input source (WebView vs expo-av) differs.
// ══════════════════════════════════════════════════════════════════════════════
function ExerciseScreenAndroid({ onComplete, onExit, onShowDemo, onSkip, tier = 1, analysisFallbackScore = 100 }) {
  const { top: safeTop } = useSafeAreaInsets();
  const hapticEnabled = useHapticFeedback();
  const largeText = useLargeText();
  const fsl = (n) => largeText ? Math.round(n * 1.25) : n;

  const tierConfig    = PITCH_TIERS[Math.max(0, Math.min(4, tier - 1))];
  const TOTAL_HOOPS_T = tierConfig.totalHoops;
  const HOLD_MS_T     = tierConfig.holdMs;

  // Same play corridor as iOS — computed from safeTop so it respects status bars
  const PLAY_TOP    = safeTop + fv(155);
  const PLAY_BOTTOM = H - fv(90);
  const PLAY_H      = PLAY_BOTTOM - PLAY_TOP;

  const [hoopsDone,       setHoopsDone]       = useState(0);
  const [hoopIndex,       setHoopIndex]       = useState(0);
  const [hoopColor,       setHoopColor]       = useState('normal');
  const [hoopWaiting,     setHoopWaiting]     = useState(false);
  const [phase,           setPhase]           = useState('loading'); // loading|calibrating|listening|done
  const [micError,        setMicError]        = useState(false);
  const [showHelpOverlay, setShowHelpOverlay] = useState(false);

  const hoopsDoneRef  = useRef(0);
  const hoopIndexRef  = useRef(0);
  const hoopMissesRef = useRef(0);
  const hoopWaitingRef = useRef(false);
  const phaseRef      = useRef('loading');
  const holdTimerRef  = useRef(null);
  const inTargetRef   = useRef(false);
  const calTimerRef   = useRef(null);
  const webViewRef    = useRef(null);
  // Collect valid Hz readings during the exercise to compute actual pitch range at end.
  const hzSamplesRef  = useRef([]);

  const pitchAnim  = useRef(new Animated.Value(0)).current;
  const volBarAnim = useRef(new Animated.Value(0)).current;
  const hoopXAnim  = useRef(new Animated.Value(W + HOOP_W)).current;

  // Dolphin Y: same as iOS — pitchAnim=0 → bottom, pitchAnim=1 → top
  const dolphinY = pitchAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [PLAY_BOTTOM - DOLPH_H / 2, PLAY_TOP - DOLPH_H / 2],
  });

  useEffect(() => {
    return () => {
      if (calTimerRef.current) clearTimeout(calTimerRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      try { webViewRef.current?.postMessage('stop'); } catch (_) {}
    };
  }, []);

  // ── Handle messages from the WebView pitch detector ────────────────────────
  // The WebView posts: { ready } → { cal/baselineDone } → { hz, rms, norm } loop.
  // We use the same zone check logic as iOS, gated behind hoopWaitingRef.
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
        // Baseline pitch set — begin the exercise and start the first hoop
        phaseRef.current = 'listening';
        setPhase('listening');
        startNextHoop();
      } else if (data.error) {
        setMicError(true);
      } else if (data.hz !== undefined && phaseRef.current === 'listening') {
        const norm = data.norm ?? 0;
        const rms  = data.rms  ?? 0;
        const hz   = data.hz;

        // Animate dolphin only when pitch is detected (hz > 0)
        if (hz > 0) {
          Animated.timing(pitchAnim,  { toValue: norm,               duration: 100, useNativeDriver: false }).start();
          // Accumulate valid Hz readings for post-exercise range scoring (70–500 Hz = human voice)
          if (hz >= 70 && hz <= 500) hzSamplesRef.current.push(hz);
        }
        Animated.timing(volBarAnim, { toValue: Math.min(1, rms * 6), duration: 80,  useNativeDriver: false }).start();

        // No pitch or too quiet → exit zone if we were in it
        if (hz <= 0 || rms < 0.012) {
          if (inTargetRef.current) {
            inTargetRef.current = false;
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
          }
          return;
        }

        // Zone check — gated behind hoopWaitingRef same as iOS.
        // Even hoop index → LOW zone; odd → HIGH zone.
        const targetHigh = hoopIndexRef.current % 2 !== 0;
        const inZone = hoopWaitingRef.current && (
          targetHigh
            ? norm >= TARGET_HI_MIN
            : (norm >= TARGET_LO_MIN && norm <= TARGET_LO_MAX)
        );

        if (inZone && !inTargetRef.current) {
          inTargetRef.current  = true;
          holdTimerRef.current = setTimeout(completeHoop, HOLD_MS_T);
        } else if (!inZone && inTargetRef.current) {
          inTargetRef.current = false;
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
          hoopMissesRef.current += 1;
          if (hoopMissesRef.current >= MAX_HOOP_MISSES) {
            skipHoop();
          }
        }
      }
    } catch (_) {}
  }

  // ── startNextHoop: identical logic to iOS version ───────────────────────────
  function startNextHoop() {
    hoopMissesRef.current = 0;
    setHoopColor('normal');
    hoopXAnim.setValue(W + HOOP_W);
    hoopWaitingRef.current = false;
    setHoopWaiting(false);

    Animated.timing(hoopXAnim, {
      toValue:  DOLPHIN_X,
      duration: 1800,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        hoopWaitingRef.current = true;
        setHoopWaiting(true);
      }
    });
  }

  // ── completeHoop: user held the zone long enough — success ──────────────────
  function completeHoop() {
    holdTimerRef.current   = null;
    inTargetRef.current    = false;
    hoopWaitingRef.current = false;
    setHoopWaiting(false);

    setHoopColor('success');
    hapticSuccess(hapticEnabled);

    const next = hoopsDoneRef.current + 1;
    hoopsDoneRef.current = next;
    setHoopsDone(next);

    setTimeout(() => {
      Animated.timing(hoopXAnim, {
        toValue:  -HOOP_W,
        duration: 700,
        useNativeDriver: false,
      }).start(() => {
        if (next >= TOTAL_HOOPS_T) {
          // All hoops done — compute score from Hz samples and complete
          phaseRef.current = 'done';
          setPhase('done');
          hapticSuccess(hapticEnabled);
          try { webViewRef.current?.postMessage('stop'); } catch (_) {}

          // Score from actual pitch range achieved during the session.
          // 15 Hz floor = barely any glide; tierConfig.pitchRangeHz = full tier target (100).
          // analysisFallbackScore used when fewer than 20 samples collected.
          const validHz = hzSamplesRef.current;
          let score = analysisFallbackScore;
          if (validHz.length >= 20) {
            const rangeHz = Math.max(...validHz) - Math.min(...validHz);
            score = Math.max(30, Math.min(100, Math.round(
              Math.max(0, (rangeHz - 15) / Math.max(1, tierConfig.pitchRangeHz - 15)) * 100
            )));
          }
          setTimeout(() => onComplete(score), 1200);
        } else {
          const nextIdx = hoopIndexRef.current + 1;
          hoopIndexRef.current = nextIdx;
          setHoopIndex(nextIdx);
          startNextHoop();
        }
      });
    }, 400);
  }

  // ── skipHoop: too many misses — flash orange and advance ────────────────────
  function skipHoop() {
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current   = null;
    inTargetRef.current    = false;
    hoopWaitingRef.current = false;
    setHoopWaiting(false);

    setHoopColor('skipped');

    const next = hoopsDoneRef.current + 1;
    hoopsDoneRef.current = next;
    setHoopsDone(next);

    setTimeout(() => {
      Animated.timing(hoopXAnim, {
        toValue:  -HOOP_W,
        duration: 700,
        useNativeDriver: false,
      }).start(() => {
        if (next >= TOTAL_HOOPS_T) {
          phaseRef.current = 'done';
          setPhase('done');
          try { webViewRef.current?.postMessage('stop'); } catch (_) {}
          const validHz = hzSamplesRef.current;
          let score = analysisFallbackScore;
          if (validHz.length >= 20) {
            const rangeHz = Math.max(...validHz) - Math.min(...validHz);
            score = Math.max(30, Math.min(100, Math.round(
              Math.max(0, (rangeHz - 15) / Math.max(1, tierConfig.pitchRangeHz - 15)) * 100
            )));
          }
          setTimeout(() => onComplete(score), 1200);
        } else {
          const nextIdx = hoopIndexRef.current + 1;
          hoopIndexRef.current = nextIdx;
          setHoopIndex(nextIdx);
          startNextHoop();
        }
      });
    }, 400);
  }

  function showHelp() {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    inTargetRef.current = false;
    setShowHelpOverlay(true);
  }
  function closeHelp() { setShowHelpOverlay(false); inTargetRef.current = false; }

  const targetHigh = hoopIndex % 2 !== 0;
  const promptText =
    micError                ? 'Mic unavailable'          :
    phase === 'done'        ? 'Amazing!'                 :
    phase === 'calibrating' ? "Say 'ahh' to calibrate…" :
    phase === 'loading'     ? 'Starting…'               :
    hoopWaiting             ? (targetHigh ? 'Hold HIGH' : 'Hold LOW')
                            : (targetHigh ? 'Go HIGH — loud and high' : 'Keep your voice LOW');

  const hoopStroke =
    hoopColor === 'success' ? '#68D88C' :
    hoopColor === 'skipped' ? ORANGE    :
    'rgba(195,222,206,0.92)';

  const hoopTargetCenterY = hoopIndex % 2 === 0
    ? PLAY_TOP + PLAY_H * 0.76
    : PLAY_TOP + PLAY_H * 0.22;

  const isDone = phase === 'done';

  return (
    <View style={{ flex: 1, backgroundColor: TEAL_DARK }}>
      <StatusBar barStyle="light-content" />
      <BottomWave />

      {/* Hidden WebView — handles mic and autocorrelation pitch detection.
          IMPORTANT: width/height must be at least 1px on Android. A 0×0 WebView
          does not execute JavaScript on Android, causing the exercise to hang at
          "Starting…" indefinitely. opacity:0 keeps it invisible. */}
      <WebView
        ref={webViewRef}
        source={{ html: PITCH_WEBVIEW_HTML, baseUrl: 'https://localhost' }}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
        onMessage={onWebViewMessage}
        onError={() => setMicError(true)}
        javaScriptEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={['*']}
        androidLayerType="hardware"
        onPermissionRequest={(e) => {
          // Grant microphone access — try both API shapes across react-native-webview versions
          try { e.nativeEvent.request.grant(e.nativeEvent.resources); } catch (_) {}
          try { e.nativeEvent.grant(e.nativeEvent.resources); } catch (_) {}
        }}
        onLoad={() => {
          // Small delay before posting 'start' — onLoad fires when HTML is parsed
          // but the window.addEventListener('message') listener inside the inline
          // script may not be attached yet on the first JS tick on Android.
          setTimeout(() => {
            try { webViewRef.current?.postMessage('start'); } catch (_) {}
          }, 150);
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

      {/* Header buttons */}
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
      <DotProgressBar done={hoopsDone} total={TOTAL_HOOPS_T} />

      {/* Scrolling hoop */}
      {!isDone && (
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transform: [
              { translateX: Animated.subtract(hoopXAnim, HOOP_W / 2) },
              { translateY: hoopTargetCenterY - HOOP_H / 2 },
            ],
            zIndex: 8,
          }}
        >
          <Svg width={HOOP_W} height={HOOP_H}>
            <Ellipse
              cx={HOOP_W / 2}
              cy={HOOP_H / 2}
              rx={HOOP_W / 2 - 3}
              ry={HOOP_H / 2 - 3}
              stroke={hoopStroke}
              strokeWidth={3.5}
              fill="none"
            />
          </Svg>
        </Animated.View>
      )}

      {/* Dolphin — fixed at DOLPHIN_X, moves vertically */}
      <Animated.View
        style={{
          position: 'absolute',
          left: DOLPHIN_X - DOLPH_W / 2,
          top: 0,
          transform: [{ translateY: dolphinY }],
          zIndex: 10,
        }}
      >
        <Image
          source={require('../../../../assets/images/Dolphin2.png')}
          style={{ width: DOLPH_W, height: DOLPH_H, resizeMode: 'contain' }}
        />
      </Animated.View>

      {/* Volume / activity bar */}
      <View style={{
        position: 'absolute', left: VBAR_LEFT, top: VBAR_TOP,
        width: VBAR_W, height: VBAR_H,
        borderRadius: VBAR_W / 2, backgroundColor: TEAL_MID,
        overflow: 'hidden', justifyContent: 'flex-end',
      }}>
        <Animated.View style={{
          width: '100%',
          height: volBarAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          backgroundColor: ORANGE,
          borderRadius: VBAR_W / 2,
        }} />
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
  prompt: {
    position: 'absolute',
    top: fv(100),
    left: 0,
    right: 0,
    zIndex: 25,
    color: WHITE,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
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
// Root export
// ══════════════════════════════════════════════════════════════════════════════
const STEP_TUTORIAL = 0;
const STEP_EXERCISE = 1;

// On Android the fallback is used when fewer than 20 pitch samples were collected
// (very fast completion or mic issue). 100 was too generous — a user who barely
// phonated would score perfectly. 60 is a neutral "completed but unmeasured" score
// that lets the nudge system treat it as a mid-range result.
// On iOS the fallback covers a backend failure after all hoops complete — 100 is
// still appropriate there because the user demonstrably held all hoops.
// BaselineSessionScreen always passes analysisFallbackScore=50 explicitly, overriding this default.
export default function PitchGlidesExercise({
  onComplete,
  onExit,
  onSkip,
  tier = 1,
  exerciseIndex = 0,
  totalExercises = 8,
  analysisFallbackScore = Platform.OS === 'android' ? 60 : 100,
}) {
  // null = AsyncStorage check in progress; avoids a one-frame flash to the intro.
  const [step, setStep] = useState(null);

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
      analysisFallbackScore={analysisFallbackScore}
    />
  );
}
