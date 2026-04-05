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
} from 'react-native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: W, height: H } = Dimensions.get('window');

// ── Config ──────────────────────────────────────────────────────────────────────
const DEMO_KEY        = '@eloqua_loudness_drills_demo_seen';
const TOTAL_ROUNDS    = 5;
const SPEAK_THRESHOLD = 0.30;  // normalised vol (0–1) for phonation detection
const MIN_SPEAK_MS    = 280;   // must sustain threshold for this long (ms)
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
];

// ── Hole geometry (calibrated from Figma 402×874 frame) ─────────────────────────
const B_CYL_W = 136;  // base cylinder width  (sz = 1.0)
const B_CYL_H = 52;   // base cylinder body height
const B_RIM_H = 20;   // base rim ellipse height

const HOLE_DEFS = [
  { id: 0, xF: 0.25, yF: 0.71, sz: 1.00 }, // bottom-left  (closest, big)
  { id: 1, xF: 0.79, yF: 0.61, sz: 0.76 }, // mid-right
  { id: 2, xF: 0.42, yF: 0.56, sz: 0.88 }, // centre
  { id: 3, xF: 0.75, yF: 0.49, sz: 0.56 }, // far-right   (small)
  { id: 4, xF: 0.20, yF: 0.52, sz: 0.66 }, // far-left    (small)
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

/** Floor shadow cast beneath each cylinder. Drawn first (deepest z). */
function HoleShadow({ hole }) {
  const { cx, cy, cylW, cylH, rimH } = hole;
  const sW = cylW * 1.55;
  const sH = sW * 0.36;
  return (
    <View pointerEvents="none" style={{
      position: 'absolute',
      left:   cx - sW / 2,
      top:    cy + cylH + rimH * 0.15,
      width:  sW,
      height: sH,
      borderRadius: sW / 2,
      backgroundColor: 'rgba(0,0,0,0.60)',
    }} />
  );
}

/** Teal cylinder + rim + inner dark hole. Drawn after jellyfish when active. */
function HoleCylinder({ hole, isActive }) {
  const { cx, cy, cylW, cylH, rimH, sz } = hole;
  const innerW = cylW * 0.74;
  const innerH = innerW * 0.38;
  const rimCol = isActive ? CYL_HIGH : CYL_FILL;
  return (
    <View pointerEvents="none">
      <View style={{
        position: 'absolute',
        left: cx - cylW / 2, top: cy,
        width: cylW, height: cylH,
        backgroundColor: CYL_FILL,
        borderBottomLeftRadius:  5 * sz,
        borderBottomRightRadius: 5 * sz,
      }} />
      <View style={{
        position: 'absolute',
        left: cx - cylW / 2, top: cy - rimH / 2,
        width: cylW, height: rimH,
        borderRadius: cylW / 2,
        backgroundColor: rimCol,
      }} />
      <View style={{
        position: 'absolute',
        left: cx - innerW / 2, top: cy - innerH / 2,
        width: innerW, height: innerH,
        borderRadius: innerW / 2,
        backgroundColor: HOLE_DARK,
      }} />
    </View>
  );
}

function HoleFull({ hole }) {
  return (
    <>
      <HoleShadow hole={hole} />
      <HoleCylinder hole={hole} isActive={false} />
    </>
  );
}

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

/** Pill card showing the word to say. Orange border + timer fill when active. */
function WordCard({ word, tip, timerAnim, isActive }) {
  const CARD_W = W - 96;
  const CARD_H = 110;
  return (
    <View style={{ alignSelf: 'center', width: CARD_W, height: CARD_H }}>
      {isActive && (
        <View style={{
          position: 'absolute',
          left: -5, right: -5, top: -5, bottom: -5,
          borderRadius: (CARD_H + 10) / 2,
          borderWidth: 5, borderColor: ORANGE,
          shadowColor: ORANGE, shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.50, shadowRadius: 10, elevation: 8,
        }} />
      )}
      <View style={{
        flex: 1, backgroundColor: WHITE,
        borderRadius: CARD_H / 2,
        justifyContent: 'center', alignItems: 'center',
        overflow: 'hidden',
      }}>
        {isActive && (
          <Animated.View style={{
            position: 'absolute',
            left: 0, top: 0, bottom: 0,
            width: timerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, CARD_W] }),
            backgroundColor: 'rgba(254,156,45,0.13)',
          }} />
        )}
        <Text style={{ fontSize: 52, fontWeight: '800', color: WORD_COL, letterSpacing: 3 }}>
          {word}
        </Text>
      </View>
      {isActive && tip ? (
        <Text style={{
          textAlign: 'center', color: 'rgba(255,255,255,0.60)',
          fontSize: 13, marginTop: 6, letterSpacing: 0.4,
        }}>
          {tip}
        </Text>
      ) : null}
    </View>
  );
}

/** Five pills — green when done, grey when pending. */
function ProgressPills({ doneCount }) {
  const pillW = (W - 96) / TOTAL_ROUNDS - 8;
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

/** Subtle underwater depth ovals in the background. */
function UnderwaterBg() {
  const ovals = [
    { x: 0.58, y: 0.40, w: 119, h: 22 },
    { x: 0.15, y: 0.44, w:  93, h: 26 },
    { x: 0.68, y: 0.46, w: 112, h: 28 },
    { x: 0.62, y: 0.35, w:  43, h:  8 },
    { x: 0.90, y: 0.37, w:  43, h:  8 },
    { x: 0.41, y: 0.38, w: 104, h: 17 },
    { x: 0.26, y: 0.61, w: 138, h: 53 },
    { x: 0.57, y: 0.68, w: 138, h: 75 },
    { x: 0.32, y: 0.50, w: 228, h: 58 },
  ];
  return (
    <>
      {ovals.map((o, i) => (
        <View key={i} pointerEvents="none" style={{
          position: 'absolute',
          left: W * o.x - o.w / 2, top: H * o.y - o.h / 2,
          width: o.w, height: o.h,
          borderRadius: o.w / 2,
          backgroundColor: 'rgba(68,147,160,0.16)',
        }} />
      ))}
    </>
  );
}

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
  { type: 'instr', num: '1', text: 'A jellyfish appears\nfrom a hole', wordActive: false, showJelly: false },
  { type: 'instr', num: '2', text: 'Say the word before\nthe timer runs out',  wordActive: true,  showJelly: false },
  { type: 'instr', num: '3', text: 'Jellyfish rises!\nWhack it with your voice', wordActive: true,  showJelly: true  },
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

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />

      {/* ── Title slide ─── */}
      {s.type === 'title' && (
        <>
          <TouchableOpacity style={ds.backBtn} onPress={back}>
            <Text style={ds.arrowText}>←</Text>
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 36 }}>
            <Text style={ds.bigTitle}>{'Loudness\nDrills'}</Text>

            {/* Jellyfish illustration */}
            <View style={{ alignItems: 'center' }}>
              {/* Teal glow */}
              <View style={{
                position: 'absolute', width: 170, height: 170,
                borderRadius: 85, backgroundColor: 'rgba(80,180,190,0.10)',
                top: -20, alignSelf: 'center',
              }} />
              <DemoJellyfish size={110} />
              {/* Shadow oval */}
              <View style={{
                width: 130, height: 36, borderRadius: 65, marginTop: 6,
                backgroundColor: 'rgba(0,0,0,0.45)',
              }} />
            </View>

            <Text style={ds.subText}>Speak as loudly as you can!</Text>

            <TouchableOpacity style={ds.forwardBtn} onPress={next}>
              <Text style={ds.arrowText}>→</Text>
            </TouchableOpacity>
          </View>

          <View style={ds.dots}>
            {DEMO_SLIDES.map((_, i) => (
              <View key={i} style={[ds.dot, i === slide && ds.dotActive]} />
            ))}
          </View>
        </>
      )}

      {/* ── Instruction slides ─── */}
      {s.type === 'instr' && (
        <>
          {/* Game scene in background */}
          <View style={StyleSheet.absoluteFillObject}>
            <UnderwaterBg />
            {HOLES.map(h => <HoleFull key={h.id} hole={h} />)}
            {s.showJelly && (
              <>
                <HoleShadow hole={demoHole} />
                <Jellyfish
                  hole={demoHole}
                  riseAnim={demoRiseAnim}
                  scaleAnim={demoScale}
                  opacityAnim={demoOpac}
                />
                <HoleCylinder hole={demoHole} isActive />
              </>
            )}
          </View>

          {/* Dark overlay */}
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.80)' }]} />

          {/* Word card */}
          <View style={{ position: 'absolute', top: 80, left: 0, right: 0, zIndex: 5 }}>
            <View style={{ alignSelf: 'center', width: CARD_W, height: CARD_H }}>
              {s.wordActive && (
                <View style={{
                  position: 'absolute', left: -5, right: -5, top: -5, bottom: -5,
                  borderRadius: (CARD_H + 10) / 2,
                  borderWidth: 5, borderColor: ORANGE,
                }} />
              )}
              <View style={{
                flex: 1, backgroundColor: WHITE,
                borderRadius: CARD_H / 2,
                justifyContent: 'center', alignItems: 'center',
              }}>
                <Text style={{ fontSize: 52, fontWeight: '800', color: WORD_COL, letterSpacing: 3 }}>
                  UH
                </Text>
              </View>
            </View>
          </View>

          {/* Instruction text */}
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            justifyContent: 'center', alignItems: 'center',
            paddingHorizontal: 32, zIndex: 5,
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
              {DEMO_SLIDES.map((_, i) => (
                <View key={i} style={[ds.dot, i === slide && ds.dotActive]} />
              ))}
            </View>
            <TouchableOpacity style={[ds.navBtn, ds.navNext]} onPress={next}>
              <Text style={ds.arrowText}>{slide === DEMO_SLIDES.length - 1 ? 'Go!' : '→'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const ds = StyleSheet.create({
  backBtn: {
    position: 'absolute', top: 52, left: 20, zIndex: 10,
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  bigTitle: {
    fontSize: 62, fontWeight: '800', color: WHITE,
    textAlign: 'center', letterSpacing: 3.2, lineHeight: 70,
  },
  subText: {
    fontSize: 17, color: 'rgba(255,255,255,0.65)',
    textAlign: 'center', letterSpacing: 0.4,
  },
  forwardBtn: {
    width: 64, height: 64, borderRadius: 16,
    backgroundColor: '#2D6974',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30, shadowRadius: 6, elevation: 6,
  },
  instrNum: {
    fontSize: 34, fontWeight: '800', color: WHITE,
    letterSpacing: 1.6, marginBottom: 8,
  },
  instrText: {
    fontSize: 26, fontWeight: '700', color: WHITE,
    textAlign: 'center', letterSpacing: 1.0, lineHeight: 36,
  },
  navRow: {
    position: 'absolute', bottom: 44, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 32, zIndex: 10,
  },
  navBtn: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center', alignItems: 'center',
  },
  navNext: { backgroundColor: '#2D6974' },
  arrowText: { color: WHITE, fontSize: 20, fontWeight: '600' },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center' },
  dot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.28)' },
  dotActive: { backgroundColor: WHITE, width: 10, height: 10, borderRadius: 5 },
});

// ─────────────────────────────────────────────────────────────────────────────────
// Exercise screen (main game)
// ─────────────────────────────────────────────────────────────────────────────────

function ExerciseScreen({ onComplete, onExit }) {
  const [phase, setPhase]           = useState('idle');
  const [roundIdx, setRoundIdx]     = useState(0);
  const [doneCount, setDoneCount]   = useState(0);
  const [activeHoleId, setActiveHoleId] = useState(null);

  const riseAnim   = useRef(new Animated.Value(0)).current;
  const scaleAnim  = useRef(new Animated.Value(1)).current;
  const opacAnim   = useRef(new Animated.Value(1)).current;
  const timerAnim  = useRef(new Animated.Value(1)).current;
  const volumeAnim = useRef(new Animated.Value(0)).current;

  const phaseRef      = useRef('idle');
  const roundIdxRef   = useRef(0);
  const recordingRef  = useRef(null);
  const speakRef      = useRef(null);
  const countdownRef  = useRef(null);
  const lastHoleRef   = useRef(null);

  function setPhaseS(p) { phaseRef.current = p; setPhase(p); }
  function setRoundS(n) { roundIdxRef.current = n; setRoundIdx(n); }

  // Start first round after a short delay
  useEffect(() => {
    const t = setTimeout(startRound, 700);
    return () => { clearTimeout(t); cleanup(); };
  }, []);

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

  async function beginWaiting() {
    setPhaseS('waiting');
    await startMic();
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

    if (vol >= SPEAK_THRESHOLD) {
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
    setPhaseS('whacked');
    await cleanup();

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
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />

      {/* ── Full-screen scene ── */}
      <View style={StyleSheet.absoluteFillObject}>
        <UnderwaterBg />
        {backHoles.map(h => <HoleFull key={h.id} hole={h} />)}

        {activeHole && <HoleShadow hole={activeHole} />}
        {activeHole && (
          <Jellyfish
            hole={activeHole}
            riseAnim={riseAnim}
            scaleAnim={scaleAnim}
            opacityAnim={opacAnim}
          />
        )}
        {/* Cylinder drawn on top of jellyfish → masks submerged part */}
        {activeHole && <HoleCylinder hole={activeHole} isActive />}
      </View>

      {/* ── Back button ── */}
      <TouchableOpacity style={ex.backBtn} onPress={onExit}>
        <Text style={ex.backText}>←</Text>
      </TouchableOpacity>

      {/* ── Progress pills ── */}
      <View style={ex.pillsWrap}>
        <ProgressPills doneCount={doneCount} />
      </View>

      {/* ── Word card ── */}
      <View style={ex.cardWrap}>
        <WordCard
          word={round.word}
          tip={round.tip}
          timerAnim={timerAnim}
          isActive={isWaiting}
        />
      </View>

      {/* ── Bottom mic strip ── */}
      <View style={ex.strip}>
        <Animated.View style={[ex.micDot, {
          backgroundColor: volumeAnim.interpolate({
            inputRange:  [0, SPEAK_THRESHOLD, 1],
            outputRange: ['#4A7070', '#45B013', '#45B013'],
          }),
        }]} />
        <Text style={ex.stripLabel}>
          {phase === 'waiting' ? 'Say it loud!'
           : phase === 'whacked' ? 'Great hit!'
           : phase === 'done'    ? 'Complete!'
           : ''}
        </Text>
      </View>
    </View>
  );
}

const ex = StyleSheet.create({
  backBtn: {
    position: 'absolute', top: 52, left: 20, zIndex: 20,
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  backText: { color: WHITE, fontSize: 18, fontWeight: '600' },
  pillsWrap: {
    position: 'absolute', top: 56, left: 0, right: 0, zIndex: 20,
  },
  cardWrap: {
    position: 'absolute', top: 84, left: 0, right: 0, zIndex: 20,
  },
  strip: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 68,
    backgroundColor: 'rgba(0,0,0,0.32)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingBottom: 14, zIndex: 20,
  },
  micDot: { width: 10, height: 10, borderRadius: 5 },
  stripLabel: {
    color: 'rgba(255,255,255,0.68)', fontSize: 13, letterSpacing: 0.5,
  },
});

// ─────────────────────────────────────────────────────────────────────────────────
// Root export
// ─────────────────────────────────────────────────────────────────────────────────

export default function LoudnessDrillsExercise({ onComplete, onExit }) {
  const [showDemo, setShowDemo] = useState(null); // null = loading

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
  return <ExerciseScreen onComplete={onComplete} onExit={onExit} />;
}
