/**
 * StreakCommitmentScreen  (Strx2)
 *
 * Shown immediately after StreakCelebrationScreen.
 * Inspired by Duolingo's streak commitment screen but distinct:
 *   - Animated streak counter counts up 0 → N
 *   - Weekly day circles spring in one-by-one with haptic feedback
 *   - "I'm committed" button triggers heavy haptic + navigates Home
 *   - Motivational text adapts to milestone (1, 7, 14, 30+ days)
 *
 * Props (via route.params):
 *   streakDays   number   current streak count
 *   userName     string   user's first name
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Polyline } from 'react-native-svg';
import { colors } from '../theme';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: W } = Dimensions.get('window');
const SC = W / 402;   // Figma frame scale

const ORANGE = '#FFA940';
// Background gradient is now sourced from colors.gradients.app (imported above).
const WHITE  = '#FFFFFF';
const MINT   = '#C3DECE';

// ── Flame SVG (same Figma path as CelebrationScreen) ─────────────────────────
const FLAME_PATH =
  'M28.9176 54.4372C38.1118 52.6667 50 46.3059 50 29.8594C50 14.895 38.6088 4.92817 30.4176 0.349191C28.5971 -0.668989 26.4706 0.668786 26.4706 2.691V7.8611C26.4706 11.9395 24.6882 19.3835 19.7353 22.4805C17.2059 24.0615 14.4706 21.6942 14.1647 18.8094L13.9118 16.4393C13.6176 13.6845 10.7 12.013 8.41176 13.693C4.29706 16.7051 0 21.994 0 29.8566C0 49.9685 15.5559 55 23.3324 55C23.7873 55 24.2618 54.9859 24.7559 54.9576C20.9147 54.6436 14.7059 52.3527 14.7059 44.9426C14.7059 39.1447 19.1029 35.2275 22.4441 33.3184C23.3441 32.8093 24.3941 33.474 24.3941 34.478V36.1467C24.3941 37.4194 24.9088 39.4134 26.1294 40.7766C27.5118 42.3208 29.5382 40.7031 29.7 38.6723C29.7529 38.0332 30.4235 37.6259 31 37.9483C32.8853 39.0089 35.2941 41.2715 35.2941 44.9426C35.2941 50.735 31.9735 53.3992 28.9176 54.4372Z';

// Share icon (lucide:share path, viewBox 0 0 24 24)
function ShareIcon({ size = 22, color = WHITE }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Polyline
        points="16 6 12 2 8 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line
        x1="12" y1="2" x2="12" y2="15"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// Checkmark SVG for completed days
function CheckIcon({ size = 16, color = ORANGE }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 13l4 4L19 7"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ── Days of week ──────────────────────────────────────────────────────────────
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
// JS getDay(): 0=Sun,1=Mon,...,6=Sat → map to index 0=Mo..6=Su
function jsDay2Idx(jsDay) {
  return jsDay === 0 ? 6 : jsDay - 1;  // Mo=0..Su=6
}

// Determine which days are completed based on streak + today
function getCompletedDays(streakDays) {
  const todayIdx = jsDay2Idx(new Date().getDay());
  const completed = new Set();
  const count = Math.min(streakDays, 7);
  for (let i = 0; i < count; i++) {
    const idx = ((todayIdx - i) + 7) % 7;
    completed.add(idx);
  }
  return completed;
}

// Motivational copy based on milestone
function getMotivation(streakDays, userName) {
  const name = userName ? `, ${userName}` : '';
  if (streakDays === 1)  return `A streak is born${name}!\nPractice every day to help it grow.`;
  if (streakDays < 7)   return `${streakDays} days strong${name}.\nYour voice is becoming unstoppable.`;
  if (streakDays === 7) return `A full week${name}!\nYou've built a habit. Don't stop now.`;
  if (streakDays < 14)  return `${streakDays} days${name}.\nYour commitment is paying off.`;
  if (streakDays === 14) return `Two weeks${name}!\nYou're in the top 5% of users.`;
  if (streakDays < 30)  return `${streakDays} days${name}.\nYour voice is transforming.`;
  return `${streakDays} days${name}.\nYou are an inspiration.`;
}

// ── Single day circle ─────────────────────────────────────────────────────────
function DayCircle({ label, isCompleted, isToday, animValue }) {
  const scale = animValue.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const opacity = animValue.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.7, 1] });

  const bgColor = isCompleted ? 'rgba(254,156,45,0.18)' : 'rgba(55,118,122,0.20)';
  const borderColor = isCompleted ? ORANGE : (isToday ? MINT : 'rgba(195,222,206,0.25)');
  const borderWidth = isToday ? 2 : 1.5;

  return (
    <Animated.View style={[styles.dayCol, { opacity, transform: [{ scale }] }]}>
      <Text style={[styles.dayLabel, isCompleted && styles.dayLabelCompleted]}>{label}</Text>
      <View
        style={[
          styles.dayCircle,
          {
            backgroundColor: bgColor,
            borderColor,
            borderWidth,
          },
        ]}
      >
        {isCompleted && <CheckIcon size={18} color={ORANGE} />}
      </View>
    </Animated.View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function StreakCommitmentScreen({ navigation, route }) {
  const { streakDays = 1, userName = '' } = route?.params ?? {};
  const { top: safeTop, bottom: safeBottom } = useSafeAreaInsets();

  const completedDays = getCompletedDays(streakDays);
  const todayIdx = jsDay2Idx(new Date().getDay());
  const motivation = getMotivation(streakDays, userName);

  // Animated values
  const bgAnim       = useRef(new Animated.Value(0)).current;
  const headerAnim   = useRef(new Animated.Value(0)).current;
  const numberAnim   = useRef(new Animated.Value(0)).current;  // 0→1 for count-up
  const labelAnim    = useRef(new Animated.Value(0)).current;
  const calendarAnim = useRef(new Animated.Value(0)).current;
  const btnAnim      = useRef(new Animated.Value(0)).current;

  // Per-day circle animations
  const dayAnims = useRef(DAYS.map(() => new Animated.Value(0))).current;

  // Display number state (counts up)
  const [displayNum, setDisplayNum] = useState(0);
  const [flameVisible, setFlameVisible] = useState(false);

  useEffect(() => {
    // Background + header in
    Animated.sequence([
      Animated.timing(bgAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(headerAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(labelAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    ]).start();

    // Streak counter counts up starting at t=400ms
    setTimeout(() => {
      setFlameVisible(true);
      const total = streakDays;
      const stepDur = total <= 10 ? 80 : total <= 30 ? 40 : 20;
      let count = 0;
      const interval = setInterval(() => {
        count++;
        setDisplayNum(count);
        if (count >= total) clearInterval(interval);
      }, stepDur);
      // Light haptic when counter starts
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, 500);

    // Day circles spring in one-by-one at t=900ms
    const completedList = DAYS.map((_, i) => completedDays.has(i));
    const delayBase = 900;
    const completedIndices = [];
    const upcomingIndices = [];

    DAYS.forEach((_, i) => {
      if (completedDays.has(i)) completedIndices.push(i);
      else upcomingIndices.push(i);
    });

    // Completed days animate first (left to right by day index), then upcoming
    const orderedIndices = [
      ...completedIndices.sort((a, b) => a - b),
      ...upcomingIndices.sort((a, b) => a - b),
    ];

    orderedIndices.forEach((dayIdx, seq) => {
      const isCompleted = completedDays.has(dayIdx);
      setTimeout(() => {
        if (isCompleted) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        Animated.spring(dayAnims[dayIdx], {
          toValue: 1,
          tension: 55,
          friction: 7,
          useNativeDriver: true,
        }).start();
      }, delayBase + seq * 110);
    });

    // Calendar section fades in at same time
    setTimeout(() => {
      Animated.timing(calendarAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    }, delayBase - 100);

    // Buttons appear
    setTimeout(() => {
      Animated.spring(btnAnim, { toValue: 1, tension: 60, friction: 9, useNativeDriver: true }).start();
    }, delayBase + DAYS.length * 110 + 300);
  }, []);

  function handleCommit() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 120);
    navigation.replace('Home');
  }

  function handleShare() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Share sheet — can be wired to expo-sharing later
  }

  const headerSlide = headerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-20, 0],
  });
  const btnScale = btnAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Gradient background — uses the canonical app gradient from the design system */}
      <LinearGradient
        colors={colors.gradients.app}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Subtle texture overlay */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { opacity: bgAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }) },
        ]}
      >
        <LinearGradient
          colors={['transparent', 'rgba(10,22,24,0.8)']}
          start={{ x: 0.5, y: 0.3 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      <View style={[styles.inner, { paddingTop: safeTop + 28, paddingBottom: safeBottom + 20 }]}>

        {/* ── Motivational header ── */}
        <Animated.View
          style={[
            styles.headerBlock,
            { opacity: headerAnim, transform: [{ translateY: headerSlide }] },
          ]}
        >
          <Text style={styles.headerText}>{motivation}</Text>
        </Animated.View>

        {/* ── Streak counter ── */}
        <View style={styles.counterBlock}>
          {flameVisible && (
            <View style={styles.flameSmall}>
              <Svg width={36} height={40} viewBox="0 0 50 55" fill="none">
                <Path d={FLAME_PATH} fill={ORANGE} />
              </Svg>
            </View>
          )}
          <Text style={styles.counterNumber}>{displayNum}</Text>
          <Text style={styles.counterSuffix}>
            {streakDays === 1 ? 'day\nstreak' : 'day\nstreak'}
          </Text>
        </View>

        {/* ── Label ── */}
        <Animated.Text style={[styles.weekLabel, { opacity: labelAnim }]}>
          THIS WEEK
        </Animated.Text>

        {/* ── Weekly calendar ── */}
        <Animated.View style={[styles.calendar, { opacity: calendarAnim }]}>
          {/* Day circles */}
          <View style={styles.daysRow}>
            {DAYS.map((label, i) => (
              <DayCircle
                key={label}
                label={label}
                isCompleted={completedDays.has(i)}
                isToday={i === todayIdx}
                animValue={dayAnims[i]}
              />
            ))}
          </View>
        </Animated.View>

        {/* ── Spacer ── */}
        <View style={{ flex: 1 }} />

        {/* ── Commitment text ── */}
        <Animated.Text
          style={[
            styles.commitmentQuote,
            { opacity: btnAnim, transform: [{ scale: btnScale }] },
          ]}
        >
          Every session counts. Every day builds.
        </Animated.Text>

        {/* ── Buttons ── */}
        <Animated.View
          style={[
            styles.btnRow,
            { opacity: btnAnim, transform: [{ scale: btnScale }] },
          ]}
        >
          {/* Share — smaller pill on left */}
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={handleShare}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Share your streak"
          >
            <ShareIcon size={22} color={WHITE} />
          </TouchableOpacity>

          {/* I'm committed — fills remaining width */}
          <TouchableOpacity
            style={styles.commitBtn}
            onPress={handleCommit}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="I am committed"
          >
            <Text style={styles.commitBtnText}>I'm committed</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const CIRCLE_SIZE = 42 * SC;
const DAY_GAP = Math.max(4, (W - 32 * 2 - CIRCLE_SIZE * 7) / 6);

const styles = StyleSheet.create({
  root: { flex: 1 },

  inner: {
    flex: 1,
    paddingHorizontal: 28 * SC,
  },

  // ── Header ──
  headerBlock: {
    marginBottom: 32 * SC,
  },
  headerText: {
    color: WHITE,
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 30,
    letterSpacing: 0.3,
  },

  // ── Counter ──
  counterBlock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 36 * SC,
  },
  flameSmall: {
    marginRight: 8 * SC,
    marginBottom: 6 * SC,
  },
  counterNumber: {
    color: ORANGE,
    fontSize: 96,
    fontWeight: '800',
    lineHeight: 96,
    letterSpacing: -2,
  },
  counterSuffix: {
    color: WHITE,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 24,
    marginLeft: 10 * SC,
    marginBottom: 10 * SC,
    letterSpacing: 1,
    textTransform: 'uppercase',
    opacity: 0.85,
  },

  // ── Week label ──
  weekLabel: {
    color: MINT,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 14 * SC,
    opacity: 0.7,
  },

  // ── Calendar ──
  calendar: {
    position: 'relative',
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    zIndex: 1,
  },

  // ── Day circle ──
  dayCol: {
    alignItems: 'center',
    width: CIRCLE_SIZE,
  },
  dayLabel: {
    color: 'rgba(195,222,206,0.5)',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8 * SC,
  },
  dayLabelCompleted: {
    color: ORANGE,
    opacity: 0.9,
  },
  dayCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Commitment quote ──
  commitmentQuote: {
    color: MINT,
    fontSize: 16,
    fontWeight: '400',
    letterSpacing: 0.4,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 20 * SC,
  },

  // ── Buttons ──
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12 * SC,
  },
  shareBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commitBtn: {
    flex: 1,
    paddingVertical: 20,
    borderRadius: 28,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  commitBtnText: {
    color: '#0D1C1E',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});
