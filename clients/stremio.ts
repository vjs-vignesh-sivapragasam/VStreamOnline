import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { StorageKeys, storageService } from '@/utils/StorageService';

export interface TorrentFile {
  id: number;
  name: string;
  length: number;
}

export interface TorrentStats {
  peers?: number;
  unchoked?: number;
  downloadSpeed?: number;
  uploadSpeed?: number;
  downloaded?: number;
  streamProgress?: number;
  streamLen?: number;
}

export class StreamingServerClient {
  private baseURL: string;

  constructor(streamingServerURL: string = 'http://127.0.0.1:11470') {
    this.baseURL = streamingServerURL.replace(/\/$/, '');
  }

  getBaseURL(): string {
    return this.baseURL;
  }

  async getStreamingURL(infoHash: string, fileIdx: number = 0): Promise<string> {
    const safeIdx = (typeof fileIdx === 'number' && fileIdx >= 0) ? fileIdx : 0;
    const directURL = `${this.baseURL}/${encodeURIComponent(infoHash)}/${safeIdx}`;
    console.log('Direct streaming URL:', directURL);
    return directURL;
  }

  async getTorrentFiles(infoHash: string, timeoutMs: number = 8000): Promise<TorrentFile[]> {
    const url = `${this.baseURL}/${encodeURIComponent(infoHash)}/create`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Streaming server responded with status: ${response.status}`);
      const data = await response.json();
      const rawFiles: any[] = data.files ?? [];
      return rawFiles.map((f: any, idx: number) => ({
        id: typeof f.id === 'number' ? f.id : idx,
        name: f.name || f.path || `File ${idx + 1}`,
        length: typeof f.length === 'number' ? f.length : (f.size || 0),
      }));
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Connection timed out contacting streaming server at ${this.baseURL}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async isServerOnline(timeoutMs: number = 2000): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(`${this.baseURL}/stats.json`, {
            signal: controller.signal,
            headers: { Accept: '*/*' },
          });
          if (response.ok || response.status === 200 || response.status === 404) {
            return true;
          }
        } finally {
          clearTimeout(timer);
        }
      } catch {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    }
    return false;
  }

  async getTorrentStats(infoHash: string, fileIdx?: number): Promise<TorrentStats | null> {
    try {
      const path = fileIdx !== undefined && fileIdx >= 0
        ? `${encodeURIComponent(infoHash)}/${fileIdx}/stats.json`
        : `${encodeURIComponent(infoHash)}/stats.json`;
      const url = `${this.baseURL}/${path}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);

      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return null;
        return await response.json();
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return null;
    }
  }
}

// ── Server Discovery & Resolution Helpers ─────────────────────────────────────

export function getDevHostIp(): string | null {
  try {
    const hostUri = Constants.expoConfig?.hostUri;
    if (hostUri) {
      const ip = hostUri.split(':')[0];
      if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
        return ip;
      }
    }
  } catch {}
  return null;
}

export function getServerCandidates(): string[] {
  const candidates: string[] = [];

  // 1. User-configured active server from Settings
  try {
    const raw = storageService.getItem(StorageKeys.SERVERS_KEY);
    if (raw) {
      const servers: any[] = JSON.parse(raw);
      const active = servers.find((s) => s.current);
      if (active?.serverUrl) {
        candidates.push(active.serverUrl.replace(/\/+$/, ''));
      }
    }
  } catch {}

  // 2. Developer PC LAN IP (from Metro bundler host)
  const devIp = getDevHostIp();
  if (devIp) {
    const devUrl = `http://${devIp}:11470`;
    if (!candidates.includes(devUrl)) {
      candidates.push(devUrl);
    }
  }

  // 3. Embedded localhost
  if (!candidates.includes('http://127.0.0.1:11470')) {
    candidates.push('http://127.0.0.1:11470');
  }

  // 4. Android Emulator host
  if (Platform.OS === 'android' && !candidates.includes('http://10.0.2.2:11470')) {
    candidates.push('http://10.0.2.2:11470');
  }

  return candidates;
}

let cachedActiveUrl: string | null = null;

export async function resolveStreamingServerClient(): Promise<StreamingServerClient> {
  if (cachedActiveUrl) {
    const client = new StreamingServerClient(cachedActiveUrl);
    if (await client.isServerOnline(800)) {
      return client;
    }
    cachedActiveUrl = null;
  }

  const candidates = getServerCandidates();
  // Probe candidates in parallel for fastest resolution
  const results = await Promise.all(
    candidates.map(async (url) => {
      const client = new StreamingServerClient(url);
      const isOnline = await client.isServerOnline(1200);
      return { url, client, isOnline };
    })
  );

  const working = results.find((r) => r.isOnline);
  if (working) {
    cachedActiveUrl = working.url;
    console.log(`[StreamingServerClient] Connected to active streaming server at ${working.url}`);

    // Synchronize current flag in storage so other parts of the app stay in sync
    try {
      const raw = storageService.getItem(StorageKeys.SERVERS_KEY);
      if (raw) {
        const servers: any[] = JSON.parse(raw);
        let updated = false;
        let matched = false;
        for (const s of servers) {
          if (s.serverType === 'stremio') {
            const isMatch = s.serverUrl.replace(/\/+$/, '') === working.url;
            if (isMatch) matched = true;
            if (s.current !== isMatch) {
              s.current = isMatch;
              updated = true;
            }
          }
        }
        if (!matched) {
          servers.push({
            serverId: `auto-${Date.now()}`,
            serverType: 'stremio',
            serverName: `Active Server (${working.url})`,
            serverUrl: working.url,
            current: true,
          });
          updated = true;
        }
        if (updated) {
          storageService.setItem(StorageKeys.SERVERS_KEY, JSON.stringify(servers));
        }
      }
    } catch {}

    return working.client;
  }

  return new StreamingServerClient(candidates[0] || 'http://127.0.0.1:11470');
}

export function getActiveStreamingClient(): StreamingServerClient {
  if (cachedActiveUrl) {
    return new StreamingServerClient(cachedActiveUrl);
  }
  const candidates = getServerCandidates();
  return new StreamingServerClient(candidates[0] || 'http://127.0.0.1:11470');
}

