/**
 * BaselineResultsScreen
 *
 * Shown after StreakCelebration following the baseline session.
 * Presents the three-axis voice profile on a single, non-scrolling screen.
 *
 * Clinical basis:
 *   LSVT LOUD identifies three dimensions that predict communication effectiveness
 *   in Hypokinetic Dysarthria: vocal intensity, pitch variability, and speech rate.
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import SpeakerButton from '../components/SpeakerButton';

// Maps a 0–100 score to a band label and colour.
function scoreBand(score) {
  if (score == null) return { label: 'Not assessed', color: 'rgba(255,255,255,0.45)' };
  if (score >= 75)   return { label: 'Strong',       color: colors.green  };
  if (score >= 45)   return { label: 'Building',     color: colors.orange };
  return               { label: 'Developing',        color: 'rgba(255,255,255,0.70)' };
}

// One sentence that contextualises the score without medical jargon.
function scoreHint(score, type) {
  if (score == null) return '—';
  if (type === 'voice_power') {
    if (score >= 75) return 'Good projection';
    if (score >= 45) return 'Building with training';
    return 'Primary training target';
  }
  if (type === 'expression') {
    if (score >= 75) return 'Good pitch variety';
    if (score >= 45) return 'More range ahead';
    return 'Key area to develop';
  }
  if (type === 'fluency') {
    if (score >= 75) return 'Natural, steady pace';
    if (score >= 45) return 'Rhythm improving';
    return 'Focus on even pacing';
  }
  return '';
}

// ── Compact score card ────────────────────────────────────────────────────────
function ScoreCard({ title, score, type, style }) {
  const { label, color } = scoreBand(score);
  const hint = scoreHint(score, type);
  return (
    <View style={[sc.card, style]}>
      <Text style={sc.title}>{title}</Text>
      <Text style={[sc.label, { color }]}>{label}</Text>
      <Text style={sc.hint}>{hint}</Text>
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
    padding: 16,
    gap: 4,
  },
  title: {
    color: colors.mint,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  label: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  hint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    lineHeight: 17,
  },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function BaselineResultsScreen({ navigation, route }) {
  const {
    focusKey        = null,
    focusLabel      = null,
    focusTip        = null,
    voicePowerScore = null,
    expressionScore = null,
    fluencyScore    = null,
  } = route?.params ?? {};

  const { bottom } = useSafeAreaInsets();

  const speakerText = focusTip
    ? `Your primary focus is ${focusLabel}. ${focusTip}`
    : focusLabel
      ? `Your primary focus is ${focusLabel}.`
      : null;

  function handleStart() {
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  }

  // Focus tip — use the provided tip or a default for the all-strong case.
  const displayFocusLabel = focusLabel ?? 'Balanced Development';
  const displayFocusTip = focusTip
    ?? 'All three dimensions are starting well. Sessions will build voice power, pitch variety, and speech rhythm together.';

  return (
    <LinearGradient colors={colors.gradients.session} style={styles.root}>
      <StatusBar barStyle="light-content" />

      <ScreenHeader
        navigation={navigation}
        title="Your Results"
        rightAction={speakerText ? <SpeakerButton text={speakerText} /> : undefined}
      />

      {/* ── Main content — fills available space between header and button ─── */}
      <View style={styles.content}>

        <View style={styles.intro}>
          <Text style={styles.eyebrow}>YOUR VOICE PROFILE</Text>
          <Text style={styles.title}>Here's where{'\n'}you're starting.</Text>
        </View>

        {/* Top row: Voice Power + Pitch Variety */}
        <View style={styles.cardRow}>
          <ScoreCard title="Voice Power"   score={voicePowerScore} type="voice_power" />
          <ScoreCard title="Pitch Variety" score={expressionScore} type="expression"  />
        </View>

        {/* Bottom row: Speech Rhythm full width */}
        <ScoreCard
          title="Speech Rhythm"
          score={fluencyScore}
          type="fluency"
          style={styles.cardFullWidth}
        />

        {/* Focus card — primary training target or balanced plan */}
        <View style={styles.focusCard}>
          <Text style={styles.focusEyebrow}>
            {focusLabel ? 'YOUR PRIMARY FOCUS' : 'YOUR APPROACH'}
          </Text>
          <Text style={styles.focusTitle}>{displayFocusLabel}</Text>
          <Text style={styles.focusTip}>{displayFocusTip}</Text>
        </View>

      </View>

      {/* ── CTA ── */}
      <View style={[styles.btnWrap, { paddingBottom: bottom + 20 }]}>
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

  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 16,
    justifyContent: 'center',
  },

  intro: {
    gap: 4,
  },
  eyebrow: {
    color: colors.mint,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    color: colors.white,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
    letterSpacing: 0.2,
  },

  // ── Score cards ──
  cardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cardFullWidth: {
    // ScoreCard already has flex:1; override for full-width row behaviour
    flex: 0,
    width: '100%',
  },

  // ── Focus card ──
  focusCard: {
    backgroundColor: `${colors.orange}1A`,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: `${colors.orange}55`,
    padding: 20,
    gap: 6,
  },
  focusEyebrow: {
    color: colors.orange,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  focusTitle: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  focusTip: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 16,
    lineHeight: 22,
  },

  // ── CTA ──
  btnWrap: {
    paddingHorizontal: 24,
    paddingTop: 12,
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
