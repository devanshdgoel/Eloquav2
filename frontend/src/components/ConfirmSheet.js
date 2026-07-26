/**
 * ConfirmSheet — shared bottom-sheet confirmation component.
 *
 * Replaces bare Alert.alert calls for leave-guard and save-error dialogs.
 * Alert is not styleable and its buttons are ordered differently on iOS vs
 * Android, making it hard to keep consistent UX. ConfirmSheet slides up
 * from the bottom with a native-feeling spring animation and uses the
 * same dark-teal card style as CantDoNow.
 *
 * Usage:
 *   const [sheetConfig, setSheetConfig] = useState(null);
 *   // Show:
 *   setSheetConfig({
 *     title:   'Leave session?',
 *     body:    "Your progress won't be saved if you leave now.",
 *     actions: [
 *       { label: 'Stay',  onPress: () => setSheetConfig(null) },
 *       { label: 'Leave', destructive: true, onPress: () => { ... } },
 *     ],
 *   });
 *   // In JSX:
 *   <ConfirmSheet config={sheetConfig} onDismiss={() => setSheetConfig(null)} />
 *
 * Props:
 *   config    — object with { title, body, actions[] } or null (hidden when null)
 *   onDismiss — called when the backdrop is tapped
 */
import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';

const { height: H } = Dimensions.get('window');

export default function ConfirmSheet({ config, onDismiss }) {
  // slideAnim drives the vertical position of the sheet.
  // Starts off-screen below H, springs up to 0 when visible.
  const slideAnim = useRef(new Animated.Value(H)).current;
  const bgAnim    = useRef(new Animated.Value(0)).current;

  const visible = config != null;

  useEffect(() => {
    if (visible) {
      // Open: spring the sheet up and fade the backdrop in.
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 14, useNativeDriver: true }),
        Animated.timing(bgAnim,   { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      // Close: slide the sheet back down and fade the backdrop out.
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: H, duration: 220, useNativeDriver: true }),
        Animated.timing(bgAnim,    { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  // The modal must remain mounted while the close animation plays.
  // We keep it open when config is null but slideAnim has not yet settled.
  const [modalVisible, setModalVisible] = React.useState(false);

  useEffect(() => {
    if (visible) {
      // Show the modal immediately when a config arrives.
      setModalVisible(true);
    } else {
      // Hide the modal only after the close animation finishes (220 ms).
      const t = setTimeout(() => setModalVisible(false), 250);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!modalVisible) return null;

  return (
    <Modal visible={modalVisible} transparent statusBarTranslucent animationType="none">
      {/* Backdrop — tap to dismiss */}
      <Animated.View style={[sheet.backdrop, { opacity: bgAnim }]} pointerEvents="box-none">
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          onPress={onDismiss}
          activeOpacity={1}
        />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[sheet.card, { transform: [{ translateY: slideAnim }] }]}>
        {/* Drag handle */}
        <View style={sheet.handle} />

        {config?.title ? (
          <Text style={sheet.title}>{config.title}</Text>
        ) : null}

        {config?.body ? (
          <Text style={sheet.body}>{config.body}</Text>
        ) : null}

        {/* Action buttons — rendered bottom-to-top so the safe primary action
            (e.g. "Stay" / "Try again") is always at the top of the list,
            and the destructive action (e.g. "Leave" / "Go home") is below it. */}
        {(config?.actions ?? []).map((action, i) => (
          <TouchableOpacity
            key={i}
            style={[sheet.btn, action.destructive && sheet.btnDestructive]}
            onPress={action.onPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Text style={[sheet.btnText, action.destructive && sheet.btnTextDestructive]}>
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
    </Modal>
  );
}

const sheet = StyleSheet.create({
  // Semi-transparent dark backdrop behind the sheet.
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  // Bottom sheet card — same dark-teal surface as CantDoNow.
  card: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#132A30',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 28,
    paddingBottom: 40,
    paddingTop: 16,
    borderTopWidth: 1,
    borderColor: 'rgba(195,222,206,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 24,
    gap: 12,
  },

  // Drag handle — centred pill at the top of the sheet.
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignSelf: 'center',
    marginBottom: 12,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  body: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: 0.2,
  },

  // Default (non-destructive) action — teal card.
  btn: {
    backgroundColor: '#2D6974',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(195,222,206,0.18)',
  },
  // Destructive action — orange, matches the CTA style so it stands out.
  btnDestructive: {
    backgroundColor: 'rgba(255,169,64,0.15)',
    borderColor: 'rgba(255,169,64,0.35)',
  },

  btnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  btnTextDestructive: {
    color: '#FFA940',
    fontWeight: '700',
  },
});
