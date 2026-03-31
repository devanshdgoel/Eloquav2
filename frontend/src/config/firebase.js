import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Firebase config is injected at build time via app.config.js extra fields.
// Values originate from the .env file (gitignored) — nothing is hardcoded here.
const extra = Constants.expoConfig?.extra ?? {};

const firebaseConfig = {
  apiKey:            extra.firebaseApiKey,
  authDomain:        extra.firebaseAuthDomain,
  projectId:         extra.firebaseProjectId,
  storageBucket:     extra.firebaseStorageBucket,
  messagingSenderId: extra.firebaseMessagingSenderId,
  appId:             extra.firebaseAppId,
};

const app = initializeApp(firebaseConfig);

// initializeAuth with AsyncStorage persistence keeps the user signed in
// across app restarts. Without this, Firebase Auth defaults to in-memory
// storage and signs the user out on every cold start.
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);
