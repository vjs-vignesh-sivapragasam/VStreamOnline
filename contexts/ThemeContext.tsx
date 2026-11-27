import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { StorageKeys, storageService } from '@/utils/StorageService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppTheme, THEMES, ThemeId, DEFAULT_THEME_ID, getTheme } from '@/constants/Colors';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';

export interface ThemeContextType {
  themeId: ThemeId;
  theme: AppTheme;
  setThemeId: (id: ThemeId) => Promise<void>;
  resetToDefault: () => Promise<void>;
  availableThemes: AppTheme[];
  isCurrent: (id: ThemeId) => boolean;
}

const fallbackTheme: AppTheme = (THEMES && THEMES[DEFAULT_THEME_ID]) || {
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
};

const ThemeContext = createContext<ThemeContextType>({
  themeId: DEFAULT_THEME_ID,
  theme: fallbackTheme,
  setThemeId: async () => {},
  resetToDefault: async () => {},
  availableThemes: THEMES ? Object.values(THEMES) : [fallbackTheme],
  isCurrent: (id) => id === DEFAULT_THEME_ID,
});

export const AppThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeId, setThemeIdState] = useState<ThemeId>(() => {
    try {
      const saved = storageService.getItem(StorageKeys.THEME_KEY);
      if (saved && saved in THEMES) {
        return saved as ThemeId;
      }
    } catch {
      // Storage might not be hydrated yet
    }
    return DEFAULT_THEME_ID;
  });

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const stored = await storageService.getItemAsync(StorageKeys.THEME_KEY);
        if (isMounted) {
          if (stored && stored in THEMES) {
            if (stored !== themeId) {
              setThemeIdState(stored as ThemeId);
            }
          } else {
            // First run: explicitly save yellow as default theme
            storageService.setItem(StorageKeys.THEME_KEY, DEFAULT_THEME_ID);
            await AsyncStorage.setItem(StorageKeys.THEME_KEY, DEFAULT_THEME_ID);
          }
        }
      } catch {
        // Fallback catch
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const setThemeId = useCallback(async (id: ThemeId) => {
    if (!THEMES[id]) return;
    setThemeIdState(id);

    try {
      storageService.setItem(StorageKeys.THEME_KEY, id);
      await AsyncStorage.setItem(StorageKeys.THEME_KEY, id);
    } catch (e) {
      console.warn('[ThemeContext] Failed to save theme to storage:', e);
    }

    try {
      if (await isHapticsSupported()) {
        await Haptics.selectionAsync();
      }
    } catch {
      // Ignore haptics error
    }
  }, []);

  const resetToDefault = useCallback(async () => {
    await setThemeId(DEFAULT_THEME_ID);
  }, [setThemeId]);

  const theme = useMemo(() => getTheme(themeId) || fallbackTheme, [themeId]);
  const isCurrent = useCallback((id: ThemeId) => id === themeId, [themeId]);
  const availableThemes = useMemo(() => (THEMES ? Object.values(THEMES) : [fallbackTheme]), []);

  const contextValue = useMemo(
    () => ({
      themeId,
      theme,
      setThemeId,
      resetToDefault,
      availableThemes,
      isCurrent,
    }),
    [themeId, theme, setThemeId, resetToDefault, availableThemes, isCurrent]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
