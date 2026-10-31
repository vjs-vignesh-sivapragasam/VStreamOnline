import { AppState, AppStateStatus, NativeModules, Platform } from 'react-native';
import { getDevHostIp } from '@/clients/stremio';

let isServerStarted = false;
let isLifecycleListenerAttached = false;

/**
 * Pings the embedded or network Stremio server to check if it is responsive.
 */
export async function pingEmbeddedServer(timeoutMs: number = 2000): Promise<boolean> {
  const checkUrl = async (url: string) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${url}/stats.json`, {
          signal: controller.signal,
          headers: { Accept: '*/*' },
        });
        return res.ok || res.status < 500;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return false;
    }
  };

  const isLocalOk = await checkUrl('http://127.0.0.1:11470');
  if (isLocalOk) return true;

  const devIp = getDevHostIp();
  if (devIp) {
    return await checkUrl(`http://${devIp}:11470`);
  }
  return false;
}

/**
 * Safely starts the embedded Node.js Stremio streaming server if running
 * in an environment with native nodejs-mobile compiled in (e.g. custom dev build or release APK/IPA).
 * In Expo Go, native nodejs-mobile is absent, so this warns gracefully instead of crashing.
 */
export function startEmbeddedNodeServer(): boolean {
  console.log('[StremioServerManager] 1. startEmbeddedNodeServer called, isServerStarted:', isServerStarted);
  setupServerLifecycleListener();

  if (isServerStarted) {
    console.log('[StremioServerManager] Server already started flag is true');
    return true;
  }

  try {
    const { RNNodeJsMobile } = NativeModules;
    console.log('[StremioServerManager] 2. NativeModules.RNNodeJsMobile exists:', !!RNNodeJsMobile);
    if (!RNNodeJsMobile) {
      console.warn(
        '[StremioServerManager] Native nodejs-mobile is not compiled in the current environment (e.g. Expo Go). ' +
        'Run "npm run server" in a terminal on your computer or build a native dev client (npx expo run:android / run:ios).'
      );
      return false;
    }

    // In dev mode on Android where legacy APK might not have the wrapper/server patches compiled into APK assets,
    // prevent calling nodejs.start to avoid unhandled native exit.
    if (__DEV__ && Platform.OS === 'android') {
      console.log(
        '[StremioServerManager] Embedded node server startup skipped in dev mode on Android to prevent process exit. ' +
        'Run "npm run server" on your computer for dev mode streaming.'
      );
      return false;
    }

    console.log('[StremioServerManager] 3. Requiring nodejs-mobile-react-native module...');
    const nodejs = require('nodejs-mobile-react-native');
    console.log('[StremioServerManager] 4. Calling nodejs.start("wrapper.js")...');
    nodejs.start('wrapper.js');
    isServerStarted = true;
    console.log('[StremioServerManager] 5. Embedded Stremio server started successfully on 127.0.0.1:11470');
    return true;
  } catch (err: any) {
    console.error('[StremioServerManager] ❌ ERROR starting embedded node server:', err?.message || err, err?.stack);
    return false;
  }
}

/**
 * Verifies if the embedded server is responding, and starts it if not already started.
 */
export async function ensureEmbeddedServerRunning(): Promise<boolean> {
  startEmbeddedNodeServer();
  return await pingEmbeddedServer(1500);
}

/**
 * Listens for app state transitions (lock/unlock, background/foreground).
 * Automatically ensures the embedded server is ready when resuming to active.
 */
export function setupServerLifecycleListener(): void {
  if (isLifecycleListenerAttached) return;
  isLifecycleListenerAttached = true;

  let previousState = AppState.currentState;
  AppState.addEventListener('change', async (nextState: AppStateStatus) => {
    if (
      (previousState === 'background' || previousState === 'inactive') &&
      nextState === 'active'
    ) {
      console.log('[StremioServerManager] App resumed to active, ensuring embedded server...');
      ensureEmbeddedServerRunning();
    }
    previousState = nextState;
  });
}
