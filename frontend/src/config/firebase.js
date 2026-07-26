import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

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

// Web-compatibility guard: initializeAuth with AsyncStorage persistence keeps
// the user signed in across app restarts on native. On web, AsyncStorage is
// not available and initializeAuth throws — use getAuth() (session-storage
// backed) instead. This is a no-op on iOS/Android.
export const auth = Platform.OS === 'web'
  ? getAuth(app)
  : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });

// React Native's WebSocket implementation can stall Firestore's connection
// handshake, causing the "Backend didn't respond within 10 seconds" warning.
// Long-polling uses plain HTTP requests instead — more reliable on mobile.
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
