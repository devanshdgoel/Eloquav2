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

export default function SignUpScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const { setSignedIn } = useAuth();

  const discovery = AuthSession.useAutoDiscovery('https://accounts.google.com');

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'com.eloqua.app',
  });

  async function handleGoogleSignUp() {
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

        navigation.replace('SetupPermissions');
      } else if (result.type === 'cancel') {
        // User cancelled, do nothing
      } else {
        Alert.alert('Sign Up Failed', 'Could not complete Google sign up. Please try again.');
      }
    } catch (error) {
      Alert.alert('Error', error.message || 'Something went wrong during sign up.');
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
        <Text style={styles.heading}>Create your account</Text>
        <Text style={styles.subheading}>
          Sign up to get started with personalized speech enhancement and vocal training.
        </Text>

        <TouchableOpacity
          style={styles.googleButton}
          onPress={handleGoogleSignUp}
          disabled={loading}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
        >
          {loading ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>then</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.stepsContainer}>
          <StepItem number="1" title="Permissions" description="Microphone access" />
          <StepItem number="2" title="About You" description="Your profile info" />
          <StepItem number="3" title="Voice Setup" description="Read a few sentences" />
        </View>
      </View>
    </View>
  );
}

function StepItem({ number, title, description }) {
  return (
    <View style={styles.stepItem}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepDescription}>{description}</Text>
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xl,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.surface,
  },
  dividerText: {
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    ...typography.bodySmall,
  },
  stepsContainer: {
    gap: 20,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepNumber: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    color: colors.primary,
    ...typography.body,
    fontWeight: '700',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: '600',
  },
  stepDescription: {
    color: colors.textSecondary,
    ...typography.bodySmall,
  },
});
