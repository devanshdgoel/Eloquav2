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
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SpeakerButton from '../../components/SpeakerButton';
import { tryCompleteSession } from '../../services/progressService';
import { auth } from '../../config/firebase';
import { onSessionComplete, requestPermission as requestNotificationPermission } from '../../services/notificationService';
import {
  EXERCISE_KEYS,
  saveSessionExerciseScores,
  setTiersFromBaselineExercises,
  computeProgressPlan,
  storeProgressPlan,
} from '../../services/difficultyService';
import { getUserProfile } from '../../utils/storage';
import { logFunnelEvent, logScreenView } from '../../utils/analytics';
import { colors } from '../../theme';

import BreathingExercise   from './exercises/BreathingExercise';
import SustainedPhonation  from './exercises/SustainedPhonationExercise';
import LoudnessDrills      from './exercises/LoudnessDrillsExercise';
import PitchGlides         from './exercises/PitchGlidesExercise';
import ReadingMiniExercise from './exercises/ReadingMiniExercise';
import VoiceSetupExercise  from './exercises/VoiceSetupExercise';

// AsyncStorage key shared with VocalTrainingSessionScreen — whichever session
// runs first sets this flag so notification permission is only ever requested once.
const NOTIF_ASKED_KEY = '@eloqua_notif_asked';

// Request notification permission once across all sessions.
// Silently swallows all errors — a failed prompt must never interrupt navigation.
async function maybeRequestNotificationPermission() {
  const already = await AsyncStorage.getItem(NOTIF_ASKED_KEY);
  if (already) return;
  await AsyncStorage.setItem(NOTIF_ASKED_KEY, '1');
  await requestNotificationPermission().catch(() => {});
}

// All scored exercises run at this tier during the baseline session.
// Tier 2 is challenging enough to produce discriminating scores without
// being overwhelming for someone doing this for the first time.
const BASELINE_TIER = 2;

const PROGRESS_BAR_H = 8;

// Four scored exercises give a complete three-axis clinical baseline:
//   Phonation + Loudness → Voice Power (respiratory-phonatory efficiency + vocal intensity)
//   PitchGlide           → Pitch Variety (expression score via backend offline analysis)
//   Reading              → Speech Rhythm (fluency score via backend offline analysis)
//
// PitchGlides game (full dolphin component) is now used here — gives users the same
// visual experience as training sessions. ReadingMiniExercise uses simple expo-av recording
// for reliable cross-platform support without a WebView mic dependency.
//
// Breathing (1 cycle) is a warm-up only. VoiceSetup records voice clone samples.
const SESSION_EXERCISES = [
  { type: 'breathing',  label: 'Breathing' },
  { type: 'phonation',  label: 'Sustained Sound' },
  { type: 'loudness',   label: 'Voice Power' },
  { type: 'pitchGlide', label: 'Pitch Range' },
  { type: 'reading',    label: 'Reading Aloud' },
  { type: 'voiceSetup', label: 'Voice Profile' },
];

const EXERCISE_MAP = {
  breathing:  BreathingExercise,
  phonation:  SustainedPhonation,
  loudness:   LoudnessDrills,
  // PitchGlides game replaces the old record-and-send approach — gives users the
  // same dolphin visual experience as training sessions and avoids a backend round-trip.
  // The hoop-completion score (0–100) maps to the expression axis in BaselineResults.
  pitchGlide: PitchGlides,
  reading:    ReadingMiniExercise,
  voiceSetup: VoiceSetupExercise,
};

// Breathing and voiceSetup are not scored.
// Phonation and loudness → voice_power. pitchGlide → expression. reading → fluency.
const SCORED_TYPES = new Set(['phonation', 'loudness', 'pitchGlide', 'reading']);

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
// Uses the session gradient to match the baseline session context.
// showCreateAccount: guest users — honest copy + CTA to sign up rather than
// false claims that a training plan or streak was saved.
function SessionComplete({ navigation, showCreateAccount = false }) {
  return (
    <LinearGradient colors={colors.gradients.session} style={fc.root}>
      <View style={fc.content}>
        <Text style={fc.title}>
          {showCreateAccount ? 'Session complete.' : 'Your profile is ready.'}
        </Text>
        <Text style={fc.sub}>
          {showCreateAccount
            ? 'Nice work! Create a free account to save your progress and streaks.'
            : 'Your training plan is set.\nEvery session from here sharpens your voice.'}
        </Text>
        {showCreateAccount && (
          <TouchableOpacity
            style={fc.btn}
            onPress={() => navigation.replace('SignUp')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Create account"
          >
            <Text style={fc.btnText}>Create account</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={showCreateAccount ? fc.ghostBtn : fc.btn}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={showCreateAccount ? 'Back to Home' : 'Start my journey'}
        >
          <Text style={showCreateAccount ? fc.ghostBtnText : fc.btnText}>
            {showCreateAccount ? 'Back to Home' : 'Start My Journey  →'}
          </Text>
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
  ghostBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 14 },
  ghostBtnText: { color: 'rgba(255,255,255,0.65)', fontSize: 16, fontWeight: '600', textDecorationLine: 'underline' },
});

// ── Main container ─────────────────────────────────────────────────────────────
// Safety text read aloud by SpeakerButton on the pre-session card.
const SAFETY_TEXT =
  'Safety note. These exercises should feel effortful, but never painful. ' +
  'If your throat hurts or you feel strain beyond normal effort, stop and rest. ' +
  'If you have an existing voice or throat condition, check with your care team first.';

export default function BaselineSessionScreen({ navigation }) {
  const [exerciseIndex,  setExerciseIndex]  = useState(0);
  const [isDone,         setIsDone]         = useState(false);
  // isGuestSession: set when user has no Firebase account — show honest copy + sign-up CTA.
  const [isGuestSession, setIsGuestSession] = useState(false);
  // Safety card is shown once per session, before the first exercise.
  // Dismissed by tapping the CTA — does not count as an exercise index.
  const [showSafety,    setShowSafety]    = useState(true);

  // Brief warm message shown between scored exercises (same as VocalTrainingSession).
  const [transitioning, setTransitioning] = useState(false);
  const [transitionMsg, setTransitionMsg] = useState('');

  // Accumulate per-exercise scores across the session.
  const exerciseScoresRef = useRef({});
  const exerciseIndexRef  = useRef(0); // mirrors exerciseIndex for the beforeRemove listener

  // readingScorePromiseRef holds a Promise that resolves when ReadingMiniExercise
  // delivers its score. finishBaseline() awaits it so the score is always captured
  // even when the user advances quickly through Voice Setup before analysis finishes.
  const readingScorePromiseRef  = useRef(null);
  const readingScoreResolveRef  = useRef(null);

  // Screen-time tracking and funnel event on mount.
  useEffect(() => {
    const logExit = logScreenView('BaselineSession');
    logFunnelEvent('assessment_baseline_started');
    return logExit;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep ref in sync so the beforeRemove listener reads the latest index without
  // being re-registered on every state change.
  useEffect(() => { exerciseIndexRef.current = exerciseIndex; }, [exerciseIndex]);

  // Create the reading score promise once on mount — immediately usable by finishBaseline.
  // useRef does not accept a lazy initializer, so we use a one-time useEffect instead.
  useEffect(() => {
    readingScorePromiseRef.current = new Promise(resolve => {
      readingScoreResolveRef.current = resolve;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Wait for the reading analysis score before reading exerciseScoresRef,
    // because ReadingMiniExercise advances immediately and sends its score later.
    // Race against an 8-second timeout so finishBaseline never hangs indefinitely.
    if (readingScorePromiseRef.current) {
      const timeout = new Promise(resolve => setTimeout(resolve, 8000));
      await Promise.race([readingScorePromiseRef.current, timeout]);
    }

    const scores = exerciseScoresRef.current;

    if (Object.keys(scores).length > 0) {
      saveSessionExerciseScores(scores).catch(() => {});
    }
    logFunnelEvent('assessment_baseline_completed');

    // Identify the focus area before the async operations so it's available for nav params.
    const focusKey = deriveFocusKey(scores);
    const focus    = focusKey ? EXERCISE_FOCUS[focusKey] : null;

    // Use real scores where available; fall back to tier-2 midpoint (50) only if a
    // task was skipped or the backend returned null (e.g. network failure / cold start).
    const pitchDefaulted  = scores.pitchGlide == null;
    const speechDefaulted = scores.reading    == null;

    const augmentedScores = {
      phonation:   scores.phonation   ?? null,
      loudness:    scores.loudness    ?? null,
      pitchGlides: scores.pitchGlide  ?? 50,
      speech:      scores.reading     ?? 50,
    };

    // Write difficulty tiers and baseline_focus_key to Firestore.
    // Non-blocking — session completes even if this write fails.
    // Pass defaulted=true when any score was substituted so Firestore records
    // which users had incomplete baselines (useful for pilot follow-up).
    setTiersFromBaselineExercises(
      augmentedScores,
      focusKey,
      { defaulted: pitchDefaulted || speechDefaulted },
    ).catch(() => {});

    // Build and persist the progress plan so CheckinScreen's "VS YOUR PLAN" comparison
    // has data to work with. This was previously only called from the old AssessmentScreen
    // (now replaced by BaselineSession), leaving progress_plan permanently unset.
    // computeProgressPlan expects { voice_power, expression, fluency } keys.
    // We derive voice_power from the phonation score; expression from pitchGlide;
    // fluency from reading. MPT is not captured in the baseline session so we pass null
    // and let computeProgressPlan use its internal 5 s fallback.
    const planBaselineScores = {
      voice_power: augmentedScores.phonation != null ? Math.round((augmentedScores.phonation + (augmentedScores.loudness ?? augmentedScores.phonation)) / 2) : null,
      expression:  scores.pitchGlide ?? null,
      fluency:     scores.reading    ?? null,
    };
    const plan = computeProgressPlan(planBaselineScores, null);
    // Fire-and-forget — a failed write should never delay navigation or break the session.
    storeProgressPlan(plan).catch(() => {});

    // Guest users (no Firebase uid) cannot save progress — tryCompleteSession would throw
    // and the fallback would falsely claim a training plan was set. Show honest guest copy.
    if (!auth.currentUser) {
      setIsGuestSession(true);
      setIsDone(true);
      return;
    }

    try {
      const result  = await tryCompleteSession();
      onSessionComplete().catch(() => {}); // reset re-engagement notification clock

      // Request notification permission after the first completed session.
      // The flag ensures this only fires once — VocalTrainingSessionScreen uses the
      // same key so whichever session runs first claims the slot.
      maybeRequestNotificationPermission().catch(() => {});
      const profile = await getUserProfile();

      // Both phonation and loudness map to the voice_power dimension in the 3-axis
      // system (difficultyService: phonation+loudness → voice_power). Average them
      // for the display score, or use whichever is available.
      const phon = scores.phonation != null ? scores.phonation : null;
      const loud = scores.loudness  != null ? scores.loudness  : null;
      let voicePowerScore = null;
      if (phon != null && loud != null) {
        voicePowerScore = Math.round((phon + loud) / 2);
      } else {
        voicePowerScore = phon ?? loud;
      }

      // Map exercise focusKey to the 3-axis key expected by BaselineResultsScreen.
      const mappedFocusKey = (focusKey === 'phonation' || focusKey === 'loudness')
        ? 'voice_power'
        : focusKey;

      // Pass real expression + fluency scores now that the baseline includes
      // PitchGlideMiniExercise and ReadingMiniExercise. Both will be null only
      // if those tasks were skipped or the backend failed — BaselineResultsScreen
      // handles null gracefully by showing "Not assessed".
      const firstName = profile?.name ? profile.name.trim().split(' ')[0] : '';
      navigation.replace('StreakCelebration', {
        streakDays:     result.streak_days,
        userName:       firstName,
        fromBaseline:   true,
        focusKey:       mappedFocusKey,
        focusLabel:     focus?.label ?? null,
        focusTip:       focus?.tip   ?? null,
        voicePowerScore,
        expressionScore: scores.pitchGlide ?? null,
        fluencyScore:    scores.reading    ?? null,
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
    return <SessionComplete navigation={navigation} showCreateAccount={isGuestSession} />;
  }

  // Safety card: shown before the first exercise on every baseline session.
  // One-time per-session gate — once dismissed, exerciseIndex proceeds normally.
  if (showSafety) {
    return (
      <LinearGradient colors={colors.gradients.session} style={sf.root}>
        <StatusBar barStyle="light-content" />
        <View style={sf.content}>
          <Text style={sf.eyebrow}>BEFORE YOU BEGIN</Text>
          <Text style={sf.title}>A quick note on effort</Text>
          <View style={sf.card}>
            <Text style={sf.cardText}>
              These exercises should feel effortful, but never painful. If your
              throat hurts or you feel strain beyond normal effort, stop and rest.
            </Text>
            <Text style={sf.cardText}>
              If you have an existing voice or throat condition, check with your
              care team first.
            </Text>
          </View>
          <SpeakerButton text={SAFETY_TEXT} size={44} />
        </View>
        <TouchableOpacity
          style={sf.btn}
          onPress={() => setShowSafety(false)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="I understand, start my assessment"
        >
          <Text style={sf.btnText}>I understand — let's begin  →</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  const { type } = SESSION_EXERCISES[exerciseIndex];
  const ExerciseComponent = EXERCISE_MAP[type];

  return (
    <View style={styles.root}>
      {/* ── Exercise area ─────────────────────────────────────────────────── */}
      <View style={styles.exerciseArea}>
        {/* Between-exercise encouragement — LinearGradient keeps background consistent
            with the session gradient used by the exercise components themselves. */}
        {transitioning ? (
          <LinearGradient colors={colors.gradients.session} style={styles.transitionScreen}>
            <Text style={styles.transitionMsg}>{transitionMsg}</Text>
          </LinearGradient>
        ) : (
          <ExerciseComponent
            onComplete={handleExerciseComplete}
            onSkip={handleExerciseSkip}
            onExit={() => navigation.goBack()}
            exerciseIndex={exerciseIndex}
            totalExercises={SESSION_EXERCISES.length}
            // Scored exercises run at BASELINE_TIER so results are discriminating.
            // Breathing and voiceSetup don't have a tier prop.
            // 'pitchGlide' is the baseline key but EXERCISE_KEYS uses 'pitchGlides'
            // (training session key) — include pitchGlide explicitly so the dolphin
            // game receives the correct tier instead of defaulting to 1.
            {...((EXERCISE_KEYS.includes(type) || type === 'pitchGlide') ? { tier: BASELINE_TIER } : {})}
            // In the baseline, if pitch analysis fails or has no URI, default to 50
            // (tier-2 midpoint) rather than 100. A new user should not be placed at
            // tier 3 solely because the backend call timed out on a cold start.
            {...(type === 'pitchGlide' ? { analysisFallbackScore: 50 } : {})}
            // Breathing in the baseline gets a simplified 1-cycle intro instead
            // of the full 3-cycle routine with detailed instructions.
            {...(type === 'breathing' ? { baseline: true } : {})}
            // ReadingMiniExercise advances immediately after recording stops.
            // Background analysis finishes later and calls onScoreReady.
            // We also resolve readingScorePromiseRef so finishBaseline() unblocks
            // (it awaits the promise, capped at 8 s, before reading exerciseScoresRef).
            {...(type === 'reading' ? {
              // Create the analysis promise lazily when the reading exercise first mounts.
              // If finishBaseline() runs before onScoreReady fires, it awaits this promise
              // (capped at 8 s) so the score is captured before writing difficulty tiers.
              onScoreReady: (score) => {
                exerciseScoresRef.current['reading'] = Math.round(score);
                // Resolve the waiting promise so finishBaseline can proceed with the real score.
                readingScoreResolveRef.current?.(score);
              },
            } : {})}
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

// Safety pre-card styles — single use per baseline session
const sf = StyleSheet.create({
  root:    { flex: 1, justifyContent: 'space-between' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 20 },
  eyebrow: {
    color: '#FFA940', fontSize: 14, fontWeight: '800',
    letterSpacing: 2.5, textAlign: 'center',
  },
  title: {
    color: '#FFFFFF', fontSize: 32, fontWeight: '800',
    lineHeight: 40, textAlign: 'center',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 20, gap: 12,
  },
  cardText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 17, lineHeight: 26, fontWeight: '400',
  },
  btn: {
    margin: 28, backgroundColor: '#FFA940',
    borderRadius: 28, paddingVertical: 20,
    alignItems: 'center',
    shadowColor: '#FFA940', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  btnText: { color: '#1A1A1A', fontSize: 18, fontWeight: '800', letterSpacing: 0.3 },
});

const styles = StyleSheet.create({
  // Dark base colour fills the safe-area inset below the progress bar on iPhone.
  // Without this, iOS renders the default white background below the progress bar.
  // Using the darkest gradient stop (#0A1618) so it visually matches the exercise gradient.
  root: { flex: 1, backgroundColor: '#0A1618' },

  exerciseArea: {
    flex: 1,
    paddingBottom: PROGRESS_BAR_H,
  },

  // Background handled by LinearGradient — no flat colour needed here.
  transitionScreen: {
    flex: 1,
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
