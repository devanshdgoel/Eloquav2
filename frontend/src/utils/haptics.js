/**
 * Thin wrappers around expo-haptics that respect the user's haptic preference.
 *
 * All functions are silent no-ops when hapticEnabled is false (user has turned
 * haptics off in Settings → Accessibility) or when the platform doesn't support
 * haptics (expo-haptics silently swallows errors on web and some Android devices).
 *
 * Usage:
 *   import { hapticLight, hapticSuccess } from '../utils/haptics';
 *   const hapticEnabled = useHapticFeedback();  // from PrefsContext
 *   hapticSuccess(hapticEnabled);
 */
import * as Haptics from 'expo-haptics';

// Light tap — used for minor UI interactions (checkbox toggle, option select).
export function hapticLight(hapticEnabled) {
  if (!hapticEnabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

// Medium thud — used for mid-exercise events (jellyfish whack, correct answer).
export function hapticMedium(hapticEnabled) {
  if (!hapticEnabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

// Success notification pulse — used on exercise and session completion.
export function hapticSuccess(hapticEnabled) {
  if (!hapticEnabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
