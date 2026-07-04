import React, { useEffect } from 'react';
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
import { logScreenView } from '../../utils/analytics';

const { width: W } = Dimensions.get('window');
const SC = W / 402;

const TEAL_DARK  = '#1C4047';
const TEAL_MID   = '#2D6974';
const ORANGE     = '#FFA940';
const MINT       = '#C3DECE';
const WHITE      = '#FFFFFF';
const DIM        = 'rgba(255,255,255,0.60)';
const CARD_BG    = 'rgba(255,255,255,0.07)';
const CARD_BORD  = 'rgba(195,222,206,0.20)';

const STEPS = [
  {
    num: '1',
    title: 'Train daily',
    body: 'Each session takes 5–10 minutes. Eight exercises target voice power, pitch range, and speech clarity.',
    color: ORANGE,
  },
  {
    num: '2',
    title: 'Speak enhanced',
    body: 'Record anything you want to say. Eloqua cleans it up and plays it back in your own voice, clearer.',
    color: MINT,
  },
  {
    num: '3',
    title: 'Track progress',
    body: 'After every session your scores update. Check-ins every 7 sessions show how far your voice has come.',
    color: WHITE,
  },
];

export default function HowItWorksScreen({ navigation }) {
  const { top, bottom } = useSafeAreaInsets();

  useEffect(() => {
    const logExit = logScreenView('HowItWorks');
    return logExit;
  }, []);

  return (
    <LinearGradient colors={[TEAL_MID, TEAL_DARK]} style={s.root}>
      <StatusBar barStyle="light-content" />

      <View style={[s.inner, { paddingTop: top + 32, paddingBottom: bottom + 32 }]}>

        <View style={s.header}>
          <Text style={s.eyebrow}>HOW IT WORKS</Text>
          <Text style={s.title}>Three things,{'\n'}every day.</Text>
        </View>

        <View style={s.steps}>
          {STEPS.map((step) => (
            <View key={step.num} style={s.card}>
              <View style={[s.badge, { borderColor: step.color + '55', backgroundColor: step.color + '18' }]}>
                <Text style={[s.badgeNum, { color: step.color }]}>{step.num}</Text>
              </View>
              <View style={s.cardText}>
                <Text style={s.cardTitle}>{step.title}</Text>
                <Text style={s.cardBody}>{step.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={s.btn}
          onPress={() => navigation.navigate('VoiceCloningExplainer')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="One more thing"
        >
          <Text style={s.btnText}>One more thing  →</Text>
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
    paddingHorizontal: 28 * SC,
    gap: 28 * SC,
  },

  header: { gap: 10 * SC },
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
    lineHeight: 40,
    letterSpacing: 0.2,
  },

  steps: { gap: 14 * SC, flex: 1 },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 18 * SC,
    borderWidth: 1,
    borderColor: CARD_BORD,
    padding: 18 * SC,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16 * SC,
  },
  badge: {
    width: 40 * SC,
    height: 40 * SC,
    borderRadius: 20 * SC,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    flexShrink: 0,
  },
  badgeNum: { fontSize: 18, fontWeight: '800' },
  cardText: { flex: 1, gap: 5 * SC },
  cardTitle: { color: WHITE, fontSize: 17, fontWeight: '700' },
  cardBody:  { color: DIM,   fontSize: 16, lineHeight: 24 },

  btn: {
    backgroundColor: ORANGE,
    paddingVertical: 20,
    borderRadius: 28,
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
    alignItems: 'center',
  },
  btnText: {
    color: '#1A1A1A',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  skipLink: { alignSelf: 'center', paddingVertical: 4 },
  skipText: { color: 'rgba(255,255,255,0.60)', fontSize: 16 },
});
