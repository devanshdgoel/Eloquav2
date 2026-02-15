import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import { colors, typography, spacing, borderRadius } from '../../theme';

export default function SetupPermissionsScreen({ navigation }) {
  const [micGranted, setMicGranted] = useState(false);

  async function requestMicrophonePermission() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status === 'granted') {
        setMicGranted(true);
      } else {
        Alert.alert(
          'Permission Required',
          'Eloqua needs microphone access to enhance your speech. Please enable it in your device settings.',
          [{ text: 'OK' }]
        );
      }
    } catch {
      Alert.alert('Error', 'Could not request microphone permission.');
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: '33%' }]} />
        </View>
        <Text style={styles.progressText}>Step 1 of 3</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionLabel}>PERMISSIONS</Text>
        <Text style={styles.heading}>Let's set up your mic</Text>
        <Text style={styles.description}>
          Eloqua needs access to your microphone to record and enhance your
          speech. Your audio is processed securely and never shared.
        </Text>

        <View style={styles.permissionCard}>
          <View style={styles.permissionIcon}>
            <Text style={styles.iconText}>🎙️</Text>
          </View>
          <View style={styles.permissionInfo}>
            <Text style={styles.permissionTitle}>Microphone Access</Text>
            <Text style={styles.permissionStatus}>
              {micGranted ? 'Granted' : 'Required for speech features'}
            </Text>
          </View>
          {micGranted ? (
            <View style={styles.checkmark}>
              <Text style={styles.checkmarkText}>✓</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.enableButton}
              onPress={requestMicrophonePermission}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Enable microphone access"
            >
              <Text style={styles.enableButtonText}>Enable</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueButton, !micGranted && styles.continueButtonDisabled]}
          onPress={() => navigation.navigate('SetupAboutYou')}
          disabled={!micGranted}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Continue to next step"
          accessibilityState={{ disabled: !micGranted }}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  progressContainer: {
    paddingTop: 60,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
  },
  progressText: {
    color: colors.textSecondary,
    ...typography.bodySmall,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  sectionLabel: {
    color: colors.primary,
    ...typography.caption,
    marginBottom: 12,
  },
  heading: {
    ...typography.heading,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  description: {
    ...typography.subheading,
    color: colors.textSecondary,
    marginBottom: 40,
  },
  permissionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  permissionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 24,
  },
  permissionInfo: {
    flex: 1,
  },
  permissionTitle: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: '600',
    marginBottom: 2,
  },
  permissionStatus: {
    color: colors.textSecondary,
    ...typography.caption,
    letterSpacing: 0,
    fontWeight: '400',
  },
  enableButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  enableButtonText: {
    color: colors.white,
    ...typography.bodySmall,
    fontWeight: '600',
  },
  checkmark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  continueButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    paddingVertical: 18,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.4,
  },
  continueButtonText: {
    ...typography.button,
    color: colors.white,
  },
});
