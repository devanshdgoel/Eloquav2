import React, { useState } from 'react';
import { Alert, Animated, StyleSheet, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { setOnboardingComplete } from '../../utils/storage';
import { colors } from '../../theme';

export default function SplashButtons({ buttonsOpacity, orTextOpacity, waveLogoOpacity, navigation }) {
  const [guestLoading, setGuestLoading] = useState(false);

  async function handleGuestSignIn() {
    if (guestLoading) return;
    setGuestLoading(true);
    try {
      // Try Firebase anonymous auth first (enables Firestore for guests).
      // Falls back to local-only guest mode if anonymous auth is disabled.
      await setOnboardingComplete();
      try {
        await signInAnonymously(auth);
      } catch (authErr) {
        // Anonymous auth not enabled — continue as local guest
        console.warn('Anonymous auth unavailable, continuing as local guest:', authErr.code);
      }
      navigation.replace('Home');
    } catch (e) {
      setGuestLoading(false);
      Alert.alert('Sign in failed', e?.message ?? 'Something went wrong. Please try again.');
    }
  }

  return (
    <>
      <Animated.View style={[styles.buttonsContainer, { opacity: buttonsOpacity }]}>
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => navigation.navigate('SignIn')}
          accessibilityRole="button"
          accessibilityLabel="Login to your account"
        >
          <Text style={styles.loginButtonText}>Login</Text>
        </TouchableOpacity>

        <Animated.Text style={[styles.orText, { opacity: orTextOpacity }]}>
          or
        </Animated.Text>

        <TouchableOpacity
          style={styles.createAccountButton}
          onPress={() => navigation.navigate('SignUp')}
          accessibilityRole="button"
          accessibilityLabel="Create a new account"
        >
          <Text style={styles.createAccountButtonText}>Create new account</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Wave logo — tap to enter as guest */}
      <Animated.View style={[styles.waveLogo, { opacity: waveLogoOpacity }]}>
        <TouchableOpacity onPress={handleGuestSignIn} activeOpacity={0.7} accessibilityLabel="Continue as guest">
          {guestLoading
            ? <ActivityIndicator color={colors.splash.text} style={{ width: 100, height: 60 }} />
            : <Animated.Image
                source={require('../../../assets/images/wave-logo.png')}
                style={{ width: 100, height: 60 }}
                resizeMode="contain"
                accessible={false}
              />
          }
        </TouchableOpacity>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  buttonsContainer: {
    position: 'absolute',
    bottom: 100,
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loginButton: {
    backgroundColor: colors.splash.buttonBg,
    paddingVertical: 16,
    borderRadius: 30,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  loginButtonText: {
    color: colors.splash.text,
    fontSize: 18,
    fontWeight: '600',
  },
  orText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '400',
    marginVertical: 12,
  },
  createAccountButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.splash.buttonBorder,
    paddingVertical: 14,
    borderRadius: 30,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  createAccountButtonText: {
    color: colors.splash.text,
    fontSize: 17,
    fontWeight: '500',
  },
  waveLogo: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    padding: 8,          // expand tap area
  },
});
