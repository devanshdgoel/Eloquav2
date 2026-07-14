/**
 * SpeakerButton — read-aloud button using expo-speech.
 *
 * Reads the `text` prop aloud when tapped; tapping again stops playback.
 * Rate is slightly reduced (0.88) to suit Parkinson's users who may benefit
 * from a slightly slower playback.
 * Automatically stops when the component unmounts (e.g. screen change).
 *
 * Props:
 *   text   — the string to speak when tapped
 *   size   — button diameter in px (default 52)
 *   style  — optional extra style on the outer touchable
 */
import React, { useState, useEffect } from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import * as Speech from 'expo-speech';
import Svg, { Path, Rect } from 'react-native-svg';

const ORANGE = '#FFA940';
const WHITE  = '#FFFFFF';

// Simple speaker-wave icon drawn in SVG
function SpeakerIcon({ active }) {
  const color = active ? ORANGE : WHITE;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      {/* Speaker cone */}
      <Path
        d="M3 9H7L13 4V20L7 15H3V9Z"
        fill={color}
        opacity={0.95}
      />
      {/* Sound waves — only drawn when active */}
      {active ? (
        <>
          <Path
            d="M16 8.5C17.5 10 17.5 14 16 15.5"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          <Path
            d="M18.5 6C21 8.5 21 15.5 18.5 18"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </>
      ) : (
        <Path
          d="M16 8.5C17.5 10 17.5 14 16 15.5"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          opacity={0.55}
        />
      )}
    </Svg>
  );
}

export default function SpeakerButton({ text, size = 52, style }) {
  const [speaking, setSpeaking] = useState(false);

  // Stop speech when the component unmounts — prevents audio leaking
  // when the user navigates away mid-playback.
  useEffect(() => {
    return () => {
      Speech.stop().catch(() => {});
    };
  }, []);

  async function handlePress() {
    if (speaking) {
      await Speech.stop();
      setSpeaking(false);
      return;
    }

    if (!text) return;

    setSpeaking(true);
    Speech.speak(text, {
      rate:  0.88,  // slightly slower for Parkinson's users
      pitch: 1.0,
      onDone:    () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError:   () => setSpeaking(false),
    });
  }

  const btnSize = size;

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        {
          width: btnSize,
          height: btnSize,
          borderRadius: btnSize / 2,
          borderColor: speaking
            ? 'rgba(255,169,64,0.55)'
            : 'rgba(255,255,255,0.20)',
          backgroundColor: speaking
            ? 'rgba(255,169,64,0.14)'
            : 'rgba(255,255,255,0.10)',
        },
        style,
      ]}
      onPress={handlePress}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={speaking ? 'Stop reading aloud' : 'Read aloud'}
      accessibilityState={{ selected: speaking }}
    >
      <SpeakerIcon active={speaking} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
