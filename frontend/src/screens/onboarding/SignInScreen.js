import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Alert,
  Platform,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { useAuth } from '../../context/AuthContext';
import { authenticateWithGoogle } from '../../services/authService';
import { isOnboardingComplete } from '../../utils/storage';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_WEB_CLIENT_ID = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID = 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com';
const GOOGLE_ANDROID_CLIENT_ID = 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com';

export default function SignInScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const { setSignedIn, setOnboarded } = useAuth();

  const discovery = AuthSession.useAutoDiscovery('https://accounts.google.com');

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'com.eloqua.app',
  });

  async function handleGoogleSignIn() {
    if (!discovery) return;
    setLoading(true);

    try {
      const nonce = await Crypto.randomUUID();

      const request = new AuthSession.AuthRequest({
        clientId: Platform.select({
          ios: GOOGLE_IOS_CLIENT_ID,
          android: GOOGLE_ANDROID_CLIENT_ID,
          default: GOOGLE_WEB_CLIENT_ID,
        }),
        redirectUri,
        scopes: ['openid', 'profile', 'email'],
        responseType: AuthSession.ResponseType.IdToken,
        extraParams: { nonce },
      });

      const result = await request.promptAsync(discovery);

      if (result.type === 'success') {
        const idToken = result.params.id_token;
        const authResult = await authenticateWithGoogle(idToken);
        setSignedIn(authResult.user);

        // Returning user: if they already completed onboarding, go home
        if (authResult.is_existing_user) {
          setOnboarded();
          // Navigation will auto-redirect to Home via AppNavigator
        } else {
          // New user signed in via Sign In (edge case) — still needs setup
          navigation.replace('SetupPermissions');
        }
      } else if (result.type !== 'cancel') {
        Alert.alert('Sign In Failed', 'Could not complete Google sign in. Please try again.');
      }
    } catch (error) {
      Alert.alert('Error', error.message || 'Something went wrong during sign in.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.heading}>Welcome back</Text>
        <Text style={styles.subheading}>
          Sign in to continue where you left off.
        </Text>

        <TouchableOpacity
          style={styles.googleButton}
          onPress={handleGoogleSignIn}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#1A1A2E" size="small" />
          ) : (
            <>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleButtonText}>Sign in with Google</Text>
            </>
          )}
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
  backButton: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  backText: {
    color: '#A0A0B8',
    fontSize: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
  },
  heading: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  subheading: {
    fontSize: 16,
    color: '#A0A0B8',
    lineHeight: 24,
    marginBottom: 40,
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4285F4',
  },
  googleButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A2E',
  },
});
