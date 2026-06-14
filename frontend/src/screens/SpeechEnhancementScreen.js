import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Alert,
  ActivityIndicator,
  Dimensions,
  Share,
  Image,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { SvgXml } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/env';
import { getAuthHeaders } from '../utils/authHeaders';

const PREFS_KEY = 'eloqua_preferences';

const { width: SW } = Dimensions.get('window');
const SC = SW / 402;

// How long each audio chunk is before being sent for transcription.
// 4 s gives ~10–20 words per chunk; first text appears ~5.5 s after
// the user starts speaking (4 s chunk + ~1.5 s Whisper RTT).
const CHUNK_INTERVAL_MS = 4000;

// Silence detection thresholds.
// dBFS readings below SILENCE_DB_THRESHOLD are considered silent.
// If >SILENCE_CHUNK_RATIO of a chunk's readings are silent, skip Whisper.
const SILENCE_DB_THRESHOLD = -40;  // dBFS
const SILENCE_CHUNK_RATIO  = 0.80;

// ── Screen states ────────────────────────────────────────────────────────────
const S = {
  IDLE:      'idle',
  RECORDING: 'recording',
  ENHANCING: 'enhancing', // post-recording: waiting for clarity + TTS
  RESULTS:   'results',
  ERROR:     'error',
};

// ── Amoeba blob SVGs ─────────────────────────────────────────────────────────
const AMOEBA_SETS = [
  {
    a: `<svg viewBox="0 0 220 260" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M200 10C185 -8 155 58 108 46C48 32 12 18 4 42C-14 86 28 88 26 148C24 196 -2 234 16 250C38 268 88 216 124 218C160 220 178 236 206 210C236 182 194 132 186 80C178 34 215 28 200 10Z" fill="#2D6974" fill-opacity="0.5"/>
</svg>`,
    b: `<svg viewBox="0 0 260 240" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M210 4C168 -18 130 14 28 62C-66 106 58 244 144 230C230 216 246 178 248 128C250 78 252 26 210 4Z" fill="#2D6974" fill-opacity="0.2"/>
</svg>`,
  },
  {
    a: `<svg viewBox="0 0 220 260" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M188 6C170 -12 148 64 100 50C44 34 6 22 2 50C-16 96 30 94 32 156C34 204 8 238 26 252C50 268 96 210 136 214C174 218 192 232 214 202C242 170 200 118 196 66C192 20 206 24 188 6Z" fill="#2D6974" fill-opacity="0.5"/>
</svg>`,
    b: `<svg viewBox="0 0 260 240" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M202 14C158 -10 118 20 16 72C-78 118 86 256 166 236C246 216 252 170 256 118C260 66 246 38 202 14Z" fill="#2D6974" fill-opacity="0.2"/>
</svg>`,
  },
  {
    a: `<svg viewBox="0 0 220 260" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M194 2C176 -16 160 70 114 54C56 36 14 10 6 36C-12 78 24 82 28 144C32 194 4 228 22 246C46 266 94 212 130 216C166 220 182 238 210 208C240 176 196 126 192 72C188 26 212 20 194 2Z" fill="#2D6974" fill-opacity="0.5"/>
</svg>`,
    b: `<svg viewBox="0 0 260 240" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M206 10C164 -14 122 18 22 68C-74 112 66 250 156 232C246 214 248 174 250 122C252 70 248 34 206 10Z" fill="#2D6974" fill-opacity="0.2"/>
</svg>`,
  },
];

const MIC_ICON_SVG = `<svg viewBox="0 0 112 112" fill="none" xmlns="http://www.w3.org/2000/svg">
<path fill-rule="evenodd" clip-rule="evenodd" d="M56 0C86.9279 0 112 25.0721 112 56C112 86.9279 86.9279 112 56 112C25.0721 112 0 86.9279 0 56C0 25.0721 25.0721 0 56 0ZM28 54C28 61 30.2665 67.1337 34.7998 72.4004C39.3331 77.667 45.0667 80.7669 52 81.7002V94H60V81.7002C66.9333 80.7669 72.6669 77.667 77.2002 72.4004C81.7335 67.1337 84 61 84 54H76C76.0053 59.5333 74.0563 64.2498 70.1523 68.1484C66.2484 72.0471 61.5306 73.9973 56 74C50.4693 74.0027 45.7529 72.0537 41.8516 68.1523C37.9503 64.251 36 59.5333 36 54H28ZM56 18C52.6667 18 49.8333 19.1667 47.5 21.5C45.1667 23.8333 44 26.6667 44 30V54C44 57.3333 45.1667 60.1667 47.5 62.5C49.8333 64.8333 52.6667 66 56 66C59.3333 66 62.1667 64.8333 64.5 62.5C66.8333 60.1667 68 57.3333 68 54V30C68 26.6667 66.8333 23.8333 64.5 21.5C62.1667 19.1667 59.3333 18 56 18Z" fill="#000000"/>
</svg>`;

// ── Mic group ─────────────────────────────────────────────────────────────────
function MicGroup({ onPress, scale = 1, isRecording = false }) {
  const s = SC * scale;
  const gW = Math.round(291 * s);
  const gH = Math.round(307 * s);
  const blobSet = useRef(AMOEBA_SETS[0]);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording) {
      blobSet.current = AMOEBA_SETS[Math.floor(Math.random() * AMOEBA_SETS.length)];
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.94, duration: 900, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  if (!isRecording) {
    const circleSize = Math.round(157 * SC);
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.88}
        style={{ width: circleSize, height: circleSize, alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={{
          width: circleSize, height: circleSize,
          borderRadius: circleSize / 2,
          backgroundColor: '#2D6974',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <SvgXml xml={MIC_ICON_SVG} width={Math.round(112 * SC)} height={Math.round(112 * SC)} />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} style={{ width: gW, height: gH }}>
      <Animated.View style={{
        position: 'absolute', left: 0, top: 0, width: gW, height: gH,
        justifyContent: 'center', alignItems: 'center',
        transform: [{ scale: pulseAnim }],
      }}>
        <View style={{ width: gW, height: gH, transform: [{ rotate: '-148.88deg' }] }}>
          <SvgXml xml={blobSet.current.a} width="100%" height="100%" />
        </View>
      </Animated.View>
      <Animated.View style={{
        position: 'absolute',
        left: Math.round(20 * s), top: Math.round(53 * s),
        transform: [{ scale: pulseAnim }],
      }}>
        <SvgXml xml={blobSet.current.b} width={Math.round(246 * s)} height={Math.round(221 * s)} />
      </Animated.View>
      <View style={{
        position: 'absolute',
        left: Math.round(83 * s), top: Math.round(78 * s),
        width: Math.round(157 * s), height: Math.round(157 * s),
        borderRadius: Math.round(78.5 * s),
        backgroundColor: '#2D6974',
      }} />
      <SvgXml
        xml={MIC_ICON_SVG}
        style={{ position: 'absolute', left: Math.round(106 * s), top: Math.round(101 * s) }}
        width={Math.round(112 * s)}
        height={Math.round(112 * s)}
      />
    </TouchableOpacity>
  );
}

// ── Animated ellipsis indicator ───────────────────────────────────────────────
function PendingDots() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return <Animated.Text style={[styles.pendingDots, { opacity: anim }]}>  ···</Animated.Text>;
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SpeechEnhancementScreen({ navigation }) {
  const [phase,          setPhase]          = useState(S.IDLE);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [pendingCount,   setPendingCount]   = useState(0);
  const [result,         setResult]         = useState(null);
  const [isPlaying,      setIsPlaying]      = useState(false);
  const [errorMsg,       setErrorMsg]       = useState('');
  // First-play motivational message — shown the very first time enhanced audio plays.
  const [firstPlayMsg,   setFirstPlayMsg]   = useState(null);
  const FIRST_PLAY_KEY = 'eloqua_speech_first_play';

  // Transcription model preference loaded from Settings ("whisper" | "soniva")
  const transcriptionModelRef = useRef('whisper');
  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY)
      .then(raw => {
        const prefs = raw ? JSON.parse(raw) : {};
        transcriptionModelRef.current = prefs.transcriptionModel || 'whisper';
      })
      .catch(() => {});
  }, []);

  // Chunk bookkeeping — plain refs to avoid re-render storms
  const recordingRef      = useRef(null);
  const soundRef          = useRef(null);
  const chunkTimerRef     = useRef(null);
  const chunkIndexRef     = useRef(0);
  // Each entry: { raw: string, enhanced: string }
  const chunksRef         = useRef({});
  const chunkPromisesRef  = useRef([]);
  const stoppingRef       = useRef(false);
  const isRotatingRef     = useRef(false);    // true while rotateChunk is mid-execution
  const chunkErrorsRef    = useRef(0);        // count of failed chunk requests
  // dBFS readings collected from the active recording via status callback
  const meteringRef       = useRef([]);
  // Voice analysis: URIs of completed chunks + session timing
  const chunkUrisRef         = useRef([]);
  const recordingStartMsRef  = useRef(0);
  const recordingDurationRef = useRef(0);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();
      clearTimeout(chunkTimerRef.current);
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  // ── Chunk helpers ────────────────────────────────────────────────────────────

  function getAccumulatedRawText() {
    return Object.keys(chunksRef.current)
      .map(Number)
      .sort((a, b) => a - b)
      .map(i => chunksRef.current[i]?.raw)
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  function getAccumulatedEnhancedText() {
    return Object.keys(chunksRef.current)
      .map(Number)
      .sort((a, b) => a - b)
      .map(i => chunksRef.current[i]?.enhanced || chunksRef.current[i]?.raw)
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  // ── Silence detection helpers ────────────────────────────────────────────────

  // Drain the metering buffer and return its contents.
  // Clearing here means the next recording starts with an empty slate.
  function snapshotMetering() {
    const readings = [...meteringRef.current];
    meteringRef.current = [];
    return readings;
  }

  // Returns true when >SILENCE_CHUNK_RATIO of readings are below SILENCE_DB_THRESHOLD.
  // Skips the check when there are fewer than 5 readings (e.g. user stops very quickly)
  // so we never accidentally drop a short but valid utterance.
  function isChunkSilent(readings) {
    if (readings.length < 5) return false;
    const silentCount = readings.filter(db => db < SILENCE_DB_THRESHOLD).length;
    return (silentCount / readings.length) > SILENCE_CHUNK_RATIO;
  }

  // Creates an Audio.Recording with metering enabled so we can detect silence.
  async function createRecordingWithMetering() {
    const { recording } = await Audio.Recording.createAsync(
      { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
      (status) => {
        if (status.isRecording && status.metering != null) {
          meteringRef.current.push(status.metering);
        }
      },
      100 // status update interval in ms
    );
    return recording;
  }

  // attempt=0 is the first try; attempt=1 is the single permitted retry.
  // Healthcare context: we must not silently drop words on a transient network error.
  async function transcribeChunk(uri, index, previousRawText, previousEnhancedText, attempt = 0) {
    try {
      const form = new FormData();
      form.append('file', { uri, type: 'audio/m4a', name: `chunk_${index}.m4a` });
      form.append('chunk_index', String(index));
      form.append('model', transcriptionModelRef.current);
      if (previousRawText)      form.append('previous_text',          previousRawText);
      if (previousEnhancedText) form.append('previous_enhanced_text', previousEnhancedText);

      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/transcribe-chunk`, {
        method: 'POST',
        headers: authHeaders,
        body: form,
      });

      if (!res.ok) {
        if (attempt === 0) {
          // One retry after a short pause — covers transient server/network blips.
          await new Promise(r => setTimeout(r, 1500));
          return transcribeChunk(uri, index, previousRawText, previousEnhancedText, 1);
        }
        console.error(`[Speech] chunk ${index} → HTTP ${res.status} (after retry)`);
        chunkErrorsRef.current += 1;
        return;
      }

      const data = await res.json();
      const rawText      = data.raw_text?.trim();
      const enhancedText = data.enhanced_text?.trim();

      if (rawText) {
        chunksRef.current[index] = {
          raw:      rawText,
          enhanced: enhancedText || rawText,
        };
        // Show the enhanced text live — already GPT-corrected per chunk
        setLiveTranscript(getAccumulatedEnhancedText());
      }
    } catch (e) {
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 1500));
        return transcribeChunk(uri, index, previousRawText, previousEnhancedText, 1);
      }
      console.error(`[Speech] chunk ${index} error:`, e?.message);
      chunkErrorsRef.current += 1;
    }
  }

  // Stop the active recording, immediately start a fresh one, and fire the
  // completed chunk at the backend concurrently.
  async function rotateChunk() {
    if (stoppingRef.current || !recordingRef.current) return;

    isRotatingRef.current = true;
    const index                = chunkIndexRef.current++;
    const previousRawText      = getAccumulatedRawText();
    const previousEnhancedText = getAccumulatedEnhancedText();
    const finished             = recordingRef.current;
    recordingRef.current = null;

    // Snapshot metering BEFORE stopping so we capture all readings for this chunk.
    const chunkReadings = snapshotMetering();

    try {
      await finished.stopAndUnloadAsync();
      const uri = finished.getURI();

      // Start the next recording before sending the chunk so there's no
      // audible gap for the user.
      if (!stoppingRef.current) {
        recordingRef.current = await createRecordingWithMetering();
      }

      // Layer 1 silence gate: skip Whisper entirely for silent chunks.
      if (uri && !isChunkSilent(chunkReadings)) {
        chunkUrisRef.current.push(uri);
        setPendingCount(c => c + 1);
        const p = transcribeChunk(uri, index, previousRawText, previousEnhancedText)
          .finally(() => setPendingCount(c => c - 1));
        chunkPromisesRef.current.push(p);
      }
    } catch (e) {
      console.error('[Speech] rotateChunk error:', e?.message);
    } finally {
      isRotatingRef.current = false;
    }

    if (!stoppingRef.current) {
      chunkTimerRef.current = setTimeout(rotateChunk, CHUNK_INTERVAL_MS);
    }
  }

  // ── Recording control ────────────────────────────────────────────────────────

  async function startRecording() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Microphone Required', 'Please enable microphone access in your device settings.');
        return;
      }

      chunkIndexRef.current       = 0;
      chunksRef.current           = {};
      chunkPromisesRef.current    = [];
      chunkErrorsRef.current      = 0;
      chunkUrisRef.current        = [];
      stoppingRef.current         = false;
      isRotatingRef.current       = false;
      recordingStartMsRef.current = Date.now();
      setLiveTranscript('');
      setPendingCount(0);
      setResult(null);

      meteringRef.current = [];
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      recordingRef.current = await createRecordingWithMetering();
      setPhase(S.RECORDING);
      chunkTimerRef.current = setTimeout(rotateChunk, CHUNK_INTERVAL_MS);
    } catch {
      Alert.alert('Error', 'Could not start recording.');
    }
  }

  async function stopRecording() {
    stoppingRef.current = true;
    clearTimeout(chunkTimerRef.current);
    chunkTimerRef.current = null;

    // If rotateChunk is mid-execution (it has nulled recordingRef and is
    // awaiting stopAndUnloadAsync or createAsync), wait for it to finish
    // before we proceed — otherwise we'd race on recordingRef and
    // chunkPromisesRef.
    while (isRotatingRef.current) {
      await new Promise(r => setTimeout(r, 30));
    }

    // Capture session duration before async work begins.
    recordingDurationRef.current = (Date.now() - recordingStartMsRef.current) / 1000;

    // Switch to ENHANCING immediately so the UI is responsive.
    setPhase(S.ENHANCING);

    const lastRecording = recordingRef.current;
    recordingRef.current = null;

    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

      if (lastRecording) {
        const index                = chunkIndexRef.current++;
        const previousRawText      = getAccumulatedRawText();
        const previousEnhancedText = getAccumulatedEnhancedText();
        const finalReadings        = snapshotMetering();
        await lastRecording.stopAndUnloadAsync();
        const uri = lastRecording.getURI();

        if (uri && !isChunkSilent(finalReadings)) {
          chunkUrisRef.current.push(uri);
          setPendingCount(c => c + 1);
          const finalP = transcribeChunk(uri, index, previousRawText, previousEnhancedText)
            .finally(() => setPendingCount(c => c - 1));
          chunkPromisesRef.current.push(finalP);
        }
      }

      await Promise.allSettled(chunkPromisesRef.current);
      setPendingCount(0);

      const rawText      = getAccumulatedRawText();
      const enhancedText = getAccumulatedEnhancedText();

      if (!rawText) {
        setErrorMsg(
          chunkErrorsRef.current > 0
            ? "Couldn't connect right now. Check your connection and try again."
            : "Nothing heard — tap again when you're ready."
        );
        setPhase(S.ERROR);
        return;
      }

      await enhanceText(rawText, enhancedText);
    } catch (e) {
      console.error('[Speech] stopRecording error:', e?.message);
      setErrorMsg('Recording failed. Please try again.');
      setPhase(S.ERROR);
    }
  }

  // ── Enhancement ──────────────────────────────────────────────────────────────

  async function enhanceText(rawText, enhancedText = '') {
    try {
      const form = new FormData();
      form.append('raw_transcript', rawText);
      if (enhancedText) form.append('enhanced_transcript', enhancedText);

      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/enhance-text`, {
        method: 'POST',
        headers: authHeaders,
        body: form,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error (${res.status})`);
      }

      const data = await res.json();
      setResult({ ...data, raw_transcript: rawText });
      setPhase(S.RESULTS);

      // Fire-and-forget: non-blocking voice analysis for progress tracking.
      // Does NOT affect the current session's results.
      analyzeVoiceAsync(rawText, recordingDurationRef.current);
    } catch (e) {
      console.error('[Speech] enhanceText error:', e?.message);
      setErrorMsg(e.message || 'Enhancement failed. Please try again.');
      setPhase(S.ERROR);
    }
  }

  // Send a representative audio chunk + transcript to /api/analyze-voice.
  // Picks the middle chunk (least likely to be a partial/hesitation utterance).
  // Runs fully in the background — any failure is swallowed.
  async function analyzeVoiceAsync(transcript, durationS) {
    const uris = chunkUrisRef.current;
    if (!uris.length || !durationS) return;
    const uri = uris[Math.floor(uris.length / 2)];
    if (!uri) return;

    try {
      const form = new FormData();
      form.append('file', { uri, type: 'audio/m4a', name: 'session_chunk.m4a' });
      form.append('task_type', 'free_speech');
      form.append('transcript', transcript);
      form.append('audio_duration_s', String(Math.round(durationS)));

      const authHeaders = await getAuthHeaders();
      await fetch(`${API_BASE_URL}/api/analyze-voice`, {
        method: 'POST',
        headers: authHeaders,
        body: form,
      });
    } catch (e) {
      console.warn('[Speech] Voice analysis skipped:', e?.message);
    }
  }

  // ── Playback ─────────────────────────────────────────────────────────────────

  async function playEnhanced() {
    if (!result?.audio_url) return;
    try {
      if (soundRef.current) { await soundRef.current.unloadAsync(); soundRef.current = null; }
      const { sound } = await Audio.Sound.createAsync(
        { uri: `${API_BASE_URL}${result.audio_url}` },
        { shouldPlay: true, rate: 0.85, shouldCorrectPitch: true }
      );
      soundRef.current = sound;
      setIsPlaying(true);
      sound.setOnPlaybackStatusUpdate(s => {
        if (s.didJustFinish || !s.isLoaded) {
          setIsPlaying(false);
          sound.unloadAsync().catch(() => {});
          if (soundRef.current === sound) soundRef.current = null;
        }
      });

      // First-time play: show motivational message for 4 s.
      const alreadyPlayed = await AsyncStorage.getItem(FIRST_PLAY_KEY).catch(() => 'yes');
      if (!alreadyPlayed) {
        await AsyncStorage.setItem(FIRST_PLAY_KEY, 'true').catch(() => {});
        setFirstPlayMsg("That's you — clearer, stronger.\nThis is what we're working toward.");
        setTimeout(() => setFirstPlayMsg(null), 4000);
      }
    } catch {
      Alert.alert('Playback Error', 'Could not play the enhanced audio.');
    }
  }

  async function stopPlayback() {
    await soundRef.current?.stopAsync();
    setIsPlaying(false);
  }

  async function shareText() {
    const text = result?.cleaned_transcript || result?.raw_transcript || '';
    try { await Share.share({ message: text }); } catch { }
  }

  const reset = useCallback(() => {
    soundRef.current?.unloadAsync();
    soundRef.current = null;
    setIsPlaying(false);
    setResult(null);
    setErrorMsg('');
    setLiveTranscript('');
    setPendingCount(0);
    setPhase(S.IDLE);
  }, []);

  const handleMicPress = () => {
    if (phase === S.IDLE)      startRecording();
    else if (phase === S.RECORDING) stopRecording();
  };

  const showPending = pendingCount > 0;

  return (
    <LinearGradient
      colors={['#E0ECDE', '#68B39F']}
      start={{ x: 0.07, y: 0 }}
      end={{ x: 0.93, y: 1 }}
      style={styles.root}
    >
      <StatusBar barStyle="dark-content" />

      {phase !== S.RECORDING && phase !== S.ENHANCING && (
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.title}>Speech{'\n'}Enhancement</Text>

      {/* ── IDLE ──────────────────────────────────────────────────────────── */}
      {phase === S.IDLE && (
        <View style={styles.idleArea}>
          <MicGroup onPress={handleMicPress} isRecording={false} />
          <Text style={styles.hintText}>Tap the mic to begin</Text>
        </View>
      )}

      {/* ── RECORDING ─────────────────────────────────────────────────────── */}
      {phase === S.RECORDING && (
        <View style={styles.recordingArea}>
          {/* Mic lives at the top so the transcript card has room below */}
          <View style={styles.micRow}>
            <MicGroup onPress={handleMicPress} scale={0.78} isRecording />
          </View>

          <Text style={styles.hintText}>Tap mic to finish</Text>

          {/* Live transcript card — appears as soon as the first chunk lands */}
          <View style={styles.liveCard}>
            <ScrollView
              contentContainerStyle={styles.liveCardPad}
              showsVerticalScrollIndicator={false}
            >
              {liveTranscript ? (
                <Text style={styles.liveText}>
                  {liveTranscript}
                  {showPending && <PendingDots />}
                </Text>
              ) : (
                <Text style={styles.liveTextPlaceholder}>
                  {showPending ? 'Transcribing…' : 'Listening…'}
                </Text>
              )}
            </ScrollView>

            {/* Label strip at the bottom of the card */}
            <View style={styles.liveCardFooter}>
              <View style={styles.liveCardDot} />
              <Text style={styles.liveCardLabel}>LIVE ENHANCED</Text>
            </View>
          </View>
        </View>
      )}

      {/* ── ENHANCING ─────────────────────────────────────────────────────── */}
      {phase === S.ENHANCING && (
        <View style={styles.enhancingArea}>
          <ActivityIndicator size="large" color="#1C4047" />
          <Text style={styles.enhancingText}>Polishing your words…</Text>

          {/* Keep the raw transcript visible while the AI works */}
          {liveTranscript ? (
            <View style={[styles.liveCard, styles.liveCardDim]}>
              <ScrollView
                contentContainerStyle={styles.liveCardPad}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.liveTextDim}>{liveTranscript}</Text>
              </ScrollView>
            </View>
          ) : null}
        </View>
      )}

      {/* ── ERROR ─────────────────────────────────────────────────────────── */}
      {phase === S.ERROR && (
        <View style={styles.centeredArea}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorSub}>{errorMsg}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={reset}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── RESULTS ───────────────────────────────────────────────────────── */}
      {phase === S.RESULTS && result && (
        <View style={styles.resultsArea}>
          <View style={styles.transcriptCard}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.transcriptPad}>
              <Text style={styles.transcriptText}>
                {result.cleaned_transcript || result.raw_transcript}
              </Text>
            </ScrollView>
          </View>

          <TouchableOpacity
            style={[styles.actionBtn, !result.audio_url && styles.actionBtnDisabled]}
            onPress={isPlaying ? stopPlayback : playEnhanced}
            activeOpacity={result.audio_url ? 0.85 : 1}
            disabled={!result.audio_url && !isPlaying}
          >
            <Text style={styles.actionLabel}>{isPlaying ? 'Stop' : 'Play'}</Text>
            <Text style={styles.actionIcon}>🔊</Text>
            {!result.audio_url && (
              <Text style={styles.actionUnavailable}>unavailable</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={shareText} activeOpacity={0.85}>
            <Text style={styles.actionLabel}>Copy text</Text>
            <Text style={styles.actionIcon}>📋</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.newRecordBtn} onPress={reset} activeOpacity={0.85}>
            <Text style={styles.actionLabel}>New recording</Text>
            <Text style={styles.actionIcon}>🎙️</Text>
          </TouchableOpacity>
        </View>
      )}

      <Image
        source={require('../../assets/images/wave-logo.png')}
        style={styles.waveLogo}
        resizeMode="contain"
        accessible={false}
      />

      {/* First-play motivational overlay — fades in automatically */}
      {firstPlayMsg ? (
        <View style={styles.firstPlayOverlay} pointerEvents="none">
          <Text style={styles.firstPlayText}>{firstPlayMsg}</Text>
        </View>
      ) : null}
    </LinearGradient>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const TEAL   = '#1C4047';
const WHITE  = '#FFFFFF';
const ORANGE = '#FFA940';

const styles = StyleSheet.create({
  root: { flex: 1 },

  backBtn: {
    position: 'absolute', top: 52, left: 20, zIndex: 10,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderWidth: 1.5, borderColor: 'rgba(28,64,71,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  backArrow: { color: TEAL, fontSize: 24, fontWeight: '500', includeFontPadding: false, textAlign: 'center', lineHeight: 24 },

  title: {
    marginTop: Math.round(56 * SC),
    fontSize: Math.round(45 * SC),
    fontWeight: '800',
    color: TEAL,
    textAlign: 'center',
    letterSpacing: 2.25,
    lineHeight: Math.round(70 * SC),
  },

  // ── IDLE ──
  idleArea: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60,
  },

  // ── RECORDING ──
  recordingArea: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Math.round(20 * SC),
    paddingBottom: 24,
    gap: 10 * SC,
  },
  micRow: {
    alignItems: 'center',
  },

  hintText: {
    fontSize: Math.round(20 * SC),
    color: TEAL,
    letterSpacing: 2,
    textAlign: 'center',
  },

  // ── Live transcript card ──
  liveCard: {
    flex: 1,
    width: '100%',
    backgroundColor: WHITE,
    borderRadius: 24 * SC,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    overflow: 'hidden',
  },
  liveCardDim: {
    opacity: 0.55,
  },
  liveCardPad: {
    padding: 18 * SC,
    paddingBottom: 8 * SC,
    flexGrow: 1,
  },
  liveText: {
    fontSize: Math.round(16 * SC),
    color: '#111',
    lineHeight: 26 * SC,
    letterSpacing: 0.3,
  },
  liveTextDim: {
    fontSize: Math.round(15 * SC),
    color: '#444',
    lineHeight: 24 * SC,
    letterSpacing: 0.3,
  },
  liveTextPlaceholder: {
    fontSize: Math.round(15 * SC),
    color: 'rgba(28,64,71,0.40)',
    fontStyle: 'italic',
    letterSpacing: 0.5,
  },
  pendingDots: {
    fontSize: Math.round(16 * SC),
    color: ORANGE,
    fontWeight: '700',
  },
  liveCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18 * SC,
    paddingVertical: 10 * SC,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,64,71,0.08)',
  },
  liveCardDot: {
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: ORANGE,
  },
  liveCardLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(28,64,71,0.45)',
    letterSpacing: 1.5,
  },

  // ── ENHANCING ──
  enhancingArea: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Math.round(20 * SC),
    paddingBottom: 24,
    gap: 14 * SC,
  },
  enhancingText: {
    fontSize: Math.round(20 * SC),
    color: TEAL,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // ── ERROR ──
  centeredArea: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 16, paddingBottom: 60,
  },
  errorTitle: { fontSize: 22, fontWeight: '700', color: TEAL, textAlign: 'center' },
  errorSub:   { fontSize: 15, color: 'rgba(28,64,71,0.6)', textAlign: 'center', lineHeight: 22, paddingHorizontal: 32 },
  retryBtn:   { marginTop: 8, backgroundColor: TEAL, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 },
  retryText:  { color: WHITE, fontSize: 16, fontWeight: '600' },

  // ── RESULTS ──
  resultsArea: {
    flex: 1,
    paddingHorizontal: Math.round(57 * SC),
    paddingBottom: 28,
    gap: Math.round(14 * SC),
  },
  transcriptCard: {
    flex: 1,
    backgroundColor: WHITE,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  transcriptPad: { padding: 20 },
  transcriptLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: 'rgba(28,64,71,0.40)',
    letterSpacing: 2,
    marginBottom: 6,
  },
  transcriptText: {
    fontSize: Math.round(16 * SC),
    color: '#000',
    letterSpacing: 1.2,
    lineHeight: 26 * SC,
  },
  rawDivider: {
    height: 1,
    backgroundColor: 'rgba(28,64,71,0.08)',
    marginVertical: 14 * SC,
  },
  rawText: {
    fontSize: Math.round(13 * SC),
    color: 'rgba(0,0,0,0.40)',
    letterSpacing: 0.5,
    lineHeight: 20 * SC,
  },

  actionBtn: {
    backgroundColor: '#000',
    borderRadius: Math.round(20 * SC),
    height: Math.round(52 * SC),
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  actionBtnDisabled: {
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  actionLabel: { color: WHITE, fontSize: Math.round(20 * SC), fontWeight: '700', letterSpacing: 1.8 },
  actionIcon:  { fontSize: Math.round(20 * SC) },
  actionUnavailable: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: Math.round(11 * SC),
    letterSpacing: 0.5,
    marginLeft: -6,
  },

  newRecordBtn: {
    backgroundColor: '#3A8C4A',
    borderRadius: Math.round(20 * SC),
    height: Math.round(52 * SC),
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    shadowColor: '#3A8C4A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 5,
  },

  waveLogo: {
    position: 'absolute',
    bottom: 24, right: Math.round(16 * SC),
    width: Math.round(146 * SC), height: Math.round(55 * SC),
  },

  // First-play motivational overlay
  firstPlayOverlay: {
    position: 'absolute',
    bottom: 100,
    left: 24,
    right: 24,
    backgroundColor: 'rgba(28,64,71,0.92)',
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  firstPlayText: {
    color: WHITE,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 26,
    letterSpacing: 0.2,
  },

  // Error text size fixes for accessibility
  errorSub: {
    fontSize: 18,
    color: 'rgba(28,64,71,0.7)',
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: 32,
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: TEAL,
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 18,  // ≥ 56px tall
  },
  retryText: { color: WHITE, fontSize: 18, fontWeight: '600' },
});
