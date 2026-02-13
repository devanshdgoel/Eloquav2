import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { saveUserProfile } from '../../utils/storage';

const CONDITIONS = [
  { id: 'parkinsons', label: "Parkinson's Disease" },
  { id: 'als', label: 'ALS / Motor Neuron Disease' },
  { id: 'ms', label: 'Multiple Sclerosis' },
  { id: 'stroke', label: 'Stroke Recovery' },
  { id: 'tbi', label: 'Traumatic Brain Injury' },
  { id: 'other', label: 'Other' },
];

const GOALS = [
  { id: 'clarity', label: 'Improve speech clarity' },
  { id: 'volume', label: 'Speak louder and stronger' },
  { id: 'pace', label: 'Control speaking pace' },
  { id: 'confidence', label: 'Build speaking confidence' },
];

export default function SetupAboutYouScreen({ navigation }) {
  const [displayName, setDisplayName] = useState('');
  const [selectedCondition, setSelectedCondition] = useState(null);
  const [selectedGoals, setSelectedGoals] = useState([]);

  function toggleGoal(goalId) {
    setSelectedGoals(prev =>
      prev.includes(goalId)
        ? prev.filter(g => g !== goalId)
        : [...prev, goalId]
    );
  }

  const canContinue = displayName.trim().length > 0 && selectedCondition && selectedGoals.length > 0;

  async function handleContinue() {
    const profile = {
      displayName: displayName.trim(),
      condition: selectedCondition,
      goals: selectedGoals,
    };
    await saveUserProfile(profile);
    navigation.navigate('SetupVoice');
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Progress */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: '66%' }]} />
        </View>
        <Text style={styles.progressText}>Step 2 of 3</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>ABOUT YOU</Text>
          <Text style={styles.heading}>Tell us about yourself</Text>
          <Text style={styles.description}>
            This helps us personalize your experience and training exercises.
          </Text>

          {/* Name */}
          <Text style={styles.fieldLabel}>What should we call you?</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Your first name"
            placeholderTextColor="#666680"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
            returnKeyType="done"
          />

          {/* Condition */}
          <Text style={styles.fieldLabel}>What condition are you working with?</Text>
          <View style={styles.optionsGrid}>
            {CONDITIONS.map(condition => (
              <TouchableOpacity
                key={condition.id}
                style={[
                  styles.optionChip,
                  selectedCondition === condition.id && styles.optionChipSelected,
                ]}
                onPress={() => setSelectedCondition(condition.id)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.optionChipText,
                    selectedCondition === condition.id && styles.optionChipTextSelected,
                  ]}
                >
                  {condition.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Goals */}
          <Text style={styles.fieldLabel}>What are your goals? (select all that apply)</Text>
          <View style={styles.optionsGrid}>
            {GOALS.map(goal => (
              <TouchableOpacity
                key={goal.id}
                style={[
                  styles.optionChip,
                  selectedGoals.includes(goal.id) && styles.optionChipSelected,
                ]}
                onPress={() => toggleGoal(goal.id)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.optionChipText,
                    selectedGoals.includes(goal.id) && styles.optionChipTextSelected,
                  ]}
                >
                  {goal.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A2E',
  },
  flex: {
    flex: 1,
  },
  progressContainer: {
    paddingTop: 60,
    paddingHorizontal: 32,
    paddingBottom: 16,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#2A2A4A',
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6C63FF',
    borderRadius: 2,
  },
  progressText: {
    color: '#A0A0B8',
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 24,
  },
  sectionLabel: {
    color: '#6C63FF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 12,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#A0A0B8',
    lineHeight: 24,
    marginBottom: 32,
  },
  fieldLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    marginTop: 8,
  },
  textInput: {
    backgroundColor: '#2A2A4A',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 28,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 28,
  },
  optionChip: {
    backgroundColor: '#2A2A4A',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionChipSelected: {
    borderColor: '#6C63FF',
    backgroundColor: '#2A2A5A',
  },
  optionChipText: {
    color: '#A0A0B8',
    fontSize: 15,
    fontWeight: '500',
  },
  optionChipTextSelected: {
    color: '#FFFFFF',
  },
  footer: {
    paddingHorizontal: 32,
    paddingBottom: 48,
  },
  continueButton: {
    backgroundColor: '#6C63FF',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.4,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
