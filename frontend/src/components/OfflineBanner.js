/**
 * OfflineBanner — shows a persistent bar when the device has no internet.
 *
 * Mounted in AppNavigator outside the NavigationContainer so it appears
 * above every screen. Uses @react-native-community/netinfo which fires
 * immediately on mount with the current connectivity state and then
 * reactively updates whenever the connection drops or returns.
 *
 * isConnected is null during initial probe — we wait for a confirmed
 * false before showing the banner to avoid a flash on startup.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function OfflineBanner() {
  const netState = NetInfo.useNetInfo();
  const { bottom } = useSafeAreaInsets();

  // null = not yet determined; undefined = library not ready.
  // Only show when definitively offline (false).
  if (netState.isConnected !== false) return null;

  return (
    <View style={[styles.banner, { paddingBottom: bottom > 0 ? bottom : 12 }]}>
      <View style={styles.dot} />
      <Text style={styles.text}>No internet connection</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1C1C1E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingHorizontal: 20,
    gap: 8,
    // Sits above all navigation screens
    zIndex: 9999,
    elevation: 9999,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF453A',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
