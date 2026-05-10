import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { colors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import DolphinAnimation from './DolphinAnimation';
import BrandReveal from './BrandReveal';
import SplashButtons from './SplashButtons';

const { width, height } = Dimensions.get('window');

export default function SplashScreen({ navigation }) {
  const { isSignedIn, hasCompletedOnboarding } = useAuth();

  // Animated values
  const dolphinY = useRef(new Animated.Value(height + 60)).current;
  const dolphinX = useRef(new Animated.Value(width * 0.05)).current;
  const dolphinRotate = useRef(new Animated.Value(0)).current;
  const thisIsOpacity = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const buttonsOpacity = useRef(new Animated.Value(0)).current;
  const bubblesOpacity = useRef(new Animated.Value(0)).current;
  const waveLogoOpacity = useRef(new Animated.Value(0)).current;
  const orTextOpacity = useRef(new Animated.Value(0)).current;
  const gradientFade = useRef(new Animated.Value(0)).current;
  const hiOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const alreadySignedIn = isSignedIn && hasCompletedOnboarding;

    // Phase 1: dolphin sequence (same for everyone)
    Animated.sequence([
      Animated.delay(400),
      Animated.parallel([
        Animated.timing(dolphinX, { toValue: width * 0.28, duration: 1400, useNativeDriver: true }),
        Animated.timing(dolphinY, { toValue: height - 220, duration: 1400, useNativeDriver: true }),
      ]),
      Animated.timing(hiOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(600),
      Animated.timing(hiOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(dolphinX, { toValue: width * 0.85, duration: 1600, useNativeDriver: true }),
        Animated.timing(dolphinY, { toValue: -150, duration: 1600, useNativeDriver: true }),
        Animated.timing(dolphinRotate, { toValue: 1, duration: 1600, useNativeDriver: true }),
      ]),
    ]).start(() => {
      if (alreadySignedIn) {
        // Already logged in — show personalised opening screen, then Home
        navigation.replace('Opening');
        return;
      }

      // Phase 2 (new users only): brand reveal + buttons
      Animated.sequence([
        Animated.parallel([
          Animated.timing(gradientFade, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(thisIsOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
        Animated.timing(logoOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.parallel([
          Animated.timing(taglineOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(bubblesOpacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(buttonsOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(orTextOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(waveLogoOpacity, { toValue: 1, duration: 900, useNativeDriver: true }),
        ]),
        Animated.delay(500),
      ]).start();
    });
  }, []);

  const rotateInterpolation = dolphinRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-25deg'],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <LinearGradient
        colors={[colors.splash.gradientStart, colors.splash.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <Animated.View style={[StyleSheet.absoluteFill, { opacity: gradientFade }]}>
        <LinearGradient
          colors={[colors.splash.revealLight, colors.splash.revealMid, colors.splash.revealDark]}
          locations={[0, 0.45, 0.86]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      <DolphinAnimation
        dolphinX={dolphinX}
        dolphinY={dolphinY}
        rotateInterpolation={rotateInterpolation}
        hiOpacity={hiOpacity}
      />

      <BrandReveal
        thisIsOpacity={thisIsOpacity}
        logoOpacity={logoOpacity}
        taglineOpacity={taglineOpacity}
        bubblesOpacity={bubblesOpacity}
      />

      <SplashButtons
        buttonsOpacity={buttonsOpacity}
        orTextOpacity={orTextOpacity}
        waveLogoOpacity={waveLogoOpacity}
        navigation={navigation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
