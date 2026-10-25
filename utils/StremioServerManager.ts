import { AppState, AppStateStatus, NativeModules } from 'react-native';

let isServerStarted = false;
let isLifecycleListenerAttached = false;

/**
 * Pings the embedded Stremio server on loopback to check if it is responsive.
 */
export async function pingEmbeddedServer(timeoutMs: number = 2000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch('http://127.0.0.1:11470/stats.json', {
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
}

/**
 * Safely starts the embedded Node.js Stremio streaming server if running
 * in an environment with native nodejs-mobile compiled in (e.g. custom dev build or release APK/IPA).
 * In Expo Go, native nodejs-mobile is absent, so this warns gracefully instead of crashing.
 */
export function startEmbeddedNodeServer(): boolean {
  setupServerLifecycleListener();

  if (isServerStarted) return true;

  try {
    const { RNNodeJsMobile } = NativeModules;
    if (!RNNodeJsMobile) {
      console.warn(
        '[StremioServerManager] Native nodejs-mobile is not compiled in the current environment (e.g. Expo Go). ' +
        'Run "npm run server" in a terminal on your computer or build a native dev client (npx expo run:android / run:ios).'
      );
      return false;
    }

    const nodejs = require('nodejs-mobile-react-native');
    nodejs.start('wrapper.js');
    isServerStarted = true;
    console.log('[StremioServerManager] Embedded Stremio server started on 127.0.0.1:11470');
    return true;
  } catch (err) {
    console.warn('[StremioServerManager] Could not start embedded node server:', err);
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
