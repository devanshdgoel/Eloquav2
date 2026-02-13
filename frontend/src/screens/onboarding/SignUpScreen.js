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

WebBrowser.maybeCompleteAuthSession();

// Replace with your actual Google OAuth client IDs
const GOOGLE_WEB_CLIENT_ID = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID = 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com';
const GOOGLE_ANDROID_CLIENT_ID = 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com';

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

        // Send to our backend
        const authResult = await authenticateWithGoogle(idToken);
        setSignedIn(authResult.user);

        // New account → go through setup
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
        >
          {loading ? (
            <ActivityIndicator color="#1A1A2E" size="small" />
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 32,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2A2A4A',
  },
  dividerText: {
    color: '#A0A0B8',
    paddingHorizontal: 16,
    fontSize: 14,
  },
  stepsContainer: {
    gap: 20,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stepNumber: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A2A4A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    color: '#6C63FF',
    fontSize: 16,
    fontWeight: '700',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  stepDescription: {
    color: '#A0A0B8',
    fontSize: 14,
  },
});
