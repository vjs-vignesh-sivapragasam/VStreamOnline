import React from 'react';
import { Label, Icon } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export default function TabLayout() {
  return (
    <NativeTabs minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index">
        <Label>Home</Label>
        <Icon sf="house" drawable="ic_home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="search">
        <Label>Search</Label>
        <Icon sf="magnifyingglass" drawable="ic_search" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="library">
        <Label>Library</Label>
        <Icon sf="square.stack" drawable="ic_library_books" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <Label>Settings</Label>
        <Icon sf="gearshape" drawable="ic_settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}