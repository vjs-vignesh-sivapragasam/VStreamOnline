import { Platform } from 'react-native';
import { StorageKeys, storageService } from '@/utils/StorageService';

type Listener = () => void;
const listeners = new Set<Listener>();

let isKeepAwakeActive = false;

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.warn('[StremioKeepAliveManager] Listener threw error:', e);
    }
  });
}

/**
 * Checks if Background Audio Keep-Alive is enabled (Option 1).
 * Can be enabled by the user so the embedded Stremio server stays alive during screen lock on iOS/Android.
 */
export function isBackgroundAudioKeepAliveEnabled(): boolean {
  try {
    const val = storageService.getItem(StorageKeys.STREMIO_BACKGROUND_KEEP_ALIVE_KEY);
    if (val === undefined || val === null) {
      return false; // Default OFF
    }
    return val === 'true';
  } catch {
    return false;
  }
}

/**
 * Updates Background Audio Keep-Alive configuration.
 */
export function setBackgroundAudioKeepAliveEnabled(enabled: boolean): void {
  try {
    storageService.setItem(StorageKeys.STREMIO_BACKGROUND_KEEP_ALIVE_KEY, String(enabled));
    notifyListeners();
  } catch (err) {
    console.error('[StremioKeepAliveManager] Failed to save background keep-alive:', err);
  }
}

/**
 * Checks if Screen Keep-Awake is enabled (Option 2).
 * Defaults to true (keeps the screen awake while using the app to prevent auto-lock).
 */
export function isScreenKeepAwakeEnabled(): boolean {
  try {
    const val = storageService.getItem(StorageKeys.STREMIO_KEEP_AWAKE_KEY);
    if (val === undefined || val === null) {
      return true; // Default ALWAYS ON
    }
    return val === 'true';
  } catch {
    return true;
  }
}

/**
 * Updates Screen Keep-Awake configuration and applies the wake-lock state.
 */
export function setScreenKeepAwakeEnabled(enabled: boolean): void {
  try {
    storageService.setItem(StorageKeys.STREMIO_KEEP_AWAKE_KEY, String(enabled));
    applyScreenKeepAwake(enabled);
    notifyListeners();
  } catch (err) {
    console.error('[StremioKeepAliveManager] Failed to save screen keep-awake:', err);
  }
}

const KEEP_AWAKE_TAG = 'STREMIO_SERVER_KEEP_AWAKE';

/**
 * Dynamically toggles expo-keep-awake screen wake lock.
 */
export async function applyScreenKeepAwake(active: boolean): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const KeepAwake = require('expo-keep-awake');
    if (active && !isKeepAwakeActive) {
      if (typeof KeepAwake.activateKeepAwakeAsync === 'function') {
        await KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_TAG);
        isKeepAwakeActive = true;
      }
    } else if (!active && isKeepAwakeActive) {
      if (typeof KeepAwake.deactivateKeepAwake === 'function') {
        await KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);
        isKeepAwakeActive = false;
      }
    }
  } catch (err) {
    console.warn('[StremioKeepAliveManager] Error toggling screen keep-awake:', err);
  }
}

/**
 * Subscribes to keep-alive configuration changes.
 */
export function subscribeKeepAliveSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
