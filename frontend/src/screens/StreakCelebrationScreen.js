/**
 * StreakCelebrationScreen  (Strx1)
 *
 * The "wow" moment shown when a streak starts or increases.
 * Three dramatic beats:
 *   1. Fire ignites   — spring-scale with glow rings + heavy haptic
 *   2. Dolphin leaps  — arcs through the flame + medium haptic
 *   3. Streak reveals — number bounces in + success haptic
 *
 * Props (via navigation.params):
 *   streakDays        number   current streak count
 *   userName          string   user's first name
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: W, height: H } = Dimensions.get('window');

// ── Flame SVG (exact Figma export, viewBox 0 0 50 55) ────────────────────────
const FLAME_PATH =
  'M28.9176 54.4372C38.1118 52.6667 50 46.3059 50 29.8594C50 14.895 38.6088 4.92817 30.4176 0.349191C28.5971 -0.668989 26.4706 0.668786 26.4706 2.691V7.8611C26.4706 11.9395 24.6882 19.3835 19.7353 22.4805C17.2059 24.0615 14.4706 21.6942 14.1647 18.8094L13.9118 16.4393C13.6176 13.6845 10.7 12.013 8.41176 13.693C4.29706 16.7051 0 21.994 0 29.8566C0 49.9685 15.5559 55 23.3324 55C23.7873 55 24.2618 54.9859 24.7559 54.9576C20.9147 54.6436 14.7059 52.3527 14.7059 44.9426C14.7059 39.1447 19.1029 35.2275 22.4441 33.3184C23.3441 32.8093 24.3941 33.474 24.3941 34.478V36.1467C24.3941 37.4194 24.9088 39.4134 26.1294 40.7766C27.5118 42.3208 29.5382 40.7031 29.7 38.6723C29.7529 38.0332 30.4235 37.6259 31 37.9483C32.8853 39.0089 35.2941 41.2715 35.2941 44.9426C35.2941 50.735 31.9735 53.3992 28.9176 54.4372Z';

const FLAME_W = 220;
const FLAME_H = FLAME_W * (55 / 50);

const ORANGE  = '#FFA940';
// Background gradient is now sourced from colors.gradients.app (imported above).
const WHITE   = '#FFFFFF';
const MINT    = '#C3DECE';

// ── Bubble config — underwater feel, staggered rise ──────────────────────────
const BUBBLE_CONFIGS = [
  { x: W * 0.10, size: 14, dur: 3200, delay: 700,  op: 0.55 },
  { x: W * 0.22, size: 22, dur: 3600, delay: 900,  op: 0.45 },
  { x: W * 0.38, size: 11, dur: 2900, delay: 500,  op: 0.65 },
  { x: W * 0.52, size: 18, dur: 3400, delay: 1100, op: 0.50 },
  { x: W * 0.65, size: 25, dur: 3100, delay: 800,  op: 0.40 },
  { x: W * 0.78, size: 13, dur: 3300, delay: 600,  op: 0.60 },
  { x: W * 0.88, size: 20, dur: 3700, delay: 1300, op: 0.45 },
  { x: W * 0.30, size: 16, dur: 3000, delay: 1500, op: 0.55 },
  { x: W * 0.60, size: 12, dur: 2800, delay: 1700, op: 0.60 },
  { x: W * 0.45, size: 8,  dur: 2600, delay: 1900, op: 0.50 },
];

// ── Single rising bubble ──────────────────────────────────────────────────────
function RisingBubble({ cfg }) {
  const ty      = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(cfg.op)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(cfg.delay),
      Animated.parallel([
        Animated.timing(ty, {
          toValue: -(H + cfg.size + 60),
          duration: cfg.dur,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(cfg.dur * 0.55),
          Animated.timing(opacity, {
            toValue: 0,
            duration: cfg.dur * 0.45,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: cfg.x - cfg.size / 2,
        bottom: -cfg.size,
        width: cfg.size,
        height: cfg.size,
        borderRadius: cfg.size / 2,
        borderWidth: 1,
        borderColor: `rgba(195,222,206,0.7)`,
        backgroundColor: `rgba(195,222,206,0.18)`,
        opacity,
        transform: [{ translateY: ty }],
      }}
    />
  );
}

// ── Glow ring behind flame ────────────────────────────────────────────────────
function GlowRing({ size, bgOpacity, delay }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setTimeout(() => {
      Animated.timing(anim, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, delay);
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `rgba(254,156,45,${bgOpacity})`,
        opacity: anim,
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }],
      }}
    />
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function StreakCelebrationScreen({ navigation, route }) {
  const {
    streakDays = 1, userName = '', fromBaseline = false,
    focusKey = null, focusLabel = null, focusTip = null,
    voicePowerScore = null, expressionScore = null, fluencyScore = null,
  } = route?.params ?? {};
  const { bottom: safeBottom } = useSafeAreaInsets();

  // Animation values
  const bgOpacity     = useRef(new Animated.Value(0)).current;
  const flameScale    = useRef(new Animated.Value(0)).current;
  const flamePulseX   = useRef(new Animated.Value(0)).current;  // subtle sway
  const flamePulseS   = useRef(new Animated.Value(1)).current;  // breathe
  const dolphinX      = useRef(new Animated.Value(-W * 0.5)).current;
  const dolphinY      = useRef(new Animated.Value(H * 0.18)).current;
  const dolphinOp     = useRef(new Animated.Value(0)).current;
  const textOp        = useRef(new Animated.Value(0)).current;
  const textScale     = useRef(new Animated.Value(0.4)).current;
  const btnOp         = useRef(new Animated.Value(0)).current;
  const btnTranslateY = useRef(new Animated.Value(30)).current;

  const [glowVisible, setGlowVisible]   = useState(false);
  const [bubblesVisible, setBubbles]    = useState(false);
  const [dolphinVisible, setDolphin]    = useState(false);

  useEffect(() => {
    const seq = [
      // t=0: background fades in
      () => Animated.timing(bgOpacity, { toValue: 1, duration: 600, useNativeDriver: true }).start(),

      // t=200: glow rings appear
      () => setTimeout(() => setGlowVisible(true), 200),

      // t=380: FIRE IGNITES — heavy haptic + spring scale
      () => setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        Animated.spring(flameScale, {
          toValue: 1,
          tension: 38,
          friction: 5,
          useNativeDriver: true,
        }).start(() => {
          // Breathe loop
          Animated.loop(Animated.sequence([
            Animated.timing(flamePulseS, { toValue: 1.06, duration: 850, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(flamePulseS, { toValue: 1.00, duration: 850, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ])).start();
          // Sway loop
          Animated.loop(Animated.sequence([
            Animated.timing(flamePulseX, { toValue: 4, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(flamePulseX, { toValue: -4, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(flamePulseX, { toValue: 0, duration: 350, useNativeDriver: true }),
          ])).start();
        });
      }, 380),

      // t=650: medium haptic (flame settled)
      () => setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 650),

      // t=800: bubbles start rising
      () => setTimeout(() => setBubbles(true), 800),

      // t=1000: DOLPHIN leaps in — light haptic
      () => setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setDolphin(true);
        Animated.parallel([
          Animated.spring(dolphinX, {
            toValue: W * 0.08,
            tension: 45,
            friction: 7,
            useNativeDriver: true,
          }),
          Animated.spring(dolphinY, {
            toValue: H * 0.04,
            tension: 50,
            friction: 8,
            useNativeDriver: true,
          }),
          Animated.timing(dolphinOp, { toValue: 1, duration: 250, useNativeDriver: true }),
        ]).start(() => {
          // Brief pause at peak, then exit
          setTimeout(() => {
            Animated.parallel([
              Animated.timing(dolphinX, { toValue: W * 0.7, duration: 550, easing: Easing.in(Easing.quad), useNativeDriver: true }),
              Animated.timing(dolphinY, { toValue: -H * 0.15, duration: 550, easing: Easing.in(Easing.quad), useNativeDriver: true }),
              Animated.timing(dolphinOp, { toValue: 0, duration: 300, useNativeDriver: true }),
            ]).start();
          }, 300);
        });
      }, 1000),

      // t=1350: STREAK TEXT appears — success haptic
      () => setTimeout(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Animated.parallel([
          Animated.spring(textScale, { toValue: 1, tension: 55, friction: 7, useNativeDriver: true }),
          Animated.timing(textOp, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]).start();
      }, 1350),

      // t=2300: Continue button slides up
      () => setTimeout(() => {
        Animated.parallel([
          Animated.timing(btnOp, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.spring(btnTranslateY, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
        ]).start();
      }, 2300),
    ];

    seq.forEach(fn => fn());
  }, []);

  function handleContinue() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (fromBaseline) {
      // Pass all three assessment dimension scores through to the results screen.
      navigation.replace('BaselineResults', {
        focusKey, focusLabel, focusTip,
        voicePowerScore, expressionScore, fluencyScore,
      });
    } else {
      navigation.replace('StreakCommitment', { streakDays, userName });
    }
  }

  const isNewStreak = streakDays === 1;
  const headline = isNewStreak
    ? 'A STREAK\nIS BORN'
    : `${streakDays} DAY\nSTREAK`;

  // Warm, day-specific sub-messages — short and human, never corporate.
  function getStreakSub() {
    if (isNewStreak)      return userName ? `Welcome back, ${userName}. Every day you show up counts.` : 'Every day you show up counts.';
    if (streakDays === 3) return 'Three days running. This is how progress happens.';
    if (streakDays === 7) return "A full week. You're building something real.";
    if (streakDays % 7 === 0) return `${streakDays} days. That's real commitment.`;
    return userName ? `You kept it burning, ${userName}.` : 'Keep going — consistency is everything.';
  }
  const streakSubMsg = getStreakSub();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Deep dark base — shown while the gradient fades in */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgDeep }]} />

      {/* App gradient fades in — uses the canonical app gradient from the design system */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: bgOpacity }]}>
        <LinearGradient
          colors={colors.gradients.app}
          start={{ x: 0.3, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      {/* Bubbles — rise from bottom */}
      {bubblesVisible && BUBBLE_CONFIGS.map((cfg, i) => (
        <RisingBubble key={i} cfg={cfg} />
      ))}

      {/* ── Centre stage ─────────────────────────────────────────────────── */}
      <View style={styles.stage}>

        {/* Glow rings — concentric circles behind flame */}
        {glowVisible && (
          <View style={styles.glowContainer}>
            <GlowRing size={380} bgOpacity={0.06} delay={0}   />
            <GlowRing size={290} bgOpacity={0.10} delay={120} />
            <GlowRing size={200} bgOpacity={0.18} delay={220} />
            <GlowRing size={120} bgOpacity={0.28} delay={300} />
          </View>
        )}

        {/* Flame + dolphin composite */}
        <View style={styles.flameWrap}>
          <Animated.View
            style={{
              transform: [
                { scale: Animated.multiply(flameScale, flamePulseS) },
                { translateX: flamePulseX },
              ],
            }}
          >
            <Svg
              width={FLAME_W}
              height={FLAME_H}
              viewBox="0 0 50 55"
              fill="none"
            >
              <Path d={FLAME_PATH} fill={ORANGE} />
            </Svg>
          </Animated.View>

          {/* Dolphin — leaps through the flame */}
          {dolphinVisible && (
            <Animated.Image
              source={require('../../assets/images/Dolphin.png')}
              style={{
                position: 'absolute',
                width: 110,
                height: 74,
                bottom: FLAME_H * 0.15,
                left: -W * 0.12,
                opacity: dolphinOp,
                transform: [
                  { translateX: dolphinX },
                  { translateY: dolphinY },
                  { rotate: '-28deg' },
                ],
              }}
              resizeMode="contain"
            />
          )}
        </View>

        {/* Streak text */}
        <Animated.View
          style={[
            styles.textBlock,
            {
              opacity: textOp,
              transform: [{ scale: textScale }],
            },
          ]}
        >
          <Text style={styles.streakNumber}>{streakDays}</Text>
          <Text style={styles.streakLabel}>
            {streakDays === 1 ? 'DAY STREAK' : 'DAYS STREAK'}
          </Text>
          <Text style={styles.streakSub}>{streakSubMsg}</Text>
        </Animated.View>
      </View>

      {/* Continue button */}
      <Animated.View
        style={[
          styles.btnContainer,
          { paddingBottom: safeBottom + 24, opacity: btnOp, transform: [{ translateY: btnTranslateY }] },
        ]}
      >
        <TouchableOpacity
          style={styles.continueBtn}
          onPress={handleContinue}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Continue to commitment screen"
        >
          <Text style={styles.continueBtnText}>See your progress</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },

  glowContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },

  flameWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },

  textBlock: {
    alignItems: 'center',
    marginTop: 8,
  },
  streakNumber: {
    color: ORANGE,
    fontSize: 96,
    fontWeight: '800',
    letterSpacing: 2,
    lineHeight: 100,
  },
  streakLabel: {
    color: WHITE,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 4,
    marginTop: -4,
  },
  streakSub: {
    color: MINT,
    fontSize: 18,
    fontWeight: '400',
    letterSpacing: 0.4,
    marginTop: 10,
    opacity: 0.85,
    textAlign: 'center',
    paddingHorizontal: 20,
  },

  btnContainer: {
    paddingHorizontal: 28,
  },
  continueBtn: {
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
  continueBtnText: {
    color: '#0D1C1E',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
});
