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
import { auth } from '../config/firebase';
import { API_BASE_URL } from '../config/env';

const { width: SW } = Dimensions.get('window');
const SC = SW / 402; // Scale factor from Figma 402px frame

// ── Random amoeba blob sets (shown only during recording) ───────────────────
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

// Black circle with mic-shaped evenodd cutout (renders teal ring + teal mic through holes)
const MIC_ICON_SVG = `<svg viewBox="0 0 112 112" fill="none" xmlns="http://www.w3.org/2000/svg">
<path fill-rule="evenodd" clip-rule="evenodd" d="M56 0C86.9279 0 112 25.0721 112 56C112 86.9279 86.9279 112 56 112C25.0721 112 0 86.9279 0 56C0 25.0721 25.0721 0 56 0ZM28 54C28 61 30.2665 67.1337 34.7998 72.4004C39.3331 77.667 45.0667 80.7669 52 81.7002V94H60V81.7002C66.9333 80.7669 72.6669 77.667 77.2002 72.4004C81.7335 67.1337 84 61 84 54H76C76.0053 59.5333 74.0563 64.2498 70.1523 68.1484C66.2484 72.0471 61.5306 73.9973 56 74C50.4693 74.0027 45.7529 72.0537 41.8516 68.1523C37.9503 64.251 36 59.5333 36 54H28ZM56 18C52.6667 18 49.8333 19.1667 47.5 21.5C45.1667 23.8333 44 26.6667 44 30V54C44 57.3333 45.1667 60.1667 47.5 62.5C49.8333 64.8333 52.6667 66 56 66C59.3333 66 62.1667 64.8333 64.5 62.5C66.8333 60.1667 68 57.3333 68 54V30C68 26.6667 66.8333 23.8333 64.5 21.5C62.1667 19.1667 59.3333 18 56 18Z" fill="#000000"/>
</svg>`;

// ── Mic group: plain circle when idle, random amoeba blobs when recording ───
function MicGroup({ onPress, scale = 1, isRecording = false }) {
  const s = SC * scale;
  const gW = Math.round(291 * s);
  const gH = Math.round(307 * s);

  // Pick a random blob set when recording starts and hold it for the session
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

  // When idle — just the circle + mic, no blobs
  if (!isRecording) {
    const circleSize = Math.round(157 * SC);
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.88}
        style={{ width: circleSize, height: circleSize, alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={{
          width: circleSize,
          height: circleSize,
          borderRadius: circleSize / 2,
          backgroundColor: '#2D6974',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <SvgXml xml={MIC_ICON_SVG} width={Math.round(112 * SC)} height={Math.round(112 * SC)} />
        </View>
      </TouchableOpacity>
    );
  }

  // When recording — amoeba blobs + circle + mic
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} style={{ width: gW, height: gH }}>
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: gW, height: gH,
        justifyContent: 'center', alignItems: 'center', transform: [{ scale: pulseAnim }] }}>
        <View style={{ width: gW, height: gH, transform: [{ rotate: '-148.88deg' }] }}>
          <SvgXml xml={blobSet.current.a} width="100%" height="100%" />
        </View>
      </Animated.View>
      <Animated.View style={{ position: 'absolute', left: Math.round(20 * s), top: Math.round(53 * s),
        transform: [{ scale: pulseAnim }] }}>
        <SvgXml xml={blobSet.current.b} width={Math.round(246 * s)} height={Math.round(221 * s)} />
      </Animated.View>
      {/* Mic circle */}
      <View style={{
        position: 'absolute',
        left: Math.round(83 * s),
        top: Math.round(78 * s),
        width: Math.round(157 * s),
        height: Math.round(157 * s),
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

// ── Screen states ───────────────────────────────────────────────────────────
const S = { IDLE: 'idle', RECORDING: 'recording', PROCESSING: 'processing', RESULTS: 'results', ERROR: 'error' };

// ── Main screen ─────────────────────────────────────────────────────────────
export default function SpeechEnhancementScreen({ navigation }) {
  const [phase, setPhase] = useState(S.IDLE);
  const [result, setResult] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const recordingRef = useRef(null);
  const soundRef = useRef(null);

  useEffect(() => {
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  // ── Recording ─────────────────────────────────────────────────────────────
  async function startRecording() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Microphone Required', 'Please enable microphone access in your device settings.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setPhase(S.RECORDING);
    } catch {
      Alert.alert('Error', 'Could not start recording.');
    }
  }

  async function stopRecording() {
    if (!recordingRef.current) return;
    try {
      setPhase(S.PROCESSING);
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      await uploadAudio(uri);
    } catch {
      setErrorMsg('Recording failed. Please try again.');
      setPhase(S.ERROR);
    }
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  async function uploadAudio(uri) {
    try {
      const form = new FormData();
      form.append('file', { uri, type: 'audio/m4a', name: 'recording.m4a' });

      // Include the user's Firebase UID so the backend can use their cloned
      // voice for synthesis if one exists. Falls back gracefully if null.
      const uid = auth.currentUser?.uid;
      if (uid) form.append('user_id', uid);

      const res = await fetch(`${API_BASE_URL}/api/process-audio`, { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error (${res.status})`);
      }
      setResult(await res.json());
      setPhase(S.RESULTS);
    } catch (e) {
      setErrorMsg(e.message || 'Processing failed. Please try again.');
      setPhase(S.ERROR);
    }
  }

  // ── Playback ──────────────────────────────────────────────────────────────
  async function playEnhanced() {
    if (!result?.audio_url) return;
    try {
      if (soundRef.current) { await soundRef.current.unloadAsync(); soundRef.current = null; }
      const { sound } = await Audio.Sound.createAsync(
        { uri: `${API_BASE_URL}${result.audio_url}` },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      setIsPlaying(true);
      sound.setOnPlaybackStatusUpdate(s => { if (s.didJustFinish || !s.isLoaded) setIsPlaying(false); });
    } catch {
      Alert.alert('Playback Error', 'Could not play the enhanced audio.');
    }
  }

  async function stopPlayback() { await soundRef.current?.stopAsync(); setIsPlaying(false); }

  async function shareText() {
    const text = result?.cleaned_transcript || result?.raw_transcript || '';
    try { await Share.share({ message: text }); } catch { }
  }

  const reset = useCallback(() => {
    soundRef.current?.unloadAsync(); soundRef.current = null;
    setIsPlaying(false); setResult(null); setErrorMsg(''); setPhase(S.IDLE);
  }, []);

  const handleMicPress = () => {
    if (phase === S.IDLE) startRecording();
    else if (phase === S.RECORDING) stopRecording();
  };

  return (
    <LinearGradient
      colors={['#E0ECDE', '#68B39F']}
      start={{ x: 0.07, y: 0 }}
      end={{ x: 0.93, y: 1 }}
      style={styles.root}
    >
      <StatusBar barStyle="dark-content" />

      {/* Back button — hidden while recording */}
      {phase !== S.RECORDING && (
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
      )}

      {/* Title — always visible */}
      <Text style={styles.title}>Speech{'\n'}Enhancement</Text>

      {/* ── IDLE ─────────────────────────────────────────────────────────── */}
      {phase === S.IDLE && (
        <View style={styles.idleArea}>
          <MicGroup onPress={handleMicPress} scale={1} isRecording={false} />
          <Text style={styles.hintText}>Press mic to start</Text>
        </View>
      )}

      {/* ── RECORDING ────────────────────────────────────────────────────── */}
      {phase === S.RECORDING && (
        <View style={styles.recordingArea}>
          <MicGroup onPress={handleMicPress} scale={0.85} isRecording={true} />
          <Text style={styles.hintText}>Press mic to finish</Text>
          <View style={styles.liveCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.liveCardText}>
                Press the button above and start speaking
              </Text>
            </ScrollView>
          </View>
        </View>
      )}

      {/* ── PROCESSING ───────────────────────────────────────────────────── */}
      {phase === S.PROCESSING && (
        <View style={styles.centeredArea}>
          <ActivityIndicator size="large" color="#1C4047" />
          <Text style={styles.processingText}>Enhancing your speech…</Text>
        </View>
      )}

      {/* ── ERROR ────────────────────────────────────────────────────────── */}
      {phase === S.ERROR && (
        <View style={styles.centeredArea}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorSub}>{errorMsg}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={reset}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── RESULTS ──────────────────────────────────────────────────────── */}
      {phase === S.RESULTS && result && (
        <View style={styles.resultsArea}>
          {/* Voice profile badge */}
          {result.voice_profile && (
            <View style={styles.profileBadge}>
              <Text style={styles.profileBadgeText}>
                🎙 {result.voice_profile.name}  ·  {result.voice_profile.description}
              </Text>
            </View>
          )}
          {/* Transcript card */}
          <View style={styles.transcriptCard}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.transcriptPad}>
              <Text style={styles.transcriptText}>
                {result.cleaned_transcript || result.raw_transcript}
              </Text>
            </ScrollView>
          </View>

          {/* Play button */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={isPlaying ? stopPlayback : playEnhanced}
            activeOpacity={0.85}
          >
            <Text style={styles.actionLabel}>{isPlaying ? 'Stop' : 'Play'}</Text>
            <Text style={styles.actionIcon}>🔊</Text>
          </TouchableOpacity>

          {/* Copy text button */}
          <TouchableOpacity style={styles.actionBtn} onPress={shareText} activeOpacity={0.85}>
            <Text style={styles.actionLabel}>Copy text</Text>
            <Text style={styles.actionIcon}>📋</Text>
          </TouchableOpacity>

          {/* Copy audio button */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => Alert.alert('Copy Audio', 'Not supported on this device.')}
            activeOpacity={0.85}
          >
            <Text style={styles.actionLabel}>Copy audio</Text>
            <Text style={styles.actionIcon}>🎵</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.newRecordBtn} onPress={reset}>
            <Text style={styles.newRecordText}>New recording</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Wave logo — always bottom-right */}
      <Image
        source={require('../../assets/images/wave-logo.png')}
        style={styles.waveLogo}
        resizeMode="contain"
      />
    </LinearGradient>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },

  backBtn: {
    position: 'absolute',
    top: 52,
    left: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  backArrow: { color: '#1C4047', fontSize: 18, fontWeight: '600' },

  // Title — Figma: 45px, center, letterSpacing 2.25, top=56
  title: {
    marginTop: Math.round(56 * SC),
    fontSize: Math.round(45 * SC),
    fontWeight: '800',
    color: '#1C4047',
    textAlign: 'center',
    letterSpacing: 2.25,
    lineHeight: Math.round(70 * SC),
  },

  // IDLE
  idleArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },

  // RECORDING
  recordingArea: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 8,
  },
  liveCard: {
    flex: 1,
    marginTop: 16,
    marginBottom: 28,
    marginHorizontal: Math.round(54 * SC),
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    alignSelf: 'stretch',
  },
  liveCardText: {
    fontSize: Math.round(16 * SC),
    color: '#000000',
    letterSpacing: 1.6,
    lineHeight: 24,
  },

  // Hint text — Figma: Kulim Park, 24px, letterSpacing 2.4
  hintText: {
    marginTop: 24,
    fontSize: Math.round(24 * SC),
    color: '#1C4047',
    letterSpacing: 2.4,
    textAlign: 'center',
  },

  // PROCESSING / ERROR
  centeredArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingBottom: 60,
  },
  processingText: {
    fontSize: 20,
    color: '#1C4047',
    fontWeight: '600',
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1C4047',
    textAlign: 'center',
  },
  errorSub: {
    fontSize: 15,
    color: 'rgba(28,64,71,0.6)',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 32,
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: '#1C4047',
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  retryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },

  profileBadge: {
    backgroundColor: 'rgba(44,105,116,0.15)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: 'center',
  },
  profileBadgeText: {
    fontSize: Math.round(13 * SC),
    color: '#1C4047',
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // RESULTS — Figma: card left=57, w=294, buttons left=58, w=291, h=52, rounded=20
  resultsArea: {
    flex: 1,
    paddingHorizontal: Math.round(57 * SC),
    paddingBottom: 28,
    gap: Math.round(14 * SC),
  },
  transcriptCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  transcriptPad: {
    padding: 20,
  },
  transcriptText: {
    fontSize: Math.round(16 * SC),
    color: '#000000',
    letterSpacing: 1.6,
    lineHeight: 24,
  },

  // Action buttons — Figma: black pill, h=52, rounded=20
  actionBtn: {
    backgroundColor: '#000000',
    borderRadius: Math.round(20 * SC),
    height: Math.round(52 * SC),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  actionLabel: {
    color: '#FFFFFF',
    fontSize: Math.round(24 * SC),
    fontWeight: '700',
    letterSpacing: 2.4,
  },
  actionIcon: {
    fontSize: Math.round(20 * SC),
  },

  newRecordBtn: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  newRecordText: {
    color: '#1C4047',
    fontSize: Math.round(15 * SC),
    letterSpacing: 0.5,
  },

  // Wave logo — Figma: left=245, top=814, w=146, h=55
  waveLogo: {
    position: 'absolute',
    bottom: 24,
    right: Math.round(16 * SC),
    width: Math.round(146 * SC),
    height: Math.round(55 * SC),
  },
});
