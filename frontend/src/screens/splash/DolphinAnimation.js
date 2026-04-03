import React from 'react';
import { Animated, StyleSheet, Dimensions } from 'react-native';
import { colors } from '../../theme';

const { width, height } = Dimensions.get('window');

export default function DolphinAnimation({ dolphinX, dolphinY, rotateInterpolation, hiOpacity }) {
  return (
    <>
      <Animated.Image
        source={require('../../../assets/images/Dolphin.png')}
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
        accessibilityLabel="Eloqua dolphin mascot"
      />

      {/* "Hi!" greeting — fades in when the dolphin arrives, fades out as it leaves */}
      <Animated.Text style={[styles.hiText, { opacity: hiOpacity }]}>
        Hi!
      </Animated.Text>
    </>
  );
}

const styles = StyleSheet.create({
  dolphin: {
    width: 160,
    height: 110,
    position: 'absolute',
  },

  hiText: {
    position: 'absolute',
    top: height - 300,
    left: width * 0.42,
    fontSize: 36,
    fontWeight: '700',
    color: colors.onboarding.darkTeal,
    letterSpacing: 1,
  },
});
