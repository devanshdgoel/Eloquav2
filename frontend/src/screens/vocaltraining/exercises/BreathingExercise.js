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
  PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode, Audio } from 'expo-av';
import Svg, { Path, Polygon } from 'react-native-svg';
import CantDoNow from '../../../components/CantDoNow';

const { width: W, height: H } = Dimensions.get('window');

// ── Steps ─────────────────────────────────────────────────────────────────────
const STEP_TITLE = 0;
const STEP_VIDEO = 1;
const STEP_DRILL = 2;

// ── Timing ────────────────────────────────────────────────────────────────────
const INHALE_S  = 4;
const HOLD_S    = 2;
const EXHALE_S  = 4;
const INHALE_MS = INHALE_S * 1000;
const HOLD_MS   = HOLD_S   * 1000;
const EXHALE_MS = EXHALE_S * 1000;
const TOTAL_CYCLES = 3;

// ── Bubble geometry ───────────────────────────────────────────────────────────
const BUBBLE_BASE = 240;
const SCALE_SMALL = 0.34;
const SCALE_LARGE = 1.0;

// ── Shared gradient ───────────────────────────────────────────────────────────
const BG_GRADIENT  = ['#2D858B', '#37767A', '#0A1618'];
const BG_LOCATIONS = [0.2, 0.44, 1.0];
const BG_START     = { x: 1, y: 0.1 };
const BG_END       = { x: 0, y: 0.9 };

// ── Fade-in wrapper — each screen fades in on mount ───────────────────────────
function FadeIn({ children }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={{ flex: 1, opacity }}>
      {children}
    </Animated.View>
  );
}

// ── Session progress bar (TitleScreen only) ───────────────────────────────────
function SessionBar({ fill = 0.14 }) {
  return (
    <View style={sb.track}>
      <View style={[sb.fill, { width: `${fill * 100}%` }]} />
    </View>
  );
}
const sb = StyleSheet.create({
  track: {
    position: 'absolute', bottom: 28, left: 47,
    width: W - 94, height: 12, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  fill: { height: '100%', borderRadius: 13, backgroundColor: '#FE9C2D' },
});

// ── Cycle progress pills ──────────────────────────────────────────────────────
function CyclePills({ current, done }) {
  return (
    <View style={cp.row}>
      {[0, 1, 2].map(i => (
        <View
          key={i}
          style={[
            cp.pill,
            i < done            && cp.pillDone,
            i === current && i >= done && cp.pillActive,
          ]}
        />
      ))}
    </View>
  );
}
const cp = StyleSheet.create({
  row:        { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  pill:       { width: 96, height: 10, borderRadius: 43, backgroundColor: 'rgba(255,255,255,0.22)' },
  pillActive: { backgroundColor: '#2D9BA2' },
  pillDone:   { backgroundColor: '#1A6068' },
});

// ── Shared header button styles — larger for accessibility ────────────────────
const hb = StyleSheet.create({
  closeBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center', alignItems: 'center',
  },
  closeText: { color: '#FFFFFF', fontSize: 22, fontWeight: '600', includeFontPadding: false, textAlign: 'center', lineHeight: 22 },
  helpBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#FFA940',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#FFA940', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.50, shadowRadius: 10, elevation: 8,
  },
  helpText: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', includeFontPadding: false, textAlign: 'center', lineHeight: 24 },
});

// ── Screen 0: Title ───────────────────────────────────────────────────────────
function TitleScreen({ onNext, onExit }) {
  return (
    <FadeIn>
      <View style={{ flex: 1, backgroundColor: '#1C4047' }}>
        <StatusBar barStyle="light-content" />

        <View style={ts.header}>
          <TouchableOpacity style={hb.closeBtn} onPress={onExit} accessibilityLabel="Exit exercise">
            <Text style={hb.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <Text style={ts.title} numberOfLines={1} adjustsFontSizeToFit>Breathing</Text>
          <Text style={ts.motivational}>Your voice starts with your breath.</Text>
          <View style={ts.bubbleWrap}>
            <Image
              source={require('../../../../assets/images/bubble2.png')}
              style={{ width: 200, height: 200 }}
              resizeMode="contain"
              accessible={false}
            />
          </View>
        </View>

        {/* Arrow button — must sit above the progress bar (bottom: 28 + 12h + 16 gap = 56) */}
        <TouchableOpacity style={ts.arrowBtn} onPress={onNext} activeOpacity={0.8}>
          <Text style={ts.arrowText}>→</Text>
        </TouchableOpacity>

        <SessionBar fill={0.14} />
      </View>
    </FadeIn>
  );
}

const ts = StyleSheet.create({
  header: {
    paddingTop: 52, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center',
  },
  title: {
    color: '#FFFFFF', fontSize: 56, fontWeight: '800',
    letterSpacing: 1.5, textAlign: 'center', marginBottom: 12,
  },
  motivational: {
    color: '#C3DECE', fontSize: 15, fontWeight: '400',
    letterSpacing: 0.4, textAlign: 'center', opacity: 0.85,
    marginBottom: 32,
  },
  bubbleWrap: { alignItems: 'center' },
  arrowBtn: {
    alignSelf: 'center', marginBottom: 60,
    width: 80, height: 64, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center', alignItems: 'center',
  },
  arrowText: { color: '#FFFFFF', fontSize: 26, fontWeight: '300' },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(ms) {
  if (!ms || isNaN(ms)) return '0:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Play / Pause SVG icons ────────────────────────────────────────────────────
function PlayIcon({ size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polygon points="5,3 19,12 5,21" fill="#FFFFFF" />
    </Svg>
  );
}
function PauseIcon({ size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="#FFFFFF" />
    </Svg>
  );
}
function Skip10Icon({ size = 20 }) {
  // forward arrow with "10" label
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 13a6 6 0 1 1-6-6h.5"
        stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round"
      />
      <Path
        d="M15 4l3.5 3L15 10"
        stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

// ── Screen 1: Video (instruction screen) ─────────────────────────────────────
function VideoScreen({ onNext, onExit }) {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying]   = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [hasEnded,   setHasEnded]   = useState(false);

  const scrubberWidthRef = useRef(1);
  // Ref keeps duration current inside PanResponder closures (avoids stale state capture)
  const durationMsRef = useRef(0);

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
    });
  }, []);

  function handleStatus(status) {
    if (!status.isLoaded) return;
    setIsPlaying(status.isPlaying ?? false);
    setPositionMs(status.positionMillis ?? 0);
    const dur = status.durationMillis ?? 0;
    durationMsRef.current = dur;
    setDurationMs(dur);
    if (status.didJustFinish) setHasEnded(true);
  }

  async function togglePlay() {
    if (!videoRef.current) return;
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      if (hasEnded) {
        await videoRef.current.setPositionAsync(0);
        setHasEnded(false);
      }
      await videoRef.current.playAsync();
    }
  }

  // Uses refs only — safe to capture inside PanResponder once
  async function seekTo(x) {
    if (!videoRef.current || !durationMsRef.current) return;
    const fraction = Math.max(0, Math.min(1, x / scrubberWidthRef.current));
    await videoRef.current.setPositionAsync(Math.floor(fraction * durationMsRef.current));
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: async (e) => {
        await videoRef.current?.pauseAsync();
        seekTo(e.nativeEvent.locationX);
      },
      onPanResponderMove:   (e) => { seekTo(e.nativeEvent.locationX); },
      onPanResponderRelease: async () => { await videoRef.current?.playAsync(); },
    })
  ).current;

  const progress = durationMs > 0 ? positionMs / durationMs : 0;
  const btnLabel = hasEnded ? 'Begin Exercise  →' : 'Skip  →';

  return (
    <FadeIn>
      <LinearGradient
        colors={['#1C3242', '#0D1E2B']}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={vs.header}>
        {/* Back — just an arrow, no text */}
        <TouchableOpacity style={vs.iconBtn} onPress={onExit} activeOpacity={0.8} accessibilityLabel="Go back">
          <Text style={vs.iconBtnText}>←</Text>
        </TouchableOpacity>

        <View style={vs.pill}>
          <Text style={vs.pillText}>INSTRUCTIONS</Text>
        </View>

        {/* Spacer to balance layout */}
        <View style={vs.iconBtn} />
      </View>

      {/* Title */}
      <Text style={vs.heading}>Diaphragmatic{'\n'}Breathing Technique</Text>

      {/* Video */}
      <View style={vs.videoBox}>
        <Video
          ref={videoRef}
          source={require('../../../../assets/videos/BreathingDemo.mp4')}
          style={StyleSheet.absoluteFillObject}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={false}
          isLooping={false}
          isMuted={false}
          onPlaybackStatusUpdate={handleStatus}
        />

        {/* Tap video to toggle play */}
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={togglePlay} activeOpacity={1} />

        {/* Centre play overlay — visible when paused */}
        {!isPlaying && (
          <View style={vs.playOverlay} pointerEvents="none">
            <View style={vs.playCircle}>
              <PlayIcon size={28} />
            </View>
          </View>
        )}
      </View>

      {/* Timeline only — no duplicate button row */}
      <View style={vs.controls}>
        <View style={vs.timeRow}>
          <Text style={vs.timeText}>{formatTime(positionMs)}</Text>
          <Text style={vs.timeText}>{formatTime(durationMs)}</Text>
        </View>
        <View
          style={vs.scrubberTrack}
          onLayout={e => { scrubberWidthRef.current = e.nativeEvent.layout.width; }}
          {...panResponder.panHandlers}
          hitSlop={{ top: 14, bottom: 14 }}
        >
          <View style={[vs.scrubberFill, { width: `${progress * 100}%` }]} />
          <View style={[vs.scrubberThumb, { left: `${progress * 100}%` }]} />
        </View>
      </View>

      {/* Single CTA button: "Skip →" until video ends, then "Begin Exercise →" */}
      <TouchableOpacity style={vs.startBtn} onPress={onNext} activeOpacity={0.85}>
        <Text style={vs.startText}>{btnLabel}</Text>
      </TouchableOpacity>
    </FadeIn>
  );
}

const vs = StyleSheet.create({
  header: {
    paddingTop: 52, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center',
    gap: 10,
  },
  // Icon-only back button (arrow, no text)
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnText: { color: '#FFFFFF', fontSize: 20, fontWeight: '300' },

  pill: {
    flex: 1,
    backgroundColor: '#FFA940', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 5,
    alignItems: 'center',
  },
  pillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },

  heading: {
    color: 'rgba(255,255,255,0.90)', fontSize: 20, fontWeight: '700',
    textAlign: 'center', letterSpacing: 0.4, lineHeight: 28,
    marginTop: 18, marginBottom: 14, paddingHorizontal: 24,
  },

  videoBox: {
    alignSelf: 'center',
    width: W - 40, height: H * 0.40, borderRadius: 24,
    backgroundColor: '#000', overflow: 'hidden',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  playCircle: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center', justifyContent: 'center',
    paddingLeft: 4,
  },

  // Timeline only — no duplicate button row
  controls: {
    marginTop: 18, paddingHorizontal: 24,
  },
  timeRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginBottom: 8,
  },
  timeText: {
    color: 'rgba(255,255,255,0.50)', fontSize: 12, fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  scrubberTrack: {
    height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    position: 'relative', justifyContent: 'center',
  },
  scrubberFill: {
    height: '100%', borderRadius: 2,
    backgroundColor: '#FE9C2D',
  },
  scrubberThumb: {
    position: 'absolute',
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#FE9C2D',
    top: -5, marginLeft: -7,
    shadowColor: '#FE9C2D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 4,
  },

  startBtn: {
    alignSelf: 'center', marginTop: 28,
    backgroundColor: '#FE9C2D', borderRadius: 14,
    paddingHorizontal: 40, paddingVertical: 16,
    shadowColor: '#FE9C2D', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },
  startText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', letterSpacing: 0.4 },
});

// ── Screen 2: Drill ───────────────────────────────────────────────────────────
//
// Auto-starts on mount. Phase label crossfades so text changes are seamless.
// Bubble expands on inhale, holds at full size, then contracts on exhale —
// no "flying away". No timer shown.

function DrillScreen({ onComplete, onExit, onShowVideo, onSkip }) {
  const [cycleIndex, setCycleIndex] = useState(0);
  const [doneCount,  setDoneCount]  = useState(0);

  const bubbleScale  = useRef(new Animated.Value(SCALE_SMALL)).current;
  const labelOpacity = useRef(new Animated.Value(0)).current;
  const [label, setLabel] = useState('');

  const taskRefs = useRef([]);

  function schedule(fn, delay) {
    const id = setTimeout(fn, delay);
    taskRefs.current.push(id);
    return id;
  }

  // Cross-fade the phase label: fade out → swap text → fade in
  function crossfade(newLabel) {
    Animated.timing(labelOpacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => {
      setLabel(newLabel);
      Animated.timing(labelOpacity, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    });
  }

  function runCycle(index) {
    setCycleIndex(index);

    // INHALE — bubble expands
    crossfade('Breathe in');
    bubbleScale.setValue(SCALE_SMALL);
    Animated.timing(bubbleScale, {
      toValue: SCALE_LARGE, duration: INHALE_MS, useNativeDriver: true,
    }).start();

    // HOLD — bubble stays large
    schedule(() => crossfade('Hold'), INHALE_MS);

    // EXHALE — bubble contracts (does not fly away)
    schedule(() => {
      crossfade('Breathe out');
      Animated.timing(bubbleScale, {
        toValue: SCALE_SMALL, duration: EXHALE_MS, useNativeDriver: true,
      }).start();
    }, INHALE_MS + HOLD_MS);

    // END OF CYCLE
    schedule(() => {
      setDoneCount(index + 1);
      if (index < TOTAL_CYCLES - 1) {
        runCycle(index + 1);
      } else {
        crossfade('Well done');
        schedule(onComplete, 1500);
      }
    }, INHALE_MS + HOLD_MS + EXHALE_MS + 350);
  }

  useEffect(() => {
    const t = setTimeout(() => runCycle(0), 500);
    return () => {
      clearTimeout(t);
      taskRefs.current.forEach(clearTimeout);
    };
  }, []);

  return (
    <FadeIn>
      <LinearGradient
        colors={BG_GRADIENT} locations={BG_LOCATIONS}
        start={BG_START} end={BG_END}
        style={StyleSheet.absoluteFillObject}
      />
      <StatusBar barStyle="light-content" />

      {/* Header: close (X) and help (?) */}
      <View style={ds.header}>
        <TouchableOpacity style={hb.closeBtn} onPress={onExit} accessibilityLabel="Exit exercise">
          <Text style={hb.closeText}>✕</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={hb.helpBtn} onPress={onShowVideo} accessibilityLabel="Show instructions">
          <Text style={hb.helpText}>?</Text>
        </TouchableOpacity>
      </View>

      {/* Phase label — above bubble, crossfades so text never snaps */}
      <Animated.Text
        style={[ds.phaseLabel, { opacity: labelOpacity }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Animated.Text>

      {/* Animated bubble */}
      <View style={ds.bubbleArea}>
        <Animated.View style={{ transform: [{ scale: bubbleScale }] }}>
          <Image
            source={require('../../../../assets/images/bubble2.png')}
            style={{ width: BUBBLE_BASE, height: BUBBLE_BASE }}
            resizeMode="contain"
            accessible={false}
          />
        </Animated.View>
      </View>

      {/* Can't do now — above the cycle progress pills */}
      <View style={ds.bottom}>
        <CantDoNow onSkip={onSkip} onEnd={onExit} style={{ marginBottom: 20 }} />
        <CyclePills current={cycleIndex} done={doneCount} />
      </View>
    </FadeIn>
  );
}

const ds = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 18,
  },
  phaseLabel: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    marginTop: 52,
    marginBottom: 0,
    paddingHorizontal: 24,
  },
  bubbleArea: {
    flex: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  bottom: {
    alignItems: 'center',
    paddingBottom: 44,
  },
});

// ── Root ──────────────────────────────────────────────────────────────────────

export default function BreathingExercise({ onComplete, onExit }) {
  const [step, setStep] = useState(STEP_TITLE);

  if (step === STEP_TITLE) {
    return (
      <TitleScreen
        onNext={() => setStep(STEP_VIDEO)}
        onExit={onExit}
      />
    );
  }
  if (step === STEP_VIDEO) {
    return (
      <VideoScreen
        onNext={() => setStep(STEP_DRILL)}
        onExit={() => setStep(STEP_TITLE)}
      />
    );
  }
  return (
    <DrillScreen
      onComplete={onComplete}
      onExit={onExit}
      onShowVideo={() => setStep(STEP_VIDEO)}
      onSkip={onComplete}
    />
  );
}
