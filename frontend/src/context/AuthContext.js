import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';
import { signOut as firebaseSignOut } from '../services/authService';
import { isOnboardingComplete } from '../utils/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/env';

const AuthContext = createContext(null);

// Ping the backend health endpoint so Render wakes up before the user's first
// API call. Non-fatal — any failure is silently swallowed.
async function warmUpBackend() {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10_000);
    await fetch(`${API_BASE_URL}/`, { signal: controller.signal });
  } catch {
    // Cold start or network error — backend will still serve when the user
    // makes their first real request; this just reduces perceived latency.
  }
}

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    isLoading: true,
    isSignedIn: false,
    hasCompletedOnboarding: false,
    isGuest: false,
    authError: false,
    user: null,
  });

  useEffect(() => {
    // Kick off backend warm-up in parallel with auth resolution.
    warmUpBackend();

    // Safety net: if Firebase never calls back (network totally down, SDK bug),
    // unblock the UI after 15 seconds so the user sees the sign-in screen.
    const authTimeout = setTimeout(() => {
      setState(prev => {
        if (!prev.isLoading) return prev; // already resolved — do nothing
        return { ...prev, isLoading: false, authError: true };
      });
    }, 15_000);

    // Firebase manages auth persistence automatically via AsyncStorage.
    // onAuthStateChanged fires on startup (restoring session) and on every sign-in/out.
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(authTimeout);
      if (firebaseUser) {
        const onboarded = await isOnboardingComplete();
        setState({
          isLoading: false,
          isSignedIn: true,
          hasCompletedOnboarding: onboarded,
          isGuest: firebaseUser.isAnonymous,
          authError: false,
          user: {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            name: firebaseUser.displayName || '',
            picture: firebaseUser.photoURL || '',
          },
        });
      } else {
        setState({
          isLoading: false,
          isSignedIn: false,
          hasCompletedOnboarding: false,
          authError: false,
          user: null,
        });
      }
    });

    return () => { clearTimeout(authTimeout); unsubscribe(); };
  }, []);

  function setOnboarded() {
    setState(prev => ({ ...prev, hasCompletedOnboarding: true }));
  }

  async function signOut() {
    await firebaseSignOut();
    // Clear the onboarding flag so guest/anonymous sessions don't auto-skip login
    await AsyncStorage.removeItem('eloqua_onboarding_complete');
    setState({
      isLoading: false,
      isSignedIn: false,
      hasCompletedOnboarding: false,
      authError: false,
      user: null,
    });
  }

  return (
    <AuthContext.Provider value={{ ...state, setOnboarded, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
