/**
 * TabBar — persistent bottom navigation for the three main screens.
 *
 * Renders on Home, Settings, and Progress. The active tab is highlighted in
 * orange; inactive tabs use a dimmed white. Handles safe-area bottom padding
 * so it sits correctly above the home indicator on iPhone.
 */
import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ORANGE    = '#FFA940';
const WHITE     = '#FFFFFF';
const TAB_BG    = '#111D1F';
const INACTIVE  = 'rgba(255,255,255,0.45)';

// Icon assets for each tab — shared with HomeScreen
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

export default function TabBar({ navigation, activeTab }) {
  const { bottom: safeBottom } = useSafeAreaInsets();

  function handlePress(tab) {
    // Don't navigate if already on this tab — avoids stack accumulation.
    if (tab === activeTab) return;
    navigation.navigate(
      tab === 'settings' ? 'Settings'
      : tab === 'progress' ? 'Progress'
      : 'Home'
    );
  }

  return (
    <View style={[styles.bar, { paddingBottom: safeBottom, height: 72 + safeBottom }]}>
      {(['settings', 'home', 'progress']).map(tab => {
        const isActive = tab === activeTab;
        return (
          <TouchableOpacity
            key={tab}
            style={styles.tabBtn}
            onPress={() => handlePress(tab)}
            activeOpacity={0.75}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={TAB_LABELS[tab]}
          >
            <Image
              source={TAB_ICONS[tab]}
              style={[
                styles.icon,
                tab === 'home' && styles.iconHome,
                { tintColor: isActive ? ORANGE : INACTIVE },
              ]}
              resizeMode="contain"
            />
            <Text style={[styles.label, { color: isActive ? ORANGE : INACTIVE }]}>
              {TAB_LABELS[tab]}
            </Text>
          </TouchableOpacity>
        );
      })}
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
