/**
 * ProgressScreen — placeholder rewards & progress page.
 *
 * Shows the user's key stats and locked achievement badges.
 * Full leaderboard / detailed stats are planned for a future sprint.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchProgress, TOTAL_NODES } from '../services/progressService';

const { width: W } = Dimensions.get('window');
const SC = W / 402;

const ORANGE = '#FE9C2D';
const TEAL   = '#2D6974';
const MINT   = '#C3DECE';
const WHITE  = '#FFFFFF';
const BG     = '#1C4047';

// ── Flame icon ────────────────────────────────────────────────────────────────
function FlameIcon({ size = 22 }) {
  return (
    <Svg width={size} height={size * 1.1} viewBox="0 0 50 55" fill="none">
      <Path
        d="M28.9176 54.4372C38.1118 52.6667 50 46.3059 50 29.8594C50 14.895 38.6088 4.92817 30.4176 0.349191C28.5971 -0.668989 26.4706 0.668786 26.4706 2.691V7.8611C26.4706 11.9395 24.6882 19.3835 19.7353 22.4805C17.2059 24.0615 14.4706 21.6942 14.1647 18.8094L13.9118 16.4393C13.6176 13.6845 10.7 12.013 8.41176 13.693C4.29706 16.7051 0 21.994 0 29.8566C0 49.9685 15.5559 55 23.3324 55C23.7873 55 24.2618 54.9859 24.7559 54.9576C20.9147 54.6436 14.7059 52.3527 14.7059 44.9426C14.7059 39.1447 19.1029 35.2275 22.4441 33.3184C23.3441 32.8093 24.3941 33.474 24.3941 34.478V36.1467C24.3941 37.4194 24.9088 39.4134 26.1294 40.7766C27.5118 42.3208 29.5382 40.7031 29.7 38.6723C29.7529 38.0332 30.4235 37.6259 31 37.9483C32.8853 39.0089 35.2941 41.2715 35.2941 44.9426C35.2941 50.735 31.9735 53.3992 28.9176 54.4372Z"
        fill={ORANGE}
      />
    </Svg>
  );
}

// ── Lock icon ─────────────────────────────────────────────────────────────────
function LockIcon({ size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 11V7a5 5 0 0 1 10 0v4"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Path
        d="M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={2}
      />
    </Svg>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ value, label, accent = ORANGE }) {
  return (
    <View style={sc.card}>
      <Text style={[sc.value, { color: accent }]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}
const sc = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 18 * SC,
    backgroundColor: 'rgba(45,105,116,0.45)',
    borderRadius: 18 * SC,
    borderWidth: 1,
    borderColor: 'rgba(195,222,206,0.15)',
    gap: 4,
  },
  value: { fontSize: 32 * SC, fontWeight: '800', letterSpacing: 0.5 },
  label: { color: 'rgba(255,255,255,0.60)', fontSize: 12 * SC, fontWeight: '500', textAlign: 'center' },
});

// ── Progress ring ─────────────────────────────────────────────────────────────
function ProgressRing({ progress = 0, size = 140, strokeWidth = 10 }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(1, progress));
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Track */}
      <Circle
        cx={size / 2} cy={size / 2} r={r}
        stroke="rgba(195,222,206,0.15)"
        strokeWidth={strokeWidth}
        fill="none"
      />
      {/* Fill */}
      <Circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={ORANGE}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}

// ── Badge card ────────────────────────────────────────────────────────────────
const BADGES = [
  { label: 'First Breath',    desc: 'Complete breathing exercise',   unlocked: false },
  { label: 'Week Warrior',    desc: 'Maintain a 7-day streak',       unlocked: false },
  { label: 'Vocal Champion',  desc: 'Complete 10 sessions',          unlocked: false },
  { label: 'Dolphin Diver',   desc: 'Complete all Level 1 sessions', unlocked: false },
  { label: 'Consistency',     desc: 'Train for 30 consecutive days', unlocked: false },
  { label: 'Voice Master',    desc: 'Complete all 20 sessions',      unlocked: false },
];

function BadgeCard({ label, desc, unlocked }) {
  return (
    <View style={[badge.card, !unlocked && badge.locked]}>
      <View style={badge.iconWrap}>
        {unlocked
          ? <FlameIcon size={26} />
          : <LockIcon size={22} />}
      </View>
      <Text style={[badge.title, !unlocked && badge.dimText]}>{label}</Text>
      <Text style={badge.desc}>{desc}</Text>
    </View>
  );
}
const badge = StyleSheet.create({
  card: {
    width: (W - 56) / 2,
    alignItems: 'center',
    paddingVertical: 18 * SC,
    paddingHorizontal: 12 * SC,
    backgroundColor: 'rgba(45,105,116,0.40)',
    borderRadius: 18 * SC,
    borderWidth: 1,
    borderColor: 'rgba(195,222,206,0.18)',
    gap: 6,
  },
  locked: {
    backgroundColor: 'rgba(22,52,58,0.50)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  iconWrap: {
    width: 52 * SC, height: 52 * SC, borderRadius: 26 * SC,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  title: { color: WHITE, fontSize: 13 * SC, fontWeight: '700', textAlign: 'center' },
  dimText: { color: 'rgba(255,255,255,0.35)' },
  desc:  { color: 'rgba(255,255,255,0.45)', fontSize: 11 * SC, textAlign: 'center', lineHeight: 15 * SC },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ProgressScreen({ navigation }) {
  const { top: safeTop, bottom: safeBottom } = useSafeAreaInsets();
  const [prog, setProg] = useState({ current_node: 0, streak_days: 0, sessions_completed: 0 });

  useEffect(() => {
    fetchProgress().then(setProg).catch(() => {});
  }, []);

  const sessionsCompleted = prog.sessions_completed ?? 0;
  const ringProgress = sessionsCompleted / TOTAL_NODES;
  const level = Math.floor(sessionsCompleted / 7) + 1;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#37767A', '#1C4047', '#0A1618']}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: safeTop + 12 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Progress</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: safeBottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Overall ring ── */}
        <View style={styles.ringSection}>
          <View style={styles.ringWrap}>
            <ProgressRing progress={ringProgress} size={160 * SC} strokeWidth={12} />
            <View style={styles.ringCenter}>
              <Text style={styles.ringNum}>{sessionsCompleted}</Text>
              <Text style={styles.ringOf}>of {TOTAL_NODES}</Text>
            </View>
          </View>
          <Text style={styles.ringLabel}>sessions complete</Text>
          <View style={styles.levelTag}>
            <Text style={styles.levelTagText}>Level {level}</Text>
          </View>
        </View>

        {/* ── Stat row ── */}
        <View style={styles.statRow}>
          <StatCard value={prog.streak_days} label={'day' + '\nstreak'} accent={ORANGE} />
          <StatCard value={sessionsCompleted} label={'sessions' + '\ncomplete'} accent={MINT} />
          <StatCard value={level} label={'current' + '\nlevel'} accent={WHITE} />
        </View>

        {/* ── Badges ── */}
        <Text style={styles.sectionTitle}>Achievements</Text>
        <Text style={styles.sectionSub}>Complete sessions to unlock badges</Text>

        <View style={styles.badgeGrid}>
          {BADGES.map((b, i) => (
            <BadgeCard key={i} {...b} />
          ))}
        </View>

        {/* Coming soon note */}
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonText}>
            Leaderboards, detailed analytics and more achievements coming soon.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20 * SC,
    paddingBottom: 12,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  backText: { color: WHITE, fontSize: 22, fontWeight: '300' },
  headerTitle: {
    color: WHITE, fontSize: 20 * SC, fontWeight: '700', letterSpacing: 0.5,
  },

  content: {
    paddingHorizontal: 20 * SC,
    paddingTop: 8,
    gap: 20 * SC,
  },

  // ── Ring ──
  ringSection: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  ringNum: { color: WHITE, fontSize: 42 * SC, fontWeight: '800', lineHeight: 44 * SC },
  ringOf:  { color: 'rgba(255,255,255,0.50)', fontSize: 13 * SC, fontWeight: '500' },
  ringLabel: { color: 'rgba(255,255,255,0.60)', fontSize: 13 * SC, letterSpacing: 0.3 },
  levelTag: {
    paddingHorizontal: 16 * SC, paddingVertical: 5 * SC,
    backgroundColor: 'rgba(254,156,45,0.18)',
    borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(254,156,45,0.35)',
  },
  levelTagText: { color: ORANGE, fontSize: 13 * SC, fontWeight: '700', letterSpacing: 0.5 },

  // ── Stats ──
  statRow: { flexDirection: 'row', gap: 10 * SC },

  // ── Badges ──
  sectionTitle: { color: WHITE, fontSize: 18 * SC, fontWeight: '700', letterSpacing: 0.3 },
  sectionSub:   { color: 'rgba(255,255,255,0.45)', fontSize: 12 * SC, marginTop: -14 * SC },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14 * SC,
  },

  // ── Coming soon ──
  comingSoon: {
    paddingVertical: 20 * SC,
    alignItems: 'center',
  },
  comingSoonText: {
    color: 'rgba(255,255,255,0.30)',
    fontSize: 12 * SC,
    textAlign: 'center',
    lineHeight: 18 * SC,
    letterSpacing: 0.2,
  },
});
