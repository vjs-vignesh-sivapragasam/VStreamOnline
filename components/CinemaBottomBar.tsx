import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import { useTheme } from '@/contexts/ThemeContext';

interface TabItemConfig {
  name: string;
  label: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
}

const TAB_CONFIGS: Record<string, TabItemConfig> = {
  index: {
    name: 'index',
    label: 'Home',
    activeIcon: 'home',
    inactiveIcon: 'home-outline',
  },
  search: {
    name: 'search',
    label: 'Search',
    activeIcon: 'search',
    inactiveIcon: 'search-outline',
  },
  youtube: {
    name: 'youtube',
    label: 'YouTube',
    activeIcon: 'logo-youtube',
    inactiveIcon: 'logo-youtube',
  },
  library: {
    name: 'library',
    label: 'Library',
    activeIcon: 'library',
    inactiveIcon: 'library-outline',
  },
  settings: {
    name: 'settings',
    label: 'Settings',
    activeIcon: 'settings',
    inactiveIcon: 'settings-outline',
  },
};

export interface CinemaBottomBarProps {
  state: {
    index: number;
    routes: Array<{
      key: string;
      name: string;
      params?: object;
    }>;
  };
  descriptors?: any;
  emitter?: any;
  navigateToTab?: (routeKey: string) => void;
  navigation?: any;
  insets?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

export default function CinemaBottomBar({
  state,
  emitter,
  navigateToTab,
  navigation,
  insets: propInsets,
}: CinemaBottomBarProps) {
  const { theme } = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const insets = propInsets || safeAreaInsets;
  const bottomPadding = Math.max(insets?.bottom ?? 0, Platform.OS === 'android' ? 10 : 8);

  return (
    <View style={[styles.wrapper, { paddingBottom: bottomPadding }]}>
      {/* Dark Obsidian Glass Background */}
      <BlurView
        intensity={Platform.OS === 'android' ? 30 : 60}
        tint="dark"
        style={StyleSheet.absoluteFill}
      >
        <View style={styles.obsidianOverlay} />
      </BlurView>

      {/* Top Ambient Glow Line */}
      <LinearGradient
        colors={[
          'rgba(0, 0, 0, 0)',
          theme.indicator,
          'rgba(255, 255, 255, 0.22)',
          theme.indicator,
          'rgba(0, 0, 0, 0)',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topGlowLine}
      />

      {/* Tabs Row */}
      <View style={styles.tabRow}>
        {state.routes.map((route, index: number) => {
          const isFocused = state.index === index;
          const config = TAB_CONFIGS[route.name] || {
            name: route.name,
            label: route.name,
            activeIcon: 'square' as const,
            inactiveIcon: 'square-outline' as const,
          };

          const handlePress = () => {
            if (isHapticsSupported()) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            }

            const event = emitter?.emit
              ? emitter.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                  data: undefined,
                })
              : navigation?.emit?.({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });

            if (!isFocused && !event?.defaultPrevented) {
              if (navigateToTab) {
                navigateToTab(route.key);
              } else if (navigation?.navigate) {
                navigation.navigate(route.name, route.params);
              }
            }
          };

          const handleLongPress = () => {
            if (emitter?.emit) {
              emitter.emit({
                type: 'tabLongPress',
                target: route.key,
                canPreventDefault: false,
                data: undefined,
              });
            } else if (navigation?.emit) {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
                canPreventDefault: false,
              });
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={config.label}
              onPress={handlePress}
              onLongPress={handleLongPress}
              style={({ pressed }) => [
                styles.tabButton,
                pressed && styles.tabButtonPressed,
              ]}
            >
              {/* Active Top Micro-Beam Indicator */}
              <View style={styles.indicatorContainer}>
                {isFocused ? (
                  <View
                    style={[
                      styles.activeBeam,
                      {
                        backgroundColor: theme.primary,
                        shadowColor: theme.glow,
                      },
                    ]}
                  />
                ) : (
                  <View style={styles.inactiveBeam} />
                )}
              </View>

              {/* Illuminated Icon Capsule */}
              <View
                style={[
                  styles.iconCapsule,
                  isFocused && [
                    styles.iconCapsuleActive,
                    {
                      backgroundColor: theme.iconBg,
                      borderColor: theme.cardBorder,
                    },
                  ],
                ]}
              >
                <Ionicons
                  name={isFocused ? config.activeIcon : config.inactiveIcon}
                  size={21}
                  color={isFocused ? theme.primary : '#71717A'}
                />
              </View>

              {/* Label */}
              <Text
                style={[
                  styles.tabLabel,
                  isFocused
                    ? [styles.tabLabelActive, { color: theme.primaryLight || theme.primary }]
                    : styles.tabLabelInactive,
                ]}
                numberOfLines={1}
              >
                {config.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    backgroundColor: 'rgba(10, 10, 14, 0.96)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    elevation: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
  },
  obsidianOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 10, 14, 0.88)',
  },
  topGlowLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 3,
    height: 58,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    paddingVertical: 1,
  },
  tabButtonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.94 }],
  },
  indicatorContainer: {
    height: 3,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 2,
  },
  activeBeam: {
    width: 22,
    height: 2.5,
    borderRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  inactiveBeam: {
    width: 22,
    height: 2.5,
    backgroundColor: 'transparent',
  },
  iconCapsule: {
    paddingHorizontal: 14,
    paddingVertical: 3,
    borderRadius: 14,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCapsuleActive: {
    borderWidth: 1,
  },
  tabLabel: {
    fontSize: 10.5,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    fontWeight: '700',
  },
  tabLabelInactive: {
    color: '#71717A',
    fontWeight: '500',
  },
});
