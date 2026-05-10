/**
 * TailoredExercise
 *
 * Randomly selects one of the four core vocal-training exercises for this
 * session slot. The selection is stable across re-renders (picked once on
 * mount via useRef).
 */
import React, { useRef } from 'react';

import SustainedPhonationExercise from './SustainedPhonationExercise';
import DolphinVowelsExercise      from './DolphinVowelsExercise';
import LoudnessDrillsExercise     from './LoudnessDrillsExercise';

const EXERCISES = [
  SustainedPhonationExercise,
  DolphinVowelsExercise,
  LoudnessDrillsExercise,
];

export default function TailoredExercise({ onComplete, onExit }) {
  const Exercise = useRef(
    EXERCISES[Math.floor(Math.random() * EXERCISES.length)]
  ).current;

  return <Exercise onComplete={onComplete} onExit={onExit} />;
}
