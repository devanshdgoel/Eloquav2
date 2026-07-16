/**
 * DailyVoiceNoteScreen
 *
 * Appears once per day before any training or baseline session.
 * Asks the user a short daily question and records ~20 s of speech.
 *
 * Why this exists:
 *   - Provides a longitudinal, unstimulated voice sample captured in the
 *     user's own words — the most ecologically valid snapshot of their voice.
 *   - Runs through the same /api/analyze-voice pipeline as all other tasks,
 *     so voice_power / expression / fluency are tracked day-over-day.
 *   - The recording is also available for qualitative review: clinicians or
 *     the user can listen back to hear subjective change over time.
 *
 * Gate: once the user records today (or skips), AsyncStorage stores today's
 * date. The screen skips itself transparently on subsequent opens today.
 *
 * Navigation: always navigates forward to route.params.nextScreen with
 * route.params.nextParams — it never goes back.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithAuth } from '../../utils/authHeaders';
import { API_BASE_URL } from '../../config/env';
import { getUserProfile } from '../../utils/storage';

const { width: W } = Dimensions.get('window');

// ── Constants ─────────────────────────────────────────────────────────────────
const DAILY_VOICE_KEY = '@eloqua_daily_voice_date'; // YYYY-MM-DD of last recording
const MAX_REC_S       = 20;    // auto-stop (seconds)
const MIN_REC_S       = 3;     // Done button unlocks after this many seconds
const BARS_COUNT      = 28;
const BAR_INTERVAL_MS = 80;
const BAR_W = Math.max(3, Math.floor((W - 64) / BARS_COUNT) - 2);

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG_GRADIENT = ['#37767A', '#1C4047', '#0A1618'];
const ORANGE = '#FFA940';
const WHITE  = '#FFFFFF';
const MINT   = '#C3DECE';

// ── Daily questions — one per day of the week, consistent all day so the
// user sees the same prompt whether they open at 7 am or 7 pm.
const QUESTIONS = [
  'How are you\nfeeling today?',        // Sunday
  'How did you\nsleep last night?',     // Monday
  'How is your\nvoice today?',          // Tuesday
  'Tell me about\nyour morning.',       // Wednesday
  'How is your\nenergy today?',         // Thursday
  "What's something\ngood from today?", // Friday
  'How are you\ngetting on?',           // Saturday
];

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC-stable enough
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function DailyVoiceNoteScreen({ navigation, route }) {
  const { nextScreen, nextParams } = route.params ?? {};

  // phase: 'checking' | 'idle' | 'recording' | 'uploading'
  const [phase,    setPhase]    = useState('checking');
  const [elapsed,  setElapsed]  = useState(0);
  const [canDone,  setCanDone]  = useState(false);
  const [bars,     setBars]     = useState(Array(BARS_COUNT).fill(0.015));
  const [userName, setUserName] = useState('');

  const recordingRef  = useRef(null);
  const timerRef      = useRef(null);
  const barTimerRef   = useRef(null);
  const maxTimerRef   = useRef(null);
  const volumeRef     = useRef(0);
  const startMsRef    = useRef(0);
  const stoppingRef   = useRef(false);

  // Progress bar animates from 0 → 1 over MAX_REC_S during recording
  const progressAnim = useRef(new Animated.Value(0)).current;
  // Idle pulse — mic button gently scales in/out to invite a tap
  const pulseAnim    = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // On mount: check AsyncStorage for today's recording, load name.
    async function init() {
      try {
        const [lastDate, profile] = await Promise.all([
          AsyncStorage.getItem(DAILY_VOICE_KEY),
          getUserProfile(),
        ]);
        if (profile?.name) setUserName(profile.name.split(' ')[0]);
        // Already recorded today → skip screen entirely
        if (lastDate === todayDateString()) {
          navigation.replace(nextScreen, nextParams ?? {});
          return;
        }
      } catch (_) {}
      setPhase('idle');
    }
    init();

    return () => {
      clearTimeout(maxTimerRef.current);
      clearInterval(timerRef.current);
      clearInterval(barTimerRef.current);
      pulseAnim.stopAnimation();
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Start the idle pulse animation whenever the screen is in idle phase
  useEffect(() => {
    if (phase !== 'idle') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.00, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function goToSession() {
    navigation.replace(nextScreen, nextParams ?? {});
  }

  function handleSkip() {
    stopCleanup();
    goToSession();
  }

  // ── Recording ──────────────────────────────────────────────────────────────

  async function startRecording() {
    stoppingRef.current = false;
    volumeRef.current = 0;
    setElapsed(0);
    setCanDone(false);
    setBars(Array(BARS_COUNT).fill(0.015));
    progressAnim.setValue(0);

    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
        (status) => {
          const db = status.metering ?? -160;
          volumeRef.current = Math.min(1, Math.max(0, (db + 70) / 60));
        },
        BAR_INTERVAL_MS,
      );
      recordingRef.current = recording;
      startMsRef.current   = Date.now();
      setPhase('recording');

      // Update waveform bars at the metering interval
      barTimerRef.current = setInterval(() => {
        const vol = volumeRef.current;
        setBars(prev => [...prev.slice(1), Math.max(0.015, vol + Math.random() * 0.022)]);
      }, BAR_INTERVAL_MS);

      // Elapsed counter + unlock Done after MIN_REC_S
      timerRef.current = setInterval(() => {
        setElapsed(s => {
          const next = s + 1;
          if (next >= MIN_REC_S) setCanDone(true);
          return next;
        });
      }, 1000);

      // Smooth progress bar draining over the full MAX_REC_S window
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: MAX_REC_S * 1000,
        useNativeDriver: false,
      }).start();

      // Hard auto-stop so the screen never hangs
      maxTimerRef.current = setTimeout(() => {
        if (!stoppingRef.current) {
          stoppingRef.current = true;
          stopRecording();
        }
      }, MAX_REC_S * 1000);

    } catch (_) {
      // Mic unavailable — skip to session without blocking the user
      goToSession();
    }
  }

  function stopCleanup() {
    clearInterval(timerRef.current);
    clearInterval(barTimerRef.current);
    clearTimeout(maxTimerRef.current);
    progressAnim.stopAnimation();
    timerRef.current = barTimerRef.current = maxTimerRef.current = null;
  }

  async function stopRecording() {
    stopCleanup();

    const rec = recordingRef.current;
    recordingRef.current = null;

    setPhase('uploading');

    let uri = null;
    const durationS = Math.round((Date.now() - startMsRef.current) / 1000);
    try {
      if (rec) {
        await rec.stopAndUnloadAsync();
        uri = rec.getURI();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      }
    } catch (_) {}

    // Mark today as done now — before upload — so a network failure can't re-show
    // the screen on the next app open today.
    await AsyncStorage.setItem(DAILY_VOICE_KEY, todayDateString()).catch(() => {});

    // Upload in background (fire-and-forget); don't block navigation on it.
    if (uri) uploadVoiceNote(uri, durationS);

    // Let "Saving…" flash briefly so the transition feels intentional, not abrupt.
    setTimeout(goToSession, 900);
  }

  // Sends audio to the standard voice analysis pipeline with task_type='daily_checkin'.
  // Failures are fully silent — this is supplementary data, never blocking.
  async function uploadVoiceNote(uri, durationS) {
    try {
      const form = new FormData();
      form.append('file',             { uri, type: 'audio/m4a', name: 'daily_checkin.m4a' });
      form.append('task_type',        'daily_checkin');
      form.append('audio_duration_s', String(durationS));
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 25000);
      await fetchWithAuth(`${API_BASE_URL}/api/analyze-voice`, {
        method: 'POST',
        body:   form,
        signal: controller.signal,
      });
      clearTimeout(tid);
    } catch (_) {}
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  // Invisible during the AsyncStorage check so there's no flicker
  if (phase === 'checking') return null;

  const isIdle      = phase === 'idle';
  const isRecording = phase === 'recording';
  const isUploading = phase === 'uploading';
  const todayQ      = QUESTIONS[new Date().getDay()];

  return (
    <LinearGradient colors={BG_GRADIENT} style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Skip button — top right, very subtle so it doesn't compete with the question */}
      {(isIdle) && (
        <TouchableOpacity
          style={s.skipTopBtn}
          onPress={handleSkip}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Skip voice note"
        >
          <Text style={s.skipTopText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* ── Central content ───────────────────────────────────────────────── */}
      <View style={s.content}>

        {/* Greeting and category label */}
        <View style={s.headerBlock}>
          <Text style={s.greeting}>
            {getGreeting()}{userName ? `, ${userName}` : ''}
          </Text>
          <Text style={s.categoryLabel}>Daily Voice Note</Text>
        </View>

        {/* Question card — always visible; shrinks slightly during recording */}
        <View style={[s.questionCard, isRecording && s.questionCardCompact]}>
          <Text
            style={[s.questionText, isRecording && s.questionTextCompact]}
            numberOfLines={3}
            adjustsFontSizeToFit
          >
            {todayQ}
          </Text>
        </View>

        {/* ── Idle state ── */}
        {isIdle && (
          <>
            <Text style={s.hint}>Speak naturally for about 20 seconds</Text>

            {/* Pulsing mic button */}
            <View style={s.micOuter}>
              <Animated.View style={[s.micPulseRing, { transform: [{ scale: pulseAnim }] }]} />
              <TouchableOpacity
                style={s.micBtn}
                onPress={startRecording}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Start recording your voice note"
              >
                {/* Mic icon — two rects forming a mic shape */}
                <View style={s.micIcon}>
                  <View style={s.micBody} />
                  <View style={s.micBase} />
                  <View style={s.micStand} />
                </View>
              </TouchableOpacity>
            </View>
            <Text style={s.micLabel}>Tap to answer</Text>
          </>
        )}

        {/* ── Recording state ── */}
        {isRecording && (
          <View style={s.recordingBlock}>
            {/* Live waveform */}
            <View style={s.barGraph}>
              {bars.map((v, i) => (
                <View
                  key={i}
                  style={[s.bar, {
                    width:  BAR_W,
                    height: Math.max(4, v * 80),
                    backgroundColor: v > 0.20 ? ORANGE : 'rgba(255,255,255,0.22)',
                  }]}
                />
              ))}
            </View>

            {/* Timer */}
            <Text style={s.timer}>
              {elapsed}
              <Text style={s.timerSuffix}>s / {MAX_REC_S}s</Text>
            </Text>

            {/* Time progress bar */}
            <View style={s.progressTrack}>
              <Animated.View style={[s.progressFill, {
                width: progressAnim.interpolate({
                  inputRange:  [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              }]} />
            </View>

            {/* Done button — disabled until MIN_REC_S */}
            <TouchableOpacity
              style={[s.doneBtn, !canDone && s.doneBtnDisabled]}
              onPress={() => {
                if (canDone && !stoppingRef.current) {
                  stoppingRef.current = true;
                  stopRecording();
                }
              }}
              disabled={!canDone}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={canDone ? 'Done recording' : 'Keep speaking'}
            >
              <Text style={[s.doneBtnText, !canDone && s.doneBtnTextDisabled]}>
                {canDone ? 'Done  ✓' : 'Keep going…'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Uploading state ── */}
        {isUploading && (
          <View style={s.uploadingRow}>
            <ActivityIndicator color={ORANGE} size="small" />
            <Text style={s.uploadingText}>Saving your note…</Text>
          </View>
        )}

      </View>

      {/* Bottom skip link — only in idle so it doesn't compete during recording */}
      {isIdle && (
        <TouchableOpacity
          style={s.skipBottom}
          onPress={handleSkip}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Skip for now"
        >
          <Text style={s.skipBottomText}>Skip for now</Text>
        </TouchableOpacity>
      )}
    </LinearGradient>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },

  // ── Skip button (top right) ───────────────────────────────────────────────
  skipTopBtn: {
    position: 'absolute',
    top: 54, right: 20,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    zIndex: 10,
  },
  skipTopText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // ── Main content ──────────────────────────────────────────────────────────
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 22,
  },

  headerBlock: { alignItems: 'center', gap: 6 },
  greeting: {
    color: MINT,
    fontSize: 19,
    fontWeight: '600',
    letterSpacing: 0.3,
    opacity: 0.85,
  },
  categoryLabel: {
    color: 'rgba(195,222,206,0.45)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },

  // ── Question card ─────────────────────────────────────────────────────────
  questionCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(195,222,206,0.16)',
    paddingHorizontal: 28,
    paddingVertical: 36,
    width: '100%',
    alignItems: 'center',
    // Subtle inner glow — makes the card feel lit from within
    shadowColor: MINT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 20,
    elevation: 0,
  },
  questionCardCompact: {
    paddingVertical: 22,
    borderRadius: 20,
  },
  questionText: {
    color: WHITE,
    fontSize: 38,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 50,
    letterSpacing: 0.2,
  },
  questionTextCompact: {
    fontSize: 26,
    lineHeight: 36,
  },

  // ── Idle state ────────────────────────────────────────────────────────────
  hint: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: 15,
    textAlign: 'center',
    letterSpacing: 0.2,
    marginTop: -6,
  },

  micOuter: {
    width: 100, height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  micPulseRing: {
    position: 'absolute',
    width: 100, height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,169,64,0.18)',
  },
  micBtn: {
    width: 84, height: 84,
    borderRadius: 42,
    backgroundColor: ORANGE,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 12,
  },
  // Simple mic icon built from views (no SVG dependency)
  micIcon: {
    width: 28, height: 36,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  micBody: {
    width: 16, height: 22,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
    position: 'absolute',
    top: 0,
  },
  micBase: {
    width: 24, height: 12,
    borderRadius: 12,
    borderWidth: 2.5,
    borderColor: '#1A1A1A',
    borderTopWidth: 0,
    position: 'absolute',
    bottom: 4,
  },
  micStand: {
    width: 2.5,
    height: 6,
    backgroundColor: '#1A1A1A',
    borderRadius: 2,
    position: 'absolute',
    bottom: 0,
  },

  micLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginTop: -6,
  },

  // ── Recording state ───────────────────────────────────────────────────────
  recordingBlock: {
    width: '100%',
    alignItems: 'center',
    gap: 14,
  },
  barGraph: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 80,
    gap: 2,
  },
  bar: { borderRadius: 3 },

  timer: {
    color: WHITE,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1,
  },
  timerSuffix: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 20,
    fontWeight: '400',
    letterSpacing: 0,
  },

  progressTrack: {
    width: '100%',
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: ORANGE,
    borderRadius: 3,
  },

  doneBtn: {
    backgroundColor: WHITE,
    borderRadius: 28,
    paddingVertical: 20,
    paddingHorizontal: 52,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  doneBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    shadowOpacity: 0,
    elevation: 0,
  },
  doneBtnText: {
    color: '#1A1A1A',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  doneBtnTextDisabled: {
    color: 'rgba(255,255,255,0.50)',
  },

  // ── Uploading state ───────────────────────────────────────────────────────
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  uploadingText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 17,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  // ── Skip bottom ───────────────────────────────────────────────────────────
  skipBottom: {
    alignItems: 'center',
    paddingBottom: 48,
  },
  skipBottomText: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: 15,
    letterSpacing: 0.2,
  },
});
