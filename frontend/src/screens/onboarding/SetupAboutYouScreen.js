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
import { colors, typography, spacing, borderRadius } from '../../theme';

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

          <Text style={styles.fieldLabel}>What should we call you?</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Your first name"
            placeholderTextColor="#666680"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
            returnKeyType="done"
            accessibilityLabel="Enter your first name"
          />

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
                accessibilityRole="button"
                accessibilityLabel={condition.label}
                accessibilityState={{ selected: selectedCondition === condition.id }}
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
                accessibilityRole="button"
                accessibilityLabel={goal.label}
                accessibilityState={{ selected: selectedGoals.includes(goal.id) }}
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
          accessibilityRole="button"
          accessibilityLabel="Continue to voice setup"
          accessibilityState={{ disabled: !canContinue }}
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
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  progressContainer: {
    paddingTop: 60,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
  },
  progressText: {
    color: colors.textSecondary,
    ...typography.bodySmall,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  sectionLabel: {
    color: colors.primary,
    ...typography.caption,
    marginBottom: 12,
  },
  heading: {
    ...typography.heading,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  description: {
    ...typography.subheading,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  fieldLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: '600',
    marginBottom: 12,
    marginTop: spacing.sm,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: 20,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
    marginBottom: 28,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 28,
  },
  optionChip: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceHighlight,
  },
  optionChipText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  optionChipTextSelected: {
    color: colors.textPrimary,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  continueButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    paddingVertical: 18,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.4,
  },
  continueButtonText: {
    ...typography.button,
    color: colors.white,
  },
});
