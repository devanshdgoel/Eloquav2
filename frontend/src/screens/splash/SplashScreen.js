import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useReduceMotion } from '../../context/PrefsContext';
import DolphinAnimation from './DolphinAnimation';
import BrandReveal from './BrandReveal';
import SplashButtons from './SplashButtons';

const { width, height } = Dimensions.get('window');

export default function SplashScreen({ navigation }) {
  const { isSignedIn, hasCompletedOnboarding, authError } = useAuth();
  const [showTimeoutBanner, setShowTimeoutBanner] = useState(false);
  // overlayActive keeps the skip Pressable alive during the animation sequence.
  // We unmount it once the destination is reached (either navigation or sign-in UI visible)
  // so the sign-in buttons can receive touches normally.
  const [overlayActive, setOverlayActive] = useState(true);
  const reduceMotion = useReduceMotion();

  // Animated values for the dolphin intro sequence and brand reveal.
  const dolphinY        = useRef(new Animated.Value(height + 60)).current;
  const dolphinX        = useRef(new Animated.Value(width * 0.05)).current;
  const dolphinRotate   = useRef(new Animated.Value(0)).current;
  const thisIsOpacity   = useRef(new Animated.Value(0)).current;
  const logoOpacity     = useRef(new Animated.Value(0)).current;
  const taglineOpacity  = useRef(new Animated.Value(0)).current;
  const buttonsOpacity  = useRef(new Animated.Value(0)).current;
  const bubblesOpacity  = useRef(new Animated.Value(0)).current;
  const waveLogoOpacity = useRef(new Animated.Value(0)).current;
  const orTextOpacity   = useRef(new Animated.Value(0)).current;
  const gradientFade    = useRef(new Animated.Value(0)).current;
  const hiOpacity       = useRef(new Animated.Value(0)).current;

  // skipToDestination — used both by the skip Pressable (tap anywhere to skip)
  // and when reduceMotion is on (skip immediately without any animation).
  function skipToDestination() {
    // Deactivate the overlay immediately so button taps are not blocked after skip.
    setOverlayActive(false);
    const alreadySignedIn = isSignedIn && hasCompletedOnboarding;
    if (alreadySignedIn) {
      navigation.replace('Opening');
    } else {
      // Snap all brand reveal values to visible so the sign-in UI shows immediately.
      gradientFade.setValue(1);
      thisIsOpacity.setValue(1);
      logoOpacity.setValue(1);
      taglineOpacity.setValue(1);
      bubblesOpacity.setValue(1);
      buttonsOpacity.setValue(1);
      orTextOpacity.setValue(1);
      waveLogoOpacity.setValue(1);
      if (authError) setShowTimeoutBanner(true);
    }
  }

  useEffect(() => {
    const alreadySignedIn = isSignedIn && hasCompletedOnboarding;

    // If the OS "Reduce Motion" setting is on, skip all animations immediately.
    // Users with vestibular disorders can find moving content uncomfortable.
    if (reduceMotion) {
      skipToDestination();
      return;
    }

    // Phase 1: dolphin sequence (same for all users)
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
      // Animation finished — remove the skip overlay so sign-in buttons are tappable.
      setOverlayActive(false);

      if (alreadySignedIn) {
        // Already logged in — show personalised opening screen, then Home.
        navigation.replace('Opening');
        return;
      }

      // Auth timed out — show a banner above the sign-in buttons.
      if (authError) setShowTimeoutBanner(true);

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rotateInterpolation = dolphinRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-25deg'],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Full-screen invisible Pressable — lets the user tap anywhere to skip
          the animation sequence and jump straight to the destination screen.
          zIndex:999 ensures it sits above all animated layers. Unmounted once
          the animation finishes so sign-in buttons receive touches normally. */}
      {overlayActive && (
        <Pressable
          style={styles.skipOverlay}
          onPress={skipToDestination}
          accessibilityRole="button"
          accessibilityLabel="Skip intro animation"
        />
      )}

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

      {showTimeoutBanner && (
        <View style={styles.timeoutBanner}>
          <Text style={styles.timeoutText}>Session timed out — please sign in.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Full-screen invisible tap target for skipping the animation.
  // zIndex:999 places it above all animated children; pointerEvents is the
  // default (auto) so all touches propagate normally to child views after skip.
  skipOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  timeoutBanner: {
    position: 'absolute',
    bottom: 100,
    left: 24,
    right: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
  },
  timeoutText: {
    color: 'rgba(255,255,255,0.90)',
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 24,
  },
});
