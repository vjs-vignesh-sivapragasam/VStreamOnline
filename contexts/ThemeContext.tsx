import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

const ThemeContext = createContext<ThemeContextType>({
  themeId: DEFAULT_THEME_ID,
  theme: THEMES[DEFAULT_THEME_ID],
  setThemeId: async () => {},
  resetToDefault: async () => {},
  availableThemes: Object.values(THEMES),
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
            // First run: explicitly save purple as default theme
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

  const theme = getTheme(themeId);
  const isCurrent = useCallback((id: ThemeId) => id === themeId, [themeId]);

  return (
    <ThemeContext.Provider
      value={{
        themeId,
        theme,
        setThemeId,
        resetToDefault,
        availableThemes: Object.values(THEMES),
        isCurrent,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
