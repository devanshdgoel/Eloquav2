import React, { useState } from 'react';
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
import { saveUserProfile } from '../../utils/storage';

const AGE_RANGES = [
  'Under 18', '18–24', '25–34', '35–44', '45–54', '55–64', '65–74', '75+',
];

export default function SetupAboutYouScreen({ navigation }) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [ageModalVisible, setAgeModalVisible] = useState(false);

  async function handleNext() {
    // Trim whitespace before persisting so stored values are always clean.
    await saveUserProfile({ name: name.trim(), age });
    navigation.navigate('SetupVoice');
  }

  const canProceed = name.trim().length > 0;

  return (
    <LinearGradient colors={['#E0ECDE', '#9FCFBD']} style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Back button — absolute so it stays visible above the scroll */}
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
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
          <Text style={styles.title}>About you</Text>

          {/* Preferred Name */}
          <Text style={styles.label}>Preferred Name:</Text>
          <View style={styles.inputCard}>
            <TextInput
              style={styles.input}
              placeholder="Name/Nickname"
              placeholderTextColor="rgba(28,64,71,0.4)"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="done"
              accessibilityLabel="Preferred name"
            />
          </View>

          {/* Age */}
          <Text style={styles.label}>How old are you?</Text>
          <TouchableOpacity
            style={styles.selectCard}
            onPress={() => setAgeModalVisible(true)}
            activeOpacity={0.85}
            accessibilityLabel="Select age range"
            accessibilityRole="button"
          >
            <Text style={[styles.selectText, !age && styles.selectPlaceholder]}>
              {age || 'Select'}
            </Text>
            <Text style={styles.chevron}>⌄</Text>
          </TouchableOpacity>

          {/* Progress dots */}
          <View style={styles.dotsRow}>
            <View style={styles.dotActive} />
            <View style={styles.dotInactive} />
            <View style={styles.dotInactive} />
          </View>

          {/* Orange → button */}
          <TouchableOpacity
            style={[styles.nextBtn, !canProceed && styles.nextBtnDisabled]}
            onPress={handleNext}
            disabled={!canProceed}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Continue"
          >
            <Text style={styles.nextArrow}>→</Text>
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
            <TouchableOpacity style={styles.modalCancel} onPress={() => setAgeModalVisible(false)}>
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
    backgroundColor: '#1C4047',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    zIndex: 10,
  },
  backArrow: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },

  scroll: {
    paddingTop: 130,
    paddingHorizontal: 32,
    paddingBottom: 48,
  },

  title: {
    fontSize: 40,
    fontWeight: '700',
    color: '#1C4047',
    letterSpacing: 1,
    marginBottom: 32,
  },

  label: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C4047',
    marginBottom: 10,
    letterSpacing: 0.3,
  },

  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
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
    borderRadius: 10,
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
    alignSelf: 'flex-start',
    minWidth: 160,
    marginBottom: 40,
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
    fontSize: 22,
    color: '#FFA940',
    fontWeight: '700',
    marginTop: -4,
  },

  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  dotActive: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#1C4047',
  },
  dotInactive: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#1C4047',
  },

  nextBtn: {
    alignSelf: 'center',
    backgroundColor: '#FFA940',
    width: 72,
    height: 72,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFA940',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  nextBtnDisabled: {
    opacity: 0.45,
  },
  nextArrow: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
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
    fontSize: 16,
    color: '#888',
  },
});
