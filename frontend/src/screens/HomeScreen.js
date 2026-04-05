import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  ScrollView,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, G, Text as SvgText } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { fetchProgress, TOTAL_NODES } from '../services/progressService';

const { width: W, height: H } = Dimensions.get('window');

const COLORS = {
  gradStart:    '#E0ECDE',
  gradEnd:      '#68B39F',
  cardBg:       '#2D6974',  // dark teal — Smart Speech card and tab logo
  nodeDone:     '#3D7B85',  // solid teal for completed nodes
  nodeUpcoming: 'rgba(61,123,133,0.4)', // semi-transparent for future nodes
  orange:       '#FE9C2D',  // active node ring and streak counter
  streakBg:     '#B6D8C8',
  pathColor:    '#3A3A5C',  // dark road connecting nodes
  tabBg:        '#68B39F',
  white:        '#FFFFFF',
};

// ── Roadmap geometry ─────────────────────────────────────────────────────────
//
// The roadmap is drawn on a tall canvas that the user scrolls through.
// Node positions follow a sine wave so the path curves left and right
// as it moves downward, with node 0 at the top (first session) and
// node TOTAL_NODES-1 at the bottom (final session).

const NODE_V_GAP   = 110;  // vertical distance between node centres (px)
const CANVAS_PAD_T = 70;   // padding above the first node
const CANVAS_PAD_B = 100;  // padding below the last node
const CANVAS_H     = CANVAS_PAD_T + (TOTAL_NODES - 1) * NODE_V_GAP + CANVAS_PAD_B;
const SINE_AMP     = 90;   // horizontal amplitude of the sine wave (px)
const SINE_FREQ    = 0.75; // angular frequency — controls how tightly the path curves

// Pre-compute the centre (cx, cy) for every node.
const NODE_DEFS = Array.from({ length: TOTAL_NODES }, (_, i) => ({
  cx: W / 2 + SINE_AMP * Math.sin(i * SINE_FREQ),
  cy: CANVAS_PAD_T + i * NODE_V_GAP,
}));

/**
 * Build a smooth SVG path that passes through every node.
 *
 * Each segment is a cubic bezier where both control points sit at the
 * vertical midpoint between the two nodes, directly above/below each
 * node's cx. This gives a vertical tangent at every node, producing a
 * continuous S-curve as the sine wave alternates left and right.
 */
function buildRoadPath() {
  return NODE_DEFS.map((node, i) => {
    if (i === 0) return `M ${node.cx.toFixed(1)} ${node.cy}`;
    const prev = NODE_DEFS[i - 1];
    const midY = ((prev.cy + node.cy) / 2).toFixed(1);
    return (
      `C ${prev.cx.toFixed(1)} ${midY} ` +
      `${node.cx.toFixed(1)} ${midY} ` +
      `${node.cx.toFixed(1)} ${node.cy}`
    );
  }).join(' ');
}

const ROAD_PATH = buildRoadPath();

// Node radii
const R_ACTIVE = 34;
const R_OTHER  = 26;

// ── Fixed-element layout constants ───────────────────────────────────────────
const CARD_TOP   = 48;               // top of the Smart Speech card (below status bar)
const CARD_H     = 158;              // height of the Smart Speech card
const BAR_H      = 72;               // height of the bottom tab bar
const SCROLL_TOP = CARD_TOP + CARD_H + 12; // top of the scrollable roadmap area


// ── Component ─────────────────────────────────────────────────────────────────

export default function HomeScreen({ navigation }) {
  const { signOut } = useAuth();
  const scrollRef   = useRef(null);

  const [progress, setProgress] = useState({
    current_node:       0,
    streak_days:        0,
    sessions_completed: 0,
  });

  // Re-fetch progress every time the screen comes into focus (e.g. after
  // returning from a training session). Scroll so the active node sits
  // roughly one-third down the visible area.
  useFocusEffect(
    useCallback(() => {
      fetchProgress()
        .then(data => {
          setProgress(data);

          // Clamp to a valid index in case of stale Firestore data.
          const nodeIndex = Math.max(0, Math.min(data.current_node, TOTAL_NODES - 1));
          const nodeY     = NODE_DEFS[nodeIndex].cy;
          const visibleH  = H - SCROLL_TOP - BAR_H;
          const offset    = Math.max(0, nodeY - visibleH / 3);

          // Small delay ensures the ScrollView has been laid out before scrolling.
          setTimeout(() => {
            scrollRef.current?.scrollTo({ y: offset, animated: false });
          }, 80);
        })
        .catch(() => {
          // Fail silently — default state keeps the UI functional.
        });
    }, [])
  );

  async function handleSignOut() {
    await signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
  }

  function handleSettingsPress() {
    Alert.alert(
      'Settings',
      null,
      [
        {
          text: 'Setup Voice',
          onPress: () => navigation.navigate('SetupVoice'),
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: handleSignOut,
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  // Clamp current_node to a valid array index for rendering.
  const activeNode = Math.max(0, Math.min(progress.current_node, TOTAL_NODES - 1));

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      {/* Full-screen gradient background */}
      <LinearGradient
        colors={[COLORS.gradStart, COLORS.gradEnd]}
        start={{ x: 0.07, y: 0 }}
        end={{ x: 0.93, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ── Smart Speech card (fixed, above scroll area) ──────────────── */}
      <TouchableOpacity
        style={styles.speechCard}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('SpeechEnhancement')}
        accessibilityRole="button"
        accessibilityLabel="Smart Speech: tap for immediate speech support"
      >
        <View style={styles.speechIconBox}>
          <Text style={styles.speechIconEmoji}>🎙️</Text>
          <Text style={styles.speechSparkle}>✨</Text>
        </View>
        <View style={styles.speechInfo}>
          <Text style={styles.speechTitle}>Smart Speech</Text>
          <Text style={styles.speechSub}>
            Tap here for immediate{'\n'}speech support
          </Text>
        </View>
      </TouchableOpacity>

      {/* ── Streak badge (fixed, floats over the scroll area) ─────────── */}
      <View style={styles.streakBadge}>
        <Text style={styles.streakText}>
          {/* Flame emoji is intentional UI branding, not decorative code. */}
          🔥 {progress.streak_days} {progress.streak_days === 1 ? 'DAY' : 'DAYS'}
        </Text>
      </View>

      {/* ── Scrollable roadmap ─────────────────────────────────────────── */}
      <ScrollView
        ref={scrollRef}
        style={styles.scrollArea}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
      >
        <Svg width={W} height={CANVAS_H}>

          {/* Road path connecting all nodes */}
          <Path
            d={ROAD_PATH}
            stroke={COLORS.pathColor}
            strokeWidth={28}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {NODE_DEFS.map((def, i) => {
            const isDone   = i < activeNode;
            const isActive = i === activeNode;
            const r        = isActive ? R_ACTIVE : R_OTHER;

            return (
              <G
                key={i}
                onPress={isActive
                  ? () => navigation.navigate('VocalTrainingSession', { nodeIndex: i })
                  : undefined
                }
              >
                {/* Node fill colour varies by completion state */}
                <Circle
                  cx={def.cx}
                  cy={def.cy}
                  r={r}
                  fill={
                    isDone   ? COLORS.nodeDone :
                    isActive ? COLORS.white :
                               COLORS.nodeUpcoming
                  }
                />

                {/* Orange ring highlights the user's current position */}
                {isActive && (
                  <Circle
                    cx={def.cx}
                    cy={def.cy}
                    r={r}
                    fill="none"
                    stroke={COLORS.orange}
                    strokeWidth={5}
                  />
                )}

                {/* Checkmark for completed nodes */}
                {isDone && (
                  <Path
                    d={`M ${def.cx - 10} ${def.cy} L ${def.cx - 3} ${def.cy + 8} L ${def.cx + 10} ${def.cy - 8}`}
                    stroke={COLORS.white}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                )}

                {/* Session number shown on active and upcoming nodes */}
                {!isDone && (
                  <SvgText
                    x={def.cx}
                    y={def.cy + 5}
                    textAnchor="middle"
                    fill={isActive ? COLORS.pathColor : COLORS.white}
                    fontSize={isActive ? 16 : 13}
                    fontWeight="700"
                  >
                    {i + 1}
                  </SvgText>
                )}
              </G>
            );
          })}
        </Svg>
      </ScrollView>

      {/* ── Bottom tab bar (fixed) ─────────────────────────────────────── */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabBtn}
          onPress={handleSettingsPress}
          accessibilityLabel="Settings and sign out"
        >
          <Text style={styles.tabIcon}>⚙️</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabLogo} accessibilityLabel="Home">
          <Text style={styles.tabLogoText}>{'〜〜'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabBtn} accessibilityLabel="Achievements">
          <Text style={styles.tabIcon}>🏆</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  speechCard: {
    position: 'absolute',
    top: CARD_TOP,
    left: 11,
    right: 11,
    height: CARD_H,
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 10,
  },
  speechIconBox: {
    width: 76,
    height: 76,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  speechIconEmoji: { fontSize: 46 },
  speechSparkle: {
    position: 'absolute',
    top: 0,
    right: 0,
    fontSize: 18,
  },
  speechInfo: { flex: 1 },
  speechTitle: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  speechSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    letterSpacing: 0.6,
    lineHeight: 22,
  },

  streakBadge: {
    position: 'absolute',
    top: CARD_TOP + CARD_H + 18,
    right: 22,
    backgroundColor: COLORS.streakBg,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
    zIndex: 10,
  },
  streakText: {
    color: COLORS.orange,
    fontWeight: '700',
    fontSize: 18,
    letterSpacing: 1.2,
  },

  scrollArea: {
    position: 'absolute',
    top: SCROLL_TOP,
    left: 0,
    right: 0,
    bottom: BAR_H,
  },

  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: BAR_H,
    backgroundColor: COLORS.tabBg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 6,
  },
  tabBtn: {
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: { fontSize: 30 },
  tabLogo: {
    backgroundColor: COLORS.cardBg,
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  tabLogoText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -1,
  },
});
