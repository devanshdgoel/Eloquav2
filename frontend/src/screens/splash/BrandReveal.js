import React from 'react';
import { Animated, Dimensions, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';

const { width } = Dimensions.get('window');

export default function BrandReveal({ thisIsOpacity, logoOpacity, taglineOpacity, bubblesOpacity }) {
  return (
    <View style={styles.mainContent}>
      <Animated.Text style={[styles.thisIsText, { opacity: thisIsOpacity }]}>
        This is
      </Animated.Text>

      <Animated.Text style={[styles.eloquaText, { opacity: logoOpacity }]}>
        Eloqua
      </Animated.Text>

      <Animated.View style={[styles.taglineContainer, { opacity: taglineOpacity }]}>
        <Animated.Image
          source={require('../../../assets/images/bubbles-left.png')}
          style={[styles.bubblesLeft, { opacity: bubblesOpacity }]}
          resizeMode="contain"
        />
        <Text style={styles.taglineText}>
          Express{'\n'}yourself{'\n'}<Text style={styles.taglineBold}>your  way</Text>
        </Text>
        <Animated.Image
          source={require('../../../assets/images/bubbles-right.png')}
          style={[styles.bubblesRight, { opacity: bubblesOpacity }]}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 340,
  },
  thisIsText: {
    fontSize: 38,
    color: colors.splash.text,
    marginBottom: -5,
    fontWeight: '300',
    alignSelf: 'flex-start',
    marginLeft: width * 0.1,
  },
  eloquaText: {
    fontSize: 68,
    fontWeight: '600',
    color: colors.splash.text,
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
    color: colors.splash.text,
    textAlign: 'center',
    lineHeight: 34,
    fontWeight: '300',
  },
  taglineBold: {
    fontWeight: '700',
    letterSpacing: 2,
  },
});
