/**
 * LoadingSpinner
 *
 * Reusable loading indicator: a dolphin silhouette that orbits in a circle,
 * matching the Figma "Loading Screens" design (Loading1–Loading3 frames).
 *
 * Usage:
 *   // Full-screen loading (default) — dark teal gradient background
 *   <LoadingSpinner />
 *
 *   // Transparent overlay — render over existing content
 *   <LoadingSpinner transparent />
 *
 *   // Custom orbit size
 *   <LoadingSpinner size={200} />
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Image,
  Animated,
  Easing,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Orbit diameter in dp (matches ~126px radius in the 402px Figma frame, scaled to ~390px)
const DEFAULT_ORBIT_D = 240;
// Dolphin aspect ratio from Figma vector (131 × 87)
const DOLPHIN_RATIO = 87 / 131;
// Dolphin width as fraction of orbit diameter
const DOLPHIN_FRAC = 0.46;
// One full rotation duration in ms
const DURATION = 1800;

export default function LoadingSpinner({ transparent = false, size = DEFAULT_ORBIT_D }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: DURATION,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const dolphinW = size * DOLPHIN_FRAC;
  const dolphinH = dolphinW * DOLPHIN_RATIO;

  // The rotator is a square sized exactly to the orbit diameter.
  // The dolphin is pinned to the top-center of the rotator.
  // As the rotator spins, the dolphin orbits the center AND rotates in place —
  // exactly matching the three keyframe positions in the Figma.
  const spinner = (
    <View style={[styles.orbitWrap, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.rotator,
          { width: size, height: size, transform: [{ rotate }] },
        ]}
      >
        <Image
          source={require('../../assets/images/Dolphin.png')}
          style={{
            position: 'absolute',
            width: dolphinW,
            height: dolphinH,
            top: 0,
            left: size / 2 - dolphinW / 2,
            tintColor: '#FFFFFF',
          }}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );

  if (transparent) {
    return (
      <View style={styles.overlay}>
        {spinner}
      </View>
    );
  }

  return (
    <LinearGradient
      colors={['#1C4047', '#2D6974']}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={styles.fullscreen}
    >
      {spinner}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22,52,58,0.72)',
  },
  orbitWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rotator: {
    position: 'relative',
  },
});
