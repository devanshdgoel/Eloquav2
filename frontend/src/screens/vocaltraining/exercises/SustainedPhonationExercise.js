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
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CantDoNow from '../../../components/CantDoNow';

const { width: W, height: H } = Dimensions.get('window');

// AsyncStorage key — once written, the intro is skipped on all future sessions.
const DEMO_KEY = '@eloqua_phonation_demo_seen';

// ── Config ────────────────────────────────────────────────────────────────────
const TOTAL_ROUNDS    = 3;
const CALIBRATION_MS  = 1500;
// Raised from 0.60 to 0.82 so the calibrated threshold can actually exceed
// ambient noise in genuinely noisy environments. Previously the 0.60 cap
// was hit before the formula could set a threshold above the room's noise floor.
const MAX_THRESHOLD   = 0.82;
const SILENCE_END_MS  = 800;
const MAX_PHONATE_MS  = 20000;
const REST_MS         = 6500;

// Require this many consecutive above-threshold meter readings before scoring
// begins. At 80 ms per reading, 4 readings = ~320 ms of sustained sound.
// This prevents a single loud ambient spike (door, tap, word in background)
// from triggering the scoring state.
const TRIGGER_READINGS = 4;

// minVolume: the floor below which calibration cannot push the adaptive threshold.
// Also the required volume in an anechoic room (no ambient noise detected).
// Raised in a previous pass to reduce false triggers from light ambient sounds.
const PHONATION_TIERS = [
  { targetSeconds: 4,  minVolume: 0.38 },
  { targetSeconds: 5,  minVolume: 0.42 },
  { targetSeconds: 7,  minVolume: 0.46 },
  { targetSeconds: 9,  minVolume: 0.50 },
  { targetSeconds: 12, minVolume: 0.54 },
];

const REST_SEQUENCES = [
  { praise: 'Great start!',    in: 'Breathe in slowly…',   out: 'And breathe out…' },
  { praise: 'Keep it up!',     in: 'Inhale deeply…',        out: 'Breathe out gently…' },
  { praise: 'Excellent work!', in: 'One last deep breath…', out: 'Release slowly…' },
];

// ── Colors ────────────────────────────────────────────────────────────────────
const BG        = '#1C4047';
const ORANGE    = '#FFA940';
const WHITE     = '#FFFFFF';
const MINT      = '#C3DECE';
const GREEN     = '#48D28C';
const GREEN_BAR = 'rgba(72,210,140,0.90)';
const WHITE_BAR = 'rgba(255,255,255,0.88)';

// ── Bar chart config ──────────────────────────────────────────────────────────
const BARS_COUNT = 26;
const BAR_GAP    = 2;
const BAR_W      = Math.max(3, Math.floor((W - 32 - BAR_GAP * (BARS_COUNT - 1)) / BARS_COUNT));
const BAR_MAX_H  = 110;

const BG_GRADIENT = ['#37767A', '#1C4047', '#0A1618'];

// ── Shared UI pieces ──────────────────────────────────────────────────────────

function FadeIn({ children, duration = 380 }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }).start();
  }, []);
  return <Animated.View style={{ flex: 1, opacity }}>{children}</Animated.View>;
}

function SessionBar({ fill }) {
  return (
    <View style={sb.track}>
      <View style={[sb.fill, { width: `${Math.min(1, fill) * 100}%` }]} />
    </View>
  );
}
const sb = StyleSheet.create({
  track: {
    position: 'absolute', bottom: 28, left: 47,
    width: W - 94, height: 12, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  fill: { height: '100%', borderRadius: 13, backgroundColor: ORANGE },
});

function RoundPills({ current, done }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
      {[0, 1, 2].map(i => (
        <View
          key={i}
          style={{
            width: 96, height: 10, borderRadius: 5,
            backgroundColor:
              i < done        ? GREEN
              : i === current ? '#2D9BA2'
                              : 'rgba(255,255,255,0.22)',
          }}
        />
      ))}
    </View>
  );
}

const hb = StyleSheet.create({
  ghostBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center', alignItems: 'center',
  },
  ghostText: {
    color: WHITE, fontSize: 20, fontWeight: '500',
    includeFontPadding: false, textAlign: 'center', lineHeight: 20,
  },
  orangeBtn: {
    width: 56, height: 56, borderRadius: 28,
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

// ── Title screen ──────────────────────────────────────────────────────────────

function TitleScreen({ onNext, onExit, sessionFill }) {
  return (
    <FadeIn>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar barStyle="light-content" />

        <View style={ts.header}>
          <TouchableOpacity
            style={hb.ghostBtn}
            onPress={onExit}
            accessibilityRole="button"
            accessibilityLabel="Exit exercise"
          >
            <Text style={hb.ghostText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={ts.body}>
          <Text style={ts.title}>{'Sustained\nSound'}</Text>
          <Text style={ts.subtitle}>
            {"Hold a steady \"Aah\" as long as you can.\nThree rounds — your best score counts."}
          </Text>
        </View>

        <TouchableOpacity
          style={ts.arrowBtn}
          onPress={onNext}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Continue"
        >
          <Text style={ts.arrowText}>→</Text>
        </TouchableOpacity>

        <SessionBar fill={sessionFill} />
      </View>
    </FadeIn>
  );
}

const ts = StyleSheet.create({
  header: { paddingTop: 52, paddingHorizontal: 18, flexDirection: 'row' },
  body: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    color: WHITE, fontSize: 56, fontWeight: '800',
    letterSpacing: 1.5, textAlign: 'center', marginBottom: 16,
  },
  subtitle: {
    color: MINT, fontSize: 17, textAlign: 'center',
    lineHeight: 26, opacity: 0.85,
  },
  arrowBtn: {
    alignSelf: 'center', marginBottom: 60,
    width: 80, height: 64, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center', alignItems: 'center',
  },
  arrowText: { color: WHITE, fontSize: 26, fontWeight: '300' },
});

// ── Instructions screen ───────────────────────────────────────────────────────

const INSTRUCTIONS = [
  { step: '1', text: 'Sit up straight and take a slow, deep breath.' },
  { step: '2', text: "Say \"Aah\" in a loud, steady voice — project across the room." },
  { step: '3', text: 'Hold it as long as you can. Think LOUD. Don\'t stop.' },
  { step: '4', text: 'Watch the waveform bars — keep them high to score!' },
];

function InstructScreen({ onNext, onExit }) {
  return (
    <FadeIn>
      <View style={{ flex: 1 }}>
        <LinearGradient
          colors={['#1C3242', '#0D1E2B']}
          style={StyleSheet.absoluteFillObject}
        />
        <StatusBar barStyle="light-content" />

        <View style={ins.header}>
          <TouchableOpacity
            style={hb.ghostBtn}
            onPress={onExit}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={hb.ghostText}>←</Text>
          </TouchableOpacity>
          <View style={ins.pill}>
            <Text style={ins.pillText}>INSTRUCTIONS</Text>
          </View>
          <View style={{ width: 56 }} />
        </View>

        <Text style={ins.heading}>{'How to do\nSustained Sound'}</Text>

        <View style={ins.card}>
          {INSTRUCTIONS.map(({ step, text }) => (
            <View key={step} style={ins.row}>
              <View style={ins.badge}>
                <Text style={ins.badgeNum}>{step}</Text>
              </View>
              <Text style={ins.stepText}>{text}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={ins.startBtn}
          onPress={onNext}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Begin exercise"
        >
          <Text style={ins.startText}>Begin Exercise  →</Text>
        </TouchableOpacity>
      </View>
    </FadeIn>
  );
}

const ins = StyleSheet.create({
  header: {
    paddingTop: 52, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  pill: {
    flex: 1, backgroundColor: ORANGE, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 6, alignItems: 'center',
  },
  pillText: { color: '#1A1A1A', fontSize: 16, fontWeight: '800', letterSpacing: 0.8 },
  heading: {
    color: 'rgba(255,255,255,0.90)', fontSize: 20, fontWeight: '700',
    textAlign: 'center', letterSpacing: 0.4, lineHeight: 28,
    marginTop: 18, marginBottom: 24, paddingHorizontal: 24,
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
    fontSize: 16, lineHeight: 23, fontWeight: '400',
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

// ── Exercise screen ───────────────────────────────────────────────────────────

function ExerciseScreen({ onComplete, onExit, onShowInstructions, onSkip, tier }) {
  const tierConfig = PHONATION_TIERS[Math.max(0, Math.min(4, tier - 1))];

  const [phase,      setPhase]      = useState('calibrating');
  const [round,      setRound]      = useState(0);
  const [doneRounds, setDoneRounds] = useState(0);
  const [seconds,    setSeconds]    = useState(0);
  const [bestScore,  setBestScore]  = useState(0);
  const [msg,        setMsg]        = useState('Listening to room…');
  const [bars,       setBars]       = useState(() => Array(BARS_COUNT).fill(0.015));

  const phaseRef          = useRef('calibrating');
  const roundRef          = useRef(0);
  const scoreRef          = useRef(0);
  const bestRef           = useRef(0);
  const recordingRef      = useRef(null);
  const adaptiveThreshRef = useRef(tierConfig.minVolume);
  const ambientSamplesRef = useRef([]);
  // Counts consecutive above-threshold meter readings in the 'ready' phase.
  // Scoring only starts once this reaches TRIGGER_READINGS (~320 ms of sound).
  const triggerCountRef   = useRef(0);
  const calibrateTimerRef = useRef(null);
  const silenceTimerRef   = useRef(null);
  const maxTimerRef       = useRef(null);
  const scoreTimerRef     = useRef(null);
  const restTimerRef      = useRef(null);
  const msgTimer1Ref      = useRef(null);
  const msgTimer2Ref      = useRef(null);

  function setPhaseS(p) { phaseRef.current = p; setPhase(p); }

  useEffect(() => {
    calibrateAmbient();
    return () => { cleanupAll(); };
  }, []);

  // ── Audio (mirrors LoudnessDrillsExercise — never toggle mode between rounds) ─

  async function calibrateAmbient() {
    ambientSamplesRef.current = [];
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
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
          // Formula: p90 × 2.5 + 0.14 gives a threshold well above ambient.
          // Quiet room:  p90 ≈ 0.02 → 0.05 + 0.14 = 0.19 → floored at minVolume (e.g. 0.38)
          // Noisy room:  p90 ≈ 0.25 → 0.625 + 0.14 = 0.765 → set at 0.765 (within cap 0.82)
          // Louder room: p90 ≈ 0.35 → 0.875 + 0.14 = 1.015 → capped at MAX_THRESHOLD 0.82
          // The higher multiplier (was 2.0) ensures the threshold sits comfortably above
          // the noise floor even in lively environments like kitchens or coffee shops.
          adaptiveThreshRef.current = Math.min(MAX_THRESHOLD, Math.max(tierConfig.minVolume, p90 * 2.5 + 0.14));
        }
        // Stop calibration recording — DO NOT change audio mode
        try { await recording.stopAndUnloadAsync(); } catch (_) {}
        startNextRound();
      }, CALIBRATION_MS);
    } catch (_) {
      adaptiveThreshRef.current = tierConfig.minVolume;
      startNextRound();
    }
  }

  async function startNextRound() {
    if (phaseRef.current === 'done') return;
    scoreRef.current    = 0;
    triggerCountRef.current = 0; // reset sustained-trigger counter at the start of each round
    setSeconds(0);
    setRound(roundRef.current);
    setPhaseS('ready');
    setMsg('Say "Aah" — as loud and long as you can!');
    await startMic();
  }

  async function startMic() {
    try {
      // setAudioModeAsync(true) is idempotent — safe to call every round
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
        onMeter,
        80,
      );
      recordingRef.current = recording;
    } catch (_) {
      // Mic unavailable — let CantDoNow handle it
    }
  }

  function onMeter(status) {
    if (!status.isRecording) return;
    const db  = status.metering ?? -160;
    const vol = Math.min(1, Math.max(0, (db + 70) / 60));
    setBars(prev => [...prev.slice(1), Math.max(0.015, vol + Math.random() * 0.018)]);

    if (phaseRef.current === 'ready') {
      if (vol >= adaptiveThreshRef.current) {
        // Count consecutive above-threshold readings before committing to scoring.
        // A single spike (door slam, cough, word from another room) won't have
        // TRIGGER_READINGS consecutive readings — genuine phonation will.
        triggerCountRef.current += 1;
        if (triggerCountRef.current >= TRIGGER_READINGS) {
          beginScoring();
        }
      } else {
        // Any dip resets the counter so spikes must be truly sustained.
        triggerCountRef.current = 0;
      }
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
    setPhaseS('scoring');
    setMsg('Keep going!');
    scoreTimerRef.current = setInterval(() => {
      scoreRef.current += 1;
      setSeconds(scoreRef.current);
    }, 1000);
    maxTimerRef.current = setTimeout(finishRound, MAX_PHONATE_MS);
  }

  async function finishRound() {
    if (phaseRef.current !== 'scoring') return;
    setPhaseS('resting');

    if (scoreTimerRef.current)   { clearInterval(scoreTimerRef.current);  scoreTimerRef.current  = null; }
    if (maxTimerRef.current)     { clearTimeout(maxTimerRef.current);      maxTimerRef.current    = null; }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current);  silenceTimerRef.current = null; }

    const final = scoreRef.current;
    if (final > bestRef.current) {
      bestRef.current = final;
      setBestScore(final);
    }

    // Stop recording — DO NOT call setAudioModeAsync(false) between rounds
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }
    } catch (_) {}

    const seqIdx = roundRef.current % REST_SEQUENCES.length;
    const seq    = REST_SEQUENCES[seqIdx];
    const nextRound = roundRef.current + 1;

    setMsg(seq.praise);
    // Only guide the user through breathing between rounds — not after the last round,
    // since the exercise is about to end and the breathing prompt would feel odd.
    if (nextRound < TOTAL_ROUNDS) {
      msgTimer1Ref.current = setTimeout(() => { msgTimer1Ref.current = null; setMsg(seq.in); }, 2200);
      msgTimer2Ref.current = setTimeout(() => { msgTimer2Ref.current = null; setMsg(seq.out); }, 4400);
    }

    restTimerRef.current = setTimeout(async () => {
      restTimerRef.current = null;
      if (nextRound >= TOTAL_ROUNDS) {
        setPhaseS('done');
        setMsg('Well done!');
        const exerciseScore = Math.min(100, Math.round((bestRef.current / tierConfig.targetSeconds) * 100));
        setTimeout(() => onComplete(exerciseScore), 1500);
      } else {
        roundRef.current = nextRound;
        setDoneRounds(nextRound);
        await startNextRound();
      }
    }, REST_MS);
  }

  async function cleanupAll() {
    if (calibrateTimerRef.current) { clearTimeout(calibrateTimerRef.current); calibrateTimerRef.current = null; }
    if (silenceTimerRef.current)   { clearTimeout(silenceTimerRef.current);   silenceTimerRef.current   = null; }
    if (maxTimerRef.current)       { clearTimeout(maxTimerRef.current);        maxTimerRef.current       = null; }
    if (scoreTimerRef.current)     { clearInterval(scoreTimerRef.current);     scoreTimerRef.current     = null; }
    if (restTimerRef.current)      { clearTimeout(restTimerRef.current);       restTimerRef.current      = null; }
    if (msgTimer1Ref.current)      { clearTimeout(msgTimer1Ref.current);       msgTimer1Ref.current      = null; }
    if (msgTimer2Ref.current)      { clearTimeout(msgTimer2Ref.current);       msgTimer2Ref.current      = null; }
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
    } catch (_) {}
  }

  const isScoring = phase === 'scoring';

  return (
    <FadeIn>
      <LinearGradient colors={BG_GRADIENT} style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" />

        {/* Header */}
        <View style={ex.header}>
          <TouchableOpacity
            style={hb.ghostBtn}
            onPress={onExit}
            accessibilityRole="button"
            accessibilityLabel="Exit exercise"
          >
            <Text style={hb.ghostText}>✕</Text>
          </TouchableOpacity>
          <Text style={ex.roundLabel}>Round {round + 1} / {TOTAL_ROUNDS}</Text>
          <TouchableOpacity
            style={hb.orangeBtn}
            onPress={onShowInstructions}
            accessibilityRole="button"
            accessibilityLabel="Show instructions"
          >
            <Text style={hb.orangeText}>?</Text>
          </TouchableOpacity>
        </View>

        {/* Timer */}
        <View style={ex.timerArea}>
          <Text
            style={[
              ex.timerNum,
              isScoring && { textShadowColor: 'rgba(72,210,140,0.40)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 24 },
            ]}
          >
            {phase === 'calibrating' ? '–' : seconds}
          </Text>
          <Text style={ex.timerUnit}>seconds</Text>
          {bestScore > 0 && (
            <Text style={ex.bestLabel}>Best: {bestScore}s</Text>
          )}
        </View>

        {/* 26-bar waveform visualization */}
        <View style={ex.barsWrap}>
          {bars.map((v, i) => (
            <View
              key={i}
              style={[
                ex.bar,
                {
                  height: Math.max(3, Math.round(v * BAR_MAX_H)),
                  backgroundColor: isScoring ? GREEN_BAR : WHITE_BAR,
                },
              ]}
            />
          ))}
        </View>

        {/* Instruction message */}
        <Text style={ex.msg}>{msg}</Text>

        {/* Bottom: CantDoNow + pills */}
        <View style={ex.bottom}>
          <CantDoNow onSkip={onSkip} onEnd={onExit} />
          <View style={{ height: 16 }} />
          <RoundPills current={round} done={doneRounds} />
        </View>
      </LinearGradient>
    </FadeIn>
  );
}

const ex = StyleSheet.create({
  header: {
    paddingTop: 52, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  roundLabel: {
    color: WHITE, fontSize: 22, fontWeight: '800', letterSpacing: 1,
  },
  timerArea: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  timerNum: {
    color: WHITE, fontSize: 100, fontWeight: '900',
    letterSpacing: -4, lineHeight: 108, includeFontPadding: false,
  },
  timerUnit: {
    color: 'rgba(255,255,255,0.55)', fontSize: 18, fontWeight: '500',
    letterSpacing: 2, marginTop: 4,
  },
  bestLabel: {
    marginTop: 16, color: ORANGE, fontSize: 20, fontWeight: '700', letterSpacing: 0.5,
  },
  msg: {
    color: 'rgba(255,255,255,0.80)', fontSize: 20, fontWeight: '600',
    textAlign: 'center', letterSpacing: 0.5, lineHeight: 28,
    paddingHorizontal: 32, marginBottom: 20,
  },
  barsWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: BAR_GAP,
    height: BAR_MAX_H + 4,
    marginHorizontal: 16,
    marginBottom: 20,
  },
  bar: {
    width: BAR_W,
    borderRadius: Math.ceil(BAR_W / 2),
  },
  bottom: { alignItems: 'center', paddingBottom: 44 },
});

// ── Root export ───────────────────────────────────────────────────────────────

export default function SustainedPhonationExercise({
  onComplete,
  onExit,
  onSkip,
  tier = 1,
  exerciseIndex = 0,
  totalExercises = 8,
}) {
  // null = AsyncStorage check in progress; avoids a one-frame flash to the intro.
  const [step, setStep] = useState(null);
  const sessionFill = totalExercises > 0 ? exerciseIndex / totalExercises : 0;

  useEffect(() => {
    AsyncStorage.getItem(DEMO_KEY)
      .then(val => setStep(val ? 2 : 0))
      .catch(() => setStep(0));
  }, []);

  if (step === null) return null;

  if (step === 0) {
    return (
      <TitleScreen
        onNext={() => setStep(1)}
        onExit={onExit}
        sessionFill={sessionFill}
      />
    );
  }
  if (step === 1) {
    return (
      <InstructScreen
        onNext={() => {
          // Mark the intro as seen so future sessions skip straight to the exercise.
          AsyncStorage.setItem(DEMO_KEY, '1').catch(() => {});
          setStep(2);
        }}
        onExit={() => setStep(0)}
      />
    );
  }
  return (
    <ExerciseScreen
      onComplete={onComplete}
      onExit={onExit}
      onShowInstructions={() => setStep(1)}
      onSkip={onSkip ?? onComplete}
      tier={tier}
    />
  );
}
