// wrapper.js
const path = require('path');
const fs = require('fs');
const os = require('os');

// 1. Intercept process.exit so embedded Node.js NEVER terminates the host app
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
  // Disable SSDP casting multicast to prevent EADDRNOTAVAIL crashes on local networks
  process.env.CASTING_DISABLED = '1';
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
  console.log('[NODEJS-MOBILE] rn-bridge initialized');
} catch (e) {
  // Ignored if not running in nodejs-mobile
}

// 6. Start YouTube streaming engine safely with lazy-load resilience
let ytHandler = null;
function getYtHandler() {
  if (ytHandler) return ytHandler;
  try {
    const ytModule = require('./yt-engine.bundle.js');
    if (ytModule && ytModule.server) {
      ytHandler = ytModule.server.listeners('request')[0];
      console.log('[NODEJS-MOBILE] ✅ yt-engine loaded and ready');
    }
  } catch (e) {
    console.warn('[NODEJS-MOBILE] Could not start yt-engine:', e);
  }
  return ytHandler;
}
getYtHandler();

// 7. Route /yt/* requests directly through Stremio server (port 11470)
// This allows YouTube video playback directly via the Stremio server!
const http = require('http');
const originalCreateServer = http.createServer;
http.createServer = function (requestListener) {
  return originalCreateServer.call(this, (req, res) => {
    if (req.url && req.url.startsWith('/yt/')) {
      const handler = getYtHandler();
      if (handler) {
        return handler(req, res);
      }
      res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'YouTube engine initializing, please retry' }));
      return;
    }
    if (requestListener) {
      return requestListener(req, res);
    }
  });
};

// 8. Start Stremio streaming server safely
try {
  console.log('[NODEJS-MOBILE] Loading embedded server.js...');
  require('./server.js');
  console.log('[NODEJS-MOBILE] server.js initialized successfully');
} catch (e) {
  console.warn('[NODEJS-MOBILE] Could not start server.js:', e);
}
