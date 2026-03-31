import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';

export default function SetupPermissionsScreen({ navigation }) {
  async function handleStart() {
    const { status } = await Audio.requestPermissionsAsync();
    if (status === 'granted') {
      navigation.navigate('AboutYouIntro');
    } else {
      Alert.alert(
        'Microphone Required',
        'Eloqua needs microphone access to analyse your speech. Please enable it in Settings.',
        [{ text: 'OK' }]
      );
    }
  }

  return (
    <LinearGradient colors={['#68B39F', '#2D6974']} style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Decorative bubbles top-right */}
      <View style={[styles.bubble, { width: 64, height: 64, top: 44, right: 28 }]} />
      <View style={[styles.bubble, { width: 38, height: 38, top: 18, right: 108 }]} />
      <View style={[styles.bubble, { width: 22, height: 22, top: 78, right: 110 }]} />

      <View style={styles.content}>
        <Text style={styles.title}>Permissions</Text>
        <Text style={styles.body}>
          You will now be asked{'\n'}to review and accept a{'\n'}few permissions
        </Text>

        <TouchableOpacity style={styles.startBtn} onPress={handleStart} activeOpacity={0.85}>
          <Text style={styles.startText}>Start</Text>
        </TouchableOpacity>
      </View>

      <Image
        source={require('../../../assets/images/wave-logo.png')}
        style={styles.waveLogo}
        resizeMode="contain"
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bubble: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 44,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 20,
  },
  body: {
    fontSize: 20,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 30,
    letterSpacing: 0.3,
    marginBottom: 64,
  },
  startBtn: {
    backgroundColor: '#1C4047',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    paddingVertical: 16,
    paddingHorizontal: 72,
    borderRadius: 10,
    shadowColor: '#68B39F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 10,
  },
  startText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  waveLogo: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 90,
    height: 56,
  },
});
