import { StyleSheet, Text, View } from 'react-native';
import SpeechEnhancementScreen from './SpeechEnhancementScreen';

export default function SpeechDemoScreen({ navigation }) {
  return (
    <View style={styles.root}>
      <SpeechEnhancementScreen navigation={navigation} />
      <View style={styles.badge} pointerEvents="none">
        <Text style={styles.badgeText}>DEMO</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  badge: {
    position: 'absolute',
    top: 52,
    right: 20,
    backgroundColor: '#FE9C2D',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});
