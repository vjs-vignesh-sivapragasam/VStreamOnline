import React, { useEffect } from 'react';
import {
  isScreenKeepAwakeEnabled,
  applyScreenKeepAwake,
  subscribeKeepAliveSettings,
} from '@/utils/StremioKeepAliveManager';

/**
 * Root-level Keeper component that handles:
 * Screen Keep-Awake: Prevents the display from auto-sleeping using native Expo KeepAwake.
 * Safely runs without mounting any native media/video elements at root level to prevent iOS AVAudioSession crashes.
 */
export const StremioKeepAliveKeeper: React.FC = () => {
  useEffect(() => {
    // Initial sync of screen keep-awake
    const initialAwake = isScreenKeepAwakeEnabled();
    applyScreenKeepAwake(initialAwake);

    const unsubscribe = subscribeKeepAliveSettings(() => {
      const nextAwake = isScreenKeepAwakeEnabled();
      applyScreenKeepAwake(nextAwake);
    });

    return () => {
      unsubscribe();
      applyScreenKeepAwake(false);
    };
  }, []);

  return null;
};
