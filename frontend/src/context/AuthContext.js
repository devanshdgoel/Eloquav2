import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';
import { signOut as firebaseSignOut } from '../services/authService';
import { isOnboardingComplete, setOnboardingComplete } from '../utils/storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    isLoading: true,
    isSignedIn: false,
    hasCompletedOnboarding: false,
    user: null,
  });

  useEffect(() => {
    // Firebase manages auth persistence automatically via AsyncStorage.
    // onAuthStateChanged fires on startup (restoring session) and on every sign-in/out.
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const onboarded = await isOnboardingComplete();
        setState({
          isLoading: false,
          isSignedIn: true,
          hasCompletedOnboarding: onboarded,
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
          user: null,
        });
      }
    });

    return unsubscribe; // Unsubscribe on unmount
  }, []);

  function setOnboarded() {
    setState(prev => ({ ...prev, hasCompletedOnboarding: true }));
  }

  async function signOut() {
    await firebaseSignOut();
    setState({
      isLoading: false,
      isSignedIn: false,
      hasCompletedOnboarding: false,
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
