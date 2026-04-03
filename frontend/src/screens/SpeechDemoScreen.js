import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import { getVoiceStatus } from '../services/voiceService';

const API_BASE_URL = 'http://localhost:8000';

export default function SpeechDemoScreen({ navigation }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voiceInfo, setVoiceInfo] = useState(null);
  const recordingRef = useRef(null);
  const soundRef = useRef(null);

  useEffect(() => {
    getVoiceStatus('demo_user')
      .then(setVoiceInfo)
      .catch(() => {});
  }, []);

  async function startRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please grant microphone access to record.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setResult(null);
    } catch (err) {
      Alert.alert('Error', 'Failed to start recording: ' + err.message);
    }
  }

  async function stopRecording() {
    if (!recordingRef.current) return;

    setIsRecording(false);
    setIsProcessing(true);

    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      // Send to backend with user_id for voice matching
      const formData = new FormData();
      formData.append('file', {
        uri,
        name: 'recording.m4a',
        type: 'audio/m4a',
      });
      formData.append('user_id', 'demo_user');

      const response = await fetch(`${API_BASE_URL}/api/process-audio`, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'Processing failed');
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      Alert.alert('Processing Error', err.message + '\n\nMake sure the backend is running.');
    } finally {
      setIsProcessing(false);
    }
  }

  async function playEnhancedAudio() {
    if (!result?.audio_url) return;

    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: `${API_BASE_URL}${result.audio_url}` },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      setIsPlaying(true);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setIsPlaying(false);
        }
      });
    } catch (err) {
      Alert.alert('Playback Error', 'Could not play enhanced audio.');
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Speech Enhancement</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Instructions */}
        <View style={styles.instructionCard}>
          <Text style={styles.instructionTitle}>How it works</Text>
          <Text style={styles.instructionText}>
            1. Tap the microphone to start recording{'\n'}
            2. Speak naturally — say whatever you'd like{'\n'}
            3. Tap again to stop{'\n'}
            4. AI will enhance your speech for clarity
          </Text>
        </View>

        {/* Voice status */}
        {voiceInfo && (
          <View style={[styles.voiceStatus, !voiceInfo.is_default && styles.voiceStatusCloned]}>
            <Text style={styles.voiceStatusText}>
              {voiceInfo.is_default
                ? '🔈 Using default voice — set up your voice in onboarding for personalized output'
                : '🎯 Using your cloned voice — output will sound like you'}
            </Text>
          </View>
        )}

        {/* Record button */}
        <View style={styles.recordSection}>
          {isProcessing ? (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color="#6C63FF" />
              <Text style={styles.processingText}>Enhancing your speech...</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.recordButton, isRecording && styles.recordButtonActive]}
              onPress={isRecording ? stopRecording : startRecording}
              activeOpacity={0.7}
            >
              <Text style={styles.recordButtonIcon}>{isRecording ? '⏹' : '🎙️'}</Text>
              <Text style={styles.recordButtonText}>
                {isRecording ? 'Tap to Stop' : 'Tap to Record'}
              </Text>
            </TouchableOpacity>
          )}

          {isRecording && (
            <Text style={styles.recordingIndicator}>Recording...</Text>
          )}
        </View>

        {/* Results */}
        {result && (
          <View style={styles.resultsSection}>
            {result.raw_transcript && (
              <View style={styles.resultCard}>
                <Text style={styles.resultLabel}>What you said:</Text>
                <Text style={styles.resultText}>{result.raw_transcript}</Text>
              </View>
            )}

            {result.cleaned_transcript && (
              <View style={[styles.resultCard, styles.enhancedCard]}>
                <Text style={styles.resultLabel}>Enhanced version:</Text>
                <Text style={styles.resultText}>{result.cleaned_transcript}</Text>
                {result.clarity_applied && (
                  <Text style={styles.clarityBadge}>Clarity improved</Text>
                )}
              </View>
            )}

            {result.audio_url && (
              <TouchableOpacity
                style={styles.playButton}
                onPress={playEnhancedAudio}
                disabled={isPlaying}
                activeOpacity={0.7}
              >
                <Text style={styles.playButtonIcon}>{isPlaying ? '🔊' : '▶️'}</Text>
                <Text style={styles.playButtonText}>
                  {isPlaying ? 'Playing...' : 'Play Enhanced Audio'}
                </Text>
              </TouchableOpacity>
            )}

            {result.status === 'partial' && (
              <View style={styles.resultCard}>
                <Text style={styles.resultLabel}>Note:</Text>
                <Text style={styles.resultText}>
                  {result.message || 'No speech detected. Please try again and speak clearly.'}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A2E',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backButton: {
    width: 60,
  },
  backText: {
    color: '#6C63FF',
    fontSize: 16,
    fontWeight: '500',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  instructionCard: {
    backgroundColor: '#2A2A4A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
  },
  instructionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  instructionText: {
    color: '#A0A0B8',
    fontSize: 15,
    lineHeight: 24,
  },
  voiceStatus: {
    backgroundColor: '#2A2A4A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    borderLeftWidth: 3,
    borderLeftColor: '#A0A0B8',
  },
  voiceStatusCloned: {
    borderLeftColor: '#4CAF50',
  },
  voiceStatusText: {
    color: '#A0A0B8',
    fontSize: 14,
    lineHeight: 20,
  },
  recordSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  recordButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#2A2A4A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#6C63FF',
  },
  recordButtonActive: {
    backgroundColor: '#FF4444',
    borderColor: '#FF6666',
  },
  recordButtonIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  recordButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  recordingIndicator: {
    color: '#FF4444',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  processingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  processingText: {
    color: '#A0A0B8',
    fontSize: 16,
    marginTop: 16,
  },
  resultsSection: {
    gap: 16,
  },
  resultCard: {
    backgroundColor: '#2A2A4A',
    borderRadius: 16,
    padding: 20,
  },
  enhancedCard: {
    borderWidth: 1,
    borderColor: '#6C63FF',
  },
  resultLabel: {
    color: '#6C63FF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  resultText: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 26,
  },
  clarityBadge: {
    color: '#4CAF50',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
  },
  playButton: {
    backgroundColor: '#6C63FF',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  playButtonIcon: {
    fontSize: 24,
  },
  playButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
