import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Dimensions,
  Animated,
  Alert,
  Linking,
  Modal,
  FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { usePrefsRefresh } from '../context/PrefsContext';
import { getUserProfile } from '../utils/storage';
import { getVoiceStatus, deleteClonedVoice } from '../services/voiceService';
import { fetchWithAuth } from '../utils/authHeaders';
import { API_BASE_URL } from '../config/env';
import {
  requestPermission,
  hasPermission,
  formatTime,
  applyNotificationPrefs,
} from '../services/notificationService';
import { logScreenView } from '../utils/analytics';
import TabBar from '../components/TabBar';
import ScreenHeader from '../components/ScreenHeader';

const { width: W } = Dimensions.get('window');
const SC = W / 402;

// ── Palette ──────────────────────────────────────────────────────────────────
const BG_TOP    = '#37767A';
const BG_MID    = '#1C4047';
const BG_BOT    = '#0A1618';
const CARD      = 'rgba(45,105,116,0.45)';
const CARD_BORD = 'rgba(195,222,206,0.15)';
const TEAL      = '#2D6974';
const ORANGE    = '#FFA940';
const MINT      = '#C3DECE';
const WHITE     = '#FFFFFF';
const DIM       = 'rgba(255,255,255,0.60)';
const DIVIDER   = 'rgba(195,222,206,0.10)';
const RED       = '#E05252';

const PREFS_KEY = 'eloqua_preferences';

const DEFAULT_PREFS = {
  enhancedVoice: true,
  hapticFeedback: true,
  largeText: false,
  audioCues: true,
  transcriptionModel: 'whisper',  // 'whisper' | 'soniva'
  // notifications
  dailyReminder: false,
  reminderHour: 10,
  reminderMinute: 0,
  reengagementEnabled: true,
  weeklySummaryEnabled: false,
};

// ── Preferences helpers ───────────────────────────────────────────────────────
async function loadPrefs() {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

async function savePrefs(prefs) {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

// ── Custom toggle ─────────────────────────────────────────────────────────────
function Toggle({ value, onValueChange, disabled = false, accessibilityLabel }) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: value ? 1 : 0,
      useNativeDriver: false,
      tension: 60,
      friction: 8,
    }).start();
  }, [value]);

  const trackBg   = anim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,255,255,0.12)', ORANGE] });
  const thumbX    = anim.interpolate({ inputRange: [0, 1], outputRange: [3, 23] });
  const thumbOpacity = disabled ? 0.4 : 1;

  return (
    <TouchableOpacity
      onPress={() => !disabled && onValueChange(!value)}
      activeOpacity={0.85}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[tog.track, { backgroundColor: trackBg, opacity: thumbOpacity }]}>
        <Animated.View style={[tog.thumb, { transform: [{ translateX: thumbX }] }]} />
      </Animated.View>
    </TouchableOpacity>
  );
}

const tog = StyleSheet.create({
  track: {
    width: 50 * SC,
    height: 28 * SC,
    borderRadius: 14 * SC,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  thumb: {
    width: 22 * SC,
    height: 22 * SC,
    borderRadius: 11 * SC,
    backgroundColor: WHITE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
});

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ label, children }) {
  return (
    <View style={sec.wrap}>
      <Text style={sec.label}>{label}</Text>
      <View style={sec.card}>{children}</View>
    </View>
  );
}

const sec = StyleSheet.create({
  wrap:  { gap: 8 * SC },
  label: {
    color: MINT,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    paddingHorizontal: 4 * SC,
    opacity: 0.8,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORD,
    overflow: 'hidden',
  },
});

// ── Row types ─────────────────────────────────────────────────────────────────
function Row({ label, sublabel, right, onPress, isLast = false, tintLabel }) {
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap
      onPress={onPress}
      activeOpacity={0.7}
      style={[row.wrap, !isLast && row.divider]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? label : undefined}
    >
      <View style={row.left}>
        <Text style={[row.label, tintLabel && { color: tintLabel }]}>{label}</Text>
        {sublabel ? <Text style={row.sublabel}>{sublabel}</Text> : null}
      </View>
      {right}
    </Wrap>
  );
}

function ChevronRight() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M9 6l6 6-6 6" stroke={DIM} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const row = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20 * SC,
    paddingVertical: 16 * SC,
    minHeight: 60 * SC,
    gap: 12 * SC,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
  },
  left:  { flex: 1, gap: 2 },
  label: { color: WHITE, fontSize: 16, fontWeight: '500', letterSpacing: 0.1 },
  sublabel: { color: DIM, fontSize: 16, letterSpacing: 0.1 },
});

// ── Value badge ───────────────────────────────────────────────────────────────
function ValueTag({ label, color = MINT }) {
  return (
    <View style={[vt.wrap, { borderColor: color + '44' }]}>
      <Text style={[vt.text, { color }]}>{label}</Text>
    </View>
  );
}

const vt = StyleSheet.create({
  wrap: {
    paddingHorizontal: 10 * SC,
    paddingVertical: 4 * SC,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  text: { fontSize: 16, fontWeight: '700', letterSpacing: 0.4 },
});

// ── Time picker modal ─────────────────────────────────────────────────────────
// Generates times every 30 min from 6:00 AM to 10:00 PM.
const TIME_OPTIONS = (() => {
  const opts = [];
  for (let h = 6; h <= 22; h++) {
    for (const m of [0, 30]) {
      if (h === 22 && m === 30) break;
      opts.push({ hour: h, minute: m, label: formatTime(h, m) });
    }
  }
  return opts;
})();

function TimePickerModal({ visible, currentHour, currentMinute, onSelect, onClose }) {
  const selected = TIME_OPTIONS.findIndex(t => t.hour === currentHour && t.minute === currentMinute);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={tp.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={tp.sheet}>
        <View style={tp.handle} />
        <Text style={tp.heading}>Reminder time</Text>
        <FlatList
          data={TIME_OPTIONS}
          keyExtractor={item => `${item.hour}:${item.minute}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 8 }}
          initialScrollIndex={Math.max(0, selected)}
          getItemLayout={(_, i) => ({ length: 52, offset: 52 * i, index: i })}
          renderItem={({ item }) => {
            const active = item.hour === currentHour && item.minute === currentMinute;
            return (
              <TouchableOpacity
                style={[tp.timeRow, active && tp.timeRowActive]}
                onPress={() => onSelect(item.hour, item.minute)}
                activeOpacity={0.75}
              >
                <Text style={[tp.timeText, active && tp.timeTextActive]}>
                  {item.label}
                </Text>
                {active && <Text style={tp.checkmark}>✓</Text>}
              </TouchableOpacity>
            );
          }}
        />
        <TouchableOpacity style={tp.closeBtn} onPress={onClose} activeOpacity={0.85}>
          <Text style={tp.closeBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const tp = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: '#1A3C43',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 36,
    maxHeight: '65%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  heading: {
    color: WHITE,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(195,222,206,0.10)',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28 * SC,
    height: 52,
  },
  timeRowActive: {
    backgroundColor: 'rgba(254,156,45,0.12)',
  },
  timeText: {
    color: 'rgba(255,255,255,0.70)',
    fontSize: 16,
    fontWeight: '500',
  },
  timeTextActive: {
    color: ORANGE,
    fontWeight: '700',
  },
  checkmark: {
    color: ORANGE,
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    marginHorizontal: 20 * SC,
    marginTop: 8,
    backgroundColor: ORANGE,
    borderRadius: 28,
    paddingVertical: 20,
    alignItems: 'center',
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  closeBtnText: {
    color: '#1A1A1A',
    fontSize: 17,
    fontWeight: '700',
  },
});

// ── Model picker ─────────────────────────────────────────────────────────────
const MODEL_OPTIONS = [
  { value: 'whisper', label: 'Whisper', sublabel: 'OpenAI general' },
  { value: 'soniva',  label: 'SONIVA',  sublabel: 'Stroke-tuned' },
];

function ModelPicker({ value, onValueChange }) {
  return (
    <View style={mp.wrap}>
      {MODEL_OPTIONS.map((opt, i) => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onValueChange(opt.value)}
            activeOpacity={0.75}
            style={[
              mp.option,
              active && mp.optionActive,
              i === 0 && mp.optionLeft,
              i === MODEL_OPTIONS.length - 1 && mp.optionRight,
            ]}
          >
            <Text style={[mp.label, active && mp.labelActive]}>{opt.label}</Text>
            <Text style={[mp.sub, active && mp.subActive]}>{opt.sublabel}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const mp = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderRadius: 12 * SC,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(195,222,206,0.18)',
  },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10 * SC,
    paddingHorizontal: 6 * SC,
    backgroundColor: 'rgba(0,0,0,0.18)',
    gap: 2,
  },
  optionActive: {
    backgroundColor: 'rgba(254,156,45,0.18)',
    borderColor: ORANGE,
  },
  optionLeft: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(195,222,206,0.12)',
  },
  optionRight: {},
  label: {
    color: DIM,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
    includeFontPadding: false,
  },
  labelActive: { color: ORANGE },
  sub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  subActive: { color: 'rgba(254,156,45,0.70)' },
});

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 64 }) {
  const initials = (name || 'U')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={[av.circle, { width: size * SC, height: size * SC, borderRadius: size * SC / 2 }]}>
      <Text style={[av.text, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

const av = StyleSheet.create({
  circle: {
    backgroundColor: TEAL,
    borderWidth: 2.5,
    borderColor: MINT + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: WHITE, fontWeight: '800', letterSpacing: 1, includeFontPadding: false },
});

// ── Icons ─────────────────────────────────────────────────────────────────────
function VoiceIcon({ size = 18 }) {
  const s = size * SC;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Rect x="9" y="2" width="6" height="13" rx="3" stroke={MINT} strokeWidth={1.8} />
      <Path d="M5 10c0 3.866 3.134 7 7 7s7-3.134 7-7" stroke={MINT} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M12 19v3M9 22h6" stroke={MINT} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function BellIcon({ size = 18 }) {
  const s = size * SC;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke={MINT} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" stroke={MINT} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function AccessibilityIcon({ size = 18 }) {
  const s = size * SC;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="4" r="2" stroke={MINT} strokeWidth={1.8} />
      <Path d="M5 9l7-1 7 1M12 8v6M9 14l-2 6M15 14l2 6" stroke={MINT} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ShieldIcon({ size = 18 }) {
  const s = size * SC;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2L4 6v6c0 5.5 3.5 10.7 8 12 4.5-1.3 8-6.5 8-12V6l-8-4z" stroke={MINT} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SettingsScreen({ navigation }) {
  const { top: safeTop, bottom: safeBottom } = useSafeAreaInsets();
  const { signOut, isGuest, user } = useAuth();
  const refreshPrefs = usePrefsRefresh();

  const [profile,         setProfile]         = useState(null);
  const [voiceStatus,     setVoiceStatus]     = useState(null);
  const [voiceLoading,    setVoiceLoading]    = useState(true);
  const [deletingVoice,   setDeletingVoice]   = useState(false);
  const [prefs,           setPrefs]           = useState(DEFAULT_PREFS);
  const [notifPermission, setNotifPermission] = useState(false);
  const [timePickerOpen,  setTimePickerOpen]  = useState(false);

  useEffect(() => {
    const logExit = logScreenView('Settings');
    return logExit;
  }, []);

  useEffect(() => {
    getUserProfile().then(p => setProfile(p));
    loadPrefs().then(p => setPrefs(p));
    hasPermission().then(setNotifPermission);

    if (!isGuest && user?.uid) {
      getVoiceStatus()
        .then(s => setVoiceStatus(s))
        .catch(() => setVoiceStatus(null))
        .finally(() => setVoiceLoading(false));
    } else {
      setVoiceLoading(false);
    }
  }, []);

  const updatePref = useCallback(async (key, value) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: value };
      savePrefs(next).then(() => refreshPrefs()).catch(() => {});
      return next;
    });
  }, [refreshPrefs]);

  const updateNotifPref = useCallback(async (key, value) => {
    let granted = notifPermission;
    if (!granted) {
      granted = await requestPermission();
      setNotifPermission(granted);
      if (!granted) {
        Alert.alert(
          'Notifications blocked',
          'Enable notifications for Eloqua in your device settings to use this feature.',
          [{ text: 'OK' }]
        );
        return;
      }
    }
    setPrefs(prev => {
      const next = { ...prev, [key]: value };
      savePrefs(next);
      applyNotificationPrefs(next, profile?.name ?? '').catch(() => {});
      return next;
    });
  }, [notifPermission, profile]);

  const updateReminderTime = useCallback(async (hour, minute) => {
    setTimePickerOpen(false);
    setPrefs(prev => {
      const next = { ...prev, reminderHour: hour, reminderMinute: minute };
      savePrefs(next);
      applyNotificationPrefs(next, profile?.name ?? '').catch(() => {});
      return next;
    });
  }, [profile]);

  function handleSignOut() {
    Alert.alert(
      isGuest ? 'Exit guest session?' : 'Sign out?',
      isGuest
        ? 'Your progress will not be saved.'
        : 'You can sign back in at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isGuest ? 'Exit' : 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
          },
        },
      ]
    );
  }

  function handleDeleteVoice() {
    Alert.alert(
      'Delete voice clone?',
      'Your personalised voice will be removed from ElevenLabs. You can re-record at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingVoice(true);
            try {
              await deleteClonedVoice();
              setVoiceStatus(v => ({ ...v, has_cloned_voice: false, voice_id: null }));
            } catch {
              Alert.alert('Error', 'Could not delete voice clone. Try again later.');
            } finally {
              setDeletingVoice(false);
            }
          },
        },
      ]
    );
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account, all training progress, and your voice clone. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete permanently',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Are you sure?',
              'All your data will be erased and cannot be recovered.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, delete everything',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await fetchWithAuth(`${API_BASE_URL}/api/account`, {
                        method: 'DELETE',
                      });
                    } catch {
                      // Proceed with local sign-out even if backend call fails.
                      // Firebase Auth user may still exist — backend deletion is best-effort.
                    }
                    await signOut();
                    navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
                  },
                },
              ]
            ),
        },
      ]
    );
  }

  const displayName  = profile?.name || user?.name || (isGuest ? 'Guest' : 'User');
  const displayEmail = isGuest ? 'Guest session' : (user?.email || '—');

  const hasClone = voiceStatus?.has_cloned_voice === true;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={[BG_TOP, BG_MID, BG_BOT]}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header — back button on top row, title below */}
      <ScreenHeader navigation={navigation} title="Settings" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, { paddingBottom: 88 + 24 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Profile block ── */}
        <View style={s.profileBlock}>
          <Avatar name={displayName} size={64} />
          <View style={s.profileText}>
            <Text style={s.profileName}>{displayName}</Text>
            <Text style={s.profileEmail}>{displayEmail}</Text>
            {isGuest && (
              <TouchableOpacity
                onPress={() => navigation.navigate('SignUp')}
                style={s.createAccountBtn}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Create account to save progress"
              >
                <Text style={s.createAccountText}>Create account to save progress →</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Voice ── */}
        <Section label="VOICE">
          <Row
            label="Enhanced voice"
            sublabel="Use your personalised ElevenLabs voice for playback"
            right={
              <Toggle
                value={prefs.enhancedVoice}
                onValueChange={v => updatePref('enhancedVoice', v)}
                disabled={isGuest || !hasClone}
                accessibilityLabel="Enhanced voice"
              />
            }
          />
          <View style={[row.wrap, row.divider, { flexDirection: 'column', alignItems: 'flex-start', gap: 10 * SC }]}>
            <View style={{ gap: 2 }}>
              <Text style={row.label}>Transcription model</Text>
              <Text style={row.sublabel}>
                {prefs.transcriptionModel === 'soniva'
                  ? 'SONIVA — fine-tuned on post-stroke speech (Imperial College)'
                  : 'Whisper — OpenAI general-purpose model'}
              </Text>
            </View>
            <ModelPicker
              value={prefs.transcriptionModel}
              onValueChange={v => updatePref('transcriptionModel', v)}
            />
          </View>

          <Row
            label="Voice clone"
            sublabel={
              voiceLoading
                ? 'Checking...'
                : hasClone
                ? 'Active — your voice is personalised'
                : 'Not set up'
            }
            right={
              voiceLoading
                ? null
                : hasClone
                ? <ValueTag label="Active" color={MINT} />
                : <ValueTag label="None" color={DIM} />
            }
          />
          {!isGuest && (
            <Row
              label="Re-record voice"
              sublabel="Update your voice samples"
              onPress={() => navigation.navigate('SetupVoice')}
              right={<ChevronRight />}
            />
          )}
          {!isGuest && hasClone && (
            <Row
              label={deletingVoice ? 'Deleting...' : 'Delete voice clone'}
              onPress={deletingVoice ? null : handleDeleteVoice}
              tintLabel={RED}
              isLast
              right={null}
            />
          )}
          {(!hasClone || isGuest) && (
            <Row
              label="Voice clone not set up"
              sublabel={isGuest ? 'Sign in to set up a personalised voice' : 'Complete voice setup in onboarding'}
              isLast
              right={null}
            />
          )}
        </Section>

        {/* ── Notifications ── */}
        <Section label="NOTIFICATIONS">
          <Row
            label="Daily reminder"
            sublabel="Remind me to practice each day"
            right={
              <Toggle
                value={prefs.dailyReminder}
                onValueChange={v => updateNotifPref('dailyReminder', v)}
                accessibilityLabel="Daily reminder"
              />
            }
          />
          {prefs.dailyReminder && (
            <Row
              label="Reminder time"
              sublabel="Tap to change"
              onPress={() => setTimePickerOpen(true)}
              right={<ValueTag label={formatTime(prefs.reminderHour, prefs.reminderMinute)} color={ORANGE} />}
            />
          )}
          <Row
            label="Re-engagement nudge"
            sublabel="One gentle nudge after 3 missed days"
            right={
              <Toggle
                value={prefs.reengagementEnabled}
                onValueChange={v => updateNotifPref('reengagementEnabled', v)}
                accessibilityLabel="Re-engagement nudge"
              />
            }
          />
          <Row
            label="Weekly summary"
            sublabel="Sunday evenings — how you did this week"
            isLast
            right={
              <Toggle
                value={prefs.weeklySummaryEnabled}
                onValueChange={v => updateNotifPref('weeklySummaryEnabled', v)}
                accessibilityLabel="Weekly summary"
              />
            }
          />
        </Section>

        {/* ── Training ── */}
        <Section label="TRAINING">
          <Row
            label="Haptic feedback"
            sublabel="Vibrations during exercises and milestones"
            right={
              <Toggle
                value={prefs.hapticFeedback}
                onValueChange={v => updatePref('hapticFeedback', v)}
                accessibilityLabel="Haptic feedback"
              />
            }
          />
          <Row
            label="Training history"
            sublabel="View your completed sessions and scores"
            onPress={() => navigation.navigate('Progress')}
            isLast
            right={<ChevronRight />}
          />
        </Section>

        {/* ── Accessibility ── */}
        <Section label="ACCESSIBILITY">
          <Row
            label="Large text"
            sublabel="Increases text size across the app"
            right={
              <Toggle
                value={prefs.largeText}
                onValueChange={v => updatePref('largeText', v)}
                accessibilityLabel="Large text"
              />
            }
          />
          <Row
            label="Audio cues"
            sublabel="Play tones to signal exercise transitions"
            isLast
            right={
              <Toggle
                value={prefs.audioCues}
                onValueChange={v => updatePref('audioCues', v)}
                accessibilityLabel="Audio cues"
              />
            }
          />
        </Section>

        {/* ── Privacy & Data ── */}
        <Section label="PRIVACY & DATA">
          <Row
            label="Privacy Policy"
            onPress={() => Linking.openURL('https://eloqua.app/privacy')}
            right={<ChevronRight />}
          />
          <Row
            label="Terms of Service"
            onPress={() => Linking.openURL('https://eloqua.app/terms')}
            right={<ChevronRight />}
          />
          <Row
            label="Your data"
            sublabel="All voice and training data is stored securely and never sold"
            isLast
            right={null}
          />
        </Section>

        {/* ── About ── */}
        <Section label="ABOUT">
          <Row
            label="Send feedback"
            sublabel="Help us improve Eloqua"
            onPress={() =>
              Linking.openURL(
                'mailto:gs2022@ic.ac.uk?subject=Eloqua%20Feedback'
              )
            }
            right={<ChevronRight />}
          />
          <Row
            label="Rate the app"
            onPress={() =>
              Linking.openURL(
                'https://apps.apple.com/app/id000000000'
              )
            }
            right={<ChevronRight />}
          />
          <Row
            label="Version"
            isLast
            right={<ValueTag label={Constants.expoConfig?.version ?? '—'} color={DIM} />}
          />
        </Section>

        {/* ── Account actions ── */}
        <View style={s.dangerZone}>
          <TouchableOpacity
            style={s.signOutBtn}
            onPress={handleSignOut}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={isGuest ? 'Exit guest session' : 'Sign out'}
          >
            <Text style={s.signOutText}>
              {isGuest ? 'Exit guest session' : 'Sign out'}
            </Text>
          </TouchableOpacity>

          {!isGuest && (
            <TouchableOpacity
              style={s.deleteBtn}
              onPress={handleDeleteAccount}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Delete account"
            >
              <Text style={s.deleteText}>Delete account</Text>
            </TouchableOpacity>
          )}
        </View>


      </ScrollView>

      <TimePickerModal
        visible={timePickerOpen}
        currentHour={prefs.reminderHour}
        currentMinute={prefs.reminderMinute}
        onSelect={updateReminderTime}
        onClose={() => setTimePickerOpen(false)}
      />

      {/* Persistent bottom tab bar — also shown on Home and Progress */}
      <TabBar navigation={navigation} activeTab="settings" />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },

  // Header now rendered by shared ScreenHeader component

  content: {
    paddingHorizontal: 20 * SC,
    paddingTop: 8 * SC,
    gap: 24 * SC,
  },

  // ── Profile ──
  profileBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16 * SC,
    paddingVertical: 8 * SC,
    paddingHorizontal: 4 * SC,
  },
  profileText: { flex: 1, gap: 3 * SC },
  profileName: {
    color: WHITE,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  profileEmail: {
    color: DIM,
    fontSize: 16,
    letterSpacing: 0.1,
  },
  createAccountBtn: {
    marginTop: 6 * SC,
    paddingHorizontal: 12 * SC,
    paddingVertical: 6 * SC,
    borderRadius: 10 * SC,
    backgroundColor: 'rgba(254,156,45,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(254,156,45,0.30)',
    alignSelf: 'flex-start',
  },
  createAccountText: {
    color: ORANGE,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // ── Danger zone ──
  dangerZone: {
    gap: 12 * SC,
    paddingTop: 8 * SC,
  },
  signOutBtn: {
    backgroundColor: TEAL,
    borderRadius: 16 * SC,
    paddingVertical: 18 * SC,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(195,222,206,0.20)',
  },
  signOutText: {
    color: WHITE,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  deleteBtn: {
    backgroundColor: 'rgba(224,82,82,0.10)',
    borderRadius: 16 * SC,
    paddingVertical: 16 * SC,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(224,82,82,0.25)',
  },
  deleteText: {
    color: RED,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
