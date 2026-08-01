import React from 'react';
import { Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';

// Disable system font scaling globally.
//
// React Native honours the OS "large text" accessibility setting by default,
// which can scale Text up by 1.3–2× and cause fixed-layout screens (e.g.
// SetupPermissionsScreen) to overflow and hide their primary CTA buttons —
// a hard failure in a therapy app.
//
// Instead, we own the accessibility pathway: the in-app "Larger Text" toggle
// in Settings applies a predictable 1.25× scale that our layouts are designed
// for. On first launch, PrefsContext detects a large system font scale and
// auto-enables the in-app toggle so users lose nothing.
Text.defaultProps      = { ...(Text.defaultProps      ?? {}), allowFontScaling: false };
TextInput.defaultProps = { ...(TextInput.defaultProps ?? {}), allowFontScaling: false };

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
