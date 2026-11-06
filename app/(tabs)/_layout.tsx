import React, { useEffect } from 'react';
import { Tabs, router, usePathname, useSegments } from 'expo-router';
import CinemaBottomBar from '@/components/CinemaBottomBar';

export const unstable_settings = {
  initialRouteName: 'youtube',
};

// Global flag to ensure default YouTube tab selection only fires once on app launch
let hasNavigatedOnLaunch = false;

export default function TabLayout() {
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
