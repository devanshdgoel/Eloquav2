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
import { registerWithEmail } from '../../services/authService';
import { colors } from '../../theme';
import { logFunnelEvent, logScreenView } from '../../utils/analytics';
import { useLargeText } from '../../context/PrefsContext';

export default function SignUpScreen({ navigation }) {
  const largeText = useLargeText();
  const fs = (n) => largeText ? Math.round(n * 1.25) : n;

  useEffect(() => {
    const logExit = logScreenView('SignUp');
    return logExit;
  }, []);

  const [name,            setName]            = useState('');
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirm,         setConfirm]         = useState('');
  const [showPassword,    setShowPassword]    = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [agreed,          setAgreed]          = useState(false);
  const [loading,         setLoading]         = useState(false);

  const emailRef   = useRef(null);
  const passRef    = useRef(null);
  const confirmRef = useRef(null);

  async function handleRegister() {
    const trimName     = name.trim();
    const trimEmail    = email.trim();
    const trimPassword = password.trim();
    const trimConfirm  = confirm.trim();

    if (!trimName || !trimEmail || !trimPassword || !trimConfirm) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimEmail)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (trimPassword.length < 8) {
      Alert.alert('Password too short', 'Password must be at least 8 characters.');
      return;
    }
    if (trimPassword !== trimConfirm) {
      Alert.alert("Passwords don't match", 'Please make sure both passwords are the same.');
      return;
    }
    if (!agreed) {
      Alert.alert('Terms & Conditions', 'Please agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }
    setLoading(true);
    try {
      await registerWithEmail(trimEmail, trimPassword, trimName);
      logFunnelEvent('signup_completed');
      navigation.replace('SetupPermissions');
    } catch (error) {
      Alert.alert('Registration failed', error.message);
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
          {/* Brand header */}
          <View style={styles.brand}>
            <Image
              source={require('../../../assets/images/Dolphin2.png')}
              style={styles.logoImg}
              resizeMode="contain"
              accessibilityLabel="Eloqua logo"
            />
            <Text style={[styles.wordmark, { fontSize: fs(26) }]}>Eloqua</Text>
            <Text style={[styles.tagline, { fontSize: fs(14) }]}>Voice training for Parkinson's</Text>
          </View>

          <Text style={[styles.heading, { fontSize: fs(28) }]}>Create your account</Text>

          {/* Name */}
          <Text style={styles.fieldLabel}>Full name</Text>
          <View style={styles.inputCard}>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor="rgba(28,64,71,0.40)"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              blurOnSubmit={false}
              accessibilityLabel="Full name"
            />
          </View>

          {/* Email */}
          <Text style={styles.fieldLabel}>Email address</Text>
          <View style={styles.inputCard}>
            <TextInput
              ref={emailRef}
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor="rgba(28,64,71,0.40)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passRef.current?.focus()}
              blurOnSubmit={false}
              accessibilityLabel="Email address"
            />
          </View>

          {/* Password with show/hide */}
          <Text style={styles.fieldLabel}>Password</Text>
          <View style={[styles.inputCard, styles.inputRow]}>
            <TextInput
              ref={passRef}
              style={[styles.input, styles.inputFlex]}
              placeholder="At least 8 characters"
              placeholderTextColor="rgba(28,64,71,0.40)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
              blurOnSubmit={false}
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

          {/* Confirm password */}
          <Text style={styles.fieldLabel}>Confirm password</Text>
          <View style={[styles.inputCard, styles.inputRow]}>
            <TextInput
              ref={confirmRef}
              style={[styles.input, styles.inputFlex]}
              placeholder="Repeat your password"
              placeholderTextColor="rgba(28,64,71,0.40)"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry={!showConfirm}
              returnKeyType="done"
              onSubmitEditing={handleRegister}
              accessibilityLabel="Confirm password"
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowConfirm(v => !v)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
            >
              <Text style={styles.eyeText}>{showConfirm ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>

          {/* Terms & conditions — checkbox is separate from the links so each
              can be tapped independently. Checkbox toggles agreement; links
              open the full Policy screen without affecting the checkbox state. */}
          <View style={styles.tcsRow}>
            <TouchableOpacity
              onPress={() => setAgreed(!agreed)}
              activeOpacity={0.8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreed }}
              accessibilityLabel="Agree to Terms of Service and Privacy Policy"
            >
              <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                {agreed && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>
            <Text style={styles.tcsText}>
              I agree to the{' '}
              <Text
                style={styles.tcsLink}
                onPress={() => navigation.navigate('Policy', { section: 'terms' })}
                accessibilityRole="link"
                accessibilityLabel="Read Terms of Service"
              >
                Terms of Use
              </Text>
              {' '}and{' '}
              <Text
                style={styles.tcsLink}
                onPress={() => navigation.navigate('Policy', { section: 'privacy' })}
                accessibilityRole="link"
                accessibilityLabel="Read Privacy Policy"
              >
                Privacy Policy
              </Text>
            </Text>
          </View>

          {/* Create account button */}
          <TouchableOpacity
            style={[styles.createBtn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Create account"
          >
            {loading
              ? <ActivityIndicator color="#1C4047" size="small" />
              : <Text style={[styles.createBtnText, { fontSize: fs(18) }]}>Create Account</Text>
            }
          </TouchableOpacity>

          {/* Sign in link */}
          <View style={styles.switchRow}>
            <View style={styles.switchLine} />
          </View>
          <TouchableOpacity
            style={styles.signInLink}
            onPress={() => navigation.navigate('SignIn')}
            accessibilityRole="button"
            accessibilityLabel="Sign in to existing account"
          >
            <Text style={[styles.signInText, { fontSize: fs(16) }]}>
              Already have an account?{'  '}
              <Text style={styles.signInBold}>Sign In</Text>
            </Text>
          </TouchableOpacity>

          {/* Privacy assurance */}
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
    paddingTop: 100,
    paddingHorizontal: 28,
    paddingBottom: 48,
  },

  // ── Brand header ─────────────────────────────────────────────────────────────
  brand: {
    alignItems: 'center',
    marginBottom: 28,
    gap: 6,
  },
  logoImg: {
    width: 48,
    height: 48,
    marginBottom: 4,
  },
  wordmark: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 1.0,
  },
  tagline: {
    color: '#C3DECE',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.3,
    opacity: 0.85,
  },

  heading: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 24,
  },

  // ── Input fields ─────────────────────────────────────────────────────────────
  fieldLabel: {
    color: '#C3DECE',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 7,
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
    shadowRadius: 5,
    elevation: 3,
    marginBottom: 18,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 17,
    color: '#1C4047',
  },
  inputFlex: { flex: 1 },
  eyeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    justifyContent: 'center',
  },
  eyeText: {
    color: '#2D6974',
    fontSize: 14,
    fontWeight: '600',
  },

  // ── T&Cs ─────────────────────────────────────────────────────────────────────
  tcsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 24,
    marginTop: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.50)',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
    flexShrink: 0,
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
    color: 'rgba(255,255,255,0.75)',
    fontSize: 15,
    lineHeight: 22,
  },
  tcsLink: {
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── CTA button ───────────────────────────────────────────────────────────────
  createBtn: {
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
  createBtnText: { color: '#1A1A1A', fontSize: 18, fontWeight: '800', letterSpacing: 0.3 },

  // ── Switch to sign-in ─────────────────────────────────────────────────────────
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
  signInLink:  { alignItems: 'center', paddingVertical: 4, marginBottom: 28 },
  signInText:  { color: 'rgba(255,255,255,0.60)', fontSize: 16 },
  signInBold:  { color: '#FFFFFF', fontWeight: '700' },

  // ── Privacy note ──────────────────────────────────────────────────────────────
  privacyNote: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});
