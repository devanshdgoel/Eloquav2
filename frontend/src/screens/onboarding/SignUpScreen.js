import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { registerWithEmail } from '../../services/authService';
import { logFunnelEvent } from '../../utils/analytics';

export default function SignUpScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

  async function handleRegister() {
    const trimEmail = email.trim();
    const trimPassword = password.trim();
    if (!name.trim() || !trimEmail || !trimPassword || !confirm.trim()) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (trimPassword !== confirm.trim()) {
      Alert.alert("Passwords don't match", 'Please make sure both passwords are the same.');
      return;
    }
    if (trimPassword.length < 8) {
      Alert.alert('Password too short', 'Password must be at least 8 characters.');
      return;
    }
    if (!agreed) {
      Alert.alert('Terms & Conditions', 'Please agree to the Terms of Service and Privacy Policy.');
      return;
    }
    setLoading(true);
    try {
      await registerWithEmail(trimEmail, trimPassword, name.trim());
      logFunnelEvent('signup_completed');
      navigation.replace('SetupPermissions');
    } catch (error) {
      Alert.alert('Registration failed', error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={['#326F77', '#1C4047']} style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Back button */}
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back">
        <Text style={styles.backArrow}>←</Text>
      </TouchableOpacity>

      {/* Decorative bubbles top-right */}
      <View style={[styles.bubble, { width: 69, height: 69, top: 111, right: 52 }]} />
      <View style={[styles.bubble, { width: 42, height: 42, top: 61, right: 16 }]} />
      <View style={[styles.bubble, { width: 42, height: 42, top: 10, right: 31 }]} />
      <View style={[styles.bubbleDot, { width: 16, height: 16, top: 52, right: 79 }]} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Create{'\n'}Account</Text>

          {/* Input fields */}
          <View style={styles.inputCard}>
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor="rgba(28,64,71,0.45)"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              blurOnSubmit={false}
              accessibilityLabel="Full name"
            />
          </View>

          <View style={styles.inputCard}>
            <TextInput
              ref={emailRef}
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="rgba(28,64,71,0.45)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
              accessibilityLabel="Email address"
            />
          </View>

          <View style={styles.inputCard}>
            <TextInput
              ref={passwordRef}
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="rgba(28,64,71,0.45)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
              blurOnSubmit={false}
              accessibilityLabel="Password"
            />
          </View>

          <View style={styles.inputCard}>
            <TextInput
              ref={confirmRef}
              style={styles.input}
              placeholder="Confirm password"
              placeholderTextColor="rgba(28,64,71,0.45)"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleRegister}
              accessibilityLabel="Confirm password"
            />
          </View>

          {/* T&Cs */}
          <View style={styles.tcsSection}>
            <Text style={styles.tcsLabel}>T&Cs</Text>
            <View style={styles.tcsLine} />
            <TouchableOpacity
              style={styles.tcsRow}
              onPress={() => setAgreed(!agreed)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Agree to terms and conditions"
            >
              <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                {agreed && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.tcsText}>
                By ticking this box, you agree to our{' '}
                <Text style={styles.tcsLink}>Terms of Service</Text>
                {' '}and{' '}
                <Text style={styles.tcsLink}>Privacy Policy</Text>
              </Text>
            </TouchableOpacity>
          </View>

          {/* Arrow button */}
          <TouchableOpacity
            style={[styles.arrowBtn, loading && styles.arrowBtnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Create account"
          >
            {loading
              ? <ActivityIndicator color="#1C4047" size="small" />
              : <Text style={styles.arrowText}>Create Account  →</Text>
            }
          </TouchableOpacity>

          {/* Sign in link */}
          <TouchableOpacity
            style={styles.signInLink}
            onPress={() => navigation.navigate('SignIn')}
            accessibilityRole="button"
            accessibilityLabel="Sign in to existing account"
          >
            <Text style={styles.signInText}>Already have an account? Sign In</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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

  bubble: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  bubbleDot: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  scroll: {
    paddingTop: 120,
    paddingHorizontal: 35,
    paddingBottom: 40,
  },

  title: {
    fontSize: 48,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 36,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 4,
  },

  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(28,64,71,0.10)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    marginBottom: 14,
  },
  input: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 18,
    color: '#1C4047',
  },

  tcsSection: {
    marginTop: 8,
    marginBottom: 24,
  },
  tcsLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  tcsLine: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginBottom: 14,
  },
  tcsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#68B39F',
    borderColor: '#68B39F',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  tcsText: {
    flex: 1,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    lineHeight: 24,
  },
  tcsLink: {
    fontWeight: '700',
    color: '#FFFFFF',
  },

  arrowBtn: {
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
    marginBottom: 20,
  },
  arrowBtnDisabled: {
    opacity: 0.6,
  },
  arrowText: {
    color: '#1A1A1A',
    fontSize: 18,
    fontWeight: '800',
  },

  signInLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  signInText: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 17,
  },
});
