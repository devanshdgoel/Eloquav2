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
  TouchableOpacity,
  Animated,
  Dimensions,
  StatusBar,
  StyleSheet,
  ImageBackground,
} from 'react-native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CantDoNow from '../../../components/CantDoNow';

const { width: W, height: H } = Dimensions.get('window');

// ── Config ──────────────────────────────────────────────────────────────────────
const DEMO_KEY        = '@eloqua_loudness_drills_demo_seen';
const TOTAL_ROUNDS    = 8;
const MIN_SPEAK_MS    = 280;   // must sustain threshold for this long (ms)
const CALIBRATION_MS  = 1500;  // ambient noise sampling window
const MIN_THRESHOLD   = 0.30;
const MAX_THRESHOLD   = 0.70;
const TIMER_MS        = 3500;  // countdown per round (ms)
const RISE_MS         = 700;   // jellyfish rising animation (ms)
const WHACK_MS        = 480;   // jellyfish whack-fly animation (ms)
const SINK_MS         = 500;   // jellyfish sinking animation (ms)
const BETWEEN_MS      = 900;   // pause between rounds (ms)

// ── Colours ─────────────────────────────────────────────────────────────────────
const BG        = '#1C4047';
const CYL_FILL  = '#4493A0';
const CYL_HIGH  = '#5DBDCD';
const HOLE_DARK = '#061318';
const ORANGE    = '#FE9C2D';
const WHITE     = '#FFFFFF';
const WORD_COL  = '#1F4850';
const PILL_DONE = '#45B013';
const PILL_PEND = '#D9D9D9';

// ── Clinical word progression ────────────────────────────────────────────────────
const ROUNDS = [
  { word: 'UH',   tip: 'Big, loud voice!' },
  { word: 'AH',   tip: 'Hold it long and loud!' },
  { word: 'OOH',  tip: 'Project from your chest!' },
  { word: 'HEY',  tip: 'Nice and loud!' },
  { word: 'LOUD', tip: "You've got this!" },
  { word: 'ONE',  tip: 'Send it across the room!' },
  { word: 'GO',   tip: 'Big voice — push it out!' },
  { word: 'YEAH', tip: 'Loud and proud!' },
];

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

// Jellyfish dome base diameter
const JELLY_BASE = 92;

// ─────────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────────

/**
 * Pink jellyfish — dome + tentacles + glow halo.
 * riseAnim 0→1 moves it from hidden inside the hole to fully risen.
 * riseAnim > 1 (whack) flies it off the top.
 */
function Jellyfish({ hole, riseAnim, scaleAnim, opacityAnim }) {
  const { cx, cy, rimH, sz } = hole;
  const size   = JELLY_BASE * sz;
  const r      = size / 2;
  const domeH  = size * 0.62;
  const tentH  = size * 0.54;

  // Hidden: dome fully inside cylinder.  Risen: tentacles clear of rim.
  const hiddenY = domeH + rimH;
  const risenY  = -(tentH * 0.25);

  const translateY = riseAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [hiddenY, risenY],
    extrapolate: 'extend',  // allows > 1 for whack fly-off
  });

  const TENTACLES = [
    { dx: -r * 0.58, h: tentH * 1.00, w: 4.5 * sz },
    { dx: -r * 0.28, h: tentH * 0.82, w: 3.5 * sz },
    { dx:  r * 0.02, h: tentH * 0.94, w: 4.5 * sz },
    { dx:  r * 0.32, h: tentH * 0.78, w: 3.5 * sz },
    { dx:  r * 0.58, h: tentH * 0.98, w: 4.5 * sz },
  ];

  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute',
      left: cx - r,
      top:  cy - rimH / 2 - domeH,  // anchor: dome-bottom at rim-centre
      opacity: opacityAnim,
      transform: [{ translateY }, { scale: scaleAnim }],
    }}>
      {/* Glow halo */}
      <View style={{
        position: 'absolute',
        width: size * 1.65, height: size * 1.65,
        borderRadius: size * 0.83,
        backgroundColor: 'rgba(210,160,230,0.18)',
        left: -size * 0.33, top: -size * 0.33,
      }} />

      {/* Tentacles (rendered behind dome) */}
      {TENTACLES.map((t, i) => (
        <View key={i} style={{
          position: 'absolute',
          width: t.w, height: t.h,
          backgroundColor: 'rgba(190,130,210,0.85)',
          borderBottomLeftRadius:  t.w,
          borderBottomRightRadius: t.w,
          top:  domeH - 3,
          left: r + t.dx - t.w / 2,
        }} />
      ))}

      {/* Dome / bell */}
      <View style={{
        width: size, height: domeH,
        backgroundColor: '#D4A8E0',
        borderTopLeftRadius:     r,
        borderTopRightRadius:    r,
        borderBottomLeftRadius:  size * 0.18,
        borderBottomRightRadius: size * 0.18,
        overflow: 'hidden',
      }}>
        {/* Primary highlight arc */}
        <View style={{
          position: 'absolute',
          width: size * 0.38, height: size * 0.22,
          borderRadius: size * 0.12,
          backgroundColor: 'rgba(255,255,255,0.52)',
          top: size * 0.07, left: size * 0.10,
          transform: [{ rotate: '-18deg' }],
        }} />
        {/* Specular dot */}
        <View style={{
          position: 'absolute',
          width: size * 0.13, height: size * 0.09,
          borderRadius: size * 0.06,
          backgroundColor: 'rgba(255,255,255,0.85)',
          top: size * 0.04, left: size * 0.54,
        }} />
      </View>
    </Animated.View>
  );
}

/** Pill card showing the word to say. 10px orange border + timer fill when active (matches LD3/LD5 Figma). */
function WordCard({ word, timerAnim, isActive }) {
  const CARD_W = W - 100;
  const CARD_H = 110;
  return (
    <View style={{ alignSelf: 'center' }}>
      {/* Thick orange border ring — always shown, matches Figma */}
      <View style={{
        borderWidth: 10, borderColor: ORANGE,
        borderRadius: (CARD_H + 20) / 2,
        shadowColor: ORANGE, shadowOffset: { width: 0, height: 0 },
        shadowOpacity: isActive ? 0.55 : 0.20, shadowRadius: 12, elevation: isActive ? 10 : 4,
      }}>
        <View style={{
          width: CARD_W, height: CARD_H, backgroundColor: WHITE,
          borderRadius: CARD_H / 2,
          justifyContent: 'center', alignItems: 'center',
          overflow: 'hidden',
        }}>
          {/* Timer fill sweeps left→right while waiting */}
          {isActive && (
            <Animated.View style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: timerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, CARD_W] }),
              backgroundColor: 'rgba(254,156,45,0.15)',
            }} />
          )}
          <Text style={{ fontSize: 56, fontWeight: '800', color: WORD_COL, letterSpacing: 3 }}>
            {word}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Eight pills — green when done, grey when pending. */
function ProgressPills({ doneCount }) {
  const pillW = (W - 96) / TOTAL_ROUNDS - 6;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
      {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
        <View key={i} style={{
          width: pillW, height: 11, borderRadius: 6,
          backgroundColor: i < doneCount ? PILL_DONE : PILL_PEND,
        }} />
      ))}
    </View>
  );
}

const BG_IMAGE = require('../../../../assets/images/WhackAMoleBG.png');

// ── Demo jellyfish (title screen — teal/mint variant) ────────────────────────────
function DemoJellyfish({ size = 100 }) {
  const r     = size / 2;
  const domeH = size * 0.62;
  const tentH = size * 0.52;
  const TENTS = [-r*0.56, -r*0.26, r*0.02, r*0.30, r*0.56];
  const TENT_H = [tentH, tentH*0.82, tentH*0.94, tentH*0.80, tentH];
  return (
    <View style={{ width: size, alignItems: 'center' }}>
      <View style={{
        width: size, height: domeH,
        backgroundColor: '#C0E4DC',
        borderTopLeftRadius: r, borderTopRightRadius: r,
        borderBottomLeftRadius: size*0.16, borderBottomRightRadius: size*0.16,
        overflow: 'hidden',
      }}>
        <View style={{
          position: 'absolute', width: size*0.36, height: size*0.20,
          borderRadius: size*0.11, backgroundColor: 'rgba(255,255,255,0.48)',
          top: size*0.07, left: size*0.10, transform: [{ rotate: '-18deg' }],
        }} />
        <View style={{
          position: 'absolute', width: size*0.12, height: size*0.08,
          borderRadius: size*0.06, backgroundColor: 'rgba(255,255,255,0.82)',
          top: size*0.04, left: size*0.55,
        }} />
      </View>
      {TENTS.map((dx, i) => (
        <View key={i} style={{
          position: 'absolute', width: 4.5, height: TENT_H[i],
          backgroundColor: 'rgba(140,200,190,0.85)',
          borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
          top: domeH - 2, left: r + dx - 2.25,
        }} />
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// Demo (instruction) screen
// ─────────────────────────────────────────────────────────────────────────────────

const DEMO_SLIDES = [
  { type: 'title' },
  { type: 'instr', num: '1', text: 'A jellyfish appears', wordActive: false, showJelly: false },
  { type: 'instr', num: '2', text: 'Say the word before the timer runs out', wordActive: true, showJelly: false },
  { type: 'instr', num: '3', text: 'Jellyfish rises', wordActive: true, showJelly: true },
];

function DemoScreen({ onFinish, onExit }) {
  const [slide, setSlide] = useState(0);
  const demoRiseAnim = useRef(new Animated.Value(0)).current;
  const demoOpac     = useRef(new Animated.Value(1)).current;
  const demoScale    = useRef(new Animated.Value(1)).current;
  const s = DEMO_SLIDES[slide];
  const CARD_W = W - 96;
  const CARD_H = 110;
  const demoHole = HOLES[0];

  useEffect(() => {
    const val = s.showJelly ? 0.65 : 0.08;
    Animated.timing(demoRiseAnim, { toValue: val, duration: 480, useNativeDriver: false }).start();
  }, [slide]);

  function next() {
    if (slide < DEMO_SLIDES.length - 1) setSlide(slide + 1);
    else onFinish();
  }
  function back() {
    if (slide > 0) setSlide(slide - 1);
    else onExit();
  }

  const isTitle = s.type === 'title';

  // ── Title slide: solid dark teal bg (matches LD1 Figma) ──────────────────
  if (isTitle) {
    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar barStyle="light-content" />

        <View style={{ paddingTop: 56, paddingHorizontal: 20 }}>
          <TouchableOpacity style={ds.backBtn} onPress={back}>
            <Text style={ds.arrowText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={ds.bigTitle}>{'Loudness\nDrills'}</Text>

          {/* Jellyfish + hole illustration */}
          <View style={{ alignItems: 'center', marginTop: 32 }}>
            <View style={{
              position: 'absolute', width: 180, height: 180,
              borderRadius: 90, backgroundColor: 'rgba(68,147,160,0.12)',
              top: -20, alignSelf: 'center',
            }} />
            <DemoJellyfish size={120} />
            {/* Hole shadow / ellipse beneath */}
            <View style={{
              width: 140, height: 38, borderRadius: 70, marginTop: 4,
              backgroundColor: 'rgba(0,0,0,0.55)',
            }} />
          </View>
        </View>

        {/* Arrow → to advance to instructions */}
        <TouchableOpacity style={ds.forwardBtn} onPress={next} activeOpacity={0.82}>
          <Text style={ds.arrowText}>→</Text>
        </TouchableOpacity>

        {/* Session progress bar — matches LD1 bottom bar */}
        <View style={ds.sessionBar}>
          <View style={ds.sessionBarFill} />
        </View>
      </View>
    );
  }

  // ── Instruction slides: game BG + dark overlay (LD2/LD3/LD4) ─────────────
  return (
    <ImageBackground source={BG_IMAGE} style={{ flex: 1 }} resizeMode="cover">
      {/* Dark overlay — 0.82 matches Figma */}
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.82)' }]} />
      <StatusBar barStyle="light-content" />

      {/* Jellyfish rising on slide 3 (LD4) */}
      {s.showJelly && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Jellyfish
            hole={demoHole}
            riseAnim={demoRiseAnim}
            scaleAnim={demoScale}
            opacityAnim={demoOpac}
          />
        </View>
      )}

      {/* Word card — slides 2 & 3 (LD3, LD4) */}
      {s.wordActive && (
        <View style={{ position: 'absolute', top: 108, left: 0, right: 0, zIndex: 5 }}>
          <View style={{ alignSelf: 'center', width: CARD_W }}>
            <View style={{
              borderWidth: 10, borderColor: ORANGE, borderRadius: (CARD_H + 20) / 2,
            }}>
              <View style={{
                height: CARD_H, backgroundColor: WHITE,
                borderRadius: CARD_H / 2,
                justifyContent: 'center', alignItems: 'center',
              }}>
                <Text style={{ fontSize: 56, fontWeight: '800', color: WORD_COL, letterSpacing: 3 }}>
                  UH
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Numbered instruction — centered in screen */}
      <View style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        justifyContent: 'center', alignItems: 'center',
        paddingHorizontal: 36, zIndex: 5,
      }}>
        <Text style={ds.instrNum}>{s.num}.</Text>
        <Text style={ds.instrText}>{s.text}</Text>
      </View>

      {/* Nav row */}
      <View style={ds.navRow}>
        <TouchableOpacity style={ds.navBtn} onPress={back}>
          <Text style={ds.arrowText}>←</Text>
        </TouchableOpacity>
        <View style={ds.dots}>
          {DEMO_SLIDES.filter(sl => sl.type === 'instr').map((_, i) => (
            <View key={i} style={[ds.dot, (slide - 1) === i && ds.dotActive]} />
          ))}
        </View>
        <TouchableOpacity style={[ds.navBtn, ds.navNext]} onPress={next}>
          <Text style={ds.arrowText}>{slide === DEMO_SLIDES.length - 1 ? 'Go!' : '→'}</Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const ds = StyleSheet.create({
  backBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center', alignItems: 'center',
  },
  bigTitle: {
    fontSize: 56, fontWeight: '800', color: WHITE,
    textAlign: 'center', letterSpacing: 2.5, lineHeight: 66,
  },
  forwardBtn: {
    alignSelf: 'center',
    width: 80, height: 64, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 60,
  },
  // Session progress bar at the bottom of the title screen (matches LD1)
  sessionBar: {
    position: 'absolute', bottom: 28, left: 47,
    width: W - 94, height: 12, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  sessionBarFill: {
    width: '42%', height: '100%', borderRadius: 13,
    backgroundColor: ORANGE,
  },
  instrNum: {
    fontSize: 38, fontWeight: '800', color: WHITE,
    letterSpacing: 1.8, marginBottom: 10,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  instrText: {
    fontSize: 28, fontWeight: '700', color: WHITE,
    textAlign: 'center', letterSpacing: 1.2, lineHeight: 38,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  navRow: {
    position: 'absolute', bottom: 44, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 32, zIndex: 10,
  },
  navBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center', alignItems: 'center',
  },
  navNext: { backgroundColor: '#2D6974', borderColor: '#2D6974' },
  arrowText: { color: WHITE, fontSize: 22, fontWeight: '600', includeFontPadding: false, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center' },
  dot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.28)' },
  dotActive: { backgroundColor: WHITE, width: 10, height: 10, borderRadius: 5 },
});

// ─────────────────────────────────────────────────────────────────────────────────
// Exercise screen (main game)
// ─────────────────────────────────────────────────────────────────────────────────

const IDLE_PROMPT_MESSAGES = [
  "You've got this!\nTry saying it loud!",
  "Take a breath\nand give it a go!",
  "Come on, your voice\nis powerful!",
  "Whenever you're ready,\nwe believe in you!",
];

function ExerciseScreen({ onComplete, onExit, onShowDemo, onSkip }) {
  const [phase, setPhase]           = useState('idle');
  const [roundIdx, setRoundIdx]     = useState(0);
  const [doneCount, setDoneCount]   = useState(0);
  const [activeHoleId, setActiveHoleId] = useState(null);
  const [idleMsg, setIdleMsg]       = useState('');

  const riseAnim    = useRef(new Animated.Value(0)).current;
  const scaleAnim   = useRef(new Animated.Value(1)).current;
  const opacAnim    = useRef(new Animated.Value(1)).current;
  const timerAnim   = useRef(new Animated.Value(1)).current;
  const volumeAnim  = useRef(new Animated.Value(0)).current;
  const idleOverlay = useRef(new Animated.Value(0)).current;

  const phaseRef          = useRef('idle');
  const roundIdxRef       = useRef(0);
  const recordingRef      = useRef(null);
  const speakRef          = useRef(null);
  const countdownRef      = useRef(null);
  const lastHoleRef       = useRef(null);
  const adaptiveThreshRef = useRef(MIN_THRESHOLD);
  const ambientSamplesRef = useRef([]);
  const calibrateTimerRef = useRef(null);
  const idleTimerRef      = useRef(null);
  const idleMsgIdxRef     = useRef(0);

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
          const p90 = sorted[Math.floor(sorted.length * 0.90)] ?? MIN_THRESHOLD;
          adaptiveThreshRef.current = Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, p90 * 1.6 + 0.12));
        }
        try { await recording.stopAndUnloadAsync(); } catch (_) {}
        startRound();
      }, CALIBRATION_MS);
    } catch (_) {
      adaptiveThreshRef.current = MIN_THRESHOLD;
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
    scaleAnim.setValue(1);
    opacAnim.setValue(1);
    timerAnim.setValue(1);

    setPhaseS('rising');
    Animated.timing(riseAnim, {
      toValue: 1, duration: RISE_MS, useNativeDriver: false,
    }).start(({ finished }) => {
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
    countdownRef.current = setTimeout(handleMiss, TIMER_MS);
    Animated.timing(timerAnim, { toValue: 0, duration: TIMER_MS, useNativeDriver: false }).start();
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
      if (!speakRef.current) {
        speakRef.current = setTimeout(() => {
          speakRef.current = null;
          if (phaseRef.current === 'waiting') handleWhack();
        }, MIN_SPEAK_MS);
      }
    } else {
      if (speakRef.current) { clearTimeout(speakRef.current); speakRef.current = null; }
    }
  }

  async function cleanup() {
    if (speakRef.current)    { clearTimeout(speakRef.current);    speakRef.current    = null; }
    if (countdownRef.current){ clearTimeout(countdownRef.current); countdownRef.current= null; }
    if (idleTimerRef.current){ clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    timerAnim.stopAnimation();
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }
    } catch (_) {}
  }

  async function handleWhack() {
    if (phaseRef.current !== 'waiting') return;
    clearIdleTimer();

    if (countdownRef.current) { clearTimeout(countdownRef.current); countdownRef.current = null; }
    if (speakRef.current)     { clearTimeout(speakRef.current);     speakRef.current     = null; }
    timerAnim.stopAnimation();

    // Stop the mic (no backend check — loud enough = whacked)
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }
    } catch (_) {}

    doWhack();
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
      setTimeout(onComplete, 1200);
      return;
    }
    setRoundS(next);
    setTimeout(() => { if (phaseRef.current !== 'done') startRound(); }, BETWEEN_MS);
  }

  const activeHole = activeHoleId != null ? HOLES.find(h => h.id === activeHoleId) : null;
  const isWaiting  = phase === 'waiting';
  const round      = ROUNDS[roundIdx] ?? ROUNDS[ROUNDS.length - 1];

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
      <View style={ex.headerRow}>
        <TouchableOpacity style={ex.xBtn} onPress={onExit} accessibilityLabel="Exit exercise">
          <Text style={ex.xText}>✕</Text>
        </TouchableOpacity>
        <Text style={ex.counter}>{doneCount + 1}/{TOTAL_ROUNDS}</Text>
        <TouchableOpacity style={ex.helpBtn} onPress={onShowDemo} accessibilityLabel="Show instructions">
          <Text style={ex.helpText}>?</Text>
        </TouchableOpacity>
      </View>

      {/* ── Word card + instruction ── */}
      <View style={ex.cardWrap}>
        <WordCard
          word={round.word}
          timerAnim={timerAnim}
          isActive={isWaiting}
        />
        <Text style={ex.instrLine}>
          Say "{round.word.toLowerCase()}" to whack a jellyfish
        </Text>
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
    </ImageBackground>
  );
}

const ex = StyleSheet.create({
  headerRow: {
    position: 'absolute', top: 52, left: 16, right: 16, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  xBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center', alignItems: 'center',
  },
  xText: { color: WHITE, fontSize: 22, fontWeight: '600', includeFontPadding: false, textAlign: 'center', lineHeight: 22 },
  counter: {
    color: WHITE, fontSize: 22, fontWeight: '800', letterSpacing: 1.0,
  },
  helpBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: ORANGE,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.50, shadowRadius: 10, elevation: 8,
  },
  helpText: { color: WHITE, fontSize: 24, fontWeight: '900', includeFontPadding: false, textAlign: 'center', lineHeight: 24 },
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

});

// ─────────────────────────────────────────────────────────────────────────────────
// Root export
// ─────────────────────────────────────────────────────────────────────────────────

export default function LoudnessDrillsExercise({ onComplete, onExit }) {
  // TODO (production): read DEMO_KEY from AsyncStorage to only show once.
  // For testing, always show the demo first.
  const [showDemo, setShowDemo] = useState(true);

  function finishDemo() { setShowDemo(false); }

  if (showDemo) return <DemoScreen onFinish={finishDemo} onExit={onExit} />;
  return (
    <ExerciseScreen
      onComplete={onComplete}
      onExit={onExit}
      onShowDemo={() => setShowDemo(true)}
      onSkip={onComplete}
    />
  );
}
