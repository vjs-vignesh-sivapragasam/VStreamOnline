import '@/utils/crashLogger';
import { AppCrashErrorBoundary } from '@/utils/crashLogger';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, Theme, ThemeProvider } from 'expo-router/react-navigation';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { ActionSheetProvider } from '@expo/react-native-action-sheet';
import { PlayerSelectionModal } from '@/components/PlayerSelectionModal';
import { startEmbeddedNodeServer } from '@/utils/StremioServerManager';

console.log('[APP_BOOT] 1. Root layout module loaded');

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync().catch((e) => {
  console.warn('[APP_BOOT] preventAutoHideAsync warning:', e);
});

export default function RootLayout() {
  console.log('[APP_BOOT] 2. RootLayout rendering');

  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) {
      console.error('[APP_BOOT] Font load error caught:', error);
      throw error;
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      console.log('[APP_BOOT] 3. Fonts loaded, hiding splash screen');
      SplashScreen.hideAsync().catch((e) => console.warn('[APP_BOOT] hideAsync warning:', e));
    }
  }, [loaded]);

  if (!loaded) {
    console.log('[APP_BOOT] 2b. Fonts not loaded yet, returning null splash');
    return null;
  }

  console.log('[APP_BOOT] 5. Mounting RootLayoutNav within AppCrashErrorBoundary');
  return (
    <AppCrashErrorBoundary>
      <RootLayoutNav />
    </AppCrashErrorBoundary>
  );
}

// Custom header background component
const HeaderBackground = () => (
  <BlurView intensity={20} style={styles.headerBlur}>
    <View style={styles.headerGlass} />
  </BlurView>
);

// Custom header background component for invisible header
const InvisibleHeaderBackground = () => (
  <View style={{ flex: 1, backgroundColor: 'transparent' }} />
);

function RootLayoutNav() {

  const GlassDarkTheme: Theme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: '#0a0a0a',
      card: 'rgba(18, 18, 18, 0.9)',
      border: 'rgba(255, 255, 255, 0.1)',
    }
  };

  const theme = GlassDarkTheme;

  return (
    <View style={styles.container}>
      {/* Global Background Gradient */}
      <LinearGradient
        colors={['#000000', '#333333', '#666666']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.backgroundGradient}
      />

      <ActionSheetProvider>
        <ThemeProvider value={theme}>
          <Stack
            screenOptions={{
              headerStyle: styles.glassHeader,
              headerBackground: HeaderBackground,
              contentStyle: styles.screenContent,
            }}
          >
            <Stack.Screen
              name="(tabs)"
              options={{
                headerShown: false,
                headerTransparent: true,
                headerBackground: InvisibleHeaderBackground,
                headerShadowVisible: false,
                headerTitle: '',
                headerTintColor: '#ffffff',
                headerBackTitle: '',
                title: 'Home',
                contentStyle: { backgroundColor: 'transparent' } // Only tabs can be transparent
              }}
            />
            <Stack.Screen
              name="browser"
              options={{
                headerShown: false,
                headerTransparent: true,
                headerBackground: InvisibleHeaderBackground,
              }}
            />
            <Stack.Screen
              name="torrent/details"
              options={{
                headerShown: true,
                headerTransparent: true,
                headerBackground: InvisibleHeaderBackground,
                headerTitle: '',
                headerTintColor: '#ffffff',
                headerBackTitle: '',
                headerShadowVisible: false,
                headerStyle: {
                  backgroundColor: 'transparent',
                }
              }}
            />
            <Stack.Screen
              name="torrent/list"
              options={{
                headerShown: true,
                headerTransparent: true,
                headerBackground: InvisibleHeaderBackground,
                headerTitle: '',
                headerTintColor: '#ffffff',
                headerBackTitle: '',
                headerShadowVisible: false,
                headerStyle: {
                  backgroundColor: 'transparent',
                }
              }}
            />
            <Stack.Screen
              name="torrent/series"
              options={{
                headerShown: true,
                headerTransparent: true,
                headerBackground: InvisibleHeaderBackground,
                headerTitle: '',
                headerTintColor: '#ffffff',
                headerBackTitle: '',
                headerShadowVisible: false,
                headerStyle: {
                  backgroundColor: 'transparent',
                }
              }}
            />
            <Stack.Screen
              name="stream/player"
              options={{
                headerShown: false,
                headerTransparent: true,
                headerBackground: InvisibleHeaderBackground,
                contentStyle: { backgroundColor: '#000000' },
              }}
            />
            <Stack.Screen
              name="settings/tamilmv"
              options={{
                headerShown: true,
                headerTransparent: true,
                headerBackground: InvisibleHeaderBackground,
                headerTitle: '',
                headerTintColor: '#ffffff',
                headerBackTitle: '',
                headerShadowVisible: false,
                headerStyle: {
                  backgroundColor: 'transparent',
                }
              }}
            />
            <Stack.Screen
              name="settings/stremioserver"
              options={{
                headerShown: true,
                headerTransparent: true,
                headerBackground: InvisibleHeaderBackground,
                headerTitle: '',
                headerTintColor: '#ffffff',
                headerBackTitle: '',
                headerShadowVisible: false,
                headerStyle: {
                  backgroundColor: 'transparent',
                }
              }}
            />
            <Stack.Screen
              name="settings/opensubtitles"
              options={{
                headerShown: true,
                headerTransparent: true,
                headerBackground: InvisibleHeaderBackground,
                headerTitle: '',
                headerTintColor: '#ffffff',
                headerBackTitle: '',
                headerShadowVisible: false,
                headerStyle: {
                  backgroundColor: 'transparent',
                }
              }}
            />
          </Stack>
          <PlayerSelectionModal />
        </ThemeProvider>
      </ActionSheetProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFill,
  },
  screenContent: {
  },
  modalContent: {
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  glassHeader: {
    backgroundColor: 'transparent',
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerBlur: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  headerGlass: {
    flex: 1,
    backgroundColor: 'rgba(18, 18, 18, 0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
});

// Enhanced global glass styles for use in other components
export const globalGlassStyles = StyleSheet.create({
  glassContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 12,
    padding: 16,
    margin: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  glassButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  glassOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 10,
    padding: 12,
  },
  glassText: {
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
});