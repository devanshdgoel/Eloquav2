import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logScreenView } from '../../utils/analytics';
import { colors } from '../../theme';
import ScreenHeader from '../../components/ScreenHeader';
import SpeakerButton from '../../components/SpeakerButton';

const { width: W } = Dimensions.get('window');
const SC = W / 402;

// Background gradient is now sourced from colors.gradients.app (imported above).
const ORANGE     = '#FFA940';
const WHITE      = '#FFFFFF';
const DIM        = 'rgba(255,255,255,0.60)';

// Main body text concatenated for the SpeakerButton so users can hear the
// full content of this screen read aloud in one tap.
const BODY_TEXT =
  "Parkinson's changes how you speak. " +
  "Voices can become quieter, faster, and harder to understand over time. " +
  "Eloqua gives you a daily voice workout — just a few minutes — to keep your speech clear and strong. " +
  "The exercises are based on LSVT LOUD therapy principles, adapted for everyday use on your phone.";

export default function WhatIsEloquaScreen({ navigation }) {
  const { top, bottom } = useSafeAreaInsets();

  useEffect(() => {
    const logExit = logScreenView('WhatIsEloqua');
    return logExit;
  }, []);

  // Canonical app gradient — dark teal background for this onboarding screen.
  // ScreenHeader handles the top safe area inset internally, so paddingTop
  // on the inner View is reduced from top+40 to just 8.
  return (
    <LinearGradient colors={colors.gradients.app} style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Header now rendered by shared ScreenHeader component */}
      <ScreenHeader
        navigation={navigation}
        title="About Eloqua"
        rightAction={<SpeakerButton text={BODY_TEXT} />}
      />

      <View style={[s.inner, { paddingTop: 8, paddingBottom: bottom + 32 }]}>

        <Image
          source={require('../../../assets/images/Dolphin2.png')}
          style={s.dolphinImage}
          resizeMode="contain"
          accessibilityLabel="Eloqua dolphin mascot"
        />

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
          accessibilityRole="button"
          accessibilityLabel="How it works"
        >
          <Text style={s.btnText}>How it works  →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.skipLink}
          onPress={() => navigation.navigate('VoiceCloningExplainer')}
          accessibilityRole="button"
          accessibilityLabel="Skip intro"
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

  dolphinImage: {
    width: 180 * SC,
    height: 120 * SC,
  },

  textBlock: { gap: 16 * SC, alignItems: 'center' },

  eyebrow: {
    color: ORANGE,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2.5,
  },
  title: {
    color: WHITE,
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 40,
    letterSpacing: 0.2,
  },
  body: {
    color: DIM,
    fontSize: 16,
    lineHeight: 26,
    textAlign: 'center',
  },

  btn: {
    backgroundColor: ORANGE,
    paddingHorizontal: 40 * SC,
    paddingVertical: 20,
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
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  skipLink: { paddingVertical: 8 },
  skipText: { color: 'rgba(255,255,255,0.60)', fontSize: 16 },
});
