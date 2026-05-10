/**
 * FunctionalSpeechExercise  —  Hear & Repeat
 *
 * Matches Figma "Excercise Type 33 / 36 / 37":
 *   Type 33 — Intro screen: "Functional Speech" title + speech bubbles
 *   Type 36 — Exercise:  speaker icon → word in quotes → orange mic blob
 *   Type 37 — Wrong/retry drawer: "Doesn't sound correct. Give it another try!"
 *
 * The exercise plays TTS for each item, opens the mic, and checks whether the
 * user produced enough volume.  Items progress: 2 words → 2 phrases → 1 sentence.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../../../config/firebase';
import CantDoNow from '../../../components/CantDoNow';
import { API_BASE_URL } from '../../../config/env';

const { width: W, height: H } = Dimensions.get('window');
const SC = W / 402;

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  bg:       '#1C4047',
  teal:     '#2D6974',
  tealMid:  '#3D7B85',
  tealBlob: '#264E56',     // dark blob blobs
  blobMid:  '#2A5C65',
  orange:   '#FE9C2D',
  white:    '#FFFFFF',
  textDim:  'rgba(255,255,255,0.6)',
};

// ── Constants ─────────────────────────────────────────────────────────────────
const INTRO_KEY       = '@eloqua_functional_speech_demo_seen';
const HEAR_DELAY_MS   = 350;   // wait before TTS fires on new item
const AUTO_SPEAK_MS   = 2800;  // auto-open mic after hearing
const MAX_RECORD_MS   = 5000;  // mic timeout → wrong-answer drawer
const MIN_SPEAK_MS    = 220;
const CALIBRATION_MS  = 1500;
const MIN_THRESHOLD   = 0.28;
const MAX_THRESHOLD   = 0.70;
const SUCCESS_HOLD_MS = 700;

// ── Word banks ─────────────────────────────────────────────────────────────────
const WORDS = [
  'Hello', 'Please', 'Thanks', 'Water', 'Help',
  'Sorry', 'Okay', 'Yes', 'Stop', 'Good',
];
const PHRASES = [
  'Good morning',    'Thank you',        'Excuse me',
  'How are you',     'I need help',      'Just a moment',
  'Can you hear me', 'See you later',    'Come in please',
  'Hold on please',
];
const SENTENCES = [
  'Could I have a glass of water',
  'Good morning, how are you today',
  'Can you please speak a little louder',
  'I would like to order something',
  'Thank you very much for your help',
  'I am sorry, I did not catch that',
  'Please wait while I get ready',
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildItems() {
  return [
    ...shuffle(WORDS).slice(0, 1).map(t => ({ text: t, level: 'word' })),
    ...shuffle(PHRASES).slice(0, 2).map(t => ({ text: t, level: 'phrase' })),
    ...shuffle(SENTENCES).slice(0, 1).map(t => ({ text: t, level: 'sentence' })),
  ];
}

// ── Organic blob shape (drawn with overlapping ellipses like the Figma) ────────
function MicBlob({ pulsing }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (pulsing) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.1, duration: 700, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1.0, duration: 700, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulse.setValue(1);
    }
  }, [pulsing]);

  const blobW = 200 * SC;
  const blobH = 180 * SC;
  const btnSz = 72 * SC;

  return (
    <Animated.View style={[styles.blobOuter, { transform: [{ scale: pulse }] }]}>
      {/* Organic blob made from irregular overlapping ellipses */}
      <View style={[styles.blobEllipseA, { width: blobW, height: blobH }]} />
      <View style={[styles.blobEllipseB, { width: blobW * 0.7, height: blobH * 0.55 }]} />
      <View style={[styles.blobEllipseC, { width: blobW * 0.55, height: blobH * 0.4 }]} />

      {/* Orange mic button */}
      <View style={[styles.micBtn, { width: btnSz, height: btnSz, borderRadius: btnSz / 2 }]}>
        <Text style={styles.micIcon}>🎙️</Text>
      </View>
    </Animated.View>
  );
}

// ── Intro screen (Figma Type 33) ───────────────────────────────────────────────
function IntroScreen({ onStart, onExit, progress }) {
  // progress = fraction 0–1 for the orange bar
  const barW = 314 * SC;
  const fillW = barW * progress;

  return (
    <View style={styles.introRoot}>
      <StatusBar barStyle="light-content" />

      {/* X exit */}
      <View style={styles.introTopRow}>
        <TouchableOpacity style={styles.introXBtn} onPress={onExit}>
          <Text style={styles.introXText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Centred content */}
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={styles.introTitle}>Functional{'\n'}Speech</Text>

        {/* Speech bubbles */}
        <View style={styles.bubblesWrap}>
          <View style={styles.bubbleLarge}>
            <Text style={styles.bubbleDots}>• • •</Text>
          </View>
          <View style={styles.bubbleSmall}>
            <Text style={styles.bubbleDots}>• • •</Text>
          </View>
        </View>
      </View>

      {/* Arrow button */}
      <TouchableOpacity style={styles.introArrowBtn} onPress={onStart}>
        <Text style={styles.introArrowText}>→</Text>
      </TouchableOpacity>

      {/* Gap between arrow and progress bar */}
      <View style={{ height: 60 }} />

      {/* Bottom progress bar */}
      <View style={styles.introBarTrack}>
        <View style={[styles.introBarFill, { width: fillW }]} />
      </View>
    </View>
  );
}

// ── Main exercise screen ───────────────────────────────────────────────────────
function ExerciseScreen({ onComplete, onExit, onShowDemo, onSkip }) {
  const items   = useRef(buildItems()).current;
  const TOTAL   = items.length; // 5

  const [displayIdx, setDisplayIdx]     = useState(0);
  const [phase, setPhase]               = useState('hear'); // 'hear' | 'speak' | 'wrong' | 'success'
  const [drawerVisible, setDrawerVisible] = useState(false);

  const phaseRef          = useRef('hear');
  const itemIdxRef        = useRef(0);
  const recordingRef      = useRef(null);
  const holdTimerRef      = useRef(null);
  const hearTimerRef      = useRef(null);
  const maxTimerRef       = useRef(null);
  const adaptiveThreshRef = useRef(MIN_THRESHOLD);
  const calibrateTimerRef = useRef(null);
  const drawerAnim    = useRef(new Animated.Value(0)).current;  // 0=hidden 1=shown
  const cardScale     = useRef(new Animated.Value(0.88)).current;
  const successOpac   = useRef(new Animated.Value(0)).current;

  // Idle encouragement
  const idleTimerRef  = useRef(null);
  const idleOpacity   = useRef(new Animated.Value(0)).current;
  const [idleMsg, setIdleMsg] = useState('');
  const IDLE_MESSAGES = [
    "Come on, you've got this! 💪",
    "Take a breath and give it a go!",
    "You're doing great. Try speaking now!",
    "Whenever you're ready, say it out loud!",
    "A little louder. You can do it!",
  ];
  const idleMsgIdxRef = useRef(0);

  function startIdleTimer() {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      const msg = IDLE_MESSAGES[idleMsgIdxRef.current % IDLE_MESSAGES.length];
      idleMsgIdxRef.current += 1;
      setIdleMsg(msg);
      Animated.timing(idleOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      setTimeout(() => {
        Animated.timing(idleOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setIdleMsg(''));
      }, 3000);
    }, 7000);
  }

  function clearIdleTimer() {
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    Animated.timing(idleOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setIdleMsg(''));
  }

  const item       = items[displayIdx];
  const barFraction = (displayIdx) / TOTAL;

  // ── Drawer ────────────────────────────────────────────────────────────────
  function showDrawer() {
    setDrawerVisible(true);
    Animated.spring(drawerAnim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
  }
  function hideDrawer(cb) {
    Animated.timing(drawerAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
      setDrawerVisible(false);
      cb && cb();
    });
  }

  // ── Audio helpers ─────────────────────────────────────────────────────────
  async function setPlaybackMode() {
    try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }); }
    catch (_) {}
  }
  async function setRecordMode() {
    try { await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true }); }
    catch (_) {}
  }
  async function stopRecording() {
    clearTimeout(holdTimerRef.current);
    clearTimeout(maxTimerRef.current);
    holdTimerRef.current = null;
    maxTimerRef.current = null;
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (rec) {
      try { await rec.stopAndUnloadAsync(); } catch (_) {}
    }
  }

  function onMeterUpdate(status) {
    if (!status.isRecording || (phaseRef.current !== 'speak')) return;
    const db  = status.metering ?? -160;
    const vol = Math.max(0, Math.min(1, (db + 70) / 60));
    if (vol > adaptiveThreshRef.current) {
      if (!holdTimerRef.current) {
        holdTimerRef.current = setTimeout(() => {
          holdTimerRef.current = null;
          if (phaseRef.current === 'speak') handleSuccess();
        }, MIN_SPEAK_MS);
      }
    } else {
      if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    }
  }

  async function startRecording() {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { handleWrong(); return; }
      await setRecordMode();
      const { recording } = await Audio.Recording.createAsync(
        {
          android: Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
          ios:     Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
          web:     {},
          isMeteringEnabled: true,
        },
        onMeterUpdate,
        80,
      );
      recordingRef.current = recording;
      // Timeout → wrong answer drawer
      maxTimerRef.current = setTimeout(() => {
        if (phaseRef.current === 'speak') handleWrong();
      }, MAX_RECORD_MS);
    } catch (_) {
      handleWrong();
    }
  }

  // ── Phase transitions ─────────────────────────────────────────────────────
  function loadItem(idx) {
    const it = items[idx];
    phaseRef.current = 'hear';
    setPhase('hear');
    cardScale.setValue(0.86);
    Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, friction: 7 }).start();
    // Play TTS — use enhanced voice for more natural speech
    setTimeout(async () => {
      if (phaseRef.current !== 'hear') return;
      await setPlaybackMode();
      Speech.speak(it.text, {
        language: 'en-GB',          // British English tends to sound more natural
        rate: 0.80,                 // Slightly slower for elderly users
        pitch: 1.05,                // Slightly warmer pitch
        // iOS: prefer enhanced quality voice
        voice: 'com.apple.voice.enhanced.en-GB.Daniel',
      });
    }, HEAR_DELAY_MS);
    // Auto-open mic
    hearTimerRef.current = setTimeout(() => {
      if (phaseRef.current === 'hear') openMic();
    }, AUTO_SPEAK_MS);
  }

  async function openMic() {
    clearTimeout(hearTimerRef.current);
    try { Speech.stop(); } catch (_) {}
    phaseRef.current = 'speak';
    setPhase('speak');
    startIdleTimer();
    await stopRecording();
    await startRecording();
  }

  async function handleSuccess() {
    if (phaseRef.current === 'success' || phaseRef.current === 'checking') return;
    clearIdleTimer();
    clearTimeout(hearTimerRef.current);
    clearTimeout(maxTimerRef.current);
    phaseRef.current = 'checking';
    setPhase('checking');

    // Stop recording and get URI for STT
    const rec = recordingRef.current;
    recordingRef.current = null;
    let uri = null;
    if (rec) {
      try { await rec.stopAndUnloadAsync(); uri = rec.getURI(); } catch (_) {}
    }

    await checkTranscript(uri);
  }

  async function checkTranscript(uri) {
    const targetText = items[itemIdxRef.current].text;

    // No audio — be lenient for short words
    if (!uri) { doAdvance(); return; }

    try {
      const form = new FormData();
      form.append('file', { uri, type: 'audio/m4a', name: 'speech.m4a' });
      const uid = auth.currentUser?.uid;
      if (uid) form.append('user_id', uid);
      const res = await fetch(`${API_BASE_URL}/api/process-audio`, { method: 'POST', body: form });
      const data = await res.json();
      const transcript = (data.raw_transcript || data.cleaned_transcript || '').toLowerCase().trim();

      if (textMatches(transcript, targetText)) {
        doAdvance();
      } else {
        // Transcript didn't match — show wrong drawer for retry
        phaseRef.current = 'wrong';
        setPhase('wrong');
        showDrawer();
      }
    } catch (_) {
      // Network/API error — be lenient, advance
      doAdvance();
    }
  }

  function textMatches(transcript, target) {
    if (!transcript) return true; // lenient: no transcript → assume ok
    const t = target.toLowerCase();
    // Exact or partial match
    if (transcript.includes(t)) return true;
    // Word-level partial: at least half the target words appear
    const targetWords = t.split(/\s+/);
    const matchCount = targetWords.filter(w => transcript.includes(w)).length;
    if (targetWords.length === 1) {
      // Single word — allow common STT variants
      const ALTS = {
        'hello': ['hello', 'helo', 'hallow', 'yellow'],
        'please': ['please', 'pleas', 'plies'],
        'thanks': ['thanks', 'tanks', 'thank'],
        'water': ['water', 'wader', 'wider'],
        'help': ['help', 'held', 'hell'],
        'sorry': ['sorry', 'sori', 'story'],
        'okay': ['okay', 'ok ', 'o k'],
        'yes': ['yes', 'yep', 'yeah', 'yea'],
        'stop': ['stop', 'top', 'stomp'],
        'good': ['good', 'god ', 'got'],
      };
      return (ALTS[t] || [t]).some(alt => transcript.includes(alt));
    }
    return matchCount >= Math.ceil(targetWords.length * 0.5);
  }

  function doAdvance() {
    phaseRef.current = 'success';
    setPhase('success');
    successOpac.setValue(0);
    Animated.sequence([
      Animated.timing(successOpac, { toValue: 1, duration: 130, useNativeDriver: true }),
      Animated.delay(400),
      Animated.timing(successOpac, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(advance);
  }

  function handleWrong() {
    if (phaseRef.current === 'success' || phaseRef.current === 'wrong' || phaseRef.current === 'checking') return;
    clearIdleTimer();
    clearTimeout(hearTimerRef.current);
    phaseRef.current = 'wrong';
    setPhase('wrong');
    stopRecording();
    showDrawer();
  }

  function advance() {
    const next = itemIdxRef.current + 1;
    if (next >= TOTAL) { onComplete(); return; }
    itemIdxRef.current = next;
    setDisplayIdx(next);
    loadItem(next);
  }

  function retryItem() {
    hideDrawer(() => {
      loadItem(itemIdxRef.current);
    });
  }

  // ── Ambient calibration then start ────────────────────────────────────────
  async function calibrateAmbient() {
    const ambientSamples = [];
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        {
          android: Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
          ios:     Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
          web:     {},
          isMeteringEnabled: true,
        },
        (status) => {
          if (!status.isRecording) return;
          const db  = status.metering ?? -160;
          const vol = Math.min(1, Math.max(0, (db + 70) / 60));
          ambientSamples.push(vol);
        },
        80,
      );
      calibrateTimerRef.current = setTimeout(async () => {
        calibrateTimerRef.current = null;
        if (ambientSamples.length > 0) {
          const sorted = [...ambientSamples].sort((a, b) => a - b);
          const p90 = sorted[Math.floor(sorted.length * 0.90)] ?? MIN_THRESHOLD;
          adaptiveThreshRef.current = Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, p90 * 1.6 + 0.12));
        }
        try { await recording.stopAndUnloadAsync(); } catch (_) {}
        loadItem(0);
      }, CALIBRATION_MS);
    } catch (_) {
      adaptiveThreshRef.current = MIN_THRESHOLD;
      loadItem(0);
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    calibrateAmbient();
    return () => {
      if (calibrateTimerRef.current) clearTimeout(calibrateTimerRef.current);
      clearTimeout(hearTimerRef.current);
      clearTimeout(holdTimerRef.current);
      clearTimeout(maxTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      stopRecording();
      try { Speech.stop(); } catch (_) {}
    };
  }, []);

  // Drawer translateY: slides up from bottom
  const drawerTranslate = drawerAnim.interpolate({
    inputRange: [0, 1], outputRange: [260 * SC, 0],
  });

  const barFill = Math.max(0.02, barFraction);

  return (
    <View style={styles.exRoot}>
      <StatusBar barStyle="light-content" />

      {/* ── Top row ── */}
      <View style={styles.exTopRow}>
        <TouchableOpacity style={styles.exXBtn} onPress={onExit}>
          <Text style={styles.exXText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.exRepeatLabel}>Repeat</Text>
        <TouchableOpacity style={styles.exHelpBtn} onPress={onShowDemo}>
          <Text style={styles.exHelpText}>?</Text>
        </TouchableOpacity>
      </View>

      {/* ── Speaker icon (tap to replay TTS) ── */}
      <TouchableOpacity
        style={styles.speakerBtn}
        onPress={async () => {
          await setPlaybackMode();
          Speech.speak(item.text, { language: 'en-GB', rate: 0.80, pitch: 1.05, voice: 'com.apple.voice.enhanced.en-GB.Daniel' });
        }}
        accessibilityLabel="Tap to hear the word"
      >
        <Text style={styles.speakerIcon}>🔊</Text>
      </TouchableOpacity>

      {/* ── Word in quotes ── */}
      <Animated.View style={{ transform: [{ scale: cardScale }] }}>
        <Text
          style={[
            styles.wordText,
            item.text.length > 18 && styles.wordTextMed,
            item.text.length > 28 && styles.wordTextSm,
          ]}
          adjustsFontSizeToFit
          numberOfLines={2}
        >
          {`"${item.text}"`}
        </Text>
      </Animated.View>

      {/* ── Phase indicator ── */}
      <Text style={styles.phaseHint}>
        {phase === 'hear'     ? 'Listen carefully…'  :
         phase === 'speak'    ? 'Say it now, loud!'  :
         phase === 'checking' ? 'Checking…'          :
         phase === 'success'  ? 'Well done!'         :
                                'Give it another try…'}
      </Text>

      {/* ── Mic blob (shown during hear/speak/checking phases) ── */}
      {(phase === 'hear' || phase === 'speak' || phase === 'checking') && (
        <View style={styles.blobArea}>
          <MicBlob pulsing={phase === 'speak'} />
        </View>
      )}

      {/* ── "Speak" tap shortcut during hear phase ── */}
      {phase === 'hear' && (
        <TouchableOpacity style={styles.readyBtn} onPress={openMic}>
          <Text style={styles.readyBtnText}>I'm ready →</Text>
        </TouchableOpacity>
      )}

      {/* ── Can't do now ── */}
      <CantDoNow onSkip={onSkip} onEnd={onExit} style={{ marginBottom: 8 * SC }} />

      {/* ── Bottom progress bar ── */}
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: (314 * SC) * barFill }]} />
      </View>

      {/* ── Wrong-answer drawer (Figma Type 37) ── */}
      {drawerVisible && (
        <Animated.View style={[styles.drawer, { transform: [{ translateY: drawerTranslate }] }]}>
          <Text style={styles.drawerText}>
            Doesn't sound correct.{'\n'}Give it another try!
          </Text>
          <TouchableOpacity style={styles.drawerArrow} onPress={retryItem}>
            <Text style={styles.drawerArrowText}>→</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Success flash overlay ── */}
      <Animated.View
        pointerEvents="none"
        style={[styles.successFlash, { opacity: successOpac }]}
      />

      {/* ── Idle encouragement overlay ── */}
      {!!idleMsg && (
        <Animated.View pointerEvents="none" style={[styles.idleOverlay, { opacity: idleOpacity }]}>
          <Text style={styles.idleText}>{idleMsg}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function FunctionalSpeechExercise({ onComplete, onExit }) {
  // TODO (production): read INTRO_KEY from AsyncStorage to show only once.
  // For testing, always show the intro first.
  const [showIntro, setShowIntro] = useState(true);

  return showIntro
    ? <IntroScreen onStart={() => setShowIntro(false)} onExit={onExit} progress={0} />
    : <ExerciseScreen onComplete={onComplete} onExit={onExit} onShowDemo={() => setShowIntro(true)} onSkip={onComplete} />;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Intro ──────────────────────────────────────────────────────────────────
  introRoot: {
    flex: 1, backgroundColor: C.bg,
    paddingHorizontal: 24 * SC,
    alignItems: 'flex-start',
  },
  introTopRow: {
    paddingTop: 52 * SC, marginBottom: 40 * SC,
  },
  introXBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center', alignItems: 'center',
  },
  introXText: { color: C.white, fontSize: 22, fontWeight: '600', includeFontPadding: false, textAlign: 'center', lineHeight: 22 },

  introTitle: {
    color: C.white, fontSize: 56 * SC, fontWeight: '900',
    letterSpacing: 2, lineHeight: 66 * SC, marginBottom: 36 * SC,
  },

  bubblesWrap: {
    flexDirection: 'row', alignItems: 'flex-end',
    gap: -12 * SC, marginBottom: 60 * SC,
  },
  bubbleLarge: {
    width: 107 * SC, height: 107 * SC, borderRadius: 18 * SC,
    backgroundColor: C.tealMid,
    justifyContent: 'center', alignItems: 'center',
    // speech tail
    marginRight: -12 * SC,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 6, elevation: 4,
  },
  bubbleSmall: {
    width: 83 * SC, height: 83 * SC, borderRadius: 14 * SC,
    backgroundColor: C.teal,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: -16 * SC,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 6, elevation: 4,
  },
  bubbleDots: { color: C.white, fontSize: 18 * SC, letterSpacing: 3, fontWeight: '700' },

  introArrowBtn: {
    alignSelf: 'center',
    width: 80, height: 64, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center', alignItems: 'center',
  },
  introArrowText: { color: C.white, fontSize: 26, fontWeight: '300' },

  introBarTrack: {
    position: 'absolute', bottom: 28 * SC,
    left: (W - 314 * SC) / 2,
    width: 314 * SC, height: 12 * SC, borderRadius: 13 * SC,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  introBarFill: {
    height: 12 * SC, borderRadius: 13 * SC,
    backgroundColor: C.orange,
  },

  // ── Exercise ──────────────────────────────────────────────────────────────
  exRoot: { flex: 1, backgroundColor: C.bg },

  exTopRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52 * SC, paddingHorizontal: 18 * SC,
    marginBottom: 10 * SC,
  },
  exXBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center', alignItems: 'center',
  },
  exXText: { color: C.white, fontSize: 22, fontWeight: '600', includeFontPadding: false, textAlign: 'center', lineHeight: 22 },
  exRepeatLabel: {
    flex: 1, color: C.white, fontSize: 26 * SC, fontWeight: '800',
    letterSpacing: 1, marginLeft: 14 * SC,
  },
  exHelpBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: C.orange, justifyContent: 'center', alignItems: 'center',
    shadowColor: C.orange, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.50, shadowRadius: 10, elevation: 8,
  },
  exHelpText: { color: C.white, fontSize: 24, fontWeight: '900', includeFontPadding: false, textAlign: 'center', lineHeight: 24 },

  speakerBtn: {
    alignSelf: 'center', marginTop: 14 * SC, marginBottom: 8 * SC,
  },
  speakerIcon: { fontSize: 52 * SC },

  wordText: {
    color: C.white, fontSize: 46 * SC, fontWeight: '800',
    letterSpacing: 2, textAlign: 'center',
    paddingHorizontal: 22 * SC, lineHeight: 58 * SC,
  },
  wordTextMed: { fontSize: 34 * SC, lineHeight: 44 * SC },
  wordTextSm:  { fontSize: 24 * SC, lineHeight: 34 * SC },

  phaseHint: {
    color: C.textDim, fontSize: 16 * SC, textAlign: 'center',
    marginTop: 10 * SC, letterSpacing: 0.4,
  },

  blobArea: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
  },

  // Blob
  blobOuter: {
    width: 220 * SC, height: 200 * SC,
    justifyContent: 'center', alignItems: 'center',
    position: 'relative',
  },
  blobEllipseA: {
    position: 'absolute',
    backgroundColor: C.tealBlob,
    borderRadius: 999,
    transform: [{ rotate: '-15deg' }],
  },
  blobEllipseB: {
    position: 'absolute',
    top: 20 * SC, left: 20 * SC,
    backgroundColor: C.blobMid,
    borderRadius: 999,
    transform: [{ rotate: '20deg' }],
  },
  blobEllipseC: {
    position: 'absolute',
    bottom: 16 * SC, right: 16 * SC,
    backgroundColor: C.tealBlob,
    borderRadius: 999,
    transform: [{ rotate: '-30deg' }],
  },
  micBtn: {
    backgroundColor: C.orange,
    justifyContent: 'center', alignItems: 'center',
    zIndex: 1,
    shadowColor: C.orange, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45, shadowRadius: 8, elevation: 6,
  },
  micIcon: { fontSize: 32 * SC },

  readyBtn: {
    alignSelf: 'center', marginBottom: 16 * SC,
    backgroundColor: C.teal, borderRadius: 20 * SC,
    paddingVertical: 12 * SC, paddingHorizontal: 28 * SC,
  },
  readyBtnText: { color: C.white, fontSize: 15 * SC, fontWeight: '700' },

  // Bottom bar
  barTrack: {
    alignSelf: 'center', marginBottom: 28 * SC,
    width: 314 * SC, height: 12 * SC, borderRadius: 13 * SC,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  barFill: {
    height: 12 * SC, borderRadius: 13 * SC,
    backgroundColor: C.orange,
  },

  // Wrong-answer drawer (Figma Type 37)
  drawer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.teal,
    paddingVertical: 28 * SC, paddingHorizontal: 24 * SC,
    borderTopLeftRadius: 20 * SC, borderTopRightRadius: 20 * SC,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 10,
    flexDirection: 'row', alignItems: 'center', gap: 16 * SC,
  },
  drawerText: {
    flex: 1, color: C.white, fontSize: 20 * SC, fontWeight: '700',
    lineHeight: 28 * SC, letterSpacing: 0.3,
  },
  drawerArrow: {
    width: 60 * SC, height: 60 * SC, borderRadius: 16 * SC,
    backgroundColor: C.tealMid,
    justifyContent: 'center', alignItems: 'center',
  },
  drawerArrowText: { color: C.white, fontSize: 26 * SC, fontWeight: '700' },

  successFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(76,175,80,0.2)',
    zIndex: 99,
  },

  // Idle encouragement overlay
  idleOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 36 * SC,
    zIndex: 100,
  },
  idleText: {
    color: C.white, fontSize: 24 * SC, fontWeight: '800',
    textAlign: 'center', lineHeight: 34 * SC, letterSpacing: 0.3,
  },
});
