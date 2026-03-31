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
import { loginWithEmail } from '../../services/authService';
import { isOnboardingComplete } from '../../utils/storage';

export default function SignInScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef(null);

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
        navigation.replace('Personalise');
      }
    } catch (error) {
      Alert.alert('Sign in failed', error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={['#326F77', '#1C4047']} style={styles.container}>
      <StatusBar barStyle="light-content" />

      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
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
          >
            {loading
              ? <ActivityIndicator color="#1C4047" size="small" />
              : <Text style={styles.arrowText}>→</Text>
            }
          </TouchableOpacity>

          <Text style={styles.orText}>or</Text>

          <TouchableOpacity
            style={styles.socialCard}
            activeOpacity={0.85}
            onPress={() => Alert.alert('Coming soon', 'Apple Sign-In will be available in a future update.')}
            accessibilityRole="button"
            accessibilityLabel="Continue with Apple"
          >
            <Text style={styles.appleIcon}>󰀶</Text>
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
    backgroundColor: '#E0ECDE',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    zIndex: 10,
  },
  backArrow: { color: '#1C4047', fontSize: 18, fontWeight: '600' },

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
    borderRadius: 10,
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
    backgroundColor: '#68B39F',
    width: 80,
    height: 80,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
    marginTop: 8,
    marginBottom: 28,
  },
  arrowBtnDisabled: { opacity: 0.6 },
  arrowText: { color: '#FFFFFF', fontSize: 32, fontWeight: '700' },

  orText: {
    color: '#FFFFFF',
    fontSize: 22,
    letterSpacing: 1,
    marginBottom: 20,
  },

  socialCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
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
  createText: { color: 'rgba(255,255,255,0.7)', fontSize: 15 },
});
