/**
 * ProgressScreen — voice score trends, milestones, streak stats.
 *
 * Data sources:
 *   fetchProgress()          → sessions_completed, streak_days, current_node
 *   GET /api/progress-data   → baseline scores, check-ins (sparkline), recent sessions
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Polyline } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { API_BASE_URL } from '../config/env';
import { fetchProgress, TOTAL_NODES } from '../services/progressService';
import { fetchWithAuth } from '../utils/authHeaders';
import { logScreenView } from '../utils/analytics';

const { width: W } = Dimensions.get('window');
const SC = W / 402;

const ORANGE = '#FFA940';
const TEAL   = '#2D6974';
const MINT   = '#C3DECE';
const WHITE  = '#FFFFFF';
const DIM    = 'rgba(255,255,255,0.60)';

// ── Milestone definitions ─────────────────────────────────────────────────────
const MILESTONES = [
  {
    id: 'first_voice',
    label: 'First Voice',
    desc: 'Completed your baseline assessment',
    icon: '🎤',
    check: ({ hasBaseline }) => hasBaseline,
  },
  {
    id: 'week_warrior',
    label: 'Week Warrior',
    desc: 'Maintained a 7-day streak',
    icon: '🔥',
    check: ({ streak }) => streak >= 7,
  },
  {
    id: 'committed',
    label: 'Committed',
    desc: 'Completed 10 sessions',
    icon: '⚡',
    check: ({ sessions }) => sessions >= 10,
  },
  {
    id: 'voice_growing',
    label: 'Voice Growing',
    desc: 'Improved a score vs your baseline',
    icon: '📈',
    check: ({ baseline, latest }) => {
      if (!baseline || !latest) return false;
      return ['voice_power', 'expression', 'fluency'].some(k =>
        latest[k] != null && baseline[k] != null && latest[k] > baseline[k] + 5
      );
    },
  },
  {
    id: 'loud_proud',
    label: 'Loud & Proud',
    desc: 'Voice Power score above 70',
    icon: '📢',
    check: ({ latest }) => (latest?.voice_power ?? 0) >= 70,
  },
  {
    id: 'expressive',
    label: 'Expressive',
    desc: 'Expression score above 70',
    icon: '🎵',
    check: ({ latest }) => (latest?.expression ?? 0) >= 70,
  },
  {
    id: 'fluent',
    label: 'Fluent Speaker',
    desc: 'Fluency score above 70',
    icon: '🗣️',
    check: ({ latest }) => (latest?.fluency ?? 0) >= 70,
  },
  {
    id: 'checkin_champ',
    label: 'Check-in Champ',
    desc: 'Completed 3 progress check-ins',
    icon: '🏆',
    check: ({ checkInCount }) => checkInCount >= 3,
  },
  {
    id: 'journey_complete',
    label: 'Journey Complete',
    desc: 'All 20 sessions finished',
    icon: '🌟',
    check: ({ sessions }) => sessions >= TOTAL_NODES,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function avg(arr) {
  const v = arr.filter(x => x != null && Number.isFinite(x));
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

function buildSparkPoints(baseline, checkIns, recentSessions, key) {
  const pts = [];
  if (baseline?.composite?.[key] != null) pts.push(baseline.composite[key]);
  for (const ci of checkIns) {
    if (ci.composite?.[key] != null) pts.push(ci.composite[key]);
  }
  if (pts.length < 2) {
    for (const s of recentSessions.slice(0, 5).reverse()) {
      if (s.scores?.[key] != null) pts.push(s.scores[key]);
    }
  }
  return pts;
}

function scoreDelta(points) {
  if (points.length < 2) return null;
  return points[points.length - 1] - points[0];
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ points, color }) {
  const W2 = 100, H2 = 38;
  if (points.length < 2) return <View style={{ width: W2, height: H2 }} />;

  const mn = Math.max(0,  Math.min(...points) - 8);
  const mx = Math.min(100, Math.max(...points) + 8);
  const rng = mx - mn || 1;

  const pts = points.map((v, i) => {
    const x = (i / (points.length - 1)) * W2;
    const y = H2 - ((v - mn) / rng) * H2;
    return `${x},${y}`;
  }).join(' ');

  const last = pts.split(' ').pop().split(',');

  return (
    <Svg width={W2} height={H2}>
      <Polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.8}
      />
      <Circle cx={parseFloat(last[0])} cy={parseFloat(last[1])} r={3.5} fill={color} />
    </Svg>
  );
}

// ── Progress ring ─────────────────────────────────────────────────────────────
function ProgressRing({ progress = 0, size = 140, sw = 11 }) {
  const r    = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(195,222,206,0.12)" strokeWidth={sw} fill="none" />
      <Circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={ORANGE} strokeWidth={sw} fill="none"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - Math.min(1, progress))}
        strokeLinecap="round"
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}

// ── Voice score card ──────────────────────────────────────────────────────────
function ScoreCard({ label, currentScore, points, color, baselineScore }) {
  const delta = scoreDelta(points);
  const hasData = currentScore != null;

  return (
    <View style={sc.card}>
      <View style={sc.top}>
        <View>
          <Text style={sc.label}>{label}</Text>
          {hasData ? (
            <Text style={[sc.score, { color }]}>{currentScore}</Text>
          ) : (
            <Text style={sc.noData}>—</Text>
          )}
        </View>
        <Sparkline points={points} color={color} />
      </View>

      {hasData && delta != null && (
        <View style={sc.deltaRow}>
          <Text style={[sc.delta, { color: delta >= 0 ? '#6BCB77' : '#FF6B6B' }]}>
            {delta >= 0 ? `+${delta}` : delta}
          </Text>
          <Text style={sc.deltaLabel}> since baseline</Text>
        </View>
      )}
      {hasData && delta == null && baselineScore != null && (
        <Text style={sc.deltaLabel}>Baseline: {baselineScore}</Text>
      )}
      {!hasData && (
        <Text style={sc.deltaLabel}>Complete your assessment to unlock</Text>
      )}
    </View>
  );
}
const sc = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: 'rgba(45,105,116,0.38)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(195,222,206,0.18)',
    padding: 16 * SC,
    gap: 8 * SC,
  },
  top:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label:   { color: DIM, fontSize: 16, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  score:   { fontSize: 34, fontWeight: '800', lineHeight: 38 },
  noData:  { fontSize: 32, fontWeight: '300', color: 'rgba(255,255,255,0.25)' },
  deltaRow:{ flexDirection: 'row', alignItems: 'baseline' },
  delta:   { fontSize: 16, fontWeight: '700' },
  deltaLabel: { fontSize: 16, color: DIM, fontWeight: '500' },
});

// ── Milestone badge ───────────────────────────────────────────────────────────
function MilestoneBadge({ label, desc, icon, unlocked }) {
  return (
    <View
      style={[mb.card, !unlocked && mb.locked]}
      accessible={true}
      accessibilityRole="image"
      accessibilityLabel={`${label}: ${desc}. ${unlocked ? 'Unlocked' : 'Locked'}`}
    >
      <View style={[mb.iconWrap, unlocked && mb.iconWrapUnlocked]}>
        <Text style={{ fontSize: unlocked ? 26 : 22, opacity: unlocked ? 1 : 0.35 }}>{icon}</Text>
      </View>
      <Text style={[mb.title, !unlocked && mb.dim]}>{label}</Text>
      <Text style={mb.desc}>{desc}</Text>
    </View>
  );
}
const mb = StyleSheet.create({
  card: {
    width: (W - 56 * SC) / 2,
    alignItems: 'center',
    paddingVertical: 18 * SC,
    paddingHorizontal: 12 * SC,
    backgroundColor: 'rgba(45,105,116,0.38)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(195,222,206,0.18)',
    gap: 6,
  },
  locked: {
    backgroundColor: 'rgba(20,45,50,0.55)',
    borderColor: 'rgba(255,255,255,0.07)',
  },
  iconWrap: {
    width: 52 * SC, height: 52 * SC, borderRadius: 26 * SC,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  iconWrapUnlocked: { backgroundColor: 'rgba(254,156,45,0.15)' },
  title:   { color: WHITE, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  dim:     { color: 'rgba(255,255,255,0.50)' },
  desc:    { color: 'rgba(255,255,255,0.60)', fontSize: 16, textAlign: 'center', lineHeight: 22 },
});

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ value, label, accent }) {
  return (
    <View style={stat.card}>
      <Text style={[stat.value, { color: accent }]}>{value}</Text>
      <Text style={stat.label}>{label}</Text>
    </View>
  );
}
const stat = StyleSheet.create({
  card: {
    flex: 1, alignItems: 'center', paddingVertical: 18 * SC,
    backgroundColor: 'rgba(45,105,116,0.38)',
    borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(195,222,206,0.18)', gap: 4,
  },
  value: { fontSize: 30, fontWeight: '800', letterSpacing: 0.5 },
  label: { color: DIM, fontSize: 16, fontWeight: '500', textAlign: 'center' },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ProgressScreen({ navigation }) {
  const { top, bottom } = useSafeAreaInsets();

  const [prog,     setProg]     = useState({ current_node: 0, streak_days: 0, sessions_completed: 0 });
  const [pdata,    setPdata]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [p, pd] = await Promise.all([
        fetchProgress(),
        fetchWithAuth(`${API_BASE_URL}/api/progress-data`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null),
      ]);
      setProg(p);
      setPdata(pd?.data ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  useEffect(() => {
    const logExit = logScreenView('Progress');
    return logExit;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sessions      = prog.sessions_completed ?? 0;
  const streak        = prog.streak_days        ?? 0;
  const ringProgress  = sessions / TOTAL_NODES;
  const level         = Math.floor(sessions / 7) + 1;

  const baseline      = pdata?.baseline;
  const checkIns      = pdata?.check_ins      ?? [];
  const recentSess    = pdata?.recent_sessions ?? [];
  const hasBaseline   = pdata?.has_baseline   ?? false;

  // Latest composite: most recent check-in, or baseline itself
  const latestComp = checkIns.length
    ? checkIns[checkIns.length - 1]?.composite
    : baseline?.composite;

  // Sparkline data per metric
  const vpPoints = buildSparkPoints(baseline, checkIns, recentSess, 'voice_power');
  const exPoints = buildSparkPoints(baseline, checkIns, recentSess, 'expression');
  const flPoints = buildSparkPoints(baseline, checkIns, recentSess, 'fluency');

  // Latest single scores for display
  const vpScore = latestComp?.voice_power ?? (recentSess[0]?.scores?.voice_power ?? null);
  const exScore = latestComp?.expression  ?? (recentSess[0]?.scores?.expression  ?? null);
  const flScore = latestComp?.fluency     ?? (recentSess[0]?.scores?.fluency     ?? null);

  // Milestone context
  const mCtx = {
    hasBaseline,
    streak,
    sessions,
    checkInCount: checkIns.length,
    baseline:     baseline?.composite,
    latest:       latestComp,
  };

  // Check-in countdown
  const nextCheckin   = sessions > 0 ? (Math.floor(sessions / 7) + 1) * 7 : 7;
  const sessToCheckin = Math.max(0, nextCheckin - sessions);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#37767A', '#1C4047', '#0A1618']}
        start={{ x: 0.3, y: 0 }} end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}
          accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Progress</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 }}>
          <Text style={{ color: 'rgba(255,255,255,0.60)', fontSize: 17, textAlign: 'center', lineHeight: 24 }}>
            Could not load your progress.{'\n'}Check your connection and try again.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: ORANGE, paddingHorizontal: 28, paddingVertical: 20, borderRadius: 28, shadowColor: ORANGE, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 }}
            onPress={loadData}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={{ color: '#1A1A1A', fontSize: 17, fontWeight: '700' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: bottom + 36 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Ring + level ── */}
          <View style={styles.ringSection}>
            <View>
              <ProgressRing progress={ringProgress} size={154 * SC} sw={11} />
              <View style={styles.ringCenter}>
                <Text style={styles.ringNum}>{sessions}</Text>
                <Text style={styles.ringOf}>of {TOTAL_NODES}</Text>
              </View>
            </View>
            <Text style={styles.ringLabel}>sessions complete</Text>
            <View style={styles.levelTag}>
              <Text style={styles.levelTagText}>Level {level}</Text>
            </View>

            {/* Next check-in hint */}
            {sessions > 0 && sessToCheckin > 0 && (
              <Text style={styles.checkinHint}>
                {sessToCheckin} session{sessToCheckin !== 1 ? 's' : ''} until your next progress check-in
              </Text>
            )}
            {sessions > 0 && sessToCheckin === 0 && (
              <View style={styles.checkinDuePill}>
                <Text style={styles.checkinDueText}>Progress check-in available!</Text>
              </View>
            )}
          </View>

          {/* ── Stat row ── */}
          <View style={styles.row}>
            <StatCard value={streak}   label={'day\nstreak'}         accent={ORANGE} />
            <StatCard value={sessions} label={'sessions\ncomplete'}   accent={MINT}   />
            <StatCard value={level}    label={'current\nlevel'}       accent={WHITE}  />
          </View>

          {/* ── Voice scores ── */}
          <Text style={styles.sectionTitle}>Voice Scores</Text>
          {!hasBaseline ? (
            <View style={styles.noBaselineCard}>
              <Text style={styles.noBaselineIcon}>🎤</Text>
              <Text style={styles.noBaselineTitle}>No baseline yet</Text>
              <Text style={styles.noBaselineBody}>
                Complete your first session to unlock voice score tracking.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.row}>
                <ScoreCard
                  label="Voice Power"
                  currentScore={vpScore}
                  points={vpPoints}
                  color={ORANGE}
                  baselineScore={baseline?.composite?.voice_power}
                />
                <ScoreCard
                  label="Expression"
                  currentScore={exScore}
                  points={exPoints}
                  color={MINT}
                  baselineScore={baseline?.composite?.expression}
                />
              </View>
              <ScoreCard
                label="Fluency"
                currentScore={flScore}
                points={flPoints}
                color={WHITE}
                baselineScore={baseline?.composite?.fluency}
              />
            </>
          )}

          {/* ── Milestones ── */}
          <Text style={styles.sectionTitle}>Milestones</Text>
          <Text style={styles.sectionSub}>
            {MILESTONES.filter(m => m.check(mCtx)).length} of {MILESTONES.length} unlocked
          </Text>

          <View style={styles.milestoneGrid}>
            {MILESTONES.map(m => (
              <MilestoneBadge
                key={m.id}
                label={m.label}
                desc={m.desc}
                icon={m.icon}
                unlocked={m.check(mCtx)}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20 * SC,
    paddingBottom: 8,
  },
  backBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center', justifyContent: 'center',
  },
  backText:    { color: WHITE, fontSize: 22, fontWeight: '300' },
  headerTitle: { color: WHITE, fontSize: 20, fontWeight: '700', letterSpacing: 0.5 },

  content: {
    paddingHorizontal: 20 * SC,
    paddingTop: 4,
    gap: 16 * SC,
  },

  // Ring
  ringSection: { alignItems: 'center', paddingVertical: 8, gap: 8 },
  ringCenter: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  ringNum:   { color: WHITE, fontSize: 40, fontWeight: '800', lineHeight: 44 },
  ringOf:    { color: DIM, fontSize: 16, fontWeight: '500' },
  ringLabel: { color: DIM, fontSize: 16 },
  levelTag:  {
    paddingHorizontal: 16 * SC, paddingVertical: 5,
    backgroundColor: `${ORANGE}22`,
    borderRadius: 20, borderWidth: 1, borderColor: `${ORANGE}55`,
  },
  levelTagText: { color: ORANGE, fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },

  checkinHint: {
    color: DIM, fontSize: 16, textAlign: 'center', marginTop: 4,
  },
  checkinDuePill: {
    backgroundColor: `${ORANGE}22`,
    borderRadius: 16, borderWidth: 1, borderColor: `${ORANGE}66`,
    paddingHorizontal: 16, paddingVertical: 6, marginTop: 4,
  },
  checkinDueText: { color: ORANGE, fontSize: 16, fontWeight: '700' },

  row: { flexDirection: 'row', gap: 12 * SC },

  sectionTitle: { color: WHITE, fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
  sectionSub:   { color: DIM, fontSize: 16, marginTop: -10 * SC },

  // No baseline
  noBaselineCard: {
    backgroundColor: 'rgba(45,105,116,0.30)',
    borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(195,222,206,0.18)',
    padding: 28 * SC, alignItems: 'center', gap: 10,
  },
  noBaselineIcon:  { fontSize: 36 },
  noBaselineTitle: { color: WHITE, fontSize: 18, fontWeight: '700' },
  noBaselineBody:  { color: DIM, fontSize: 16, textAlign: 'center', lineHeight: 24 },

  milestoneGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14 * SC,
  },
});
