/**
 * BaselineResultsScreen
 *
 * Shown after StreakCelebration following the baseline assessment.
 * Presents the three-axis voice profile (Voice Power, Pitch Variety, Speech Rhythm)
 * and a clinically-grounded preview of what the first sessions will target.
 *
 * Clinical basis:
 *   LSVT LOUD (Ramig et al. 1995–2004) identifies three dimensions that independently
 *   predict communication effectiveness in Hypokinetic Dysarthria:
 *     1. Vocal intensity / hypophonia → voice_power
 *     2. Pitch variability / monotone  → expression
 *     3. Speech rate / fluency         → fluency
 *   The treatment protocol targets the weakest dimension first for maximum gain.
 *
 * Props (via navigation.params):
 *   focusKey        'voice_power' | 'expression' | 'fluency' | null
 *   focusLabel      string | null
 *   focusTip        string | null
 *   voicePowerScore number | null   (0–100)
 *   expressionScore number | null   (0–100)
 *   fluencyScore    number | null   (0–100)
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
import { colors, radius } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import SpeakerButton from '../components/SpeakerButton';

// ── Score interpretation ───────────────────────────────────────────────────────
// Maps a 0–100 score to a user-facing band label + colour.
// Thresholds based on LSVT LOUD first-session performance bands:
//   ≥75 → above typical baseline; strong starting point
//   45–74 → typical early-training range; good gains expected
//   <45 → primary impairment axis; direct intervention target
function scoreLabel(score) {
  if (score == null) return 'Not assessed';
  if (score >= 75)  return 'Strong';
  if (score >= 45)  return 'Building';
  return 'Developing';
}

function scoreLabelColor(score) {
  if (score == null) return 'rgba(255,255,255,0.50)';
  if (score >= 75)  return colors.green;
  if (score >= 45)  return colors.orange;
  return 'rgba(255,255,255,0.70)';
}

// Short descriptor underneath the score band — plain language, no jargon.
function scoreDesc(score, type) {
  if (score == null) return '—';
  if (type === 'voice_power') {
    if (score >= 75) return 'Projecting well';
    if (score >= 45) return 'Volume building with training';
    return 'Projection is the primary target';
  }
  if (type === 'expression') {
    if (score >= 75) return 'Good pitch variety';
    if (score >= 45) return 'More range to unlock with practice';
    return 'Key area — let the voice rise and fall';
  }
  if (type === 'fluency') {
    if (score >= 75) return 'Natural, comfortable pace';
    if (score >= 45) return 'Rhythm improving with training';
    return 'Focus on steady, even pacing';
  }
  return '';
}

// ── Training plan content ─────────────────────────────────────────────────────
// Three brief plan points tailored to the identified weakest dimension.
function getPlanItems(focusKey) {
  if (focusKey === 'voice_power') {
    return [
      "Recalibrate your sense of 'loud enough' — Parkinson's gradually shifts this reference point without you noticing",
      'Project clearly across a room, not just for the person immediately beside you',
      'Build high-effort voicing as your automatic default so it requires no conscious push',
    ];
  }
  if (focusKey === 'expression') {
    return [
      'Practice sliding your voice from low to high — reawakening pitch range that daily speech rarely uses',
      'Vary pitch intentionally on key words to make meaning clearer and more engaging',
      'Build natural pitch movement as a default rather than a conscious effort',
    ];
  }
  if (focusKey === 'fluency') {
    return [
      'Extend your sustained sound — building from short holds toward longer, steadier phonation',
      'Connect breath to voice so every phrase is powered through to the end',
      'Train the automatic breath pacing that supports natural, effortless conversation',
    ];
  }
  // All dimensions strong — balanced parallel plan
  return [
    'Build vocal power and pitch variety together — both are starting well',
    'Extend your range: longer holds, stronger projection, more natural pitch movement',
    'Carry your trained voice into everyday conversation through structured carryover tasks',
  ];
}

// ── Score card ────────────────────────────────────────────────────────────────
function ScoreCard({ title, score, type, fullWidth }) {
  const label = scoreLabel(score);
  const labelColor = scoreLabelColor(score);
  const desc = scoreDesc(score, type);

  return (
    <View style={[sc.card, fullWidth && sc.cardFullWidth]}>
      <Text style={sc.title}>{title}</Text>
      <Text style={[sc.label, { color: labelColor }]}>{label}</Text>
      <Text style={sc.desc}>{desc}</Text>
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 6,
  },
  cardFullWidth: {
    flex: 0,
    width: '100%',
  },
  title: {
    color: colors.mint,
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
    backgroundColor: colors.orange,
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
    focusKey       = null,
    focusLabel     = null,
    focusTip       = null,
    voicePowerScore = null,
    expressionScore = null,
    fluencyScore    = null,
  } = route?.params ?? {};

  const { bottom } = useSafeAreaInsets();
  const planItems = getPlanItems(focusKey);

  // Build the speaker text from the focus tip if it exists, so users can
  // hear the key message about their primary training focus read aloud.
  const speakerText = focusTip
    ? `Your primary focus is ${focusLabel}. ${focusTip}`
    : focusLabel
      ? `Your primary focus is ${focusLabel}.`
      : null;

  function handleStart() {
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  }

  return (
    // ScreenHeader handles the top safe area inset internally.
    <LinearGradient
      colors={colors.gradients.session}
      style={styles.root}
    >
      <StatusBar barStyle="light-content" />

      {/* Header now rendered by shared ScreenHeader component */}
      <ScreenHeader
        navigation={navigation}
        title="Your Results"
        rightAction={
          speakerText
            ? <SpeakerButton text={speakerText} />
            : undefined
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>YOUR VOICE PROFILE</Text>
        <Text style={styles.title}>Here's what{'\n'}we found.</Text>

        {/* ── Score cards — three-axis clinical profile ─────────────────── */}
        {/* Top row: Voice Power + Pitch Variety side by side */}
        <View style={styles.cardRow}>
          <ScoreCard title="Voice Power"   score={voicePowerScore} type="voice_power" />
          <ScoreCard title="Pitch Variety" score={expressionScore} type="expression" />
        </View>
        {/* Bottom row: Speech Rhythm full-width */}
        <ScoreCard title="Speech Rhythm" score={fluencyScore} type="fluency" fullWidth />

        <Text style={styles.scoreClinicalNote}>
          Assessed at a mid-range target. Research shows these three dimensions
          independently predict communication effectiveness in Parkinson's.
        </Text>

        {/* ── Focus area card ──────────────────────────────────────────────── */}
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
              All three dimensions are starting strong. Sessions will build
              voice power, pitch variety, and speech rhythm in parallel.
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
    // ScreenHeader now renders above the ScrollView, so top padding is reduced.
    paddingTop: 16,
    gap: 24,
  },

  eyebrow: {
    color: colors.mint,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
  },

  title: {
    color: colors.white,
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
    backgroundColor: `${colors.orange}1A`,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: `${colors.orange}59`,
    padding: 22,
    gap: 8,
  },
  focusEyebrow: {
    color: colors.orange,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  focusTitle: {
    color: colors.white,
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
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    gap: 16,
  },
  planEyebrow: {
    color: colors.mint,
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
    backgroundColor: colors.orange,
    borderRadius: radius.xl,
    paddingVertical: 20,
    alignItems: 'center',
    shadowColor: colors.orange,
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
