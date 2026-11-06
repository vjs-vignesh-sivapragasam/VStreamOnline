import React, { useEffect } from 'react';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTheme } from '@/contexts/ThemeContext';
import { router, usePathname, useSegments } from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'youtube',
};

// Global flag to ensure default YouTube tab selection only fires once on app launch
let hasNavigatedOnLaunch = false;

export default function TabLayout() {
  const { theme } = useTheme();
  const pathname = usePathname();
  const segments = useSegments();

  useEffect(() => {
    if (!hasNavigatedOnLaunch) {
      hasNavigatedOnLaunch = true;
      const isDefaultLaunch =
        pathname === '/' ||
        pathname === '' ||
        pathname === '/(tabs)' ||
        pathname === '/(tabs)/' ||
        pathname === '/index' ||
        (segments.length === 1 && segments[0] === '(tabs)');

      if (isDefaultLaunch) {
        router.replace('/(tabs)/youtube' as any);
      }
    }
  }, [pathname, segments]);

  return (
    <NativeTabs
      minimizeBehavior="onScrollDown"
      tintColor={theme.primary}
      indicatorColor={theme.indicator}
      rippleColor={theme.ripple}
      iconColor={{
        default: '#8E8E93',
        selected: theme.primary,
      }}
      labelStyle={{
        default: { color: '#8E8E93' },
        selected: { color: theme.primary },
      }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house" drawable="ic_home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="search">
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" drawable="ic_search" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="youtube">
        <NativeTabs.Trigger.Label>YouTube</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="play.rectangle.fill" drawable="ic_media_play" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="library">
        <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="square.stack" drawable="ic_library_books" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape" drawable="ic_settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
