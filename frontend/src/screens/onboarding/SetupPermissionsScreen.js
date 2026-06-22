import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Linking,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';

const TEAL_DARK = '#1C4047';
const TEAL_MID  = '#2D6974';
const ORANGE    = '#FFA940';
const WHITE     = '#FFFFFF';
const DIM       = 'rgba(255,255,255,0.60)';
const CARD_BG   = 'rgba(255,255,255,0.07)';
const CARD_BORD = 'rgba(195,222,206,0.18)';

const WHY_POINTS = [
  {
    icon: '🎤',
    title: 'Voice exercises',
    body: 'Records short sounds to measure your loudness, pitch, and clarity.',
  },
  {
    icon: '🔊',
    title: 'Speech enhancement',
    body: 'Records your speech, cleans it up, and plays it back.',
  },
];

export default function SetupPermissionsScreen({ navigation }) {
  const { top, bottom } = useSafeAreaInsets();

  function handleBack() {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }

  async function handleAllow() {
    const { status } = await Audio.requestPermissionsAsync();
    if (status === 'granted') {
      navigation.navigate('SetupAboutYou');
    } else {
      Alert.alert(
        'Microphone access needed',
        'Eloqua cannot run voice exercises or speech enhancement without the microphone. You can enable it in Settings at any time.',
        [
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
          { text: 'Not now', style: 'cancel' },
        ],
      );
    }
  }

  return (
    <LinearGradient colors={[TEAL_MID, TEAL_DARK]} style={s.root}>
      <StatusBar barStyle="light-content" />

      <View style={[s.inner, { paddingTop: top + 32, paddingBottom: bottom + 32 }]}>

        <TouchableOpacity
          style={s.backBtn}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={s.backBtnText}>←</Text>
        </TouchableOpacity>

        <View style={s.header}>
          <Text style={s.title}>Microphone{'\n'}access</Text>
          <Text style={s.subtitle}>Here is exactly why Eloqua needs it.</Text>
        </View>

        <View style={s.cards}>
          {WHY_POINTS.map((p) => (
            <View key={p.icon} style={s.card}>
              <Text style={s.cardIcon}>{p.icon}</Text>
              <View style={s.cardText}>
                <Text style={s.cardTitle}>{p.title}</Text>
                <Text style={s.cardBody}>{p.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={s.note}>
          <Text style={s.noteText}>Audio processed securely. Never shared.</Text>
        </View>

        <TouchableOpacity style={s.btn} onPress={handleAllow} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Allow microphone access">
          <Text style={s.btnText}>Allow microphone  →</Text>
        </TouchableOpacity>

      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  root:  { flex: 1 },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    gap: 24,
    justifyContent: 'space-between',
  },

  backBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  backBtnText: {
    color: WHITE,
    fontSize: 20,
    fontWeight: '500',
  },

  header: { gap: 10 },
  title: {
    color: WHITE,
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 42,
    letterSpacing: 0.2,
  },
  subtitle: {
    color: DIM,
    fontSize: 17,
    lineHeight: 24,
  },

  cards: { gap: 14 },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORD,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  cardIcon: { fontSize: 26, width: 32, textAlign: 'center', flexShrink: 0 },
  cardText: { flex: 1, gap: 6 },
  cardTitle: { color: WHITE, fontSize: 18, fontWeight: '700' },
  cardBody:  { color: DIM,   fontSize: 16, lineHeight: 23 },

  note: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
  },
  noteText: {
    color: DIM,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },

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
});
