/**
 * PitchGlideMiniExercise — simple pitch glide recording task for the baseline session.
 *
 * No real-time pitch detection (no WebView needed — works in Expo Go and TestFlight).
 * The user records themselves sliding from low to high; the recording is sent to the
 * backend for offline pitch analysis and returns an expression score (0–100).
 *
 * This component intentionally mirrors the layout of SustainedPhonationExercise
 * so the baseline session feels visually consistent.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { fetchWithAuth } from '../../../utils/authHeaders';
import { API_BASE_URL } from '../../../config/env';
import CantDoNow from '../../../components/CantDoNow';
import ScreenHeader from '../../../components/ScreenHeader';
import SpeakerButton from '../../../components/SpeakerButton';
import { useLargeText } from '../../../context/PrefsContext';

const BG_GRADIENT = ['#37767A', '#1C4047', '#0A1618'];
const ORANGE = '#FFA940';
const WHITE  = '#FFFFFF';
const MINT   = '#C3DECE';

// Maximum recording time — enough for a full low→high→low glide.
const MAX_RECORD_MS = 15000;

const SPEAKER_TEXT =
  'Pitch Range. Take a deep breath. ' +
  'Say "Ahhh" and slowly slide your voice from low to high. ' +
  'Go as high as you can, then let it fall back down.';

export default function PitchGlideMiniExercise({
  onComplete,
  onSkip,
  onExit,
  exerciseIndex   = 0,
  totalExercises  = 6,
}) {
  const largeText = useLargeText();
  const fs = (n) => largeText ? Math.round(n * 1.25) : n;

  // phase: 'ready' | 'recording' | 'processing'
  const [phase,   setPhase]   = useState('ready');
  const [elapsed, setElapsed] = useState(0);

  const recordingRef    = useRef(null);
  const timerRef        = useRef(null);
  const maxTimerRef     = useRef(null);
  const startMsRef      = useRef(0);

  // Stop recording and release mic on unmount (e.g. user hits back mid-exercise).
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearTimeout(maxTimerRef.current);
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
    };
  }, []);

  async function startRecording() {
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: false },
      );
      recordingRef.current = recording;
      startMsRef.current   = Date.now();
      setPhase('recording');
      setElapsed(0);

      // Show elapsed seconds during recording.
      timerRef.current = setInterval(() => {
        setElapsed(Math.round((Date.now() - startMsRef.current) / 1000));
      }, 1000);

      // Hard cap — auto-stops after MAX_RECORD_MS whether or not Done was tapped.
      maxTimerRef.current = setTimeout(() => stopRecording(), MAX_RECORD_MS);
    } catch {
      // Mic unavailable — skip this task so the baseline can still complete.
      onSkip();
    }
  }

  async function stopRecording() {
    clearInterval(timerRef.current);
    clearTimeout(maxTimerRef.current);
    timerRef.current    = null;
    maxTimerRef.current = null;

    if (!recordingRef.current) return;
    setPhase('processing');

    const durationS = Math.round((Date.now() - startMsRef.current) / 1000);

    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      const score = await analyzeRecording(uri, 'pitch_glide', durationS);
      onComplete(score);
    } catch {
      // Analysis failure is non-fatal — pass null so the baseline still finishes.
      onComplete(null);
    }
  }

  // Send the recording to the backend voice analysis endpoint.
  // Returns the expression score (0–100) or null on any failure.
  async function analyzeRecording(uri, taskId, durationS) {
    try {
      const form = new FormData();
      form.append('file',             { uri, type: 'audio/m4a', name: `${taskId}.m4a` });
      form.append('task_type',        taskId);
      form.append('audio_duration_s', String(durationS));

      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 12000);
      const res = await fetchWithAuth(`${API_BASE_URL}/api/analyze-voice`, {
        method: 'POST',
        body:   form,
        signal: controller.signal,
      });
      clearTimeout(tid);

      if (res.ok) {
        const d = await res.json();
        return d.data?.scores?.expression ?? null;
      }
    } catch {}
    return null;
  }

  const sessionFill  = totalExercises > 0 ? exerciseIndex / totalExercises : 0;
  const isRecording  = phase === 'recording';
  const isProcessing = phase === 'processing';

  return (
    <LinearGradient colors={BG_GRADIENT} style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />

      <ScreenHeader
        navigation={null}
        title="Pitch Range"
        backIcon="✕"
        backLabel="Exit exercise"
        onBack={onExit}
        rightAction={<SpeakerButton text={SPEAKER_TEXT} />}
      />

      <View style={s.body}>
        <Text style={s.title}>Pitch{'\n'}Range</Text>

        <Text style={[s.instruction, { fontSize: fs(18) }]}>
          {"Say \"Ahhh\" and slowly slide\nyour voice from LOW to HIGH.\nGo as high as you can."}
        </Text>

        {isRecording && (
          <Text style={s.timer}>{elapsed}s</Text>
        )}

        {isProcessing && (
          <Text style={[s.processing, { fontSize: fs(20) }]}>Analysing…</Text>
        )}

        {!isProcessing && (
          <TouchableOpacity
            style={[s.btn, isRecording && s.btnDone]}
            onPress={isRecording ? stopRecording : startRecording}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
          >
            <Text style={[s.btnText, { fontSize: fs(20) }]}>{isRecording ? 'Done  ✓' : 'Start  →'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {!isRecording && !isProcessing && (
        <View style={s.bottom}>
          <CantDoNow onSkip={onSkip} onEnd={onExit} />
        </View>
      )}

      {/* Session progress bar */}
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${sessionFill * 100}%` }]} />
      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 24,
  },
  title: {
    color: WHITE,
    fontSize: 56,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  instruction: {
    color: MINT,
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 28,
    opacity: 0.90,
  },
  timer: {
    color: WHITE,
    fontSize: 80,
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: 88,
  },
  processing: {
    color: MINT,
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  btn: {
    backgroundColor: ORANGE,
    borderRadius: 28,
    paddingHorizontal: 48,
    paddingVertical: 20,
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  btnDone: {
    backgroundColor: WHITE,
  },
  btnText: {
    color: '#1A1A1A',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  bottom: { alignItems: 'center', paddingBottom: 44 },
  progressTrack: {
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.08)',
    width: '100%',
  },
  progressFill: {
    height: '100%',
    backgroundColor: ORANGE,
    borderRadius: 4,
  },
});
