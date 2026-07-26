import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  TextInput,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { API_BASE_URL } from '../config/env';
import { fetchWithAuth } from '../utils/authHeaders';
import { onSessionComplete } from '../services/notificationService';
import { getPersonalSentence, savePersonalSentence, getUserProfile } from '../utils/storage';
import { tryCompleteSession, recordCheckin } from '../services/progressService';
import { fetchDifficultyTiers, fetchProgressPlan, fetchCheckinNumber, DEFAULT_TIERS, saveSessionExerciseScores } from '../services/difficultyService';
import { useLargeText } from '../context/PrefsContext';
import { colors } from '../theme';
import { logFunnelEvent, logScreenView } from '../utils/analytics';
import ScreenHeader from '../components/ScreenHeader';
import SpeakerButton from '../components/SpeakerButton';
import ConfirmSheet from '../components/ConfirmSheet';

import BreathingExercise  from './vocaltraining/exercises/BreathingExercise';
import SustainedPhonation from './vocaltraining/exercises/SustainedPhonationExercise';
import PitchGlides        from './vocaltraining/exercises/PitchGlidesExercise';
import FunctionalSpeech   from './vocaltraining/exercises/FunctionalSpeechExercise';

const { width: W } = Dimensions.get('window');
const SC = W / 402;

const ORANGE = '#FFA940';
const WHITE  = '#FFFFFF';
const MINT   = '#C3DECE';

const BARS_COUNT      = 26;
const BAR_INTERVAL_MS = 80;
const BAR_W           = Math.max(3, Math.floor((W - 56) / BARS_COUNT) - 2);
const MIN_REC_S       = 3;
const MAX_REC_S       = 20;
const PROGRESS_BAR_H  = 8;

const MINI_EXERCISES = [
  { type: 'breathing',   label: 'Breathing' },
  { type: 'phonation',   label: 'Sustained Phonation' },
  { type: 'pitchGlides', label: 'Pitch Glides' },
  { type: 'speech',      label: 'Functional Speech' },
];

const EXERCISE_MAP = {
  breathing:   BreathingExercise,
  phonation:   SustainedPhonation,
  pitchGlides: PitchGlides,
  speech:      FunctionalSpeech,
};

// ── Score arc ─────────────────────────────────────────────────────────────────
function ScoreArc({ score, label, color = ORANGE }) {
  const SIZE = 88 * SC;
  const SW   = 7;
  const r    = (SIZE - SW) / 2;
  const circ = 2 * Math.PI * r;
  const pct  = score != null ? Math.max(0, Math.min(100, score)) / 100 : 0;
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={r} stroke="rgba(255,255,255,0.10)" strokeWidth={SW} fill="none" />
          {score != null && (
            <Circle
              cx={SIZE / 2} cy={SIZE / 2} r={r}
              stroke={color} strokeWidth={SW} fill="none"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - pct)}
              strokeLinecap="round"
              rotation="-90"
              origin={`${SIZE / 2}, ${SIZE / 2}`}
            />
          )}
        </Svg>
        <View style={arcS.center}>
          <Text style={[arcS.num, { color: score != null ? color : 'rgba(255,255,255,0.25)' }]}>
            {score != null ? score : '–'}
          </Text>
        </View>
      </View>
      <Text style={arcS.label}>{label}</Text>
    </View>
  );
}
const arcS = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  num:    { fontSize: 20, fontWeight: '800' },
  label:  { color: 'rgba(255,255,255,0.60)', fontSize: 16, fontWeight: '600', letterSpacing: 0.4, textAlign: 'center' },
});

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CheckinScreen({ navigation }) {
  const { top, bottom } = useSafeAreaInsets();
  const largeText = useLargeText();
  const fs = (base) => largeText ? Math.round(base * 1.25) : base;

  // phase: 'loading' | 'setup' | 'pre' | 'mini' | 'post' | 'comparison'
  const [phase,    setPhase]    = useState('loading');
  // within 'pre' and 'post': 'ready' | 'recording' | 'processing'
  const [recPhase, setRecPhase] = useState('ready');

  const [personalSentence, setPersonalSentence] = useState('');
  const [sentenceInput,    setSentenceInput]    = useState('');
  const [preScores,        setPreScores]        = useState(null);
  const [postScores,       setPostScores]       = useState(null);
  const [miniExIndex,      setMiniExIndex]      = useState(0);
  const [bars,             setBars]             = useState(Array(BARS_COUNT).fill(0.015));
  const [elapsed,          setElapsed]          = useState(0);
  const [canStop,          setCanStop]          = useState(false);
  const [finishing,        setFinishing]        = useState(false);
  const [tiers,            setTiers]            = useState(DEFAULT_TIERS);
  const [progressPlan,     setProgressPlan]     = useState(null);
  const [checkinNumber,    setCheckinNumber]    = useState(1);
  // confirmSheet: config for ConfirmSheet; null = hidden.
  const [confirmSheet,     setConfirmSheet]     = useState(null);

  const progressAnim   = useRef(new Animated.Value(0)).current;
  const recordingRef   = useRef(null);
  const timerRef       = useRef(null);
  const barTimerRef    = useRef(null);
  const stoppingRef    = useRef(false);
  const volumeRef      = useRef(0);
  const startMsRef     = useRef(0);
  const whichCheckRef  = useRef('pre');
  // Accumulates per-exercise scores across the mini phase — saved to Firestore
  // at finish so the rolling nudge system has up-to-date data to work with.
  const miniScoresRef  = useRef({});

  useEffect(() => {
    const logExit = logScreenView('Checkin');
    loadSentence();
    fetchDifficultyTiers().then(setTiers).catch(() => {/* keep defaults */});
    // Load the personalised plan and check-in number so the comparison screen
    // can show whether the user is on track against their session 7 / 14 targets.
    fetchProgressPlan().then(p => { if (p) setProgressPlan(p); }).catch(() => {});
    fetchCheckinNumber().then(setCheckinNumber).catch(() => {});
    return () => {
      logExit();
      clearInterval(timerRef.current);
      clearInterval(barTimerRef.current);
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  // Guard against accidental exit during the mini-exercise, post-recording, and
  // comparison phases — all three are part of the committed check-in flow and
  // leaving any of them discards the pre/post score pair.
  // 'comparison' gets a different alert: the user can optionally finish early
  // (runs handleFinish) or leave without saving (destructive).
  useEffect(() => {
    const guarded = ['mini', 'post', 'comparison'];
    if (!guarded.includes(phase)) return;
    const unsub = navigation.addListener('beforeRemove', (e) => {
      // Allow programmatic navigation (replace/reset) — block only user-initiated back
      const actionType = e.data.action.type;
      if (actionType === 'REPLACE' || actionType === 'RESET') return;
      e.preventDefault();

      // Use ConfirmSheet instead of Alert.alert for consistent bottom-sheet styling.
      // In 'comparison' phase the user has completed all exercises, so offer the option
      // to finish properly (save progress) alongside the destructive leave path.
      const pendingAction = e.data.action;

      if (phase === 'comparison') {
        setConfirmSheet({
          title: 'Leave check-in?',
          body:  'Your results are ready. Finish to save your progress.',
          actions: [
            {
              label: 'Stay',
              onPress: () => setConfirmSheet(null),
            },
            {
              label: 'Finish now',
              onPress: () => {
                setConfirmSheet(null);
                handleFinish();
              },
            },
            {
              label: 'Leave without saving',
              destructive: true,
              onPress: () => {
                setConfirmSheet(null);
                navigation.dispatch(pendingAction);
              },
            },
          ],
        });
      } else {
        // 'mini' and 'post' phases — two actions only.
        setConfirmSheet({
          title: 'Leave check-in?',
          body:  "Your progress won't be saved if you leave now.",
          actions: [
            {
              label: 'Stay',
              onPress: () => setConfirmSheet(null),
            },
            {
              label: 'Leave',
              destructive: true,
              onPress: () => {
                setConfirmSheet(null);
                navigation.dispatch(pendingAction);
              },
            },
          ],
        });
      }
    });
    return unsub;
  }, [navigation, phase]);

  async function loadSentence() {
    const saved = await getPersonalSentence();
    if (saved) {
      setPersonalSentence(saved);
      setPhase('pre');
    } else {
      setPhase('setup');
    }
  }

  async function handleSaveSentence() {
    const trimmed = sentenceInput.trim();
    if (!trimmed) return;
    await savePersonalSentence(trimmed);
    setPersonalSentence(trimmed);
    setPhase('pre');
  }

  // ── Recording ──────────────────────────────────────────────────────────────

  async function startRecording(which) {
    whichCheckRef.current = which;
    stoppingRef.current   = false;
    volumeRef.current     = 0;
    setElapsed(0);
    setCanStop(false);
    setBars(Array(BARS_COUNT).fill(0.015));
    setRecPhase('recording');

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

      barTimerRef.current = setInterval(() => {
        const vol = volumeRef.current;
        setBars(prev => [...prev.slice(1), Math.max(0.015, vol + Math.random() * 0.018)]);
      }, BAR_INTERVAL_MS);

      timerRef.current = setInterval(() => {
        setElapsed(s => {
          const next = s + 1;
          if (next >= MIN_REC_S) setCanStop(true);
          if (next >= MAX_REC_S && !stoppingRef.current) {
            stoppingRef.current = true;
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (e) {
      console.error('[Checkin] startRecording:', e?.message);
      setRecPhase('ready');
    }
  }

  async function stopRecording() {
    clearInterval(timerRef.current);
    clearInterval(barTimerRef.current);
    timerRef.current    = null;
    barTimerRef.current = null;

    const rec = recordingRef.current;
    recordingRef.current = null;
    if (!rec) return;

    const durationS = Math.round((Date.now() - startMsRef.current) / 1000);
    setRecPhase('processing');

    let scores = { voice_power: null, expression: null, fluency: null };
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

      if (uri) {
        const form = new FormData();
        form.append('file', { uri, type: 'audio/m4a', name: 'checkin.m4a' });
        // Use distinct task_type values so pre/post recordings are identifiable
        // in the voice_sessions Firestore collection (not mixed with assessment readings).
        form.append('task_type', whichCheckRef.current === 'pre' ? 'checkin_pre' : 'checkin_post');
        form.append('audio_duration_s', String(durationS));
        // Send the personal sentence text as the transcript so the backend can compute
        // WPM accurately. Without this, the fluency score is pause-only (low accuracy
        // for a short 3–20 s utterance).
        form.append('transcript', personalSentence);
        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), 30000);
        try {
          const res = await fetchWithAuth(`${API_BASE_URL}/api/analyze-voice`, {
            method: 'POST',
            body: form,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (res.ok) {
            const d = await res.json();
            scores = d.data?.scores ?? scores;
          }
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          console.warn('[Checkin] analyze-voice failed/timed out:', fetchErr?.message);
        }
      }
    } catch (e) {
      console.error('[Checkin] stopRecording error:', e?.message);
    }

    setRecPhase('ready');

    if (whichCheckRef.current === 'pre') {
      setPreScores(scores);
      progressAnim.setValue(0);
      setMiniExIndex(0);
      setPhase('mini');
    } else {
      setPostScores(scores);
      setPhase('comparison');
    }
  }

  // ── Mini exercises ─────────────────────────────────────────────────────────

  // score: 0–100 | null — collect for saveSessionExerciseScores at finish.
  // exerciseType key must match EXERCISE_KEYS in difficultyService.
  function handleMiniComplete(score) {
    const { type } = MINI_EXERCISES[miniExIndex];
    if (score != null && Number.isFinite(score) && score > 0) {
      miniScoresRef.current[type] = Math.round(score);
    }

    const next = miniExIndex + 1;
    Animated.timing(progressAnim, {
      toValue: next / MINI_EXERCISES.length,
      duration: 500,
      useNativeDriver: false,
    }).start();
    if (next >= MINI_EXERCISES.length) {
      setRecPhase('ready');
      setPhase('post');
    } else {
      setMiniExIndex(next);
    }
  }

  // ── Finish ─────────────────────────────────────────────────────────────────

  async function handleFinish() {
    setFinishing(true);
    try {
      // Tiers are now managed exclusively by the rolling nudge system
      // (nudgeTiersFromRecentScores at session start) — adjustDifficultyAfterCheckin
      // is no longer called here to avoid double-adjusting. Pre/post scores are kept
      // for the comparison display but do not drive tier changes directly (M8).

      // Persist mini exercise scores so the rolling nudge system has fresh data.
      // Non-fatal — a failed write does not block the user from completing the check-in.
      if (Object.keys(miniScoresRef.current).length > 0) {
        saveSessionExerciseScores(miniScoresRef.current).catch(() => {});
      }

      // Save post-session scores as a check-in entry so ProgressScreen sparklines update.
      // Non-fatal: a failed save does not block the user from completing the check-in.
      if (postScores) {
        try {
          const ciForm = new FormData();
          ciForm.append('assessment_type', 'checkin');
          if (postScores.voice_power != null) ciForm.append('voice_power', String(Math.round(postScores.voice_power)));
          if (postScores.expression  != null) ciForm.append('expression',  String(Math.round(postScores.expression)));
          if (postScores.fluency     != null) ciForm.append('fluency',     String(Math.round(postScores.fluency)));
          ciForm.append('task_results_json', '{}');
          await fetchWithAuth(`${API_BASE_URL}/api/save-assessment`, {
            method: 'POST',
            body: ciForm,
          });
        } catch (ciErr) {
          console.warn('[Checkin] save-assessment non-fatal:', ciErr?.message);
        }
      }

      logFunnelEvent('checkin_completed');
      // Record that a check-in has been completed at the current session count.
      // This stamps last_checkin_session in Firestore so fetchCheckinNumber() returns
      // 2 on the next check-in and isCheckinDue() doesn't re-trigger immediately.
      // Must run before tryCompleteSession() so the stamp is always written even if
      // completeSession fails (network blip) — the check-in has been completed regardless.
      await recordCheckin();
      const result  = await tryCompleteSession();
      onSessionComplete().catch(() => {}); // reset re-engagement clock (non-fatal)
      const profile = await getUserProfile();
      const firstName = profile?.name ? profile.name.trim().split(' ')[0] : '';
      navigation.replace('StreakCelebration', {
        streakDays: result.streak_days,
        userName: firstName,
      });
    } catch {
      setFinishing(false);
      // Use ConfirmSheet instead of Alert.alert for consistent styling.
      setConfirmSheet({
        title: 'Could not save check-in',
        body:  'Check your connection and try again. Your recorded audio is not lost.',
        actions: [
          {
            label: 'Try again',
            onPress: () => {
              setConfirmSheet(null);
              handleFinish();
            },
          },
          {
            label: 'Go home',
            destructive: true,
            onPress: () => {
              setConfirmSheet(null);
              navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
            },
          },
        ],
      });
    }
  }

  // ── Render: loading ────────────────────────────────────────────────────────

  if (phase === 'loading') {
    // Use the canonical session gradient while data loads.
    return (
      <LinearGradient colors={colors.gradients.session} style={s.rootCentered}>
        <ActivityIndicator color={ORANGE} size="large" />
      </LinearGradient>
    );
  }

  // ── Render: sentence setup ─────────────────────────────────────────────────

  if (phase === 'setup') {
    return (
      // Canonical session gradient — consistent with all other Checkin phases.
      // ScreenHeader now handles the top safe area inset internally.
      <LinearGradient colors={colors.gradients.session} style={s.root}>
        <StatusBar barStyle="light-content" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[s.page, { paddingBottom: bottom + 40 }]}>
            {/* Header now rendered by shared ScreenHeader component */}
            <ScreenHeader
              navigation={navigation}
              title="Progress Check-in"
            />
            <Text style={s.eyebrow}>PROGRESS CHECK-IN</Text>
            <Text style={s.heroTitle}>Your personal{'\n'}sentence</Text>
            <Text style={s.body}>
              Choose a sentence you say every day — something real. You'll record it before and after each
              check-in so we can measure your real-world progress.
            </Text>
            <TextInput
              style={s.input}
              placeholder={'e.g. I\'d like a cup of tea please.'}
              placeholderTextColor="rgba(255,255,255,0.45)"
              accessibilityLabel="Enter your personal sentence"
              value={sentenceInput}
              onChangeText={setSentenceInput}
              multiline
              maxLength={120}
              returnKeyType="done"
            />
            <Text style={s.charCount}>{sentenceInput.length} / 120</Text>
            <TouchableOpacity
              style={[s.primaryBtn, !sentenceInput.trim() && s.btnDisabled]}
              onPress={handleSaveSentence}
              disabled={!sentenceInput.trim()}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Save"
            >
              <Text style={s.primaryBtnText}>Save & Begin</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    );
  }

  // ── Render: mini exercises (full-screen) ───────────────────────────────────

  if (phase === 'mini') {
    const { type } = MINI_EXERCISES[miniExIndex];
    const ExerciseComponent = EXERCISE_MAP[type];
    return (
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <ExerciseComponent
            onComplete={handleMiniComplete}
            onSkip={handleMiniComplete}
            onExit={() => navigation.goBack()}
            exerciseIndex={miniExIndex}
            totalExercises={MINI_EXERCISES.length}
            tier={tiers[MINI_EXERCISES[miniExIndex].type] ?? 1}
          />
          {__DEV__ && (
            <TouchableOpacity
              style={s.skipZone}
              onLongPress={handleMiniComplete}
              delayLongPress={2000}
              activeOpacity={1}
            />
          )}
        </View>
        <View style={s.progressTrack}>
          <Animated.View
            style={[s.progressFill, {
              width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }]}
          />
        </View>
        {/* Leave-guard sheet shown when the user tries to back out during mini exercises */}
        <ConfirmSheet config={confirmSheet} onDismiss={() => setConfirmSheet(null)} />
      </View>
    );
  }

  // ── Render: pre / post recording ──────────────────────────────────────────

  if (phase === 'pre' || phase === 'post') {
    const isPre = phase === 'pre';
    // Both pre and post recording phases use the canonical session gradient.
    // The old forest-green (#1E3828) post variant is replaced for consistency.
    // ScreenHeader now handles the top safe area inset internally.
    return (
      <LinearGradient
        colors={colors.gradients.session}
        style={s.root}
      >
        <StatusBar barStyle="light-content" />
        <View style={[s.page, { flex: 1, justifyContent: 'flex-start', paddingBottom: bottom + 24 }]}>
          {/* Header now rendered by shared ScreenHeader component.
              Hidden during active recording so the user can focus on the task. */}
          {recPhase !== 'recording' && (
            <ScreenHeader
              navigation={navigation}
              title="Progress Check-in"
            />
          )}
          <Text style={s.eyebrow}>{isPre ? 'PRE-CHECK' : 'POST-CHECK'}</Text>
          <Text style={s.heroTitle}>{isPre ? 'Before\nyour training' : 'After\nyour training'}</Text>
          <Text style={[s.body, { fontSize: fs(18) }]}>Read this sentence aloud, just as you would in everyday conversation.</Text>

          <View style={s.sentenceCard}>
            <Text style={[s.sentenceText, { fontSize: fs(18), lineHeight: fs(18) * 1.56 }]}>"{personalSentence}"</Text>
          </View>

          {recPhase === 'ready' && (
            <TouchableOpacity
              style={s.recordBtn}
              onPress={() => startRecording(phase)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Start recording"
            >
              <View style={s.recordDot} />
              <Text style={s.recordBtnText}>Tap to Record</Text>
            </TouchableOpacity>
          )}

          {recPhase === 'recording' && (
            <View style={s.recordingArea}>
              <View style={s.barGraph}>
                {bars.map((v, i) => (
                  <View
                    key={i}
                    style={[s.bar, {
                      width: BAR_W,
                      height: Math.max(4, v * 80),
                      backgroundColor: v > 0.18 ? ORANGE : 'rgba(255,255,255,0.18)',
                    }]}
                  />
                ))}
              </View>
              <Text style={s.timerText}>{elapsed}s</Text>
              <TouchableOpacity
                style={[s.primaryBtn, { width: '60%' }, !canStop && s.btnDisabled]}
                onPress={() => {
                  if (!stoppingRef.current && canStop) {
                    stoppingRef.current = true;
                    stopRecording();
                  }
                }}
                disabled={!canStop}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Done recording"
              >
                <Text style={s.primaryBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}

          {recPhase === 'processing' && (
            <View style={s.centeredStatus}>
              <ActivityIndicator color={ORANGE} size="large" />
              <Text style={s.body}>Analysing your voice…</Text>
            </View>
          )}
        </View>
      </LinearGradient>
    );
  }

  // ── Render: comparison ────────────────────────────────────────────────────

  if (phase === 'comparison') {
    const SCORE_KEYS = ['voice_power', 'expression', 'fluency'];
    const LABELS     = { voice_power: 'Voice Power', expression: 'Pitch Variety', fluency: 'Speech Rhythm' };
    const COLORS     = { voice_power: ORANGE, expression: MINT, fluency: '#9FCFBD' };

    const totalPre  = SCORE_KEYS.reduce((a, k) => a + (preScores?.[k]  ?? 0), 0);
    const totalPost = SCORE_KEYS.reduce((a, k) => a + (postScores?.[k] ?? 0), 0);
    const improved  = totalPost >= totalPre;

    // Tier changes now come from rolling averages (nudgeTiersFromRecentScores at
    // session start) — predicting them from a single check-in delta was unreliable.
    // Removed: predictedTierChanges, anyUp, anyDown, tier pill row (M8).

    // Canonical session gradient — same as all other Checkin phases.
    // The comparison phase has no back button — the user must finish or use
    // the navigation gesture — so ScreenHeader is omitted here.
    // ScreenHeader handles its own top inset so paddingTop: top is not needed.
    const comparisonBodyText = improved
      ? "Your scores went up after today's training. Every session is building something real."
      : "Consistency is what counts. Your voice is being strengthened with every session.";

    return (
      <LinearGradient colors={colors.gradients.session} style={s.root}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={[s.page, { paddingBottom: bottom + 40 }]}>
          <Text style={s.eyebrow}>YOUR PROGRESS</Text>
          <Text style={s.heroTitle}>{improved ? 'You improved!' : 'Keep going!'}</Text>
          <Text style={s.body}>{comparisonBodyText}
          </Text>

          {/* Arc grids: before and after side-by-side */}
          <View style={s.arcSection}>
            <View style={s.arcCol}>
              <Text style={s.arcColLabel}>Before</Text>
              <View style={s.arcRow}>
                {SCORE_KEYS.map(k => (
                  <ScoreArc
                    key={k}
                    score={preScores?.[k]}
                    label={LABELS[k]}
                    color={COLORS[k]}
                  />
                ))}
              </View>
            </View>
            <View style={s.arcDivider} />
            <View style={s.arcCol}>
              <Text style={s.arcColLabel}>After</Text>
              <View style={s.arcRow}>
                {SCORE_KEYS.map(k => {
                  const pre  = preScores?.[k];
                  const post = postScores?.[k];
                  const delta = pre != null && post != null ? post - pre : null;
                  return (
                    <View key={k} style={{ alignItems: 'center' }}>
                      <ScoreArc score={post} label={LABELS[k]} color={COLORS[k]} />
                      {delta != null && (
                        <Text style={[s.delta, { color: delta >= 0 ? '#68D88C' : '#FF7070' }]}>
                          {delta >= 0 ? `+${delta}` : String(delta)}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Training level note — tier changes now come from rolling averages,
              not from a single check-in delta, so prediction pills are removed (M8). */}
          <View style={s.tierBadge}>
            <Text style={s.tierBadgeText}>
              {'✓ Your training level adjusts automatically as you practise.'}
            </Text>
          </View>

          {/* Vs plan — compare postScores against the relevant milestone target */}
          {progressPlan && postScores && (() => {
            // Pick the correct milestone: session 7 on first check-in, session 14 on second
            const target      = checkinNumber === 1 ? progressPlan.checkin1 : progressPlan.checkin2;
            const targetLabel = checkinNumber === 1 ? 'Session 7 target' : 'Session 14 target';

            // Classify each dimension relative to target (within 8 points = on track)
            function status(key) {
              const post = postScores?.[key];
              const tgt  = target?.[key];
              if (post == null || tgt == null) return null;
              if (post >= tgt)         return 'ahead';
              if (post >= tgt - 8)     return 'on-track';
              return 'behind';
            }

            const PLAN_DIMS = [
              { key: 'voice_power', label: 'Voice Power' },
              { key: 'expression',  label: 'Pitch Variety' },
              { key: 'fluency',     label: 'Speech Rhythm' },
            ];

            return (
              <View style={s.planCard}>
                <Text style={s.planEyebrow}>VS YOUR PLAN</Text>
                <Text style={s.planSubtitle}>{targetLabel}</Text>
                {PLAN_DIMS.map(({ key, label }) => {
                  const post  = postScores?.[key] ?? null;
                  const tgt   = target?.[key]     ?? null;
                  const st    = status(key);
                  if (st == null) return null;
                  return (
                    <View key={key} style={s.planRow}>
                      <Text style={s.planRowLabel}>{label}</Text>
                      <Text style={s.planRowScore}>{post ?? '–'}</Text>
                      <Text style={s.planRowSep}>/ {tgt ?? '–'}</Text>
                      <View style={[s.planTag,
                        st === 'ahead'    ? s.planTagAhead    :
                        st === 'on-track' ? s.planTagOnTrack  : s.planTagBehind
                      ]}>
                        <Text style={s.planTagText}>
                          {st === 'ahead' ? 'Ahead' : st === 'on-track' ? 'On Track' : 'Behind'}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })()}

          <TouchableOpacity
            style={[s.primaryBtn, finishing && s.btnDisabled]}
            onPress={handleFinish}
            disabled={finishing}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Finish"
          >
            {finishing
              ? <ActivityIndicator color={WHITE} size="small" />
              : <Text style={s.primaryBtnText}>Finish</Text>}
          </TouchableOpacity>
        </ScrollView>

        {/* Save-error sheet shown when handleFinish fails */}
        <ConfirmSheet config={confirmSheet} onDismiss={() => setConfirmSheet(null)} />
      </LinearGradient>
    );
  }

  return null;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },
  rootCentered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  page: { paddingHorizontal: 28, paddingTop: 28, width: '100%' },

  // Header now rendered by shared ScreenHeader component

  eyebrow: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 10,
  },
  heroTitle: {
    color: WHITE,
    fontSize: 33,
    fontWeight: '800',
    lineHeight: 39,
    marginBottom: 14,
  },
  body: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 18,
    lineHeight: 27,
    marginBottom: 24,
  },

  // Setup
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    color: WHITE,
    fontSize: 17,
    padding: 16,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  charCount: {
    color: 'rgba(255,255,255,0.50)',
    fontSize: 16,
    textAlign: 'right',
    marginBottom: 24,
  },

  // Button
  primaryBtn: {
    backgroundColor: ORANGE,
    borderRadius: 28,
    paddingVertical: 20,    // fixed: ensures button ≥ 56px tall
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#1A1A1A', fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
  btnDisabled: { opacity: 0.38 },

  // Sentence card
  sentenceCard: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(195,222,206,0.18)',
    padding: 20,
    marginBottom: 36,
  },
  sentenceText: {
    color: WHITE,
    fontSize: 18,
    fontWeight: '500',
    lineHeight: 28,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Record button
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,169,64,0.12)',
    borderRadius: 60,
    borderWidth: 2,
    borderColor: ORANGE,
    paddingVertical: 22,
    paddingHorizontal: 40,
  },
  recordDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: ORANGE },
  recordBtnText: { color: ORANGE, fontSize: 18, fontWeight: '700' },

  // Recording UI
  recordingArea: { alignItems: 'center', gap: 16, width: '100%' },
  barGraph: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 2 },
  bar:      { borderRadius: 2 },
  timerText: { color: 'rgba(255,255,255,0.60)', fontSize: 17, letterSpacing: 0.5 },

  centeredStatus: { alignItems: 'center', gap: 16, marginTop: 32 },

  // Mini session progress bar
  skipZone: { position: 'absolute', bottom: 0, right: 0, width: 100, height: 100, opacity: 0 },
  progressTrack: { height: PROGRESS_BAR_H, backgroundColor: 'rgba(0,0,0,0.08)', width: '100%' },
  progressFill:  { height: '100%', backgroundColor: ORANGE, borderRadius: PROGRESS_BAR_H / 2 },

  // Comparison
  arcSection: { flexDirection: 'row', marginBottom: 32, alignItems: 'flex-start' },
  arcCol:     { flex: 1, alignItems: 'center', gap: 12 },
  arcColLabel: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  arcRow: { flexDirection: 'row', gap: 8 },
  arcDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.10)',
    marginHorizontal: 8,
  },
  delta: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  tierBadge: {
    backgroundColor: 'rgba(104,216,140,0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(104,216,140,0.35)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  tierBadgeDown: {
    backgroundColor: 'rgba(255,169,64,0.12)',
    borderColor: 'rgba(255,169,64,0.30)',
  },
  tierBadgeText: {
    color: WHITE,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.2,
  },

  // V2: per-exercise tier change pills
  tierChangesSection: {
    marginBottom: 12,
    gap: 8,
  },
  tierChangesLabel: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  tierPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tierPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  tierPillUp: {
    backgroundColor: 'rgba(104,216,140,0.15)',
    borderColor: 'rgba(104,216,140,0.40)',
  },
  tierPillDown: {
    backgroundColor: 'rgba(255,169,64,0.12)',
    borderColor: 'rgba(255,169,64,0.35)',
  },
  tierPillText: {
    color: WHITE,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // Vs-plan card in the comparison phase
  planCard: {
    backgroundColor: 'rgba(195,222,206,0.07)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(195,222,206,0.20)',
    padding: 16,
    gap: 10,
    marginBottom: 12,
  },
  planEyebrow: {
    color: MINT,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  planSubtitle: {
    color: 'rgba(255,255,255,0.55)',
    // Raised from 15→16 to meet WCAG 2.1 AA minimum for functional text.
    fontSize: 16,
    fontWeight: '600',
    marginTop: -4,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  planRowLabel: {
    color: 'rgba(255,255,255,0.70)',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  planRowScore: {
    color: WHITE,
    fontSize: 17,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'right',
  },
  planRowSep: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: 15,
    minWidth: 36,
  },
  planTag: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
  },
  planTagAhead: {
    backgroundColor: 'rgba(104,216,140,0.18)',
  },
  planTagOnTrack: {
    backgroundColor: 'rgba(195,222,206,0.15)',
  },
  planTagBehind: {
    backgroundColor: 'rgba(255,169,64,0.14)',
  },
  planTagText: {
    color: WHITE,
    // Raised from 13→16 to meet WCAG 2.1 AA minimum for functional text.
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
