import React, { useState, useRef, useEffect } from 'react';
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
import { loginWithEmail, resetPassword } from '../../services/authService';
import { colors } from '../../theme';
import { isOnboardingComplete } from '../../utils/storage';
import { logScreenView } from '../../utils/analytics';

export default function SignInScreen({ navigation }) {
  useEffect(() => {
    const logExit = logScreenView('SignIn');
    return logExit;
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
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
              setResetSent(true);
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
    const trimEmail = email.trim();
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
    {/* Canonical app gradient — dark teal background for the auth screen. */}
    <LinearGradient colors={colors.gradients.app} style={styles.container}>
      <StatusBar barStyle="light-content" />

      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back">
        <Text style={styles.backArrow}>←</Text>
      </TouchableOpacity>

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
          <Text style={styles.title}>Sign In</Text>

          <View style={styles.inputCard}>
            <TextInput
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
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              accessibilityLabel="Password"
            />
          </View>

          <TouchableOpacity
            style={[styles.arrowBtn, loading && styles.arrowBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            {loading
              ? <ActivityIndicator color="#1C4047" size="small" />
              : <Text style={styles.arrowText}>Sign In  →</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.forgotLink} onPress={handleForgotPassword} accessibilityRole="button" accessibilityLabel="Forgot password">
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          <Text style={styles.orText}>or</Text>

          <TouchableOpacity
            style={styles.socialCard}
            activeOpacity={0.85}
            onPress={() => Alert.alert('Coming soon', 'Apple Sign-In will be available in a future update.')}
            accessibilityRole="button"
            accessibilityLabel="Continue with Apple"
          >
            <Text style={styles.appleIcon}>{'\uF8FF'}</Text>
            <Text style={styles.socialText}>Continue with Apple</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.socialCard}
            activeOpacity={0.85}
            onPress={() => Alert.alert('Coming soon', 'Google Sign-In will be available in a future update.')}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
          >
            <Text style={styles.googleIcon}>G</Text>
            <Text style={styles.socialText}>Continue with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.createLink}
            onPress={() => navigation.navigate('SignUp')}
            accessibilityRole="button"
            accessibilityLabel="Create a new account"
          >
            <Text style={styles.createText}>Don't have an account? Create one</Text>
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
  backArrow: { color: '#FFFFFF', fontSize: 20, fontWeight: '500' },

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
    paddingTop: 130,
    paddingHorizontal: 35,
    paddingBottom: 40,
    alignItems: 'center',
  },

  title: {
    fontSize: 48,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 36,
    alignSelf: 'stretch',
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
    alignSelf: 'stretch',
  },
  input: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 18,
    color: '#1C4047',
  },

  arrowBtn: {
    backgroundColor: '#FFA940',
    borderRadius: 28,
    paddingVertical: 20,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFA940',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
    marginTop: 8,
    marginBottom: 28,
  },
  arrowBtnDisabled: { opacity: 0.6 },
  arrowText: { color: '#1A1A1A', fontSize: 18, fontWeight: '800' },

  orText: {
    color: '#FFFFFF',
    fontSize: 22,
    letterSpacing: 1,
    marginBottom: 20,
  },

  socialCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(28,64,71,0.10)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    paddingVertical: 18,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    alignSelf: 'stretch',
    marginBottom: 14,
  },
  appleIcon: { fontSize: 24, color: '#1C4047', fontWeight: '700', width: 28, textAlign: 'center' },
  googleIcon: { fontSize: 22, color: '#4285F4', fontWeight: '700', width: 28, textAlign: 'center' },
  socialText: { fontSize: 18, color: '#1C4047', letterSpacing: 0.3 },

  createLink: { marginTop: 24, paddingVertical: 8 },
  createText: { color: 'rgba(255,255,255,0.60)', fontSize: 17 },

  forgotLink: { alignSelf: 'flex-end', paddingVertical: 4, marginTop: -6 },
  forgotText: { color: 'rgba(255,255,255,0.70)', fontSize: 16 },
});
