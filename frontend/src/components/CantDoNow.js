/**
 * CantDoNow — shared "Can't do this right now" affordance for every exercise.
 *
 * Usage:
 *   <CantDoNow onSkip={onComplete} onEnd={onExit} />
 *
 *   onSkip  — advance to the next exercise in the session (skip this one)
 *   onEnd   — exit the session entirely
 *
 * The button is intentionally subtle so it doesn't distract during active
 * exercise, but remains accessible for users who are having a difficult session.
 * The modal uses compassionate, non-judgmental language.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';

const { width: W, height: H } = Dimensions.get('window');

export default function CantDoNow({ onSkip, onEnd, style }) {
  const [visible, setVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(H)).current;
  const bgAnim    = useRef(new Animated.Value(0)).current;

  function open() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVisible(true);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 14, useNativeDriver: true }),
      Animated.timing(bgAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }

  function close(callback) {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: H, duration: 220, useNativeDriver: true }),
      Animated.timing(bgAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      setVisible(false);
      slideAnim.setValue(H);
      if (callback) callback();
    });
  }

  function handleSkip() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    close(onSkip);
  }

  function handleEnd() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    close(onEnd);
  }

  return (
    <>
      {/* Trigger — subtle ghost pill */}
      <TouchableOpacity
        style={[styles.trigger, style]}
        onPress={open}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel="I can't do this exercise right now"
        hitSlop={{ top: 12, bottom: 12, left: 20, right: 20 }}
      >
        <Text style={styles.triggerText}>Can't do this right now</Text>
      </TouchableOpacity>

      {/* Bottom sheet modal */}
      <Modal visible={visible} transparent statusBarTranslucent animationType="none">
        {/* Backdrop — tap to dismiss */}
        <Animated.View
          style={[styles.backdrop, { opacity: bgAnim }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            onPress={() => close()}
            activeOpacity={1}
          />
        </Animated.View>

        {/* Sheet */}
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          {/* Handle pill */}
          <View style={styles.handle} />

          <Text style={styles.title}>No worries.</Text>
          <Text style={styles.body}>
            Your voice needs rest too. You can skip this exercise and keep going, or end your session for today — both are completely fine.
          </Text>

          {/* Skip exercise */}
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={handleSkip}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Skip this exercise and continue session"
          >
            <Text style={styles.skipText}>Skip this exercise</Text>
            <Text style={styles.skipSub}>Continue with the next one</Text>
          </TouchableOpacity>

          {/* End session */}
          <TouchableOpacity
            style={styles.endBtn}
            onPress={handleEnd}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="End session for today"
          >
            <Text style={styles.endText}>End session for today</Text>
          </TouchableOpacity>

          {/* Stay */}
          <TouchableOpacity
            style={styles.stayBtn}
            onPress={() => close()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Stay and continue this exercise"
          >
            <Text style={styles.stayText}>I'll keep going</Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // ── Trigger ──────────────────────────────────────────────────────────────────
  trigger: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  triggerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
    textAlign: 'center',
  },

  // ── Backdrop ─────────────────────────────────────────────────────────────────
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  // ── Sheet ─────────────────────────────────────────────────────────────────────
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#132A30',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 28,
    paddingBottom: 40,
    paddingTop: 16,
    borderTopWidth: 1,
    borderColor: 'rgba(195,222,206,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 24,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignSelf: 'center',
    marginBottom: 24,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  body: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: 0.2,
    marginBottom: 28,
  },

  // Skip exercise — primary teal card
  skipBtn: {
    backgroundColor: '#2D6974',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(195,222,206,0.18)',
  },
  skipText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 3,
  },
  skipSub: {
    color: 'rgba(195,222,206,0.65)',
    fontSize: 16,
    fontWeight: '400',
  },

  // End session — orange
  endBtn: {
    backgroundColor: '#FFA940',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#FFA940',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  endText: {
    color: '#0D1C1E',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  // Stay — ghost
  stayBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  stayText: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});
