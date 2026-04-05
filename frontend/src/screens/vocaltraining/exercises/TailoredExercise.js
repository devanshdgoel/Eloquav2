/**
 * TailoredExercise
 *
 * Randomly selects one of the four core vocal-training exercises for this
 * session slot. The selection is stable across re-renders (picked once on
 * mount via useRef).
 */
import React, { useRef } from 'react';

import SustainedPhonationExercise from './SustainedPhonationExercise';
import PitchGlidesExercise        from './PitchGlidesExercise';
import LoudnessDrillsExercise     from './LoudnessDrillsExercise';
import FunctionalSpeechExercise   from './FunctionalSpeechExercise';

const EXERCISES = [
  SustainedPhonationExercise,
  PitchGlidesExercise,
  LoudnessDrillsExercise,
  FunctionalSpeechExercise,
];

export default function TailoredExercise({ onComplete, onExit }) {
  const Exercise = useRef(
    EXERCISES[Math.floor(Math.random() * EXERCISES.length)]
  ).current;

  return <Exercise onComplete={onComplete} onExit={onExit} />;
}
