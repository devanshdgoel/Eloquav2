/**
 * MidpointScreen — shown between Loudness Drills and the second Breathing exercise.
 * Celebrates halfway completion and motivates the user to continue.
 */
import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Dimensions,
} from 'react-native';

const { width: W } = Dimensions.get('window');

const DARK_TEAL = '#1C4047';
const ORANGE    = '#FFA940';
const WHITE     = '#FFFFFF';

const MESSAGES = [
  { emoji: '🌟', heading: 'Halfway there!', sub: "Breathe. You're doing great." },
];

export default function MidpointScreen({ onComplete, onExit }) {
  const opacity  = useRef(new Animated.Value(0)).current;
  const slideY   = useRef(new Animated.Value(30)).current;
  const starScale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideY,   { toValue: 0, friction: 7, useNativeDriver: true }),
      Animated.spring(starScale,{ toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();
  }, []);

  const m = MESSAGES[0];

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* X button */}
      <TouchableOpacity style={s.closeBtn} onPress={onExit} accessibilityLabel="Exit session">
        <Text style={s.closeText}>✕</Text>
      </TouchableOpacity>

      <Animated.View style={[s.content, { opacity, transform: [{ translateY: slideY }] }]}>
        {/* Star badge */}
        <Animated.View style={[s.badge, { transform: [{ scale: starScale }] }]}>
          <Text style={s.badgeEmoji}>{m.emoji}</Text>
        </Animated.View>

        <Text style={s.heading}>{m.heading}</Text>
        <Text style={s.sub}>{m.sub}</Text>

        {/* Progress pips — 8 total (4 done, 1 midpoint, 3 remaining) */}
        <View style={s.pips}>
          {Array.from({ length: 8 }, (_, i) => (
            <View key={i} style={[s.pip, i < 4 && s.pipDone, i === 4 && s.pipNext]} />
          ))}
        </View>

        <TouchableOpacity style={s.continueBtn} onPress={onComplete} activeOpacity={0.85}>
          <Text style={s.continueTxt}>Keep going  →</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: DARK_TEAL,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute', top: 56, left: 20,
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center', alignItems: 'center',
  },
  closeText: { color: WHITE, fontSize: 22, fontWeight: '600', includeFontPadding: false, textAlign: 'center', lineHeight: 22 },
  content: {
    alignItems: 'center', paddingHorizontal: 40, gap: 20,
  },
  badge: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(255,169,64,0.18)',
    borderWidth: 2, borderColor: 'rgba(255,169,64,0.45)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 8,
  },
  badgeEmoji: { fontSize: 52 },
  heading: {
    color: WHITE, fontSize: 40, fontWeight: '900',
    letterSpacing: 0.5, textAlign: 'center',
    includeFontPadding: false,
  },
  sub: {
    color: 'rgba(255,255,255,0.68)', fontSize: 18,
    textAlign: 'center', lineHeight: 28, letterSpacing: 0.2,
    paddingHorizontal: 8,
  },
  pips: { flexDirection: 'row', gap: 8, marginTop: 8 },
  pip: {
    width: 28, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  pipDone: { backgroundColor: ORANGE },
  pipNext: { backgroundColor: 'rgba(255,255,255,0.45)' },
  continueBtn: {
    marginTop: 16,
    backgroundColor: ORANGE, borderRadius: 18,
    paddingHorizontal: 44, paddingVertical: 18,
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45, shadowRadius: 12, elevation: 8,
  },
  continueTxt: {
    color: WHITE, fontSize: 18, fontWeight: '800', letterSpacing: 0.4,
  },
});
