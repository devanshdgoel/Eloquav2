/**
 * ProgressScreen — simplified, single-screen progress view for the pilot.
 *
 * Design goals:
 *   1. No scrolling — everything visible at once.
 *   2. Motivational and personal — name + message based on sessions completed.
 *   3. Accurate — session count from Firestore is the source of truth.
 *      "hasBaseline" falls back to sessions >= 1 so it never contradicts
 *      the session counter.
 *   4. Simple — removed voice score sparklines (confusing without data) and
 *      the 9-badge milestone grid. Replaced with 4 key achievement chips.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { fetchProgress, TOTAL_NODES } from '../services/progressService';
import { getUserProfile } from '../utils/storage';
import { logScreenView } from '../utils/analytics';
import { FireIcon, LightningIcon, StarIcon } from '../components/Icons';
import TabBar from '../components/TabBar';
import ScreenHeader from '../components/ScreenHeader';

const { width: W } = Dimensions.get('window');
const SC = W / 402;

const ORANGE = '#FFA940';
const TEAL   = '#2D6974';
const MINT   = '#C3DECE';
const WHITE  = '#FFFFFF';
const DIM    = 'rgba(255,255,255,0.60)';
const BG_CARD = 'rgba(45,105,116,0.40)';
const CARD_BORDER = 'rgba(195,222,206,0.15)';

// ── Motivational copy based on progress ───────────────────────────────────────
function motivationalText(sessions, name) {
  const n = name ? `, ${name}` : '';
  if (sessions === 0) return [`Welcome${n}!`,       'Your voice journey starts here.'];
  if (sessions === 1) return [`Great start${n}!`,   'One session done. Keep building.'];
  if (sessions < 5)  return [`Nice work${n}!`,      'You\'re building a strong habit.'];
  if (sessions < 10) return [`Keep it up${n}!`,     'Your voice gets stronger every session.'];
  if (sessions < 15) return [`Halfway there${n}!`,  'Your dedication is really showing.'];
  if (sessions < 20) return [`Almost there${n}!`,   'The final stretch. You\'ve got this!'];
  return [`Journey complete${n}!`,                  'All 20 sessions done. Incredible!'];
}

// ── Key achievement chips (4 chosen for pilot clarity) ───────────────────────
const ACHIEVEMENTS = [
  {
    id: 'first_voice',
    label: 'First Session',
    icon: (unlocked) => (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"
          fill={unlocked ? MINT : 'rgba(255,255,255,0.25)'} />
        <Path d="M5 10c0 3.866 3.134 7 7 7s7-3.134 7-7"
          stroke={unlocked ? MINT : 'rgba(255,255,255,0.25)'} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    ),
    check: ({ sessions }) => sessions >= 1,
  },
  {
    id: 'committed',
    label: '10 Sessions',
    icon: (unlocked) => <LightningIcon size={20} color={unlocked ? WHITE : 'rgba(255,255,255,0.25)'} />,
    check: ({ sessions }) => sessions >= 10,
  },
  {
    id: 'week_warrior',
    label: '7-Day Streak',
    icon: (unlocked) => <FireIcon size={20} color={unlocked ? ORANGE : 'rgba(255,255,255,0.25)'} />,
    check: ({ streak }) => streak >= 7,
  },
  {
    id: 'complete',
    label: 'All 20 Done',
    icon: (unlocked) => <StarIcon size={20} color={unlocked ? ORANGE : 'rgba(255,255,255,0.25)'} />,
    check: ({ sessions }) => sessions >= TOTAL_NODES,
  },
];

// ── Achievement chip ──────────────────────────────────────────────────────────
function AchievementChip({ achievement, ctx }) {
  const unlocked = achievement.check(ctx);
  return (
    <View style={[chip.wrap, !unlocked && chip.locked]}>
      <View style={[chip.icon, unlocked && chip.iconActive]}>
        {achievement.icon(unlocked)}
      </View>
      <Text style={[chip.label, !unlocked && chip.dim]}>{achievement.label}</Text>
      {unlocked && <View style={chip.dot} />}
    </View>
  );
}
const chip = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14 * SC,
    paddingHorizontal: 8 * SC,
    backgroundColor: BG_CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    gap: 6,
  },
  locked: {
    backgroundColor: 'rgba(20,45,50,0.50)',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  icon: {
    width: 40 * SC, height: 40 * SC, borderRadius: 20 * SC,
    backgroundColor: 'rgba(0,0,0,0.20)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconActive: { backgroundColor: 'rgba(255,169,64,0.15)' },
  label: { color: WHITE, fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 16 },
  dim:   { color: 'rgba(255,255,255,0.35)' },
  // Small orange dot below label when unlocked
  dot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: ORANGE,
  },
});

// ── Stat pill ─────────────────────────────────────────────────────────────────
// icon prop accepts an optional React element shown beside the value (e.g. FireIcon).
function StatPill({ value, label, accent, icon }) {
  return (
    <View style={pill.wrap}>
      <View style={pill.valueRow}>
        <Text style={[pill.value, { color: accent }]}>{value}</Text>
        {icon && <View style={pill.iconWrap}>{icon}</View>}
      </View>
      <Text style={pill.label}>{label}</Text>
    </View>
  );
}
const pill = StyleSheet.create({
  wrap: {
    flex: 1, alignItems: 'center', paddingVertical: 18 * SC,
    backgroundColor: BG_CARD,
    borderRadius: 16, borderWidth: 1,
    borderColor: CARD_BORDER,
    gap: 3,
  },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  value: { fontSize: 28, fontWeight: '800', letterSpacing: 0.3 },
  iconWrap: { marginTop: 1 },
  label: { color: DIM, fontSize: 14, fontWeight: '500', textAlign: 'center' },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ProgressScreen({ navigation }) {
  const { bottom } = useSafeAreaInsets();

  const [prog,    setProg]    = useState({ current_node: 0, streak_days: 0, sessions_completed: 0 });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);
  const [name,    setName]    = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // Load progress + user profile in parallel; profile is best-effort.
      const [p, profile] = await Promise.all([
        fetchProgress(),
        getUserProfile().catch(() => null),
      ]);
      setProg(p);
      if (profile?.name) setName(profile.name.split(' ')[0]);
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

  const sessions     = prog.sessions_completed ?? 0;
  const streak       = prog.streak_days        ?? 0;
  const level        = Math.floor(sessions / 7) + 1;
  // Sessions count is the primary source of truth for whether the user has
  // started — this prevents the "No baseline" card contradicting a non-zero
  // session count (which happened when the backend API and Firestore diverged).
  const hasStarted   = sessions >= 1;

  // Progress towards completion (0–1 fraction of 20 total nodes).
  const fraction     = Math.min(1, sessions / TOTAL_NODES);
  const pct          = Math.round(fraction * 100);

  // Check-in countdown: next check-in is at session 7, 14, etc.
  const nextCheckin  = sessions > 0 ? (Math.floor(sessions / 7) + 1) * 7 : 7;
  const sessLeft     = Math.max(0, nextCheckin - sessions);

  const [heroTitle, heroSub] = motivationalText(sessions, name);

  const ctx = { sessions, streak };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#37767A', '#1C4047', '#0A1618']}
        start={{ x: 0.3, y: 0 }} end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader navigation={navigation} title="My Progress" />

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      ) : error ? (
        <View style={s.center}>
          <Text style={s.errorText}>Could not load your progress.{'\n'}Check your connection.</Text>
          <TouchableOpacity style={s.retryBtn} onPress={loadData} activeOpacity={0.85}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.body}>

          {/* ── Motivational hero ── */}
          <View style={s.heroCard}>
            <Text style={s.heroTitle}>{heroTitle}</Text>
            <Text style={s.heroSub}>{heroSub}</Text>
          </View>

          {/* ── Session progress bar ── */}
          <View style={s.progressCard}>
            <View style={s.progressTopRow}>
              <Text style={s.progressLabel}>Sessions complete</Text>
              <Text style={s.progressFraction}>
                <Text style={s.progressBig}>{sessions}</Text>
                {' '}of {TOTAL_NODES}
              </Text>
            </View>
            <View style={s.barTrack}>
              <View style={[s.barFill, { width: `${pct}%` }]} />
            </View>
            {/* Next check-in hint — keeps users engaged between milestones */}
            {hasStarted && sessLeft > 0 && (
              <Text style={s.checkinHint}>
                {sessLeft} session{sessLeft !== 1 ? 's' : ''} until your next progress check-in
              </Text>
            )}
            {hasStarted && sessLeft === 0 && (
              <Text style={[s.checkinHint, { color: ORANGE }]}>Progress check-in available!</Text>
            )}
          </View>

          {/* ── Streak + Level stats ── */}
          <View style={s.statsRow}>
            <StatPill
              value={`${streak}`}
              label={'day streak'}
              accent={ORANGE}
              icon={<FireIcon size={22} color={ORANGE} />}
            />
            <StatPill
              value={`Level ${level}`}
              label={'current level'}
              accent={MINT}
            />
          </View>

          {/* ── Achievements ── */}
          <View style={s.achieveSection}>
            <Text style={s.achieveTitle}>Achievements</Text>
            <View style={s.achieveRow}>
              {ACHIEVEMENTS.map(a => (
                <AchievementChip key={a.id} achievement={a} ctx={ctx} />
              ))}
            </View>
          </View>

        </View>
      )}

      <TabBar navigation={navigation} activeTab="progress" />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },

  errorText: { color: DIM, fontSize: 17, textAlign: 'center', lineHeight: 26 },
  retryBtn: {
    backgroundColor: ORANGE, paddingHorizontal: 28, paddingVertical: 18,
    borderRadius: 28, shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  retryText: { color: '#1A1A1A', fontSize: 17, fontWeight: '700' },

  // All content in a column, flex-distributed so it fills the space between
  // the header and the tab bar without needing a ScrollView.
  body: {
    flex: 1,
    paddingHorizontal: 20 * SC,
    paddingTop: 12 * SC,
    paddingBottom: 12 * SC,
    gap: 14 * SC,
  },

  // ── Hero card ──────────────────────────────────────────────────────────────
  heroCard: {
    backgroundColor: BG_CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingHorizontal: 22 * SC,
    paddingVertical: 18 * SC,
    alignItems: 'center',
    gap: 4,
  },
  heroTitle: {
    color: WHITE,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  heroSub: {
    color: DIM,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },

  // ── Progress bar card ──────────────────────────────────────────────────────
  progressCard: {
    backgroundColor: BG_CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingHorizontal: 20 * SC,
    paddingVertical: 16 * SC,
    gap: 10,
  },
  progressTopRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  progressLabel: { color: DIM, fontSize: 15, fontWeight: '600' },
  progressFraction: { color: DIM, fontSize: 15 },
  progressBig: { color: WHITE, fontSize: 22, fontWeight: '800' },
  barTrack: {
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: ORANGE,
    borderRadius: 5,
    minWidth: 10, // always show a sliver even at 0%
  },
  checkinHint: {
    color: DIM,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 2,
  },

  // ── Stats row ──────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    gap: 12 * SC,
  },

  // ── Achievements ───────────────────────────────────────────────────────────
  achieveSection: {
    flex: 1,
    gap: 10 * SC,
  },
  achieveTitle: {
    color: WHITE,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  achieveRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 10 * SC,
  },
});
