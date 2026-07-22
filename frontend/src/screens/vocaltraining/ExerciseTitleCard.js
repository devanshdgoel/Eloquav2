/**
 * ExerciseTitleCard
 *
 * Shown between every exercise so the user always knows what is coming
 * before it starts. Layout matches the reference designs:
 *   - Large bold left-aligned exercise name
 *   - Exercise-specific illustration in the centre
 *   - Teal ghost square → button to proceed
 *   - × top-left to exit the session (triggers the Leave? alert in the parent)
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Ellipse } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme';

// ── Breathing illustration ────────────────────────────────────────────────────
// Reuses the same bubble asset that BreathingExercise's own title screen shows,
// so the two screens feel visually consistent.
function BreathingIllustration() {
  return (
    <Image
      source={require('../../../assets/images/bubble2.png')}
      style={{ width: 200, height: 200 }}
      resizeMode="contain"
      accessible={false}
    />
  );
}

// ── Phonation illustration ────────────────────────────────────────────────────
// Green equalizer bars with a green border rectangle, matching the SP reference
// design (SP12.png). Bell-curve heights with tallest bar in the centre.
function PhonationIllustration() {
  const BAR_RATIOS = [0.28, 0.52, 0.72, 1.0, 0.72, 0.52, 0.28];
  const MAX_H      = 96;
  return (
    <View style={ill.barsOuter}>
      <View style={ill.barsRow}>
        {BAR_RATIOS.map((r, i) => (
          <View key={i} style={[ill.bar, { height: MAX_H * r }]} />
        ))}
      </View>
    </View>
  );
}

// ── Pitch Glides illustration ─────────────────────────────────────────────────
// Dolphin image with the green SVG ellipse hoop overlaid, matching Pitch1.png.
// Same assets and proportions used in PitchGlidesExercise's own title screen.
function PitchIllustration() {
  return (
    <View style={{ width: 200, height: 140, alignItems: 'center', justifyContent: 'center' }}>
      {/* Hoop — positioned to the right of the dolphin, same as the exercise */}
      <Svg
        width={88}
        height={112}
        style={{ position: 'absolute', right: 16, top: 0 }}
        accessible={false}
      >
        <Ellipse
          cx={44} cy={56} rx={38} ry={50}
          stroke="#48D28C" strokeWidth={3.5} fill="none"
        />
      </Svg>
      {/* Dolphin — same Dolphin2.png asset used in PitchGlidesExercise */}
      <Image
        source={require('../../../assets/images/Dolphin2.png')}
        style={{ width: 130, height: 90, resizeMode: 'contain',
                 position: 'absolute', left: 0, bottom: 8 }}
        accessible={false}
      />
    </View>
  );
}

// ── Loudness / Voice Power illustration ──────────────────────────────────────
// Concentric semi-transparent rings suggest a voice projecting outward.
function LoudnessIllustration() {
  const RINGS = [
    { size: 60,  opacity: 0.75 },
    { size: 100, opacity: 0.45 },
    { size: 145, opacity: 0.22 },
  ];
  return (
    <View style={{ width: 160, height: 160, alignItems: 'center', justifyContent: 'center' }}>
      {RINGS.map(({ size, opacity }) => (
        <View
          key={size}
          style={{
            position: 'absolute',
            width: size, height: size, borderRadius: size / 2,
            borderWidth: 2.5, borderColor: '#48D28C',
            backgroundColor: 'transparent', opacity,
          }}
        />
      ))}
      {/* Solid centre dot */}
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#48D28C' }} />
    </View>
  );
}

// ── Midpoint illustration ─────────────────────────────────────────────────────
// Orange ring with "½" inside — clearly communicates halfway progress.
function MidpointIllustration() {
  return (
    <View style={{
      width: 140, height: 140, borderRadius: 70,
      borderWidth: 3, borderColor: '#FFA940',
      justifyContent: 'center', alignItems: 'center',
      backgroundColor: 'transparent',
    }}>
      <Text style={{ color: '#FFA940', fontSize: 52, fontWeight: '800', lineHeight: 60 }}>
        {'½'}
      </Text>
    </View>
  );
}

// ── Tailored / Your Exercise illustration ────────────────────────────────────
// Three concentric target rings — suggests a personalised focus area.
function TailoredIllustration() {
  const RINGS = [
    { size: 145, opacity: 0.22 },
    { size: 95,  opacity: 0.50 },
    { size: 50,  opacity: 0.85 },
  ];
  return (
    <View style={{ width: 160, height: 160, alignItems: 'center', justifyContent: 'center' }}>
      {RINGS.map(({ size, opacity }) => (
        <View
          key={size}
          style={{
            position: 'absolute',
            width: size, height: size, borderRadius: size / 2,
            borderWidth: 2.5, borderColor: '#48D28C',
            backgroundColor: 'transparent', opacity,
          }}
        />
      ))}
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#48D28C' }} />
    </View>
  );
}

// ── Everyday Speech illustration ──────────────────────────────────────────────
// Green waveform bars inside a subtle frosted card — suggests natural voice.
function SpeechIllustration() {
  const BAR_RATIOS = [0.45, 0.75, 1.0, 0.75, 0.45];
  const MAX_H      = 48;
  return (
    <View style={{
      backgroundColor: 'rgba(255,255,255,0.07)',
      borderRadius: 20, paddingHorizontal: 28, paddingVertical: 20,
      borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {BAR_RATIOS.map((r, i) => (
          <View
            key={i}
            style={{ width: 18, height: MAX_H * r, borderRadius: 9, backgroundColor: '#48D28C' }}
          />
        ))}
      </View>
    </View>
  );
}

// ── Illustration lookup ───────────────────────────────────────────────────────
const ILLUSTRATION_MAP = {
  breathing:   BreathingIllustration,
  phonation:   PhonationIllustration,
  pitchGlides: PitchIllustration,
  loudness:    LoudnessIllustration,
  midpoint:    MidpointIllustration,
  tailored:    TailoredIllustration,
  speech:      SpeechIllustration,
};

// ── ExerciseTitleCard ─────────────────────────────────────────────────────────
// Props:
//   exercise  — { type, label, desc } from SESSION_EXERCISES
//   onReady   — called when the user taps → to begin the exercise
//   onExit    — called when the user taps ×  (parent shows Leave? alert)
export default function ExerciseTitleCard({ exercise, onReady, onExit }) {
  const insets         = useSafeAreaInsets();
  const Illustration   = ILLUSTRATION_MAP[exercise.type] ?? null;

  return (
    <LinearGradient colors={colors.gradients.session} style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />

      {/* × — exits the session; the beforeRemove handler in the parent shows
          the "Leave session?" confirmation alert */}
      <TouchableOpacity
        style={[tc.closeBtn, { marginTop: insets.top + 6 }]}
        onPress={onExit}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Exit session"
      >
        <Text style={tc.closeTxt}>{'✕'}</Text>
      </TouchableOpacity>

      {/* Exercise name — large, bold, left-aligned to match reference designs */}
      <Text style={tc.title}>{exercise.label}</Text>

      {/* Exercise-specific illustration centred in the remaining space */}
      <View style={tc.illustrationWrap}>
        {Illustration ? <Illustration /> : null}
      </View>

      {/* → button — teal ghost square matching the reference images */}
      <TouchableOpacity
        style={tc.arrowBtn}
        onPress={onReady}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Start exercise"
      >
        <Text style={tc.arrowTxt}>{'→'}</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

// ── Illustration stylesheet (shared by the illustration sub-components) ────────
const ill = StyleSheet.create({
  // Phonation: green bars
  barsOuter: {
    borderWidth: 1.5,
    borderColor: '#48D28C',
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    height: 110,
  },
  bar: {
    width: 18,
    borderRadius: 4,
    backgroundColor: '#48D28C',
  },
});

// ── Card layout stylesheet ─────────────────────────────────────────────────────
const tc = StyleSheet.create({
  closeBtn: {
    marginLeft: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  closeTxt: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '400',
    includeFontPadding: false,
  },
  // Large left-aligned exercise name — matches the reference image typography
  title: {
    color: '#FFFFFF',
    fontSize: 56,
    fontWeight: '800',
    letterSpacing: 1.5,
    lineHeight: 64,
    marginTop: 16,
    marginHorizontal: 28,
  },
  illustrationWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Teal ghost square → button — same style as the arrow buttons in the exercises
  arrowBtn: {
    alignSelf: 'center',
    marginBottom: 56,
    width: 80,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowTxt: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '300',
    includeFontPadding: false,
  },
});
