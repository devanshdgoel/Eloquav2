import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';

/**
 * Loudness Drills — practise producing speech at a target volume level.
 * Addresses hypophonia (reduced loudness), the most common and disabling
 * speech symptom in Parkinson's disease.
 *
 * This is a placeholder screen. The full exercise will include:
 *   - Real-time dB meter via microphone
 *   - Target volume band (visual zone the user must hit and sustain)
 *   - Prompted phrases at increasing difficulty
 */
export default function LoudnessDrillsExercise({ onComplete, onExit }) {
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.exitBtn} onPress={onExit}>
          <Text style={styles.exitText}>X</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Loudness Drills</Text>
        <View style={styles.spacer} />
      </View>

      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>L</Text>
        </View>
        <Text style={styles.title}>Loudness Drills</Text>
        <Text style={styles.description}>
          Read aloud at a louder volume than feels natural. Parkinson's often
          causes people to underestimate how quiet they sound — these drills
          recalibrate that awareness and rebuild vocal projection.
        </Text>
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonText}>Full exercise coming soon</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.continueBtn} onPress={onComplete} activeOpacity={0.85}>
          <Text style={styles.continueBtnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7FAF8' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#2D6974',
  },
  exitBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  exitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  headerTitle: {
    flex: 1, textAlign: 'center', color: '#FFFFFF',
    fontSize: 18, fontWeight: '700', letterSpacing: 0.5,
  },
  spacer: { width: 38 },
  body: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 36, gap: 20,
  },
  iconCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#3D7B85',
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  iconText: { color: '#FFFFFF', fontSize: 42, fontWeight: '800' },
  title: {
    fontSize: 26, fontWeight: '800', color: '#1C4047',
    textAlign: 'center', letterSpacing: 0.3,
  },
  description: {
    fontSize: 16, color: '#2D6974', textAlign: 'center',
    lineHeight: 24, letterSpacing: 0.2,
  },
  comingSoon: {
    borderWidth: 1.5, borderColor: 'rgba(44,105,116,0.3)',
    borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8,
  },
  comingSoonText: { fontSize: 13, color: '#2D6974', letterSpacing: 0.5 },
  footer: { paddingHorizontal: 28, paddingBottom: 32, paddingTop: 12 },
  continueBtn: {
    backgroundColor: '#1C4047', borderRadius: 16,
    paddingVertical: 18, alignItems: 'center',
  },
  continueBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});
