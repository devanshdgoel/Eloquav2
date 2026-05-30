import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DAILY_ID       = 'eloqua_daily_reminder';
const REENGAGEMENT_ID = 'eloqua_reengagement';
const WEEKLY_ID      = 'eloqua_weekly_summary';
const PREFS_KEY      = 'eloqua_preferences';

// Don't show notifications as banners while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// ── Permissions ───────────────────────────────────────────────────────────────

export async function requestPermission() {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function hasPermission() {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatTime(hour, minute) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  const m = String(minute).padStart(2, '0');
  return `${h}:${m} ${period}`;
}

async function loadPrefs() {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// ── Scheduling ────────────────────────────────────────────────────────────────

export async function scheduleDailyReminder(hour, minute, name = '') {
  await Notifications.cancelScheduledNotificationAsync(DAILY_ID).catch(() => {});
  const firstName = (name || '').split(' ')[0];
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_ID,
    content: {
      title: firstName
        ? `Time for your voice practice, ${firstName}.`
        : 'Time for your voice practice.',
      body: 'Just 5 minutes today.',
      sound: true,
    },
    trigger: {
      hour,
      minute,
      repeats: true,
    },
  });
}

export async function cancelDailyReminder() {
  await Notifications.cancelScheduledNotificationAsync(DAILY_ID).catch(() => {});
}

// Schedules a one-time re-engagement notification at the user's reminder time,
// 3 days from now. Call this after every session completion to reset the clock.
export async function scheduleReengagement(hour, minute) {
  await Notifications.cancelScheduledNotificationAsync(REENGAGEMENT_ID).catch(() => {});
  const fireDate = new Date();
  fireDate.setDate(fireDate.getDate() + 3);
  fireDate.setHours(hour, minute, 0, 0);
  await Notifications.scheduleNotificationAsync({
    identifier: REENGAGEMENT_ID,
    content: {
      title: "Your voice practice is here whenever you're ready.",
      sound: true,
    },
    trigger: { date: fireDate },
  });
}

export async function cancelReengagement() {
  await Notifications.cancelScheduledNotificationAsync(REENGAGEMENT_ID).catch(() => {});
}

export async function scheduleWeeklySummary() {
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_ID).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_ID,
    content: {
      title: 'Check how you did this week →',
      body: 'Tap to see your weekly progress.',
      sound: true,
    },
    trigger: {
      weekday: 1, // Sunday (1 = Sunday, iOS convention)
      hour: 18,
      minute: 0,
      repeats: true,
    },
  });
}

export async function cancelWeeklySummary() {
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_ID).catch(() => {});
}

// ── Master apply ──────────────────────────────────────────────────────────────
// Call this whenever prefs change or on sign-in to sync scheduled notifications.

export async function applyNotificationPrefs(prefs, userName = '') {
  const granted = await hasPermission();
  if (!granted) return;

  if (prefs.dailyReminder) {
    await scheduleDailyReminder(prefs.reminderHour ?? 10, prefs.reminderMinute ?? 0, userName);
  } else {
    await cancelDailyReminder();
  }

  if (prefs.reengagementEnabled) {
    await scheduleReengagement(prefs.reminderHour ?? 10, prefs.reminderMinute ?? 0);
  } else {
    await cancelReengagement();
  }

  if (prefs.weeklySummaryEnabled) {
    await scheduleWeeklySummary();
  } else {
    await cancelWeeklySummary();
  }
}

// ── Session hook ──────────────────────────────────────────────────────────────
// Call after every session completion to reset the re-engagement clock.

export async function onSessionComplete() {
  try {
    const prefs = await loadPrefs();
    if (!prefs.reengagementEnabled) return;
    const granted = await hasPermission();
    if (!granted) return;
    await scheduleReengagement(prefs.reminderHour ?? 10, prefs.reminderMinute ?? 0);
  } catch {
    // Non-fatal — notifications are a best-effort feature
  }
}
