/**
 * TabBar — persistent bottom navigation for the three main screens.
 *
 * Active tab gets an orange pill background + a spring-animated scale bounce
 * on mount so the indicator feels responsive. Using forNoAnimation on the
 * stack transitions means this bar appears fixed while the content behind it
 * changes — giving a native tab-bar effect.
 */
import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ORANGE   = '#FFA940';
const WHITE    = '#FFFFFF';
const TAB_BG   = '#111D1F';
const INACTIVE = 'rgba(255,255,255,0.45)';

const TAB_ICONS = {
  settings: require('../../assets/images/GearIcon.png'),
  home:     require('../../assets/images/HomeIcon.png'),
  progress: require('../../assets/images/TrophyIcon.png'),
};
const TAB_LABELS = {
  settings: 'Settings',
  home:     'Home',
  progress: 'Progress',
};
const TABS = ['settings', 'home', 'progress'];

// Individual tab button with a spring-pop animation when it becomes active.
function TabButton({ tab, isActive, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;

  // Spring-pop the active icon on mount so the user sees responsive feedback.
  useEffect(() => {
    if (!isActive) return;
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.18, useNativeDriver: true, tension: 280, friction: 10 }),
      Animated.spring(scale, { toValue: 1.00, useNativeDriver: true, tension: 120, friction: 8 }),
    ]).start();
  }, []); // only on mount — avoids re-firing when sibling tabs re-render

  const isHome = tab === 'home';

  return (
    <TouchableOpacity
      style={styles.tabBtn}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={TAB_LABELS[tab]}
    >
      {/* Orange pill background — visible only on active tab */}
      {isActive && <View style={styles.activePill} />}

      <Animated.Image
        source={TAB_ICONS[tab]}
        style={[
          styles.icon,
          isHome && styles.iconHome,
          { tintColor: isActive ? ORANGE : INACTIVE },
          { transform: [{ scale }] },
        ]}
        resizeMode="contain"
      />
      <Text style={[styles.label, { color: isActive ? ORANGE : INACTIVE }]}>
        {TAB_LABELS[tab]}
      </Text>
    </TouchableOpacity>
  );
}

export default function TabBar({ navigation, activeTab }) {
  const { bottom: safeBottom } = useSafeAreaInsets();

  function handlePress(tab) {
    if (tab === activeTab) return;
    navigation.navigate(
      tab === 'settings' ? 'Settings'
      : tab === 'progress' ? 'Progress'
      : 'Home'
    );
  }

  return (
    <View style={[styles.bar, { paddingBottom: safeBottom, height: 72 + safeBottom }]}>
      {TABS.map(tab => (
        <TabButton
          key={tab}
          tab={tab}
          isActive={tab === activeTab}
          onPress={() => handlePress(tab)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: TAB_BG,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: 'rgba(195,222,206,0.10)',
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    gap: 4,
  },
  // Semi-transparent orange pill sits behind the icon + label of the active tab
  activePill: {
    position: 'absolute',
    top: 6,
    width: 56,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,169,64,0.13)',
  },
  icon: {
    width: 26,
    height: 26,
  },
  iconHome: {
    width: 30,
    height: 30,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
