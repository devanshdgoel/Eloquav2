import { Animated, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors } from '../../theme';

export default function SplashButtons({ buttonsOpacity, orTextOpacity, waveLogoOpacity, navigation }) {
  return (
    <>
      <Animated.View style={[styles.buttonsContainer, { opacity: buttonsOpacity }]}>
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => navigation.navigate('SignIn')}
          accessibilityRole="button"
          accessibilityLabel="Login to your account"
        >
          <Text style={styles.loginButtonText}>Login</Text>
        </TouchableOpacity>

        <Animated.Text style={[styles.orText, { opacity: orTextOpacity }]}>
          or
        </Animated.Text>

        <TouchableOpacity
          style={styles.createAccountButton}
          onPress={() => navigation.navigate('SignUp')}
          accessibilityRole="button"
          accessibilityLabel="Create a new account"
        >
          <Text style={styles.createAccountButtonText}>Create new account</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.Image
        source={require('../../../assets/images/wave-logo.png')}
        style={[styles.waveLogo, { opacity: waveLogoOpacity }]}
        resizeMode="contain"
        accessibilityLabel="Eloqua wave logo"
      />
    </>
  );
}

const styles = StyleSheet.create({
  buttonsContainer: {
    position: 'absolute',
    bottom: 100,
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loginButton: {
    backgroundColor: colors.splash.buttonBg,
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
    color: colors.splash.text,
    fontSize: 18,
    fontWeight: '600',
  },
  orText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '400',
    marginVertical: 12,
  },
  createAccountButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.splash.buttonBorder,
    paddingVertical: 14,
    borderRadius: 30,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  createAccountButtonText: {
    color: colors.splash.text,
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
