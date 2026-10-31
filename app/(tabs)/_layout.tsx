import React from 'react';
import { Tabs } from 'expo-router';
import CinemaBottomBar from '@/components/CinemaBottomBar';

export default function TabLayout() {
  console.log('[TABS_BOOT] 1. TabLayout rendering CinemaBottomBar component');
  return (
    <Tabs
      tabBar={(props) => <CinemaBottomBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />

      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
        }}
      />

      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
        }}
      />
    </Tabs>
  );
}
