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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CantDoNow from '../../../components/CantDoNow';
import ScreenHeader from '../../../components/ScreenHeader';
import SpeakerButton from '../../../components/SpeakerButton';
import { MicIcon } from '../../../components/Icons';
import { API_BASE_URL } from '../../../config/env';
import { fetchWithAuth } from '../../../utils/authHeaders';

const { width: W, height: H } = Dimensions.get('window');
const SC = W / 402;

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  bg:       '#1C4047',
  teal:     '#2D6974',
  tealMid:  '#3D7B85',
  tealBlob: '#264E56',     // dark blob blobs
  blobMid:  '#2A5C65',
  orange:   '#FFA940',
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

// ── Word banks by tier ────────────────────────────────────────────────────────
// Tier 1: Simple words + short phrases (everyday fundamentals)
const T1_WORDS = ['Hello', 'Please', 'Thanks', 'Water', 'Help', 'Sorry', 'Okay', 'Yes', 'Stop', 'Good'];
const T1_PHRASES = [
  'Good morning', 'Thank you', 'Excuse me', 'How are you',
  'I need help', 'Just a moment', 'Can you hear me', 'See you later',
];

// Tier 2: Slightly longer phrases (3–5 words)
const T2_PHRASES = [
  'Good morning, how are you', 'I would like some help', 'Can you hear me clearly',
  'Just a moment please',      'Could you speak up please', 'Let me think about that',
  'I am doing well today',     'Please come in and sit down',
];
const T2_SENTENCES = [
  'Could I have a glass of water',      'Good morning, how are you doing today',
  'Can you please speak a little louder', 'I would like to order something please',
];

// Tier 3: Multi-clause phrases and sentences
const T3_PHRASES = [
  'When you have a moment, could you help me',
  'I was wondering if you could assist',
  'Before you leave, I have a question',
  'If it is not too much trouble, could you wait',
];
const T3_SENTENCES = [
  'I would like a cup of tea, and could you also bring some biscuits please',
  'Good morning everyone, I hope you are all having a wonderful day today',
  'Could you please turn down the music, as I am trying to concentrate on this',
  'I have been practising my exercises and I feel my voice getting stronger',
];

// Tier 4: Complex functional sentences
const T4_SENTENCES = [
  'I would like to make an appointment with the doctor for some time next week if possible',
  'Good morning, my name is and I am here for my ten o clock appointment today',
  'Could you tell me where the nearest pharmacy is, as I need to pick up a prescription',
  'I have been feeling a bit under the weather and I think I may need to see a specialist',
  'Could you please ask them to call me back when they have a moment, as it is rather urgent',
];

// Tier 5: Rapid natural speech (longer, faster-paced)
const T5_SENTENCES = [
  'I have been practising my voice exercises every day for the past few weeks and I am starting to notice a real improvement in my speaking clarity',
  'Good morning everyone, I am here to tell you a little about myself and the work I have been doing to improve my communication over recent months',
  'Could you please let the receptionist know that I have arrived for my appointment, and also ask whether there is likely to be much of a wait today',
  'I would like to order a hot drink and something to eat, and if possible could you also bring some extra napkins and a glass of cold water please',
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build the item list for a given difficulty tier.
 * Returns an array of { text, level } objects.
 */
function buildItemsForTier(tier) {
  const t = Math.max(1, Math.min(5, tier ?? 1));
  switch (t) {
    case 1:
      return [
        ...shuffle(T1_WORDS).slice(0, 1).map(text => ({ text, level: 'word' })),
        ...shuffle(T1_PHRASES).slice(0, 2).map(text => ({ text, level: 'phrase' })),
        ...shuffle(T2_SENTENCES).slice(0, 1).map(text => ({ text, level: 'sentence' })),
      ];
    case 2:
      return [
        ...shuffle(T1_PHRASES).slice(0, 1).map(text => ({ text, level: 'phrase' })),
        ...shuffle(T2_PHRASES).slice(0, 2).map(text => ({ text, level: 'phrase' })),
        ...shuffle(T2_SENTENCES).slice(0, 1).map(text => ({ text, level: 'sentence' })),
      ];
    case 3:
      return [
        ...shuffle(T3_PHRASES).slice(0, 1).map(text => ({ text, level: 'phrase' })),
        ...shuffle(T3_SENTENCES).slice(0, 2).map(text => ({ text, level: 'sentence' })),
        ...shuffle(T4_SENTENCES).slice(0, 1).map(text => ({ text, level: 'sentence' })),
      ];
    case 4:
      return [
        ...shuffle(T3_SENTENCES).slice(0, 1).map(text => ({ text, level: 'sentence' })),
        ...shuffle(T4_SENTENCES).slice(0, 3).map(text => ({ text, level: 'sentence' })),
      ];
    case 5:
    default:
      return [
        ...shuffle(T4_SENTENCES).slice(0, 2).map(text => ({ text, level: 'sentence' })),
        ...shuffle(T5_SENTENCES).slice(0, 2).map(text => ({ text, level: 'sentence' })),
      ];
  }
}

// Simple pulsing circle mic indicator — bobs between large and small when recording.
// Replaces the previous organic blob shape which looked visually distracting.
function MicBlob({ pulsing }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const BASE  = 140 * SC;
  const BTN_SZ = 72 * SC;

  useEffect(() => {
    if (pulsing) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.22, duration: 750, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0.88, duration: 750, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulse.setValue(1);
    }
  }, [pulsing]);

  return (
    <Animated.View style={[
      styles.micCircle,
      { width: BASE, height: BASE, borderRadius: BASE / 2, transform: [{ scale: pulse }] },
    ]}>
      <View style={[styles.micBtn, { width: BTN_SZ, height: BTN_SZ, borderRadius: BTN_SZ / 2 }]}>
        <MicIcon size={32} color={C.white} />
      </View>
    </Animated.View>
  );
}

// ── Intro screen (card format with numbered steps) ─────────────────────────────
const SPEECH_INSTR_STEPS = [
  { step: '1', text: 'Listen to the word or phrase played for you.' },
  { step: '2', text: 'Repeat it out loud — as clearly and loudly as you can.' },
  { step: '3', text: 'Your voice is checked automatically. Speak confidently!' },
];
const SPEECH_INSTR_TEXT =
  "Functional Speech. Listen to each word or phrase, then repeat it out loud as clearly and loudly as you can. Your voice is automatically checked.";

function IntroScreen({ onStart, onExit, progress }) {
  return (
    <View style={styles.introRoot}>
      <StatusBar barStyle="light-content" />
      <ScreenHeader
        navigation={null}
        title="Instructions"
        backIcon="✕"
        backLabel="Exit exercise"
        onBack={onExit}
        rightAction={<SpeakerButton text={SPEECH_INSTR_TEXT} />}
      />
      <Text style={styles.introTitle} numberOfLines={1} adjustsFontSizeToFit>Functional Speech</Text>
      <View style={styles.introCard}>
        {SPEECH_INSTR_STEPS.map(({ step, text }) => (
          <View key={step} style={styles.introRow}>
            <View style={styles.introBadge}><Text style={styles.introBadgeNum}>{step}</Text></View>
            <Text style={styles.introStepText}>{text}</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity style={styles.introStartBtn} onPress={onStart} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Begin exercise">
        <Text style={styles.introStartText}>Let's Go  →</Text>
      </TouchableOpacity>
      <View style={styles.introBarTrack}>
        <View style={[styles.introBarFill, { width: (314 * SC) * Math.max(0.02, progress) }]} />
      </View>
    </View>
  );
}

// ── Main exercise screen ───────────────────────────────────────────────────────
function ExerciseScreen({ onComplete, onExit, onShowDemo, onSkip, tier = 1 }) {
  const { top: safeTop } = useSafeAreaInsets();
  const items   = useRef(buildItemsForTier(tier)).current;
  const TOTAL   = items.length; // 5

  const [displayIdx, setDisplayIdx]     = useState(0);
  const [phase, setPhase]               = useState('hear'); // 'hear' | 'speak' | 'wrong' | 'success'
  const [drawerVisible, setDrawerVisible] = useState(false);
  // Controls the in-screen help overlay — shown when ? is pressed, keeps exercise alive
  const [showHelpOverlay, setShowHelpOverlay] = useState(false);

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
      const res = await fetchWithAuth(`${API_BASE_URL}/api/process-audio`, {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        console.error('[FunctionalSpeech] API error:', res.status);
        doAdvance();
        return;
      }

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
    if (next >= TOTAL) {
      // V2: score is always 100 — exercise only completes when all items spoken
      onComplete(100);
      return;
    }
    itemIdxRef.current = next;
    setDisplayIdx(next);
    loadItem(next);
  }

  function retryItem() {
    hideDrawer(() => {
      loadItem(itemIdxRef.current);
    });
  }

  // Pause exercise and show inline instructions overlay.
  // Stops all timers and TTS so the user can read at their own pace.
  function showHelp() {
    if (calibrateTimerRef.current) { clearTimeout(calibrateTimerRef.current); calibrateTimerRef.current = null; }
    clearTimeout(hearTimerRef.current);   hearTimerRef.current  = null;
    clearTimeout(maxTimerRef.current);    maxTimerRef.current   = null;
    clearTimeout(holdTimerRef.current);   holdTimerRef.current  = null;
    clearIdleTimer();
    try { Speech.stop(); } catch (_) {}
    stopRecording();
    setShowHelpOverlay(true);
  }

  // Dismiss overlay and restart the current item from the hear phase.
  // round/item index is preserved — we don't restart from item 1.
  function closeHelp() {
    setShowHelpOverlay(false);
    loadItem(itemIdxRef.current);
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
      <View style={[styles.exTopRow, { paddingTop: safeTop + 14 }]}>
        <TouchableOpacity style={styles.exXBtn} onPress={onExit} accessibilityRole="button" accessibilityLabel="Exit exercise">
          <Text style={styles.exXText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.exRepeatLabel}>Repeat</Text>
        <TouchableOpacity style={styles.exHelpBtn} onPress={showHelp} accessibilityRole="button" accessibilityLabel="Show instructions">
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
        accessibilityRole="button"
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
        <TouchableOpacity style={styles.readyBtn} onPress={openMic} accessibilityRole="button" accessibilityLabel="I'm ready to speak">
          <Text style={styles.readyBtnText}>I'm ready →</Text>
        </TouchableOpacity>
      )}

      {/* ── Bottom progress bar — sits above the CantDoNow button ── */}
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: (314 * SC) * barFill }]} />
      </View>

      {/* ── Can't do now ── */}
      <CantDoNow onSkip={onSkip} onEnd={onExit} style={{ marginBottom: 8 * SC }} />

      {/* ── Wrong-answer drawer (Figma Type 37) ── */}
      {drawerVisible && (
        <Animated.View style={[styles.drawer, { transform: [{ translateY: drawerTranslate }] }]}>
          <Text style={styles.drawerText}>
            Doesn't sound correct.{'\n'}Give it another try!
          </Text>
          <TouchableOpacity style={styles.drawerArrow} onPress={retryItem} accessibilityRole="button" accessibilityLabel="Try again">
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

      {/* ── Help overlay — shown when ? is pressed; exercise is paused ── */}
      {showHelpOverlay && (
        <View style={styles.helpOverlay}>
          <View style={[styles.helpHeader, { paddingTop: safeTop + 14 }]}>
            <TouchableOpacity style={styles.helpCloseBtn} onPress={closeHelp} accessibilityRole="button" accessibilityLabel="Close instructions">
              <Text style={styles.helpCloseText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.helpHeaderTitle}>Instructions</Text>
            <View style={{ width: 56 }} />
          </View>
          <Text style={styles.helpExTitle} numberOfLines={1} adjustsFontSizeToFit>Functional Speech</Text>
          <View style={styles.helpCard}>
            {SPEECH_INSTR_STEPS.map(({ step, text }) => (
              <View key={step} style={styles.helpRow}>
                <View style={styles.helpBadge}><Text style={styles.helpBadgeNum}>{step}</Text></View>
                <Text style={styles.helpStepText}>{text}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.helpContinueBtn} onPress={closeHelp} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Continue exercise">
            <Text style={styles.helpContinueText}>Continue Exercise  →</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function FunctionalSpeechExercise({ onComplete, onExit, onSkip, tier = 1, exerciseIndex = 0, totalExercises = 8 }) {
  // null = AsyncStorage check in progress; avoids a one-frame flash to the intro.
  const [showIntro, setShowIntro] = useState(null);
  const sessionFill = totalExercises > 0 ? exerciseIndex / totalExercises : 0;

  useEffect(() => {
    AsyncStorage.getItem(INTRO_KEY)
      .then(val => setShowIntro(!val))
      .catch(() => setShowIntro(false));
  }, []);

  if (showIntro === null) return null;
  return showIntro
    ? <IntroScreen
        onStart={() => {
          // Mark the intro as seen so future sessions skip straight to the exercise.
          AsyncStorage.setItem(INTRO_KEY, '1').catch(() => {});
          setShowIntro(false);
        }}
        onExit={onExit}
        progress={sessionFill}
      />
    : <ExerciseScreen onComplete={onComplete} onExit={onExit} onShowDemo={() => setShowIntro(true)} onSkip={onSkip ?? onComplete} tier={tier} />;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Intro ──────────────────────────────────────────────────────────────────
  introRoot: {
    flex: 1, backgroundColor: C.bg,
  },
  introTitle: {
    color: C.white, fontSize: 44, fontWeight: '800',
    letterSpacing: 1.0, textAlign: 'center',
    marginTop: 8, marginBottom: 28,
    paddingHorizontal: 24 * SC,
  },
  introCard: {
    marginHorizontal: 24, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    padding: 20, gap: 18,
  },
  introRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  introBadge: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: C.orange,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  introBadgeNum: { color: '#1A1A1A', fontSize: 16, fontWeight: '800' },
  introStepText: {
    flex: 1, color: 'rgba(255,255,255,0.85)',
    fontSize: 17, lineHeight: 24, fontWeight: '400',
  },
  introStartBtn: {
    alignSelf: 'center', marginTop: 32,
    backgroundColor: C.orange, borderRadius: 28,
    paddingHorizontal: 40, paddingVertical: 20,
    shadowColor: C.orange, shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },
  introStartText: { color: '#1A1A1A', fontSize: 18, fontWeight: '700', letterSpacing: 0.4 },
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
    paddingHorizontal: 18 * SC,
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
    flex: 1, color: C.white, fontSize: 26, fontWeight: '800',
    letterSpacing: 1, marginLeft: 14 * SC,
  },
  exHelpBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: C.orange, justifyContent: 'center', alignItems: 'center',
    shadowColor: C.orange, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.50, shadowRadius: 10, elevation: 8,
  },
  exHelpText: { color: '#1A1A1A', fontSize: 24, fontWeight: '900', includeFontPadding: false, textAlign: 'center', lineHeight: 24 },

  speakerBtn: {
    alignSelf: 'center', marginTop: 14 * SC, marginBottom: 8 * SC,
  },
  speakerIcon: { fontSize: 52 },

  wordText: {
    color: C.white, fontSize: 46, fontWeight: '800',
    letterSpacing: 2, textAlign: 'center',
    paddingHorizontal: 22 * SC, lineHeight: 58,
  },
  wordTextMed: { fontSize: 34, lineHeight: 44 },
  wordTextSm:  { fontSize: 24, lineHeight: 34 },

  phaseHint: {
    color: C.textDim, fontSize: 16, textAlign: 'center',
    marginTop: 10 * SC, letterSpacing: 0.4,
  },

  blobArea: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
  },

  // Simple pulsing circle — replaces the old organic blob
  micCircle: {
    backgroundColor: C.tealBlob,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micBtn: {
    backgroundColor: C.orange,
    justifyContent: 'center', alignItems: 'center',
    zIndex: 1,
    shadowColor: C.orange, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45, shadowRadius: 8, elevation: 6,
  },
  micIcon: { fontSize: 32 },

  readyBtn: {
    alignSelf: 'center', marginBottom: 16 * SC,
    backgroundColor: C.teal, borderRadius: 20 * SC,
    paddingVertical: 12 * SC, paddingHorizontal: 28 * SC,
  },
  readyBtnText: { color: C.white, fontSize: 17, fontWeight: '700' },

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
    flex: 1, color: C.white, fontSize: 20, fontWeight: '700',
    lineHeight: 28, letterSpacing: 0.3,
  },
  drawerArrow: {
    width: 60 * SC, height: 60 * SC, borderRadius: 16 * SC,
    backgroundColor: C.tealMid,
    justifyContent: 'center', alignItems: 'center',
  },
  drawerArrowText: { color: C.white, fontSize: 26, fontWeight: '700' },

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
    color: C.white, fontSize: 24, fontWeight: '800',
    textAlign: 'center', lineHeight: 34, letterSpacing: 0.3,
  },

  // Help overlay — full-screen, shown over the exercise when ? is pressed
  helpOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.bg,
    zIndex: 200,
  },
  helpHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, marginBottom: 0,
  },
  helpCloseBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center', alignItems: 'center',
  },
  helpCloseText: { color: C.white, fontSize: 22, fontWeight: '600', includeFontPadding: false, textAlign: 'center', lineHeight: 22 },
  helpHeaderTitle: {
    flex: 1, color: C.white, fontSize: 17, fontWeight: '600',
    textAlign: 'center', letterSpacing: 0.3, opacity: 0.75,
  },
  helpExTitle: {
    color: C.white, fontSize: 44, fontWeight: '800',
    letterSpacing: 1.0, textAlign: 'center',
    marginTop: 8, marginBottom: 28,
    paddingHorizontal: 24 * SC,
  },
  helpCard: {
    marginHorizontal: 24, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    padding: 20, gap: 18,
  },
  helpRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  helpBadge: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: C.orange,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  helpBadgeNum: { color: '#1A1A1A', fontSize: 16, fontWeight: '800' },
  helpStepText: {
    flex: 1, color: 'rgba(255,255,255,0.85)',
    fontSize: 17, lineHeight: 24, fontWeight: '400',
  },
  helpContinueBtn: {
    alignSelf: 'center', marginTop: 32,
    backgroundColor: C.orange, borderRadius: 28,
    paddingHorizontal: 40, paddingVertical: 20,
    shadowColor: C.orange, shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },
  helpContinueText: { color: '#1A1A1A', fontSize: 18, fontWeight: '700', letterSpacing: 0.4 },
});
