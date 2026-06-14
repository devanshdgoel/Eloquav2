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

const { width: W } = Dimensions.get('window');

// The fixed sequence of exercises that make up one training session.
// Breathing appears twice: at the start and as a mid-session reset
// (after every three consecutive exercises, per clinical recommendation).
// Labels are user-facing — plain language, no clinical jargon.
const SESSION_EXERCISES = [
  { type: 'breathing',   label: 'Breathing' },
  { type: 'phonation',   label: 'Sustained Sound' },
  { type: 'pitchGlides', label: 'Pitch Glides' },
  { type: 'loudness',    label: 'Voice Power' },
  { type: 'midpoint',    label: 'Halfway There' },
  { type: 'breathing',   label: 'Breathing' },
  { type: 'tailored',    label: 'Your Exercise' },
  { type: 'speech',      label: 'Everyday Speech' },
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

// Show brief encouragement after skill exercises (not breathing / midpoint).
const SCORED_TYPES_SET = new Set(['phonation', 'loudness', 'pitchGlides', 'speech', 'tailored']);

// Rotating warm messages — cycle through them as the session progresses.
const ENC_MSGS = [
  "Nicely done.",
  "That's the one.",
  "Your voice carried that.",
  "Well done.",
  "Keep going.",
];

const PROGRESS_BAR_H = 8;

// ── Session complete screen (fallback — shown only if StreakCelebration fails)
function SessionComplete({ navigation }) {
  return (
    <LinearGradient colors={['#E0ECDE', '#68B39F']} style={completeStyles.root}>
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
    color: '#1C4047',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#2D6974',
    textAlign: 'center',
    lineHeight: 26,
    letterSpacing: 0.2,
  },
  homeBtn: {
    marginTop: 12,
    backgroundColor: '#1C4047',
    borderRadius: 16,
    paddingHorizontal: 40,
    paddingVertical: 20,   // ≥ 56px tall
  },
  homeBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

// ── Main session container ─────────────────────────────────────────────────────

export default function VocalTrainingSessionScreen({ navigation, route }) {
  const { nodeIndex = 0 } = route.params ?? {};

  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [isDone,        setIsDone]        = useState(false);
  const [tiers,         setTiers]         = useState(DEFAULT_TIERS);
  const [focusKey,      setFocusKey]      = useState(null);

  // After-exercise encouragement: brief full-screen message between exercises.
  const [transitioning,  setTransitioning]  = useState(false);
  const [transitionMsg,  setTransitionMsg]  = useState('');
  const encMsgIdxRef = useRef(0);

  // V2: collect per-exercise scores during the session for Firestore persistence.
  const exerciseScoresRef = useRef({});

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
            onPress: () => navigation.dispatch(e.data.action),
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
    try {
      const result  = await completeSession();
      onSessionComplete().catch(() => {}); // reset re-engagement clock (non-fatal)
      const profile = await getUserProfile();
      navigation.replace('StreakCelebration', {
        streakDays: result.streak_days,
        userName:   profile?.name ?? '',
      });
    } catch {
      setIsDone(true);
    }
  }

  // V2: exercises pass an optional score (0–100). Collect per exercise type,
  // then show a brief warm encouragement message before advancing.
  async function handleExerciseComplete(score = null) {
    const { type } = SESSION_EXERCISES[exerciseIndex];
    if (score !== null && Number.isFinite(score) && EXERCISE_KEYS.includes(type)) {
      exerciseScoresRef.current[type] = Math.round(score);
    }

    const nextIndex = exerciseIndex + 1;
    animateProgressTo(nextIndex / SESSION_EXERCISES.length);

    const isLast   = nextIndex >= SESSION_EXERCISES.length;
    const doEncourage = SCORED_TYPES_SET.has(type);

    if (doEncourage) {
      // Show warm message for 1.5 s, then advance or finish
      const msg = ENC_MSGS[encMsgIdxRef.current % ENC_MSGS.length];
      encMsgIdxRef.current += 1;
      setTransitionMsg(msg);
      setTransitioning(true);
      setTimeout(async () => {
        setTransitioning(false);
        try {
          if (isLast) {
            await finishSession();
          } else {
            setExerciseIndex(nextIndex);
          }
        } catch {
          Alert.alert(
            'Could not save session',
            'Check your connection and try again.',
            [{ text: 'Go home', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Home' }] }) }]
          );
        }
      }, 1500);
    } else {
      if (isLast) {
        await finishSession();
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

        {/* Brief encouragement screen between exercises */}
        {transitioning ? (
          <View style={styles.transitionScreen}>
            <Text style={styles.transitionMsg}>{transitionMsg}</Text>
          </View>
        ) : (
          <>
            <ExerciseComponent
              onComplete={handleExerciseComplete}
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
            {/*
              Dev skip — hold bottom-right corner 2 s to advance without scoring.
              Rendered last so it sits on top of exercise content without zIndex hacks.
            */}
            <TouchableOpacity
              style={styles.skipZone}
              onLongPress={handleExerciseComplete}
              delayLongPress={2000}
              activeOpacity={1}
            />
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

  // Between-exercise encouragement screen
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
