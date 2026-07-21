/**
 * ScreenHeader — shared header for all content screens.
 *
 * Layout (two rows):
 *   Row 1: [← back button]        [optional rightAction]
 *   Row 2: [Screen title]
 *
 * This keeps the back button and title visually separate so the title
 * has room to breathe instead of being squeezed into a three-column row.
 * It also allows an optional right-side action (e.g. SpeakerButton)
 * without crowding the title.
 *
 * Props:
 *   navigation   — React Navigation nav object (required)
 *   title        — string displayed as the screen heading
 *   onBack       — optional custom back handler (defaults to navigation.goBack())
 *   backLabel    — accessibility label for back button (default "Go back")
 *   backIcon     — override the back arrow character (default '←')
 *   rightAction  — optional JSX rendered top-right (e.g. <SpeakerButton />)
 *   subtitle     — optional secondary line below the title
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ScreenHeader({
  navigation,
  title,
  onBack,
  backLabel    = 'Go back',
  backIcon     = '←',
  rightAction,
  subtitle,
  titleCentered = false,
}) {
  const { top } = useSafeAreaInsets();

  function handleBack() {
    if (onBack) {
      onBack();
    } else {
      navigation.goBack();
    }
  }

  return (
    <View style={[styles.wrap, { paddingTop: top + 20 }]}>

      {/* Row 1: back button on the left, optional action on the right */}
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBack}
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backArrow}>{backIcon}</Text>
        </TouchableOpacity>

        {/* Right action — speaker button, settings icon, etc. When absent, a */}
        {/* spacer keeps the back button left-anchored without flex-centering. */}
        {rightAction
          ? rightAction
          : <View style={styles.rightSpacer} />
        }
      </View>

      {/* Row 2: title (and optional subtitle) below the back button */}
      <Text
        style={[styles.title, titleCentered && styles.titleCentered]}
        numberOfLines={2}
        adjustsFontSizeToFit
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.subtitle}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  backBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '300',
    includeFontPadding: false,
    lineHeight: 24,
    textAlign: 'center',
  },

  // Mirrors back button width so title doesn't skew left when there's no right action
  rightSpacer: {
    width: 52,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.2,
    lineHeight: 34,
  },
  titleCentered: {
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 23,
    marginTop: 4,
  },
});
