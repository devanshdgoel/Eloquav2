import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Image,
  Animated,
} from 'react-native';
import TabBar from '../components/TabBar';
import Svg, {
  Path,
  Circle,
  G,
  Text as SvgText,
  Image as SvgImage,
  Defs,
  ClipPath,
  Filter,
  FeDropShadow,
  Line,
} from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchProgress, TOTAL_NODES } from '../services/progressService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logFunnelEvent, logScreenView } from '../utils/analytics';
import { useLargeText } from '../context/PrefsContext';

const { width: W } = Dimensions.get('window');

// ── Design tokens ─────────────────────────────────────────────────────────────
const COLORS = {
  bg:           '#1C4047',
  tabBg:        '#16343A',
  pathColor:    '#C3DECE',
  nodeBg:       '#C3DECE',   // background circle behind all nodes
  nodeActiveBg: '#2D6974',   // dolphin background
  orange:       '#FFA940',
  white:        '#FFFFFF',
  levelText:    'rgba(255,255,255,0.65)',
  levelLine:    'rgba(255,255,255,0.25)',
};

const LEVELS_EVERY = 7;

// ── Roadmap geometry ──────────────────────────────────────────────────────────
const NODE_V_GAP   = 130;
const CANVAS_PAD_T = 130;   // enough room for Level 1 label above node 0
const CANVAS_PAD_B = 120;
const CANVAS_H     = CANVAS_PAD_T + (TOTAL_NODES - 1) * NODE_V_GAP + CANVAS_PAD_B;
const SINE_AMP     = 82;
const SINE_FREQ    = 0.75;
const R_ACTIVE     = 54;
const R_OTHER      = 40;
const SCROLL_STEP  = NODE_V_GAP * 2;

const NODE_DEFS = Array.from({ length: TOTAL_NODES }, (_, i) => ({
  cx: W / 2 + SINE_AMP * Math.sin(i * SINE_FREQ),
  cy: CANVAS_PAD_T + i * NODE_V_GAP,
}));

// Smooth bezier path — vertical tangent control points give consistent S-curves
function buildRoadPath() {
  const t = 0.44; // tension: how steeply the curve leaves each node
  return NODE_DEFS.map((node, i) => {
    if (i === 0) return `M ${node.cx.toFixed(1)} ${node.cy}`;
    const prev = NODE_DEFS[i - 1];
    const dy   = node.cy - prev.cy;
    const cp1x = prev.cx.toFixed(1);
    const cp1y = (prev.cy + dy * t).toFixed(1);
    const cp2x = node.cx.toFixed(1);
    const cp2y = (node.cy - dy * t).toFixed(1);
    return `C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${node.cx.toFixed(1)} ${node.cy}`;
  }).join(' ');
}

const ROAD_PATH = buildRoadPath();

const LEVEL_MARKERS = [];
for (let start = LEVELS_EVERY; start < TOTAL_NODES; start += LEVELS_EVERY) {
  const prevY = NODE_DEFS[start - 1].cy;
  const nextY = NODE_DEFS[start].cy;
  LEVEL_MARKERS.push({ y: (prevY + nextY) / 2, label: `Level ${Math.floor(start / LEVELS_EVERY) + 1}` });
}

// ── Node opacity — dims done nodes as distance from active increases ──────────
// Future nodes stay fully opaque (circle) with partial content fade
function getDoneOpacity(i, activeNode) {
  return Math.max(0.30, 0.85 - (activeNode - i) * 0.10);
}

// ── Figma icons ───────────────────────────────────────────────────────────────
function MicAIIcon({ size = 40 }) {
  return (
    <Svg width={size} height={size * (148.507 / 147.207)} viewBox="0 0 147.207 148.507" fill="none">
      <Path
        d="M123.356 51.9418L125.017 48.1213C127.936 41.3627 133.283 35.9438 140.002 32.9338L145.125 30.6455C145.747 30.3596 146.273 29.9015 146.642 29.3254C147.011 28.7494 147.207 28.0796 147.207 27.3954C147.207 26.7113 147.011 26.0415 146.642 25.4654C146.273 24.8893 145.747 24.4312 145.125 24.1453L140.285 21.992C133.398 18.8964 127.959 13.277 125.091 6.29155L123.376 2.1673C123.126 1.52844 122.688 0.979959 122.121 0.593366C121.554 0.206774 120.884 0 120.197 0C119.511 0 118.841 0.206774 118.273 0.593366C117.706 0.979959 117.269 1.52844 117.018 2.1673L115.31 6.2848C112.445 13.2716 107.009 18.8933 100.123 21.992L95.2762 24.152C94.6566 24.4388 94.1319 24.8969 93.7642 25.4722C93.3965 26.0475 93.2011 26.716 93.2011 27.3988C93.2011 28.0816 93.3965 28.7501 93.7642 29.3254C94.1319 29.9007 94.6566 30.3588 95.2762 30.6455L100.406 32.927C107.124 35.94 112.468 41.3613 115.384 48.1213L117.045 51.9418C118.26 54.7363 122.134 54.7363 123.356 51.9418ZM82.3095 36.0455C84.159 38.9705 86.688 41.1328 89.8965 42.5323L93.7103 44.1995C96.2753 45.32 98.3543 46.8905 99.9473 48.911V81.0073C99.9473 89.9584 96.3915 98.5428 90.0621 104.872C83.7327 111.201 75.1483 114.757 66.1972 114.757C57.2462 114.757 48.6617 111.201 42.3324 104.872C36.003 98.5428 32.4473 89.9584 32.4473 81.0073V40.5073C32.4472 34.2424 34.191 28.1011 37.4833 22.771C40.7757 17.441 45.4866 13.1325 51.0887 10.3279C56.6908 7.52335 62.963 6.33344 69.203 6.89139C75.443 7.44933 81.4046 9.73311 86.4202 13.487C84.8002 14.702 83.4278 16.196 82.3028 17.969C80.5836 20.6684 79.6812 23.8071 79.704 27.0073C79.704 30.2743 80.568 33.287 82.3095 36.0455ZM0 94.2373L13.2435 91.5913C15.7031 103.825 22.3225 114.83 31.9768 122.737C41.6312 130.644 53.7252 134.964 66.204 134.964C78.6828 134.964 90.7768 130.644 100.431 122.737C110.086 114.83 116.705 103.825 119.165 91.5913L132.408 94.2373C126.252 125.186 98.955 148.507 66.204 148.507C33.453 148.507 6.156 125.186 0 94.244"
        fill={COLORS.pathColor}
      />
    </Svg>
  );
}

function FlameIcon({ size = 22 }) {
  return (
    <Svg width={size} height={size * (55 / 50)} viewBox="0 0 50 55" fill="none">
      <Path
        d="M28.9176 54.4372C38.1118 52.6667 50 46.3059 50 29.8594C50 14.895 38.6088 4.92817 30.4176 0.349191C28.5971 -0.668989 26.4706 0.668786 26.4706 2.691V7.8611C26.4706 11.9395 24.6882 19.3835 19.7353 22.4805C17.2059 24.0615 14.4706 21.6942 14.1647 18.8094L13.9118 16.4393C13.6176 13.6845 10.7 12.013 8.41176 13.693C4.29706 16.7051 0 21.994 0 29.8566C0 49.9685 15.5559 55 23.3324 55C23.7873 55 24.2618 54.9859 24.7559 54.9576C20.9147 54.6436 14.7059 52.3527 14.7059 44.9426C14.7059 39.1447 19.1029 35.2275 22.4441 33.3184C23.3441 32.8093 24.3941 33.474 24.3941 34.478V36.1467C24.3941 37.4194 24.9088 39.4134 26.1294 40.7766C27.5118 42.3208 29.5382 40.7031 29.7 38.6723C29.7529 38.0332 30.4235 37.6259 31 37.9483C32.8853 39.0089 35.2941 41.2715 35.2941 44.9426C35.2941 50.735 31.9735 53.3992 28.9176 54.4372Z"
        fill={COLORS.orange}
      />
    </Svg>
  );
}

function Chevron({ direction }) {
  // Larger chevron (32px) with heavier stroke for prominence
  const d = direction === 'up' ? 'M 4 22 L 16 10 L 28 22' : 'M 4 10 L 16 22 L 28 10';
  return (
    <Svg width={32} height={32} viewBox="0 0 32 32">
      <Path d={d} stroke={COLORS.orange} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }) {
  const { top: safeTop } = useSafeAreaInsets();
  const largeText = useLargeText();
  const fs = (base) => largeText ? Math.round(base * 1.25) : base;

  const [viewportH, setViewportH] = useState(0);
  const viewportHRef = useRef(0);
  const maxOffset = Math.max(0, CANVAS_H - viewportH);

  const offsetRef = useRef(0);
  const animY     = useRef(new Animated.Value(0)).current;

  const [canScrollUp,   setCanScrollUp]   = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(true);

  const [progress, setProgress] = useState({
    current_node:         0,
    streak_days:          0,
    sessions_completed:   0,
    last_checkin_session: 0,
  });
  const [progressError, setProgressError] = useState(false);

  const activeNode = Math.max(0, Math.min(progress.current_node, TOTAL_NODES - 1));

  function handleNodePress(i) {
    const { sessions_completed: done, last_checkin_session: lastCI } = progress;

    // Node 0 before any session has been completed → daily check-in then baseline session.
    if (i === 0 && done === 0) {
      navigation.navigate('DailyVoiceNote', {
        nextScreen: 'BaselineSession',
        nextParams: {},
      });
      return;
    }

    // Check-in nodes go directly — the check-in itself has enough voice recording.
    if (i > 0 && i % LEVELS_EVERY === 0 && i === activeNode && done > lastCI) {
      navigation.navigate('Checkin', { nodeIndex: i });
    } else {
      // Regular training session — gate through the daily voice note first.
      navigation.navigate('DailyVoiceNote', {
        nextScreen: 'VocalTrainingSession',
        nextParams: { nodeIndex: i },
      });
    }
  }

  const isFirstSession   = progress.sessions_completed === 0;
  const checkinDue       = progress.sessions_completed > 0
    && progress.sessions_completed % LEVELS_EVERY === 0
    && progress.sessions_completed > progress.last_checkin_session;

  const nodeIconUri = useMemo(
    () => Image.resolveAssetSource(require('../../assets/images/NodeIcon.png')).uri, []
  );
  const dolphinUri = useMemo(
    () => Image.resolveAssetSource(require('../../assets/images/Dolphin2.png')).uri, []
  );

  // Log the very first Home visit once per account (gate via AsyncStorage).
  useEffect(() => {
    AsyncStorage.getItem('eloqua_home_first_visit').then(v => {
      if (!v) {
        logFunnelEvent('home_first_visit');
        AsyncStorage.setItem('eloqua_home_first_visit', '1').catch(() => {});
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Screen-time tracking for drop-off analytics.
  useEffect(() => {
    const logExit = logScreenView('Home');
    return logExit;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll ────────────────────────────────────────────────────────────────
  function applyOffset(next) {
    const clamped = Math.max(0, Math.min(next, maxOffset));
    offsetRef.current = clamped;
    setCanScrollUp(clamped > 0);
    setCanScrollDown(clamped < maxOffset);
    Animated.spring(animY, { toValue: -clamped, useNativeDriver: true, tension: 55, friction: 9 }).start();
  }

  const scrollUp   = () => applyOffset(offsetRef.current - SCROLL_STEP);
  const scrollDown = () => applyOffset(offsetRef.current + SCROLL_STEP);

  useFocusEffect(
    useCallback(() => {
      setProgressError(false);
      fetchProgress()
        .then(data => {
          setProgress(data);
          const h      = viewportHRef.current;
          const maxOff = Math.max(0, CANVAS_H - h);
          const idx    = Math.max(0, Math.min(data.current_node, TOTAL_NODES - 1));
          const nodeY  = NODE_DEFS[idx].cy;
          const initial = Math.max(0, Math.min(nodeY - h / 3, maxOff));
          offsetRef.current = initial;
          animY.setValue(-initial);
          setCanScrollUp(initial > 0);
          setCanScrollDown(initial < maxOff);
        })
        .catch(() => setProgressError(true));
    }, []) // empty — fires once per focus; layout changes do not re-trigger
  );

  const onViewportLayout = useCallback(e => {
    const h = e.nativeEvent.layout.height;
    viewportHRef.current = h;
    setViewportH(h);
  }, []);

  // ── Level 1 label: always clear of node 0's active ring (R_ACTIVE) ─────────
  const lvl1LabelY = CANVAS_PAD_T - R_ACTIVE - 20;   // 130 - 54 - 20 = 56
  const lvl1LineY  = lvl1LabelY - 8;                  // 48

  return (
    <View style={[styles.root, { paddingTop: safeTop }]}>
      <StatusBar barStyle="light-content" />
      {/* App gradient — covers whole screen behind roadmap and cards */}
      <LinearGradient
        colors={['#37767A', '#1C4047', '#0A1618']}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      {/* "Set up your voice profile" prompt — shown before the first session is complete */}
      {isFirstSession && !checkinDue && (
        <TouchableOpacity
          style={styles.setupBanner}
          onPress={() => navigation.navigate('DailyVoiceNote', {
            nextScreen: 'BaselineSession',
            nextParams: {},
          })}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Set up your voice profile — tap to begin"
        >
          <View style={styles.setupBannerLeft}>
            <Text style={[styles.setupBannerEyebrow, { fontSize: fs(16) }]}>GET STARTED</Text>
            <Text style={[styles.setupBannerTitle, { fontSize: fs(20) }]}>Set Up Your Voice Profile</Text>
            <Text style={[styles.setupBannerSub, { fontSize: fs(16) }]}>
              Personalise your training plan and enable Smart Speech
            </Text>
          </View>
          <Text style={styles.setupBannerArrow}>›</Text>
        </TouchableOpacity>
      )}

      {/* Greeting — shown once the first session is done and no check-in is pending */}
      {!isFirstSession && !checkinDue && (
        <Text style={[styles.greeting, { fontSize: fs(17) }]}>Good to see you.</Text>
      )}

      {/* ── Check-in due banner — shown instead of greeting ─────────────── */}
      {checkinDue && (
        <TouchableOpacity
          style={styles.checkinBanner}
          onPress={() => navigation.navigate('Checkin', { nodeIndex: activeNode })}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Progress check-in is due — tap to begin"
        >
          <View style={styles.checkinBannerLeft}>
            <Text style={[styles.checkinBannerEyebrow, { fontSize: fs(16) }]}>TIME TO CHECK IN</Text>
            <Text style={[styles.checkinBannerTitle, { fontSize: fs(20) }]}>Progress Check-in</Text>
            <Text style={[styles.checkinBannerSub, { fontSize: fs(16) }]}>See how far your voice has come</Text>
          </View>
          <Text style={styles.checkinBannerArrow}>›</Text>
        </TouchableOpacity>
      )}

      {/* ── Smart Speech card — distinctively styled to stand out from the map ── */}
      <TouchableOpacity
        style={styles.speechCard}
        onPress={() => navigation.navigate('SpeechEnhancement')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Smart Speech — AI voice enhancement"
      >
        {/* Orange-tinted icon container with prominent border */}
        <View style={styles.speechIconWrap}>
          <MicAIIcon size={46} />
          {/* AI label pill — visually signals this is an AI feature */}
          <View style={styles.speechAiPill}>
            <Text style={styles.speechAiText}>AI</Text>
          </View>
        </View>
        <View style={styles.speechTextWrap}>
          <Text style={[styles.speechTitle, { fontSize: fs(20) }]}>Smart Speech</Text>
          <Text style={[styles.speechSub, { fontSize: fs(15) }]}>Real-time AI voice enhancement</Text>
        </View>
        {/* Orange arrow clearly signals tappability */}
        <View style={styles.speechChevron}>
          <Text style={styles.speechArrow}>›</Text>
        </View>
      </TouchableOpacity>

      {/* ── Progress load error banner ───────────────────────────────────── */}
      {progressError && (
        <TouchableOpacity
          style={styles.errorBanner}
          onPress={() => {
            setProgressError(false);
            fetchProgress()
              .then(data => {
                setProgress(data);
                setProgressError(false);
              })
              .catch(() => setProgressError(true));
          }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.errorBannerText}>Could not load progress — tap to retry</Text>
        </TouchableOpacity>
      )}

      {/* ── Roadmap viewport ──────────────────────────────────────────────── */}
      <View style={styles.viewport} onLayout={onViewportLayout}>

        {/* Animated canvas */}
        <Animated.View style={{ transform: [{ translateY: animY }] }}>
          <Svg width={W} height={CANVAS_H}>

            {/* Clip paths + drop-shadow filter for node icons */}
            <Defs>
              {NODE_DEFS.map((def, i) => {
                const r = i === activeNode ? R_ACTIVE : R_OTHER;
                return (
                  <ClipPath key={`cp_${i}`} id={`cp_${i}`}>
                    <Circle cx={def.cx} cy={def.cy} r={r} />
                  </ClipPath>
                );
              })}
              {/* Soft shadow applied to the node icon images */}
              <Filter id="nodeShadow" x="-15%" y="-15%" width="130%" height="130%">
                <FeDropShadow dx="0" dy="3" stdDeviation="5" floodColor="rgba(0,0,0,0.28)" />
              </Filter>
            </Defs>

            {/* Sine-wave path */}
            <Path
              d={ROAD_PATH}
              stroke={COLORS.pathColor}
              strokeWidth={20}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Level 1 label — above node 0 */}
            <G>
              <Line x1={28} y1={lvl1LineY} x2={W / 2 - 54} y2={lvl1LineY} stroke={COLORS.levelLine} strokeWidth={1} />
              <SvgText x={W / 2} y={lvl1LabelY} textAnchor="middle" fill={COLORS.levelText} fontSize={15} fontWeight="700" letterSpacing={1.5}>
                Level 1
              </SvgText>
              <Line x1={W / 2 + 54} y1={lvl1LineY} x2={W - 28} y2={lvl1LineY} stroke={COLORS.levelLine} strokeWidth={1} />
            </G>

            {/* Subsequent level transition markers */}
            {LEVEL_MARKERS.map(({ y, label }) => (
              <G key={label}>
                <Line x1={28} y1={y} x2={W / 2 - 54} y2={y} stroke={COLORS.levelLine} strokeWidth={1} />
                <SvgText x={W / 2} y={y + 6} textAnchor="middle" fill={COLORS.levelText} fontSize={15} fontWeight="700" letterSpacing={1.5}>
                  {label}
                </SvgText>
                <Line x1={W / 2 + 54} y1={y} x2={W - 28} y2={y} stroke={COLORS.levelLine} strokeWidth={1} />
              </G>
            ))}

            {/* Nodes */}
            {NODE_DEFS.map((def, i) => {
              const isDone    = i < activeNode;
              const isActive  = i === activeNode;
              const isFuture  = i > activeNode;
              const r         = isActive ? R_ACTIVE : R_OTHER;
              // Check-in milestone: every LEVELS_EVERY nodes (7, 14…) — gets orange accent
              const isCheckin = i > 0 && i % LEVELS_EVERY === 0;

              // Done nodes fade progressively with distance — future nodes stay opaque
              const groupOpacity = isDone ? getDoneOpacity(i, activeNode) : 1.0;
              // Future node content (bubble + number) is slightly dimmed; circle stays opaque
              const futureContentOpacity = 0.72;

              return (
                <G
                  key={i}
                  opacity={groupOpacity}
                  onPress={
                    isActive || isDone
                      ? () => handleNodePress(i)
                      : undefined
                  }
                >
                  {/* Base circle — checkin nodes get a warm orange-tinted fill when undone */}
                  <Circle
                    cx={def.cx}
                    cy={def.cy}
                    r={r}
                    fill={
                      isActive              ? COLORS.nodeActiveBg
                      : isCheckin && !isDone ? 'rgba(255,169,64,0.16)'
                      : COLORS.nodeBg
                    }
                  />

                  {/* Dashed orange accent ring — future/active checkin nodes only */}
                  {isCheckin && !isDone && (
                    <Circle
                      cx={def.cx} cy={def.cy}
                      r={r + 4}
                      fill="none"
                      stroke="rgba(255,169,64,0.60)"
                      strokeWidth={2.5}
                      strokeDasharray="5,3"
                    />
                  )}

                  {/* Node icon — all non-active nodes with drop shadow.
                      Viewport is 2.2× diameter so the image fills the circle snugly
                      (NodeIcon has some transparent padding). */}
                  {!isActive && (
                    <G opacity={isFuture ? futureContentOpacity : 1}>
                      <SvgImage
                        href={nodeIconUri}
                        x={def.cx - r * 1.1}
                        y={def.cy - r * 1.1}
                        width={r * 2.2}
                        height={r * 2.2}
                        clipPath={`url(#cp_${i})`}
                        preserveAspectRatio="xMidYMid meet"
                        filter="url(#nodeShadow)"
                      />
                    </G>
                  )}

                  {/* Dolphin — active node */}
                  {isActive && (
                    <SvgImage
                      href={dolphinUri}
                      x={def.cx - r * 0.88}
                      y={def.cy - r * 0.88}
                      width={r * 1.76}
                      height={r * 1.76}
                      clipPath={`url(#cp_${i})`}
                      preserveAspectRatio="xMidYMid meet"
                    />
                  )}

                  {/* Orange ring — active node */}
                  {isActive && (
                    <Circle cx={def.cx} cy={def.cy} r={r + 8} fill="none" stroke={COLORS.orange} strokeWidth={4.5} />
                  )}

                  {/* Checkmark — done nodes. Dark teal contrasts against the light NodeIcon. */}
                  {isDone && (
                    <Path
                      d={`M ${def.cx - 13} ${def.cy} L ${def.cx - 4} ${def.cy + 10} L ${def.cx + 13} ${def.cy - 10}`}
                      stroke="#1C4047"
                      strokeWidth={4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  )}

                  {/* Star icon — future checkin nodes (replaces the session number) */}
                  {isFuture && isCheckin && (
                    <SvgText
                      x={def.cx}
                      y={def.cy + 8}
                      textAnchor="middle"
                      fill={COLORS.orange}
                      fillOpacity={0.90}
                      fontSize={22}
                      fontWeight="700"
                    >
                      {'★'}
                    </SvgText>
                  )}

                  {/* Session number — dark teal text contrasts well against the light NodeIcon */}
                  {isFuture && !isCheckin && (
                    <SvgText
                      x={def.cx}
                      y={def.cy + 6}
                      textAnchor="middle"
                      fill="#1C4047"
                      fillOpacity={1}
                      fontSize={17}
                      fontWeight="800"
                    >
                      {i + 1}
                    </SvgText>
                  )}
                </G>
              );
            })}
          </Svg>
        </Animated.View>

        {/* ── Streak pill — floats above the top gradient fade ─────────── */}
        <View style={styles.streakPill} pointerEvents="none">
          <FlameIcon size={26} />
          <Text style={[styles.streakNum, { fontSize: fs(24) }]}>{progress.streak_days}</Text>
          <Text style={[styles.streakLabel, { fontSize: fs(17) }]}>
            {progress.streak_days === 1 ? 'day' : 'days'}
          </Text>
        </View>

        {/* ── Scroll arrows — live inside gradient fade edges ───────────── */}
        {canScrollUp && (
          <View style={styles.fadeTop} pointerEvents="box-none">
            <LinearGradient
              colors={[COLORS.bg, 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
            <TouchableOpacity
              style={styles.arrowBtn}
              onPress={scrollUp}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Show earlier sessions"
            >
              <Chevron direction="up" />
            </TouchableOpacity>
          </View>
        )}

        {canScrollDown && (
          <View style={styles.fadeBottom} pointerEvents="box-none">
            <LinearGradient
              colors={['transparent', COLORS.bg]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
            <TouchableOpacity
              style={styles.arrowBtn}
              onPress={scrollDown}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Show later sessions"
            >
              <Chevron direction="down" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Persistent tab bar ────────────────────────────────────────────── */}
      <TabBar navigation={navigation} activeTab="home" />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    // Gradient via LinearGradient absoluteFillObject — flat fallback matches gradient dark end
    backgroundColor: '#0A1618',
  },

  // ── Progress error banner ─────────────────────────────────────────────────
  errorBanner: {
    backgroundColor: 'rgba(254,156,45,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(254,156,45,0.35)',
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignItems: 'center',
  },
  errorBannerText: {
    color: '#FFA940',
    fontSize: 16,
    fontWeight: '600',
  },

  // ── Voice profile setup banner — shown before the first session ──────────
  setupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(195,222,206,0.10)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(195,222,206,0.35)',
  },
  setupBannerLeft: { flex: 1 },
  setupBannerEyebrow: {
    color: COLORS.pathColor,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  setupBannerTitle: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
    marginBottom: 3,
  },
  setupBannerSub: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 22,
  },
  setupBannerArrow: {
    color: COLORS.pathColor,
    fontSize: 30,
    fontWeight: '300',
    paddingLeft: 12,
  },

  // ── Check-in due banner ───────────────────────────────────────────────────
  checkinBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(255,169,64,0.15)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,169,64,0.50)',
  },
  checkinBannerLeft: { flex: 1 },
  checkinBannerEyebrow: {
    color: COLORS.orange,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  checkinBannerTitle: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
    marginBottom: 3,
  },
  checkinBannerSub: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 22,
  },
  checkinBannerArrow: {
    color: COLORS.orange,
    fontSize: 30,
    fontWeight: '300',
    paddingLeft: 12,
  },

  // ── Greeting ──────────────────────────────────────────────────────────────
  greeting: {
    color: 'rgba(195,222,206,0.75)',
    fontSize: 17,
    fontWeight: '500',
    letterSpacing: 0.2,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 6,
  },

  // ── Smart Speech floating card — distinctively styled ────────────────────
  // Orange border + shadow make this visually pop above the roadmap cards.
  speechCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#152C30',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,169,64,0.55)',
    shadowColor: '#FFA940',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.30,
    shadowRadius: 18,
    elevation: 14,
    gap: 14,
  },
  // Orange-tinted icon background with AI badge
  speechIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(255,169,64,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,169,64,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Small "AI" badge in corner of icon
  speechAiPill: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: COLORS.orange,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  speechAiText: {
    color: '#1A1A1A',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  speechTextWrap: {
    flex: 1,
  },
  speechTitle: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
    marginBottom: 3,
  },
  speechSub: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: 0.1,
  },
  // Right-side chevron container
  speechChevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,169,64,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speechArrow: {
    color: COLORS.orange,
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 28,
    marginLeft: 2,
  },

  // ── Viewport ──────────────────────────────────────────────────────────────
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },

  // ── Streak pill — z-index above gradient bars ─────────────────────────────
  streakPill: {
    position: 'absolute',
    top: 14,
    right: 16,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(13,28,30,0.90)',
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: 'rgba(254,156,45,0.50)',
  },
  streakNum: {
    color: COLORS.orange,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  streakLabel: {
    color: 'rgba(255,255,255,0.80)',
    fontSize: 17,
    fontWeight: '600',
  },

  // ── Fade edge + arrow ─────────────────────────────────────────────────────
  fadeTop: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 88,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 14,
    zIndex: 20,
  },
  fadeBottom: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 88,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 14,
    zIndex: 20,
  },
  // Larger, orange-bordered arrows — clearly tappable and on-brand
  arrowBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(10,22,24,0.85)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,169,64,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFA940',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
});
