import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Audio } from 'expo-av';
import { useAuth } from '../../context/AuthContext';
import { setOnboardingComplete } from '../../utils/storage';
import { cloneVoice } from '../../services/voiceService';

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

  const [isCloning, setIsCloning] = useState(false);
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

    // Auto-advance to next sentence
    if (currentSentence < PRACTICE_SENTENCES.length - 1) {
      setTimeout(() => setCurrentSentence(currentSentence + 1), 500);
    }
  }

  async function handleFinish() {
    const validRecordings = recordings.filter(r => r !== null);

    if (validRecordings.length > 0) {
      setIsCloning(true);
      try {
        await cloneVoice(validRecordings, 'demo_user', 'User');
        Alert.alert(
          'Voice Cloned!',
          'Your voice profile has been created. Enhanced speech will now sound like you.',
          [{ text: 'Continue', onPress: completeOnboarding }]
        );
        return;
      } catch (err) {
        // Voice cloning failed — continue anyway, will use default voice
        Alert.alert(
          'Voice setup skipped',
          'We couldn\'t create your voice profile right now. You can try again later. Enhanced speech will use a default voice.',
          [{ text: 'Continue', onPress: completeOnboarding }]
        );
        return;
      } finally {
        setIsCloning(false);
      }
    }

    completeOnboarding();
  }

  async function completeOnboarding() {
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

      {/* Progress */}
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

        {/* Sentence cards */}
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
              >
                <Text style={styles.retryText}>Re-record</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.finishButton, (!allRecorded || isCloning) && styles.finishButtonDisabled]}
          onPress={handleFinish}
          disabled={!allRecorded || isCloning}
          activeOpacity={0.8}
        >
          {isCloning ? (
            <View style={styles.cloningRow}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.finishButtonText}>Creating your voice...</Text>
            </View>
          ) : (
            <Text style={styles.finishButtonText}>Finish Setup</Text>
          )}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 24,
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
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#A0A0B8',
    lineHeight: 24,
    marginBottom: 32,
  },
  sentenceCard: {
    backgroundColor: '#2A2A4A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  sentenceCardActive: {
    borderColor: '#6C63FF',
  },
  sentenceCardDone: {
    borderColor: '#4CAF50',
    opacity: 0.85,
  },
  sentenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sentenceNumber: {
    color: '#A0A0B8',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  recordedBadge: {
    backgroundColor: '#1B3A1B',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  recordedText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
  },
  sentenceText: {
    color: '#A0A0B8',
    fontSize: 17,
    lineHeight: 26,
    fontStyle: 'italic',
  },
  sentenceTextActive: {
    color: '#FFFFFF',
  },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A2E',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 16,
    gap: 10,
  },
  recordButtonActive: {
    backgroundColor: '#4A1A1A',
  },
  recordDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FF4444',
  },
  recordDotActive: {
    backgroundColor: '#FF0000',
  },
  recordButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  retryButton: {
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 6,
  },
  retryText: {
    color: '#6C63FF',
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    paddingHorizontal: 32,
    paddingBottom: 48,
    gap: 12,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  skipText: {
    color: '#A0A0B8',
    fontSize: 16,
  },
  finishButton: {
    backgroundColor: '#6C63FF',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  finishButtonDisabled: {
    opacity: 0.4,
  },
  cloningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  finishButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
