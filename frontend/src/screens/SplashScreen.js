import { LinearGradient } from 'expo-linear-gradient';
import * as Speech from 'expo-speech';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width, height } = Dimensions.get('window');

export default function SplashScreen({ navigation }) {
  // Animated values
  const dolphinY = useRef(new Animated.Value(height + 60)).current;
  const dolphinX = useRef(new Animated.Value(width * 0.05)).current;
  const dolphinRotate = useRef(new Animated.Value(0)).current;
  const hiOpacity = useRef(new Animated.Value(1)).current;
  const thisIsOpacity = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const buttonsOpacity = useRef(new Animated.Value(0)).current;
  const bubblesOpacity = useRef(new Animated.Value(0)).current;
  const waveLogoOpacity = useRef(new Animated.Value(0)).current;
  const orTextOpacity = useRef(new Animated.Value(0)).current;
  const gradientFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Speak "Hi!" when dolphin pauses
    const speakTimer = setTimeout(() => {
      Speech.speak('Hi!', {
        language: 'en-US',
        pitch: 1.2,
        rate: 0.9,
      });
    }, 1800);

    // Start animation sequence
    Animated.sequence([
      Animated.delay(400),
      // 1) Dolphin swims in and stops near "Hi!"
      Animated.parallel([
        Animated.timing(dolphinX, {
          toValue: width * 0.28,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(dolphinY, {
          toValue: height - 220,
          duration: 1400,
          useNativeDriver: true,
        }),
      ]),
      // 2) Pause at "Hi!"
      Animated.delay(1000),
      // 3) Continue swimming while transitioning
      Animated.parallel([
        Animated.timing(dolphinX, {
          toValue: width * 0.85,
          duration: 2400,
          useNativeDriver: true,
        }),
        Animated.timing(dolphinY, {
          toValue: -150,
          duration: 2400,
          useNativeDriver: true,
        }),
        Animated.timing(dolphinRotate, {
          toValue: 1,
          duration: 2400,
          useNativeDriver: true,
        }),
        Animated.timing(hiOpacity, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(gradientFade, {
          toValue: 1,
          duration: 2400,
          useNativeDriver: true,
        }),
      ]),
      // 4) Show "This is"
      Animated.timing(thisIsOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      // 5) Show "Eloqua"
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      // 6) Show tagline with bubbles
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(bubblesOpacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
      // 7) Show buttons and wave logo
      Animated.parallel([
        Animated.timing(buttonsOpacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(orTextOpacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(waveLogoOpacity, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
      // 8) Small delay to finish cleanly
      Animated.delay(500),
    ]).start();

    return () => clearTimeout(speakTimer);
  }, []);

  const rotateInterpolation = dolphinRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-25deg'],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Initial gradient */}
      <LinearGradient
        colors={['#37767A', '#0A1618']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Final gradient */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: gradientFade }]}>
        <LinearGradient
          colors={['#E0ECDE', '#68B39F', '#418182']}
          locations={[0, 0.45, 0.86]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      {/* "Hi!" text */}
      <Animated.Text style={[styles.hiText, { opacity: hiOpacity }]}>
        Hi!
      </Animated.Text>

      {/* Dolphin */}
      <Animated.Image
        source={require('../../assets/images/Dolphin.png')}
        style={[
          styles.dolphin,
          {
            transform: [
              { translateX: dolphinX },
              { translateY: dolphinY },
              { rotate: rotateInterpolation },
            ],
          },
        ]}
        resizeMode="contain"
      />

      {/* Main content */}
      <View style={styles.mainContent}>
        <Animated.Text style={[styles.thisIsText, { opacity: thisIsOpacity }]}>
          This is
        </Animated.Text>

        <Animated.Text style={[styles.eloquaText, { opacity: logoOpacity }]}>
          Eloqua
        </Animated.Text>

        <Animated.View style={[styles.taglineContainer, { opacity: taglineOpacity }]}>
          <Animated.Image
            source={require('../../assets/images/bubbles-left.png')}
            style={[styles.bubblesLeft, { opacity: bubblesOpacity }]}
            resizeMode="contain"
          />
          <Text style={styles.taglineText}>
            Express{'\n'}yourself{'\n'}<Text style={styles.taglineBold}>your  way</Text>
          </Text>
          <Animated.Image
            source={require('../../assets/images/bubbles-right.png')}
            style={[styles.bubblesRight, { opacity: bubblesOpacity }]}
            resizeMode="contain"
          />
        </Animated.View>
      </View>

      {/* Buttons */}
      <Animated.View style={[styles.buttonsContainer, { opacity: buttonsOpacity }]}>
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => navigation.navigate('SignIn')}
        >
          <Text style={styles.loginButtonText}>Login</Text>
        </TouchableOpacity>

        <Animated.Text style={[styles.orText, { opacity: orTextOpacity }]}>
          or
        </Animated.Text>

        <TouchableOpacity
          style={styles.createAccountButton}
          onPress={() => navigation.navigate('SignUp')}
        >
          <Text style={styles.createAccountButtonText}>Create new account</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Wave logo */}
      <Animated.Image
        source={require('../../assets/images/wave-logo.png')}
        style={[styles.waveLogo, { opacity: waveLogoOpacity }]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  dolphin: {
    width: 160,
    height: 110,
    position: 'absolute',
  },
  hiText: {
    fontSize: 64,
    fontWeight: '300',
    color: '#FFFFFF',
    position: 'absolute',
    bottom: 180,
    left: width * 0.42,
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  thisIsText: {
    fontSize: 38,
    color: '#1C4047',
    marginBottom: -5,
    fontWeight: '300',
    alignSelf: 'flex-start',
    marginLeft: width * 0.1,
  },
  eloquaText: {
    fontSize: 68,
    fontWeight: '600',
    color: '#1C4047',
    marginBottom: 30,
    letterSpacing: 1,
    alignSelf: 'center',
    marginLeft: width * 0.05,
  },
  taglineContainer: {
    alignItems: 'center',
    marginTop: 20,
    width: width * 0.8,
  },
  bubblesLeft: {
    position: 'absolute',
    width: 80,
    height: 80,
    left: 0,
    top: -20,
  },
  bubblesRight: {
    position: 'absolute',
    width: 80,
    height: 80,
    right: 0,
    bottom: -20,
  },
  taglineText: {
    fontSize: 24,
    color: '#1C4047',
    textAlign: 'center',
    lineHeight: 34,
    fontWeight: '300',
  },
  taglineBold: {
    fontWeight: '700',
    letterSpacing: 2,
  },
  buttonsContainer: {
    position: 'absolute',
    bottom: 100,
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loginButton: {
    backgroundColor: '#FFFFFFDD',
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
    color: '#1C4047',
    fontSize: 18,
    fontWeight: '600',
  },
  orText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '400',
    marginVertical: 12,
  },
  createAccountButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#1C4047',
    paddingVertical: 14,
    borderRadius: 30,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  createAccountButtonText: {
    color: '#1C4047',
    fontSize: 17,
    fontWeight: '500',
  },
  waveLogo: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 100,
    height: 60,
  },
});
