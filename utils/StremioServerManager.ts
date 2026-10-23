import { NativeModules } from 'react-native';

let isServerStarted = false;

/**
 * Safely starts the embedded Node.js Stremio streaming server if running
 * in an environment with native nodejs-mobile compiled in (e.g. custom dev build or release APK/IPA).
 * In Expo Go, native nodejs-mobile is absent, so this warns gracefully instead of crashing.
 */
export function startEmbeddedNodeServer(): boolean {
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
