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
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { API_BASE_URL } from '../config/env';
import { getPersonalSentence, savePersonalSentence, getUserProfile } from '../utils/storage';
import { completeSession } from '../services/progressService';
import { adjustDifficultyAfterCheckin, fetchDifficultyTiers, DEFAULT_TIERS } from '../services/difficultyService';

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
  num:    { fontSize: 20 * SC, fontWeight: '800' },
  label:  { color: 'rgba(255,255,255,0.50)', fontSize: 10 * SC, fontWeight: '600', letterSpacing: 0.4, textAlign: 'center' },
});

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CheckinScreen({ navigation }) {
  const { top, bottom } = useSafeAreaInsets();

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

  const progressAnim   = useRef(new Animated.Value(0)).current;
  const recordingRef   = useRef(null);
  const timerRef       = useRef(null);
  const barTimerRef    = useRef(null);
  const stoppingRef    = useRef(false);
  const volumeRef      = useRef(0);
  const startMsRef     = useRef(0);
  const whichCheckRef  = useRef('pre');

  useEffect(() => {
    loadSentence();
    fetchDifficultyTiers().then(setTiers).catch(() => {/* keep defaults */});
    return () => {
      clearInterval(timerRef.current);
      clearInterval(barTimerRef.current);
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  // Guard against accidental exit during the mini-exercise phase so the
  // pre/post score pair remains valid. Outside that phase the user can
  // freely navigate back (they haven't committed to a check-in yet).
  useEffect(() => {
    if (phase !== 'mini') return;
    const unsub = navigation.addListener('beforeRemove', (e) => {
      // Allow programmatic navigation (replace/reset) — block only user-initiated back
      const actionType = e.data.action.type;
      if (actionType === 'REPLACE' || actionType === 'RESET') return;
      e.preventDefault();
      Alert.alert(
        'Leave check-in?',
        "Your progress won't be saved if you leave now.",
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Leave',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      );
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
        form.append('task_type', 'reading');
        form.append('audio_duration_s', String(durationS));
        const res = await fetch(`${API_BASE_URL}/api/analyze-voice`, { method: 'POST', body: form });
        if (res.ok) {
          const d = await res.json();
          scores = d.data?.scores ?? scores;
        }
      }
    } catch (e) {
      console.error('[Checkin] analyze error (non-fatal):', e?.message);
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

  function handleMiniComplete() {
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
      // Adjust difficulty tiers based on per-dimension pre/post score deltas (V2)
      if (preScores && postScores) {
        await adjustDifficultyAfterCheckin(preScores, postScores);
      }
      const result  = await completeSession();
      const profile = await getUserProfile();
      navigation.replace('StreakCelebration', {
        streakDays: result.streak_days,
        userName: profile?.name ?? '',
      });
    } catch {
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    }
  }

  // ── Render: loading ────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <LinearGradient colors={['#243E44', '#0D1E21']} style={s.root}>
        <ActivityIndicator color={ORANGE} size="large" />
      </LinearGradient>
    );
  }

  // ── Render: sentence setup ─────────────────────────────────────────────────

  if (phase === 'setup') {
    return (
      <LinearGradient colors={['#243E44', '#0D1E21']} style={[s.root, { paddingTop: top }]}>
        <StatusBar barStyle="light-content" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[s.page, { paddingBottom: bottom + 40 }]}>
            <Text style={s.eyebrow}>PROGRESS CHECK-IN</Text>
            <Text style={s.heroTitle}>Your personal{'\n'}sentence</Text>
            <Text style={s.body}>
              Choose a sentence you say every day — something real. You'll record it before and after each
              check-in so we can measure your real-world progress.
            </Text>
            <TextInput
              style={s.input}
              placeholder={'e.g. I\'d like a cup of tea please.'}
              placeholderTextColor="rgba(255,255,255,0.28)"
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
            onExit={() => navigation.goBack()}
            exerciseIndex={miniExIndex}
            totalExercises={MINI_EXERCISES.length}
            tier={tiers[MINI_EXERCISES[miniExIndex].type] ?? 1}
          />
          <TouchableOpacity
            style={s.skipZone}
            onLongPress={handleMiniComplete}
            delayLongPress={2000}
            activeOpacity={1}
          />
        </View>
        <View style={s.progressTrack}>
          <Animated.View
            style={[s.progressFill, {
              width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }]}
          />
        </View>
      </View>
    );
  }

  // ── Render: pre / post recording ──────────────────────────────────────────

  if (phase === 'pre' || phase === 'post') {
    const isPre = phase === 'pre';
    return (
      <LinearGradient
        colors={isPre ? ['#243E44', '#0D1E21'] : ['#1A3D35', '#0D2018']}
        style={[s.root, { paddingTop: top }]}
      >
        <StatusBar barStyle="light-content" />
        <View style={[s.page, { flex: 1, justifyContent: 'flex-start', paddingBottom: bottom + 24 }]}>
          <Text style={s.eyebrow}>{isPre ? 'PRE-CHECK' : 'POST-CHECK'}</Text>
          <Text style={s.heroTitle}>{isPre ? 'Before\nyour training' : 'After\nyour training'}</Text>
          <Text style={s.body}>Read this sentence aloud, just as you would in everyday conversation.</Text>

          <View style={s.sentenceCard}>
            <Text style={s.sentenceText}>"{personalSentence}"</Text>
          </View>

          {recPhase === 'ready' && (
            <TouchableOpacity
              style={s.recordBtn}
              onPress={() => startRecording(phase)}
              activeOpacity={0.85}
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

    // V2: compute per-dimension deltas matching TIER_SCORE_MAP in difficultyService
    // so tier change pills appear immediately, before the user taps Finish.
    const vpDelta = (postScores?.voice_power ?? 50) - (preScores?.voice_power ?? 50);
    const exDelta = (postScores?.expression  ?? 50) - (preScores?.expression  ?? 50);
    const flDelta = (postScores?.fluency     ?? 50) - (preScores?.fluency     ?? 50);

    const _dimDir = (delta) => delta > 5 ? 'up' : delta < -5 ? 'down' : 'flat';

    // per-exercise predicted changes
    const predictedTierChanges = {
      phonation:   _dimDir(vpDelta),
      loudness:    _dimDir(vpDelta),
      pitchGlides: _dimDir(exDelta),
      speech:      _dimDir(flDelta),
    };
    const EXERCISE_LABELS = {
      phonation: 'Phonation', loudness: 'Loudness',
      pitchGlides: 'Pitch', speech: 'Speech',
    };
    const anyUp   = Object.values(predictedTierChanges).some(d => d === 'up');
    const anyDown = Object.values(predictedTierChanges).some(d => d === 'down');

    return (
      <LinearGradient colors={['#1A3D35', '#0D2018']} style={[s.root, { paddingTop: top }]}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={[s.page, { paddingBottom: bottom + 40 }]}>
          <Text style={s.eyebrow}>YOUR PROGRESS</Text>
          <Text style={s.heroTitle}>{improved ? 'You improved!' : 'Keep going!'}</Text>
          <Text style={s.body}>
            {improved
              ? "Your scores went up after today's training. Every session is building something real."
              : "Consistency is what counts. Your voice is being strengthened with every session."}
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

          {/* V2: Per-exercise tier change pills — shows exactly which exercises level up/down */}
          {(anyUp || anyDown) ? (
            <View style={s.tierChangesSection}>
              <Text style={s.tierChangesLabel}>
                {anyUp && !anyDown ? 'Your training is levelling up:' :
                 anyDown && !anyUp ? 'Adjusting your training:' :
                 'Training updated:'}
              </Text>
              <View style={s.tierPillsRow}>
                {Object.entries(predictedTierChanges).map(([key, dir]) => {
                  if (dir === 'flat') return null;
                  const isUp = dir === 'up';
                  return (
                    <View key={key} style={[s.tierPill, isUp ? s.tierPillUp : s.tierPillDown]}>
                      <Text style={s.tierPillText}>
                        {isUp ? '⬆' : '⬇'} {EXERCISE_LABELS[key]}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={s.tierBadge}>
              <Text style={s.tierBadgeText}>✓ Training level maintained — keep it up!</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.primaryBtn, finishing && s.btnDisabled]}
            onPress={handleFinish}
            disabled={finishing}
            activeOpacity={0.85}
          >
            {finishing
              ? <ActivityIndicator color={WHITE} size="small" />
              : <Text style={s.primaryBtnText}>Finish</Text>}
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    );
  }

  return null;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  page: { paddingHorizontal: 28, paddingTop: 28, width: '100%' },

  eyebrow: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11 * SC,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 10,
  },
  heroTitle: {
    color: WHITE,
    fontSize: 33 * SC,
    fontWeight: '800',
    lineHeight: 39 * SC,
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
    fontSize: 16 * SC,
    padding: 16,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  charCount: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: 12,
    textAlign: 'right',
    marginBottom: 24,
  },

  // Button
  primaryBtn: {
    backgroundColor: ORANGE,
    borderRadius: 16,
    paddingVertical: 20,    // fixed: ensures button ≥ 56px tall
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: WHITE, fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
  btnDisabled: { opacity: 0.38 },

  // Sentence card
  sentenceCard: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    padding: 20,
    marginBottom: 36,
  },
  sentenceText: {
    color: WHITE,
    fontSize: 18 * SC,
    fontWeight: '500',
    lineHeight: 26 * SC,
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
  timerText: { color: 'rgba(255,255,255,0.45)', fontSize: 14, letterSpacing: 0.5 },

  centeredStatus: { alignItems: 'center', gap: 16, marginTop: 32 },

  // Mini session progress bar
  skipZone: { position: 'absolute', bottom: 0, right: 0, width: 100, height: 100, opacity: 0 },
  progressTrack: { height: PROGRESS_BAR_H, backgroundColor: 'rgba(0,0,0,0.08)', width: '100%' },
  progressFill:  { height: '100%', backgroundColor: ORANGE, borderRadius: PROGRESS_BAR_H / 2 },

  // Comparison
  arcSection: { flexDirection: 'row', marginBottom: 32, alignItems: 'flex-start' },
  arcCol:     { flex: 1, alignItems: 'center', gap: 12 },
  arcColLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11 * SC,
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
  delta: { fontSize: 12, fontWeight: '700', marginTop: 2 },
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
    fontSize: 13,
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
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12 * SC,
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
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
