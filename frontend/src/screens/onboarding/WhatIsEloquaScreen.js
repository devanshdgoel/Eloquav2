import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: W } = Dimensions.get('window');
const SC = W / 402;

const TEAL_DARK  = '#1C4047';
const TEAL_MID   = '#326F77';
const ORANGE     = '#FFA940';
const WHITE      = '#FFFFFF';
const DIM        = 'rgba(255,255,255,0.60)';

export default function WhatIsEloquaScreen({ navigation }) {
  const { top, bottom } = useSafeAreaInsets();

  return (
    <LinearGradient colors={[TEAL_MID, TEAL_DARK]} style={s.root}>
      <StatusBar barStyle="light-content" />

      <View style={[s.inner, { paddingTop: top + 40, paddingBottom: bottom + 32 }]}>

        {/* Illustration placeholder — dolphin + waves */}
        <View style={s.illustration}>
          <Text style={s.dolphin}>🐬</Text>
        </View>

        <View style={s.textBlock}>
          <Text style={s.eyebrow}>ABOUT ELOQUA</Text>
          <Text style={s.title}>Parkinson's changes{'\n'}how you speak.</Text>
          <Text style={s.body}>
            Voices can become quieter, faster, and harder to understand over time.
            Eloqua gives you a daily voice workout — just a few minutes — to keep
            your speech clear and strong.
          </Text>
          <Text style={s.body}>
            The exercises are based on LSVT LOUD therapy principles, adapted for
            everyday use on your phone.
          </Text>
        </View>

        <TouchableOpacity
          style={s.btn}
          onPress={() => navigation.navigate('HowItWorks')}
          activeOpacity={0.85}
        >
          <Text style={s.btnText}>How it works  →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.skipLink}
          onPress={() => navigation.navigate('VoiceCloningExplainer')}
        >
          <Text style={s.skipText}>Skip intro</Text>
        </TouchableOpacity>

      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  root:  { flex: 1 },
  inner: {
    flex: 1,
    paddingHorizontal: 32 * SC,
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  illustration: {
    width: 140 * SC,
    height: 140 * SC,
    borderRadius: 70 * SC,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  dolphin: { fontSize: 64 * SC },

  textBlock: { gap: 16 * SC, alignItems: 'center' },

  eyebrow: {
    color: ORANGE,
    fontSize: 11 * SC,
    fontWeight: '700',
    letterSpacing: 2.5,
  },
  title: {
    color: WHITE,
    fontSize: 32 * SC,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 40 * SC,
    letterSpacing: 0.2,
  },
  body: {
    color: DIM,
    fontSize: 16 * SC,
    lineHeight: 24 * SC,
    textAlign: 'center',
  },

  btn: {
    backgroundColor: ORANGE,
    paddingHorizontal: 40 * SC,
    paddingVertical: 18,
    borderRadius: 28,
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  btnText: {
    color: '#1A1A1A',
    fontSize: 17 * SC,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  skipLink: { paddingVertical: 8 },
  skipText: { color: 'rgba(255,255,255,0.38)', fontSize: 14 * SC },
});
