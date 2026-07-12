/**
 * BaselineSessionScreen
 *
 * The first session a new user completes. Goals:
 *   1. Profile the user's voice by running exercises at tier 2 (mid difficulty)
 *      so scores are meaningful and not trivially 100%.
 *   2. Initialise difficulty tiers for all subsequent sessions based on results.
 *   3. Identify the user's primary focus area (lowest-scoring exercise).
 *   4. Capture voice samples for ElevenLabs voice clone (VoiceSetupExercise).
 *
 * Session sequence (short to avoid overwhelming first-time users):
 *   Breathing → Sustained Phonation → Voice Setup
 *
 * Only Sustained Phonation is scored (at BASELINE_TIER = 2).
 * Tier 2 is the "sweet spot" for a first attempt:
 *   - Tier 1 (4 s target) is trivially easy — most users score ~100 %, no discrimination.
 *   - Tier 2 (5 s target) reveals genuine differences and maps cleanly to a starting tier.
 *
 * Tier initialisation from a single score:
 *   - phonation + loudness → derived from the phonation score (same breath-support domain).
 *   - pitchGlides + speech → synthesised at 50 (maps to tier 2, a safe mid-point default).
 *
 * After the last exercise, the session:
 *   1. Saves the phonation score (feeds the nudge system).
 *   2. Writes derived difficulty tiers to Firestore.
 *   3. Sets focus area to 'Breath Support' if phonation score < 60, else null.
 *   4. Calls completeSession() to advance node 0 → 1 and update the streak.
 *   5. Navigates StreakCelebration (fromBaseline=true) → BaselineResults → Home.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { completeSession } from '../../services/progressService';
import { onSessionComplete } from '../../services/notificationService';
import {
  EXERCISE_KEYS,
  saveSessionExerciseScores,
  setTiersFromBaselineExercises,
} from '../../services/difficultyService';
import { getUserProfile } from '../../utils/storage';
import { logFunnelEvent, logScreenView } from '../../utils/analytics';

import BreathingExercise  from './exercises/BreathingExercise';
import SustainedPhonation from './exercises/SustainedPhonationExercise';
import LoudnessDrills     from './exercises/LoudnessDrillsExercise';
import VoiceSetupExercise from './exercises/VoiceSetupExercise';

// All scored exercises run at this tier during the baseline session.
// Tier 2 is challenging enough to produce discriminating scores without
// being overwhelming for someone doing this for the first time.
const BASELINE_TIER = 2;

const PROGRESS_BAR_H = 8;

// Two scored exercises (phonation + loudness) provide a two-axis clinical profile:
//   Phonation → respiratory-phonatory efficiency (MPT proxy, per Zraick et al. 2012)
//   Loudness  → vocal intensity / hypophonia severity (primary LSVT LOUD target,
//               Ramig et al. 1995, 2001)
// Both run at BASELINE_TIER = 2 to produce discriminating, non-trivial scores.
// Breathing (1 cycle) is a warm-up only. VoiceSetup records voice clone samples.
const SESSION_EXERCISES = [
  { type: 'breathing',  label: 'Breathing' },
  { type: 'phonation',  label: 'Sustained Sound' },
  { type: 'loudness',   label: 'Voice Power' },
  { type: 'voiceSetup', label: 'Voice Profile' },
];

const EXERCISE_MAP = {
  breathing:  BreathingExercise,
  phonation:  SustainedPhonation,
  loudness:   LoudnessDrills,
  voiceSetup: VoiceSetupExercise,
};

// Breathing and voiceSetup are not scored. Phonation and loudness each return 0–100.
const SCORED_TYPES = new Set(['phonation', 'loudness']);

// Encouragement shown after each scored exercise completes.
const ENC_MSGS = ['Nicely done.', "That's the one.", 'Your voice carried that.', 'Well done.'];

// Maps each scored exercise type to a user-facing focus area name and coaching tip.
// Tip text is intentionally non-clinical but evidence-informed.
const EXERCISE_FOCUS = {
  phonation: {
    label: 'Breath Support',
    tip:   'Hold your voice strong and steady for longer. Deep breaths are the fuel behind clear speech.',
  },
  loudness: {
    label: 'Voice Power',
    tip:   'Project your voice clearly across the room. In Parkinson\'s, the brain can lose track of how loud "normal" sounds — training recalibrates it.',
  },
};

// ── Fallback done screen ───────────────────────────────────────────────────────
// Shown only if StreakCelebration navigation fails — gives users a path home.
function SessionComplete({ navigation }) {
  return (
    <LinearGradient colors={['#37767A', '#1C4047', '#0A1618']} style={fc.root}>
      <View style={fc.content}>
        <Text style={fc.title}>Your profile is ready.</Text>
        <Text style={fc.sub}>
          Your training plan is set.{'\n'}Every session from here sharpens your voice.
        </Text>
        <TouchableOpacity
          style={fc.btn}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Start my journey"
        >
          <Text style={fc.btnText}>Start My Journey  →</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const fc = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { alignItems: 'center', paddingHorizontal: 40, gap: 20 },
  title: {
    fontSize: 36, fontWeight: '800', color: '#FFFFFF',
    letterSpacing: 0.3, textAlign: 'center',
  },
  sub: {
    fontSize: 18, color: 'rgba(255,255,255,0.70)',
    textAlign: 'center', lineHeight: 26,
  },
  btn: {
    marginTop: 12, backgroundColor: '#FFA940',
    borderRadius: 28, paddingHorizontal: 40, paddingVertical: 20,
  },
  btnText: { color: '#1A1A1A', fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },
});

// ── Main container ─────────────────────────────────────────────────────────────
export default function BaselineSessionScreen({ navigation }) {
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [isDone,        setIsDone]        = useState(false);

  // Brief warm message shown between scored exercises (same as VocalTrainingSession).
  const [transitioning, setTransitioning] = useState(false);
  const [transitionMsg, setTransitionMsg] = useState('');

  // Accumulate per-exercise scores across the session.
  const exerciseScoresRef = useRef({});
  const exerciseIndexRef  = useRef(0); // mirrors exerciseIndex for the beforeRemove listener

  // Screen-time tracking and funnel event on mount.
  useEffect(() => {
    const logExit = logScreenView('BaselineSession');
    logFunnelEvent('assessment_baseline_started');
    return logExit;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep ref in sync so the beforeRemove listener reads the latest index without
  // being re-registered on every state change.
  useEffect(() => { exerciseIndexRef.current = exerciseIndex; }, [exerciseIndex]);

  // Guard against accidental back navigation mid-session.
  // Programmatic replace/reset is allowed through (completes the flow normally).
  useEffect(() => {
    if (isDone) return;
    const unsub = navigation.addListener('beforeRemove', (e) => {
      const actionType = e.data.action.type;
      if (actionType === 'REPLACE' || actionType === 'RESET') return;
      e.preventDefault();
      Alert.alert(
        'Leave session?',
        "Your progress won't be saved if you leave now.",
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Leave',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      );
    });
    return unsub;
  }, [navigation, isDone]);

  // Orange progress bar — animated as a layout property, not native driver.
  const progressAnim = useRef(new Animated.Value(0)).current;

  function animateProgressTo(fraction) {
    Animated.timing(progressAnim, {
      toValue:  fraction,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }

  // Compare the two scored exercise results and return the weaker dimension as the focus.
  // Clinical basis: LSVT LOUD targets the WEAKEST link first for maximum functional gain.
  // A score < 65 at tier 2 signals a meaningful gap; if both are strong, no specific focus
  // is set and sessions develop both dimensions in parallel.
  function deriveFocusKey(scores) {
    const phon = scores.phonation != null && Number.isFinite(scores.phonation) ? scores.phonation : 0;
    const loud = scores.loudness  != null && Number.isFinite(scores.loudness)  ? scores.loudness  : 0;

    const weakestKey   = phon <= loud ? 'phonation' : 'loudness';
    const weakestScore = Math.min(phon, loud);

    // Only designate a focus if the weakest dimension genuinely needs attention.
    // 65 is the midpoint between the 50-threshold for tier placement and the 80
    // that earns a tier-up — a principled "could benefit from extra attention" cutoff.
    return weakestScore < 65 ? weakestKey : null;
  }

  // Save scores, initialise tiers, advance the roadmap, navigate to StreakCelebration.
  async function finishBaseline() {
    const scores = exerciseScoresRef.current;

    if (Object.keys(scores).length > 0) {
      saveSessionExerciseScores(scores).catch(() => {});
    }
    logFunnelEvent('assessment_baseline_completed');

    // Identify the focus area before the async operations so it's available for nav params.
    const focusKey = deriveFocusKey(scores);
    const focus    = focusKey ? EXERCISE_FOCUS[focusKey] : null;

    // Both assessed exercises have real scores now — use them directly for tier placement.
    // PitchGlides and speech have no baseline data → default to tier 2 (safe mid-point).
    const augmentedScores = {
      phonation:   scores.phonation ?? null,
      loudness:    scores.loudness  ?? null,
      pitchGlides: 50,
      speech:      50,
    };

    // Write difficulty tiers and baseline_focus_key to Firestore.
    // Non-blocking — session completes even if this write fails.
    setTiersFromBaselineExercises(augmentedScores, focusKey).catch(() => {});

    try {
      const result  = await completeSession();
      onSessionComplete().catch(() => {}); // reset re-engagement notification clock
      const profile = await getUserProfile();

      // Pass raw scores through so BaselineResults can render a personalised
      // two-axis profile without needing another Firestore read.
      navigation.replace('StreakCelebration', {
        streakDays:    result.streak_days,
        userName:      profile?.name ?? '',
        fromBaseline:  true,
        focusKey:      focusKey,
        focusLabel:    focus?.label ?? null,
        focusTip:      focus?.tip   ?? null,
        phonationScore: scores.phonation ?? null,
        loudnessScore:  scores.loudness  ?? null,
      });
    } catch {
      // If completeSession fails, show the fallback screen.
      // The user loses their streak increment but is not left stuck.
      setIsDone(true);
    }
  }

  // Skip: forwards a null score with wasSkipped=true.
  function handleExerciseSkip() {
    handleExerciseComplete(null, true);
  }

  // Called by every exercise when the user finishes or skips.
  // score     (0–100 | null): null for skipped or non-scored exercises.
  // wasSkipped: suppresses the encouragement message and doesn't record a score.
  async function handleExerciseComplete(score = null, wasSkipped = false) {
    const { type } = SESSION_EXERCISES[exerciseIndex];

    // Only record scores for genuine completions of scored exercise types.
    // A skipped exercise leaves no entry — deriveFocusKey treats null as 0
    // so skips still influence the focus area selection.
    if (!wasSkipped && score !== null && Number.isFinite(score) && SCORED_TYPES.has(type)) {
      exerciseScoresRef.current[type] = Math.round(score);
    }

    const nextIndex   = exerciseIndex + 1;
    const isLast      = nextIndex >= SESSION_EXERCISES.length;
    // Show encouragement only for genuine completions of scored exercises.
    const doEncourage = !wasSkipped && SCORED_TYPES.has(type);

    animateProgressTo(nextIndex / SESSION_EXERCISES.length);

    if (doEncourage) {
      // Show a warm one-liner for 1.5 s, then advance or finish.
      setTransitionMsg(ENC_MSGS[exerciseIndex % ENC_MSGS.length]);
      setTransitioning(true);
      setTimeout(async () => {
        setTransitioning(false);
        if (isLast) {
          await finishBaseline();
        } else {
          setExerciseIndex(nextIndex);
        }
      }, 1500);
    } else {
      if (isLast) {
        await finishBaseline();
      } else {
        setExerciseIndex(nextIndex);
      }
    }
  }

  if (isDone) {
    return <SessionComplete navigation={navigation} />;
  }

  const { type } = SESSION_EXERCISES[exerciseIndex];
  const ExerciseComponent = EXERCISE_MAP[type];

  return (
    <View style={styles.root}>
      {/* ── Exercise area ─────────────────────────────────────────────────── */}
      <View style={styles.exerciseArea}>
        {transitioning ? (
          <View style={styles.transitionScreen}>
            <Text style={styles.transitionMsg}>{transitionMsg}</Text>
          </View>
        ) : (
          <ExerciseComponent
            onComplete={handleExerciseComplete}
            onSkip={handleExerciseSkip}
            onExit={() => navigation.goBack()}
            exerciseIndex={exerciseIndex}
            totalExercises={SESSION_EXERCISES.length}
            // Scored exercises run at BASELINE_TIER so results are discriminating.
            // Breathing and voiceSetup don't have a tier prop.
            {...(EXERCISE_KEYS.includes(type) ? { tier: BASELINE_TIER } : {})}
            // Breathing in the baseline gets a simplified 1-cycle intro instead
            // of the full 3-cycle routine with detailed instructions.
            {...(type === 'breathing' ? { baseline: true } : {})}
          />
        )}
      </View>

      {/* Orange session progress bar — always visible at the bottom */}
      <View style={styles.progressTrack}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              width: progressAnim.interpolate({
                inputRange:  [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  exerciseArea: {
    flex: 1,
    paddingBottom: PROGRESS_BAR_H,
  },

  transitionScreen: {
    flex: 1,
    backgroundColor: '#1C4047',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  transitionMsg: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3,
    lineHeight: 44,
  },

  progressTrack: {
    height: PROGRESS_BAR_H,
    backgroundColor: 'rgba(0,0,0,0.08)',
    width: '100%',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFA940',
    borderRadius: PROGRESS_BAR_H / 2,
  },
});
