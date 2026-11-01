// wrapper.js
const path = require('path');
const fs = require('fs');
const os = require('os');

// 1. Intercept process.exit so embedded Node.js NEVER terminates the mobile app
process.exit = function (code) {
  console.warn('[NODEJS-MOBILE] Prevented process.exit(' + code + ') from terminating the host app!');
};

// 2. Catch all unhandled exceptions so Node doesn't trigger default process termination
process.on('uncaughtException', (err) => {
  console.error('[NODEJS-MOBILE-UNCAUGHT-EXCEPTION]', err && err.stack ? err.stack : err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[NODEJS-MOBILE-UNHANDLED-REJECTION]', reason);
});

// 3. Configure safe writable paths for embedded environment (prevents read-only /tmp EROFS crash)
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

// 4. Free up port 11472 if occupied by a stale previous process on desktop/dev environment
try {
  let isMobile = false;
  try {
    require('rn-bridge');
    isMobile = true;
  } catch (e) {}

  if (!isMobile) {
    const { execSync } = require('child_process');
    if (process.platform === 'win32') {
      const netstatOutput = execSync('netstat -ano -p tcp', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      for (const line of netstatOutput.split('\n')) {
        if (line.includes(':11472') && line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1], 10);
          if (pid && pid !== process.pid) {
            console.log(`[wrapper] Port 11472 is in use by stale PID ${pid}. Freeing port...`);
            try {
              execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
            } catch {}
          }
        }
      }
    } else {
      try {
        const pid = execSync('lsof -ti:11472', {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        if (pid && parseInt(pid, 10) !== process.pid) {
          console.log(`[wrapper] Port 11472 is in use by stale PID ${pid}. Freeing port...`);
          execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
        }
      } catch {}
    }
  }
} catch (err) {}

// 5. Load bridge safely
try {
  require('rn-bridge');
} catch (e) {
  // Ignored if not running in nodejs-mobile
}

// 6. Start YouTube streaming engine safely
try {
  require('./yt-engine.bundle.js');
} catch (e) {
  console.warn('[NODEJS-MOBILE] Could not start yt-engine:', e);
}

// 7. Start Stremio streaming server safely
try {
  require('./server.js');
} catch (e) {
  console.warn('[NODEJS-MOBILE] Could not start server.js:', e);
}
