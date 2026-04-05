/**
 * FunctionalSpeechExercise
 *
 * Hear & Repeat — the app speaks a word/phrase/sentence via TTS; the user
 * repeats it at full LSVT LOUD volume. Items progress from single words →
 * short phrases → a full sentence within every session.
 *
 * Flow per item:
 *   HEAR   – card animates in, TTS fires, replay button shown
 *   SPEAK  – mic opens, pulsing animation, volume detection
 *   SUCCESS– brief green flash, advance to next item
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

const { width: W } = Dimensions.get('window');
const SC = W / 402;

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  bg:       '#1C4047',
  teal:     '#2D6974',
  tealMid:  '#3D7B85',
  orange:   '#FE9C2D',
  white:    '#FFFFFF',
  success:  '#4CAF50',
  textDim:  'rgba(224,236,222,0.7)',
  text:     '#E0ECDE',
};

// ── Constants ─────────────────────────────────────────────────────────────────
const DEMO_KEY        = '@eloqua_functional_speech_demo_seen';
const HEAR_MS         = 3000;   // auto-advance to SPEAK phase after hearing
const SUCCESS_MS      = 650;    // pause after successful speech before next item
const SPEAK_THRESHOLD = 0.28;   // volume level considered "speaking"
const MIN_SPEAK_MS    = 260;    // must hold above threshold this long

const LEVEL_COLOR = {
  WORD:     C.tealMid,
  PHRASE:   C.orange,
  SENTENCE: '#C8607D',
};

// ── Word banks ─────────────────────────────────────────────────────────────────
const WORDS = [
  'Hello', 'Please', 'Thanks', 'Water', 'Help',
  'Sorry', 'Okay', 'Yes', 'Stop', 'Come',
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
    ...shuffle(WORDS).slice(0, 2).map(t => ({ text: t, level: 'WORD' })),
    ...shuffle(PHRASES).slice(0, 2).map(t => ({ text: t, level: 'PHRASE' })),
    ...shuffle(SENTENCES).slice(0, 1).map(t => ({ text: t, level: 'SENTENCE' })),
  ];
}

// ── Demo slides ───────────────────────────────────────────────────────────────
const DEMO_SLIDES = [
  {
    num: '1',
    title: 'Hear & Repeat',
    body:  'Listen to a word, phrase, or sentence — then repeat it out loud, as clearly and as loudly as you can.',
    tip:   'This exercise trains the functional everyday speech you use most.',
    visual: 'icons', // renders emoji icons
  },
  {
    num: '2',
    title: 'Three Levels',
    body:  'You start with single words, then short phrases, then full sentences. Each session mixes all three.',
    tip:   'The progression mirrors how we naturally build speaking confidence.',
    visual: 'levels',
  },
  {
    num: '3',
    title: 'Speak Loud & Clear',
    body:  'When the microphone activates, say the item at your loudest, clearest voice. Over-articulate!',
    tip:   'Your "too loud" is often just right. Aim for maximum effort every time.',
    visual: 'mic',
  },
];

// ─── Shared sub-components ────────────────────────────────────────────────────

function TopTip({ text }) {
  return (
    <View style={styles.tipBox}>
      <Text style={styles.tipTitle}>Top Tip</Text>
      <Text style={styles.tipBody}>{text}</Text>
    </View>
  );
}

function ProgressPills({ total, current }) {
  return (
    <View style={styles.pillsRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.pill,
            i < current   ? styles.pillDone :
            i === current  ? styles.pillActive :
                             styles.pillPending,
          ]}
        />
      ))}
    </View>
  );
}

function LevelBadge({ level }) {
  return (
    <View style={[styles.levelBadge, { backgroundColor: LEVEL_COLOR[level] }]}>
      <Text style={styles.levelBadgeText}>{level}</Text>
    </View>
  );
}

// ─── DemoScreen ───────────────────────────────────────────────────────────────
function DemoScreen({ onDone }) {
  const [slide, setSlide] = useState(0);
  const s = DEMO_SLIDES[slide];

  return (
    <View style={styles.demoRoot}>
      <StatusBar barStyle="light-content" />

      {/* Numbered badge */}
      <View style={styles.demoNumBadge}>
        <Text style={styles.demoNumText}>{s.num}</Text>
      </View>

      {/* Illustration */}
      <View style={styles.demoIllus}>
        {s.visual === 'icons' && (
          <View style={styles.demoIconsRow}>
            <Text style={styles.demoEmoji}>🔊</Text>
            <Text style={[styles.demoArrow, { color: C.orange }]}>→</Text>
            <Text style={styles.demoEmoji}>🎙️</Text>
          </View>
        )}
        {s.visual === 'levels' && (
          <View style={styles.demoLevelsCol}>
            {[
              { level: 'WORD',     example: '"Hello"' },
              { level: 'PHRASE',   example: '"Good morning"' },
              { level: 'SENTENCE', example: '"Could I have a glass of water"' },
            ].map(({ level, example }) => (
              <View key={level} style={styles.demoLevelRow}>
                <View style={[styles.demoLevelBadge, { backgroundColor: LEVEL_COLOR[level] }]}>
                  <Text style={styles.demoLevelBadgeText}>{level}</Text>
                </View>
                <Text style={styles.demoLevelExample}>{example}</Text>
              </View>
            ))}
          </View>
        )}
        {s.visual === 'mic' && (
          <View style={styles.demoMicWrap}>
            <View style={styles.demoMicRing} />
            <View style={styles.demoMicCircle}>
              <Text style={{ fontSize: 46 * SC }}>🎙️</Text>
            </View>
          </View>
        )}
      </View>

      <Text style={styles.demoTitle}>{s.title}</Text>
      <Text style={styles.demoBody}>{s.body}</Text>

      <TopTip text={s.tip} />

      {/* Navigation */}
      <View style={styles.demoNav}>
        <TouchableOpacity
          style={[styles.demoNavBtn, slide === 0 && styles.demoNavBtnDisabled]}
          onPress={() => slide > 0 && setSlide(slide - 1)}
        >
          <Text style={styles.demoNavArrow}>←</Text>
        </TouchableOpacity>

        <View style={styles.demoNavDot} />

        {slide < DEMO_SLIDES.length - 1 ? (
          <TouchableOpacity style={styles.demoNavBtn} onPress={() => setSlide(slide + 1)}>
            <Text style={styles.demoNavArrow}>→</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.demoNavBtn, { backgroundColor: C.orange }]}
            onPress={onDone}
          >
            <Text style={styles.demoNavArrow}>▶</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── ExerciseScreen ───────────────────────────────────────────────────────────
function ExerciseScreen({ onComplete, onExit }) {
  const items = useRef(buildItems()).current;
  const TOTAL = items.length; // 5

  const [displayIdx, setDisplayIdx] = useState(0);
  const [itemPhase, setItemPhase] = useState('hear'); // 'hear' | 'speak' | 'success'

  // Refs to avoid stale closures in callbacks
  const phaseRef     = useRef('hear');
  const itemIdxRef   = useRef(0);
  const recordingRef = useRef(null);
  const speakHoldRef = useRef(null);
  const hearTimerRef = useRef(null);

  // Animations
  const cardScale    = useRef(new Animated.Value(0.85)).current;
  const successOpac  = useRef(new Animated.Value(0)).current;
  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const pulseLoop    = useRef(null);

  // ── Audio helpers ────────────────────────────────────────────────────────
  async function setPlaybackMode() {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
    } catch (_) {}
  }

  async function setRecordMode() {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
    } catch (_) {}
  }

  async function stopRecording() {
    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch (_) {}
      recordingRef.current = null;
    }
  }

  async function startRecording() {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { handleSuccess(); return; }

      await setRecordMode();

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
        android: {
          extension: '.m4a',
          outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
          audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_MPEG4AAC,
          audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        isMeteringEnabled: true,
      });

      rec.setOnRecordingStatusUpdate(status => {
        if (!status.isRecording) return;
        if (phaseRef.current !== 'speak') return;

        const db  = status.metering ?? -60;
        const vol = Math.max(0, Math.min(1, (db + 70) / 60));

        if (vol > SPEAK_THRESHOLD) {
          if (!speakHoldRef.current) {
            speakHoldRef.current = setTimeout(() => {
              speakHoldRef.current = null;
              if (phaseRef.current === 'speak') handleSuccess();
            }, MIN_SPEAK_MS);
          }
        } else {
          if (speakHoldRef.current) {
            clearTimeout(speakHoldRef.current);
            speakHoldRef.current = null;
          }
        }
      });

      await rec.startAsync();
      recordingRef.current = rec;
    } catch (_) {
      handleSuccess();
    }
  }

  // ── Pulse animation (active in 'speak' phase) ────────────────────────────
  function startPulse() {
    pulseAnim.setValue(1);
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.28, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0,  duration: 600, useNativeDriver: true }),
      ])
    );
    pulseLoop.current.start();
  }

  function stopPulse() {
    pulseLoop.current?.stop();
    pulseAnim.setValue(1);
  }

  // ── Phase transitions ─────────────────────────────────────────────────────
  async function startHearPhase(idx) {
    const item = items[idx];
    phaseRef.current = 'hear';
    setItemPhase('hear');

    // Animate card entrance
    cardScale.setValue(0.82);
    Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, friction: 7, tension: 80 }).start();

    // Play TTS after a short delay so animation is visible first
    setTimeout(async () => {
      if (phaseRef.current !== 'hear') return;
      await setPlaybackMode();
      Speech.speak(item.text, { language: 'en-US', rate: 0.82, pitch: 1.0 });
    }, 350);

    // Auto-advance to SPEAK after HEAR_MS
    hearTimerRef.current = setTimeout(() => {
      if (phaseRef.current === 'hear') startSpeakPhase();
    }, HEAR_MS);
  }

  async function startSpeakPhase() {
    clearTimeout(hearTimerRef.current);
    try { Speech.stop(); } catch (_) {}
    phaseRef.current = 'speak';
    setItemPhase('speak');
    startPulse();
    await stopRecording();
    await startRecording();
  }

  function handleSuccess() {
    if (phaseRef.current === 'success') return;
    clearTimeout(hearTimerRef.current);
    if (speakHoldRef.current) { clearTimeout(speakHoldRef.current); speakHoldRef.current = null; }
    phaseRef.current = 'success';
    setItemPhase('success');
    stopPulse();
    stopRecording();

    // Flash the success overlay
    successOpac.setValue(0);
    Animated.sequence([
      Animated.timing(successOpac, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.delay(300),
      Animated.timing(successOpac, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      const next = itemIdxRef.current + 1;
      if (next >= TOTAL) {
        onComplete();
      } else {
        itemIdxRef.current = next;
        setDisplayIdx(next);
        startHearPhase(next);
      }
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    startHearPhase(0);
    return () => {
      clearTimeout(hearTimerRef.current);
      clearTimeout(speakHoldRef.current);
      pulseLoop.current?.stop();
      stopRecording();
      try { Speech.stop(); } catch (_) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const item = items[displayIdx];

  return (
    <View style={styles.exRoot}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <View style={styles.exHeader}>
        <TouchableOpacity style={styles.exExitBtn} onPress={onExit}>
          <Text style={styles.exExitText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.exHeaderTitle}>Functional Speech</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* ── Progress pills ── */}
      <ProgressPills total={TOTAL} current={displayIdx} />

      {/* ── Word card ── */}
      <View style={styles.cardArea}>
        <Animated.View style={[styles.wordCardOuter, { transform: [{ scale: cardScale }] }]}>
          <LevelBadge level={item.level} />
          <View style={styles.wordCard}>
            <Text
              style={[
                styles.wordText,
                item.text.length > 18 && styles.wordTextMed,
                item.text.length > 28 && styles.wordTextSm,
              ]}
              adjustsFontSizeToFit
              numberOfLines={2}
            >
              {item.text}
            </Text>
          </View>
        </Animated.View>
      </View>

      {/* ── Phase UI ── */}
      <View style={styles.phaseArea}>
        {itemPhase === 'hear' && (
          <View style={styles.hearArea}>
            <Text style={styles.phaseLabel}>Listen carefully…</Text>
            <TouchableOpacity
              style={styles.speakerBtn}
              onPress={async () => {
                await setPlaybackMode();
                Speech.speak(item.text, { language: 'en-US', rate: 0.82 });
              }}
              accessibilityLabel="Replay word"
            >
              <Text style={styles.speakerIcon}>🔊</Text>
              <Text style={styles.speakerBtnLabel}>Tap to hear again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.readyBtn} onPress={startSpeakPhase}>
              <Text style={styles.readyBtnText}>I'm ready — go!</Text>
            </TouchableOpacity>
          </View>
        )}

        {itemPhase === 'speak' && (
          <View style={styles.speakArea}>
            <Text style={styles.phaseLabel}>Say it now!</Text>
            <View style={styles.micWrap}>
              <Animated.View style={[styles.micRing, { transform: [{ scale: pulseAnim }] }]} />
              <View style={styles.micCircle}>
                <Text style={styles.micEmoji}>🎙️</Text>
              </View>
            </View>
            <Text style={styles.micHint}>Speak loud and clear</Text>
          </View>
        )}

        {itemPhase === 'success' && (
          <View style={styles.successArea}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successLabel}>Well done!</Text>
          </View>
        )}
      </View>

      {/* Success flash overlay */}
      <Animated.View
        pointerEvents="none"
        style={[styles.successFlash, { opacity: successOpac }]}
      />
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function FunctionalSpeechExercise({ onComplete, onExit }) {
  const [demoSeen, setDemoSeen] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem(DEMO_KEY).then(v => setDemoSeen(v === 'true'));
  }, []);

  const handleDemoDone = useCallback(async () => {
    await AsyncStorage.setItem(DEMO_KEY, 'true');
    setDemoSeen(true);
  }, []);

  if (demoSeen === null) return null;
  if (!demoSeen) return <DemoScreen onDone={handleDemoDone} />;
  return <ExerciseScreen onComplete={onComplete} onExit={onExit} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Demo ──────────────────────────────────────────────────────────────────
  demoRoot: {
    flex: 1, backgroundColor: C.bg,
    paddingHorizontal: 24 * SC, paddingTop: 52 * SC,
  },
  demoNumBadge: {
    width: 44 * SC, height: 44 * SC, borderRadius: 22 * SC,
    backgroundColor: C.teal, justifyContent: 'center', alignItems: 'center',
    marginBottom: 16 * SC,
  },
  demoNumText: { color: C.white, fontSize: 22 * SC, fontWeight: '700' },

  demoIllus: {
    height: 160 * SC, justifyContent: 'center', alignItems: 'center',
    marginBottom: 20 * SC,
  },
  demoIconsRow: { flexDirection: 'row', alignItems: 'center', gap: 18 * SC },
  demoEmoji:   { fontSize: 56 * SC },
  demoArrow:   { fontSize: 36 * SC, fontWeight: '700' },

  demoLevelsCol: { gap: 14 * SC, width: '100%' },
  demoLevelRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 * SC },
  demoLevelBadge: {
    paddingHorizontal: 10 * SC, paddingVertical: 5 * SC,
    borderRadius: 10 * SC, minWidth: 90 * SC, alignItems: 'center',
  },
  demoLevelBadgeText: { color: C.white, fontSize: 11 * SC, fontWeight: '700', letterSpacing: 0.8 },
  demoLevelExample:   { color: C.text, fontSize: 15 * SC, fontStyle: 'italic' },

  demoMicWrap: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  demoMicRing: {
    position: 'absolute',
    width: 110 * SC, height: 110 * SC, borderRadius: 55 * SC,
    borderWidth: 2.5, borderColor: C.orange, opacity: 0.45,
  },
  demoMicCircle: {
    width: 80 * SC, height: 80 * SC, borderRadius: 40 * SC,
    backgroundColor: C.teal, justifyContent: 'center', alignItems: 'center',
  },

  demoTitle: {
    color: C.white, fontSize: 26 * SC, fontWeight: '800',
    letterSpacing: 0.3, marginBottom: 10 * SC,
  },
  demoBody: {
    color: C.text, fontSize: 15 * SC, lineHeight: 23 * SC,
    letterSpacing: 0.2, marginBottom: 18 * SC,
  },

  tipBox: {
    borderWidth: 1.5, borderColor: C.tealMid, borderRadius: 14 * SC,
    padding: 14 * SC, marginBottom: 24 * SC, backgroundColor: 'rgba(45,105,116,0.15)',
  },
  tipTitle: {
    color: C.orange, fontSize: 13 * SC, fontWeight: '700',
    letterSpacing: 0.8, marginBottom: 4 * SC,
  },
  tipBody: { color: C.text, fontSize: 13 * SC, lineHeight: 19 * SC },

  demoNav: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 'auto', paddingVertical: 16 * SC,
  },
  demoNavBtn: {
    width: 52 * SC, height: 52 * SC, borderRadius: 26 * SC,
    backgroundColor: C.teal, justifyContent: 'center', alignItems: 'center',
  },
  demoNavBtnDisabled: { opacity: 0.3 },
  demoNavArrow:       { color: C.white, fontSize: 20 * SC, fontWeight: '700' },
  demoNavDot:         { width: 8 * SC, height: 8 * SC, borderRadius: 4 * SC, backgroundColor: C.orange },

  // ── Exercise ──────────────────────────────────────────────────────────────
  exRoot: { flex: 1, backgroundColor: C.bg },
  exHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52 * SC, paddingHorizontal: 18 * SC, paddingBottom: 12 * SC,
  },
  exExitBtn: {
    width: 38 * SC, height: 38 * SC, borderRadius: 10 * SC,
    backgroundColor: C.teal, justifyContent: 'center', alignItems: 'center',
  },
  exExitText:    { color: C.white, fontSize: 20 * SC, fontWeight: '700' },
  exHeaderTitle: {
    flex: 1, textAlign: 'center', color: C.white,
    fontSize: 17 * SC, fontWeight: '700', letterSpacing: 0.5,
  },

  pillsRow: {
    flexDirection: 'row', gap: 8 * SC,
    paddingHorizontal: 24 * SC, marginTop: 8 * SC, marginBottom: 20 * SC,
  },
  pill:        { flex: 1, height: 8 * SC, borderRadius: 4 * SC },
  pillDone:    { backgroundColor: C.tealMid },
  pillActive:  { backgroundColor: C.orange },
  pillPending: { backgroundColor: 'rgba(255,255,255,0.18)' },

  cardArea: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 22 * SC,
  },
  wordCardOuter: { alignItems: 'center', width: '100%' },
  levelBadge: {
    paddingHorizontal: 14 * SC, paddingVertical: 6 * SC,
    borderRadius: 12 * SC, marginBottom: 12 * SC, alignSelf: 'center',
  },
  levelBadgeText: { color: C.white, fontSize: 11 * SC, fontWeight: '700', letterSpacing: 1 },
  wordCard: {
    backgroundColor: C.white, borderRadius: 28 * SC,
    borderWidth: 4, borderColor: C.orange,
    paddingVertical: 28 * SC, paddingHorizontal: 24 * SC,
    width: '100%', alignItems: 'center',
    shadowColor: C.orange, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 8,
  },
  wordText:    { fontSize: 56 * SC, fontWeight: '800', color: '#1F4850', textAlign: 'center', letterSpacing: 2 },
  wordTextMed: { fontSize: 38 * SC },
  wordTextSm:  { fontSize: 26 * SC },

  phaseArea: {
    height: 210 * SC, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 24 * SC, paddingBottom: 28 * SC,
  },
  phaseLabel: {
    color: C.text, fontSize: 18 * SC, fontWeight: '600',
    letterSpacing: 0.4, marginBottom: 16 * SC, textAlign: 'center',
  },

  hearArea:  { alignItems: 'center', width: '100%' },
  speakerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10 * SC,
    backgroundColor: C.teal, borderRadius: 20 * SC,
    paddingVertical: 12 * SC, paddingHorizontal: 22 * SC,
    marginBottom: 14 * SC,
  },
  speakerIcon:      { fontSize: 24 * SC },
  speakerBtnLabel:  { color: C.white, fontSize: 15 * SC, fontWeight: '600' },
  readyBtn: {
    backgroundColor: C.orange, borderRadius: 16 * SC,
    paddingVertical: 14 * SC, paddingHorizontal: 32 * SC,
  },
  readyBtnText: { color: C.white, fontSize: 16 * SC, fontWeight: '700' },

  speakArea: { alignItems: 'center' },
  micWrap:   { position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: 12 * SC },
  micRing: {
    position: 'absolute',
    width: 110 * SC, height: 110 * SC, borderRadius: 55 * SC,
    backgroundColor: 'rgba(254,156,45,0.22)',
  },
  micCircle: {
    width: 80 * SC, height: 80 * SC, borderRadius: 40 * SC,
    backgroundColor: C.teal, justifyContent: 'center', alignItems: 'center',
    zIndex: 1,
  },
  micEmoji: { fontSize: 36 * SC },
  micHint:  { color: C.textDim, fontSize: 14 * SC, letterSpacing: 0.3 },

  successArea:  { alignItems: 'center' },
  successIcon:  { fontSize: 62 * SC, color: '#4CAF50', fontWeight: '800' },
  successLabel: { color: C.white, fontSize: 20 * SC, fontWeight: '700', marginTop: 8 * SC },

  successFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(76,175,80,0.22)',
    zIndex: 99, pointerEvents: 'none',
  },
});
