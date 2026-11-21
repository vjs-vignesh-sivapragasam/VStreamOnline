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

// 2b. Global polyfills for embedded mobile Node.js environment
if (typeof globalThis.Event === 'undefined') {
  try {
    globalThis.Event = require('events').Event || class Event {};
  } catch (_) {
    globalThis.Event = class Event {};
  }
}
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent extends (globalThis.Event || Object) {
    constructor(type, options) {
      super(type, options);
      this.detail = options?.detail ?? null;
    }
  };
}
if (typeof globalThis.ReadableStream === 'undefined') {
  try {
    globalThis.ReadableStream = require('stream/web').ReadableStream;
  } catch (_) {}
}
if (!String.prototype.isWellFormed) {
  String.prototype.isWellFormed = function () {
    try {
      encodeURIComponent(this);
      return true;
    } catch (_) {
      return false;
    }
  };
}

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
} catch (e) {
  // Ignored if not running in nodejs-mobile
}

// 6. Start YouTube streaming engine safely with lazy-load resilience
let ytHandler = null;
let lastYtError = null;
let isCreatingYtServer = false;

function getYtHandler() {
  if (ytHandler) return ytHandler;
  try {
    isCreatingYtServer = true;
    const ytModule = require('./yt-engine.bundle.js');
    isCreatingYtServer = false;
    ytHandler = ytModule.handler || ytModule.requestHandler || (ytModule.server && ytModule.server.listeners('request')[0]);
    if (ytHandler) {
      console.log('[NODEJS-MOBILE] ✅ yt-engine loaded and ready');
    }
  } catch (e) {
    isCreatingYtServer = false;
    lastYtError = e;
    console.warn('[NODEJS-MOBILE] Could not start yt-engine:', e && e.stack ? e.stack : e);
  }
  return ytHandler;
}
getYtHandler();

// 7. Route /yt/* requests directly through Stremio server (port 11470)
// This allows YouTube video playback directly via the Stremio server!
const http = require('http');
const originalCreateServer = http.createServer;
http.createServer = function (requestListener) {
  if (isCreatingYtServer) {
    return originalCreateServer.call(this, requestListener);
  }
  return originalCreateServer.call(this, (req, res) => {
    if (req.url && req.url.startsWith('/yt/')) {
      const handler = getYtHandler();
      if (handler) {
        return handler(req, res);
      }
      res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        error: lastYtError ? ('YouTube engine error: ' + (lastYtError.message || lastYtError)) : 'YouTube engine initializing, please retry'
      }));
      return;
    }
    if (requestListener) {
      return requestListener(req, res);
    }
  });
};

// 8. Start Stremio streaming server safely
try {
  require('./server.js');
} catch (e) {
  console.warn('[NODEJS-MOBILE] Could not start server.js:', e);
}
