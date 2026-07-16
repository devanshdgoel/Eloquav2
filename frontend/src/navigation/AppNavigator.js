import React from 'react';
import { ActivityIndicator, View, StyleSheet, Easing } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';

import { useAuth } from '../context/AuthContext';
import { PrefsProvider } from '../context/PrefsContext';
import { colors } from '../theme';
import ErrorBoundary from '../components/ErrorBoundary';

// Splash
import SplashScreen from '../screens/splash/SplashScreen';

// Auth
import SignUpScreen from '../screens/onboarding/SignUpScreen';
import SignInScreen from '../screens/onboarding/SignInScreen';

// Onboarding flow
import WhatIsEloquaScreen from '../screens/onboarding/WhatIsEloquaScreen';
import HowItWorksScreen from '../screens/onboarding/HowItWorksScreen';
import VoiceCloningExplainerScreen from '../screens/onboarding/VoiceCloningExplainerScreen';
import SetupPermissionsScreen from '../screens/onboarding/SetupPermissionsScreen';
import SetupAboutYouScreen from '../screens/onboarding/SetupAboutYouScreen';
import SetupVoiceScreen from '../screens/onboarding/SetupVoiceScreen';

// Main app
import HomeScreen from '../screens/HomeScreen';
import OpeningScreen from '../screens/OpeningScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SpeechEnhancementScreen from '../screens/SpeechEnhancementScreen';
import SpeechDemoScreen from '../screens/SpeechDemoScreen';
import AssessmentScreen from '../screens/AssessmentScreen';
import CheckinScreen from '../screens/CheckinScreen';
import VocalTrainingSessionScreen from '../screens/vocaltraining/VocalTrainingSessionScreen';
import BaselineSessionScreen from '../screens/vocaltraining/BaselineSessionScreen';
import StreakCelebrationScreen from '../screens/StreakCelebrationScreen';
import StreakCommitmentScreen from '../screens/StreakCommitmentScreen';
import BaselineResultsScreen from '../screens/BaselineResultsScreen';
import ProgressScreen from '../screens/ProgressScreen';
import DailyVoiceNoteScreen from '../screens/vocaltraining/DailyVoiceNoteScreen';

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
    <PrefsProvider>
    <ErrorBoundary>
    <NavigationContainer>
      {/*
       * Single flat stack — always starts at Splash.
       * Navigation flow (new users):
       *   Splash → SignUp → SetupPermissions → SetupAboutYou → Home → (node 0 tap) →
       *   BaselineSession → StreakCelebration → BaselineResults → Home
       * Navigation flow (returning users):
       *   Splash → Opening → Home
       * Navigation flow (regular session):
       *   Home → VocalTrainingSession → StreakCelebration → StreakCommitment → Home
       *
       * Voice cloning happens inside BaselineSession via VoiceSetupExercise (node 0).
       * SetupVoice is registered but not in the active flow.
       * WhatIsEloqua / HowItWorks / VoiceCloningExplainer are backup screens for
       * a future "About Eloqua" Settings entry point.
       */}
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          // Slightly slower, calm transitions across the whole app.
          // 420 ms open / 370 ms close with a gentle poly-ease.
          transitionSpec: {
            open: {
              animation: 'timing',
              config: { duration: 420, easing: Easing.out(Easing.poly(4)) },
            },
            close: {
              animation: 'timing',
              config: { duration: 370, easing: Easing.in(Easing.poly(4)) },
            },
          },
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
        }}
        initialRouteName="Splash"
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="WhatIsEloqua" component={WhatIsEloquaScreen} />
        <Stack.Screen name="HowItWorks" component={HowItWorksScreen} />
        <Stack.Screen name="VoiceCloningExplainer" component={VoiceCloningExplainerScreen} />
        <Stack.Screen name="SetupPermissions" component={SetupPermissionsScreen} />
        <Stack.Screen name="SetupAboutYou" component={SetupAboutYouScreen} />
        <Stack.Screen name="SetupVoice" component={SetupVoiceScreen} />
        <Stack.Screen name="Opening" component={OpeningScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        {/*
         * Settings slides in from the LEFT (it's conceptually to the left of Home).
         * Progress slides in from the RIGHT (it's conceptually to the right of Home).
         * Together these create a horizontal tab-like layout without a tab navigator.
         */}
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            gestureEnabled: false,
            cardStyleInterpolator: ({ current, layouts }) => ({
              cardStyle: {
                transform: [{
                  translateX: current.progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-layouts.screen.width, 0],
                  }),
                }],
              },
            }),
          }}
        />
        <Stack.Screen
          name="Progress"
          component={ProgressScreen}
          options={{
            gestureEnabled: false,
            cardStyleInterpolator: ({ current, layouts }) => ({
              cardStyle: {
                transform: [{
                  translateX: current.progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [layouts.screen.width, 0],
                  }),
                }],
              },
            }),
          }}
        />
        <Stack.Screen name="Assessment" component={AssessmentScreen} />
        <Stack.Screen name="Checkin" component={CheckinScreen} />
        <Stack.Screen name="SpeechEnhancement" component={SpeechEnhancementScreen} />
        <Stack.Screen name="SpeechDemo" component={SpeechDemoScreen} />
        <Stack.Screen name="BaselineSession" component={BaselineSessionScreen} />
        <Stack.Screen name="VocalTrainingSession" component={VocalTrainingSessionScreen} />
        <Stack.Screen name="StreakCelebration" component={StreakCelebrationScreen} />
        <Stack.Screen name="StreakCommitment" component={StreakCommitmentScreen} />
        <Stack.Screen name="BaselineResults" component={BaselineResultsScreen} />
        {/* Daily voice note — shown before every training and baseline session */}
        <Stack.Screen name="DailyVoiceNote" component={DailyVoiceNoteScreen} />
      </Stack.Navigator>
    </NavigationContainer>
    </ErrorBoundary>
    </PrefsProvider>
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
