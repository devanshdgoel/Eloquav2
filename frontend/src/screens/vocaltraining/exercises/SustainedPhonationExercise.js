/**
 * SustainedPhonationExercise — LSVT-inspired maximum phonation time training.
 *
 * Clinical rationale (LSVT LOUD):
 *   Maximum Phonation Time (MPT) is a core measure of vocal function. Parkinson's
 *   reduces MPT through reduced breath support and vocal fold closure. Practising
 *   sustained "AH" at maximum effort trains both breath support and phonatory
 *   efficiency. Clinical target for adults: ≥ 8 seconds. Three attempts per
 *   session allows fatigue-resistant practice and tracks improvement.
 *
 * Flow:
 *   1. First visit → 3 demo slides (mint gradient, matching Figma).
 *   2. Exercise: 3 rounds of breathe → hold AH → rest.
 *      Live scrolling waveform responds to microphone volume.
 *      Round auto-ends when voice drops for 800 ms or 18 s elapsed.
 *   3. Best duration shown; onComplete() called after all 3 rounds.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  StatusBar,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: W, height: H } = Dimensions.get('window');

// ── Config ──────────────────────────────────────────────────────────────────────
const DEMO_KEY         = '@eloqua_sustained_phonation_demo_seen';
const TOTAL_ROUNDS     = 3;
const BARS_COUNT       = 22;           // visible waveform columns
const BAR_INTERVAL_MS  = 80;           // how often a new bar is pushed
const BREATHE_MS       = 3200;         // inhale countdown duration
const MAX_PHONATE_MS   = 18000;        // auto-stop after this long
const SILENCE_END_MS   = 800;          // end phonation after this silence
const REST_MS          = 2200;
const SPEAK_THRESHOLD  = 0.22;         // normalised mic level to detect voice
const TARGET_S         = 8;            // clinical MPT target (seconds)

// ── Colours ─────────────────────────────────────────────────────────────────────
const GRAD        = ['#E0ECDE', '#9FCFBD', '#68B39F'];
const DARK_TEAL   = '#1C4047';
const MID_TEAL    = '#2D6974';
const BAR_ABOVE   = '#7DBDAA';   // bars above target line
const BAR_BELOW   = '#2D6974';   // bars below target line
const TARGET_LINE = '#E86B6B';   // horizontal target line
const ORANGE      = '#FFA940';
const WHITE       = '#FFFFFF';

// ── Demo slide content ───────────────────────────────────────────────────────────
const DEMO_SLIDES = [
  {
    num: '1',
    title: "Sustained 'AH' Phonation",
    body: 'Take a deep breath, then say "ah" for as long and as loudly as you can.',
    tip: 'Try to smile so that your mouth opens wider',
    visual: 'waveform',
  },
  {
    num: '2',
    title: "Let's add some pitch!",
    body: 'Take a deep breath, then say "ah" at different pitches! Let\'s try together!',
    tip: "Take breaths in between each 'ah' to focus your energy on making a perfectly loud sound",
    visual: 'pitch',
  },
  {
    num: '3',
    title: "Let's try it in a sentence!",
    body: 'Read the sentence below as loudly and clearly as you can.',
    tip: "Take breaths in between each 'ah' to focus your energy on making a perfectly loud sound",
    visual: 'sentence',
  },
];

// ─────────────────────────────────────────────────────────────────────────────────
// Static waveform preview (demo slide 1 illustration)
// ─────────────────────────────────────────────────────────────────────────────────
const PREVIEW_BARS = [0.13, 0.13, 0.25, 0.57, 0.60, 0.57, 0.53, 0.37, 0.34, 0.55, 0.60, 0.42, 0.13];

function WaveformPreview({ height = 120 }) {
  const barW  = 15;
  const gap   = 5;
  const total = PREVIEW_BARS.length;
  const panelW = total * (barW + gap) - gap;
  const targetY = height * 0.38;

  return (
    <View style={{ width: panelW, height, justifyContent: 'flex-end', position: 'relative' }}>
      {/* Target line */}
      <View style={{
        position: 'absolute', left: 0, right: 0,
        top: targetY, height: 1.5, backgroundColor: TARGET_LINE,
      }} />
      {PREVIEW_BARS.map((v, i) => {
        const bh    = Math.max(4, v * height);
        const above = (height - bh) < targetY;
        return (
          <View key={i} style={{
            position: 'absolute',
            left: i * (barW + gap),
            bottom: 0,
            width: barW,
            height: bh,
            borderRadius: 4,
            backgroundColor: above ? BAR_ABOVE : BAR_BELOW,
          }} />
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// Pitch hoops preview (demo slide 2 illustration)
// ─────────────────────────────────────────────────────────────────────────────────
function PitchPreview({ height = 110 }) {
  // 4 hoops at varying heights + connecting dashed arc
  const hoops = [
    { x: 28,  y: height * 0.78 },
    { x: 100, y: height * 0.50 },
    { x: 172, y: height * 0.65 },
    { x: 244, y: height * 0.28 },
  ];
  const HOOP_W = 20; const HOOP_H = 36;
  return (
    <View style={{ width: 280, height }}>
      {/* Ground line */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: `${MID_TEAL}60` }} />
      {/* Stems */}
      {hoops.map((h, i) => (
        <View key={i} style={{
          position: 'absolute',
          left: h.x + HOOP_W / 2 - 1, bottom: 0,
          width: 2, height: height - h.y - HOOP_H / 2,
          backgroundColor: `${MID_TEAL}80`,
        }} />
      ))}
      {/* Hoops (teal ellipses) */}
      {hoops.map((h, i) => (
        <View key={i} style={{
          position: 'absolute',
          left: h.x, top: h.y,
          width: HOOP_W, height: HOOP_H,
          borderRadius: HOOP_W / 2,
          borderWidth: 2.5,
          borderColor: MID_TEAL,
          backgroundColor: 'transparent',
        }} />
      ))}
      {/* Dolphin (simple) */}
      <View style={{
        position: 'absolute',
        left: hoops[1].x + 18, top: hoops[1].y - 10,
        width: 22, height: 11,
        backgroundColor: MID_TEAL,
        borderRadius: 6,
        transform: [{ rotate: '-20deg' }],
      }} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// Mic icon visual (demo slide 3)
// ─────────────────────────────────────────────────────────────────────────────────
function MicVisual({ size = 80 }) {
  return (
    <View style={{ width: size * 1.8, height: size * 1.8, alignItems: 'center', justifyContent: 'center' }}>
      {/* Blob background */}
      <View style={{
        position: 'absolute',
        width: size * 1.7, height: size * 1.5,
        borderRadius: size * 0.75,
        backgroundColor: `${MID_TEAL}25`,
      }} />
      <View style={{
        position: 'absolute',
        width: size * 1.3, height: size * 1.3,
        borderRadius: size * 0.65,
        backgroundColor: `${MID_TEAL}18`,
        top: size * 0.1,
      }} />
      {/* Mic circle */}
      <View style={{
        width: size, height: size,
        borderRadius: size / 2,
        backgroundColor: DARK_TEAL,
        justifyContent: 'center', alignItems: 'center',
      }}>
        {/* Mic body */}
        <View style={{
          width: size * 0.26, height: size * 0.38,
          borderRadius: size * 0.13,
          backgroundColor: WHITE,
        }} />
        {/* Mic stand arc */}
        <View style={{
          marginTop: 3,
          width: size * 0.38, height: size * 0.18,
          borderBottomLeftRadius: size * 0.19,
          borderBottomRightRadius: size * 0.19,
          borderWidth: 2.5, borderTopWidth: 0,
          borderColor: WHITE,
        }} />
        <View style={{ width: 2.5, height: size * 0.08, backgroundColor: WHITE, marginTop: 1 }} />
        <View style={{ width: size * 0.28, height: 2.5, backgroundColor: WHITE }} />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// Top Tip card
// ─────────────────────────────────────────────────────────────────────────────────
function TopTip({ text }) {
  return (
    <View style={tip.outer}>
      <View style={tip.inner}>
        <Text style={tip.title}>Top Tip</Text>
        <Text style={tip.body}>{text}</Text>
      </View>
    </View>
  );
}
const tip = StyleSheet.create({
  outer:  { backgroundColor: WHITE, borderRadius: 10, padding: 2, width: W - 60, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  inner:  { borderWidth: 1.5, borderColor: MID_TEAL, borderRadius: 8, padding: 14 },
  title:  { fontSize: 20, fontWeight: '700', color: '#000', letterSpacing: 1.2, marginBottom: 6 },
  body:   { fontSize: 13, color: DARK_TEAL, textAlign: 'center', letterSpacing: 1.2, lineHeight: 19 },
});

// ─────────────────────────────────────────────────────────────────────────────────
// Demo Screen
// ─────────────────────────────────────────────────────────────────────────────────
function DemoScreen({ onFinish, onExit }) {
  const [slide, setSlide] = useState(0);
  const s = DEMO_SLIDES[slide];

  function next() {
    if (slide < DEMO_SLIDES.length - 1) setSlide(slide + 1);
    else onFinish();
  }
  function back() {
    if (slide > 0) setSlide(slide - 1);
    else onExit();
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <LinearGradient colors={GRAD} style={StyleSheet.absoluteFillObject} />

      {/* Number badge */}
      <View style={dm.numBadge}>
        <Text style={dm.numText}>{s.num}</Text>
      </View>

      {/* Title */}
      <Text style={dm.title}>{s.title}</Text>

      {/* Body instruction */}
      <Text style={dm.body}>{s.body}</Text>

      {/* Visual preview */}
      <View style={dm.visual}>
        {s.visual === 'waveform' && (
          <View style={dm.wavePanel}>
            <WaveformPreview height={100} />
          </View>
        )}
        {s.visual === 'pitch' && (
          <View style={dm.wavePanel}>
            <PitchPreview height={100} />
          </View>
        )}
        {s.visual === 'sentence' && (
          <View style={{ alignItems: 'center', gap: 24 }}>
            <Text style={dm.sentence}>
              <Text style={{ color: DARK_TEAL, fontWeight: '800' }}>The </Text>
              <Text style={{ color: '#E05C5C', fontWeight: '800' }}>archer</Text>
              <Text style={{ color: DARK_TEAL, fontWeight: '800' }}>{'\n'}shot </Text>
              <Text style={{ color: DARK_TEAL }}> the arrow{'\n'}at the apple</Text>
            </Text>
            <MicVisual size={64} />
          </View>
        )}
      </View>

      {/* Top Tip */}
      <View style={{ alignItems: 'center', marginTop: 16 }}>
        <TopTip text={s.tip} />
      </View>

      {/* Navigation */}
      <View style={dm.navRow}>
        <TouchableOpacity style={dm.navCircle} onPress={back}>
          <Text style={dm.navArrow}>←</Text>
        </TouchableOpacity>
        <View style={dm.dots}>
          {DEMO_SLIDES.map((_, i) => (
            <View key={i} style={[dm.dot, i === slide && dm.dotActive]} />
          ))}
        </View>
        <TouchableOpacity style={dm.navCircle} onPress={next}>
          <Text style={dm.navArrow}>→</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const dm = StyleSheet.create({
  numBadge: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: DARK_TEAL,
    position: 'absolute', top: 36, left: 20,
    justifyContent: 'center', alignItems: 'center',
    zIndex: 5,
  },
  numText:   { color: WHITE, fontSize: 32, fontWeight: '700', letterSpacing: 1 },
  title:     { marginTop: 48, marginLeft: 92, marginRight: 20, fontSize: 20, fontWeight: '700', color: DARK_TEAL, letterSpacing: 1.2, lineHeight: 28 },
  body:      { marginTop: 12, marginHorizontal: 24, fontSize: 18, color: DARK_TEAL, letterSpacing: 1.8, lineHeight: 26 },
  visual:    { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  wavePanel: {
    backgroundColor: WHITE,
    borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 18,
    width: W - 40,
    shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 6, elevation: 3,
    alignItems: 'center',
  },
  sentence: { fontSize: 36, textAlign: 'center', lineHeight: 48, letterSpacing: 2.4 },
  navRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 40, paddingBottom: 36 },
  navCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: DARK_TEAL, justifyContent: 'center', alignItems: 'center' },
  navArrow:  { color: WHITE, fontSize: 22, fontWeight: '700' },
  dots:      { flexDirection: 'row', gap: 8 },
  dot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: `${DARK_TEAL}40` },
  dotActive: { backgroundColor: DARK_TEAL },
});

// ─────────────────────────────────────────────────────────────────────────────────
// Live waveform (exercise screen)
// ─────────────────────────────────────────────────────────────────────────────────
function LiveWaveform({ bars, panelH = 200 }) {
  const barW    = Math.floor((W - 80) / BARS_COUNT) - 2;
  const gap     = 2;
  const targetY = panelH * 0.38;

  return (
    <View style={{ width: W - 40, height: panelH, backgroundColor: WHITE, borderRadius: 12, overflow: 'hidden', padding: 10 }}>
      {/* Target line */}
      <View style={{
        position: 'absolute', left: 10, right: 10,
        top: 10 + targetY, height: 1.5, backgroundColor: TARGET_LINE, zIndex: 2,
      }} />
      {/* Dashed centre line */}
      {[...Array(12)].map((_, i) => (
        <View key={i} style={{
          position: 'absolute',
          left: (W - 40) / 2 - 1,
          top: 10 + i * ((panelH - 20) / 12),
          width: 1.5, height: (panelH - 20) / 12 * 0.55,
          backgroundColor: `${DARK_TEAL}30`,
          zIndex: 1,
        }} />
      ))}
      {/* Bars */}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap }}>
        {bars.map((v, i) => {
          const bh    = Math.max(3, v * (panelH - 20));
          const above = (panelH - 20 - bh) < targetY;
          return (
            <View key={i} style={{
              width: barW,
              height: bh,
              borderRadius: 3,
              backgroundColor: above ? BAR_ABOVE : BAR_BELOW,
            }} />
          );
        })}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// Breath cue animation (pulsing circle)
// ─────────────────────────────────────────────────────────────────────────────────
function BreathCue({ phase }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (phase === 'breathe') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.18, duration: 1400, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1.00, duration: 1400, useNativeDriver: true }),
        ])
      ).start();
    } else {
      scaleAnim.stopAnimation();
      Animated.timing(scaleAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [phase]);

  const SIZE = 90;
  return (
    <Animated.View style={{
      width: SIZE, height: SIZE, borderRadius: SIZE / 2,
      backgroundColor: phase === 'phonating' ? BAR_ABOVE : `${MID_TEAL}35`,
      borderWidth: 3,
      borderColor: phase === 'phonating' ? MID_TEAL : `${MID_TEAL}60`,
      justifyContent: 'center', alignItems: 'center',
      transform: [{ scale: scaleAnim }],
    }}>
      <Text style={{ fontSize: 28, fontWeight: '700', color: phase === 'phonating' ? WHITE : MID_TEAL }}>
        {phase === 'phonating' ? 'AH' : '↓'}
      </Text>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// Exercise Screen
// ─────────────────────────────────────────────────────────────────────────────────
function ExerciseScreen({ onComplete, onExit, onShowDemo }) {
  const [phase, setPhase]         = useState('idle');   // idle | breathe | phonating | rest | done
  const [round, setRound]         = useState(1);
  const [bars, setBars]           = useState(Array(BARS_COUNT).fill(0.03));
  const [elapsed, setElapsed]     = useState(0);        // current phonation seconds
  const [bestTime, setBestTime]   = useState(0);        // best across rounds
  const [roundResult, setRoundResult] = useState(null); // last round's duration

  const phaseRef      = useRef('idle');
  const roundRef      = useRef(1);
  const recordingRef  = useRef(null);
  const barIntervalRef = useRef(null);
  const elapsedRef    = useRef(0);
  const silenceRef    = useRef(null);
  const phonationTimerRef = useRef(null);
  const elapsedIntervalRef = useRef(null);
  const volumeRef     = useRef(0);

  function setPhaseS(p) { phaseRef.current = p; setPhase(p); }

  useEffect(() => {
    return () => { stopAll(); };
  }, []);

  // ── Phase: breathe ────────────────────────────────────────────────────────────
  function startBreath() {
    if (phaseRef.current === 'done') return;
    setPhaseS('breathe');
    setBars(Array(BARS_COUNT).fill(0.03));
    setElapsed(0);
    elapsedRef.current = 0;
    setRoundResult(null);
    setTimeout(startPhonation, BREATHE_MS);
  }

  // ── Phase: phonating ──────────────────────────────────────────────────────────
  async function startPhonation() {
    if (phaseRef.current === 'done') return;
    setPhaseS('phonating');
    volumeRef.current = 0;

    // Waveform scroll interval
    barIntervalRef.current = setInterval(() => {
      const v = volumeRef.current;
      setBars(prev => {
        const next = [...prev.slice(1), v + Math.random() * 0.04]; // slight jitter
        return next;
      });
    }, BAR_INTERVAL_MS);

    // Elapsed timer (tenths of a second)
    elapsedIntervalRef.current = setInterval(() => {
      elapsedRef.current += 0.1;
      setElapsed(+(elapsedRef.current.toFixed(1)));
    }, 100);

    // Max duration safety stop
    phonationTimerRef.current = setTimeout(endPhonation, MAX_PHONATE_MS);

    await openMic();
  }

  async function openMic() {
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
    } catch (_) { /* mic unavailable — timer handles progress */ }
  }

  function onMeter(status) {
    if (!status.isRecording) return;
    const db  = status.metering ?? -160;
    const vol = Math.min(1, Math.max(0, (db + 70) / 60));
    volumeRef.current = vol;

    if (vol < SPEAK_THRESHOLD) {
      if (!silenceRef.current) {
        silenceRef.current = setTimeout(() => {
          silenceRef.current = null;
          if (phaseRef.current === 'phonating') endPhonation();
        }, SILENCE_END_MS);
      }
    } else {
      if (silenceRef.current) { clearTimeout(silenceRef.current); silenceRef.current = null; }
    }
  }

  async function endPhonation() {
    if (phaseRef.current !== 'phonating') return;
    setPhaseS('rest');
    await stopAll();

    const dur = +elapsedRef.current.toFixed(1);
    setRoundResult(dur);
    setBestTime(prev => Math.max(prev, dur));
    volumeRef.current = 0;

    // Decay bars to flat during rest
    setBars(prev => prev.map(v => Math.max(0.03, v * 0.3)));

    setTimeout(advanceRound, REST_MS);
  }

  function advanceRound() {
    const nextRound = roundRef.current + 1;
    if (nextRound > TOTAL_ROUNDS) {
      setPhaseS('done');
      setTimeout(onComplete, 1800);
      return;
    }
    roundRef.current = nextRound;
    setRound(nextRound);
    startBreath();
  }

  async function stopAll() {
    if (silenceRef.current)        { clearTimeout(silenceRef.current);       silenceRef.current       = null; }
    if (phonationTimerRef.current) { clearTimeout(phonationTimerRef.current); phonationTimerRef.current= null; }
    if (barIntervalRef.current)    { clearInterval(barIntervalRef.current);   barIntervalRef.current   = null; }
    if (elapsedIntervalRef.current){ clearInterval(elapsedIntervalRef.current); elapsedIntervalRef.current = null; }
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }
    } catch (_) {}
  }

  const isPhonating = phase === 'phonating';
  const metTarget   = elapsed >= TARGET_S;
  const bestMetTarget = bestTime >= TARGET_S;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <LinearGradient colors={GRAD} style={StyleSheet.absoluteFillObject} />

      {/* Header row: back | help */}
      <View style={ex.headerRow}>
        <TouchableOpacity style={ex.backBtn} onPress={onExit}>
          <Text style={ex.backText}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={ex.helpBtn} onPress={onShowDemo}>
          <Text style={ex.helpText}>?</Text>
        </TouchableOpacity>
      </View>

      {/* Round indicator */}
      <View style={ex.roundRow}>
        {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
          <View key={i} style={[ex.roundPill, i < round - 1 && ex.roundDone, i === round - 1 && ex.roundActive]} >
            <Text style={[ex.roundPillText, (i < round - 1 || i === round - 1) && { color: WHITE }]}>
              {i < round - 1 ? '✓' : i + 1}
            </Text>
          </View>
        ))}
      </View>

      {/* Phase label */}
      <Text style={ex.phaseLabel}>
        {phase === 'idle'       ? 'Ready to begin?'
         : phase === 'breathe'  ? 'Breathe In...'
         : phase === 'phonating' ? 'Say  AH  — hold it!'
         : phase === 'rest'      ? (roundResult !== null ? (roundResult >= TARGET_S ? '✓ Great hold!' : 'Keep going!') : 'Rest...')
         : phase === 'done'      ? 'Well done!'
         : ''}
      </Text>

      {/* Breath cue + duration */}
      <View style={ex.cueRow}>
        <BreathCue phase={phase} />
        <View style={ex.durationBox}>
          {isPhonating && (
            <Text style={[ex.durationNum, metTarget && ex.durationGood]}>
              {elapsed.toFixed(1)}s
            </Text>
          )}
          {phase === 'rest' && roundResult !== null && (
            <Text style={[ex.durationNum, roundResult >= TARGET_S && ex.durationGood]}>
              {roundResult.toFixed(1)}s
            </Text>
          )}
          {bestTime > 0 && (
            <Text style={[ex.bestLabel, bestMetTarget && ex.bestGood]}>
              Best: {bestTime.toFixed(1)}s
            </Text>
          )}
          <Text style={ex.targetLabel}>Target: {TARGET_S}s</Text>
        </View>
      </View>

      {/* Start button — shown only in idle phase */}
      {phase === 'idle' && (
        <TouchableOpacity style={ex.startBtn} onPress={() => startBreath()} activeOpacity={0.85}>
          <Text style={ex.startText}>Start  ▶</Text>
        </TouchableOpacity>
      )}

      {/* Live waveform panel */}
      <View style={{ alignItems: 'center', marginTop: 16 }}>
        <LiveWaveform bars={bars} panelH={180} />
      </View>

      {/* Tip strip */}
      <View style={ex.tipStrip}>
        <Text style={ex.tipText}>
          {phase === 'breathe'    ? 'Fill your lungs all the way...'
           : phase === 'phonating' ? 'Loud and steady — keep going!'
           : phase === 'rest'      ? 'Relax your throat'
           : ''}
        </Text>
      </View>
    </View>
  );
}

const ex = StyleSheet.create({
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 18, zIndex: 10,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: `${DARK_TEAL}20`,
    borderWidth: 1.5, borderColor: `${DARK_TEAL}30`,
    justifyContent: 'center', alignItems: 'center',
  },
  backText:  { color: DARK_TEAL, fontSize: 18, fontWeight: '700' },
  helpBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: ORANGE,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45, shadowRadius: 6, elevation: 6,
  },
  helpText: { color: WHITE, fontSize: 17, fontWeight: '800' },
  startBtn: {
    alignSelf: 'center', marginTop: 24,
    backgroundColor: ORANGE, borderRadius: 14,
    paddingHorizontal: 36, paddingVertical: 15,
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },
  startText: { color: WHITE, fontSize: 18, fontWeight: '700', letterSpacing: 0.6 },
  roundRow:  { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 12, zIndex: 5 },
  roundPill: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 2, borderColor: `${DARK_TEAL}40`,
    backgroundColor: 'transparent',
    justifyContent: 'center', alignItems: 'center',
  },
  roundActive: { backgroundColor: MID_TEAL, borderColor: MID_TEAL },
  roundDone:   { backgroundColor: '#7DBDAA', borderColor: '#7DBDAA' },
  roundPillText: { fontSize: 16, fontWeight: '700', color: `${DARK_TEAL}70` },
  phaseLabel: {
    textAlign: 'center', marginTop: 14,
    fontSize: 22, fontWeight: '700', color: DARK_TEAL, letterSpacing: 0.8,
  },
  cueRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 24, marginTop: 20, paddingHorizontal: 32,
  },
  durationBox: { alignItems: 'flex-start', minWidth: 110 },
  durationNum: { fontSize: 46, fontWeight: '800', color: MID_TEAL, letterSpacing: -1 },
  durationGood:{ color: '#45B013' },
  bestLabel:   { fontSize: 14, color: `${DARK_TEAL}70`, marginTop: 2, letterSpacing: 0.3 },
  bestGood:    { color: '#45B013', fontWeight: '700' },
  targetLabel: { fontSize: 12, color: `${DARK_TEAL}50`, letterSpacing: 0.3 },
  tipStrip: {
    position: 'absolute', bottom: 36, left: 0, right: 0,
    alignItems: 'center',
  },
  tipText: { fontSize: 15, color: `${DARK_TEAL}90`, letterSpacing: 0.4, fontStyle: 'italic' },
});

// ─────────────────────────────────────────────────────────────────────────────────
// Root export
// ─────────────────────────────────────────────────────────────────────────────────
export default function SustainedPhonationExercise({ onComplete, onExit }) {
  const [showDemo, setShowDemo] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem(DEMO_KEY)
      .then(val => setShowDemo(val !== 'true'))
      .catch(() => setShowDemo(false));
  }, []);

  async function finishDemo() {
    await AsyncStorage.setItem(DEMO_KEY, 'true').catch(() => {});
    setShowDemo(false);
  }

  if (showDemo === null) return null;
  if (showDemo) return <DemoScreen onFinish={finishDemo} onExit={onExit} />;
  return (
    <ExerciseScreen
      onComplete={onComplete}
      onExit={onExit}
      onShowDemo={() => setShowDemo(true)}
    />
  );
}
