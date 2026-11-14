export type ThemeId = 'yellow' | 'orange' | 'purple' | 'blue' | 'green' | 'red' | 'white' | 'accent';

export interface AppTheme {
  id: ThemeId;
  name: string;
  displayName: string;
  subtitle: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  cardBorder: string;
  iconBg: string;
  indicator: string;
  ripple: string;
  glow: string;
  gradientColors: [string, string, string];
}

export const THEMES: Record<ThemeId, AppTheme> = {
  purple: {
    id: 'purple',
    name: 'Purple',
    displayName: 'Purple',
    subtitle: 'Classic Violet',
    primary: '#535aff',
    primaryLight: '#7b82ff',
    primaryDark: '#383ec7',
    cardBorder: 'rgba(83, 90, 255, 0.25)',
    iconBg: 'rgba(83, 90, 255, 0.15)',
    indicator: 'rgba(83, 90, 255, 0.35)',
    ripple: 'rgba(83, 90, 255, 0.2)',
    glow: 'rgba(83, 90, 255, 0.45)',
    gradientColors: ['#000000', '#0a0b1f', '#121438'],
  },
  blue: {
    id: 'blue',
    name: 'Blue',
    displayName: 'Ocean Blue',
    subtitle: 'Ocean Blue',
    primary: '#0A84FF',
    primaryLight: '#409CFF',
    primaryDark: '#0062CC',
    cardBorder: 'rgba(10, 132, 255, 0.25)',
    iconBg: 'rgba(10, 132, 255, 0.15)',
    indicator: 'rgba(10, 132, 255, 0.35)',
    ripple: 'rgba(10, 132, 255, 0.2)',
    glow: 'rgba(10, 132, 255, 0.4)',
    gradientColors: ['#000000', '#001126', '#001c3d'],
  },
  green: {
    id: 'green',
    name: 'Green',
    displayName: 'Emerald Green',
    subtitle: 'Emerald Mint',
    primary: '#10B981',
    primaryLight: '#34D399',
    primaryDark: '#059669',
    cardBorder: 'rgba(16, 185, 129, 0.25)',
    iconBg: 'rgba(16, 185, 129, 0.15)',
    indicator: 'rgba(16, 185, 129, 0.35)',
    ripple: 'rgba(16, 185, 129, 0.2)',
    glow: 'rgba(16, 185, 129, 0.4)',
    gradientColors: ['#000000', '#001a0e', '#012817'],
  },
  yellow: {
    id: 'yellow',
    name: 'Yellow',
    displayName: 'Yellow',
    subtitle: 'Vibrant Amber',
    primary: '#FFB800',
    primaryLight: '#FFCA3A',
    primaryDark: '#D99B00',
    cardBorder: 'rgba(255, 184, 0, 0.25)',
    iconBg: 'rgba(255, 184, 0, 0.15)',
    indicator: 'rgba(255, 184, 0, 0.35)',
    ripple: 'rgba(255, 184, 0, 0.2)',
    glow: 'rgba(255, 184, 0, 0.4)',
    gradientColors: ['#000000', '#1a1300', '#261b00'],
  },
  orange: {
    id: 'orange',
    name: 'Orange',
    displayName: 'Sunset Orange',
    subtitle: 'Vibrant Sunset',
    primary: '#FF6D00',
    primaryLight: '#FF9E40',
    primaryDark: '#D65100',
    cardBorder: 'rgba(255, 109, 0, 0.25)',
    iconBg: 'rgba(255, 109, 0, 0.15)',
    indicator: 'rgba(255, 109, 0, 0.35)',
    ripple: 'rgba(255, 109, 0, 0.2)',
    glow: 'rgba(255, 109, 0, 0.45)',
    gradientColors: ['#000000', '#1a0c00', '#261200'],
  },
  white: {
    id: 'white',
    name: 'White',
    displayName: 'Pure White',
    subtitle: 'Minimal Monochrome',
    primary: '#FFFFFF',
    primaryLight: '#F5F5F7',
    primaryDark: '#D1D1D6',
    cardBorder: 'rgba(255, 255, 255, 0.25)',
    iconBg: 'rgba(255, 255, 255, 0.12)',
    indicator: 'rgba(255, 255, 255, 0.35)',
    ripple: 'rgba(255, 255, 255, 0.2)',
    glow: 'rgba(255, 255, 255, 0.35)',
    gradientColors: ['#000000', '#121214', '#1c1c1f'],
  },
  red: {
    id: 'red',
    name: 'Red',
    displayName: 'Red',
    subtitle: 'Crimson Red',
    primary: '#FF3B30',
    primaryLight: '#FF6961',
    primaryDark: '#D7261E',
    cardBorder: 'rgba(255, 59, 48, 0.25)',
    iconBg: 'rgba(255, 59, 48, 0.15)',
    indicator: 'rgba(255, 59, 48, 0.35)',
    ripple: 'rgba(255, 59, 48, 0.2)',
    glow: 'rgba(255, 59, 48, 0.4)',
    gradientColors: ['#000000', '#1a0406', '#26070a'],
  },
  accent: {
    id: 'accent',
    name: 'Accent',
    displayName: 'Accent (Apple Music Pink)',
    subtitle: 'Apple Music Pink',
    primary: '#FA2D48',
    primaryLight: '#FF5970',
    primaryDark: '#D91B35',
    cardBorder: 'rgba(250, 45, 72, 0.25)',
    iconBg: 'rgba(250, 45, 72, 0.15)',
    indicator: 'rgba(250, 45, 72, 0.35)',
    ripple: 'rgba(250, 45, 72, 0.2)',
    glow: 'rgba(250, 45, 72, 0.4)',
    gradientColors: ['#000000', '#1a040b', '#260611'],
  },
};

export const DEFAULT_THEME_ID: ThemeId = 'yellow';

export function getTheme(id?: string | null): AppTheme {
  if (id && id in THEMES) {
    return THEMES[id as ThemeId];
  }
  return THEMES[DEFAULT_THEME_ID];
}

export default {
  light: {
    text: '#000',
    background: '#fff',
    tint: THEMES.yellow.primary,
    tabIconDefault: '#ccc',
    tabIconSelected: THEMES.yellow.primary,
  },
  dark: {
    text: '#fff',
    background: '#000',
    tint: THEMES.yellow.primary,
    tabIconDefault: '#ccc',
    tabIconSelected: THEMES.yellow.primary,
  },
};
