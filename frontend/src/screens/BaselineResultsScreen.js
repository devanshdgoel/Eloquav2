/**
 * BaselineResultsScreen
 *
 * Shown after StreakCelebration following the first (baseline) session.
 * Presents a brief two-axis voice profile (breath support + voice power)
 * and a clinically-grounded preview of what the first six sessions will target.
 *
 * Clinical basis:
 *   LSVT LOUD (Ramig et al. 1995, 2001, 2004) establishes two independent
 *   impairment axes in Hypokinetic Dysarthria:
 *     1. Respiratory-phonatory efficiency (Maximum Phonation Time / MPT)
 *     2. Vocal intensity / hypophonia
 *   The treatment protocol targets the weakest axis first for maximum
 *   functional gain, which is what focusKey encodes here.
 *
 * Props (via navigation.params):
 *   focusKey      'phonation' | 'loudness' | null
 *   focusLabel    string | null
 *   focusTip      string | null
 *   phonationScore number | null   (0–100, tier-2 baseline)
 *   loudnessScore  number | null   (0–100, tier-2 baseline)
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ORANGE = '#FFA940';
const MINT   = '#C3DECE';
const WHITE  = '#FFFFFF';
const GREEN  = '#48D28C';

// ── Score interpretation ───────────────────────────────────────────────────────
// Maps a 0–100 tier-2 score to a user-facing label + colour.
// Thresholds based on LSVT LOUD performance bands:
//   ≥75 → above the standard target for a first-session attempt
//   45–74 → typical early-training range; significant gains expected
//   <45 → primary impairment; direct intervention target
function scoreLabel(score) {
  if (score == null) return 'Not assessed';
  if (score >= 75) return 'Strong';
  if (score >= 45) return 'Building';
  return 'Developing';
}

function scoreLabelColor(score) {
  if (score == null) return 'rgba(255,255,255,0.50)';
  if (score >= 75) return GREEN;
  if (score >= 45) return ORANGE;
  return 'rgba(255,255,255,0.70)';
}

// Short descriptor underneath the label — avoids clinical jargon while being honest.
function scoreDesc(score, type) {
  if (score == null) return '—';
  if (type === 'phonation') {
    if (score >= 75) return 'Good breath endurance';
    if (score >= 45) return 'Room to grow with practice';
    return 'Key area to strengthen first';
  }
  if (type === 'loudness') {
    if (score >= 75) return 'Projecting well';
    if (score >= 45) return 'Volume building with training';
    return 'Projection is the primary target';
  }
  return '';
}

// ── Training plan content ─────────────────────────────────────────────────────
// Three brief plan points tailored to the identified focus.
// Grounded in LSVT LOUD protocol structure (16-session intensive targeting):
//   Phase 1 (sessions 1–6): maximum effort tasks, recalibrate loudness sense
//   Phase 2 (sessions 7–12): hierarchical complexity with carryover
function getPlanItems(focusKey) {
  if (focusKey === 'phonation') {
    return [
      'Extend your sustained sound — building from 5 s toward 15 s over the first block of sessions',
      'Connect breath to voice so every phrase is powered through to the end',
      'Train the automatic breath pacing that supports natural, effortless conversation',
    ];
  }
  if (focusKey === 'loudness') {
    return [
      "Recalibrate your sense of 'loud enough' — Parkinson's gradually shifts this reference point without you noticing",
      'Project clearly across a room, not just for the person immediately beside you',
      'Build high-effort voicing as your automatic default so it requires no conscious push',
    ];
  }
  // Both dimensions strong — train in parallel
  return [
    'Build breath support and vocal power together across both dimensions',
    'Extend your range — longer holds, stronger projection, more natural pitch variation',
    'Carry your trained voice into real everyday conversation through structured carryover tasks',
  ];
}

// ── Score card ────────────────────────────────────────────────────────────────
function ScoreCard({ title, score, type }) {
  const label = scoreLabel(score);
  const labelColor = scoreLabelColor(score);
  const desc = scoreDesc(score, type);

  return (
    <View style={sc.card}>
      <Text style={sc.title}>{title}</Text>
      <Text style={[sc.label, { color: labelColor }]}>{label}</Text>
      <Text style={sc.desc}>{desc}</Text>
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 18,
    gap: 6,
  },
  title: {
    color: MINT,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  label: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  desc: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 13,
    lineHeight: 18,
  },
});

// ── Plan bullet ───────────────────────────────────────────────────────────────
function PlanBullet({ text }) {
  return (
    <View style={pb.row}>
      <View style={pb.dot} />
      <Text style={pb.text}>{text}</Text>
    </View>
  );
}

const pb = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: ORANGE,
    marginTop: 7, flexShrink: 0,
  },
  text: {
    flex: 1,
    color: 'rgba(255,255,255,0.80)',
    fontSize: 15,
    lineHeight: 22,
  },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function BaselineResultsScreen({ navigation, route }) {
  const {
    focusKey      = null,
    focusLabel    = null,
    focusTip      = null,
    phonationScore = null,
    loudnessScore  = null,
  } = route?.params ?? {};

  const { top, bottom } = useSafeAreaInsets();
  const planItems = getPlanItems(focusKey);

  function handleStart() {
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  }

  return (
    <LinearGradient
      colors={['#243E44', '#0D1E21']}
      style={[styles.root, { paddingTop: top }]}
    >
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <Text style={styles.eyebrow}>YOUR VOICE PROFILE</Text>
        <Text style={styles.title}>Here's what{'\n'}we found.</Text>

        {/* ── Score cards — two-axis clinical profile ──────────────────── */}
        <View style={styles.cardRow}>
          <ScoreCard
            title="Breath Support"
            score={phonationScore}
            type="phonation"
          />
          <ScoreCard
            title="Voice Power"
            score={loudnessScore}
            type="loudness"
          />
        </View>

        <Text style={styles.scoreClinicalNote}>
          Assessed at a mid-range target. Research shows these two dimensions
          independently predict communication effectiveness in Parkinson's.
        </Text>

        {/* ── Focus area card ──────────────────────────────────────────── */}
        {focusLabel ? (
          <View style={styles.focusCard}>
            <Text style={styles.focusEyebrow}>YOUR PRIMARY FOCUS</Text>
            <Text style={styles.focusTitle}>{focusLabel}</Text>
            {focusTip ? (
              <Text style={styles.focusTip}>{focusTip}</Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.focusCard}>
            <Text style={styles.focusEyebrow}>YOUR APPROACH</Text>
            <Text style={styles.focusTitle}>Balanced Development</Text>
            <Text style={styles.focusTip}>
              Both dimensions are starting strong. Sessions will build voice
              power and breath support in parallel for the fastest gains.
            </Text>
          </View>
        )}

        {/* ── Training plan preview ─────────────────────────────────────── */}
        <View style={styles.planCard}>
          <Text style={styles.planEyebrow}>YOUR FIRST 6 SESSIONS</Text>
          <View style={styles.planItems}>
            {planItems.map((item, i) => (
              <PlanBullet key={i} text={item} />
            ))}
          </View>
          <Text style={styles.planFootnote}>
            Based on LSVT LOUD — the most clinically validated voice
            therapy for Parkinson's disease (Ramig et al., 1995–2004).
          </Text>
        </View>
      </ScrollView>

      {/* ── Floating CTA ─────────────────────────────────────────────────── */}
      <View style={[styles.btnWrap, { paddingBottom: bottom + 24 }]}>
        <TouchableOpacity
          style={styles.btn}
          onPress={handleStart}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Start My Journey"
        >
          <Text style={styles.btnText}>Start My Journey  →</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  scroll: {
    paddingHorizontal: 28,
    paddingTop: 56,
    gap: 24,
  },

  eyebrow: {
    color: MINT,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
  },

  title: {
    color: WHITE,
    fontSize: 40,
    fontWeight: '800',
    lineHeight: 48,
    letterSpacing: 0.3,
    marginBottom: 4,
  },

  // ── Score cards ──
  cardRow: {
    flexDirection: 'row',
    gap: 12,
  },

  scoreClinicalNote: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: 12,
    lineHeight: 17,
    fontStyle: 'italic',
    marginTop: -8,
  },

  // ── Focus card ──
  focusCard: {
    backgroundColor: 'rgba(255,169,64,0.10)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,169,64,0.35)',
    padding: 22,
    gap: 8,
  },
  focusEyebrow: {
    color: ORANGE,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  focusTitle: {
    color: WHITE,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  focusTip: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 15,
    lineHeight: 22,
  },

  // ── Plan card ──
  planCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 22,
    gap: 16,
  },
  planEyebrow: {
    color: MINT,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  planItems: {
    gap: 14,
  },
  planFootnote: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    lineHeight: 17,
    fontStyle: 'italic',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 14,
    marginTop: 2,
  },

  // ── CTA ──
  btnWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 28,
    paddingTop: 16,
    backgroundColor: 'rgba(13,30,33,0.92)',
  },
  btn: {
    backgroundColor: ORANGE,
    borderRadius: 28,
    paddingVertical: 20,
    alignItems: 'center',
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  btnText: {
    color: '#1A1A1A',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
