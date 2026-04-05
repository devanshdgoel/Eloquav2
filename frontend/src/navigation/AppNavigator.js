import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

// Splash
import SplashScreen from '../screens/splash/SplashScreen';

// Auth
import SignUpScreen from '../screens/onboarding/SignUpScreen';
import SignInScreen from '../screens/onboarding/SignInScreen';

// Onboarding flow
import PersonaliseScreen from '../screens/onboarding/PersonaliseScreen';
import SetupPermissionsScreen from '../screens/onboarding/SetupPermissionsScreen';
import AboutYouIntroScreen from '../screens/onboarding/AboutYouIntroScreen';
import SetupAboutYouScreen from '../screens/onboarding/SetupAboutYouScreen';
import SetupVoiceScreen from '../screens/onboarding/SetupVoiceScreen';

// Main app
import HomeScreen from '../screens/HomeScreen';
import SpeechEnhancementScreen from '../screens/SpeechEnhancementScreen';
import SpeechDemoScreen from '../screens/SpeechDemoScreen';
import VocalTrainingSessionScreen from '../screens/vocaltraining/VocalTrainingSessionScreen';

const Stack = createStackNavigator();

export default function AppNavigator() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {/*
       * Single flat stack — always starts at Splash.
       * Navigation flow:
       *   Splash → SignIn → Home (existing users)
       *   Splash → SignUp → Personalise → SetupPermissions → AboutYouIntro
       *          → SetupAboutYou → SetupVoice → Home (new users)
       */}
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Splash">
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="Personalise" component={PersonaliseScreen} />
        <Stack.Screen name="SetupPermissions" component={SetupPermissionsScreen} />
        <Stack.Screen name="AboutYouIntro" component={AboutYouIntroScreen} />
        <Stack.Screen name="SetupAboutYou" component={SetupAboutYouScreen} />
        <Stack.Screen name="SetupVoice" component={SetupVoiceScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="SpeechEnhancement" component={SpeechEnhancementScreen} />
        <Stack.Screen name="SpeechDemo" component={SpeechDemoScreen} />
        <Stack.Screen name="VocalTrainingSession" component={VocalTrainingSessionScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
