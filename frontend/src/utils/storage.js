import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

// Note: JWT token storage is no longer needed — Firebase manages auth persistence.
// This file now only handles onboarding state and the local user profile collected
// during the onboarding flow.

const ONBOARDING_KEY        = 'eloqua_onboarding_complete';
const USER_PROFILE_KEY      = 'eloqua_user_profile';
const PERSONAL_SENTENCE_KEY = 'eloqua_personal_sentence';

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
  try {
    const value = await AsyncStorage.getItem(USER_PROFILE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

// Personal sentence — chosen once during first check-in, reused every time.
//
// Stored in BOTH AsyncStorage (fast local reads) and Firestore
// (user_progress/{uid}.personal_sentence) so the sentence survives
// app reinstalls and device switches — critical for longitudinal voice
// comparisons to remain valid.
export async function savePersonalSentence(sentence) {
  // AsyncStorage: always write (fast, available before auth resolves)
  await AsyncStorage.setItem(PERSONAL_SENTENCE_KEY, sentence);

  // Firestore: best-effort sync; non-fatal if auth not ready yet
  try {
    const uid = auth.currentUser?.uid;
    if (uid) {
      const ref  = doc(db, 'user_progress', uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, { personal_sentence: sentence });
      } else {
        await setDoc(ref, {
          personal_sentence:  sentence,
          current_node:       0,
          sessions_completed: 0,
          streak_days:        0,
        });
      }
    }
  } catch (err) {
    console.warn('[storage] savePersonalSentence Firestore sync failed:', err?.message);
  }
}

export async function getPersonalSentence() {
  // 1. Try AsyncStorage first (instant, no network)
  try {
    const local = await AsyncStorage.getItem(PERSONAL_SENTENCE_KEY);
    if (local) return local;
  } catch { /* continue to Firestore fallback */ }

  // 2. AsyncStorage miss → fetch from Firestore (reinstall / new device)
  try {
    const uid = auth.currentUser?.uid;
    if (uid) {
      const snap = await getDoc(doc(db, 'user_progress', uid));
      const remote = snap.exists() ? snap.data().personal_sentence : null;
      if (remote) {
        // Re-populate AsyncStorage so future reads are instant
        await AsyncStorage.setItem(PERSONAL_SENTENCE_KEY, remote).catch(() => {});
        return remote;
      }
    }
  } catch (err) {
    console.warn('[storage] getPersonalSentence Firestore fallback failed:', err?.message);
  }

  return null;
}
