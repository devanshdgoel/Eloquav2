import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import { useAuth } from '../context/AuthContext';

// Splash / Onboarding screens
import SplashScreen from '../screens/SplashScreen';
import SignUpScreen from '../screens/onboarding/SignUpScreen';
import SignInScreen from '../screens/onboarding/SignInScreen';
import SetupPermissionsScreen from '../screens/onboarding/SetupPermissionsScreen';
import SetupAboutYouScreen from '../screens/onboarding/SetupAboutYouScreen';
import SetupVoiceScreen from '../screens/onboarding/SetupVoiceScreen';

// Main app screens
import HomeScreen from '../screens/HomeScreen';
import SpeechDemoScreen from '../screens/SpeechDemoScreen';

const Stack = createStackNavigator();

const screenOptions = {
  headerShown: false,
};

function OnboardingStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="SetupPermissions" component={SetupPermissionsScreen} />
      <Stack.Screen name="SetupAboutYou" component={SetupAboutYouScreen} />
      <Stack.Screen name="SetupVoice" component={SetupVoiceScreen} />
    </Stack.Navigator>
  );
}

function MainStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="SpeechDemo" component={SpeechDemoScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { isLoading, isSignedIn, hasCompletedOnboarding } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isSignedIn && hasCompletedOnboarding ? <MainStack /> : <OnboardingStack />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
  },
});
