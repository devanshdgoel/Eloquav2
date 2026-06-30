import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFS_KEY = 'eloqua_preferences';

const DEFAULT_PREFS = {
  largeText: false,
  hapticFeedback: true,
  audioCues: true,
};

const PrefsContext = createContext({
  largeText: false,
  hapticFeedback: true,
  audioCues: true,
});

export function PrefsProvider({ children }) {
  const [largeText,       setLargeText]       = useState(false);
  const [hapticFeedback,  setHapticFeedback]  = useState(true);
  const [audioCues,       setAudioCues]       = useState(true);

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
  }

  useEffect(() => { readPrefs(); }, []);

  const refresh = useCallback(readPrefs, []);

  return (
    <PrefsContext.Provider value={{ largeText, hapticFeedback, audioCues, refresh }}>
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

export function usePrefsRefresh() {
  return useContext(PrefsContext).refresh;
}

export default PrefsContext;
