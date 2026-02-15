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
import { colors, typography, spacing, borderRadius } from '../../theme';
import {
  GOOGLE_WEB_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_ANDROID_CLIENT_ID,
} from '../../config/env';

WebBrowser.maybeCompleteAuthSession();

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

        if (authResult.is_existing_user) {
          setOnboarded();
        } else {
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
        accessibilityRole="button"
        accessibilityLabel="Go back"
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
          accessibilityRole="button"
          accessibilityLabel="Sign in with Google"
        >
          {loading ? (
            <ActivityIndicator color={colors.background} size="small" />
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
    backgroundColor: colors.background,
  },
  backButton: {
    paddingTop: 60,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backText: {
    color: colors.textSecondary,
    ...typography.body,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
  },
  heading: {
    ...typography.headingLarge,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  subheading: {
    ...typography.subheading,
    color: colors.textSecondary,
    marginBottom: 40,
  },
  googleButton: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.googleBlue,
  },
  googleButtonText: {
    ...typography.button,
    color: colors.background,
  },
});
