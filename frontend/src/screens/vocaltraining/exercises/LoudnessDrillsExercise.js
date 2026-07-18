/**
 * LoudnessDrillsExercise — LSVT-inspired whack-a-jellyfish loudness training.
 *
 * Clinical rationale (LSVT LOUD):
 *   Hypophonia (reduced loudness) is the most disabling speech symptom in
 *   Parkinson's disease. Patients systematically underestimate their volume.
 *   This exercise provides immediate visual feedback: a jellyfish pops from a
 *   random hole and must be "whacked" by loud phonation before the timer runs
 *   out. Starting with "UH" isolates vocal effort; advancing to functional words
 *   generalises the loud voice to everyday speech.
 *
 * Flow:
 *   1. First visit → 4-screen demo (title + 3 instruction overlays over scene).
 *   2. Jellyfish rises from a random hole, word card shows what to say.
 *   3. Loud enough voice (≥ threshold, sustained) → jellyfish flies off (whacked).
 *   4. Timer expires → jellyfish sinks back, same word retried.
 *   5. 5 successful whacks → onComplete().
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Animated,
  Dimensions,
  StatusBar,
  StyleSheet,
  ImageBackground,
} from 'react-native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CantDoNow from '../../../components/CantDoNow';
import { fetchWithAuth } from '../../../utils/authHeaders';
import { API_BASE_URL } from '../../../config/env';
import ScreenHeader from '../../../components/ScreenHeader';
import SpeakerButton from '../../../components/SpeakerButton';

const { width: W, height: H } = Dimensions.get('window');

// ── Config ──────────────────────────────────────────────────────────────────────
const DEMO_KEY        = '@eloqua_loudness_drills_demo_seen';
// Reduced from 700 ms to 400 ms so that users who speak the word clearly but briefly
// (e.g. elderly users with reduced breath support) still register a successful whack.
const MIN_SPEAK_MS    = 400;   // must sustain threshold for this long (ms)
const CALIBRATION_MS  = 1500;  // ambient noise sampling window
const MAX_THRESHOLD   = 0.70;

// ── Tier configuration (difficulty_tier 1–5) ───────────────────────────────────
// minVolume: adaptive threshold floor (0–1 normalised dB)
// timerMs:   countdown per round in ms (scales with content length)
// rounds:    content array — short/punchy at low tiers, longer phrases at high tiers
//
// Tier 1 uses single words deliberately — a single loud burst isolates pure vocal
// effort with no articulatory demand. This is closest to LSVT LOUD's "UH" baseline.
const LOUDNESS_TIER_CONFIG = [
  // Tier 1: single punchy words, 3 s timer, 45% threshold
  {
    minVolume: 0.45, timerMs: 3000,
    rounds: [
      { word: 'GO',   tip: 'Big voice!' },
      { word: 'LOUD', tip: 'Project it!' },
      { word: 'NOW',  tip: 'Yes!' },
      { word: 'YES',  tip: 'Great!' },
      { word: 'HEY',  tip: "That's it!" },
    ],
  },
  // Tier 2: short 2-word phrases, 3.5 s timer, 50% threshold
  {
    minVolume: 0.50, timerMs: 3500,
    rounds: [
      { word: 'Speak up!',   tip: 'Nice and loud!' },
      { word: 'Say it!',     tip: 'Big voice!' },
      { word: 'Loud voice!', tip: "You've got this!" },
      { word: 'Come on!',    tip: 'Project!' },
      { word: 'Big voice!',  tip: 'Excellent!' },
    ],
  },
  // Tier 3: 3–4 word phrases, 4 s timer, 55% threshold
  {
    minVolume: 0.55, timerMs: 4000,
    rounds: [
      { word: 'Hear me now!',    tip: 'Keep projecting!' },
      { word: 'Loud and clear!', tip: 'Big voice!' },
      { word: 'Listen to me!',   tip: "You're doing great!" },
      { word: 'Say it loud!',    tip: 'Keep going!' },
      { word: 'I can do this!',  tip: 'Outstanding!' },
    ],
  },
  // Tier 4: 5–6 word phrases, 5 s timer, 60% threshold
  {
    minVolume: 0.60, timerMs: 5000,
    rounds: [
      { word: 'Please listen to me now',       tip: 'Amazing!' },
      { word: 'I am speaking up today',        tip: 'Keep it up!' },
      { word: 'My voice is getting stronger',  tip: 'Excellent!' },
      { word: 'Loud and clear every time',     tip: 'Big voice!' },
      { word: 'I want to be heard',            tip: 'Wonderful!' },
    ],
  },
  // Tier 5: 7–8 word phrases, 6 s timer, 65% threshold
  {
    minVolume: 0.65, timerMs: 6000,
    rounds: [
      { word: 'Good morning I hope you can hear me',      tip: 'Incredible!' },
      { word: 'My voice is strong and getting stronger',  tip: 'Keep projecting!' },
      { word: 'I practise my voice every single day',     tip: 'Outstanding!' },
      { word: 'Please listen I have something to say',    tip: 'Loud and clear!' },
      { word: 'Every day my speaking gets better',        tip: 'Phenomenal!' },
    ],
  },
];

const RISE_MS         = 700;   // jellyfish rising animation (ms)
const WHACK_MS        = 480;   // jellyfish whack-fly animation (ms)
const SINK_MS         = 500;   // jellyfish sinking animation (ms)
const BETWEEN_MS      = 900;   // pause between rounds (ms)
// Volume floor for "audible but too soft" detection — triggers the LOUDER! prompt.
// Kept low so even very quiet speakers see feedback rather than silence.
const SOFT_DETECT_VOL = 0.12;

// ── Colours ─────────────────────────────────────────────────────────────────────
const BG        = '#1C4047';
const CYL_FILL  = '#4493A0';
const CYL_HIGH  = '#5DBDCD';
const HOLE_DARK = '#061318';
const ORANGE    = '#FFA940';
const WHITE     = '#FFFFFF';
const WORD_COL  = '#1F4850';
const PILL_DONE = '#45B013';
const PILL_PEND = '#D9D9D9';


// ── Hole geometry (calibrated to WhackAMoleBG.png, 402×874 Figma frame) ────────
const B_CYL_W = 130;  // base cylinder rim width  (sz = 1.0)
const B_CYL_H = 52;   // base cylinder body height (unused – drawn in BG image)
const B_RIM_H = 22;   // base rim ellipse height

// Three holes that line up with the cylinders painted in WhackAMoleBG.png.
// xF / yF are centre-of-rim fractions; sz scales width & rim height.
const HOLE_DEFS = [
  { id: 0, xF: 0.225, yF: 0.475, sz: 1.00 }, // large cylinder – left
  { id: 1, xF: 0.838, yF: 0.518, sz: 0.60 }, // small ring – right
  { id: 2, xF: 0.268, yF: 0.635, sz: 0.87 }, // medium cylinder – bottom-left
];

const HOLES = HOLE_DEFS.map(({ id, xF, yF, sz }) => ({
  id, sz,
  cx:   W * xF,
  cy:   H * yF,
  cylW: B_CYL_W * sz,
  cylH: B_CYL_H * sz,
  rimH: B_RIM_H * sz,
}));

// Jellyfish dome base diameter — controls the overall size of the jellyfish image.
const JELLY_BASE = 92;

// Preload the jellyfish image at module level so it's ready before the first round.
const JELLY_IMAGE = require('../../../../assets/images/Jellyfish.png');

// ─────────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────────

/**
 * Jellyfish image — rises from inside the hole using the Jellyfish.png asset.
 *
 * riseAnim 0→1: hidden inside hole → fully risen above rim.
 * riseAnim > 1: whack fly-off (extrapolated translateY sends it off-screen).
 * scaleAnim: starts at 0.08 each round and grows to 1 during the rise,
 *   so the jellyfish appears to grow out of the hole rather than pop in at full size.
 *   During the whack, scaleAnim is further animated (1.28 → 0.70) for a squeeze effect.
 */
function Jellyfish({ hole, riseAnim, scaleAnim, opacityAnim }) {
  const { cx, cy, rimH, sz } = hole;

  // Scale the image with the hole — smaller holes get smaller jellyfish.
  const imgW = JELLY_BASE * sz * 1.8;
  // Jellyfish images are typically taller than wide (dome + long tentacles).
  const imgH = imgW * 1.6;

  // Treat the upper 55 % of the image as the "dome / body" and the lower 45 % as tentacles.
  // These fractions set the anchor point so the body base aligns with the hole rim,
  // matching the positioning logic used by the drawn version.
  const domeH = imgH * 0.55;
  const tentH = imgH * 0.45;

  // Hidden: body fully inside hole (domeH below rim-centre + rim thickness).
  // Risen:  tentacles just clearing the rim top (pulled up slightly).
  const hiddenY = domeH + rimH;
  const risenY  = -(tentH * 0.20);

  const translateY = riseAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [hiddenY, risenY],
    extrapolate: 'extend',  // > 1 = whack fly-off continues upward
  });

  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute',
      // Anchor: dome-bottom at rim-centre, horizontally centred on hole.
      left: cx - imgW / 2,
      top:  cy - rimH / 2 - domeH,
      width:  imgW,
      height: imgH,
      opacity: opacityAnim,
      transform: [{ translateY }, { scale: scaleAnim }],
    }}>
      <Image
        source={JELLY_IMAGE}
        style={{ width: imgW, height: imgH }}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

/** Pill card showing the word to say. Border turns green when the user nails it. */
function WordCard({ word, timerAnim, isActive, isSuccess }) {
  const CARD_W = W - 100;
  const wordCount = (word || '').split(' ').length;
  // Scale card height and font for longer phrases/sentences
  const CARD_H  = wordCount <= 3 ? 110 : wordCount <= 6 ? 130 : 150;
  const fontSize = wordCount <= 2 ? 52 : wordCount <= 4 ? 34 : wordCount <= 7 ? 24 : 18;
  const letterSp = wordCount <= 2 ? 3 : 0.5;
  // Green border + glow on success, orange otherwise
  const borderCol   = isSuccess ? '#48D28C' : ORANGE;
  const shadowCol   = isSuccess ? '#48D28C' : ORANGE;
  const shadowOpac  = isSuccess ? 0.80 : (isActive ? 0.55 : 0.20);
  return (
    <View style={{ alignSelf: 'center' }}>
      <View style={{
        borderWidth: 10, borderColor: borderCol,
        borderRadius: (CARD_H + 20) / 2,
        shadowColor: shadowCol, shadowOffset: { width: 0, height: 0 },
        shadowOpacity: shadowOpac, shadowRadius: isSuccess ? 18 : 12, elevation: isActive ? 10 : 4,
      }}>
        <View style={{
          width: CARD_W, height: CARD_H,
          backgroundColor: isSuccess ? '#48D28C' : WHITE,
          borderRadius: CARD_H / 2,
          justifyContent: 'center', alignItems: 'center',
          overflow: 'hidden',
          paddingHorizontal: 16,
        }}>
          {isActive && !isSuccess && (
            <Animated.View style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: timerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, CARD_W] }),
              backgroundColor: 'rgba(254,156,45,0.15)',
            }} />
          )}
          <Text
            style={{ fontSize, fontWeight: '800', color: isSuccess ? '#FFFFFF' : WORD_COL, letterSpacing: letterSp, textAlign: 'center', lineHeight: fontSize * 1.3 }}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            numberOfLines={4}
          >
            {word}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Pills — green when done, grey when pending. */
function ProgressPills({ doneCount, totalRounds }) {
  const pillW = (W - 96) / totalRounds - 6;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
      {Array.from({ length: totalRounds }, (_, i) => (
        <View key={i} style={{
          width: Math.max(8, pillW), height: 11, borderRadius: 6,
          backgroundColor: i < doneCount ? PILL_DONE : PILL_PEND,
        }} />
      ))}
    </View>
  );
}

const BG_IMAGE = require('../../../../assets/images/WhackAMoleBG.png');

// ─────────────────────────────────────────────────────────────────────────────────
// Demo (instruction) screen — single screen, same format as SustainedPhonation
// ─────────────────────────────────────────────────────────────────────────────────

const DEMO_STEPS = [
  { step: '1', text: 'A word appears on screen.' },
  { step: '2', text: 'Say it out LOUD before the timer runs out.' },
  { step: '3', text: "Loud enough = jellyfish gone. Five done = complete!" },
];

// Read aloud by SpeakerButton before the user starts
const LOUDNESS_INTRO_TEXT =
  "Loudness Drills. A word appears — say it out LOUD before the timer runs out. " +
  "Loud enough and the jellyfish flies off. Complete five to finish.";

function DemoScreen({ onFinish, onExit, sessionFill = 0.38 }) {
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />

      <ScreenHeader
        navigation={null}
        title="Instructions"
        backIcon="✕"
        backLabel="Exit exercise"
        onBack={onExit}
        rightAction={<SpeakerButton text={LOUDNESS_INTRO_TEXT} />}
      />

      <Text style={ds.bigTitle} numberOfLines={1} adjustsFontSizeToFit>Loudness Drills</Text>

      {/* 3-step instruction card */}
      <View style={ds.card}>
        {DEMO_STEPS.map(({ step, text }) => (
          <View key={step} style={ds.row}>
            <View style={ds.badge}>
              <Text style={ds.badgeNum}>{step}</Text>
            </View>
            <Text style={ds.stepText}>{text}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={ds.startBtn}
        onPress={onFinish}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Begin exercise"
      >
        <Text style={ds.startText}>Let's Go  →</Text>
      </TouchableOpacity>

      {/* Session progress bar */}
      <View style={ds.sessionBar}>
        <View style={[ds.sessionBarFill, { width: `${sessionFill * 100}%` }]} />
      </View>
    </View>
  );
}

const ds = StyleSheet.create({
  bigTitle: {
    fontSize: 44, fontWeight: '800', color: WHITE,
    textAlign: 'center', letterSpacing: 1.0,
    marginTop: 8, marginBottom: 32, paddingHorizontal: 24,
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
    alignSelf: 'center', marginTop: 36,
    backgroundColor: ORANGE, borderRadius: 28,
    paddingHorizontal: 40, paddingVertical: 20,
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },
  startText: { color: '#1A1A1A', fontSize: 18, fontWeight: '700', letterSpacing: 0.4 },
  sessionBar: {
    position: 'absolute', bottom: 28, left: 47,
    width: W - 94, height: 12, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  sessionBarFill: { height: '100%', borderRadius: 13, backgroundColor: ORANGE },
});

// ── Word verification ─────────────────────────────────────────────────────────────
// Sends the captured drill audio to Whisper and checks whether the user said
// the expected phrase. Returns true (pass) on any API failure so that network
// errors never block the user from completing a round.
//
// Threshold (40 %): intentionally lenient because:
//   1. Hypokinetic Dysarthria causes Whisper to mishear or drop words.
//   2. The primary therapeutic goal is VOLUME; word accuracy is secondary.
//   3. False rejections (telling a patient they said wrong words when they didn't)
//      are clinically harmful and demoralising.
async function checkWordsMatch(uri, expectedPhrase) {
  try {
    const form = new FormData();
    form.append('file',        { uri, type: 'audio/m4a', name: 'drill.m4a' });
    form.append('chunk_index', '0');
    form.append('model',       'whisper');

    const ctrl = new AbortController();
    // 2.5 s timeout — short clips transcribe quickly; longer waits feel broken.
    // On timeout we fall back to passing so the drill is never stuck.
    const tid  = setTimeout(() => ctrl.abort(), 2500);
    const res  = await fetchWithAuth(`${API_BASE_URL}/api/transcribe-chunk`, {
      method: 'POST',
      body:   form,
      signal: ctrl.signal,
    }).finally(() => clearTimeout(tid));

    if (!res.ok) return true;

    const data       = await res.json();
    const spoken     = (data.raw_text || '').toLowerCase().trim();

    // No transcription: Whisper heard nothing recognisable.
    // Volume was sufficient so this is likely a dysarthria recognition failure — pass.
    if (!spoken) return true;

    // Fuzzy word match: strip punctuation, count how many expected words appear in
    // the transcription. 40 % required so short function words can be dropped without
    // causing a false rejection.
    const expected   = expectedPhrase.toLowerCase().replace(/[,.'!?]/g, '').split(/\s+/);
    const matchCount = expected.filter(w => spoken.includes(w)).length;
    return (matchCount / expected.length) >= 0.40;
  } catch {
    return true; // timeout, network error, or auth failure → don't penalise
  }
}

// ─────────────────────────────────────────────────────────────────────────────────
// Exercise screen (main game)
// ─────────────────────────────────────────────────────────────────────────────────

const IDLE_PROMPT_MESSAGES = [
  "You've got this!\nTry saying it loud!",
  "Take a breath\nand give it a go!",
  "Come on, your voice\nis powerful!",
  "Whenever you're ready,\nwe believe in you!",
];

function ExerciseScreen({ onComplete, onExit, onShowDemo, onSkip, tier = 1 }) {
  const { top: safeTop } = useSafeAreaInsets();
  const tierConfig = LOUDNESS_TIER_CONFIG[Math.max(0, Math.min(4, tier - 1))];
  const TOTAL_ROUNDS = tierConfig.rounds.length;
  const [phase, setPhase]           = useState('idle');
  const [roundIdx, setRoundIdx]     = useState(0);
  const [doneCount, setDoneCount]   = useState(0);
  const [activeHoleId, setActiveHoleId] = useState(null);
  const [idleMsg, setIdleMsg]       = useState('');
  // Shown during 'checking' (neutral) and 'wrongword' (orange-tinted) phases
  const [wordCheckMsg, setWordCheckMsg] = useState('');
  // Green flash on the WordCard when the user says the word correctly
  const [wordSuccess, setWordSuccess] = useState(false);
  // "LOUDER!" prompt shown when the user speaks but not loud enough
  const [tooSoftMsg, setTooSoftMsg] = useState('');
  // showHelpOverlay: true when ? is pressed — exercise paused, overlay shown
  const [showHelpOverlay, setShowHelpOverlay] = useState(false);

  const riseAnim    = useRef(new Animated.Value(0)).current;
  const scaleAnim   = useRef(new Animated.Value(1)).current;
  const opacAnim    = useRef(new Animated.Value(1)).current;
  const timerAnim   = useRef(new Animated.Value(1)).current;
  const volumeAnim  = useRef(new Animated.Value(0)).current;
  const idleOverlay = useRef(new Animated.Value(0)).current;

  const phaseRef          = useRef('idle');
  const roundIdxRef       = useRef(0);
  const missCountRef      = useRef(0);   // V2: track missed rounds for scoring
  const recordingRef      = useRef(null);
  const speakRef          = useRef(null);
  const countdownRef      = useRef(null);
  const lastHoleRef       = useRef(null);
  const adaptiveThreshRef = useRef(tierConfig.minVolume);
  const ambientSamplesRef = useRef([]);
  const calibrateTimerRef = useRef(null);
  const idleTimerRef      = useRef(null);
  const idleMsgIdxRef     = useRef(0);
  // Fires when the user speaks but below threshold — shows "LOUDER!" prompt
  const softTimerRef      = useRef(null);

  function setPhaseS(p) { phaseRef.current = p; setPhase(p); }
  function setRoundS(n) { roundIdxRef.current = n; setRoundIdx(n); }

  // Calibrate ambient noise, then start first round
  useEffect(() => {
    calibrateAmbient();
    return () => {
      if (calibrateTimerRef.current) clearTimeout(calibrateTimerRef.current);
      cleanup();
    };
  }, []);

  async function calibrateAmbient() {
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
        (status) => {
          if (!status.isRecording) return;
          const db  = status.metering ?? -160;
          const vol = Math.min(1, Math.max(0, (db + 70) / 60));
          ambientSamplesRef.current.push(vol);
        },
        80,
      );
      calibrateTimerRef.current = setTimeout(async () => {
        calibrateTimerRef.current = null;
        const samples = ambientSamplesRef.current;
        if (samples.length > 0) {
          const sorted = [...samples].sort((a, b) => a - b);
          const p90 = sorted[Math.floor(sorted.length * 0.90)] ?? tierConfig.minVolume;
          adaptiveThreshRef.current = Math.min(MAX_THRESHOLD, Math.max(tierConfig.minVolume, p90 * 1.6 + 0.12));
        }
        try { await recording.stopAndUnloadAsync(); } catch (_) {}
        startRound();
      }, CALIBRATION_MS);
    } catch (_) {
      adaptiveThreshRef.current = tierConfig.minVolume;
      startRound();
    }
  }

  function pickHole() {
    const candidates = lastHoleRef.current != null
      ? HOLES.filter(h => h.id !== lastHoleRef.current)
      : HOLES;
    const h = candidates[Math.floor(Math.random() * candidates.length)];
    lastHoleRef.current = h.id;
    setActiveHoleId(h.id);
    return h;
  }

  function startRound() {
    if (phaseRef.current === 'done') return;
    pickHole();

    riseAnim.setValue(0);
    // Start tiny — scaleAnim grows to 1 in sync with the rise so the jellyfish
    // appears to swell out of the hole rather than appearing at full size.
    scaleAnim.setValue(0.08);
    opacAnim.setValue(1);
    timerAnim.setValue(1);

    setPhaseS('rising');
    Animated.parallel([
      Animated.timing(riseAnim,  { toValue: 1, duration: RISE_MS, useNativeDriver: false }),
      Animated.timing(scaleAnim, { toValue: 1, duration: RISE_MS, useNativeDriver: false }),
    ]).start(({ finished }) => {
      if (finished) beginWaiting();
    });
  }

  function startIdleTimer() {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      const msg = IDLE_PROMPT_MESSAGES[idleMsgIdxRef.current % IDLE_PROMPT_MESSAGES.length];
      idleMsgIdxRef.current += 1;
      setIdleMsg(msg);
      Animated.sequence([
        Animated.timing(idleOverlay, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(2800),
        Animated.timing(idleOverlay, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start(() => setIdleMsg(''));
    }, 6000);
  }

  function clearIdleTimer() {
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    Animated.timing(idleOverlay, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }

  async function beginWaiting() {
    setPhaseS('waiting');
    await startMic();
    startIdleTimer();
    countdownRef.current = setTimeout(handleMiss, tierConfig.timerMs);
    Animated.timing(timerAnim, { toValue: 0, duration: tierConfig.timerMs, useNativeDriver: false }).start();
  }

  async function startMic() {
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
        80,
      );
      recordingRef.current = recording;
    } catch (_) { /* mic unavailable — timer still works */ }
  }

  function onMeter(status) {
    if (!status.isRecording) return;
    const db  = status.metering ?? -160;
    const vol = Math.min(1, Math.max(0, (db + 70) / 60));
    Animated.timing(volumeAnim, { toValue: vol, duration: 80, useNativeDriver: false }).start();

    if (vol >= adaptiveThreshRef.current) {
      // Loud enough — clear any "too soft" warning and start the whack timer
      if (softTimerRef.current) { clearTimeout(softTimerRef.current); softTimerRef.current = null; }
      setTooSoftMsg('');
      if (!speakRef.current) {
        speakRef.current = setTimeout(() => {
          speakRef.current = null;
          if (phaseRef.current === 'waiting') handleWhack();
        }, MIN_SPEAK_MS);
      }
    } else {
      // Not loud enough — cancel any pending whack timer
      if (speakRef.current) { clearTimeout(speakRef.current); speakRef.current = null; }

      if (vol > SOFT_DETECT_VOL && phaseRef.current === 'waiting') {
        // Audible voice but below threshold: schedule "LOUDER!" after 500 ms of soft sound.
        // This gives the user a moment before we prompt them — avoids being jarring.
        if (!softTimerRef.current) {
          softTimerRef.current = setTimeout(() => {
            softTimerRef.current = null;
            if (phaseRef.current === 'waiting') {
              setTooSoftMsg('LOUDER!');
              // Auto-hide after 1.5 s so it doesn't linger if they go quiet
              setTimeout(() => setTooSoftMsg(''), 1500);
            }
          }, 500);
        }
      } else {
        // Silence — clear soft timer
        if (softTimerRef.current) { clearTimeout(softTimerRef.current); softTimerRef.current = null; }
      }
    }
  }

  async function cleanup() {
    if (speakRef.current)    { clearTimeout(speakRef.current);    speakRef.current    = null; }
    if (countdownRef.current){ clearTimeout(countdownRef.current); countdownRef.current= null; }
    if (idleTimerRef.current){ clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    if (softTimerRef.current){ clearTimeout(softTimerRef.current); softTimerRef.current = null; }
    timerAnim.stopAnimation();
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }
    } catch (_) {}
  }

  // Pause exercise and show inline instructions — exercise is NOT unmounted.
  function showHelp() {
    cleanup(); // clears timers + stops recording (async, fire-and-forget)
    setTooSoftMsg('');
    setWordSuccess(false);
    setWordCheckMsg('');
    setShowHelpOverlay(true);
  }

  // Dismiss overlay and restart the current round (roundIdxRef preserved).
  function closeHelp() {
    setShowHelpOverlay(false);
    if (phaseRef.current !== 'done') startRound();
  }

  async function handleWhack() {
    if (phaseRef.current !== 'waiting') return;
    clearIdleTimer();

    // Clear the "too soft" prompt — they spoke loud enough now
    if (softTimerRef.current) { clearTimeout(softTimerRef.current); softTimerRef.current = null; }
    setTooSoftMsg('');

    if (countdownRef.current) { clearTimeout(countdownRef.current); countdownRef.current = null; }
    if (speakRef.current)     { clearTimeout(speakRef.current);     speakRef.current     = null; }
    timerAnim.stopAnimation();

    // Capture the audio URI before stopping — passed to Whisper for word verification.
    const rec = recordingRef.current;
    recordingRef.current = null;
    let audioUri = null;
    try {
      if (rec) {
        await rec.stopAndUnloadAsync();
        audioUri = rec.getURI();
      }
    } catch (_) {}

    // Enter "checking" phase — jellyfish stays risen, user sees brief feedback.
    setPhaseS('checking');
    setWordCheckMsg('Checking…');

    // Read the current phrase from the ref (not state) to get the live value.
    const expectedPhrase = tierConfig.rounds[roundIdxRef.current]?.word ?? '';

    // Skip Whisper for single-word content — volume alone is sufficient evidence.
    // Single words are short enough that recognition errors are common (dysarthria)
    // and re-attempts based on word accuracy would be demoralising.
    const isSingleWord = expectedPhrase.trim().split(/\s+/).length <= 1;
    const wordsOk = (isSingleWord || !audioUri) ? true : await checkWordsMatch(audioUri, expectedPhrase);

    setWordCheckMsg('');

    if (wordsOk) {
      // Flash the WordCard green for 300 ms so the user sees clear positive feedback
      // before the jellyfish animation starts.
      setWordSuccess(true);
      setTimeout(() => {
        setWordSuccess(false);
        doWhack();
      }, 300);
    } else {
      // Wrong words: sink the jellyfish back and prompt a retry.
      // LSVT LOUD carryover tasks require accurate phrase production at high effort
      // — prompting re-attempts trains the full skill, not just volume.
      setPhaseS('wrongword');
      setWordCheckMsg('Try reading the card aloud!');
      Animated.timing(riseAnim, { toValue: 0, duration: SINK_MS, useNativeDriver: false }).start();
      setTimeout(() => {
        setWordCheckMsg('');
        if (phaseRef.current !== 'done') startRound();
      }, SINK_MS + 1200);
    }
  }

  function doWhack() {
    setPhaseS('whacked');
    Animated.parallel([
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.28, duration: 140, useNativeDriver: false }),
        Animated.timing(scaleAnim, { toValue: 0.70, duration: WHACK_MS - 140, useNativeDriver: false }),
      ]),
      Animated.timing(riseAnim,  { toValue: 2.6, duration: WHACK_MS, useNativeDriver: false }),
      Animated.timing(opacAnim,  { toValue: 0,   duration: WHACK_MS, useNativeDriver: false }),
    ]).start(() => advanceRound(true));
  }

  async function handleMiss() {
    if (phaseRef.current !== 'waiting') return;
    missCountRef.current += 1;  // V2: count misses for score calculation
    setTooSoftMsg('');
    setWordSuccess(false);
    setPhaseS('sinking');
    await cleanup();

    Animated.timing(riseAnim, { toValue: 0, duration: SINK_MS, useNativeDriver: false })
      .start(() => {
        // Retry same round
        setTimeout(() => { if (phaseRef.current !== 'done') startRound(); }, BETWEEN_MS);
      });
  }

  function advanceRound(success) {
    if (!success) {
      setTimeout(() => { if (phaseRef.current !== 'done') startRound(); }, BETWEEN_MS);
      return;
    }
    const next = roundIdxRef.current + 1;
    setDoneCount(next);
    if (next >= TOTAL_ROUNDS) {
      setPhaseS('done');
      // V2: score = successful rounds / (successful + missed rounds) × 100
      const score = Math.round((TOTAL_ROUNDS / Math.max(TOTAL_ROUNDS, TOTAL_ROUNDS + missCountRef.current)) * 100);
      setTimeout(() => onComplete(score), 1200);
      return;
    }
    setRoundS(next);
    setTimeout(() => { if (phaseRef.current !== 'done') startRound(); }, BETWEEN_MS);
  }

  const activeHole = activeHoleId != null ? HOLES.find(h => h.id === activeHoleId) : null;
  const isWaiting  = phase === 'waiting';
  const round      = tierConfig.rounds[roundIdx] ?? tierConfig.rounds[tierConfig.rounds.length - 1];

  // Sort holes back→front; split active from rest for layered rendering
  const sorted     = [...HOLES].sort((a, b) => a.cy - b.cy);
  const backHoles  = sorted.filter(h => h.id !== activeHoleId);

  return (
    <ImageBackground source={BG_IMAGE} style={{ flex: 1 }} resizeMode="cover">
      <StatusBar barStyle="light-content" />

      {/* ── Full-screen scene ── */}
      <View style={StyleSheet.absoluteFillObject}>
        {activeHole && (
          <Jellyfish
            hole={activeHole}
            riseAnim={riseAnim}
            scaleAnim={scaleAnim}
            opacityAnim={opacAnim}
          />
        )}
      </View>

      {/* ── Header row: X | counter | ? ── */}
      <View style={[ex.headerRow, { top: safeTop + 14 }]}>
        <TouchableOpacity style={ex.xBtn} onPress={onExit} accessibilityRole="button" accessibilityLabel="Exit exercise">
          <Text style={ex.xText}>✕</Text>
        </TouchableOpacity>
        <Text style={ex.counter}>{doneCount + 1}/{TOTAL_ROUNDS}</Text>
        <TouchableOpacity style={ex.helpBtn} onPress={showHelp} accessibilityRole="button" accessibilityLabel="Show instructions">
          <Text style={ex.helpText}>?</Text>
        </TouchableOpacity>
      </View>

      {/* ── Word card + instruction ── */}
      <View style={ex.cardWrap}>
        <WordCard
          word={round.word}
          timerAnim={timerAnim}
          isActive={isWaiting}
          isSuccess={wordSuccess}
        />
        <Text style={ex.instrLine}>
          {round.word.split(' ').length <= 2
            ? `Say "${round.word.toLowerCase()}" to whack a jellyfish`
            : 'Say it loud to whack a jellyfish'}
        </Text>

        {/* "LOUDER!" — shown when voice detected but below threshold */}
        {tooSoftMsg !== '' && (
          <View style={ex.tooSoftPill}>
            <Text style={ex.tooSoftText}>{tooSoftMsg}</Text>
          </View>
        )}

        {/* Word-check feedback pill — neutral for 'checking', orange-tinted for 'wrongword' */}
        {wordCheckMsg !== '' && (
          <View style={[
            ex.wordCheckPill,
            phase === 'wrongword' && ex.wordCheckPillWrong,
          ]}>
            <Text style={ex.wordCheckText}>{wordCheckMsg}</Text>
          </View>
        )}
      </View>

      {/* ── Volume bar (right side) ── */}
      <View style={ex.volBarTrack}>
        <Animated.View style={[ex.volBarFill, {
          height: volumeAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }]} />
      </View>


      {/* ── Idle encouragement overlay ── */}
      {idleMsg !== '' && (
        <Animated.View style={[ex.idleOverlay, { opacity: idleOverlay }]} pointerEvents="none">
          <Text style={ex.idleText}>{idleMsg}</Text>
        </Animated.View>
      )}

      {/* ── Can't do now ── */}
      <View style={{ position: 'absolute', bottom: 20, left: 0, right: 0, alignItems: 'center', zIndex: 35 }}>
        <CantDoNow onSkip={onSkip} onEnd={onExit} />
      </View>

      {/* Help overlay — shown when ? is pressed; exercise is paused */}
      {showHelpOverlay && (
        <View style={exHelp.overlay}>
          <View style={[exHelp.header, { paddingTop: safeTop + 14 }]}>
            <TouchableOpacity style={exHelp.closeBtn} onPress={closeHelp} accessibilityRole="button" accessibilityLabel="Close instructions">
              <Text style={exHelp.closeText}>✕</Text>
            </TouchableOpacity>
            <Text style={exHelp.headerTitle}>Instructions</Text>
            <SpeakerButton text={DEMO_STEPS.map(s => s.text).join('. ')} size={44} />
          </View>
          <Text style={exHelp.exTitle} numberOfLines={1} adjustsFontSizeToFit>Loudness Drills</Text>
          <View style={exHelp.card}>
            {DEMO_STEPS.map(({ step, text }) => (
              <View key={step} style={exHelp.row}>
                <View style={exHelp.badge}><Text style={exHelp.badgeNum}>{step}</Text></View>
                <Text style={exHelp.stepText}>{text}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={exHelp.continueBtn} onPress={closeHelp} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Continue exercise">
            <Text style={exHelp.continueText}>Continue Exercise  →</Text>
          </TouchableOpacity>
        </View>
      )}
    </ImageBackground>
  );
}

const ex = StyleSheet.create({
  headerRow: {
    position: 'absolute', left: 16, right: 16, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  xBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center', alignItems: 'center',
  },
  xText: { color: WHITE, fontSize: 20, fontWeight: '500', includeFontPadding: false, textAlign: 'center', lineHeight: 20 },
  counter: {
    color: WHITE, fontSize: 22, fontWeight: '800', letterSpacing: 1.0,
  },
  helpBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: ORANGE,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },
  helpText: { color: '#1A1A1A', fontSize: 24, fontWeight: '900', includeFontPadding: false, textAlign: 'center', lineHeight: 24 },
  cardWrap: {
    position: 'absolute', top: 116, left: 0, right: 0, zIndex: 20,
    alignItems: 'center',
  },
  instrLine: {
    marginTop: 14,
    color: WHITE,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.8,
    lineHeight: 30,
    paddingHorizontal: 24,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  volBarTrack: {
    position: 'absolute', right: 16, top: H * 0.42, bottom: 80,
    width: 10, borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    zIndex: 20, overflow: 'hidden', justifyContent: 'flex-end',
  },
  volBarFill: {
    width: '100%', backgroundColor: ORANGE, borderRadius: 5,
  },
  idleOverlay: {
    position: 'absolute', bottom: 80, left: 0, right: 0, zIndex: 30,
    alignItems: 'center', paddingHorizontal: 40,
  },
  idleText: {
    backgroundColor: 'rgba(0,0,0,0.72)',
    color: WHITE, fontSize: 22, fontWeight: '700',
    textAlign: 'center', lineHeight: 32,
    paddingHorizontal: 28, paddingVertical: 18,
    borderRadius: 20, overflow: 'hidden',
    letterSpacing: 0.3,
  },
  // "LOUDER!" pill — high-contrast amber so it pops against the game scene
  tooSoftPill: {
    marginTop: 10,
    alignSelf: 'center',
    backgroundColor: ORANGE,
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingVertical: 10,
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.60, shadowRadius: 10, elevation: 8,
  },
  tooSoftText: {
    color: '#1A1A1A',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1.5,
  },
  wordCheckPill: {
    marginTop: 10,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.60)',
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  wordCheckPillWrong: {
    backgroundColor: 'rgba(255,169,64,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,169,64,0.55)',
  },
  wordCheckText: {
    color: WHITE,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});

// Help overlay styles
const exHelp = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
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

// ─────────────────────────────────────────────────────────────────────────────────
// Root export
// ─────────────────────────────────────────────────────────────────────────────────

export default function LoudnessDrillsExercise({ onComplete, onExit, onSkip, tier = 1, exerciseIndex = 0, totalExercises = 8 }) {
  // null = AsyncStorage check in progress; avoids a one-frame flash to the intro.
  const [showDemo, setShowDemo] = useState(null);
  const sessionFill = totalExercises > 0 ? exerciseIndex / totalExercises : 0;

  useEffect(() => {
    AsyncStorage.getItem(DEMO_KEY)
      .then(val => setShowDemo(!val))
      .catch(() => setShowDemo(false));
  }, []);

  function finishDemo() {
    // Mark the intro as seen so future sessions skip straight to the exercise.
    AsyncStorage.setItem(DEMO_KEY, '1').catch(() => {});
    setShowDemo(false);
  }

  if (showDemo === null) return null;
  if (showDemo) return <DemoScreen onFinish={finishDemo} onExit={onExit} sessionFill={sessionFill} />;
  return (
    <ExerciseScreen
      onComplete={onComplete}
      onExit={onExit}
      onShowDemo={() => setShowDemo(true)}
      onSkip={onSkip ?? onComplete}
      tier={tier}
    />
  );
}
