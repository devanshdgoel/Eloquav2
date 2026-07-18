/**
 * SettingsScreen — simplified pilot version.
 *
 * Kept intentionally minimal for users with cognitive difficulties.
 * Only the settings that matter most for daily practice are shown.
 * Full settings (voice clone, transcription model, notifications,
 * accessibility options) are preserved in SettingsScreen_full.js
 * and can be restored later.
 */

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
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { usePrefsRefresh, useLargeText } from '../context/PrefsContext';
import { getUserProfile } from '../utils/storage';
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

// File-local context so sub-components can read the large-text font scaler
// without needing it passed as a prop through every call site.
const FontCtx = React.createContext((x) => x);

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

// All fields kept so that stored prefs aren't wiped if we restore SettingsScreen_full.js.
const DEFAULT_PREFS = {
  enhancedVoice: true,
  hapticFeedback: true,
  largeText: false,
  audioCues: true,
  transcriptionModel: 'whisper',
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

  const trackBg      = anim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,255,255,0.12)', ORANGE] });
  const thumbX       = anim.interpolate({ inputRange: [0, 1], outputRange: [3, 23] });
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
  const fs = React.useContext(FontCtx);
  return (
    <View style={sec.wrap}>
      <Text style={[sec.label, { fontSize: fs(13) }]}>{label}</Text>
      <View style={sec.card}>{children}</View>
    </View>
  );
}

const sec = StyleSheet.create({
  wrap:  { gap: 8 * SC },
  label: {
    color: MINT,
    fontSize: 13,
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

// ── Row ───────────────────────────────────────────────────────────────────────
function Row({ label, sublabel, right, onPress, isLast = false, tintLabel }) {
  const fs   = React.useContext(FontCtx);
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
        <Text style={[row.label, { fontSize: fs(17) }, tintLabel && { color: tintLabel }]}>{label}</Text>
        {sublabel ? <Text style={[row.sublabel, { fontSize: fs(15) }]}>{sublabel}</Text> : null}
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
    // Taller rows — easier to tap for users with tremor
    paddingVertical: 20 * SC,
    minHeight: 68 * SC,
    gap: 12 * SC,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
  },
  left:     { flex: 1, gap: 3 },
  label:    { color: WHITE, fontSize: 17, fontWeight: '500', letterSpacing: 0.1 },
  sublabel: { color: DIM,   fontSize: 15, letterSpacing: 0.1 },
});

// ── Value badge ───────────────────────────────────────────────────────────────
function ValueTag({ label, color = MINT }) {
  const fs = React.useContext(FontCtx);
  return (
    <View style={[vt.wrap, { borderColor: color + '44' }]}>
      <Text style={[vt.text, { color, fontSize: fs(15) }]}>{label}</Text>
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
  text: { fontSize: 15, fontWeight: '700', letterSpacing: 0.4 },
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
    <View style={[av.circle, { width: size * SC, height: size * SC, borderRadius: (size * SC) / 2 }]}>
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

// ── Time picker modal ─────────────────────────────────────────────────────────
// Generates half-hour slots from 6 AM to 10 PM for the daily reminder.
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
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
                <Text style={[tp.timeText, active && tp.timeTextActive]}>{item.label}</Text>
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
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
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
  timeRowActive: { backgroundColor: 'rgba(254,156,45,0.12)' },
  timeText:       { color: 'rgba(255,255,255,0.70)', fontSize: 16, fontWeight: '500' },
  timeTextActive: { color: ORANGE, fontWeight: '700' },
  checkmark:      { color: ORANGE, fontSize: 16, fontWeight: '700' },
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
  closeBtnText: { color: '#1A1A1A', fontSize: 17, fontWeight: '700' },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SettingsScreen({ navigation }) {
  const { signOut, isGuest, user } = useAuth();
  const refreshPrefs  = usePrefsRefresh();
  const largeText     = useLargeText();
  // fs scales any font size by 1.25 when large text is on.
  const fs = React.useCallback((base) => largeText ? Math.round(base * 1.25) : base, [largeText]);

  const [profile,         setProfile]         = useState(null);
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
  }, []);

  // Generic pref update — writes to AsyncStorage and notifies PrefsContext.
  const updatePref = useCallback(async (key, value) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: value };
      savePrefs(next).then(() => refreshPrefs()).catch(() => {});
      return next;
    });
  }, [refreshPrefs]);

  // Notification pref update — requests permission first if not yet granted.
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

  // Called when the user picks a new time in the time picker modal.
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

  function handleDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and all training progress. This cannot be undone.',
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
                      await fetchWithAuth(`${API_BASE_URL}/api/account`, { method: 'DELETE' });
                    } catch {
                      // Best-effort backend deletion — proceed with local sign-out regardless.
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

  return (
    <FontCtx.Provider value={fs}>
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={[BG_TOP, BG_MID, BG_BOT]}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader navigation={navigation} title="Settings" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, { paddingBottom: 88 + 32 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Profile ── */}
        <View style={s.profileBlock}>
          <Avatar name={displayName} size={64} />
          <View style={s.profileText}>
            <Text style={[s.profileName, { fontSize: fs(20) }]}>{displayName}</Text>
            <Text style={[s.profileEmail, { fontSize: fs(16) }]}>{displayEmail}</Text>
            {isGuest && (
              <TouchableOpacity
                onPress={() => navigation.navigate('SignUp')}
                style={s.createAccountBtn}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Create account to save progress"
              >
                <Text style={[s.createAccountText, { fontSize: fs(16) }]}>Create account to save progress →</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Reminders — single daily reminder toggle + optional time row ── */}
        <Section label="REMINDERS">
          <Row
            label="Daily reminder"
            sublabel="Remind me to practice each day"
            isLast={!prefs.dailyReminder}
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
              isLast
              right={<ValueTag label={formatTime(prefs.reminderHour, prefs.reminderMinute)} color={ORANGE} />}
            />
          )}
        </Section>

        {/* ── Display — large text only ── */}
        <Section label="DISPLAY">
          <Row
            label="Larger text"
            sublabel="Increases text size across the app"
            isLast
            right={
              <Toggle
                value={prefs.largeText}
                onValueChange={v => updatePref('largeText', v)}
                accessibilityLabel="Larger text"
              />
            }
          />
        </Section>

        {/* ── Help — feedback link + version ── */}
        <Section label="HELP">
          <Row
            label="Send feedback"
            sublabel="Help us improve Eloqua"
            onPress={() => Linking.openURL('mailto:gs2022@ic.ac.uk?subject=Eloqua%20Feedback')}
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
            <Text style={[s.signOutText, { fontSize: fs(17) }]}>
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
              <Text style={[s.deleteText, { fontSize: fs(16) }]}>Delete account</Text>
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

      <TabBar navigation={navigation} activeTab="settings" />
    </View>
    </FontCtx.Provider>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },

  content: {
    paddingHorizontal: 20 * SC,
    paddingTop: 8 * SC,
    gap: 28 * SC,
  },

  // ── Profile ──
  profileBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16 * SC,
    paddingVertical: 12 * SC,
    paddingHorizontal: 4 * SC,
  },
  profileText:  { flex: 1, gap: 4 },
  profileName:  { color: WHITE, fontSize: 20, fontWeight: '700', letterSpacing: 0.2 },
  profileEmail: { color: DIM,   fontSize: 16, letterSpacing: 0.1 },
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

  // ── Account buttons ──
  dangerZone: {
    gap: 12 * SC,
    paddingTop: 8 * SC,
  },
  signOutBtn: {
    backgroundColor: TEAL,
    borderRadius: 16 * SC,
    paddingVertical: 20 * SC,
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
    paddingVertical: 18 * SC,
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
