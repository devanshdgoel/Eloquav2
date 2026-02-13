import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function HomeScreen() {
  const { signOut } = useAuth();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.greeting}>Welcome to Eloqua</Text>
        <TouchableOpacity onPress={signOut} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <TouchableOpacity style={styles.card} activeOpacity={0.8}>
          <Text style={styles.cardIcon}>🎙️</Text>
          <Text style={styles.cardTitle}>Speech Enhancement</Text>
          <Text style={styles.cardDescription}>
            Record your speech and get an AI-enhanced version with improved clarity.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} activeOpacity={0.8}>
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
    backgroundColor: '#1A1A2E',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  signOutButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#2A2A4A',
  },
  signOutText: {
    color: '#A0A0B8',
    fontSize: 14,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    gap: 16,
  },
  card: {
    backgroundColor: '#2A2A4A',
    borderRadius: 20,
    padding: 24,
  },
  cardIcon: {
    fontSize: 40,
    marginBottom: 16,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardDescription: {
    color: '#A0A0B8',
    fontSize: 15,
    lineHeight: 22,
  },
});
