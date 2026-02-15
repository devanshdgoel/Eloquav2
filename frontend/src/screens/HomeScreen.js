import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, typography, spacing, borderRadius } from '../theme';

export default function HomeScreen() {
  const { signOut } = useAuth();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.greeting}>Welcome to Eloqua</Text>
        <TouchableOpacity
          onPress={signOut}
          style={styles.signOutButton}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Speech Enhancement"
          accessibilityHint="Record your speech and get an AI-enhanced version"
        >
          <Text style={styles.cardIcon}>🎙️</Text>
          <Text style={styles.cardTitle}>Speech Enhancement</Text>
          <Text style={styles.cardDescription}>
            Record your speech and get an AI-enhanced version with improved clarity.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Vocal Training"
          accessibilityHint="Practice exercises to strengthen your voice"
        >
          <Text style={styles.cardIcon}>🗣️</Text>
          <Text style={styles.cardTitle}>Vocal Training</Text>
          <Text style={styles.cardDescription}>
            Practice exercises designed to strengthen your voice over time.
          </Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  signOutButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  signOutText: {
    color: colors.textSecondary,
    ...typography.bodySmall,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
  },
  cardIcon: {
    fontSize: 40,
    marginBottom: spacing.md,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  cardDescription: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
});
