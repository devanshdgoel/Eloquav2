/**
 * OpeningScreen
 *
 * Shown to returning users immediately after the splash animation.
 * Displays a personalised time-of-day greeting with the user's name,
 * then automatically navigates to Home after 2.5 seconds.
 *
 * Morning  (05:00–11:59): gradient #68B39F → #2D6974  "Morning, [name]!"
 * Evening  (12:00–04:59): gradient #37767A → #0A1618  "Evening [name]!"
 *
 * Design: Figma "Home Page" → "Opening Animation2" (morning)
 *                           → "Opening Animation3" (evening)
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Image,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUserProfile } from '../utils/storage';

const { width: W, height: H } = Dimensions.get('window');
// Figma reference frame: 402 × 874
const SX = W / 402;
const SY = H / 874;

// Time-of-day theming
function getTheme() {
  const hour = new Date().getHours();
  const isMorning = hour >= 5 && hour < 12;
  return {
    isMorning,
    greeting:  isMorning ? 'Morning,' : 'Evening',
    greetingSuffix: isMorning ? '' : '',   // comma is inline with name for morning
    gradientColors: isMorning
      ? ['#68B39F', '#2D6974']             // medium teal
      : ['#37767A', '#0A1618'],            // dark teal → near-black
    gradientAngle: 139,                    // ~139° from Figma
  };
}

export default function OpeningScreen({ navigation }) {
  const { top: safeTop } = useSafeAreaInsets();
  const theme = useRef(getTheme()).current;

  const [name, setName] = useState('');
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const exitAnim  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Load user's name from local storage
    getUserProfile().then(profile => {
      setName(profile?.name ?? '');
    });

    // Fade + slide in
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    // After 2.5 s, fade out then navigate
    const timer = setTimeout(() => {
      Animated.timing(exitAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        navigation.replace('Home');
      });
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  // Large decorative bubble — bottom-left, partially off-screen
  // Figma: left: -71, top: 752, size: 244  (in 402×874 frame)
  const largeBubbleSize = 244 * SX;
  const largeBubbleLeft = -71 * SX;
  const largeBubbleTop  = 752 * SY;

  // Small decorative bubble — middle-right
  // Figma: left: 269, top: 311, size: 96
  const smallBubbleSize = 96 * SX;
  const smallBubbleLeft = 269 * SX;
  const smallBubbleTop  = 311 * SY;

  const displayGreeting = theme.isMorning
    ? `Morning,\n${name || 'there'}!`
    : `Evening\n${name || 'there'}!`;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={theme.gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Large decorative bubble — bottom-left */}
      <Image
        source={require('../../assets/images/Bubble.png')}
        style={[
          styles.bubble,
          {
            width:  largeBubbleSize,
            height: largeBubbleSize,
            left:   largeBubbleLeft,
            top:    largeBubbleTop,
          },
        ]}
        resizeMode="contain"
      />

      {/* Small decorative bubble — middle-right */}
      <Image
        source={require('../../assets/images/Bubble.png')}
        style={[
          styles.bubble,
          {
            width:  smallBubbleSize,
            height: smallBubbleSize,
            left:   smallBubbleLeft,
            top:    smallBubbleTop,
          },
        ]}
        resizeMode="contain"
      />

      {/* Animated content */}
      <Animated.View
        style={[
          styles.content,
          { paddingTop: safeTop + 112 * SY },
          {
            opacity: Animated.multiply(fadeAnim, exitAnim),
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Personalised greeting */}
        <Text style={styles.greeting}>{displayGreeting}</Text>

        {/* Tagline */}
        <View style={styles.taglineBlock}>
          <Text style={styles.taglineWhite}>Be heard.</Text>
          <Text style={styles.taglineMint}>Feel Understood.</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1C4047',
  },
  bubble: {
    position: 'absolute',
    opacity: 0.9,
  },
  content: {
    flex: 1,
    paddingHorizontal: 44 * SX,
  },
  greeting: {
    color: '#FFFFFF',
    fontSize: 64 * SX,
    fontWeight: '700',
    letterSpacing: 3.2 * SX,
    lineHeight: 70 * SX,
    marginBottom: 0,
  },
  taglineBlock: {
    marginTop: (414 - 112 - 64 * 2) * SY,  // approximate gap from Figma
  },
  taglineWhite: {
    color: '#FFFFFF',
    fontSize: 40 * SX,
    fontWeight: '400',
    lineHeight: 52 * SX,
  },
  taglineMint: {
    color: '#C3DECE',
    fontSize: 40 * SX,
    fontWeight: '400',
    lineHeight: 52 * SX,
  },
});
