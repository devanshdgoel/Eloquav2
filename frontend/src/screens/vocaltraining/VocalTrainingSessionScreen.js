import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tryCompleteSession } from '../../services/progressService';
import { auth } from '../../config/firebase';
import { onSessionComplete, requestPermission as requestNotificationPermission } from '../../services/notificationService';
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
import TailoredExercise, { findWeakestKey } from './exercises/TailoredExercise';
import MidpointScreen     from './exercises/MidpointScreen';
import FunctionalSpeech   from './exercises/FunctionalSpeechExercise';
import ExerciseTitleCard  from './ExerciseTitleCard';
import ConfirmSheet        from '../../components/ConfirmSheet';
import { logSessionEvent, logScreenView } from '../../utils/analytics';
import { colors } from '../../theme';
import { useHapticFeedback } from '../../context/PrefsContext';
import { hapticSuccess } from '../../utils/haptics';

const { width: W } = Dimensions.get('window');

// AsyncStorage key used to gate the one-time notification permission request.
// Both VocalTrainingSession and BaselineSession read this flag before prompting.
const NOTIF_ASKED_KEY = '@eloqua_notif_asked';

// Request notification permission at most once across all sessions.
// Silently swallows all errors — a failed prompt must never interrupt navigation.
async function maybeRequestNotificationPermission() {
  const already = await AsyncStorage.getItem(NOTIF_ASKED_KEY);
  if (already) return;
  await AsyncStorage.setItem(NOTIF_ASKED_KEY, '1');
  await requestNotificationPermission().catch(() => {});
}

// PitchGlidesExercise uses a WebView for real-time pitch detection, which does not
// function correctly on Android due to platform audio routing constraints.
// The exercise is excluded from Android sessions entirely.
const IS_ANDROID = Platform.OS === 'android';

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
  // Pitch Glides is excluded on Android — WebView mic access does not work on that platform.
  ...(!IS_ANDROID ? [{
    type: 'pitchGlides',
    label: 'Pitch Glides',
    desc: 'Slide your voice gently from a low note up to a high note, then back down again.',
  }] : []),
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
// title and subtitle are optional — defaults used for error-fallback (real sessions);
// replay sessions pass different copy so the user knows no streak was changed.
// showCreateAccount: show a "Create account" button for unauthenticated (guest) completions.
function SessionComplete({ navigation, title, subtitle, showCreateAccount = false }) {
  return (
    <LinearGradient colors={colors.gradients.session} style={completeStyles.root}>
      <View style={completeStyles.content}>
        <Text style={completeStyles.title}>{title ?? 'One session stronger.'}</Text>
        <Text style={completeStyles.subtitle}>
          {subtitle ?? 'Your streak has been updated.\nEvery session adds up.'}
        </Text>
        {showCreateAccount && (
          // For guest users: invite them to sign up so future sessions are saved.
          <TouchableOpacity
            style={completeStyles.homeBtn}
            onPress={() => navigation.replace('SignUp')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Create account"
          >
            <Text style={completeStyles.homeBtnText}>Create account</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={showCreateAccount ? completeStyles.ghostBtn : completeStyles.homeBtn}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Back to Home"
        >
          <Text style={showCreateAccount ? completeStyles.ghostBtnText : completeStyles.homeBtnText}>
            Back to Home
          </Text>
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
  // Ghost variant — used for "Back to Home" when a primary CTA is also shown.
  ghostBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  ghostBtnText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 16,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});

// ── Main session container ─────────────────────────────────────────────────────

export default function VocalTrainingSessionScreen({ navigation, route }) {
  const { nodeIndex = 0, isReplay = false } = route.params ?? {};
  const hapticEnabled = useHapticFeedback();

  const [exerciseIndex,   setExerciseIndex]   = useState(0);
  const [isDone,          setIsDone]          = useState(false);
  // isGuestSession: set when session completes but no Firebase user is available.
  // Shows honest copy + Create Account CTA instead of falsely claiming streak was saved.
  const [isGuestSession,  setIsGuestSession]  = useState(false);
  const [tiers,           setTiers]           = useState(DEFAULT_TIERS);
  const [focusKey,        setFocusKey]        = useState(null);

  // ExerciseTitleCard shown between every exercise.
  // nextIndex: which exercise comes next. null = no card showing.
  const [transition, setTransition] = useState(null);

  // confirmSheet: config object for ConfirmSheet; null = hidden.
  // Replaces Alert.alert so we can style the leave-guard consistently.
  const [confirmSheet, setConfirmSheet] = useState(null);

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

      // Capture the pending navigation action so we can dispatch it if the
      // user confirms they want to leave. We use ConfirmSheet instead of
      // Alert.alert for consistent styling across iOS and Android.
      const pendingAction = e.data.action;
      setConfirmSheet({
        title: 'Leave session?',
        body:  "Your progress won't be saved if you leave now.",
        actions: [
          {
            label: 'Stay',
            onPress: () => setConfirmSheet(null),
          },
          {
            label: 'Leave',
            destructive: true,
            onPress: () => {
              setConfirmSheet(null);
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
              navigation.dispatch(pendingAction);
            },
          },
        ],
      });
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
    // Always save exercise scores — replay sessions still feed adaptive difficulty.
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

    // Replay sessions (user tapped a completed roadmap node) must NOT call
    // tryCompleteSession() — that would increment current_node and update the streak,
    // silently advancing the roadmap past the user's real position.
    if (isReplay) {
      hapticSuccess(hapticEnabled);
      setIsDone(true);
      return;
    }

    // Guest users (anonymous auth unavailable) have no Firebase uid — tryCompleteSession
    // would throw and the fallback screen would claim "Your streak has been updated"
    // which is a lie. Show honest guest copy with a Create Account CTA instead.
    if (!auth.currentUser) {
      hapticSuccess(hapticEnabled);
      setIsGuestSession(true);
      setIsDone(true);
      return;
    }

    try {
      // tryCompleteSession handles offline — queues to AsyncStorage if Firestore
      // is unreachable and returns an optimistic result so the celebration screen
      // always shows. The queued session is flushed on next reconnect.
      const result  = await tryCompleteSession();
      onSessionComplete().catch(() => {}); // reset re-engagement clock (non-fatal)

      // Ask for notification permission after the user's first completed session —
      // at this point they've seen the app's value, so accept rates are much higher
      // than cold-onboarding. The flag prevents asking more than once across sessions.
      // Non-blocking: failures and re-shows are both silently swallowed.
      maybeRequestNotificationPermission().catch(() => {});

      const profile = await getUserProfile();
      // Extract first name only — users who entered "John Smith" should see "John".
      const firstName = profile?.name ? profile.name.trim().split(' ')[0] : '';
      // Strong success pulse to mark the full training session completion.
      hapticSuccess(hapticEnabled);
      navigation.replace('StreakCelebration', {
        streakDays: result.streak_days,
        userName:   firstName,
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
    if (!wasSkipped && score !== null && Number.isFinite(score)) {
      if (type === 'tailored') {
        // TailoredExercise wraps whichever real exercise was selected (phonation,
        // pitchGlides, or speech).  Record the score under the actual exercise key
        // so nudgeTiersFromRecentScores can update the correct tier.  If the same
        // exercise key already has a score this session (e.g. phonation also ran
        // standalone), keep the higher value — don't overwrite a better effort.
        const realKey = findWeakestKey(tiers, focusKey);
        if (EXERCISE_KEYS.includes(realKey)) {
          const existing = exerciseScoresRef.current[realKey];
          exerciseScoresRef.current[realKey] = existing != null
            ? Math.max(existing, Math.round(score))
            : Math.round(score);
        }
      } else if (EXERCISE_KEYS.includes(type)) {
        exerciseScoresRef.current[type] = Math.round(score);
      }
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
        // Show a styled ConfirmSheet instead of a bare Alert.
        setConfirmSheet({
          title: 'Could not save session',
          body:  'Check your connection and try again.',
          actions: [
            {
              label: 'Go home',
              destructive: true,
              onPress: () => {
                setConfirmSheet(null);
                navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
              },
            },
          ],
        });
      }
      return;
    }

    const upcomingType = SESSION_EXERCISES[targetIndex]?.type;

    // MidpointScreen is itself a "halfway" announcement card — showing an
    // ExerciseTitleCard before it creates an identical duplicate.  Skip straight in.
    if (upcomingType === 'midpoint') {
      setExerciseIndex(targetIndex);
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

  /**
   * Returns the exercise descriptor to pass to ExerciseTitleCard.
   * For 'tailored', resolves the actual selected exercise so the card shows
   * the real exercise name and illustration instead of the generic "Your Exercise".
   * The tiers/focusKey are already loaded in state by the time any transition fires.
   */
  function resolveCardExercise(exercise) {
    if (exercise.type !== 'tailored') return exercise;
    const selectedKey = findWeakestKey(tiers, focusKey);
    // Find the SESSION_EXERCISES entry for the selected type to get its label/desc
    const real = SESSION_EXERCISES.find(e => e.type === selectedKey);
    return {
      // Use the real exercise's type so ExerciseTitleCard picks the right illustration
      type:  selectedKey,
      label: real?.label ?? exercise.label,
      desc:  real?.desc  ?? exercise.desc,
    };
  }

  if (isDone) {
    // Guest users: no account = no saved progress. Show honest copy + Create Account CTA.
    if (isGuestSession) {
      return <SessionComplete
        navigation={navigation}
        title="Session complete."
        subtitle={"Nice work! Create a free account to save your progress and streaks."}
        showCreateAccount
      />;
    }
    // isReplay sessions use different copy — the real session text says "streak updated"
    // which would be misleading for a replay where no progress was incremented.
    return isReplay
      ? <SessionComplete navigation={navigation} title="Practice session complete." subtitle={'Extra practice like this all adds up.\nYour roadmap stays where it is.'} />
      : <SessionComplete navigation={navigation} />;
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
            exercise={resolveCardExercise(SESSION_EXERCISES[transition.nextIndex])}
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
                : type === 'midpoint'
                  // Pass the live progress counts so MidpointScreen's pips
                  // reflect the actual session state rather than hard-coded 4/8.
                  ? { doneCount: exerciseIndex, totalCount: SESSION_EXERCISES.length }
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

      {/* ConfirmSheet for leave-guard and save-error dialogs.
          Replaces bare Alert.alert calls so styling is consistent. */}
      <ConfirmSheet
        config={confirmSheet}
        onDismiss={() => setConfirmSheet(null)}
      />

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
  root: { flex: 1, backgroundColor: '#1C4047' },

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
