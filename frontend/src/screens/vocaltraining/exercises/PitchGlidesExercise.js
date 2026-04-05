import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';

/**
 * Pitch Glides — slide your voice smoothly from low to high and back down.
 * Targets pitch range and vocal flexibility, which are commonly reduced in
 * Parkinson's (monotone speech).
 *
 * This is a placeholder screen. The full exercise will include:
 *   - Real-time pitch detection via microphone
 *   - A visual glide track showing target vs. actual pitch
 *   - Difficulty scaling (narrower to wider pitch range)
 */
export default function PitchGlidesExercise({ onComplete, onExit }) {
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.exitBtn} onPress={onExit}>
          <Text style={styles.exitText}>X</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pitch Glides</Text>
        <View style={styles.spacer} />
      </View>

      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>P</Text>
        </View>
        <Text style={styles.title}>Pitch Glides</Text>
        <Text style={styles.description}>
          Slide your voice smoothly from a low note all the way up to a high note,
          then glide back down. This restores pitch range and breaks up the flat,
          monotone pattern common in Parkinson's.
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
    backgroundColor: '#326F77',
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
