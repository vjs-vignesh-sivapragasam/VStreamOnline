import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { StorageKeys, storageService } from '@/utils/StorageService';

export interface YouTubeVideoItem {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration?: string;
  views?: string;
  published?: string;
}

export interface YouTubeSearchResult {
  videos: YouTubeVideoItem[];
  continuationToken?: string;
  apiKey?: string;
}

export interface YouTubeFormatOption {
  itag: number;
  quality: string;
  container: string;
  mimeType: string;
  url: string;
  proxyUrl?: string;
  contentLength?: number;
  sizeFormatted: string;
  hasAudio: boolean;
  hasVideo: boolean;
  type: 'video' | 'audio';
}

export interface YouTubeVideoDetails {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration?: number;
  views?: number;
  formats: {
    progressive: YouTubeFormatOption[];
    videoAdaptive: YouTubeFormatOption[];
    audioAdaptive: YouTubeFormatOption[];
  };
}

export interface SponsorSegment {
  category: string;
  actionType: string;
  segment: [number, number]; // [startSeconds, endSeconds]
  UUID: string;
}

export interface YouTubeChannelSubscription {
  channelId: string;
  channelTitle: string;
  avatarUrl?: string;
  subscribedAt: number;
}

const YT_SUBSCRIPTIONS_KEY = 'yt_local_subscriptions';
const YT_ENGINE_PORT = 11472;

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return 'Unknown size';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

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

/**
 * Extracts a 11-character YouTube video ID from any standard or mobile URL:
 * - https://www.youtube.com/watch?v=...
 * - https://youtu.be/...
 * - https://www.youtube.com/shorts/...
 * - https://m.youtube.com/watch?v=...
 * - raw 11-char ID
 */
export function extractYouTubeVideoId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // 1. Raw 11-character video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // 2. youtu.be/VIDEO_ID
  const youtuBeMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/i);
  if (youtuBeMatch) return youtuBeMatch[1];

  // 3. youtube.com/watch?v=VIDEO_ID or ?...&v=VIDEO_ID
  const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/i);
  if (watchMatch) return watchMatch[1];

  // 4. youtube.com/shorts/VIDEO_ID or /live/VIDEO_ID or /embed/VIDEO_ID
  const pathMatch = trimmed.match(/youtube\.com\/(?:shorts|live|embed|v)\/([a-zA-Z0-9_-]{11})/i);
  if (pathMatch) return pathMatch[1];

  return null;
}

export function getEngineCandidates(): string[] {
  const candidates: string[] = [];

  // 1. Developer PC LAN IP (critical for iPhone on Wi-Fi during development)
  const devIp = getDevHostIp();
  if (devIp) {
    candidates.push(`http://${devIp}:${YT_ENGINE_PORT}`);
  }

  // 2. Localhost loopback (Android emulator or native custom binary with embedded nodejs-mobile)
  candidates.push(`http://127.0.0.1:${YT_ENGINE_PORT}`);

  // 3. User configured streaming server in Settings (if custom IP is set)
  try {
    const raw = storageService.getItem(StorageKeys.SERVERS_KEY);
    if (raw) {
      const servers: any[] = JSON.parse(raw);
      const active = servers.find((s) => s.current);
      if (active?.serverUrl) {
        const urlObj = new URL(active.serverUrl);
        const serverCandidate = `${urlObj.protocol}//${urlObj.hostname}:${YT_ENGINE_PORT}`;
        if (!candidates.includes(serverCandidate)) {
          candidates.push(serverCandidate);
        }
      }
    }
  } catch {}

  // 4. Android emulator host
  if (Platform.OS === 'android' && !candidates.includes(`http://10.0.2.2:${YT_ENGINE_PORT}`)) {
    candidates.push(`http://10.0.2.2:${YT_ENGINE_PORT}`);
  }

  return candidates;
}

class YouTubeService {
  private activeBaseUrl: string | null = null;
  private lastPingTime: number = 0;

  /**
   * Resolves the active base URL for the YouTube engine.
   * Checks loopback, developer LAN IP, and custom server settings.
   */
  async resolveActiveBaseUrl(timeoutMs = 1500): Promise<string> {
    const now = Date.now();
    if (this.activeBaseUrl && now - this.lastPingTime < 10000) {
      return this.activeBaseUrl;
    }

    const candidates = getEngineCandidates();

    for (const url of candidates) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(`${url}/yt/ping`, {
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));

        if (res.ok) {
          this.activeBaseUrl = url;
          this.lastPingTime = now;
          console.log(`[YouTubeService] Connected to engine at ${url}`);
          return url;
        }
      } catch {}
    }

    // Default to the first candidate if none responded
    return candidates[0] || `http://127.0.0.1:${YT_ENGINE_PORT}`;
  }

  /**
   * Quick ping to check if any candidate engine is responsive
   */
  async pingEngine(timeoutMs = 1200): Promise<boolean> {
    try {
      const baseUrl = await this.resolveActiveBaseUrl(timeoutMs);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${baseUrl}/yt/ping`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Search YouTube videos with pagination continuation support and optional upload date/popularity filter.
   */
  async searchWithContinuation(query: string = 'trending', sp?: string): Promise<YouTubeSearchResult> {
    // 1. Direct Web Scraping is fastest for search, requires zero local node warm-up, and extracts continuation tokens
    const webResult = await this.searchViaWebWithContinuation(query, sp);
    if (webResult.videos.length > 0) {
      return webResult;
    }

    // 2. Engine fallback
    try {
      const baseUrl = await this.resolveActiveBaseUrl(1000);
      const spParam = sp ? `&sp=${encodeURIComponent(sp)}` : '';
      const res = await fetch(`${baseUrl}/yt/search?q=${encodeURIComponent(query)}${spParam}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.results) && data.results.length > 0) {
          return { videos: data.results };
        }
      }
    } catch {}

    return { videos: [] };
  }

  /**
   * Search YouTube videos (legacy helper returning array).
   */
  async search(query: string = 'trending', sp?: string): Promise<YouTubeVideoItem[]> {
    const result = await this.searchWithContinuation(query, sp);
    return result.videos;
  }

  /**
   * Direct YouTube web search scraper. Parses ytInitialData from YouTube results page,
   * extracting both initial videos and continuation token.
   */
  private async searchViaWebWithContinuation(query: string, sp?: string): Promise<YouTubeSearchResult> {
    try {
      const spParam = sp ? `&sp=${encodeURIComponent(sp)}` : '';
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}${spParam}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      const html = await res.text();
      let data: any = null;

      // 1. Robust extraction of ytInitialData supporting multiline JSON
      const marker = 'ytInitialData';
      const startIdx = html.indexOf(marker);
      if (startIdx !== -1) {
        const jsonStart = html.indexOf('{', startIdx);
        const scriptEnd = html.indexOf(';</script>', jsonStart);
        if (scriptEnd !== -1) {
          try {
            data = JSON.parse(html.substring(jsonStart, scriptEnd));
          } catch {}
        }
      }

      // 2. Regex fallback if substring boundary varied
      if (!data) {
        const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/s);
        if (match) {
          try {
            data = JSON.parse(match[1]);
          } catch {}
        }
      }

      if (!data) return { videos: [] };

      const keyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
      const apiKey = keyMatch ? keyMatch[1] : 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

      const sections =
        data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];

      const videos: YouTubeVideoItem[] = [];
      let continuationToken: string | undefined = undefined;

      for (const sec of sections) {
        if (sec.continuationItemRenderer) {
          continuationToken =
            sec.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token ||
            sec.continuationItemRenderer.continuationEndpoint?.continuationItemRenderer?.token ||
            continuationToken;
        }

        const items = sec.itemSectionRenderer?.contents || [];
        for (const item of items) {
          if (item.continuationItemRenderer) {
            continuationToken =
              item.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token ||
              item.continuationItemRenderer.continuationEndpoint?.continuationItemRenderer?.token ||
              continuationToken;
          }

          const v = item.videoRenderer || item.compactVideoRenderer;
          if (v && v.videoId) {
            const title =
              v.title?.runs?.[0]?.text ||
              v.title?.simpleText ||
              v.headline?.runs?.[0]?.text ||
              v.headline?.simpleText ||
              'Untitled';
            const channel =
              v.ownerText?.runs?.[0]?.text ||
              v.shortBylineText?.runs?.[0]?.text ||
              v.longBylineText?.runs?.[0]?.text ||
              'YouTube';
            const thumbnail =
              v.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
              `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
            const duration = v.lengthText?.simpleText || '';
            const views =
              v.viewCountText?.simpleText ||
              v.viewCountText?.runs?.[0]?.text ||
              v.shortViewCountText?.simpleText ||
              v.shortViewCountText?.runs?.[0]?.text ||
              '';
            const published =
              v.publishedTimeText?.simpleText ||
              v.publishedTimeText?.runs?.[0]?.text ||
              '';

            videos.push({
              id: v.videoId,
              title,
              channel,
              thumbnail,
              duration,
              views,
              published,
            });
          }
        }
      }

      return {
        videos,
        continuationToken,
        apiKey,
      };
    } catch (err) {
      console.warn('[YouTubeService] searchViaWebWithContinuation error:', err);
      return { videos: [] };
    }
  }

  /**
   * Fetch subsequent video batches via YouTube Innertube search continuation API.
   */
  async fetchContinuation(
    continuationToken: string,
    apiKey: string = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'
  ): Promise<YouTubeSearchResult> {
    try {
      const url = `https://www.youtube.com/youtubei/v1/search?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: '2.20240101.00.00',
            },
          },
          continuation: continuationToken,
        }),
      });

      if (!res.ok) {
        throw new Error(`Continuation request failed with HTTP ${res.status}`);
      }

      const postData = await res.json();
      const commands = postData.onResponseReceivedCommands || [];
      const continuationItems = commands[0]?.appendContinuationItemsAction?.continuationItems || [];

      const videos: YouTubeVideoItem[] = [];
      let nextContinuationToken: string | undefined = undefined;

      for (const item of continuationItems) {
        if (item.continuationItemRenderer) {
          nextContinuationToken =
            item.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token ||
            item.continuationItemRenderer.continuationEndpoint?.continuationItemRenderer?.token ||
            nextContinuationToken;
        }

        const subItems = item.itemSectionRenderer?.contents || (item.videoRenderer ? [item] : []);
        for (const sub of subItems) {
          if (sub.continuationItemRenderer) {
            nextContinuationToken =
              sub.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token ||
              sub.continuationItemRenderer.continuationEndpoint?.continuationItemRenderer?.token ||
              nextContinuationToken;
          }

          const v = sub.videoRenderer || sub.compactVideoRenderer;
          if (v && v.videoId) {
            const title =
              v.title?.runs?.[0]?.text ||
              v.title?.simpleText ||
              v.headline?.runs?.[0]?.text ||
              v.headline?.simpleText ||
              'Untitled';
            const channel =
              v.ownerText?.runs?.[0]?.text ||
              v.shortBylineText?.runs?.[0]?.text ||
              v.longBylineText?.runs?.[0]?.text ||
              'YouTube';
            const thumbnail =
              v.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
              `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
            const duration = v.lengthText?.simpleText || '';
            const views =
              v.viewCountText?.simpleText ||
              v.viewCountText?.runs?.[0]?.text ||
              v.shortViewCountText?.simpleText ||
              v.shortViewCountText?.runs?.[0]?.text ||
              '';
            const published =
              v.publishedTimeText?.simpleText ||
              v.publishedTimeText?.runs?.[0]?.text ||
              '';

            videos.push({
              id: v.videoId,
              title,
              channel,
              thumbnail,
              duration,
              views,
              published,
            });
          }
        }
      }

      return {
        videos,
        continuationToken: nextContinuationToken,
        apiKey,
      };
    } catch (err) {
      console.warn('[YouTubeService] fetchContinuation error:', err);
      throw err;
    }
  }

  /**
   * Fetches full video stream formats for playback and download
   */
  async getVideoDetails(videoId: string): Promise<YouTubeVideoDetails> {
    const candidates = getEngineCandidates();
    let lastError: Error | null = null;

    console.log(`[YouTubeService] 🔍 Requesting video details for videoId: "${videoId}"`);
    console.log('[YouTubeService] 📋 Candidate URLs:', candidates);

    for (const baseUrl of candidates) {
      // Allow up to 2 attempts per candidate with 12s timeout to accommodate cold Innertube extraction
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`[YouTubeService] 📡 Trying (attempt ${attempt}): ${baseUrl}/yt/info?v=${encodeURIComponent(videoId)}`);
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 12000);

          const res = await fetch(`${baseUrl}/yt/info?v=${encodeURIComponent(videoId)}`, {
            signal: controller.signal,
          }).finally(() => clearTimeout(timer));

          console.log(`[YouTubeService] 📥 Response status from ${baseUrl}: ${res.status}`);

          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.error || `Server responded with status ${res.status}`);
          }

          const data = await res.json();
          this.activeBaseUrl = baseUrl;

          console.log(`[YouTubeService] ✅ Successfully fetched info for "${data.title}" from ${baseUrl}`);
          console.log(
            `[YouTubeService] 📦 Formats available: Progressive: ${data.formats?.progressive?.length || 0}, VideoAdaptive: ${data.formats?.videoAdaptive?.length || 0}, AudioAdaptive: ${data.formats?.audioAdaptive?.length || 0}`
          );

          const mapFormat = (f: any): YouTubeFormatOption => {
            const directUrl = f.url || '';
            const proxyUrl = directUrl ? `${baseUrl}/yt/proxy-stream?url=${encodeURIComponent(directUrl)}` : undefined;
            const isAudio = f.type === 'audio' || (f.hasAudio && !f.hasVideo);
            return {
              itag: f.itag,
              quality: f.quality || (isAudio ? '128 kbps' : 'Standard'),
              container: isAudio ? 'mp3' : (f.container || 'mp4'),
              mimeType: f.mimeType || (isAudio ? 'audio/mp4' : 'video/mp4'),
              url: directUrl,
              proxyUrl,
              contentLength: f.contentLength ? Number(f.contentLength) : undefined,
              sizeFormatted: formatBytes(f.contentLength ? Number(f.contentLength) : undefined),
              hasAudio: !!f.hasAudio,
              hasVideo: !!f.hasVideo,
              type: isAudio ? 'audio' : (f.type || 'video'),
            };
          };

          const progressiveFormats = (data.formats?.progressive || []).map(mapFormat);
          const videoAdaptiveFormats = (data.formats?.videoAdaptive || []).map(mapFormat);
          let audioAdaptiveFormats = (data.formats?.audioAdaptive || []).map(mapFormat);

          if (audioAdaptiveFormats.length === 0 && progressiveFormats.length > 0) {
            audioAdaptiveFormats = progressiveFormats.map((f: YouTubeFormatOption) => ({
              ...f,
              type: 'audio' as const,
              container: 'mp3',
              quality: '128 kbps',
            }));
          }

          return {
            id: data.id,
            title: data.title || 'YouTube Video',
            channel: data.channel || 'YouTube',
            thumbnail: data.thumbnail || `https://i.ytimg.com/vi/${data.id}/hqdefault.jpg`,
            duration: data.duration,
            views: data.views,
            formats: {
              progressive: progressiveFormats,
              videoAdaptive: videoAdaptiveFormats,
              audioAdaptive: audioAdaptiveFormats,
            },
          };
        } catch (err: any) {
          console.warn(`[YouTubeService] ⚠️ Candidate ${baseUrl} attempt ${attempt} failed:`, err?.message || err);
          lastError = err;
          if (attempt === 1) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      }
    }

    const devIp = getDevHostIp();
    const hint = devIp
      ? `Ensure 'npm run server' is running on your computer (${devIp}) on the same Wi-Fi network.`
      : "Ensure 'npm run server' is running.";

    console.warn(`[YouTubeService] ⚠️ All candidates failed to fetch details for ${videoId}! Last error:`, lastError?.message || lastError);

    throw new Error(
      `Cannot connect to YouTube streaming engine. ${hint} (${lastError?.message || 'Connection refused'})`
    );
  }

  getActiveBaseUrl(): string {
    return this.activeBaseUrl || getEngineCandidates()[0] || `http://127.0.0.1:${YT_ENGINE_PORT}`;
  }

  getProxyStreamUrl(directUrl: string): string {
    const base = this.getActiveBaseUrl();
    return `${base}/yt/proxy-stream?url=${encodeURIComponent(directUrl)}`;
  }

  /**
   * Fetches sponsor segments from SponsorBlock API
   */
  async getSponsorSegments(videoId: string): Promise<SponsorSegment[]> {
    try {
      const res = await fetch(
        `https://sponsor.ajay.app/api/skipSegments?videoID=${encodeURIComponent(videoId)}&categories=["sponsor","intro","outro","interaction"]`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  // ── Local Subscriptions Management (100% on-device & private) ──────────────

  getSubscriptions(): YouTubeChannelSubscription[] {
    try {
      const raw = storageService.getItem(YT_SUBSCRIPTIONS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  isSubscribed(channelId: string): boolean {
    const subs = this.getSubscriptions();
    return subs.some((s) => s.channelId === channelId);
  }

  toggleSubscription(channel: { channelId: string; channelTitle: string; avatarUrl?: string }): boolean {
    const subs = this.getSubscriptions();
    const index = subs.findIndex((s) => s.channelId === channel.channelId);
    let subscribed = false;

    if (index >= 0) {
      subs.splice(index, 1);
      subscribed = false;
    } else {
      subs.unshift({
        channelId: channel.channelId,
        channelTitle: channel.channelTitle,
        avatarUrl: channel.avatarUrl,
        subscribedAt: Date.now(),
      });
      subscribed = true;
    }

    storageService.setItem(YT_SUBSCRIPTIONS_KEY, JSON.stringify(subs));
    return subscribed;
  }
}

export const youTubeService = new YouTubeService();
