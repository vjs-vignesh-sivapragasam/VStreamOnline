import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Platform, UIManager } from 'react-native';
import Video from 'react-native-video';
import {
  isBackgroundAudioKeepAliveEnabled,
  isScreenKeepAwakeEnabled,
  applyScreenKeepAwake,
  subscribeKeepAliveSettings,
} from '@/utils/StremioKeepAliveManager';

/**
 * Checks whether native Video component (react-native-video) is available.
 */
function isRCTVideoAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return Boolean(
      UIManager.getViewManagerConfig &&
      (UIManager.getViewManagerConfig('RCTVideo') || UIManager.getViewManagerConfig('VideoManager'))
    );
  } catch {
    return false;
  }
}

/**
 * Root-level Keeper component that handles:
 * 1. Silent background audio loop (Option 1): Prevents iOS & Android OS from freezing
 *    the embedded Stremio server when the phone is locked or app is backgrounded.
 * 2. Screen Keep-Awake (Option 2): Prevents the display from auto-sleeping.
 */
export const StremioKeepAliveKeeper: React.FC = () => {
  const [bgAudioEnabled, setBgAudioEnabled] = useState<boolean>(() => isBackgroundAudioKeepAliveEnabled());
  const [screenAwakeEnabled, setScreenAwakeEnabled] = useState<boolean>(() => isScreenKeepAwakeEnabled());
  const hasRCTVideo = isRCTVideoAvailable();

  useEffect(() => {
    // Initial sync
    const initialAwake = isScreenKeepAwakeEnabled();
    const initialBg = isBackgroundAudioKeepAliveEnabled();
    setScreenAwakeEnabled(initialAwake);
    setBgAudioEnabled(initialBg);
    applyScreenKeepAwake(initialAwake);

    const unsubscribe = subscribeKeepAliveSettings(() => {
      const nextAwake = isScreenKeepAwakeEnabled();
      const nextBg = isBackgroundAudioKeepAliveEnabled();
      setScreenAwakeEnabled(nextAwake);
      setBgAudioEnabled(nextBg);
      applyScreenKeepAwake(nextAwake);
    });

    return () => {
      unsubscribe();
      applyScreenKeepAwake(false);
    };
  }, []);

  return (
    <View pointerEvents="none" style={styles.container}>
      {hasRCTVideo && bgAudioEnabled && (
        <Video
          source={require('@/assets/audio/silence.wav')}
          paused={false}
          repeat={true}
          playInBackground={true}
          playWhenInactive={true}
          ignoreSilentSwitch="ignore"
          mixWithOthers="mix"
          volume={0.01}
          controls={false}
          showNotificationControls={false}
          preventsDisplaySleepDuringVideoPlayback={false}
          style={styles.hiddenMedia}
          onError={(e) => {
            console.warn('[StremioKeepAliveKeeper] Silent audio playback error:', e);
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 0,
    height: 0,
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 0,
  },
  hiddenMedia: {
    width: 0,
    height: 0,
    position: 'absolute',
  },
});
