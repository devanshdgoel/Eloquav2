import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';

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

// Main app
import HomeScreen from '../screens/HomeScreen';
import OpeningScreen from '../screens/OpeningScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SpeechEnhancementScreen from '../screens/SpeechEnhancementScreen';
import SpeechDemoScreen from '../screens/SpeechDemoScreen';
import AssessmentScreen from '../screens/AssessmentScreen';
import VocalTrainingSessionScreen from '../screens/vocaltraining/VocalTrainingSessionScreen';
import StreakCelebrationScreen from '../screens/StreakCelebrationScreen';
import StreakCommitmentScreen from '../screens/StreakCommitmentScreen';
import ProgressScreen from '../screens/ProgressScreen';

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
       *          → SetupAboutYou → Home (new users, voice captured in Assessment)
       */}
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Splash">
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="Personalise" component={PersonaliseScreen} />
        <Stack.Screen name="SetupPermissions" component={SetupPermissionsScreen} />
        <Stack.Screen name="AboutYouIntro" component={AboutYouIntroScreen} />
        <Stack.Screen name="SetupAboutYou" component={SetupAboutYouScreen} />
        <Stack.Screen name="Opening" component={OpeningScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
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
        <Stack.Screen name="Progress" component={ProgressScreen} />
        <Stack.Screen name="Assessment" component={AssessmentScreen} />
        <Stack.Screen name="SpeechEnhancement" component={SpeechEnhancementScreen} />
        <Stack.Screen name="SpeechDemo" component={SpeechDemoScreen} />
        <Stack.Screen name="VocalTrainingSession" component={VocalTrainingSessionScreen} />
        <Stack.Screen name="StreakCelebration" component={StreakCelebrationScreen} />
        <Stack.Screen name="StreakCommitment" component={StreakCommitmentScreen} />
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
