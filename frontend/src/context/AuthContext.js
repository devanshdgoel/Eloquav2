import React, { createContext, useContext, useState, useEffect } from 'react';
import { getToken, removeToken, isOnboardingComplete } from '../utils/storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    isLoading: true,
    isSignedIn: false,
    hasCompletedOnboarding: false,
    user: null,
  });

  useEffect(() => {
    checkAuthState();
  }, []);

  async function checkAuthState() {
    try {
      const token = await getToken();
      const onboarded = await isOnboardingComplete();
      setState({
        isLoading: false,
        isSignedIn: !!token,
        hasCompletedOnboarding: onboarded,
        user: null,
      });
    } catch {
      setState({
        isLoading: false,
        isSignedIn: false,
        hasCompletedOnboarding: false,
        user: null,
      });
    }
  }

  function setSignedIn(user) {
    setState(prev => ({ ...prev, isSignedIn: true, user }));
  }

  function setOnboarded() {
    setState(prev => ({ ...prev, hasCompletedOnboarding: true }));
  }

  async function signOut() {
    await removeToken();
    setState({
      isLoading: false,
      isSignedIn: false,
      hasCompletedOnboarding: false,
      user: null,
    });
  }

  return (
    <AuthContext.Provider value={{ ...state, setSignedIn, setOnboarded, signOut, checkAuthState }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
