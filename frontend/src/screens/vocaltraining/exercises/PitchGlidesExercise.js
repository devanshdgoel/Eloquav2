/**
 * PitchGlidesExercise — LSVT-inspired pitch-glide vocal training.
 *
 * Clinical rationale (LSVT LOUD):
 *   - Patients with Hypokinetic Dysarthria (Parkinson's) have reduced vocal
 *     loudness and a compressed pitch range, producing monotone speech.
 *   - This exercise targets both: "UH" phonation requires a loud, sustained
 *     vowel; the five hoops are arranged low→high encouraging full-range
 *     pitch excursion (the "pitch glide" component of LSVT LOUD).
 *   - Real-time loudness biofeedback (vertical bar + jellyfish movement) makes
 *     the abstract goal of "speak louder and higher" concrete and motivating.
 *
 * Flow:
 *   1. First visit only → 3 demo/instruction slides (mint gradient).
 *   2. Main exercise: say "UH" 5 times; each triggers the jellyfish to swim
 *      upward through the next hoop (low pitch → high pitch, zigzag layout).
 *   3. Completion calls onComplete() to advance the session.
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
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Line, Circle } from 'react-native-svg';

const { width: W, height: H } = Dimensions.get('window');

// ── Config ─────────────────────────────────────────────────────────────────────
const DEMO_KEY        = '@eloqua_pitch_glides_demo_seen';
const TOTAL_HOOPS     = 5;
const SPEAK_THRESHOLD = 0.28;  // normalised 0–1 volume for phonation detection
const MIN_SPEAK_MS    = 380;   // must exceed threshold for this long (ms)
const TRAVEL_MS       = 950;   // jellyfish travel animation duration (ms)

// ── Layout ─────────────────────────────────────────────────────────────────────
const HEADER_H = 256;                          // header + pills + prompt card
const BOTTOM_H = 78;                           // mic-status strip
const SCENE_H  = H - HEADER_H - BOTTOM_H;

const HOOP_W  = 84;
const HOOP_H  = 46;
const JELLY   = 62;   // jellyfish bounding-box size
const BAR_H   = Math.round(SCENE_H * 0.56);

// Hoops: xF/yF as fractions of W/SCENE_H for the hoop's top-left corner.
// Ordered low-pitch (bottom-right) → high-pitch (top-right) in a zigzag.
const HOOP_DEFS = [
  { id: 0, xF: 0.60, yF: 0.80 },
  { id: 1, xF: 0.10, yF: 0.60 },
  { id: 2, xF: 0.58, yF: 0.41 },
  { id: 3, xF: 0.08, yF: 0.22 },
  { id: 4, xF: 0.56, yF: 0.05 },
];

const HOOPS = HOOP_DEFS.map(d => ({
  id:   d.id,
  left: d.xF * W,
  top:  d.yF * SCENE_H,
}));

// Jellyfish starting position: bottom-centre of the scene
const J0_LEFT = W / 2 - JELLY / 2;
const J0_TOP  = SCENE_H - JELLY - 8;

const ORANGE   = '#FE9C2D';
const TEAL_BG  = '#1C4047';

// ── Shared sub-components ──────────────────────────────────────────────────────

/** 3D teal cylinder representing a pitch-target hoop. */
function Hoop({ done, active }) {
  const topC  = done ? '#52C41A' : active ? ORANGE   : '#3DAAB5';
  const bodyC = done ? '#3A9012' : active ? '#D08020' : '#2D8A94';
  const botC  = done ? '#287010' : active ? '#A86012' : '#1A6870';
  const holeC = '#0C1C22';
  const topH  = HOOP_H * 0.42;

  return (
    <View style={{ width: HOOP_W, height: HOOP_H }}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: topH * 0.5, bottom: topH * 0.5, backgroundColor: bodyC }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: topH, borderRadius: HOOP_W / 2, backgroundColor: botC }} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0,    height: topH, borderRadius: HOOP_W / 2, backgroundColor: topC }} />
      <View style={{ position: 'absolute', left: HOOP_W * 0.15, right: HOOP_W * 0.15, top: topH * 0.10, height: topH * 0.75, borderRadius: HOOP_W, backgroundColor: holeC }} />
      {active && !done && (
        <View style={{ position: 'absolute', top: -5, bottom: -5, left: -5, right: -5, borderRadius: HOOP_W / 2 + 5, borderWidth: 2.5, borderColor: 'rgba(254,156,45,0.55)' }} />
      )}
    </View>
  );
}

/** Dark oval shadow beneath each hoop ("hole in the floor" illusion). */
function HoleShadow({ left, top }) {
  return (
    <View style={{
      position: 'absolute',
      left:   left  - HOOP_W * 0.18,
      top:    top   + HOOP_H * 0.66,
      width:  HOOP_W * 1.36,
      height: HOOP_H * 0.54,
      borderRadius: HOOP_W,
      backgroundColor: 'rgba(0,0,0,0.40)',
    }} />
  );
}

/** Pink jellyfish drawn entirely with React Native views. */
function Jellyfish({ glowing }) {
  const domeH = JELLY * 0.55;
  return (
    <View style={{ width: JELLY, height: JELLY, alignItems: 'center' }}>
      {glowing && (
        <View style={{
          position: 'absolute',
          width:  JELLY * 1.8, height: JELLY * 1.8,
          borderRadius: JELLY * 0.9,
          backgroundColor: 'rgba(210,140,195,0.22)',
          top:  -JELLY * 0.4, left: -JELLY * 0.4,
        }} />
      )}
      {/* Dome */}
      <View style={{
        width: JELLY * 0.86, height: domeH,
        borderTopLeftRadius: JELLY * 0.43, borderTopRightRadius: JELLY * 0.43,
        backgroundColor: '#CFA0C5', overflow: 'hidden',
      }}>
        <View style={{ position: 'absolute', width: JELLY * 0.20, height: JELLY * 0.14, borderRadius: JELLY * 0.07, top: JELLY * 0.08, left: JELLY * 0.11, backgroundColor: 'rgba(255,255,255,0.52)' }} />
        <View style={{ position: 'absolute', width: JELLY * 0.10, height: JELLY * 0.09, borderRadius: JELLY * 0.05, top: JELLY * 0.06, left: JELLY * 0.36, backgroundColor: 'rgba(255,255,255,0.38)' }} />
      </View>
      {/* Tentacles */}
      <View style={{ flexDirection: 'row', gap: 3.5, paddingHorizontal: 7, marginTop: 2 }}>
        {[0.65, 0.85, 1.0, 1.0, 0.85, 0.65].map((h, i) => (
          <View key={i} style={{ width: 3, height: JELLY * 0.30 * h, borderRadius: 2, backgroundColor: 'rgba(185,125,170,0.70)' }} />
        ))}
      </View>
    </View>
  );
}

/** Vertical loudness bar with target-zone marker. */
function VolumeBar({ volumeAnim }) {
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Text style={vb.lbl}>LOUD</Text>
      <View style={{ width: 22, height: BAR_H, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.30)', overflow: 'hidden' }}>
        {/* Target zone */}
        <View style={{ position: 'absolute', bottom: '38%', left: 0, right: 0, height: BAR_H * 0.22, backgroundColor: 'rgba(254,156,45,0.18)' }} />
        <View style={{ position: 'absolute', bottom: '60%', left: 0, right: 0, height: 2, backgroundColor: 'rgba(254,156,45,0.55)' }} />
        {/* Live fill */}
        <Animated.View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: 11,
          backgroundColor: ORANGE,
          height: volumeAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }} />
      </View>
      <Text style={vb.lbl}>SOFT</Text>
    </View>
  );
}
const vb = StyleSheet.create({ lbl: { color: 'rgba(255,255,255,0.45)', fontSize: 9, fontWeight: '700', letterSpacing: 0.9 } });

/** 5 green/grey progress pills. */
function ProgressPills({ doneCount }) {
  return (
    <View style={{ flexDirection: 'row', gap: 5, justifyContent: 'center' }}>
      {Array.from({ length: TOTAL_HOOPS }, (_, i) => (
        <View key={i} style={{ width: 54, height: 10, borderRadius: 24, backgroundColor: i < doneCount ? '#45B013' : 'rgba(255,255,255,0.26)' }} />
      ))}
    </View>
  );
}

// ── Demo slides ────────────────────────────────────────────────────────────────

const SLIDES = [
  {
    num:   '1',
    title: 'Pitch Glides',
    body:  'Help the jellyfish swim through every hoop by saying "UH"! Each hoop is higher than the last — let your voice glide up.',
    tip:   'Look at where the hoops are — the higher up, the higher your pitch target.',
  },
  {
    num:   '2',
    title: 'Big, Loud Voice!',
    body:  'Take a deep breath, then say "UH" as loud and as long as you comfortably can. Fill the room with your voice!',
    tip:   'LSVT LOUD: aim for maximum effort every single time you speak.',
  },
  {
    num:   '3',
    title: "Let's Glide!",
    body:  'Each "UH" sends the jellyfish to the next hoop — higher each time. Take a full breath between every attempt.',
    tip:   'Breathe in between each "UH" to focus your energy on a perfectly loud sound.',
  },
];

// Zigzag diagram positions used in the demo illustration
const DEMO_PTS = [
  { x: W * 0.62, y: 24 },
  { x: W * 0.20, y: 78 },
  { x: W * 0.60, y: 130 },
  { x: W * 0.18, y: 182 },
  { x: W * 0.58, y: 234 },
];

function DemoSlide({ idx, onNext, onBack, onSkip }) {
  const s      = SLIDES[idx];
  const isLast = idx === SLIDES.length - 1;

  return (
    <LinearGradient
      colors={['#E0ECDE', '#68B39F', '#2D6974']}
      locations={[0, 0.52, 1]}
      start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
      style={StyleSheet.absoluteFillObject}
    >
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={dm.header}>
        <View style={dm.numCircle}>
          <Text style={dm.numText}>{s.num}</Text>
        </View>
        <TouchableOpacity style={dm.skipBtn} onPress={onSkip}>
          <Text style={dm.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <Text style={dm.title}>{s.title}</Text>
      <Text style={dm.body}>{s.body}</Text>

      {/* Illustration: zigzag numbered hoops + mini jellyfish */}
      <View style={{ height: 286, marginTop: 6 }}>
        <Svg width={W} height={286} style={StyleSheet.absoluteFillObject}>
          {DEMO_PTS.slice(1).map((pt, i) => {
            const prev = DEMO_PTS[i];
            return (
              <Line
                key={i}
                x1={prev.x + 22} y1={prev.y + 22}
                x2={pt.x   + 22} y2={pt.y   + 22}
                stroke="rgba(44,105,116,0.45)"
                strokeWidth={2}
                strokeDasharray="6,5"
              />
            );
          })}
          {DEMO_PTS.map((pt, i) => (
            <Circle key={i} cx={pt.x + 22} cy={pt.y + 22} r={22} fill="rgba(45,105,116,0.20)" stroke="rgba(44,105,116,0.55)" strokeWidth={2} />
          ))}
        </Svg>
        {/* Hoop numbers */}
        {DEMO_PTS.map((pt, i) => (
          <Text key={i} style={[dm.hoopNum, { position: 'absolute', left: pt.x + 8, top: pt.y + 8 }]}>
            {i + 1}
          </Text>
        ))}
        {/* Mini jellyfish at start */}
        <View style={{ position: 'absolute', left: W * 0.62 - JELLY * 0.3, top: 258 }}>
          <Jellyfish glowing={false} />
        </View>
      </View>

      {/* Top Tip */}
      <View style={dm.tip}>
        <Text style={dm.tipTitle}>Top Tip</Text>
        <Text style={dm.tipBody}>{s.tip}</Text>
      </View>

      {/* Navigation */}
      <View style={dm.nav}>
        {idx > 0
          ? <TouchableOpacity style={dm.navBtn} onPress={onBack}><Text style={dm.navIcon}>←</Text></TouchableOpacity>
          : <View style={dm.navBtn} />
        }
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[dm.dot, i === idx && dm.dotActive]} />
          ))}
        </View>
        <TouchableOpacity style={[dm.navBtn, dm.navBtnGo]} onPress={onNext}>
          <Text style={[dm.navIcon, { color: '#fff' }]}>{isLast ? '▶' : '→'}</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const dm = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingHorizontal: 24, paddingBottom: 4,
  },
  numCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: TEAL_BG, justifyContent: 'center', alignItems: 'center' },
  numText:   { color: '#fff', fontSize: 26, fontWeight: '800' },
  skipBtn:   { backgroundColor: ORANGE, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8 },
  skipText:  { color: '#fff', fontSize: 14, fontWeight: '700' },
  title: { color: TEAL_BG, fontSize: 30, fontWeight: '800', letterSpacing: 0.6, textAlign: 'center', marginTop: 14, paddingHorizontal: 24 },
  body:  { color: TEAL_BG, fontSize: 15, lineHeight: 23, letterSpacing: 0.3, textAlign: 'center', marginTop: 8,  paddingHorizontal: 32 },
  hoopNum: { fontSize: 20, fontWeight: '800', color: TEAL_BG, width: 44, textAlign: 'center' },
  tip:      { marginHorizontal: 28, borderRadius: 12, borderWidth: 1.5, borderColor: '#2D6974', backgroundColor: '#fff', padding: 16 },
  tipTitle: { fontSize: 18, fontWeight: '800', color: TEAL_BG, marginBottom: 5 },
  tipBody:  { fontSize: 13, color: '#2D6974', lineHeight: 19, letterSpacing: 0.3 },
  nav:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32, paddingTop: 22 },
  navBtn:   { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(44,105,116,0.15)', justifyContent: 'center', alignItems: 'center' },
  navBtnGo: { backgroundColor: '#2D6974' },
  navIcon:  { fontSize: 22, color: TEAL_BG, fontWeight: '600' },
  dot:      { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(44,105,116,0.28)' },
  dotActive:{ backgroundColor: TEAL_BG, width: 28, borderRadius: 5 },
});

// ── Exercise screen ────────────────────────────────────────────────────────────
/**
 * phase:
 *   'breathe' — brief pause between attempts ("take a breath")
 *   'listen'  — microphone active; waiting for "UH"
 *   'travel'  — jellyfish animating toward target hoop
 *   'done'    — all 5 hoops complete
 */
function ExerciseScreen({ onComplete, onExit }) {
  const [hoopIndex, setHoopIndex] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [phase,     setPhase]     = useState('breathe');
  const [micActive, setMicActive] = useState(false);

  const jellyfishLeft = useRef(new Animated.Value(J0_LEFT)).current;
  const jellyfishTop  = useRef(new Animated.Value(J0_TOP)).current;
  const volumeAnim    = useRef(new Animated.Value(0)).current;

  const recordingRef  = useRef(null);
  const speakTimerRef = useRef(null);
  const phaseRef      = useRef('breathe');
  const hoopIdxRef    = useRef(0);

  useEffect(() => { phaseRef.current  = phase;     }, [phase]);
  useEffect(() => { hoopIdxRef.current = hoopIndex; }, [hoopIndex]);

  useEffect(() => {
    startBreathePause();
    return () => { stopRecording(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Breathing pause (1.4 s) before mic opens ──────────────────────────────
  function startBreathePause() {
    setPhase('breathe');
    setMicActive(false);
    Animated.timing(volumeAnim, { toValue: 0, duration: 300, useNativeDriver: false }).start();
    setTimeout(startListening, 1400);
  }

  // ── Open microphone ───────────────────────────────────────────────────────
  async function startListening() {
    if (phaseRef.current === 'travel' || phaseRef.current === 'done') return;
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        {
          android: Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
          ios:     Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
          web:     {},
          isMeteringEnabled: true,
        },
        onMeterUpdate,
        80,
      );
      recordingRef.current = recording;
      setMicActive(true);
      setPhase('listen');
    } catch (err) {
      console.warn('PitchGlides mic error:', err);
    }
  }

  // ── Volume metering callback ───────────────────────────────────────────────
  function onMeterUpdate(status) {
    if (!status.isRecording || phaseRef.current !== 'listen') return;

    const db  = status.metering ?? -160;
    const vol = Math.min(1, Math.max(0, (db + 70) / 60));
    Animated.timing(volumeAnim, { toValue: vol, duration: 80, useNativeDriver: false }).start();

    if (vol >= SPEAK_THRESHOLD) {
      if (!speakTimerRef.current) {
        speakTimerRef.current = setTimeout(() => {
          speakTimerRef.current = null;
          if (phaseRef.current === 'listen') handleVoiceDetected();
        }, MIN_SPEAK_MS);
      }
    } else {
      if (speakTimerRef.current) {
        clearTimeout(speakTimerRef.current);
        speakTimerRef.current = null;
      }
    }
  }

  // ── Stop recording ────────────────────────────────────────────────────────
  async function stopRecording() {
    if (speakTimerRef.current) { clearTimeout(speakTimerRef.current); speakTimerRef.current = null; }
    if (!recordingRef.current) return;
    try { await recordingRef.current.stopAndUnloadAsync(); } catch (_) {}
    recordingRef.current = null;
    setMicActive(false);
  }

  // ── Voice detected — animate jellyfish to target hoop ────────────────────
  async function handleVoiceDetected() {
    setPhase('travel');
    await stopRecording();

    const target  = HOOPS[hoopIdxRef.current];
    // Centre jellyfish horizontally on hoop, hover just above the top rim
    const destL   = target.left + HOOP_W / 2 - JELLY / 2;
    const destT   = target.top  - JELLY * 0.55;

    Animated.parallel([
      Animated.timing(jellyfishLeft, { toValue: destL, duration: TRAVEL_MS, useNativeDriver: false }),
      Animated.timing(jellyfishTop,  { toValue: destT, duration: TRAVEL_MS, useNativeDriver: false }),
    ]).start(() => {
      const next = hoopIdxRef.current + 1;
      setDoneCount(next);

      if (next >= TOTAL_HOOPS) {
        setPhase('done');
        setHoopIndex(TOTAL_HOOPS);
        setTimeout(onComplete, 1600);
      } else {
        setHoopIndex(next);
        setTimeout(startBreathePause, 600);
      }
    });
  }

  const promptActive = phase === 'listen';
  const phaseLabel   =
    phase === 'breathe' ? 'Take a deep breath…' :
    phase === 'listen'  ? 'Say "UH" — loud!' :
    phase === 'travel'  ? 'Great — keep going!' :
                          'Well done! 🎉';

  return (
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: TEAL_BG }]}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ───────────────────────────────────────────────────── */}
      <View style={ex.header}>
        <TouchableOpacity style={ex.closeBtn} onPress={onExit}>
          <Text style={ex.closeText}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <View style={ex.helpCircle}>
          <Text style={ex.helpText}>?</Text>
        </View>
      </View>

      {/* ── Progress pills ────────────────────────────────────────────── */}
      <View style={{ marginTop: 12 }}>
        <ProgressPills doneCount={doneCount} />
      </View>

      {/* ── "UH" prompt card ─────────────────────────────────────────── */}
      <View style={[ex.promptCard, promptActive && ex.promptCardActive]}>
        <Text style={ex.promptText}>UH</Text>
      </View>

      {/* ── Underwater scene ─────────────────────────────────────────── */}
      <View style={ex.scene}>

        {/* Decorative seabed circles */}
        <View style={[ex.dec, { width: 160, height: 72,  left: W * 0.40, top: SCENE_H * 0.38 }]} />
        <View style={[ex.dec, { width: 120, height: 54,  left: W * 0.00, top: SCENE_H * 0.52 }]} />
        <View style={[ex.dec, { width: 200, height: 82,  left: W * 0.28, top: SCENE_H * 0.70 }]} />
        <View style={[ex.dec, { width: 140, height: 58,  left: W * 0.48, top: SCENE_H * 0.16 }]} />
        <View style={[ex.dec, { width: 100, height: 42,  left: W * 0.06, top: SCENE_H * 0.30 }]} />

        {/* Hole shadows */}
        {HOOPS.map(h => <HoleShadow key={h.id} left={h.left} top={h.top} />)}

        {/* Hoops */}
        {HOOPS.map(h => (
          <View key={h.id} style={{ position: 'absolute', left: h.left, top: h.top }}>
            <Hoop done={h.id < doneCount} active={h.id === hoopIndex && phase !== 'done'} />
          </View>
        ))}

        {/* Vertical loudness bar — left side */}
        <View style={[ex.barWrap, { top: (SCENE_H - BAR_H) / 2 - 18 }]}>
          <VolumeBar volumeAnim={volumeAnim} />
        </View>

        {/* Jellyfish */}
        <Animated.View style={{ position: 'absolute', left: jellyfishLeft, top: jellyfishTop }}>
          <Jellyfish glowing={phase === 'travel'} />
        </Animated.View>

      </View>

      {/* ── Bottom mic status strip ───────────────────────────────────── */}
      <View style={ex.bottom}>
        <View style={[ex.micDot, micActive && ex.micDotOn]} />
        <Text style={ex.bottomLbl}>{phaseLabel}</Text>
      </View>
    </View>
  );
}

const ex = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 20,
  },
  closeBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  closeText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  helpCircle: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: ORANGE,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45, shadowRadius: 6, elevation: 6,
  },
  helpText: { color: '#fff', fontSize: 17, fontWeight: '800' },

  promptCard: {
    marginTop: 14, marginHorizontal: 28, height: 82, borderRadius: 60,
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10, shadowRadius: 5, elevation: 4,
    borderWidth: 3.5, borderColor: 'transparent',
  },
  promptCardActive: {
    borderColor: ORANGE,
    shadowColor: ORANGE, shadowOpacity: 0.38, shadowRadius: 12, elevation: 8,
  },
  promptText: {
    color: '#1F4850', fontSize: 54, fontWeight: '800',
    letterSpacing: 4, lineHeight: 62,
  },

  scene: {
    position: 'absolute',
    top: HEADER_H, left: 0, right: 0, height: SCENE_H,
    overflow: 'hidden',
  },
  dec: {
    position: 'absolute', borderRadius: 200,
    backgroundColor: 'rgba(255,255,255,0.034)',
  },
  barWrap: {
    position: 'absolute', left: 14,
  },

  bottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: BOTTOM_H,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  micDot:  { width: 12, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.28)' },
  micDotOn: {
    backgroundColor: '#45B013',
    shadowColor: '#45B013', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85, shadowRadius: 6, elevation: 4,
  },
  bottomLbl: { color: 'rgba(255,255,255,0.75)', fontSize: 15, fontWeight: '600', letterSpacing: 0.4 },
});

// ── Root ───────────────────────────────────────────────────────────────────────

export default function PitchGlidesExercise({ onComplete, onExit }) {
  const [ready,     setReady]     = useState(false);
  const [showDemo,  setShowDemo]  = useState(false);
  const [slideIdx,  setSlideIdx]  = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(DEMO_KEY).then(val => {
      setShowDemo(!val);
      setReady(true);
    });
  }, []);

  async function finishDemo() {
    await AsyncStorage.setItem(DEMO_KEY, '1');
    setShowDemo(false);
  }

  if (!ready) return null;

  if (showDemo) {
    return (
      <DemoSlide
        idx={slideIdx}
        onNext={() => slideIdx < SLIDES.length - 1 ? setSlideIdx(slideIdx + 1) : finishDemo()}
        onBack={() => setSlideIdx(Math.max(0, slideIdx - 1))}
        onSkip={finishDemo}
      />
    );
  }

  return <ExerciseScreen onComplete={onComplete} onExit={onExit} />;
}
