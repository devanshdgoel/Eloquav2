// Eloqua Design System
// Centralized theme constants used across all screens

export const colors = {
  // Core palette
  background: '#1A1A2E',
  surface: '#2A2A4A',
  surfaceHighlight: '#2A2A5A',
  primary: '#6C63FF',
  white: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0B8',
  textDark: '#1C4047',
  googleBlue: '#4285F4',
  success: '#4CAF50',
  successDark: '#1B3A1B',
  error: '#FF4444',
  errorBright: '#FF0000',
  errorBackground: '#4A1A1A',
  disabled: 'transparent',

  // Splash screen palette
  splash: {
    gradientStart: '#37767A',
    gradientEnd: '#0A1618',
    revealLight: '#E0ECDE',
    revealMid: '#68B39F',
    revealDark: '#418182',
    text: '#1C4047',
    buttonBg: '#FFFFFFDD',
    buttonBorder: '#1C4047',
  },

  // Onboarding screen palette (matches Figma "Final version onboarding")
  onboarding: {
    gradientStart: '#326F77',
    gradientEnd: '#1C4047',
    text: '#1C4047',
    textPlaceholder: 'rgba(28, 64, 71, 0.5)',
    cardBg: '#FFFFFF',
    backBg: '#E0ECDE',
    backBorder: '#37767A',
    accentBg: '#68B39F',
    bubbleBorder: 'rgba(255, 255, 255, 0.45)',
    bubbleFill: 'rgba(255, 255, 255, 0.25)',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 2,
  md: 10,
  lg: 14,
  xl: 16,
  pill: 30,
};

export const typography = {
  heading: {
    fontSize: 28,
    fontWeight: '700',
  },
  headingLarge: {
    fontSize: 32,
    fontWeight: '700',
  },
  subheading: {
    fontSize: 16,
    lineHeight: 24,
  },
  body: {
    fontSize: 16,
  },
  bodySmall: {
    fontSize: 14,
  },
  caption: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },
  button: {
    fontSize: 18,
    fontWeight: '600',
  },
};
