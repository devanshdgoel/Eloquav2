import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase web API keys are designed to be public — they identify the project
// but do not grant privileged access. Access control is enforced by Firebase
// Security Rules and Firebase Auth, not by keeping this key secret.
const firebaseConfig = {
  apiKey:            'AIzaSyD5ChGuQ3qolrj5oapkSMKEIAvbayTliOY',
  authDomain:        'eloqua-f714f.firebaseapp.com',
  projectId:         'eloqua-f714f',
  storageBucket:     'eloqua-f714f.firebasestorage.app',
  messagingSenderId: '301157330813',
  appId:             '1:301157330813:web:c68054749712b345aee614',
};

const app = initializeApp(firebaseConfig);

// initializeAuth with AsyncStorage persistence keeps the user signed in
// across app restarts. Without this, Firebase Auth defaults to in-memory
// storage, which signs the user out every time the app is closed.
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);
