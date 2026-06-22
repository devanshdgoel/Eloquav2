import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: W } = Dimensions.get('window');
const SC = W / 402;

const TEAL_DARK  = '#1C4047';
const TEAL_MID   = '#326F77';
const ORANGE     = '#FFA940';
const MINT       = '#C3DECE';
const WHITE      = '#FFFFFF';
const DIM        = 'rgba(255,255,255,0.60)';
const CARD_BG    = 'rgba(255,255,255,0.07)';
const CARD_BORD  = 'rgba(195,222,206,0.20)';

const POINTS = [
  {
    icon: '🎙',
    title: 'Why we record your voice',
    body: "During setup, you'll read two short passages aloud. We use those recordings to create a personalised voice model — so the Speech Enhancement feature plays back in a voice that sounds like yours.",
  },
  {
    icon: '🔒',
    title: 'How your voice is stored',
    body: 'Your voice model is processed by ElevenLabs, a voice AI service. Recordings are deleted from our server immediately after processing. ElevenLabs stores only the voice model, not your original audio.',
  },
  {
    icon: '🗑',
    title: 'You are always in control',
    body: 'You can delete your voice model at any time from Settings. Deleting your account removes it permanently from all systems.',
  },
];

export default function VoiceCloningExplainerScreen({ navigation }) {
  const { top, bottom } = useSafeAreaInsets();

  return (
    <LinearGradient colors={[TEAL_MID, TEAL_DARK]} style={s.root}>
      <StatusBar barStyle="light-content" />

      <View style={[s.inner, { paddingTop: top + 32, paddingBottom: bottom + 32 }]}>

        <View style={s.header}>
          <Text style={s.eyebrow}>YOUR VOICE & PRIVACY</Text>
          <Text style={s.title}>Your voice stays{'\n'}your voice.</Text>
          <Text style={s.subtitle}>
            Here is what happens to your recordings and why.
          </Text>
        </View>

        <View style={s.points}>
          {POINTS.map((p) => (
            <View key={p.icon} style={s.card}>
              <Text style={s.cardIcon}>{p.icon}</Text>
              <View style={s.cardText}>
                <Text style={s.cardTitle}>{p.title}</Text>
                <Text style={s.cardBody}>{p.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={s.privacyLink}
          onPress={() => Linking.openURL('https://eloqua.app/privacy')}
          accessibilityRole="link"
          accessibilityLabel="Read our full Privacy Policy"
        >
          <Text style={s.privacyText}>Read our full Privacy Policy →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.btn}
          onPress={() => navigation.navigate('SetupPermissions')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="I understand, let's begin"
        >
          <Text style={s.btnText}>I understand, let's begin</Text>
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
    gap: 24 * SC,
    justifyContent: 'space-between',
  },

  header: { gap: 10 * SC },
  eyebrow: {
    color: ORANGE,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.5,
  },
  title: {
    color: WHITE,
    fontSize: 30 * SC,
    fontWeight: '800',
    lineHeight: 38 * SC,
    letterSpacing: 0.2,
  },
  subtitle: {
    color: DIM,
    fontSize: 16,
    lineHeight: 24,
  },

  points: { gap: 12 * SC },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16 * SC,
    borderWidth: 1,
    borderColor: CARD_BORD,
    padding: 16 * SC,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14 * SC,
  },
  cardIcon: { fontSize: 24 * SC, width: 30 * SC, textAlign: 'center', flexShrink: 0 },
  cardText: { flex: 1, gap: 5 * SC },
  cardTitle: { color: WHITE, fontSize: 16, fontWeight: '700' },
  cardBody:  { color: DIM,   fontSize: 16, lineHeight: 24 },

  privacyLink: { alignSelf: 'flex-start', paddingVertical: 2 },
  privacyText: { color: MINT, fontSize: 16, fontWeight: '600' },

  btn: {
    backgroundColor: ORANGE,
    paddingVertical: 18,
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
    fontSize: 17 * SC,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
