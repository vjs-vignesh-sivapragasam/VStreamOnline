import React from 'react';
import { Tabs } from 'expo-router';
import CinemaBottomBar from '@/components/CinemaBottomBar';

export const unstable_settings = {
  initialRouteName: 'youtube',
};

export default function TabLayout() {
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
        name="youtube"
        options={{
          title: 'YouTube',
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
