import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'eloqua_jwt';
const ONBOARDING_KEY = 'eloqua_onboarding_complete';
const USER_PROFILE_KEY = 'eloqua_user_profile';

// Secure token storage (encrypted)
export async function saveToken(token) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken() {
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

export async function removeToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// Onboarding completion flag
export async function setOnboardingComplete() {
  await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
}

export async function isOnboardingComplete() {
  const value = await AsyncStorage.getItem(ONBOARDING_KEY);
  return value === 'true';
}

// User profile (non-sensitive)
export async function saveUserProfile(profile) {
  await AsyncStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
}

export async function getUserProfile() {
  const value = await AsyncStorage.getItem(USER_PROFILE_KEY);
  return value ? JSON.parse(value) : null;
}
