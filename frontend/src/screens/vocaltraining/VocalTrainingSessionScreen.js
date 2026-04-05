import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { completeSession } from '../../services/progressService';

import BreathingExercise       from './exercises/BreathingExercise';
import SustainedPhonation      from './exercises/SustainedPhonationExercise';
import PitchGlides             from './exercises/PitchGlidesExercise';
import LoudnessDrills          from './exercises/LoudnessDrillsExercise';
import TailoredExercise        from './exercises/TailoredExercise';
import FunctionalSpeech        from './exercises/FunctionalSpeechExercise';

const { width: W } = Dimensions.get('window');

// The fixed sequence of exercises that make up one training session.
// Breathing appears twice: at the start and as a mid-session reset (after
// every three consecutive exercises, per clinical recommendation).
const SESSION_EXERCISES = [
  { type: 'breathing',   label: 'Breathing' },
  { type: 'phonation',   label: 'Sustained Phonation' },
  { type: 'pitchGlides', label: 'Pitch Glides' },
  { type: 'loudness',    label: 'Loudness Drills' },
  { type: 'breathing',   label: 'Breathing' },
  { type: 'tailored',    label: 'Tailored Exercise' },
  { type: 'speech',      label: 'Functional Speech' },
];

const EXERCISE_MAP = {
  breathing:   BreathingExercise,
  phonation:   SustainedPhonation,
  pitchGlides: PitchGlides,
  loudness:    LoudnessDrills,
  tailored:    TailoredExercise,
  speech:      FunctionalSpeech,
};

const PROGRESS_BAR_H = 8;

// ── Session complete screen ───────────────────────────────────────────────────

function SessionComplete({ navigation, nodeIndex }) {
  return (
    <LinearGradient colors={['#E0ECDE', '#68B39F']} style={completeStyles.root}>
      <View style={completeStyles.content}>
        <View style={completeStyles.badge}>
          <Text style={completeStyles.badgeText}>{nodeIndex + 1}</Text>
        </View>
        <Text style={completeStyles.title}>Session Complete</Text>
        <Text style={completeStyles.subtitle}>
          Excellent work. Your streak has been updated.{'\n'}
          Keep going — consistency is everything.
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
  badge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFA940',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFA940',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 8,
  },
  badgeText: { fontSize: 48, fontWeight: '800', color: '#FFFFFF' },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1C4047',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#2D6974',
    textAlign: 'center',
    lineHeight: 24,
    letterSpacing: 0.2,
  },
  homeBtn: {
    marginTop: 12,
    backgroundColor: '#1C4047',
    borderRadius: 16,
    paddingHorizontal: 40,
    paddingVertical: 18,
  },
  homeBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

// ── Main session container ─────────────────────────────────────────────────────

export default function VocalTrainingSessionScreen({ navigation, route }) {
  const { nodeIndex = 0 } = route.params ?? {};

  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [isDone, setIsDone] = useState(false);

  // Animated progress bar width (0 → 1 represents 0% → 100%).
  // Starts at 1/7 because the first exercise is already showing.
  // useNativeDriver must be false because width is a layout property.
  const progressAnim = useRef(new Animated.Value(1 / SESSION_EXERCISES.length)).current;

  function animateProgressTo(fraction) {
    Animated.timing(progressAnim, {
      toValue: fraction,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }

  async function handleExerciseComplete() {
    const nextIndex = exerciseIndex + 1;
    animateProgressTo(nextIndex / SESSION_EXERCISES.length);

    if (nextIndex >= SESSION_EXERCISES.length) {
      // All exercises finished — award the streak point.
      try {
        await completeSession();
      } catch {
        // Fail silently; the UI still moves to the completion screen.
      }
      setIsDone(true);
    } else {
      setExerciseIndex(nextIndex);
    }
  }

  if (isDone) {
    return <SessionComplete navigation={navigation} nodeIndex={nodeIndex} />;
  }

  const { type } = SESSION_EXERCISES[exerciseIndex];
  const ExerciseComponent = EXERCISE_MAP[type];

  return (
    <View style={styles.root}>
      {/* The active exercise fills the screen above the progress bar. */}
      <View style={styles.exerciseArea}>
        <ExerciseComponent
          onComplete={handleExerciseComplete}
          onExit={() => navigation.goBack()}
          exerciseIndex={exerciseIndex}
          totalExercises={SESSION_EXERCISES.length}
        />
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
  exerciseArea: {
    flex: 1,
    // Leave room so content is never hidden behind the progress bar.
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
