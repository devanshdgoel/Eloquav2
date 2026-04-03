import AsyncStorage from '@react-native-async-storage/async-storage';

// Note: JWT token storage is no longer needed — Firebase manages auth persistence.
// This file now only handles onboarding state and the local user profile collected
// during the onboarding flow.

const ONBOARDING_KEY = 'eloqua_onboarding_complete';
const USER_PROFILE_KEY = 'eloqua_user_profile';

// Onboarding completion flag
export async function setOnboardingComplete() {
  await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
}

export async function isOnboardingComplete() {
  const value = await AsyncStorage.getItem(ONBOARDING_KEY);
  return value === 'true';
}

// User profile (name, age, phone — collected during onboarding, stored locally)
export async function saveUserProfile(profile) {
  await AsyncStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
}

export async function getUserProfile() {
  const value = await AsyncStorage.getItem(USER_PROFILE_KEY);
  return value ? JSON.parse(value) : null;
}
