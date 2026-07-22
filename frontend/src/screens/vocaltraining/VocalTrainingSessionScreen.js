import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { completeSession } from '../../services/progressService';
import { onSessionComplete } from '../../services/notificationService';
import {
  nudgeTiersFromRecentScores,
  DEFAULT_TIERS,
  EXERCISE_KEYS,
  saveSessionExerciseScores,
} from '../../services/difficultyService';
import { getUserProfile } from '../../utils/storage';

import BreathingExercise  from './exercises/BreathingExercise';
import SustainedPhonation from './exercises/SustainedPhonationExercise';
import PitchGlides        from './exercises/PitchGlidesExercise';
import LoudnessDrills     from './exercises/LoudnessDrillsExercise';
import TailoredExercise   from './exercises/TailoredExercise';
import MidpointScreen     from './exercises/MidpointScreen';
import FunctionalSpeech   from './exercises/FunctionalSpeechExercise';
import ExerciseTitleCard  from './ExerciseTitleCard';
import { logSessionEvent, logScreenView } from '../../utils/analytics';
import { colors } from '../../theme';
import { useHapticFeedback } from '../../context/PrefsContext';
import { hapticSuccess } from '../../utils/haptics';

const { width: W } = Dimensions.get('window');

// The fixed sequence of exercises that make up one training session.
// Breathing appears twice: at the start and as a mid-session reset
// (after every three consecutive exercises, per clinical recommendation).
// Labels and desc are user-facing — plain language, no clinical jargon.
// desc is shown on the "Next up" card between exercises so users always
// know what they are about to do without relying on memory.
const SESSION_EXERCISES = [
  {
    type: 'breathing',
    label: 'Breathing',
    desc: 'Breathe in slowly through your nose, then breathe out through your mouth.',
  },
  {
    type: 'phonation',
    label: 'Sustained Sound',
    desc: "Take a deep breath, then hold a steady 'Ahhh' sound for as long as you can.",
  },
  {
    type: 'pitchGlides',
    label: 'Pitch Glides',
    desc: 'Slide your voice gently from a low note up to a high note, then back down again.',
  },
  {
    type: 'loudness',
    label: 'Voice Power',
    desc: 'Say each word or phrase out loud, clearly and with as much volume as you can.',
  },
  {
    type: 'midpoint',
    label: 'Halfway There',
    desc: 'Take a moment to rest. You are halfway through your session.',
  },
  {
    type: 'breathing',
    label: 'Breathing',
    desc: 'Breathe in slowly through your nose, then breathe out through your mouth.',
  },
  {
    type: 'tailored',
    label: 'Your Exercise',
    desc: 'Extra practice in the area that will help you most, chosen just for you.',
  },
  {
    type: 'speech',
    label: 'Everyday Speech',
    desc: 'Speak a short sentence naturally, as if you are talking to a friend.',
  },
];

const EXERCISE_MAP = {
  breathing:   BreathingExercise,
  phonation:   SustainedPhonation,
  pitchGlides: PitchGlides,
  loudness:    LoudnessDrills,
  midpoint:    MidpointScreen,
  tailored:    TailoredExercise,
  speech:      FunctionalSpeech,
};

const PROGRESS_BAR_H = 8;

// ── Session complete screen (fallback — shown only if StreakCelebration fails)
// Uses the session gradient to stay consistent with the training session context.
function SessionComplete({ navigation }) {
  return (
    <LinearGradient colors={colors.gradients.session} style={completeStyles.root}>
      <View style={completeStyles.content}>
        <Text style={completeStyles.title}>One session stronger.</Text>
        <Text style={completeStyles.subtitle}>
          Your streak has been updated.{'\n'}
          Every session adds up.
        </Text>
        <TouchableOpacity
          style={completeStyles.homeBtn}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Back to Home"
        >
          <Text style={completeStyles.homeBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const completeStyles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { alignItems: 'center', paddingHorizontal: 40, gap: 20 },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.70)',
    textAlign: 'center',
    lineHeight: 26,
    letterSpacing: 0.2,
  },
  homeBtn: {
    marginTop: 12,
    backgroundColor: '#FFA940',
    borderRadius: 28,
    paddingHorizontal: 40,
    paddingVertical: 20,
  },
  homeBtnText: {
    color: '#1A1A1A',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

// ── Main session container ─────────────────────────────────────────────────────

export default function VocalTrainingSessionScreen({ navigation, route }) {
  const { nodeIndex = 0 } = route.params ?? {};
  const hapticEnabled = useHapticFeedback();

  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [isDone,        setIsDone]        = useState(false);
  const [tiers,         setTiers]         = useState(DEFAULT_TIERS);
  const [focusKey,      setFocusKey]      = useState(null);

  // ExerciseTitleCard shown between every exercise.
  // nextIndex: which exercise comes next. null = no card showing.
  const [transition, setTransition] = useState(null);

  // V2: collect per-exercise scores during the session for Firestore persistence.
  const exerciseScoresRef = useRef({});

  const startedAtRef     = useRef(Date.now()); // ms when session mounted
  const exerciseIndexRef = useRef(0);           // mirrors exerciseIndex for the beforeRemove listener
  const tiersRef         = useRef(DEFAULT_TIERS); // mirrors tiers for the beforeRemove listener

  // Screen-time tracking.
  useEffect(() => {
    const logExit = logScreenView('VocalTrainingSession');
    return logExit;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load tiers and apply between-session nudges based on recent performance.
  // Also returns baseline_focus_key for TailoredExercise tie-breaking.
  useEffect(() => {
    nudgeTiersFromRecentScores()
      .then(result => {
        if (result) {
          setTiers(result.tiers);
          if (result.focusKey) setFocusKey(result.focusKey);
        }
      })
      .catch(() => {/* keep defaults */});
  }, []);

  // Keep refs in sync with state so the beforeRemove listener always reads the
  // latest values without needing to be re-registered on every state change.
  useEffect(() => { exerciseIndexRef.current = exerciseIndex; }, [exerciseIndex]);
  useEffect(() => { tiersRef.current = tiers; }, [tiers]);

  // Guard against accidental back navigation mid-session.
  // Only blocks user-initiated back (POP / GO_BACK actions).
  // Programmatic navigation (navigation.replace → REPLACE, navigation.reset → RESET)
  // is allowed through so the session-complete flow is never blocked.
  useEffect(() => {
    if (isDone) return;
    const unsub = navigation.addListener('beforeRemove', (e) => {
      const actionType = e.data.action.type;
      if (actionType === 'REPLACE' || actionType === 'RESET') return; // programmatic — allow
      e.preventDefault();
      Alert.alert(
        'Leave session?',
        "Your progress won't be saved if you leave now.",
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Leave',
            style: 'destructive',
            onPress: () => {
              logSessionEvent({
                started_at:                  new Date(startedAtRef.current).toISOString(),
                abandoned_at:                new Date().toISOString(),
                duration_s:                  Math.round((Date.now() - startedAtRef.current) / 1000),
                node_index:                  nodeIndex,
                completed:                   false,
                abandoned_at_exercise_index: exerciseIndexRef.current,
                abandoned_at_exercise_type:  SESSION_EXERCISES[exerciseIndexRef.current]?.type ?? null,
                exercise_scores_partial:     { ...exerciseScoresRef.current },
              });
              navigation.dispatch(e.data.action);
            },
          },
        ],
      );
    });
    return unsub;
  }, [navigation, isDone]);

  // Animated progress bar width (0 → 1 = 0% → 100%).
  // useNativeDriver false because width is a layout property.
  const progressAnim = useRef(new Animated.Value(0)).current;

  function animateProgressTo(fraction) {
    Animated.timing(progressAnim, {
      toValue:  fraction,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }

  // Navigate to StreakCelebration (or fall back to simple done screen).
  async function finishSession() {
    if (Object.keys(exerciseScoresRef.current).length > 0) {
      saveSessionExerciseScores(exerciseScoresRef.current).catch(() => {});
    }
    logSessionEvent({
      started_at:      new Date(startedAtRef.current).toISOString(),
      completed_at:    new Date().toISOString(),
      duration_s:      Math.round((Date.now() - startedAtRef.current) / 1000),
      node_index:      nodeIndex,
      completed:       true,
      exercise_scores: { ...exerciseScoresRef.current },
      tiers_at_start:  { ...tiersRef.current },
    });
    try {
      const result  = await completeSession();
      onSessionComplete().catch(() => {}); // reset re-engagement clock (non-fatal)
      const profile = await getUserProfile();
      // Strong success pulse to mark the full training session completion.
      hapticSuccess(hapticEnabled);
      navigation.replace('StreakCelebration', {
        streakDays: result.streak_days,
        userName:   profile?.name ?? '',
      });
    } catch {
      setIsDone(true);
    }
  }

  // Called when the user taps "Can't do now" / "Skip" inside an exercise.
  // Skips go through a separate path so the encouragement message is never shown
  // for an exercise the user did not actually complete.
  function handleExerciseSkip() {
    handleExerciseComplete(null, true);
  }

  // Called when an exercise finishes (or is skipped).
  // Shows a "Next up" card so the user always knows what comes next before it starts.
  // wasSkipped=true suppresses the encouragement line and auto-skips MidpointScreen
  // (a "halfway there!" rest card makes no sense immediately after a skip).
  async function handleExerciseComplete(score = null, wasSkipped = false) {
    const { type } = SESSION_EXERCISES[exerciseIndex];

    // Only persist scores for exercises that were genuinely completed.
    if (!wasSkipped && score !== null && Number.isFinite(score) && EXERCISE_KEYS.includes(type)) {
      exerciseScoresRef.current[type] = Math.round(score);
    }

    const nextIndex = exerciseIndex + 1;
    const isLast    = nextIndex >= SESSION_EXERCISES.length;

    // If the user just skipped and the next exercise is MidpointScreen, skip that too.
    const nextType         = !isLast ? SESSION_EXERCISES[nextIndex]?.type : null;
    const autoSkipMidpoint = wasSkipped && nextType === 'midpoint';
    const targetIndex      = autoSkipMidpoint ? nextIndex + 1 : nextIndex;
    const targetIsLast     = targetIndex >= SESSION_EXERCISES.length;

    // Animate progress bar to where we are actually landing.
    animateProgressTo(targetIndex / SESSION_EXERCISES.length);

    if (targetIsLast) {
      // Session finished — go straight to StreakCelebration, no card needed.
      try {
        await finishSession();
      } catch {
        Alert.alert(
          'Could not save session',
          'Check your connection and try again.',
          [{ text: 'Go home', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Home' }] }) }],
        );
      }
      return;
    }

    // Show the ExerciseTitleCard — user taps → to continue.
    setTransition({ nextIndex: targetIndex });
  }

  // Called when the user taps "I'm ready" on the "Next up" card.
  function handleTransitionReady() {
    const { nextIndex } = transition;
    setTransition(null);
    setExerciseIndex(nextIndex);
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

        {/* ExerciseTitleCard — shown between every exercise.
            Matches the reference designs: large left-aligned title, exercise
            illustration, ghost → button. The card waits for a tap so users
            who need extra time are never rushed. */}
        {transition ? (
          <ExerciseTitleCard
            exercise={SESSION_EXERCISES[transition.nextIndex]}
            onReady={handleTransitionReady}
            onExit={() => navigation.goBack()}
          />
        ) : (
          <>
            <ExerciseComponent
              onComplete={handleExerciseComplete}
              onSkip={handleExerciseSkip}
              onExit={() => navigation.goBack()}
              exerciseIndex={exerciseIndex}
              totalExercises={SESSION_EXERCISES.length}
              {...(type === 'tailored'
                ? { tiers, focusKey }
                : EXERCISE_KEYS.includes(type)
                  ? { tier: tiers[type] ?? 1 }
                  : {}
              )}
            />
            {__DEV__ && (
              <TouchableOpacity
                style={styles.skipZone}
                onLongPress={handleExerciseComplete}
                delayLongPress={2000}
                activeOpacity={1}
              />
            )}
          </>
        )}
      </View>

      {/* Orange session progress bar — always visible at the very bottom. */}
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

  skipZone: {
    position: 'absolute',
    bottom:   0,
    right:    0,
    width:    100,
    height:   100,
    opacity:  0,
  },

  exerciseArea: {
    flex: 1,
    paddingBottom: PROGRESS_BAR_H,
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
