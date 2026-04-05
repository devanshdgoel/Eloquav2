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
const SPEAK_THRESHOLD = 0.26;
const MIN_SPEAK_MS    = 220;
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
    ...shuffle(WORDS).slice(0, 2).map(t => ({ text: t, level: 'word' })),
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

      {/* X exit — exits the exercise from intro */}
      <View style={styles.introTopRow}>
        <TouchableOpacity style={styles.introXBtn} onPress={onExit}>
          <Text style={styles.introXText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Title */}
      <Text style={styles.introTitle}>Functional{'\n'}Speech</Text>

      {/* Speech bubbles (Figma: two overlapping speech bubbles) */}
      <View style={styles.bubblesWrap}>
        <View style={styles.bubbleLarge}>
          <Text style={styles.bubbleDots}>• • •</Text>
        </View>
        <View style={styles.bubbleSmall}>
          <Text style={styles.bubbleDots}>• • •</Text>
        </View>
      </View>

      {/* Spacer pushes arrow button down */}
      <View style={{ flex: 1 }} />

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
function ExerciseScreen({ onComplete, onExit, onShowDemo }) {
  const items   = useRef(buildItems()).current;
  const TOTAL   = items.length; // 5

  const [displayIdx, setDisplayIdx]     = useState(0);
  const [phase, setPhase]               = useState('hear'); // 'hear' | 'speak' | 'wrong' | 'success'
  const [drawerVisible, setDrawerVisible] = useState(false);

  const phaseRef      = useRef('hear');
  const itemIdxRef    = useRef(0);
  const recordingRef  = useRef(null);
  const holdTimerRef  = useRef(null);
  const hearTimerRef  = useRef(null);
  const maxTimerRef   = useRef(null);
  const drawerAnim    = useRef(new Animated.Value(0)).current;  // 0=hidden 1=shown
  const cardScale     = useRef(new Animated.Value(0.88)).current;
  const successOpac   = useRef(new Animated.Value(0)).current;

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
    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch (_) {}
      recordingRef.current = null;
    }
  }

  function onMeterUpdate(status) {
    if (!status.isRecording || phaseRef.current !== 'speak') return;
    const db  = status.metering ?? -160;
    const vol = Math.max(0, Math.min(1, (db + 70) / 60));
    if (vol > SPEAK_THRESHOLD) {
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
    // Play TTS
    setTimeout(async () => {
      if (phaseRef.current !== 'hear') return;
      await setPlaybackMode();
      Speech.speak(it.text, { language: 'en-US', rate: 0.82 });
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
    await stopRecording();
    await startRecording();
  }

  function handleSuccess() {
    if (phaseRef.current === 'success') return;
    clearTimeout(hearTimerRef.current);
    phaseRef.current = 'success';
    setPhase('success');
    stopRecording();
    successOpac.setValue(0);
    Animated.sequence([
      Animated.timing(successOpac, { toValue: 1, duration: 130, useNativeDriver: true }),
      Animated.delay(300),
      Animated.timing(successOpac, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => advance());
  }

  function handleWrong() {
    if (phaseRef.current === 'success' || phaseRef.current === 'wrong') return;
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

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    loadItem(0);
    return () => {
      clearTimeout(hearTimerRef.current);
      clearTimeout(holdTimerRef.current);
      clearTimeout(maxTimerRef.current);
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
          Speech.speak(item.text, { language: 'en-US', rate: 0.82 });
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
        {phase === 'hear'    ? 'Listen…'           :
         phase === 'speak'   ? 'Say it now!'        :
         phase === 'success' ? '✓ Great!'           :
                               'Try again…'}
      </Text>

      {/* ── Mic blob ── */}
      <View style={styles.blobArea}>
        <MicBlob pulsing={phase === 'speak'} />
      </View>

      {/* ── "Speak" tap shortcut during hear phase ── */}
      {phase === 'hear' && (
        <TouchableOpacity style={styles.readyBtn} onPress={openMic}>
          <Text style={styles.readyBtnText}>I'm ready →</Text>
        </TouchableOpacity>
      )}

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
    </View>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function FunctionalSpeechExercise({ onComplete, onExit }) {
  const [introSeen,  setIntroSeen]  = useState(null);
  const [showIntro,  setShowIntro]  = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(INTRO_KEY).then(v => setIntroSeen(v === 'true'));
  }, []);

  const handleIntroStart = useCallback(async () => {
    await AsyncStorage.setItem(INTRO_KEY, 'true');
    setIntroSeen(true);
    setShowIntro(false);
  }, []);

  if (introSeen === null) return null;

  if (!introSeen || showIntro) {
    return <IntroScreen onStart={handleIntroStart} onExit={onExit} progress={0} />;
  }

  return (
    <ExerciseScreen
      onComplete={onComplete}
      onExit={onExit}
      onShowDemo={() => setShowIntro(true)}
    />
  );
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
    width: 48 * SC, height: 48 * SC, borderRadius: 10 * SC,
    backgroundColor: C.teal, justifyContent: 'center', alignItems: 'center',
  },
  introXText: { color: C.white, fontSize: 18 * SC, fontWeight: '700' },
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
    width: 72 * SC, height: 72 * SC, borderRadius: 20 * SC,
    backgroundColor: C.tealMid,
    justifyContent: 'center', alignItems: 'center',
  },
  introArrowText: { color: C.white, fontSize: 28 * SC, fontWeight: '700' },

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
    width: 48 * SC, height: 48 * SC, borderRadius: 10 * SC,
    backgroundColor: C.teal, justifyContent: 'center', alignItems: 'center',
  },
  exXText: { color: C.white, fontSize: 18 * SC, fontWeight: '700' },
  exRepeatLabel: {
    flex: 1, color: C.white, fontSize: 26 * SC, fontWeight: '800',
    letterSpacing: 1, marginLeft: 14 * SC,
  },
  exHelpBtn: {
    width: 48 * SC, height: 48 * SC, borderRadius: 24 * SC,
    backgroundColor: C.orange, justifyContent: 'center', alignItems: 'center',
  },
  exHelpText: { color: C.white, fontSize: 22 * SC, fontWeight: '800' },

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
});
