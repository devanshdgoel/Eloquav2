import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
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
import { loginWithEmail, resetPassword } from '../../services/authService';
import { colors } from '../../theme';
import { isOnboardingComplete } from '../../utils/storage';
import { logScreenView } from '../../utils/analytics';

export default function SignInScreen({ navigation }) {
  useEffect(() => {
    const logExit = logScreenView('SignIn');
    return logExit;
  }, []);

  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const passwordRef = useRef(null);

  function handleForgotPassword() {
    const trimEmail = email.trim();
    if (!trimEmail) {
      Alert.alert('Enter your email', 'Type your email address above, then tap "Forgot password?".');
      return;
    }
    Alert.alert(
      'Reset password?',
      `We'll send a reset link to ${trimEmail}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send link',
          onPress: async () => {
            try {
              await resetPassword(trimEmail);
              Alert.alert('Email sent', 'Check your inbox for a password reset link.');
            } catch (error) {
              Alert.alert('Could not send email', error.message);
            }
          },
        },
      ]
    );
  }

  async function handleLogin() {
    const trimEmail    = email.trim();
    const trimPassword = password.trim();
    if (!trimEmail || !trimPassword) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await loginWithEmail(trimEmail, trimPassword);
      const onboarded = await isOnboardingComplete();
      if (onboarded) {
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      } else {
        navigation.replace('SetupPermissions');
      }
    } catch (error) {
      Alert.alert('Sign in failed', error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={colors.gradients.app} style={styles.container}>
      <StatusBar barStyle="light-content" />

      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
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
          {/* Brand header — logo + wordmark + tagline */}
          <View style={styles.brand}>
            <Image
              source={require('../../resources/Dolphin2.png')}
              style={styles.logoImg}
              resizeMode="contain"
              accessibilityLabel="Eloqua logo"
            />
            <Text style={styles.wordmark}>Eloqua</Text>
            <Text style={styles.tagline}>Voice training for Parkinson's</Text>
          </View>

          <Text style={styles.heading}>Welcome back</Text>

          {/* Email field */}
          <Text style={styles.fieldLabel}>Email address</Text>
          <View style={styles.inputCard}>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor="rgba(28,64,71,0.40)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
              accessibilityLabel="Email address"
            />
          </View>

          {/* Password field with show/hide toggle */}
          <Text style={styles.fieldLabel}>Password</Text>
          <View style={[styles.inputCard, styles.inputRow]}>
            <TextInput
              ref={passwordRef}
              style={[styles.input, styles.inputFlex]}
              placeholder="Enter your password"
              placeholderTextColor="rgba(28,64,71,0.40)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              accessibilityLabel="Password"
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword(v => !v)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>

          {/* Forgot password — right-aligned, below password field */}
          <TouchableOpacity
            style={styles.forgotLink}
            onPress={handleForgotPassword}
            accessibilityRole="button"
            accessibilityLabel="Forgot password"
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          {/* Primary CTA */}
          <TouchableOpacity
            style={[styles.signInBtn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            {loading
              ? <ActivityIndicator color="#1C4047" size="small" />
              : <Text style={styles.signInBtnText}>Sign In</Text>
            }
          </TouchableOpacity>

          {/* Create account link */}
          <View style={styles.switchRow}>
            <View style={styles.switchLine} />
          </View>
          <TouchableOpacity
            style={styles.createLink}
            onPress={() => navigation.navigate('SignUp')}
            accessibilityRole="button"
            accessibilityLabel="Create a new account"
          >
            <Text style={styles.createText}>
              New to Eloqua?{'  '}
              <Text style={styles.createTextBold}>Create an account</Text>
            </Text>
          </TouchableOpacity>

          {/* Privacy assurance — important for medical/health context */}
          <Text style={styles.privacyNote}>
            Your voice data is encrypted and never shared.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex:      { flex: 1 },

  backBtn: {
    position: 'absolute',
    top: 52, left: 20,
    width: 48, height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  backArrow: { color: '#FFFFFF', fontSize: 20, fontWeight: '400' },

  scroll: {
    paddingTop: 110,
    paddingHorizontal: 28,
    paddingBottom: 48,
  },

  // ── Brand header ─────────────────────────────────────────────────────────────
  brand: {
    alignItems: 'center',
    marginBottom: 36,
    gap: 6,
  },
  logoImg: {
    width: 52,
    height: 52,
    marginBottom: 4,
  },
  wordmark: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 1.0,
  },
  tagline: {
    color: '#C3DECE',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.3,
    opacity: 0.85,
  },

  heading: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 28,
  },

  // ── Input fields ─────────────────────────────────────────────────────────────
  fieldLabel: {
    color: '#C3DECE',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 2,
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(28,64,71,0.08)',
    shadowColor: 'rgba(0,0,0,0.25)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    paddingHorizontal: 18,
    paddingVertical: 17,
    fontSize: 17,
    color: '#1C4047',
  },
  inputFlex: { flex: 1 },
  eyeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 17,
    justifyContent: 'center',
  },
  eyeText: {
    color: '#2D6974',
    fontSize: 15,
    fontWeight: '600',
  },

  forgotLink: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    marginTop: -10,
    marginBottom: 28,
  },
  forgotText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 15,
    fontWeight: '500',
  },

  // ── CTA button ───────────────────────────────────────────────────────────────
  signInBtn: {
    backgroundColor: '#FFA940',
    borderRadius: 28,
    paddingVertical: 20,
    alignItems: 'center',
    shadowColor: '#FFA940',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.40,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 32,
  },
  btnDisabled:   { opacity: 0.55 },
  signInBtnText: { color: '#1A1A1A', fontSize: 18, fontWeight: '800', letterSpacing: 0.3 },

  // ── Switch to sign-up ─────────────────────────────────────────────────────────
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  switchLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  createLink:    { alignItems: 'center', paddingVertical: 4, marginBottom: 28 },
  createText:    { color: 'rgba(255,255,255,0.60)', fontSize: 16 },
  createTextBold:{ color: '#FFFFFF', fontWeight: '700' },

  // ── Privacy note ──────────────────────────────────────────────────────────────
  privacyNote: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});
