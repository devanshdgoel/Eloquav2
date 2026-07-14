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
import { StarIcon } from '../../../components/Icons';
import ScreenHeader from '../../../components/ScreenHeader';
import SpeakerButton from '../../../components/SpeakerButton';

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

  // Body text for the SpeakerButton — the motivational message shown on screen.
  const midpointText = `${m.heading} ${m.sub} You're halfway through your session — keep going!`;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Header now rendered by shared ScreenHeader component.
          backIcon is ✕ because this exits the session entirely.
          The root is centered so the header must be positioned at the top. */}
      <View style={s.headerWrap}>
        <ScreenHeader
          navigation={null}
          title="Halfway There"
          backIcon="✕"
          backLabel="Exit session"
          onBack={onExit}
          rightAction={<SpeakerButton text={midpointText} />}
        />
      </View>

      <Animated.View style={[s.content, { opacity, transform: [{ translateY: slideY }] }]}>
        {/* Star badge */}
        <Animated.View style={[s.badge, { transform: [{ scale: starScale }] }]}>
          <StarIcon size={52} color={ORANGE} />
        </Animated.View>

        <Text style={s.heading}>{m.heading}</Text>
        <Text style={s.sub}>{m.sub}</Text>

        {/* Progress pips — 8 total (4 done, 1 midpoint, 3 remaining) */}
        <View style={s.pips}>
          {Array.from({ length: 8 }, (_, i) => (
            <View key={i} style={[s.pip, i < 4 && s.pipDone, i === 4 && s.pipNext]} />
          ))}
        </View>

        <TouchableOpacity style={s.continueBtn} onPress={onComplete} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Keep going">
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
  // Header now rendered by shared ScreenHeader component.
  // Positioned at the top of the screen absolutely so it doesn't push
  // the centered content out of the middle of the page.
  headerWrap: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 10,
  },
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
  badgeIcon: { width: 52, height: 52 },
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
    backgroundColor: ORANGE, borderRadius: 28,
    paddingHorizontal: 44, paddingVertical: 20,
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45, shadowRadius: 12, elevation: 8,
  },
  continueTxt: {
    color: '#1A1A1A', fontSize: 18, fontWeight: '800', letterSpacing: 0.4,
  },
});
