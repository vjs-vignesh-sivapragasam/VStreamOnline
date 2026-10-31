// wrapper.js

const path = require('path');
const fs = require('fs');
const os = require('os');

// 1. Intercept process.exit so embedded Node.js NEVER terminates the Android app
process.exit = function (code) {
  console.error('[NODEJS-MOBILE] Prevented process.exit(' + code + ') from killing the app process!');
};

// 2. Catch all unhandled exceptions so Node doesn't trigger default process termination
process.on('uncaughtException', (err) => {
  console.error('[NODEJS-MOBILE-UNCAUGHT-EXCEPTION]', err && err.stack ? err.stack : err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[NODEJS-MOBILE-UNHANDLED-REJECTION]', reason);
});

// 3. Configure safe writable paths for Android (prevents read-only /tmp EROFS crash)
try {
  const baseDir = process.cwd();
  const appDataDir = path.join(baseDir, 'stremio-data');
  const tmpDir = path.join(baseDir, 'stremio-tmp');

  if (!fs.existsSync(appDataDir)) fs.mkdirSync(appDataDir, { recursive: true });
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  process.env.APP_PATH = appDataDir;
  process.env.TMPDIR = tmpDir;
  os.tmpdir = () => tmpDir;
} catch (e) {
  console.warn('[NODEJS-MOBILE] Could not initialize writable directories:', e);
}

// 4. Load bridge safely
try {
  require('rn-bridge');
  console.log('[NODEJS-MOBILE] rn-bridge initialized');
} catch (e) {
  console.error('[NODEJS-MOBILE] Error loading rn-bridge:', e);
}

// 4. Load streaming server safely
try {
  console.log('[NODEJS-MOBILE] Loading embedded server.js...');
  require('./server.js');
  console.log('[NODEJS-MOBILE] server.js initialized successfully');
} catch (e) {
  console.error('[NODEJS-MOBILE] Error loading server.js:', e);
}
