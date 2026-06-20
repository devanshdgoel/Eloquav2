/**
 * AssessmentScreen — three-task voice assessment.
 *
 * route.params.type = 'baseline' | 'checkin'
 *
 * sustained_a  — bar graph, auto-stops when silence detected after phonation
 * reading      — no bars, Done button enabled after minS
 * free_speech  — no bars, Done button enabled after minS
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { auth } from '../config/firebase';
import { API_BASE_URL } from '../config/env';
import { setTiersFromAssessment } from '../services/difficultyService';
import { getAuthHeaders } from '../utils/authHeaders';
import { onSessionComplete } from '../services/notificationService';
import { logFunnelEvent } from '../utils/analytics';
import { getVoiceStatus } from '../services/voiceService';

const { width: W } = Dimensions.get('window');
const SC = W / 402;

const ORANGE = '#FFA940';
const MINT   = '#C3DECE';
const WHITE  = '#FFFFFF';

// Bar graph constants (used for sustained_a only)
const BARS_COUNT      = 26;
const BAR_INTERVAL_MS = 80;
const BAR_W           = Math.max(3, Math.floor((W - 48) / BARS_COUNT) - 2);
const GREEN_BAR       = 'rgba(72,210,140,0.90)';
const DIM_BAR         = 'rgba(255,255,255,0.14)';

// Silence detection for sustained_a
const SPEAK_THRESHOLD   = 0.25;  // above = speaking
const SILENCE_THRESHOLD = 0.18;  // below = silence
const MIN_SPEAK_FRAMES  = 3;     // must have spoken this many frames before silence detection
const SILENCE_FRAMES    = Math.round(1800 / BAR_INTERVAL_MS); // ~22 frames = 1.8s silence → stop

// 3 rounds of sustained_a give a best-of-3 reading for voice_power — more robust than a
// single attempt (first attempt has anxiety/warm-up variability). Reading and free_speech
// each appear once and drive expression + fluency scores.
const TASKS = [
  {
    id: 'sustained_a', round: 1, totalRounds: 3,
    title: 'Sustained Sound',
    instruction: 'Take a deep breath.\nThen say "Aaah" for as long as you can.',
    hint: 'Recording stops automatically when you finish',
    minS: 4, maxS: 12, color: ORANGE, autostop: true,
  },
  {
    id: 'sustained_a', round: 2, totalRounds: 3,
    title: 'Sustained Sound',
    instruction: 'Once more — deep breath first.\nSay "Aaah" for as long as you can.',
    hint: 'Try to hold it a little longer this time',
    minS: 4, maxS: 12, color: ORANGE, autostop: true,
  },
  {
    id: 'sustained_a', round: 3, totalRounds: 3,
    title: 'Sustained Sound',
    instruction: 'One last time — big breath.\nGive your best "Aaah".',
    hint: 'Last round — give it your all',
    minS: 4, maxS: 12, color: ORANGE, autostop: true,
  },
  {
    id: 'reading', groupLabel: 'Task 2 of 3',
    title: 'Reading Aloud',
    instruction: 'Read this sentence aloud\nat your natural pace.',
    passage: '"When the sunlight strikes raindrops in the air, they act as a prism and form a rainbow."',
    hint: 'Read clearly and at a comfortable pace',
    minS: 5, maxS: 35, color: MINT, autostop: false,
  },
  {
    id: 'free_speech', groupLabel: 'Task 3 of 3',
    title: 'Free Speech',
    instruction: 'Tell us about your favourite\nplace in the world.',
    hint: 'Speak for at least 20 seconds',
    minS: 10, maxS: 60, color: WHITE, autostop: false,
  },
];

// Three grouped items shown in the intro task list.
const INTRO_ITEMS = [
  { color: ORANGE, badge: '×3', title: 'Sustained Sound',  hint: '3 rounds — recording auto-stops each time' },
  { color: MINT,   badge: '2',  title: 'Reading Aloud',    hint: 'Read clearly at a comfortable pace' },
  { color: WHITE,  badge: '3',  title: 'Free Speech',      hint: 'Speak for at least 20 seconds' },
];

// ── Score arc ─────────────────────────────────────────────────────────────────
function ScoreArc({ score, color, label }) {
  const SIZE = 106 * SC;
  const SW   = 9;
  const r    = (SIZE - SW) / 2;
  const circ = 2 * Math.PI * r;
  const pct  = score != null ? Math.max(0, Math.min(100, score)) / 100 : 0;

  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
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
        <View style={arc.center}>
          <Text style={[arc.num, { color: score != null ? color : 'rgba(255,255,255,0.25)' }]}>
            {score != null ? score : '–'}
          </Text>
        </View>
      </View>
      <Text style={arc.label}>{label}</Text>
    </View>
  );
}
const arc = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  num:    { fontSize: 24 * SC, fontWeight: '800', lineHeight: 26 * SC },
  label:  { color: 'rgba(255,255,255,0.60)', fontSize: 16, fontWeight: '600', letterSpacing: 0.5, textAlign: 'center' },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function AssessmentScreen({ navigation, route }) {
  const { type = 'baseline' } = route.params || {};
  const { top, bottom } = useSafeAreaInsets();
  const isBaseline = type === 'baseline';

  // phase: 'intro' | 'active' | 'processing' | 'results' | 'saving'
  const [phase,     setPhase]     = useState('intro');
  const [taskIndex, setTaskIndex] = useState(0);
  const [elapsedS,  setElapsedS]  = useState(0);
  const [canStop,   setCanStop]   = useState(false);
  const [composite, setComposite] = useState({ voice_power: null, expression: null, fluency: null });
  const [focus,     setFocus]     = useState(null);
  const [bars,      setBars]      = useState(Array(BARS_COUNT).fill(0.015));

  const taskIndexRef    = useRef(0);
  const taskResultsRef  = useRef([]);
  const recordingRef    = useRef(null);
  const timerRef        = useRef(null);
  const barTimerRef     = useRef(null);
  const startMsRef      = useRef(0);
  const volumeRef       = useRef(0);
  // Silence detection refs (sustained_a only)
  const hasSpokenRef    = useRef(false);
  const speakFramesRef  = useRef(0);
  const silenceCountRef = useRef(0);
  // Prevent double-firing stopRecording from both timer and silence detector
  const stoppingRef     = useRef(false);
  // URIs of reading + free_speech recordings, used for voice cloning after baseline
  const cloningUrisRef  = useRef([]);

  const task = TASKS[Math.min(taskIndex, TASKS.length - 1)];

  useEffect(() => () => {
    clearInterval(timerRef.current);
    clearInterval(barTimerRef.current);
    recordingRef.current?.stopAndUnloadAsync().catch(() => {});
  }, []);

  // Auto-start recording when phase becomes 'active'
  useEffect(() => {
    if (phase === 'active') {
      startRecording();
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Recording ──────────────────────────────────────────────────────────────

  async function startRecording() {
    try {
      setBars(Array(BARS_COUNT).fill(0.015));
      volumeRef.current      = 0;
      hasSpokenRef.current   = false;
      speakFramesRef.current = 0;
      silenceCountRef.current = 0;
      stoppingRef.current    = false;
      setElapsedS(0);
      setCanStop(false);

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

        // Silence detection — only for sustained_a
        if (TASKS[taskIndexRef.current].autostop && !stoppingRef.current) {
          if (!hasSpokenRef.current) {
            if (vol > SPEAK_THRESHOLD) {
              speakFramesRef.current += 1;
              if (speakFramesRef.current >= MIN_SPEAK_FRAMES) hasSpokenRef.current = true;
            } else {
              speakFramesRef.current = 0;
            }
          } else {
            if (vol < SILENCE_THRESHOLD) {
              silenceCountRef.current += 1;
              if (silenceCountRef.current >= SILENCE_FRAMES) {
                stoppingRef.current = true;
                stopRecording();
              }
            } else {
              silenceCountRef.current = 0;
            }
          }
        }
      }, BAR_INTERVAL_MS);

      timerRef.current = setInterval(() => {
        setElapsedS(s => {
          const next = s + 1;
          const cur  = TASKS[taskIndexRef.current];
          if (!cur.autostop && next >= cur.minS) setCanStop(true);
          if (next >= cur.maxS && !stoppingRef.current) {
            stoppingRef.current = true;
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (e) {
      console.error('[Assessment] startRecording:', e?.message);
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
    setPhase('processing');

    let scores   = { voice_power: null, expression: null, fluency: null };
    let features = {};

    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

      if (uri) {
        const currentTaskId = TASKS[taskIndexRef.current].id;
        if (isBaseline && (currentTaskId === 'reading' || currentTaskId === 'free_speech')) {
          cloningUrisRef.current.push(uri);
        }

        const form = new FormData();
        form.append('file', { uri, type: 'audio/m4a', name: `${currentTaskId}.m4a` });
        form.append('task_type', currentTaskId);
        form.append('audio_duration_s', String(durationS));

        const authHeaders = await getAuthHeaders();
        const controller  = new AbortController();
        const timeoutId   = setTimeout(() => controller.abort(), 30000); // 30s hard timeout
        try {
          const res = await fetch(`${API_BASE_URL}/api/analyze-voice`, {
            method: 'POST',
            headers: authHeaders,
            body: form,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (res.ok) {
            const d = await res.json();
            scores   = d.data?.scores   ?? scores;
            features = d.data?.features ?? {};
          }
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          // Timeout or network error — continue with null scores (non-fatal)
          console.warn('[Assessment] analyze-voice failed/timed out:', fetchErr?.message);
        }
      }
    } catch (e) {
      console.error('[Assessment] stopRecording error:', e?.message);
    }

    taskResultsRef.current = [
      ...taskResultsRef.current,
      { task_id: TASKS[taskIndexRef.current].id, scores, features, durationS },
    ];

    const nextIdx = taskIndexRef.current + 1;
    if (nextIdx < TASKS.length) {
      taskIndexRef.current = nextIdx;
      setTaskIndex(nextIdx);
      setPhase('active');
    } else {
      const comp = computeComposite(taskResultsRef.current);
      setComposite(comp);
      setFocus(pickFocus(comp));
      if (isBaseline && cloningUrisRef.current.length > 0) {
        setPhase('cloning');
        cloneVoiceFromAssessment(cloningUrisRef.current).finally(() => setPhase('results'));
      } else {
        setPhase('results');
      }
    }
  }

  // ── Voice cloning ──────────────────────────────────────────────────────────

  async function cloneVoiceFromAssessment(uris) {
    try {
      const status = await getVoiceStatus();
      if (status.has_cloned_voice) return;

      const form = new FormData();
      uris.forEach((uri, i) => {
        form.append('files', { uri, type: 'audio/m4a', name: `voice_sample_${i}.m4a` });
      });
      form.append('user_name', auth.currentUser?.displayName || 'User');
      const authHeaders = await getAuthHeaders();
      await fetch(`${API_BASE_URL}/api/voice/clone`, {
        method: 'POST',
        headers: authHeaders,
        body: form,
      });
    } catch (e) {
      console.warn('[Assessment] voice cloning failed (non-fatal):', e?.message);
    }
  }

  // ── Score helpers ──────────────────────────────────────────────────────────

  function computeComposite(results) {
    // voice_power: best of the 3 sustained_a runs (best-of-3 reflects true capability)
    const phonationVP = results
      .filter(r => r.task_id === 'sustained_a')
      .map(r => r.scores?.voice_power)
      .filter(v => v != null && Number.isFinite(v));
    const out = { voice_power: phonationVP.length ? Math.max(...phonationVP) : null };

    // expression + fluency: average across all tasks (reading + free_speech drive these)
    for (const k of ['expression', 'fluency']) {
      const vals = results.map(r => r.scores?.[k]).filter(v => v != null && Number.isFinite(v));
      out[k] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    }
    return out;
  }

  function pickFocus(comp) {
    const opts = [
      { key: 'voice_power', label: 'Voice Power',    tip: 'Your sessions will focus on speaking louder. Think: big, bold voice!' },
      { key: 'expression',  label: 'Expression',      tip: 'Your sessions will focus on pitch variety — let your voice rise and fall naturally.' },
      { key: 'fluency',     label: 'Fluency',         tip: 'Your sessions will focus on speech rhythm — a comfortable pace with fewer pauses.' },
    ].filter(o => comp[o.key] != null)
     .sort((a, b) => comp[a.key] - comp[b.key]);

    return opts[0] ?? { label: 'Your Voice', tip: 'Your personalised plan is ready.' };
  }

  // ── Save + finish — uses backend endpoint (Admin SDK bypasses Firestore rules)
  async function finishAssessment() {
    setPhase('saving');
    try {
      if (auth.currentUser) {
        if (isBaseline && (composite.voice_power != null || composite.expression != null || composite.fluency != null)) {
          const FOCUS_DIM_TO_EXERCISE = {
            voice_power: 'phonation',
            expression:  'pitchGlides',
            fluency:     'speech',
          };
          const exerciseFocusKey = FOCUS_DIM_TO_EXERCISE[focus?.key] ?? null;
          setTiersFromAssessment(composite, exerciseFocusKey).catch(() => {});
        }

        const authHeaders = await getAuthHeaders();
        const taskObj = {};
        taskResultsRef.current.forEach((r, i) => {
          const key = r.task_id === 'sustained_a' ? `sustained_a_${i + 1}` : r.task_id;
          taskObj[key] = { scores: r.scores };
        });

        const assessForm = new FormData();
        assessForm.append('assessment_type', type);
        if (composite.voice_power != null) assessForm.append('voice_power', String(composite.voice_power));
        if (composite.expression  != null) assessForm.append('expression',  String(composite.expression));
        if (composite.fluency     != null) assessForm.append('fluency',     String(composite.fluency));
        assessForm.append('task_results_json', JSON.stringify(taskObj));

        const saveRes = await fetch(`${API_BASE_URL}/api/save-assessment`, {
          method: 'POST',
          headers: authHeaders,
          body: assessForm,
        });
        if (!saveRes.ok) throw new Error(`save-assessment: ${saveRes.status}`);

        const sessionForm = new FormData();
        sessionForm.append('assessment_type', type);
        const sessionRes = await fetch(`${API_BASE_URL}/api/complete-session`, {
          method: 'POST',
          headers: authHeaders,
          body: sessionForm,
        });
        if (!sessionRes.ok) throw new Error(`complete-session: ${sessionRes.status}`);
        onSessionComplete().catch(() => {}); // reset re-engagement clock (non-fatal)
      }
      if (isBaseline) logFunnelEvent('assessment_baseline_completed');
      navigation.replace('Home');
    } catch (e) {
      console.error('[Assessment] finish:', e?.message);
      setPhase('results');
      Alert.alert(
        'Could not save results',
        'Check your connection and try again. Your scores are still shown above.',
        [
          { text: 'Try again', onPress: finishAssessment },
          { text: 'Continue anyway', style: 'destructive', onPress: () => navigation.replace('Home') },
        ]
      );
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <LinearGradient colors={['#243E44', '#0D1E21']} style={[s.root, { paddingTop: top }]}>
      <StatusBar barStyle="light-content" />

      {/* ── INTRO ───────────────────────────────────────────────────────── */}
      {phase === 'intro' && (
        <ScrollView contentContainerStyle={[s.page, { paddingBottom: bottom + 40 }]}>
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={s.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={s.eyebrow}>{isBaseline ? 'VOICE ASSESSMENT' : 'PROGRESS CHECK-IN'}</Text>
          <Text style={s.heroTitle}>{isBaseline ? "Let's hear\nyour voice" : "How's your\nvoice today?"}</Text>
          <Text style={s.bodyText}>
            {isBaseline
              ? 'Three tasks — about 3 minutes. We use these to personalise your training plan.'
              : "Same three tasks as before. Let's see how far you've come."}
          </Text>

          <View style={s.taskList}>
            {INTRO_ITEMS.map((item, i) => (
              <View key={i} style={s.taskRow}>
                <View style={[s.taskBadge, { borderColor: item.color + '66', backgroundColor: item.color + '18' }]}>
                  <Text style={[s.taskBadgeNum, { color: item.color }]}>{item.badge}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.taskRowTitle}>{item.title}</Text>
                  <Text style={s.taskRowHint}>{item.hint}</Text>
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity style={s.primaryBtn} onPress={() => { if (isBaseline) logFunnelEvent('assessment_baseline_started'); setPhase('active'); }} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>Begin</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── ACTIVE / PROCESSING ─────────────────────────────────────────── */}
      {(phase === 'active' || phase === 'processing') && (
        <View style={[s.page, { flex: 1, paddingBottom: bottom + 32 }]}>

          {/* Exit — shown during active only (not while analysing) */}
          {phase === 'active' && (
            <TouchableOpacity
              style={s.backBtn}
              onPress={() => {
                Alert.alert(
                  'Leave assessment?',
                  'Your recordings so far will be lost.',
                  [
                    { text: 'Stay', style: 'cancel' },
                    { text: 'Leave', style: 'destructive', onPress: () => navigation.goBack() },
                  ]
                );
              }}
              accessibilityRole="button"
              accessibilityLabel="Exit assessment"
            >
              <Text style={s.backBtnText}>✕</Text>
            </TouchableOpacity>
          )}

          {/* Step dots */}
          <View style={s.dotRow}>
            {TASKS.map((_, i) => (
              <View
                key={i}
                style={[s.dot, i === taskIndex && s.dotActive, i < taskIndex && s.dotDone]}
              />
            ))}
          </View>

          <Text style={s.stepLabel}>
            {task.round
              ? `Round ${task.round} of ${task.totalRounds}`
              : (task.groupLabel ?? `Step ${taskIndex + 1} of ${TASKS.length}`)}
          </Text>
          <Text style={[s.taskTitle, { color: task.color }]}>{task.title}</Text>

          {task.passage ? (
            <>
              <Text style={s.bodyText}>{task.instruction}</Text>
              <View style={[s.passageCard, { borderColor: task.color + '44' }]}>
                <Text style={[s.passageText, { color: task.color }]}>{task.passage}</Text>
              </View>
            </>
          ) : (
            <Text style={s.instructionText}>{task.instruction}</Text>
          )}

          <Text style={s.hintText}>{task.hint}</Text>

          {/* Volume bars — sustained_a only */}
          {phase === 'active' && task.autostop && (
            <View style={s.barGraph}>
              {bars.map((v, i) => (
                <View
                  key={i}
                  style={[s.bar, {
                    height: Math.max(4, v * 80),
                    backgroundColor: v > 0.5 ? GREEN_BAR : v > 0.15 ? WHITE : DIM_BAR,
                  }]}
                />
              ))}
            </View>
          )}

          {/* Recording indicator — reading and free_speech */}
          {phase === 'active' && !task.autostop && (
            <View style={s.recBadge}>
              <View style={s.recDot} />
              <Text style={s.recText}>Listening…</Text>
            </View>
          )}

          {/* Processing spinner */}
          {phase === 'processing' && (
            <View style={s.spinnerWrap}>
              <ActivityIndicator size="large" color={ORANGE} />
              <Text style={s.processingText}>Analysing…</Text>
            </View>
          )}

          {/* Done button — reading and free_speech only */}
          {phase === 'active' && !task.autostop && (
            <TouchableOpacity
              style={[s.primaryBtn, !canStop && s.primaryBtnDisabled]}
              onPress={stopRecording}
              disabled={!canStop}
              activeOpacity={0.85}
            >
              <Text style={[s.primaryBtnText, !canStop && s.primaryBtnTextDim]}>
                {canStop
                  ? 'Done  ✓'
                  : `Keep going — ${Math.max(0, task.minS - elapsedS)}s more`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── CLONING ─────────────────────────────────────────────────────── */}
      {phase === 'cloning' && (
        <View style={s.center}>
          <ActivityIndicator size="large" color={ORANGE} />
          <Text style={s.processingText}>Setting up your voice…</Text>
        </View>
      )}

      {/* ── RESULTS ─────────────────────────────────────────────────────── */}
      {phase === 'results' && (
        <ScrollView contentContainerStyle={[s.page, { paddingBottom: bottom + 40 }]}>
          <Text style={s.eyebrow}>{isBaseline ? 'YOUR BASELINE' : 'YOUR CHECK-IN'}</Text>
          <Text style={s.heroTitle}>
            {isBaseline ? "Here's where\nyou're starting" : "Here's where\nyou're at"}
          </Text>

          <View style={s.scoresRow}>
            <ScoreArc score={composite.voice_power} color={ORANGE} label={'Voice\nPower'} />
            <ScoreArc score={composite.expression}  color={MINT}   label={'Pitch\nVariety'} />
            <ScoreArc score={composite.fluency}     color={WHITE}  label={'Speech\nRhythm'} />
          </View>

          {focus && (
            <View style={s.focusCard}>
              <Text style={s.focusEyebrow}>YOUR FOCUS</Text>
              <Text style={s.focusTitle}>{focus.label}</Text>
              <Text style={s.focusTip}>{focus.tip}</Text>
            </View>
          )}

          {isBaseline && (
            <Text style={s.baselineNote}>
              That's your starting point. From here, every session moves it.
            </Text>
          )}

          <TouchableOpacity style={s.primaryBtn} onPress={finishAssessment} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>
              {isBaseline ? 'Start My Journey  →' : 'See My Progress  →'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── SAVING ──────────────────────────────────────────────────────── */}
      {phase === 'saving' && (
        <View style={s.center}>
          <ActivityIndicator size="large" color={ORANGE} />
          <Text style={s.processingText}>Saving your plan…</Text>
        </View>
      )}
    </LinearGradient>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },

  page: {
    alignItems: 'center',
    paddingHorizontal: 28 * SC,
    paddingTop: 16 * SC,
    gap: 22 * SC,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },

  backBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.20)',
    borderRadius: 28,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    color: WHITE,
    fontSize: 20,
    fontWeight: '500',
  },

  eyebrow: {
    color: ORANGE,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
  },

  heroTitle: {
    color: WHITE,
    fontSize: 38 * SC,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 46 * SC,
    letterSpacing: 0.3,
  },

  bodyText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 27,
  },

  taskList: { width: '100%', gap: 14 * SC },
  taskRow:  { flexDirection: 'row', alignItems: 'center', gap: 16 * SC },
  taskBadge: {
    width: 38 * SC, height: 38 * SC, borderRadius: 19 * SC,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  taskBadgeNum: { fontSize: 17 * SC, fontWeight: '800' },
  taskRowTitle: { color: WHITE, fontSize: 16 * SC, fontWeight: '700' },
  taskRowHint:  { color: 'rgba(255,255,255,0.38)', fontSize: 16, marginTop: 1 },

  primaryBtn: {
    backgroundColor: ORANGE,
    paddingHorizontal: 44 * SC,
    paddingVertical: 20,    // fixed: ensures button ≥ 56px tall for motor precision
    borderRadius: 30,
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 14,
    elevation: 8,
    marginTop: 4,
  },
  primaryBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryBtnText: {
    color: '#1A1A1A',
    fontSize: 18 * SC,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  primaryBtnTextDim: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 16,
  },

  dotRow:    { flexDirection: 'row', gap: 8, marginTop: 4 },
  dot:       { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.18)' },
  dotActive: { backgroundColor: ORANGE, width: 28, borderRadius: 5 },
  dotDone:   { backgroundColor: MINT },

  stepLabel: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  taskTitle: {
    fontSize: 30 * SC,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3,
  },

  instructionText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 18 * SC,
    textAlign: 'center',
    lineHeight: 28 * SC,
  },

  passageCard: {
    backgroundColor: 'rgba(195,222,206,0.08)',
    borderRadius: 18,
    padding: 20 * SC,
    borderWidth: 1.5,
    width: '100%',
  },
  passageText: {
    fontSize: 17 * SC,
    lineHeight: 27 * SC,
    textAlign: 'center',
    fontStyle: 'italic',
    fontWeight: '500',
  },

  hintText: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Volume bar graph (sustained_a)
  barGraph: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 90,
    width: W - 48,
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  bar: {
    width: BAR_W,
    borderRadius: 3,
    minHeight: 4,
  },

  // Recording indicator (reading, free_speech)
  recBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(217,55,55,0.15)',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(217,55,55,0.35)',
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D94F3D',
  },
  recText: {
    color: 'rgba(255,255,255,0.80)',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  spinnerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 130 * SC,
    gap: 14,
  },
  processingText: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 16 * SC,
    fontWeight: '600',
  },

  scoresRow: {
    flexDirection: 'row',
    gap: 18 * SC,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  focusCard: {
    backgroundColor: `${ORANGE}18`,
    borderRadius: 20,
    padding: 20 * SC,
    borderWidth: 1.5,
    borderColor: `${ORANGE}40`,
    width: '100%',
    gap: 6 * SC,
  },
  focusEyebrow: {
    color: ORANGE,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
  },
  focusTitle: {
    color: WHITE,
    fontSize: 20 * SC,
    fontWeight: '800',
  },
  focusTip: {
    color: 'rgba(255,255,255,0.80)',
    fontSize: 16,
    lineHeight: 24,
  },
  baselineNote: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 8,
  },
});
