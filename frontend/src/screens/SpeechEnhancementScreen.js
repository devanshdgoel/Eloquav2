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
import NetInfo from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE_URL } from '../config/env';
import { fetchWithAuth } from '../utils/authHeaders';
import { colors } from '../theme';
import { logUsageEvent, logScreenView } from '../utils/analytics';
import { useLargeText } from '../context/PrefsContext';
import { MicIcon, ClipboardIcon, SpeakerIcon } from '../components/Icons';
import ScreenHeader from '../components/ScreenHeader';
import SpeakerButton from '../components/SpeakerButton';

const PREFS_KEY = 'eloqua_preferences';

const { width: SW } = Dimensions.get('window');
const SC = SW / 402;

// How long each audio chunk is before being sent for transcription.
// 2 s gives ~5–10 words per chunk; first text appears ~3.5 s after the user
// starts speaking (2 s chunk + ~1.5 s Whisper RTT).
const CHUNK_INTERVAL_MS = 2000;

// Silence detection thresholds.
// dBFS readings below SILENCE_DB_THRESHOLD are considered silent.
// If >SILENCE_CHUNK_RATIO of a chunk's readings are silent, skip Whisper.
const SILENCE_DB_THRESHOLD = -40;  // dBFS
const SILENCE_CHUNK_RATIO  = 0.80;

// If the user has been silent for this long during a chunk, trigger an early
// rotation rather than waiting for the full CHUNK_INTERVAL_MS.
// This avoids sending a chunk that is mostly silence after the user stops speaking.
const SILENCE_EARLY_TRIGGER_MS = 1200;

// Don't trigger early rotation in the first 600 ms of a chunk — the user may
// just be pausing briefly between words.
const MIN_CHUNK_MS_BEFORE_EARLY_TRIGGER = 600;

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


// ── Mic group ─────────────────────────────────────────────────────────────────
function MicGroup({ onPress, scale = 1, isRecording = false, disabled = false }) {
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
        onPress={disabled ? undefined : onPress}
        activeOpacity={disabled ? 1 : 0.88}
        style={{ width: circleSize, height: circleSize, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}
        accessibilityRole="button"
        accessibilityLabel={disabled ? 'Microphone unavailable offline' : 'Start recording'}
        disabled={disabled}
      >
        <View style={{
          width: circleSize, height: circleSize,
          borderRadius: circleSize / 2,
          backgroundColor: '#2D6974',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <MicIcon size={Math.round(66 * SC)} color="#FFFFFF" />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} style={{ width: gW, height: gH }} accessibilityRole="button" accessibilityLabel="Done recording">
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
      {/* Mic icon centred on the teal circle: circle at (83,78)+157×157, centre = (161.5,156.5)*s; icon size 66*s → offset by 33*s */}
      <View style={{ position: 'absolute', left: Math.round(128.5 * s), top: Math.round(123.5 * s) }}>
        <MicIcon size={Math.round(66 * s)} color="#FFFFFF" />
      </View>
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
  const largeText = useLargeText();
  const fs = (base) => largeText ? Math.round(base * 1.25) : base;
  const { top: safeTop } = useSafeAreaInsets();

  const [phase,           setPhase]          = useState(S.IDLE);
  const [liveTranscript,  setLiveTranscript] = useState('');
  const [pendingCount,    setPendingCount]   = useState(0);
  const [result,          setResult]         = useState(null);
  const [isPlaying,       setIsPlaying]      = useState(false);

  // audioReady: true once the audio file has been downloaded and loaded into expo-av.
  // false = spinner shows on play button. The button is disabled while false.
  const [audioReady,      setAudioReady]     = useState(false);

  // audioFailed: true if download or decode failed — shows "Audio unavailable" on button.
  const [audioFailed,     setAudioFailed]    = useState(false);

  const [errorMsg,        setErrorMsg]       = useState('');

  // isOnline: mirrors NetInfo.isConnected. Used to disable recording when offline.
  const [isOnline,        setIsOnline]       = useState(true);

  // First-play motivational message — shown the very first time enhanced audio plays.
  const [firstPlayMsg,    setFirstPlayMsg]   = useState(null);
  const FIRST_PLAY_KEY = 'eloqua_speech_first_play';

  // Screen-time tracking.
  useEffect(() => {
    // Pre-warm the backend the moment the screen mounts, in case the HomeScreen
    // tap fired too early or the user navigated here via a different route.
    fetch(`${API_BASE_URL}/api/wake`).catch(() => {});
    const logExit = logScreenView('SpeechEnhancement');
    return logExit;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to connectivity changes so we can disable the mic when offline.
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected !== false);
    });
    return unsub;
  }, []);

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

  // Track whether the component is still mounted so async audio-load callbacks
  // don't fire after the user has navigated away.
  const isMountedRef = useRef(true);

  // Chunk bookkeeping — plain refs to avoid re-render storms
  const recordingRef      = useRef(null);
  // soundRef: the current playback sound (either streaming or replaying).
  const soundRef          = useRef(null);
  // preloadedSoundRef: streaming sound created in background, moved to soundRef on first play.
  const preloadedSoundRef = useRef(null);
  // Incremented each time a new recording session starts to discard stale preloads.
  const sessionGenerationRef = useRef(0);
  const playbackLockRef   = useRef(false);
  const chunkTimerRef     = useRef(null);
  const chunkIndexRef     = useRef(0);
  const chunksRef         = useRef({});
  const chunkPromisesRef  = useRef([]);
  const stoppingRef       = useRef(false);
  const isRotatingRef     = useRef(false);
  const chunkErrorsRef    = useRef(0);
  const meteringRef       = useRef([]);

  // Silence-based early rotation: track when the current chunk started and
  // the last time a non-silent metering reading was received.
  const chunkStartMsRef   = useRef(0);
  const lastSoundMsRef    = useRef(0);

  // Voice analysis: URIs of completed chunks + session timing
  const chunkUrisRef         = useRef([]);
  const recordingStartMsRef  = useRef(0);
  const recordingDurationRef = useRef(0);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      soundRef.current?.unloadAsync();
      preloadedSoundRef.current?.unloadAsync();
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

  function snapshotMetering() {
    const readings = [...meteringRef.current];
    meteringRef.current = [];
    return readings;
  }

  function isChunkSilent(readings) {
    if (readings.length < 5) return false;
    const silentCount = readings.filter(db => db < SILENCE_DB_THRESHOLD).length;
    return (silentCount / readings.length) > SILENCE_CHUNK_RATIO;
  }

  // Creates an Audio.Recording with metering enabled for both silence detection
  // and the early-rotation trigger.
  async function createRecordingWithMetering() {
    chunkStartMsRef.current = Date.now();
    lastSoundMsRef.current  = Date.now(); // assume sound at chunk start

    const { recording } = await Audio.Recording.createAsync(
      { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
      (status) => {
        if (!status.isRecording || status.metering == null) return;
        meteringRef.current.push(status.metering);

        const now = Date.now();
        if (status.metering >= SILENCE_DB_THRESHOLD) {
          // User is speaking — reset the silence clock.
          lastSoundMsRef.current = now;
        } else {
          // Silent reading — check if we've hit the early-trigger threshold.
          const silenceDuration = now - lastSoundMsRef.current;
          const chunkAge        = now - chunkStartMsRef.current;

          if (
            silenceDuration >= SILENCE_EARLY_TRIGGER_MS &&
            chunkAge        >= MIN_CHUNK_MS_BEFORE_EARLY_TRIGGER &&
            !stoppingRef.current &&
            !isRotatingRef.current
          ) {
            // Cancel the timer and immediately rotate — the user has stopped speaking.
            clearTimeout(chunkTimerRef.current);
            chunkTimerRef.current = null;
            rotateChunk(); // intentionally not awaited — runs async
          }
        }
      },
      100 // status interval in ms
    );
    return recording;
  }

  async function transcribeChunk(uri, index, previousRawText, previousEnhancedText, attempt = 0) {
    try {
      const form = new FormData();
      form.append('file', { uri, type: 'audio/m4a', name: `chunk_${index}.m4a` });
      form.append('chunk_index', String(index));
      form.append('model', transcriptionModelRef.current);
      if (previousRawText)      form.append('previous_text',          previousRawText);
      if (previousEnhancedText) form.append('previous_enhanced_text', previousEnhancedText);

      const ctrl = new AbortController();
      // 28 s timeout covers Render cold-start (15–20 s) before aborting.
      const tid  = setTimeout(() => ctrl.abort(), 28000);
      const res  = await fetchWithAuth(`${API_BASE_URL}/api/transcribe-chunk`, {
        method: 'POST',
        body: form,
        signal: ctrl.signal,
      }).finally(() => clearTimeout(tid));

      if (!res.ok) {
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 4000));
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
        setLiveTranscript(getAccumulatedEnhancedText());
      }
    } catch (e) {
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 4000));
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

    const chunkReadings = snapshotMetering();

    try {
      await finished.stopAndUnloadAsync();
      const uri = finished.getURI();

      // Start the next recording before sending the chunk — no audible gap.
      if (!stoppingRef.current) {
        recordingRef.current = await createRecordingWithMetering();
      }

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
      if (preloadedSoundRef.current) {
        await preloadedSoundRef.current.unloadAsync().catch(() => {});
        preloadedSoundRef.current = null;
      }
      if (soundRef.current) {
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      sessionGenerationRef.current += 1;

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
      setAudioReady(false);
      setAudioFailed(false);

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

    while (isRotatingRef.current) {
      await new Promise(r => setTimeout(r, 30));
    }

    recordingDurationRef.current = (Date.now() - recordingStartMsRef.current) / 1000;
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
        logUsageEvent({
          event:  'speech_enhance_failed',
          reason: chunkErrorsRef.current > 0 ? 'network_error' : 'no_audio',
        });
        setPhase(S.ERROR);
        return;
      }

      await enhanceText(rawText, enhancedText);
    } catch (e) {
      console.error('[Speech] stopRecording error:', e?.message);
      setErrorMsg('Recording failed. Please try again.');
      logUsageEvent({ event: 'speech_enhance_failed', reason: 'recording_error' });
      setPhase(S.ERROR);
    }
  }

  // ── Enhancement ──────────────────────────────────────────────────────────────

  async function enhanceText(rawText, enhancedText = '') {
    try {
      const form = new FormData();
      form.append('raw_transcript', rawText);
      if (enhancedText) form.append('enhanced_transcript', enhancedText);

      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 20000);
      const res  = await fetchWithAuth(`${API_BASE_URL}/api/enhance-text`, {
        method: 'POST',
        body: form,
        signal: ctrl.signal,
      }).finally(() => clearTimeout(tid));

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error (${res.status})`);
      }

      const data = await res.json();
      setResult({ ...data, raw_transcript: rawText });
      setPhase(S.RESULTS);
      logUsageEvent({
        event:       'speech_enhance_completed',
        duration_ms: Math.round((recordingDurationRef.current ?? 0) * 1000),
      });

      // Download the audio to the local cache immediately.
      // The user reads their transcript for several seconds — by the time they
      // tap Play, the file is downloaded and expo-av has it loaded.
      if (data.audio_url) {
        preloadAudio(`${API_BASE_URL}${data.audio_url}`);
      }

      analyzeVoiceAsync(rawText, recordingDurationRef.current);
    } catch (e) {
      console.error('[Speech] enhanceText error:', e?.message);
      setErrorMsg(e.message || 'Enhancement failed. Please try again.');
      logUsageEvent({ event: 'speech_enhance_failed', reason: 'api_error' });
      setPhase(S.ERROR);
    }
  }

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

      await fetchWithAuth(`${API_BASE_URL}/api/analyze-voice`, {
        method: 'POST',
        body: form,
      });
    } catch (e) {
      console.warn('[Speech] Voice analysis skipped:', e?.message);
    }
  }

  // ── Audio preload ─────────────────────────────────────────────────────────────

  // Load the ElevenLabs audio directly from its URL into expo-av.
  // Audio.Sound.createAsync handles HTTP buffering natively — no file system
  // download needed, no extra dependency. The Promise resolves once expo-av
  // has buffered enough to play, so by the time the user finishes reading
  // their transcript and taps Play, the sound is ready.
  async function preloadAudio(audioUrl) {
    if (!isMountedRef.current || !audioUrl) return;
    const generation = sessionGenerationRef.current;

    setAudioReady(false);
    setAudioFailed(false);

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: false, rate: 0.85, shouldCorrectPitch: true, volume: 1.0 }
      );

      // Discard if the component unmounted or a new session started while loading.
      if (!isMountedRef.current || sessionGenerationRef.current !== generation) {
        sound.unloadAsync().catch(() => {});
        return;
      }

      preloadedSoundRef.current = sound;
      setAudioReady(true);
    } catch (e) {
      console.error('[Speech] Audio preload failed:', e);
      if (isMountedRef.current && sessionGenerationRef.current === generation) {
        setAudioFailed(true);
      }
    }
  }

  // ── Playback ─────────────────────────────────────────────────────────────────

  async function playEnhanced() {
    if (playbackLockRef.current) return;
    playbackLockRef.current = true;

    try {
      // Replay path: the sound was previously played and is still loaded.
      // Reset position to the beginning and play again.
      if (soundRef.current) {
        setIsPlaying(true);
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          playThroughEarpieceAndroid: false,
        });
        await soundRef.current.setPositionAsync(0);
        await soundRef.current.playAsync();
        return;
      }

      // First play: consume the preloaded sound.
      if (!preloadedSoundRef.current) return; // button should be disabled — shouldn't reach here

      const sound = preloadedSoundRef.current;
      preloadedSoundRef.current = null;

      // audioReady will flip back to true once playback finishes (to allow replay).
      setAudioReady(false);
      soundRef.current = sound;
      setIsPlaying(true);

      sound.setOnPlaybackStatusUpdate(s => {
        if (s.didJustFinish) {
          if (isMountedRef.current) {
            setIsPlaying(false);
            // Re-enable play button so the user can replay via soundRef.
            setAudioReady(true);
          }
        } else if (!s.isLoaded) {
          // expo-av fires this on decode errors or unexpected unloads.
          // Show "Audio unavailable" rather than a stuck spinner.
          if (isMountedRef.current) {
            setIsPlaying(false);
            setAudioFailed(true);
          }
          sound.unloadAsync().catch(() => {});
          if (soundRef.current === sound) soundRef.current = null;
        }
      });

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        playThroughEarpieceAndroid: false,
      });
      await sound.playAsync();

      // First-time play: show motivational message for 4 s.
      const alreadyPlayed = await AsyncStorage.getItem(FIRST_PLAY_KEY).catch(() => 'yes');
      if (!alreadyPlayed && isMountedRef.current) {
        await AsyncStorage.setItem(FIRST_PLAY_KEY, 'true').catch(() => {});
        setFirstPlayMsg("That's you — clearer, stronger.\nThis is what we're working toward.");
        setTimeout(() => { if (isMountedRef.current) setFirstPlayMsg(null); }, 4000);
      }
    } catch {
      if (isMountedRef.current) {
        setIsPlaying(false);
        Alert.alert('Playback Error', 'Could not play the enhanced audio.');
      }
    } finally {
      playbackLockRef.current = false;
    }
  }

  async function stopPlayback() {
    await soundRef.current?.stopAsync();
    setIsPlaying(false);
    // Re-enable the play button in replay mode.
    if (soundRef.current) setAudioReady(true);
  }

  async function shareText() {
    const text = result?.cleaned_transcript || result?.raw_transcript || '';
    try { await Share.share({ message: text }); } catch { }
  }

  const reset = useCallback(() => {
    soundRef.current?.unloadAsync();
    soundRef.current = null;
    preloadedSoundRef.current?.unloadAsync();
    preloadedSoundRef.current = null;
    setIsPlaying(false);
    setAudioReady(false);
    setAudioFailed(false);
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

  // ── Play button state ────────────────────────────────────────────────────────
  // hasAudio: show the play button only when the response included an audio URL.
  const hasAudio = Boolean(result?.audio_url);
  // playBtnLoading: spinner state — audio URL exists but download not yet complete.
  const playBtnLoading = hasAudio && !audioReady && !audioFailed && !isPlaying;
  // playBtnEnabled: tap allowed when expo-av has the sound loaded and ready.
  const playBtnEnabled = audioReady || isPlaying;

  return (
    <LinearGradient
      colors={colors.gradients.app}
      start={{ x: 0.07, y: 0 }}
      end={{ x: 0.93, y: 1 }}
      style={styles.root}
    >
      <StatusBar barStyle="light-content" />

      <ScreenHeader
        navigation={navigation}
        title="Smart Speech"
        titleCentered
        backIcon={phase === S.RECORDING ? '✕' : '←'}
        backLabel={phase === S.RECORDING ? 'Cancel recording' : 'Go back'}
        onBack={() => {
          if (phase === S.RECORDING) stoppingRef.current = true;
          navigation.goBack();
        }}
        rightAction={
          phase === S.RESULTS && result
            ? <SpeakerButton text={result.cleaned_transcript || result.raw_transcript} />
            : undefined
        }
      />

      {/* ── IDLE ──────────────────────────────────────────────────────────── */}
      {phase === S.IDLE && (
        <View style={styles.idleArea}>
          <Text style={[styles.hintText, { fontSize: fs(20) }]}>Tap the mic to begin</Text>
          <View style={{ height: 28 }} />
          <MicGroup onPress={handleMicPress} isRecording={false} disabled={!isOnline} />
          {/* Contextual offline message — shown when NetInfo reports no connection */}
          {!isOnline && (
            <View style={styles.offlineBanner}>
              <Text style={[styles.offlineText, { fontSize: fs(15) }]}>
                Smart Speech needs an internet connection to transcribe your voice.
                Connect to Wi-Fi or mobile data to continue.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── RECORDING ─────────────────────────────────────────────────────── */}
      {phase === S.RECORDING && (
        <View style={styles.recordingArea}>
          <View style={styles.micRow}>
            <MicGroup onPress={handleMicPress} scale={0.78} isRecording />
          </View>

          <Text style={[styles.hintText, { fontSize: fs(20) }]}>Tap mic to finish</Text>

          <View style={styles.liveCard}>
            <ScrollView
              contentContainerStyle={styles.liveCardPad}
              showsVerticalScrollIndicator={false}
            >
              {liveTranscript ? (
                <Text style={[styles.liveText, { fontSize: fs(17), lineHeight: fs(17) * 1.53 }]}>
                  {liveTranscript}
                  {showPending && <PendingDots />}
                </Text>
              ) : (
                <Text style={[styles.liveTextPlaceholder, { fontSize: fs(16) }]}>
                  {showPending ? 'Transcribing…' : 'Listening…'}
                </Text>
              )}
            </ScrollView>

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
          <View style={styles.enhancingCard}>
            <ActivityIndicator size="large" color={ORANGE} />
            <Text style={[styles.enhancingText, { fontSize: fs(22) }]}>Polishing your words…</Text>
            <Text style={[styles.enhancingSubText, { fontSize: fs(15) }]}>
              Enhancing with AI — just a moment
            </Text>
          </View>

          {liveTranscript ? (
            <View style={[styles.liveCard, styles.liveCardDim]}>
              <ScrollView
                contentContainerStyle={styles.liveCardPad}
                showsVerticalScrollIndicator={false}
              >
                <Text style={[styles.liveTextDim, { fontSize: fs(16) }]}>{liveTranscript}</Text>
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
          <TouchableOpacity style={styles.retryBtn} onPress={reset} accessibilityRole="button" accessibilityLabel="Try again">
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── RESULTS ───────────────────────────────────────────────────────── */}
      {phase === S.RESULTS && result && (
        <View style={styles.resultsArea}>
          <View style={styles.transcriptCard}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.transcriptPad}>
              <Text style={[styles.transcriptText, { fontSize: fs(18), lineHeight: fs(18) * 1.56 }]}>
                {result.cleaned_transcript || result.raw_transcript}
              </Text>
            </ScrollView>
          </View>

          {/* Play button — disabled (spinner) while audio is being written and loaded */}
          {hasAudio && (
            <TouchableOpacity
              style={[
                styles.actionBtn,
                styles.actionBtnPlay,
                !playBtnEnabled && styles.actionBtnDisabled,
              ]}
              onPress={isPlaying ? stopPlayback : playEnhanced}
              activeOpacity={playBtnEnabled ? 0.85 : 1}
              disabled={!playBtnEnabled}
              accessibilityRole="button"
              accessibilityLabel={
                playBtnLoading ? 'Preparing audio' :
                isPlaying ? 'Stop audio' :
                'Play enhanced audio'
              }
            >
              {playBtnLoading ? (
                <ActivityIndicator size="small" color="#1A1A1A" />
              ) : audioFailed ? (
                <Text style={[styles.actionLabel, { color: 'rgba(255,255,255,0.40)', fontSize: fs(16) }]}>
                  Audio unavailable
                </Text>
              ) : (
                <>
                  <Text style={[styles.actionLabel, { color: playBtnEnabled ? '#1A1A1A' : 'rgba(255,255,255,0.40)' }]}>
                    {isPlaying ? 'Stop' : 'Play'}
                  </Text>
                  <SpeakerIcon size={22} color={playBtnEnabled ? '#1A1A1A' : 'rgba(255,255,255,0.40)'} />
                </>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.actionBtn} onPress={shareText} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Copy transcript">
            <Text style={styles.actionLabel}>Copy text</Text>
            <ClipboardIcon size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.newRecordBtn} onPress={reset} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Start new recording">
            <Text style={styles.actionLabel}>New recording</Text>
            <MicIcon size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* First-play motivational overlay */}
      {firstPlayMsg ? (
        <View style={styles.firstPlayOverlay} pointerEvents="none">
          <Text style={styles.firstPlayText}>{firstPlayMsg}</Text>
        </View>
      ) : null}
    </LinearGradient>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const WHITE  = '#FFFFFF';
const ORANGE = '#FFA940';

const styles = StyleSheet.create({
  root: { flex: 1 },

  // ── IDLE ──
  idleArea: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },

  // Offline context banner — shown in IDLE state when NetInfo reports no connection.
  offlineBanner: {
    marginTop: 32,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 16,
    paddingHorizontal: 20,
    width: '100%',
    maxWidth: 340,
  },
  offlineText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    letterSpacing: 0.2,
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
    fontSize: 20,
    color: 'rgba(255,255,255,0.80)',
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
    fontSize: 17,
    color: '#111',
    lineHeight: 26,
    letterSpacing: 0.3,
  },
  liveTextDim: {
    fontSize: 16,
    color: '#444',
    lineHeight: 24,
    letterSpacing: 0.3,
  },
  liveTextPlaceholder: {
    fontSize: 16,
    color: 'rgba(28,64,71,0.40)',
    fontStyle: 'italic',
    letterSpacing: 0.5,
  },
  pendingDots: {
    fontSize: 17,
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
    justifyContent: 'center',
    paddingHorizontal: Math.round(20 * SC),
    paddingBottom: 24,
    gap: Math.round(20 * SC),
  },
  enhancingCard: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    paddingVertical: 36,
    paddingHorizontal: 32,
    gap: 18,
  },
  enhancingText: {
    fontSize: 22,
    color: WHITE,
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  enhancingSubText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    letterSpacing: 0.2,
  },

  // ── ERROR ──
  centeredArea: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 16, paddingBottom: 60,
  },
  errorTitle: { fontSize: 22, fontWeight: '700', color: WHITE, textAlign: 'center' },
  retryText:  { color: WHITE, fontSize: 18, fontWeight: '600' },

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
  transcriptText: {
    fontSize: 18,
    color: '#000',
    letterSpacing: 1.2,
    lineHeight: 28,
  },

  actionBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 28,
    height: 56,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  actionBtnPlay: {
    backgroundColor: ORANGE,
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  actionBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    shadowOpacity: 0, elevation: 0,
  },
  actionLabel: { color: WHITE, fontSize: 20, fontWeight: '700', letterSpacing: 1.8 },

  newRecordBtn: {
    backgroundColor: '#48D28C',
    borderRadius: 28,
    height: 56,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    shadowColor: '#48D28C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 5,
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

  errorSub: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.70)',
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: 32,
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: ORANGE,
    borderRadius: 28,
    paddingHorizontal: 32,
    paddingVertical: 20,
  },
});
