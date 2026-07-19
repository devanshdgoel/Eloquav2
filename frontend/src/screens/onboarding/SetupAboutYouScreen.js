import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Modal,
  FlatList,
  SafeAreaView,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { auth } from '../../config/firebase';
import { saveUserProfileToFirestore } from '../../services/userService';
import { saveUserProfile, setOnboardingComplete } from '../../utils/storage';
import { logFunnelEvent, logScreenView } from '../../utils/analytics';
import { useLargeText } from '../../context/PrefsContext';

const AGE_RANGES = [
  'Under 18', '18–24', '25–34', '35–44', '45–54', '55–64', '65–74', '75+',
];

export default function SetupAboutYouScreen({ navigation }) {
  const largeText = useLargeText();
  const fs = (n) => largeText ? Math.round(n * 1.25) : n;

  useEffect(() => {
    const logExit = logScreenView('SetupAboutYou');
    return logExit;
  }, []);

  // Pre-fill name from Firebase auth so the user doesn't have to type it again.
  const [name, setName]                 = useState(auth.currentUser?.displayName ?? '');
  const [age, setAge]                   = useState('');
  const [ageModalVisible, setAgeModalVisible] = useState(false);

  async function handleNext() {
    const trimmedName = name.trim();

    await saveUserProfile({ name: trimmedName, age });

    try {
      await saveUserProfileToFirestore({ name: trimmedName, age });
    } catch (err) {
      console.warn('Failed to save profile to Firestore:', err.message);
    }

    await setOnboardingComplete();
    logFunnelEvent('about_you_completed');
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  }

  const canProceed = name.trim().length > 0;

  return (
    <LinearGradient colors={['#326F77', '#1C4047']} style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Back button — absolute so it stays visible above the scroll */}
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back">
        <Text style={styles.backArrow}>←</Text>
      </TouchableOpacity>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.title, { fontSize: fs(40) }]}>About you</Text>
          <Text style={[styles.subtitle, { fontSize: fs(18) }]}>A couple of quick details to get started.</Text>

          <Text style={[styles.label, { fontSize: fs(20) }]}>Your name</Text>
          <View style={styles.inputCard}>
            <TextInput
              style={styles.input}
              placeholder="Name or nickname"
              placeholderTextColor="rgba(28,64,71,0.4)"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="done"
              accessibilityLabel="Preferred name"
            />
          </View>

          <Text style={[styles.label, { fontSize: fs(20) }]}>Age <Text style={[styles.optional, { fontSize: fs(16) }]}>(optional)</Text></Text>
          <TouchableOpacity
            style={styles.selectCard}
            onPress={() => setAgeModalVisible(true)}
            activeOpacity={0.85}
            accessibilityLabel="Select age range"
            accessibilityRole="button"
          >
            <Text style={[styles.selectText, !age && styles.selectPlaceholder]}>
              {age || 'Select age range'}
            </Text>
            <Text style={styles.chevron}>▾</Text>
          </TouchableOpacity>

          {/* Continue button */}
          <TouchableOpacity
            style={[styles.nextBtn, !canProceed && styles.nextBtnDisabled]}
            onPress={handleNext}
            disabled={!canProceed}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Continue"
          >
            <Text style={[styles.nextArrow, { fontSize: fs(18) }]}>Continue  →</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Age picker modal */}
      <Modal visible={ageModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <SafeAreaView style={styles.modalSheet}>
            <Text style={styles.modalTitle}>How old are you?</Text>
            <FlatList
              data={AGE_RANGES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setAge(item);
                    setAgeModalVisible(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={item}
                >
                  <Text style={[styles.modalItemText, age === item && styles.modalItemSelected]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.modalCancel} onPress={() => setAgeModalVisible(false)} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },

  backBtn: {
    position: 'absolute',
    top: 52,
    left: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  backArrow: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '500',
  },

  scroll: {
    paddingTop: 130,
    paddingHorizontal: 32,
    paddingBottom: 48,
  },

  title: {
    fontSize: 40,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.60)',
    marginBottom: 36,
    lineHeight: 26,
    letterSpacing: 0.2,
  },

  label: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 10,
    letterSpacing: 0.3,
  },

  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(28,64,71,0.10)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 28,
  },
  input: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 18,
    color: '#1C4047',
  },

  selectCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(28,64,71,0.10)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  optional: {
    fontSize: 16,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.55)',
  },
  selectText: {
    fontSize: 18,
    color: '#1C4047',
    marginRight: 12,
  },
  selectPlaceholder: {
    color: 'rgba(28,64,71,0.4)',
  },
  chevron: {
    fontSize: 18,
    color: '#FFA940',
    fontWeight: '700',
  },

  nextBtn: {
    alignSelf: 'stretch',
    backgroundColor: '#FFA940',
    borderRadius: 28,
    paddingVertical: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFA940',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  nextBtnDisabled: {
    opacity: 0.45,
  },
  nextArrow: {
    color: '#1C4047',
    fontSize: 18,
    fontWeight: '800',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C4047',
    textAlign: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(28,64,71,0.1)',
  },
  modalItem: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  modalItemText: {
    fontSize: 18,
    color: '#1C4047',
  },
  modalItemSelected: {
    fontWeight: '700',
    color: '#326F77',
  },
  modalCancel: {
    padding: 20,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 18,
    color: '#888',
  },
});
