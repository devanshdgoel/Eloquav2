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

      {/* Progress indicator */}
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
    backgroundColor: '#1A1A2E',
  },
  progressContainer: {
    paddingTop: 60,
    paddingHorizontal: 32,
    paddingBottom: 16,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#2A2A4A',
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6C63FF',
    borderRadius: 2,
  },
  progressText: {
    color: '#A0A0B8',
    fontSize: 14,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 32,
  },
  sectionLabel: {
    color: '#6C63FF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 12,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#A0A0B8',
    lineHeight: 24,
    marginBottom: 40,
  },
  permissionCard: {
    backgroundColor: '#2A2A4A',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  permissionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1A1A2E',
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
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  permissionStatus: {
    color: '#A0A0B8',
    fontSize: 13,
  },
  enableButton: {
    backgroundColor: '#6C63FF',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  enableButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  checkmark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 32,
    paddingBottom: 48,
  },
  continueButton: {
    backgroundColor: '#6C63FF',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.4,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
