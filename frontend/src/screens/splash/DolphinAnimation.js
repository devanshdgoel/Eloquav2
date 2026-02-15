import { Animated, StyleSheet } from 'react-native';
import { colors } from '../../theme';

export default function DolphinAnimation({ dolphinX, dolphinY, rotateInterpolation, hiOpacity }) {
  return (
    <>
      <Animated.Text style={[styles.hiText, { opacity: hiOpacity }]}>
        Hi!
      </Animated.Text>

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
    fontSize: 64,
    fontWeight: '300',
    color: colors.white,
    position: 'absolute',
    bottom: 180,
    left: '42%',
  },
});
