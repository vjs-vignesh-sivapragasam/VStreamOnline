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

  async getStreamingURL(infoHash: string, fileIdx: number = -1): Promise<string> {
    const directURL = `${this.baseURL}/${encodeURIComponent(infoHash)}/${fileIdx}`;
    console.log('Direct streaming URL:', directURL);
    return directURL;
  }

  async getTorrentFiles(infoHash: string, timeoutMs: number = 6000): Promise<TorrentFile[]> {
    const url = `${this.baseURL}/${encodeURIComponent(infoHash)}/create`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Streaming server responded with status: ${response.status}`);
      const data = await response.json();
      return data.files ?? [];
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

  // 2. Embedded localhost
  if (!candidates.includes('http://127.0.0.1:11470')) {
    candidates.push('http://127.0.0.1:11470');
  }

  // 3. Android Emulator host
  if (Platform.OS === 'android' && !candidates.includes('http://10.0.2.2:11470')) {
    candidates.push('http://10.0.2.2:11470');
  }

  // 4. Developer PC LAN IP (from Metro bundler host)
  const devIp = getDevHostIp();
  if (devIp) {
    const devUrl = `http://${devIp}:11470`;
    if (!candidates.includes(devUrl)) {
      candidates.push(devUrl);
    }
  }

  return candidates;
}

let cachedActiveUrl: string | null = null;

export async function resolveStreamingServerClient(): Promise<StreamingServerClient> {
  if (cachedActiveUrl) {
    const client = new StreamingServerClient(cachedActiveUrl);
    if (await client.isServerOnline(1000)) {
      return client;
    }
    cachedActiveUrl = null;
  }

  const candidates = getServerCandidates();
  for (const url of candidates) {
    const client = new StreamingServerClient(url);
    if (await client.isServerOnline(1200)) {
      cachedActiveUrl = url;
      console.log(`[StreamingServerClient] Connected to active streaming server at ${url}`);
      return client;
    }
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

