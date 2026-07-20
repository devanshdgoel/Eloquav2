/**
 * ReadingMiniExercise — sentence reading task for the baseline session.
 *
 * Records the user reading a standardised passage aloud, sends the recording
 * to the backend for offline analysis, and returns a fluency score (0–100).
 * The passage is identical to the one used in AssessmentScreen so backend
 * scoring is calibrated against the same reference text.
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

// Maximum recording time — ample headroom for slower readers.
const MAX_RECORD_MS = 35000;

// Standardised passage — matches AssessmentScreen and backend scoring norms.
const PASSAGE =
  '"When the sunlight strikes raindrops in the air, they act as a prism and form a rainbow."';

const SPEAKER_TEXT =
  `Reading Aloud. Read this sentence clearly at your natural pace: ${PASSAGE}`;

export default function ReadingMiniExercise({
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

  const recordingRef  = useRef(null);
  const timerRef      = useRef(null);
  const maxTimerRef   = useRef(null);
  const startMsRef    = useRef(0);

  // Release mic on unmount.
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

      timerRef.current    = setInterval(() => {
        setElapsed(Math.round((Date.now() - startMsRef.current) / 1000));
      }, 1000);

      maxTimerRef.current = setTimeout(() => stopRecording(), MAX_RECORD_MS);
    } catch {
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

      const score = await analyzeRecording(uri, 'reading', durationS);
      onComplete(score);
    } catch {
      onComplete(null);
    }
  }

  // Returns the fluency score (0–100) or null on any failure.
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
        return d.data?.scores?.fluency ?? null;
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
        title="Reading Aloud"
        backIcon="✕"
        backLabel="Exit exercise"
        onBack={onExit}
        rightAction={<SpeakerButton text={SPEAKER_TEXT} />}
      />

      <View style={s.body}>
        <Text style={[s.label, { fontSize: fs(18) }]}>Read this sentence aloud,{'\n'}at your natural pace:</Text>

        <View style={s.passageCard}>
          <Text style={[s.passageText, { fontSize: fs(22) }]}>{PASSAGE}</Text>
        </View>

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
    paddingHorizontal: 28,
    gap: 20,
  },
  label: {
    color: MINT,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 26,
    opacity: 0.90,
  },
  passageCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    padding: 28,
    width: '100%',
  },
  passageText: {
    color: WHITE,
    fontSize: 22,
    lineHeight: 34,
    fontStyle: 'italic',
    textAlign: 'center',
    fontWeight: '500',
  },
  timer: {
    color: WHITE,
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 56,
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
