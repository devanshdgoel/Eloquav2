import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  ScrollView,
} from 'react-native';
import { Audio } from 'expo-av';
import { useAuth } from '../../context/AuthContext';
import { setOnboardingComplete } from '../../utils/storage';
import { colors, typography, spacing, borderRadius } from '../../theme';

const PRACTICE_SENTENCES = [
  "The rainbow appeared after the morning rain stopped.",
  "She sells seashells by the beautiful seashore.",
  "Peter picked a peck of pickled peppers today.",
];

export default function SetupVoiceScreen({ navigation }) {
  const { setOnboarded } = useAuth();
  const [currentSentence, setCurrentSentence] = useState(0);
  const [recordings, setRecordings] = useState([null, null, null]);
  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef(null);

  const allRecorded = recordings.every(r => r !== null);

  async function startRecording() {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (err) {
      Alert.alert('Error', 'Could not start recording. Please check microphone permissions.');
    }
  }

  async function stopRecording() {
    if (!recordingRef.current) return;

    setIsRecording(false);
    await recordingRef.current.stopAndUnloadAsync();
    const uri = recordingRef.current.getURI();
    recordingRef.current = null;

    const updated = [...recordings];
    updated[currentSentence] = uri;
    setRecordings(updated);

    if (currentSentence < PRACTICE_SENTENCES.length - 1) {
      setTimeout(() => setCurrentSentence(currentSentence + 1), 500);
    }
  }

  async function handleFinish() {
    await setOnboardingComplete();
    setOnboarded();
  }

  function handleSkip() {
    Alert.alert(
      'Skip Voice Setup?',
      'You can always set up your voice profile later in Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          onPress: async () => {
            await setOnboardingComplete();
            setOnboarded();
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: '100%' }]} />
        </View>
        <Text style={styles.progressText}>Step 3 of 3</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>VOICE SETUP</Text>
        <Text style={styles.heading}>Let's hear your voice</Text>
        <Text style={styles.description}>
          Read each sentence aloud so we can understand your current speech
          patterns. This helps us personalize your enhancement settings.
        </Text>

        {PRACTICE_SENTENCES.map((sentence, index) => (
          <View
            key={index}
            style={[
              styles.sentenceCard,
              index === currentSentence && styles.sentenceCardActive,
              recordings[index] && styles.sentenceCardDone,
            ]}
          >
            <View style={styles.sentenceHeader}>
              <Text style={styles.sentenceNumber}>Sentence {index + 1}</Text>
              {recordings[index] && (
                <View style={styles.recordedBadge}>
                  <Text style={styles.recordedText}>✓ Recorded</Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.sentenceText,
                index === currentSentence && styles.sentenceTextActive,
              ]}
            >
              "{sentence}"
            </Text>

            {index === currentSentence && (
              <TouchableOpacity
                style={[
                  styles.recordButton,
                  isRecording && styles.recordButtonActive,
                ]}
                onPressIn={startRecording}
                onPressOut={stopRecording}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={isRecording ? 'Release to stop recording' : 'Hold to record'}
              >
                <View
                  style={[
                    styles.recordDot,
                    isRecording && styles.recordDotActive,
                  ]}
                />
                <Text style={styles.recordButtonText}>
                  {isRecording ? 'Release to stop' : 'Hold to record'}
                </Text>
              </TouchableOpacity>
            )}

            {recordings[index] && index === currentSentence && (
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  const updated = [...recordings];
                  updated[index] = null;
                  setRecordings(updated);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Re-record sentence ${index + 1}`}
              >
                <Text style={styles.retryText}>Re-record</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip voice setup"
        >
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.finishButton, !allRecorded && styles.finishButtonDisabled]}
          onPress={handleFinish}
          disabled={!allRecorded}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Finish setup"
          accessibilityState={{ disabled: !allRecorded }}
        >
          <Text style={styles.finishButtonText}>Finish Setup</Text>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  sectionLabel: {
    color: colors.primary,
    ...typography.caption,
    marginBottom: 12,
  },
  heading: {
    ...typography.heading,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  description: {
    ...typography.subheading,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  sentenceCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: 20,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  sentenceCardActive: {
    borderColor: colors.primary,
  },
  sentenceCardDone: {
    borderColor: colors.success,
    opacity: 0.85,
  },
  sentenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sentenceNumber: {
    color: colors.textSecondary,
    ...typography.caption,
    letterSpacing: 1,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  recordedBadge: {
    backgroundColor: colors.successDark,
    borderRadius: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  recordedText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '600',
  },
  sentenceText: {
    color: colors.textSecondary,
    fontSize: 17,
    lineHeight: 26,
    fontStyle: 'italic',
  },
  sentenceTextActive: {
    color: colors.textPrimary,
  },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    gap: 10,
  },
  recordButtonActive: {
    backgroundColor: colors.errorBackground,
  },
  recordDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.error,
  },
  recordDotActive: {
    backgroundColor: colors.errorBright,
  },
  recordButtonText: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: '600',
  },
  retryButton: {
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingVertical: 6,
  },
  retryText: {
    color: colors.primary,
    ...typography.bodySmall,
    fontWeight: '500',
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: 12,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  skipText: {
    color: colors.textSecondary,
    ...typography.body,
  },
  finishButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    paddingVertical: 18,
    alignItems: 'center',
  },
  finishButtonDisabled: {
    opacity: 0.4,
  },
  finishButtonText: {
    ...typography.button,
    color: colors.white,
  },
});
