import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo } from 'react-native';

const PREFS_KEY = 'eloqua_preferences';

const PrefsContext = createContext({
  largeText: false,
  hapticFeedback: true,
  audioCues: true,
  // reduceMotion mirrors the OS "Reduce Motion" accessibility setting.
  // Screens that animate on mount (Splash, Opening) should skip their
  // animations and proceed immediately when this is true.
  reduceMotion: false,
});

export function PrefsProvider({ children }) {
  const [largeText,       setLargeText]       = useState(false);
  const [hapticFeedback,  setHapticFeedback]  = useState(true);
  const [audioCues,       setAudioCues]       = useState(true);
  const [reduceMotion,    setReduceMotion]    = useState(false);

  // readPrefs — loads stored preferences from AsyncStorage and also
  // queries the OS accessibility API for "Reduce Motion". Both are needed:
  // stored prefs hold the user's in-app settings; reduceMotion comes from the
  // OS and is not stored (it reflects the live OS preference).
  async function readPrefs() {
    try {
      const raw = await AsyncStorage.getItem(PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setLargeText(parsed.largeText === true);
        setHapticFeedback(parsed.hapticFeedback !== false);
        setAudioCues(parsed.audioCues !== false);
      }
    } catch {}

    try {
      // AccessibilityInfo.isReduceMotionEnabled() reads the OS setting live.
      // We re-check on every readPrefs call so it stays in sync if the user
      // changes the OS setting while the app is in the background.
      const motionReduced = await AccessibilityInfo.isReduceMotionEnabled();
      setReduceMotion(motionReduced);
    } catch {}
  }

  useEffect(() => { readPrefs(); }, []);

  const refresh = useCallback(readPrefs, []);

  return (
    <PrefsContext.Provider value={{ largeText, hapticFeedback, audioCues, reduceMotion, refresh }}>
      {children}
    </PrefsContext.Provider>
  );
}

export function useFontSize(base) {
  const { largeText } = useContext(PrefsContext);
  return largeText ? Math.round(base * 1.25) : base;
}

export function useLargeText() {
  return useContext(PrefsContext).largeText;
}

export function useHapticFeedback() {
  return useContext(PrefsContext).hapticFeedback;
}

export function useAudioCues() {
  return useContext(PrefsContext).audioCues;
}

// useReduceMotion — returns true when the OS "Reduce Motion" setting is on.
// Screens that animate on mount should skip animations when this is true.
export function useReduceMotion() {
  return useContext(PrefsContext).reduceMotion;
}

export function usePrefsRefresh() {
  return useContext(PrefsContext).refresh;
}

export default PrefsContext;
