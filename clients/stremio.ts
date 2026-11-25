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
  streamName?: string;
  swarmConnections?: number;
  swarmSize?: number;
}

export const DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.dstud.io:6969/announce',
  'udp://tracker.srv00.com:6969/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://opentracker.i2p.rocks:6969/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://explodie.org:6969/announce',
  'http://tracker.openbittorrent.com:80/announce',
];

export function extractTrackersFromMagnet(magnetUrl?: string): string[] {
  const trackers: string[] = [];
  if (magnetUrl) {
    const matches = Array.from(magnetUrl.matchAll(/[?&]tr=([^&]+)/gi));
    for (const m of matches) {
      try {
        const decoded = decodeURIComponent(m[1].replace(/\+/g, ' '));
        if (decoded && !trackers.includes(decoded)) {
          trackers.push(decoded);
        }
      } catch {}
    }
  }
  for (const dt of DEFAULT_TRACKERS) {
    if (!trackers.includes(dt)) {
      trackers.push(dt);
    }
  }
  return trackers;
}

export class StreamingServerClient {
  private baseURL: string;

  constructor(streamingServerURL: string = 'http://127.0.0.1:11470') {
    this.baseURL = streamingServerURL.replace(/\/$/, '');
  }

  getBaseURL(): string {
    return this.baseURL;
  }

  async getStreamingURL(infoHash: string, fileIdx: number = 0, magnetUrl?: string): Promise<string> {
    const validIdx = fileIdx >= 0 ? fileIdx : 0;
    let directURL = `${this.baseURL}/${encodeURIComponent(infoHash)}/${validIdx}`;
    const trackers = extractTrackersFromMagnet(magnetUrl);
    if (trackers.length > 0) {
      const qs = trackers.map((t) => `tr=${encodeURIComponent(t)}`).join('&');
      directURL += `?${qs}`;
    }
    console.log('Direct streaming URL:', directURL);
    return directURL;
  }

  async getTorrentFiles(infoHash: string, timeoutMs: number = 6000, magnetUrl?: string): Promise<TorrentFile[]> {
    let url = `${this.baseURL}/${encodeURIComponent(infoHash)}/create`;
    const trackers = extractTrackersFromMagnet(magnetUrl);
    if (trackers.length > 0) {
      const qs = trackers.map((t) => `tr=${encodeURIComponent(t)}`).join('&');
      url += `?${qs}`;
    }
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

  if (__DEV__) {
    return '192.168.1.2';
  }

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
      const isOnline = await client.isServerOnline(2500);
      return { url, client, isOnline };
    })
  );

  const working = results.find((r) => r.isOnline);
  if (working) {
    cachedActiveUrl = working.url;
    console.log(`[StreamingServerClient] Connected to active streaming server at ${working.url}`);
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
