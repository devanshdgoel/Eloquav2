/**
 * TailoredExercise
 *
 * Adaptively selects the exercise the user needs most — the one with the
 * lowest difficulty tier (weakest area). When multiple exercises tie for
 * the lowest tier, the tie is broken in favour of the user's baseline
 * focus area (the voice dimension that was weakest at their first assessment).
 *
 * Receives the full `tiers` object and `focusKey` from VocalTrainingSessionScreen
 * so it can make an informed choice without any extra Firestore reads.
 *
 * focusKey is one of: 'phonation' | 'pitchGlides' | 'speech' | null.
 * Null means no baseline has been completed yet; falls back to phonation.
 */
import React, { useRef } from 'react';

import SustainedPhonationExercise from './SustainedPhonationExercise';
import LoudnessDrillsExercise     from './LoudnessDrillsExercise';
import PitchGlidesExercise        from './PitchGlidesExercise';
import FunctionalSpeechExercise   from './FunctionalSpeechExercise';

const EXERCISE_KEY_MAP = {
  phonation:   SustainedPhonationExercise,
  loudness:    LoudnessDrillsExercise,
  pitchGlides: PitchGlidesExercise,
  speech:      FunctionalSpeechExercise,
};

/**
 * Find the exercise key with the lowest tier.
 *
 * Tie-breaking order:
 *   1. The key matching focusKey (user's weakest baseline dimension)
 *   2. 'phonation' (most fundamental PD exercise) as the final fallback
 *
 * @param {{ phonation, loudness, pitchGlides, speech }} tiers
 * @param {string|null} focusKey
 * @returns {string} one of the EXERCISE_KEY_MAP keys
 */
function findWeakestKey(tiers, focusKey) {
  const keys    = Object.keys(EXERCISE_KEY_MAP);
  const minTier = Math.min(...keys.map(k => tiers[k] ?? 1));

  // All exercises at the minimum tier
  const tied = keys.filter(k => (tiers[k] ?? 1) === minTier);

  // No tie — single winner
  if (tied.length === 1) return tied[0];

  // Tie: prefer the user's baseline focus area if it's among the tied exercises
  if (focusKey && tied.includes(focusKey)) return focusKey;

  // Final fallback: phonation (most clinically fundamental for PD)
  return tied.includes('phonation') ? 'phonation' : tied[0];
}

export default function TailoredExercise({ onComplete, onExit, tiers = {}, focusKey = null }) {
  // Selection is stable across re-renders — picked once on mount.
  const selectedKey = useRef(findWeakestKey(tiers, focusKey)).current;
  const Exercise    = EXERCISE_KEY_MAP[selectedKey];
  const tier        = tiers[selectedKey] ?? 1;

  return <Exercise onComplete={onComplete} onExit={onExit} tier={tier} />;
}
