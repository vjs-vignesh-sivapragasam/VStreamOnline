import React from 'react';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTheme } from '@/contexts/ThemeContext';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function TabLayout() {
  const { theme } = useTheme();

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
