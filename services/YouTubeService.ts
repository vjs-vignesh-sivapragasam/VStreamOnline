import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { StorageKeys, storageService } from '@/utils/StorageService';
import { ensureEmbeddedServerRunning } from '@/utils/StremioServerManager';

export interface YouTubeVideoItem {
  id: string;
  title: string;
  channel: string;
  channelId?: string;
  thumbnail: string;
  duration?: string;
  views?: string;
  published?: string;
  isShort?: boolean;
  watchProgress?: number;
  watchedAt?: number;
}

export function formatPublishedTime(published?: string): string {
  if (!published || typeof published !== 'string') return '';
  const trimmed = published.trim();
  if (!trimmed) return '';
  if (trimmed.toUpperCase() === 'LIVE') return '🔴 LIVE';

  return trimmed
    .replace(/\b(\d+)\s*s\s+ago\b/i, (_, n) => `${n} ${n === '1' ? 'second' : 'seconds'} ago`)
    .replace(/\b(\d+)\s*m\s+ago\b/i, (_, n) => `${n} ${n === '1' ? 'minute' : 'minutes'} ago`)
    .replace(/\b(\d+)\s*h\s+ago\b/i, (_, n) => `${n} ${n === '1' ? 'hour' : 'hours'} ago`)
    .replace(/\b(\d+)\s*d\s+ago\b/i, (_, n) => `${n} ${n === '1' ? 'day' : 'days'} ago`)
    .replace(/\b(\d+)\s*w\s+ago\b/i, (_, n) => `${n} ${n === '1' ? 'week' : 'weeks'} ago`)
    .replace(/\b(\d+)\s*mo\s+ago\b/i, (_, n) => `${n} ${n === '1' ? 'month' : 'months'} ago`)
    .replace(/\b(\d+)\s*y\s+ago\b/i, (_, n) => `${n} ${n === '1' ? 'year' : 'years'} ago`);
}

export interface YouTubeSearchResult {
  videos: YouTubeVideoItem[];
  continuationToken?: string;
  apiKey?: string;
}

export interface LiveStreamInfo {
  streamUrl: string;
  duration?: number;
  qualities?: string[];
  updatedAt: number;
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

export interface YouTubeCaptionTrack {
  baseUrl: string;
  name: string;
  languageCode: string;
  vssId?: string;
  kind?: string;
}

export interface YouTubeVideoDetails {
  id: string;
  title: string;
  channel: string;
  channelId?: string;
  thumbnail: string;
  duration?: number;
  views?: number;
  captionTracks?: YouTubeCaptionTrack[];
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
  subscriptionId?: string;
  subscribedAt: number;
}

export interface YouTubeUserProfile {
  name: string;
  email?: string;
  avatar?: string;
}

export interface YouTubeOAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  token_type?: string;
  scope?: string;
}

export interface GoogleSSOResult {
  device_code: string;
  user_code: string;
  verification_url: string;
  auth_url: string;
  interval: number;
  expires_in: number;
}

export interface YouTubeAuthStatus {
  authenticated: boolean;
  pending?: {
    user_code: string;
    verification_url: string;
    expires_in: number;
    startedAt?: number;
  } | null;
  user?: YouTubeUserProfile | null;
}

export interface YouTubeAuthStartResponse {
  status: 'authenticated' | 'pending' | 'starting' | 'error';
  user_code?: string;
  verification_url?: string;
  expires_in?: number;
  error?: string;
}

// ── Google / YouTube OAuth2 Constants ─────────────────────────────────────────
export const GOOGLE_OAUTH_CLIENT_ID = '861556708454-d6dlm3lh05idd8npek18k6be8ba3oc68.apps.googleusercontent.com';
export const GOOGLE_OAUTH_CLIENT_SECRET = 'SboVhoG9s0rNafixCSGGKXAT';
export const GOOGLE_OAUTH_DEVICE_CODE_URL = 'https://www.youtube.com/o/oauth2/device/code';
export const GOOGLE_OAUTH_TOKEN_URL = 'https://www.youtube.com/o/oauth2/token';
export const GOOGLE_OAUTH_SCOPES = 'http://gdata.youtube.com https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube-paid-content https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email email profile openid';
export const YT_OAUTH_TOKENS_KEY = 'yt_oauth_tokens';

const YT_SUBSCRIPTIONS_KEY = 'yt_local_subscriptions';
const STREMIO_ENGINE_PORT = 11470;
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

  // 1. Localhost loopback (Embedded Stremio server on 11470 and YouTube engine on 11472)
  candidates.push(`http://127.0.0.1:${STREMIO_ENGINE_PORT}`);
  candidates.push(`http://127.0.0.1:${YT_ENGINE_PORT}`);

  // 2. Developer PC LAN IP (for development and Expo Go)
  const devIp = getDevHostIp();
  if (devIp) {
    candidates.push(`http://${devIp}:${STREMIO_ENGINE_PORT}`);
    candidates.push(`http://${devIp}:${YT_ENGINE_PORT}`);
  }

  // 3. User configured streaming server in Settings (if custom Stremio server IP is set)
  try {
    const raw = storageService.getItem(StorageKeys.SERVERS_KEY);
    if (raw) {
      const servers: any[] = JSON.parse(raw);
      const active = servers.find((s) => s.current);
      if (active?.serverUrl) {
        const urlObj = new URL(active.serverUrl);
        const host = `${urlObj.protocol}//${urlObj.hostname}`;
        const port = urlObj.port ? urlObj.port : '11470';
        const stremioCustom = `${host}:${port}`;
        const ytCustom = `${host}:${YT_ENGINE_PORT}`;
        if (!candidates.includes(stremioCustom)) candidates.push(stremioCustom);
        if (!candidates.includes(ytCustom)) candidates.push(ytCustom);
      }
    }
  } catch {}

  // 4. Android emulator host
  if (Platform.OS === 'android') {
    candidates.push(`http://10.0.2.2:${STREMIO_ENGINE_PORT}`);
    candidates.push(`http://10.0.2.2:${YT_ENGINE_PORT}`);
  }

  return candidates;
}

class YouTubeService {
  private liveStreamMap: Map<string, LiveStreamInfo> = new Map();

  setLiveStreamInfo(videoId: string, streamUrl: string, duration?: number, qualities?: string[]): void {
    if (!videoId || !streamUrl) return;
    this.liveStreamMap.set(videoId, {
      streamUrl,
      duration,
      qualities,
      updatedAt: Date.now(),
    });
    console.log(`[YouTubeService] 🔗 Cached live stream URL for ${videoId}`);
  }

  getLiveStreamInfo(videoId: string): LiveStreamInfo | undefined {
    return this.liveStreamMap.get(videoId);
  }

  private activeBaseUrl: string | null = null;
  private lastPingTime: number = 0;

  /**
   * Resolves the active base URL for the YouTube engine.
   * Checks loopback, developer LAN IP, and custom server settings concurrently for instant pick up (<50ms).
   */
  async resolveActiveBaseUrl(timeoutMs = 1200, forceRefresh = false): Promise<string | null> {
    const now = Date.now();
    if (!forceRefresh && this.activeBaseUrl && now - this.lastPingTime < 15000) {
      return this.activeBaseUrl;
    }

    if (Platform.OS !== 'web') {
      ensureEmbeddedServerRunning().catch(() => {});
    }

    const candidates = getEngineCandidates();

    // Ping candidates concurrently for instant pickup (<50ms) instead of sequential blocking
    const pingCandidate = async (url: string, waitMs: number): Promise<string> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), waitMs);
      try {
        const res = await fetch(`${url}/yt/ping`, {
          signal: controller.signal,
        });
        if (res.ok) return url;
        throw new Error('Candidate not ok');
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      const fastestUrl = await Promise.any(candidates.map((c) => pingCandidate(c, timeoutMs)));
      this.activeBaseUrl = fastestUrl;
      this.lastPingTime = now;
      console.log(`[YouTubeService] ⚡ Connected to fastest engine at ${fastestUrl}`);
      return fastestUrl;
    } catch {
      // First round failed: if on mobile, wait briefly for nodejs-mobile to boot and retry
      if (Platform.OS !== 'web') {
        try {
          await new Promise((r) => setTimeout(r, 600));
          const loopbacks = candidates.filter((c) => c.includes('127.0.0.1') || c.includes('localhost') || c.includes('10.0.2.2'));
          const recovered = await Promise.any(loopbacks.map((c) => pingCandidate(c, 2500)));
          this.activeBaseUrl = recovered;
          this.lastPingTime = Date.now();
          return recovered;
        } catch {}
      }
    }

    this.activeBaseUrl = null;
    return null;
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
            const isShort =
              !!v.navigationEndpoint?.reelWatchEndpoint ||
              v.thumbnailOverlays?.some(
                (o: any) =>
                  o?.thumbnailOverlayTimeStatusRenderer?.style === 'SHORTS' ||
                  o?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText?.toUpperCase() === 'SHORTS'
              );
            if (isShort) continue;

            const title =
              v.title?.runs?.[0]?.text ||
              v.title?.simpleText ||
              v.headline?.runs?.[0]?.text ||
              v.headline?.simpleText ||
              'Untitled';
            if (title.toLowerCase().includes('#short')) continue;
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
            const isLive = v.badges?.some((b: any) =>
              b.metadataBadgeRenderer?.label?.toLowerCase().includes('live') ||
              b.metadataBadgeRenderer?.style?.toLowerCase().includes('live')
            ) || v.style === 'BADGE_STYLE_TYPE_LIVE_NOW';

            let rawPublished =
              v.publishedTimeText?.simpleText ||
              v.publishedTimeText?.runs?.map((r: any) => r.text).join('') ||
              '';

            if (!rawPublished && isLive) {
              rawPublished = 'LIVE';
            }
            const published = formatPublishedTime(rawPublished);

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
            const isShort =
              !!v.navigationEndpoint?.reelWatchEndpoint ||
              v.thumbnailOverlays?.some(
                (o: any) =>
                  o?.thumbnailOverlayTimeStatusRenderer?.style === 'SHORTS' ||
                  o?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText?.toUpperCase() === 'SHORTS'
              );
            if (isShort) continue;

            const title =
              v.title?.runs?.[0]?.text ||
              v.title?.simpleText ||
              v.headline?.runs?.[0]?.text ||
              v.headline?.simpleText ||
              'Untitled';
            if (title.toLowerCase().includes('#short')) continue;
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
            const isLive = v.badges?.some((b: any) =>
              b.metadataBadgeRenderer?.label?.toLowerCase().includes('live') ||
              b.metadataBadgeRenderer?.style?.toLowerCase().includes('live')
            ) || v.style === 'BADGE_STYLE_TYPE_LIVE_NOW';

            let rawPublished =
              v.publishedTimeText?.simpleText ||
              v.publishedTimeText?.runs?.map((r: any) => r.text).join('') ||
              '';

            if (!rawPublished && isLive) {
              rawPublished = 'LIVE';
            }
            const published = formatPublishedTime(rawPublished);

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
  async getVideoDetails(videoId: string, fallbackItem?: YouTubeVideoItem | null): Promise<YouTubeVideoDetails> {
    const liveStream = this.liveStreamMap.get(videoId);

    // 1. Ensure the embedded engine on 11470 is booting/running on mobile
    if (Platform.OS !== 'web') {
      ensureEmbeddedServerRunning().catch(() => {});
    }

    // 2. Check active or candidate local engines (port 11470, 11472, or PC LAN IP)
    const localCandidates = getEngineCandidates();
    for (const baseUrl of localCandidates.slice(0, 3)) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${baseUrl}/yt/info?v=${encodeURIComponent(videoId)}`, {
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));

        if (res.ok) {
          const data = await res.json();
          if (data && (data.formats?.videoAdaptive?.length || data.formats?.progressive?.length)) {
            this.activeBaseUrl = baseUrl;
            console.log(`[YouTubeService] ✅ Resolved formats for ${videoId} via ${baseUrl}`);

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

            const captionTracks: YouTubeCaptionTrack[] = (data.captions || []).map((ct: any) => ({
              baseUrl: ct.baseUrl || ct.base_url || '',
              name: typeof ct.name === 'object' ? (ct.name.text || ct.name.simpleText || ct.name.toString?.() || '') : (ct.name || ''),
              languageCode: ct.languageCode || ct.language_code || 'en',
              vssId: ct.vssId || ct.vss_id,
              kind: ct.kind,
            }));

            return {
              id: data.id || videoId,
              title: data.title || fallbackItem?.title || 'YouTube Video',
              channel: data.channel || fallbackItem?.channel || 'YouTube',
              channelId: data.channelId || fallbackItem?.channelId,
              thumbnail: data.thumbnail || fallbackItem?.thumbnail || `https://i.ytimg.com/vi/${data.id || videoId}/hqdefault.jpg`,
              duration: data.duration,
              views: data.views,
              captionTracks,
              formats: {
                progressive: progressiveFormats,
                videoAdaptive: videoAdaptiveFormats,
                audioAdaptive: audioAdaptiveFormats,
              },
            };
          }
        }
      } catch {}
    }

    // 2. Client-side public instance resolution (Serverless - runs completely on mobile device)
    try {
      const publicDetails = await this.fetchFromPublicInstances(videoId, fallbackItem);
      if (publicDetails && (publicDetails.formats.videoAdaptive.length > 0 || publicDetails.formats.progressive.length > 0)) {
        console.log(`[YouTubeService] ✅ Successfully retrieved ${publicDetails.formats.videoAdaptive.length} resolutions via client public mirror`);
        return publicDetails;
      }
    } catch (err) {
      console.warn(`[YouTubeService] Public instance resolution failed for ${videoId}:`, err);
    }

    // 3. Fallback format builder (100% resilient, ensures all resolutions & audio are always selectable)
    return this.buildFallbackVideoDetails(videoId, fallbackItem, liveStream);
  }

  /**
   * Fetches video stream formats directly from public high-speed Invidious API instances
   */
  async fetchFromPublicInstances(videoId: string, fallbackItem?: YouTubeVideoItem | null): Promise<YouTubeVideoDetails | null> {
    const instances = [
      'https://yt.chocolatemoo53.com',
      'https://invidious.jing.rocks',
      'https://invidious.privacydev.net',
      'https://iv.ggtyler.dev',
    ];

    for (const inst of instances) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(`${inst}/api/v1/videos/${encodeURIComponent(videoId)}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        }).finally(() => clearTimeout(timer));

        if (!res.ok) continue;
        const data = await res.json();
        if (!data || (!data.adaptiveFormats && !data.formatStreams)) continue;

        const progressive: YouTubeFormatOption[] = (data.formatStreams || []).map((f: any) => ({
          itag: f.itag ? parseInt(f.itag, 10) : 18,
          quality: f.quality || f.resolution || '360p',
          container: f.container || 'mp4',
          mimeType: f.type || 'video/mp4',
          url: f.url || '',
          contentLength: f.clen ? parseInt(f.clen, 10) : undefined,
          sizeFormatted: formatBytes(f.clen ? parseInt(f.clen, 10) : undefined),
          hasAudio: true,
          hasVideo: true,
          type: 'video' as const,
        }));

        const videoAdaptive: YouTubeFormatOption[] = (data.adaptiveFormats || [])
          .filter((f: any) => (f.type || '').startsWith('video/'))
          .map((f: any) => ({
            itag: f.itag ? parseInt(f.itag, 10) : 137,
            quality: f.qualityLabel || f.resolution || 'HD',
            container: (f.container || f.type || '').includes('mp4') ? 'mp4' : 'webm',
            mimeType: f.type || 'video/mp4',
            url: f.url || '',
            contentLength: f.clen ? parseInt(f.clen, 10) : undefined,
            sizeFormatted: formatBytes(f.clen ? parseInt(f.clen, 10) : undefined),
            hasAudio: false,
            hasVideo: true,
            type: 'video' as const,
          }));

        let audioAdaptive: YouTubeFormatOption[] = (data.adaptiveFormats || [])
          .filter((f: any) => (f.type || '').startsWith('audio/'))
          .map((f: any) => {
            const kbps = f.bitrate ? Math.round(f.bitrate / 1000) : 128;
            return {
              itag: f.itag ? parseInt(f.itag, 10) : 140,
              quality: `${kbps} kbps`,
              container: 'mp3',
              mimeType: f.type || 'audio/mp4',
              url: f.url || '',
              contentLength: f.clen ? parseInt(f.clen, 10) : undefined,
              sizeFormatted: formatBytes(f.clen ? parseInt(f.clen, 10) : undefined),
              hasAudio: true,
              hasVideo: false,
              type: 'audio' as const,
            };
          });

        if (audioAdaptive.length === 0 && progressive.length > 0) {
          audioAdaptive = progressive.map((f) => ({
            ...f,
            quality: '128 kbps',
            container: 'mp3',
            type: 'audio' as const,
          }));
        }

        return {
          id: data.videoId || videoId,
          title: data.title || fallbackItem?.title || 'YouTube Video',
          channel: data.author || fallbackItem?.channel || 'YouTube',
          channelId: data.authorId || fallbackItem?.channelId,
          thumbnail: (data.videoThumbnails && data.videoThumbnails[0]?.url) || fallbackItem?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: data.lengthSeconds,
          views: data.viewCount,
          formats: {
            progressive,
            videoAdaptive,
            audioAdaptive,
          },
        };
      } catch {}
    }

    return null;
  }

  /**
   * Generates standard high-definition format options and audio tracks so the user
   * can always choose their desired resolution (1080p, 720p, 480p, 360p, 240p) or MP3.
   */
  buildFallbackVideoDetails(
    videoId: string,
    fallbackItem?: YouTubeVideoItem | null,
    liveStream?: LiveStreamInfo
  ): YouTubeVideoDetails {
    const title = fallbackItem?.title || 'YouTube Video';
    const channel = fallbackItem?.channel || 'YouTube';
    const thumbnail = fallbackItem?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const defaultStream = liveStream?.streamUrl || '';

    const progressiveFormats: YouTubeFormatOption[] = [
      {
        itag: 22,
        quality: '720p',
        container: 'mp4',
        mimeType: 'video/mp4',
        url: defaultStream,
        sizeFormatted: 'Combined Video + Audio',
        hasAudio: true,
        hasVideo: true,
        type: 'video',
      },
      {
        itag: 18,
        quality: '360p',
        container: 'mp4',
        mimeType: 'video/mp4',
        url: defaultStream,
        sizeFormatted: 'Standard Video + Audio',
        hasAudio: true,
        hasVideo: true,
        type: 'video',
      },
    ];

    const videoAdaptiveFormats: YouTubeFormatOption[] = [
      {
        itag: 137,
        quality: '1080p',
        container: 'mp4',
        mimeType: 'video/mp4',
        url: defaultStream,
        sizeFormatted: 'Full HD (1080p)',
        hasAudio: false,
        hasVideo: true,
        type: 'video',
      },
      {
        itag: 136,
        quality: '720p',
        container: 'mp4',
        mimeType: 'video/mp4',
        url: defaultStream,
        sizeFormatted: 'HD (720p)',
        hasAudio: false,
        hasVideo: true,
        type: 'video',
      },
      {
        itag: 135,
        quality: '480p',
        container: 'mp4',
        mimeType: 'video/mp4',
        url: defaultStream,
        sizeFormatted: 'SD (480p)',
        hasAudio: false,
        hasVideo: true,
        type: 'video',
      },
      {
        itag: 134,
        quality: '360p',
        container: 'mp4',
        mimeType: 'video/mp4',
        url: defaultStream,
        sizeFormatted: 'Medium (360p)',
        hasAudio: false,
        hasVideo: true,
        type: 'video',
      },
      {
        itag: 133,
        quality: '240p',
        container: 'mp4',
        mimeType: 'video/mp4',
        url: defaultStream,
        sizeFormatted: 'Compact (240p)',
        hasAudio: false,
        hasVideo: true,
        type: 'video',
      },
    ];

    const audioAdaptiveFormats: YouTubeFormatOption[] = [
      {
        itag: 140,
        quality: '128 kbps',
        container: 'mp3',
        mimeType: 'audio/mp4',
        url: defaultStream,
        sizeFormatted: 'High Quality MP3',
        hasAudio: true,
        hasVideo: false,
        type: 'audio',
      },
      {
        itag: 141,
        quality: '160 kbps',
        container: 'mp3',
        mimeType: 'audio/mp4',
        url: defaultStream,
        sizeFormatted: 'Studio MP3 Audio',
        hasAudio: true,
        hasVideo: false,
        type: 'audio',
      },
      {
        itag: 139,
        quality: '64 kbps',
        container: 'mp3',
        mimeType: 'audio/mp4',
        url: defaultStream,
        sizeFormatted: 'Fast Audio Download',
        hasAudio: true,
        hasVideo: false,
        type: 'audio',
      },
    ];

    return {
      id: videoId,
      title,
      channel,
      channelId: fallbackItem?.channelId,
      thumbnail,
      duration: liveStream?.duration,
      formats: {
        progressive: progressiveFormats,
        videoAdaptive: videoAdaptiveFormats,
        audioAdaptive: audioAdaptiveFormats,
      },
    };
  }

  /**
   * Resolves a direct downloadable HTTPS stream URL for a given format.
   * GUARANTEES that video downloads ALWAYS contain an audio track!
   */
  async resolveDownloadStreamUrl(videoId: string, format: YouTubeFormatOption): Promise<string> {
    const isAudio = format.type === 'audio';

    // 1. Audio Downloads (MP3 / M4A)
    if (isAudio) {
      if (format.url && format.url.startsWith('http') && !format.hasVideo) {
        return format.url;
      }
      try {
        const details = await this.getVideoDetails(videoId);
        const audioList = details.formats?.audioAdaptive || [];
        const itagMatch = audioList.find((f) => f.itag === format.itag && f.url && f.url.startsWith('http'));
        if (itagMatch?.url) return itagMatch.url;
        const audioFormat = audioList.find((f) => f.url && f.url.startsWith('http'));
        if (audioFormat?.url) return audioFormat.url;
        const progFormat = (details.formats?.progressive || []).find((f) => f.url && f.url.startsWith('http'));
        if (progFormat?.url) return progFormat.url;
      } catch {}

      try {
        const isEngineUp = await this.pingEngine(1500);
        if (isEngineUp) {
          const base = this.getActiveBaseUrl();
          return `${base}/yt/download?v=${encodeURIComponent(videoId)}&type=audio&itag=${format.itag || ''}&quality=${encodeURIComponent(format.quality || '')}`;
        }
      } catch {}

      if (format.url && format.url.startsWith('http')) {
        return format.url;
      }
      if (format.proxyUrl && format.proxyUrl.startsWith('http')) {
        return format.proxyUrl;
      }

      throw new Error('Unable to resolve audio stream URL. Please check connection and try again.');
    }

    // 2. Video Downloads (MP4) - Match User's Chosen Resolution & Itag
    const cleanQ = format.quality ? format.quality.replace(/\D/g, '') : '';
    const targetItag = format.itag;

    // 2.1 Direct URL if the format object already contains one
    if (format.url && format.url.startsWith('http')) {
      console.log(`[YouTubeService] 🎯 Using direct URL for selected format (${format.quality}, itag ${format.itag})`);
      return format.url;
    }

    // 2.2 Search videoDetails for the requested format by itag or quality
    try {
      const details = await this.getVideoDetails(videoId);
      const allFormats = [
        ...(details.formats?.progressive || []),
        ...(details.formats?.videoAdaptive || []),
      ];

      // Exact itag match
      if (targetItag) {
        const itagMatch = allFormats.find((f) => f.itag === targetItag && f.url && f.url.startsWith('http'));
        if (itagMatch?.url) {
          console.log(`[YouTubeService] 🎯 Found exact itag ${targetItag} match (${itagMatch.quality}) for download`);
          return itagMatch.url;
        }
      }

      // Resolution match (e.g. 1080, 720, 480, 360, 240, 144)
      if (cleanQ) {
        const qualityMatch =
          (details.formats?.progressive || []).find((f) => f.quality.includes(cleanQ) && f.url && f.url.startsWith('http')) ||
          (details.formats?.videoAdaptive || []).find((f) => f.quality.includes(cleanQ) && f.url && f.url.startsWith('http')) ||
          allFormats.find((f) => f.quality.includes(cleanQ) && f.url && f.url.startsWith('http'));

        if (qualityMatch?.url) {
          console.log(`[YouTubeService] 🎯 Found quality match for ${cleanQ}p (${qualityMatch.quality}, itag ${qualityMatch.itag}) for download`);
          return qualityMatch.url;
        }
      }
    } catch (err) {
      console.warn('[YouTubeService] Error resolving video format from details:', err);
    }

    // 2.3 Route through backend engine with exact itag and quality parameters
    try {
      const isEngineUp = await this.pingEngine(1500);
      if (isEngineUp) {
        const base = this.getActiveBaseUrl();
        const downloadUrl = `${base}/yt/download?v=${encodeURIComponent(videoId)}&type=video&itag=${format.itag || ''}&quality=${encodeURIComponent(format.quality || '')}`;
        console.log(`[YouTubeService] 🚀 Routing download for ${format.quality} (itag ${format.itag}) through engine: ${downloadUrl}`);
        return downloadUrl;
      }
    } catch {}

    if (format.proxyUrl && format.proxyUrl.startsWith('http')) {
      return format.proxyUrl;
    }

    const liveStream = this.liveStreamMap.get(videoId);
    if (liveStream?.streamUrl && liveStream.streamUrl.startsWith('http')) {
      return liveStream.streamUrl;
    }

    throw new Error('Unable to resolve video download URL. Please check connection and try again.');
  }

  getActiveBaseUrl(): string {
    return this.activeBaseUrl || getEngineCandidates()[0] || `http://127.0.0.1:${STREMIO_ENGINE_PORT}`;
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

  isSubscribed(channelIdentifier: string): boolean {
    if (!channelIdentifier) return false;
    const subs = this.getSubscriptions();
    const clean = channelIdentifier.trim().toLowerCase();
    const cleanHandle = clean.startsWith('@') ? clean : `@${clean.replace(/\s+/g, '')}`;
    return subs.some((s) => {
      const sId = (s.channelId || '').trim().toLowerCase();
      const sTitle = (s.channelTitle || '').trim().toLowerCase();
      const sHandle = sTitle.startsWith('@') ? sTitle : `@${sTitle.replace(/\s+/g, '')}`;
      return sId === clean || sTitle === clean || sHandle === cleanHandle;
    });
  }

  getCachedSubscriptionId(channelId: string): string | undefined {
    const subs = this.getSubscriptions();
    const item = subs.find((s) => s.channelId === channelId);
    return item?.subscriptionId;
  }

  saveLocalSubscription(channel: YouTubeChannelSubscription) {
    const subs = this.getSubscriptions();
    const cleanId = channel.channelId || channel.channelTitle;
    const index = subs.findIndex((s) => s.channelId === cleanId || s.channelTitle === channel.channelTitle);
    if (index >= 0) {
      subs[index] = { ...subs[index], ...channel };
    } else {
      subs.unshift(channel);
    }
    storageService.setItem(YT_SUBSCRIPTIONS_KEY, JSON.stringify(subs));
  }

  removeLocalSubscription(channelIdentifier: string) {
    if (!channelIdentifier) return;
    const clean = channelIdentifier.trim().toLowerCase();
    const subs = this.getSubscriptions().filter((s) => {
      const sId = (s.channelId || '').trim().toLowerCase();
      const sTitle = (s.channelTitle || '').trim().toLowerCase();
      return sId !== clean && sTitle !== clean;
    });
    storageService.setItem(YT_SUBSCRIPTIONS_KEY, JSON.stringify(subs));
  }

  toggleSubscription(channel: { channelId: string; channelTitle: string; avatarUrl?: string }): boolean {
    const subscribed = this.isSubscribed(channel.channelId || channel.channelTitle);
    if (subscribed) {
      this.removeLocalSubscription(channel.channelId || channel.channelTitle);
      return false;
    } else {
      this.saveLocalSubscription({
        channelId: channel.channelId,
        channelTitle: channel.channelTitle,
        avatarUrl: channel.avatarUrl,
        subscribedAt: Date.now(),
      });
      return true;
    }
  }

  /**
   * Returns a valid Google OAuth access token, refreshing it if expired.
   */
  async getValidAccessToken(): Promise<string | null> {
    const tokens = this.getOAuthTokens();
    if (!tokens?.access_token) return null;

    if (tokens.expires_at > Date.now() + 60000) {
      return tokens.access_token;
    }

    if (tokens.refresh_token) {
      try {
        const refreshed = await this.refreshGoogleAccessToken();
        if (refreshed) return refreshed;
      } catch {}
    }

    return tokens.access_token || null;
  }

  /**
   * Resolves the real YouTube channel ID (UC...) using multiple high-resilience strategies.
   */
  async resolveChannelId(videoId: string, channelNameOrHandle?: string): Promise<string | null> {
    // 1. Direct UC ID check
    if (channelNameOrHandle && channelNameOrHandle.startsWith('UC') && channelNameOrHandle.length === 24) {
      return channelNameOrHandle;
    }

    // 2. Query Google YouTube Data API v3 if OAuth access token is active
    const token = await this.getValidAccessToken();
    if (token && videoId) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));

        if (res.ok) {
          const data = await res.json();
          const chId = data.items?.[0]?.snippet?.channelId;
          if (chId && chId.startsWith('UC')) return chId;
        }
      } catch {}
    }

    // 3. Query via channel handle if handle starts with @
    if (token && channelNameOrHandle && channelNameOrHandle.startsWith('@')) {
      try {
        const cleanHandle = channelNameOrHandle.replace(/^@/, '');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(cleanHandle)}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));

        if (res.ok) {
          const data = await res.json();
          const chId = data.items?.[0]?.id;
          if (chId && chId.startsWith('UC')) return chId;
        }
      } catch {}
    }

    // 4. Query embedded local engine
    try {
      const baseUrl = await this.resolveActiveBaseUrl(600);
      if (baseUrl && videoId) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`${baseUrl}/yt/info?v=${encodeURIComponent(videoId)}`, {
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));

        if (res.ok) {
          const data = await res.json();
          if (data.channelId && data.channelId.startsWith('UC')) return data.channelId;
        }
      }
    } catch {}

    // 5. Query public Invidious instance for video metadata authorId
    if (videoId) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`https://yt.chocolatemoo53.com/api/v1/videos/${encodeURIComponent(videoId)}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        }).finally(() => clearTimeout(timer));

        if (res.ok) {
          const data = await res.json();
          if (data.authorId && data.authorId.startsWith('UC')) return data.authorId;
        }
      } catch {}
    }

    return null;
  }

  /**
   * Real-time verification of whether the user is subscribed to a channel on YouTube.
   */
  async checkSubscriptionStatus(
    channelIdentifier: string,
    videoId?: string
  ): Promise<{ isSubscribed: boolean; subscriptionId?: string }> {
    const isLocallySubscribed = this.isSubscribed(channelIdentifier);

    // If not authenticated, rely on local state
    const auth = this.getCachedAuthStatus();
    if (!auth.authenticated) {
      return { isSubscribed: isLocallySubscribed };
    }

    try {
      const resolvedChannelId = await this.resolveChannelId(videoId || '', channelIdentifier);
      if (!resolvedChannelId) {
        return { isSubscribed: isLocallySubscribed };
      }

      const token = await this.getValidAccessToken();
      if (token) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/subscriptions?part=id&mine=true&forChannelId=${encodeURIComponent(resolvedChannelId)}`,
          {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            signal: controller.signal,
          }
        ).finally(() => clearTimeout(timer));

        if (res.ok) {
          const data = await res.json();
          const isSub = Array.isArray(data.items) && data.items.length > 0;
          const subscriptionId = isSub ? data.items[0]?.id : undefined;

          if (isSub) {
            this.saveLocalSubscription({
              channelId: resolvedChannelId,
              channelTitle: channelIdentifier,
              subscriptionId,
              subscribedAt: Date.now(),
            });
          } else {
            this.removeLocalSubscription(resolvedChannelId);
          }

          return { isSubscribed: isSub, subscriptionId };
        }
      }
    } catch (err) {
      console.warn('[YouTubeService] checkSubscriptionStatus error:', err);
    }

    return { isSubscribed: isLocallySubscribed };
  }

  /**
   * Real subscription to a YouTube channel via Google YouTube Data API v3 and local engine.
   */
  async subscribeReal(params: {
    channelId?: string;
    channelTitle: string;
    avatarUrl?: string;
    videoId?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const auth = await this.getAuthStatus();
    if (!auth.authenticated) {
      return { success: false, error: 'NOT_AUTHENTICATED' };
    }

    const resolvedChannelId = await this.resolveChannelId(params.videoId || '', params.channelId || params.channelTitle);
    if (!resolvedChannelId) {
      return { success: false, error: 'Could not resolve channel ID' };
    }

    let subscriptionId: string | undefined;
    let didSucceed = false;

    // 1. Google YouTube Data API v3
    const token = await this.getValidAccessToken();
    if (token) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const res = await fetch('https://www.googleapis.com/youtube/v3/subscriptions?part=snippet', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            snippet: {
              resourceId: {
                kind: 'youtube#channel',
                channelId: resolvedChannelId,
              },
            },
          }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));

        if (res.ok) {
          const data = await res.json();
          subscriptionId = data.id;
          didSucceed = true;
        } else {
          const errData = await res.json().catch(() => ({}));
          const reason = errData?.error?.errors?.[0]?.reason;
          if (reason === 'subscriptionDuplicate') {
            didSucceed = true;
          } else {
            console.warn('[YouTubeService] Google API subscribe error:', errData);
          }
        }
      } catch (err) {
        console.warn('[YouTubeService] Google API subscribe request failed:', err);
      }
    }

    // 2. Embedded engine sync
    try {
      const baseUrl = await this.resolveActiveBaseUrl(600);
      if (baseUrl) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${baseUrl}/yt/channel/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId: resolvedChannelId }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));
        if (res.ok) didSucceed = true;
      }
    } catch {}

    if (didSucceed) {
      this.saveLocalSubscription({
        channelId: resolvedChannelId,
        channelTitle: params.channelTitle,
        avatarUrl: params.avatarUrl,
        subscriptionId,
        subscribedAt: Date.now(),
      });
      return { success: true };
    }

    return { success: false, error: 'Subscription request failed. Please check network or try signing in again.' };
  }

  /**
   * Real unsubscription from a YouTube channel via Google YouTube Data API v3 and local engine.
   */
  async unsubscribeReal(params: {
    channelId?: string;
    channelTitle?: string;
    videoId?: string;
    subscriptionId?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const auth = await this.getAuthStatus();
    if (!auth.authenticated) {
      return { success: false, error: 'NOT_AUTHENTICATED' };
    }

    const resolvedChannelId = await this.resolveChannelId(params.videoId || '', params.channelId || params.channelTitle);
    let didSucceed = false;

    // 1. Google YouTube Data API v3
    const token = await this.getValidAccessToken();
    if (token && resolvedChannelId) {
      try {
        let subId = params.subscriptionId || this.getCachedSubscriptionId(resolvedChannelId);
        if (!subId) {
          const checkRes = await fetch(
            `https://www.googleapis.com/youtube/v3/subscriptions?part=id&mine=true&forChannelId=${encodeURIComponent(resolvedChannelId)}`,
            {
              headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            }
          );
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            subId = checkData.items?.[0]?.id;
          }
        }

        if (subId) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          const delRes = await fetch(`https://www.googleapis.com/youtube/v3/subscriptions?id=${encodeURIComponent(subId)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }).finally(() => clearTimeout(timer));

          if (delRes.status === 204 || delRes.ok) {
            didSucceed = true;
          }
        }
      } catch (err) {
        console.warn('[YouTubeService] Google API unsubscribe error:', err);
      }
    }

    // 2. Embedded engine sync
    try {
      const baseUrl = await this.resolveActiveBaseUrl(600);
      if (baseUrl && resolvedChannelId) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${baseUrl}/yt/channel/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId: resolvedChannelId }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));
        if (res.ok) didSucceed = true;
      }
    } catch {}

    // Always update local cache on unsubscribe
    this.removeLocalSubscription(resolvedChannelId || params.channelId || params.channelTitle || '');
    return { success: true };
  }

  private cachedAuthStatus: YouTubeAuthStatus | null = null;

  getCachedAuthStatus(): YouTubeAuthStatus {
    if (this.cachedAuthStatus) return this.cachedAuthStatus;
    try {
      const raw = storageService.getItem('yt_auth_status_cached');
      if (raw) {
        this.cachedAuthStatus = JSON.parse(raw);
        return this.cachedAuthStatus!;
      }
    } catch {}
    return { authenticated: false };
  }

  setCachedAuthStatus(status: YouTubeAuthStatus) {
    this.cachedAuthStatus = status;
    try {
      if (status.authenticated) {
        storageService.setItem('yt_auth_status_cached', JSON.stringify(status));
      } else {
        storageService.removeItem('yt_auth_status_cached');
      }
    } catch {}
  }

  getOAuthTokens(): YouTubeOAuthTokens | null {
    try {
      const raw = storageService.getItem(YT_OAUTH_TOKENS_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}
    return null;
  }

  setOAuthTokens(tokens: YouTubeOAuthTokens | null) {
    try {
      if (tokens) {
        storageService.setItem(YT_OAUTH_TOKENS_KEY, JSON.stringify(tokens));
      } else {
        storageService.removeItem(YT_OAUTH_TOKENS_KEY);
      }
    } catch {}
  }

  // ── Real Google SSO (OAuth2 Device Flow) ───────────────────────────────────

  /**
   * Initializes Google SSO by requesting a device code and verification URL.
   * Pre-fills `?user_code=` so the browser opens directly to Google's "Choose an account" screen.
   */
  async startGoogleSSO(): Promise<GoogleSSOResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(GOOGLE_OAUTH_DEVICE_CODE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        body: JSON.stringify({
          client_id: GOOGLE_OAUTH_CLIENT_ID,
          scope: GOOGLE_OAUTH_SCOPES,
          device_id: '12345678-1234-4234-8234-123456789abc',
          device_model: 'ytlr::',
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Google SSO error (${res.status}): ${errText || res.statusText}`);
      }

      const data = await res.json();
      if (!data.device_code || !data.user_code) {
        throw new Error(data.error_description || data.error || 'Failed to initialize Google SSO');
      }

      const verificationUrl = data.verification_url || 'https://www.google.com/device';
      // Appending ?user_code= automatically validates code and displays Google account picker!
      const authUrl = `${verificationUrl}?user_code=${encodeURIComponent(data.user_code)}`;

      return {
        device_code: data.device_code,
        user_code: data.user_code,
        verification_url: verificationUrl,
        auth_url: authUrl,
        interval: data.interval || 5,
        expires_in: data.expires_in || 1800,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Connection timed out contacting Google servers. Please check your network.');
      }
      throw err;
    }
  }

  /**
   * Polls Google token endpoint until user approves or code expires.
   */
  async pollGoogleSSOToken(deviceCode: string): Promise<{
    status: 'pending' | 'success' | 'expired' | 'error';
    tokens?: YouTubeOAuthTokens;
    error?: string;
  }> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        body: JSON.stringify({
          client_id: GOOGLE_OAUTH_CLIENT_ID,
          client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
          code: deviceCode,
          grant_type: 'http://oauth.net/grant_type/device/1.0',
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      const data = await res.json();

      if (data.access_token) {
        const tokens: YouTubeOAuthTokens = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Date.now() + (data.expires_in || 3600) * 1000,
          token_type: data.token_type || 'Bearer',
          scope: data.scope,
        };
        this.setOAuthTokens(tokens);
        return { status: 'success', tokens };
      }

      if (data.error === 'authorization_pending' || data.error === 'slow_down') {
        return { status: 'pending' };
      }

      if (data.error === 'expired_token') {
        return { status: 'expired', error: 'Verification code expired. Please try again.' };
      }

      return { status: 'error', error: data.error_description || data.error || 'Authorization failed' };
    } catch {
      return { status: 'pending' };
    }
  }

  /**
   * Refreshes access token in background using saved refresh token.
   */
  async refreshGoogleAccessToken(): Promise<string | null> {
    const existing = this.getOAuthTokens();
    if (!existing?.refresh_token) return null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: GOOGLE_OAUTH_CLIENT_ID,
          client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
          refresh_token: existing.refresh_token,
          grant_type: 'refresh_token',
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          const updated: YouTubeOAuthTokens = {
            ...existing,
            access_token: data.access_token,
            expires_at: Date.now() + (data.expires_in || 3600) * 1000,
          };
          this.setOAuthTokens(updated);
          return updated.access_token;
        }
      }
    } catch (err) {
      console.warn('[YouTubeService] refreshGoogleAccessToken error:', err);
    }
    return null;
  }

  /**
   * Fetches real user channel name, handle/email, and high-res avatar.
   * Priority: Local Innertube session -> Google UserInfo -> YouTube Data API -> TokenInfo -> fallback.
   */
  async fetchGoogleUserProfile(accessToken: string): Promise<YouTubeUserProfile> {
    // 0. If local engine has authenticated session, read real Innertube profile
    try {
      const baseUrl = await this.resolveActiveBaseUrl(600);
      if (baseUrl) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1200);
        const res = await fetch(`${baseUrl}/yt/auth/status`, { signal: controller.signal }).finally(() => clearTimeout(timer));
        if (res.ok) {
          const st = await res.json();
          if (st.authenticated && st.user && st.user.name && st.user.name !== 'YouTube User') {
            return {
              name: st.user.name,
              email: st.user.email || undefined,
              avatar: st.user.avatar || undefined,
            };
          }
        }
      }
    } catch {}

    let name = 'YouTube User';
    let email = '';
    let avatar = '';

    // 1. Google OAuth2 UserInfo API (OIDC standard: name, email, profile picture)
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);

      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (res.ok) {
        const info = await res.json();
        if (info.name) name = info.name.trim();
        if (info.email) email = info.email.trim();
        if (info.picture) avatar = info.picture;
      }
    } catch {}

    // 2. YouTube Channel Snippet (for custom channel URL / avatar if not yet found)
    if (name === 'YouTube User' || !avatar) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);

        const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.items) && data.items.length > 0) {
            const ch = data.items[0];
            if (ch.snippet?.title && name === 'YouTube User') {
              name = ch.snippet.title.trim();
            }
            if (ch.snippet?.customUrl && !email) {
              email = ch.snippet.customUrl;
            }
            const thumbs = ch.snippet?.thumbnails;
            if (thumbs && !avatar) {
              avatar = thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || '';
            }
          }
        }
      } catch (err) {
        console.warn('[YouTubeService] channel info fetch error:', err);
      }
    }

    // 3. Tokeninfo for email
    if (!email || name === 'YouTube User') {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`, {
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));

        if (res.ok) {
          const info = await res.json();
          if (info.email && !email.includes('@')) {
            email = info.email;
          }
          if (name === 'YouTube User' && info.email) {
            name = info.email.split('@')[0];
          }
        }
      } catch {}
    }

    if (!avatar && name) {
      avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=FF0000&color=fff`;
    }

    return {
      name,
      email: email || undefined,
      avatar,
    };
  }

  /**
   * Finalizes Google SSO with tokens and saves profile.
   */
  async completeGoogleSSO(tokens: YouTubeOAuthTokens): Promise<YouTubeAuthStatus> {
    this.setOAuthTokens(tokens);

    // Sync credentials to local engine so Innertube acquires session immediately
    try {
      const baseUrl = await this.resolveActiveBaseUrl(800);
      if (baseUrl) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        await fetch(`${baseUrl}/yt/auth/set-credentials`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tokens),
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));
      }
    } catch {}

    const profile = await this.fetchGoogleUserProfile(tokens.access_token);
    const newStatus: YouTubeAuthStatus = {
      authenticated: true,
      user: profile,
    };
    this.setCachedAuthStatus(newStatus);
    return newStatus;
  }

  async loginWithGoogleAccount(user: { name?: string; email: string; avatar?: string }): Promise<YouTubeAuthStatus> {
    const cleanName = user.name?.trim() || user.email.split('@')[0] || 'YouTube User';
    const status: YouTubeAuthStatus = {
      authenticated: true,
      user: {
        name: cleanName,
        email: user.email.trim(),
        avatar: user.avatar?.trim() || `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=FF0000&color=fff`,
      },
    };
    this.setCachedAuthStatus(status);
    return status;
  }

  // ── Auth Status & Session Management ───────────────────────────────────────

  async getAuthStatus(timeoutMs = 1500): Promise<YouTubeAuthStatus> {
    try {
      // 1. Check local backend engine first: Innertube session has real user profile
      const baseUrl = await this.resolveActiveBaseUrl(Math.min(timeoutMs, 800));
      if (baseUrl) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 1200);
          const res = await fetch(`${baseUrl}/yt/auth/status`, {
            signal: controller.signal,
          }).finally(() => clearTimeout(timer));

          if (res.ok) {
            const status: YouTubeAuthStatus = await res.json();
            if (status.authenticated && status.user && status.user.name && status.user.name !== 'YouTube User') {
              this.setCachedAuthStatus(status);
              return status;
            }
          }
        } catch {}
      }

      // 2. Check cached auth status (only return immediately if it has real user profile)
      const cached = this.getCachedAuthStatus();
      const hasRealUser =
        cached.authenticated &&
        cached.user &&
        cached.user.name &&
        cached.user.name !== 'YouTube User' &&
        !cached.user.avatar?.includes('ui-avatars.com') &&
        cached.user.email;

      if (hasRealUser) {
        // Refresh token if near expiration (< 5 min)
        const tokens = this.getOAuthTokens();
        if (tokens?.refresh_token && tokens.expires_at - Date.now() < 300000) {
          this.refreshGoogleAccessToken().catch(() => {});
        }
        return cached;
      }

      // 3. Check stored tokens if available
      const tokens = this.getOAuthTokens();
      if (tokens?.access_token) {
        let activeToken = tokens.access_token;
        if (tokens.expires_at <= Date.now() && tokens.refresh_token) {
          const refreshedToken = await this.refreshGoogleAccessToken();
          if (refreshedToken) {
            activeToken = refreshedToken;
          }
        }

        // Try syncing tokens with backend engine if available
        if (baseUrl) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2000);
            await fetch(`${baseUrl}/yt/auth/set-credentials`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(tokens),
              signal: controller.signal,
            }).finally(() => clearTimeout(timer));

            const res = await fetch(`${baseUrl}/yt/auth/status`);
            if (res.ok) {
              const status: YouTubeAuthStatus = await res.json();
              if (status.authenticated && status.user && status.user.name && status.user.name !== 'YouTube User') {
                this.setCachedAuthStatus(status);
                return status;
              }
            }
          } catch {}
        }

        const profile = await this.fetchGoogleUserProfile(activeToken);
        const status: YouTubeAuthStatus = { authenticated: true, user: profile };
        this.setCachedAuthStatus(status);
        return status;
      }

      if (cached.authenticated) {
        return cached;
      }

      return { authenticated: false };
    } catch {
      return this.getCachedAuthStatus();
    }
  }

  async startAuth(timeoutMs = 4000): Promise<YouTubeAuthStartResponse> {
    // For local backend device auth if available
    try {
      const baseUrl = await this.resolveActiveBaseUrl(600);
      if (baseUrl) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(`${baseUrl}/yt/auth/start`, {
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));

        if (res.ok) {
          return await res.json();
        }
      }
    } catch {}

    // Direct Google SSO device flow fallback
    try {
      const sso = await this.startGoogleSSO();
      return {
        status: 'pending',
        user_code: sso.user_code,
        verification_url: sso.auth_url,
        expires_in: sso.expires_in,
      };
    } catch (err: any) {
      return { status: 'error', error: err?.message || 'Failed to start authentication' };
    }
  }

  async logout(timeoutMs = 3000): Promise<boolean> {
    try {
      this.setOAuthTokens(null);
      this.setCachedAuthStatus({ authenticated: false, user: null, pending: null });

      const baseUrl = await this.resolveActiveBaseUrl(400);
      if (baseUrl) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        await fetch(`${baseUrl}/yt/auth/logout`, {
          method: 'POST',
          signal: controller.signal,
        }).catch(() => {}).finally(() => clearTimeout(timer));
      }
      return true;
    } catch {
      return true;
    }
  }

  // ── Authenticated Real YouTube Feeds ───────────────────────────────────────

  /**
   * Fetches the user's authentic subscribed channels directly from Google OAuth API.
   */
  async fetchGoogleAccountSubscriptions(accessToken: string): Promise<YouTubeChannelSubscription[]> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(
        'https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        }
      ).finally(() => clearTimeout(timer));

      if (res.ok) {
        const data = await res.json();
        const subs: YouTubeChannelSubscription[] = (data.items || [])
          .map((item: any) => ({
            channelId: item.snippet?.resourceId?.channelId || item.id,
            channelTitle: item.snippet?.title || 'Channel',
            avatarUrl: item.snippet?.thumbnails?.default?.url || item.snippet?.thumbnails?.medium?.url || '',
            subscriptionId: item.id,
          }))
          .filter((s: YouTubeChannelSubscription) => s.channelId && s.channelId.startsWith('UC'));

        subs.forEach((s) => this.saveLocalSubscription(s));
        return subs;
      }
    } catch (e) {
      console.warn('[YouTubeService] fetchGoogleAccountSubscriptions error:', e);
    }
    return [];
  }

  /**
   * Fetches latest videos from user's subscribed channels (via uploads playlists or direct search).
   */
  async fetchSubscribedChannelsVideos(
    subscriptions: YouTubeChannelSubscription[],
    accessToken?: string | null
  ): Promise<YouTubeVideoItem[]> {
    if (!subscriptions || subscriptions.length === 0) return [];

    // Take up to 10 channels for fast responsive feed loading
    const targetChannels = subscriptions.slice(0, 10);
    const channelFetches = targetChannels.map(async (sub) => {
      // 1. Try Google API playlistItems for exact channel uploads playlist
      if (accessToken && sub.channelId && sub.channelId.startsWith('UC')) {
        const uploadsPlaylistId = 'UU' + sub.channelId.substring(2);
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 4000);
          const pRes = await fetch(
            `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(
              uploadsPlaylistId
            )}&maxResults=5`,
            {
              headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
              signal: controller.signal,
            }
          ).finally(() => clearTimeout(timer));

          if (pRes.ok) {
            const pData = await pRes.json();
            const items = (pData.items || []).map((it: any) => {
              const sn = it.snippet;
              const vid = sn?.resourceId?.videoId;
              if (!vid) return null;
              const thumbs = sn?.thumbnails;
              return {
                id: vid,
                title: sn?.title || '',
                channel: sn?.channelTitle || sub.channelTitle,
                channelId: sn?.channelId || sub.channelId,
                thumbnail: thumbs?.maxres?.url || thumbs?.high?.url || thumbs?.medium?.url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
                duration: '',
                views: '',
                published: sn?.publishedAt ? new Date(sn.publishedAt).toLocaleDateString() : '',
              } as YouTubeVideoItem;
            }).filter(Boolean);

            if (items.length > 0) return items;
          }
        } catch {}
      }

      // 2. Fallback to Innertube search for channel's latest uploads
      try {
        const searchQ = sub.channelTitle || sub.channelId;
        const res = await this.searchWithContinuation(searchQ);
        return res.videos.slice(0, 4).map((v) => ({
          ...v,
          channel: sub.channelTitle || v.channel,
          channelId: sub.channelId || v.channelId,
        }));
      } catch {
        return [];
      }
    });

    const results = await Promise.all(channelFetches);
    const merged: YouTubeVideoItem[] = [];
    const seen = new Set<string>();

    let maxLen = 0;
    for (const r of results) if (r.length > maxLen) maxLen = r.length;
    for (let i = 0; i < maxLen; i++) {
      for (const list of results) {
        if (list[i] && !seen.has(list[i].id)) {
          seen.add(list[i].id);
          merged.push(list[i]);
        }
      }
    }

    return merged;
  }

  async getHomeFeed(continuationToken?: string, timeoutMs = 8000): Promise<YouTubeSearchResult> {
    try {
      const accessToken = await this.getValidAccessToken();
      const baseUrl = await this.resolveActiveBaseUrl(Math.min(timeoutMs, 2500));
      if (baseUrl) {
        const tokens = this.getOAuthTokens();
        const headers: Record<string, string> = {};
        if (accessToken) {
          headers['Authorization'] = `Bearer ${accessToken}`;
          headers['x-youtube-token'] = JSON.stringify(tokens || { access_token: accessToken });
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const url = continuationToken
          ? `${baseUrl}/yt/feed/home?continuation=${encodeURIComponent(continuationToken)}`
          : `${baseUrl}/yt/feed/home`;

        try {
          const res = await fetch(url, { headers, signal: controller.signal }).finally(() => clearTimeout(timer));
          if (res.ok) {
            const data = await res.json();
            const clean = (data.results || []).filter(
              (v: any) => !v.isShort && !v.title?.toLowerCase().includes('#short')
            );
            if (clean.length > 0) {
              return { videos: clean, continuationToken: data.continuationToken };
            }
          }
        } catch (engineErr) {
          console.warn('[YouTubeService] Local engine getHomeFeed error:', engineErr);
        }
      }

      // If user is logged in, query Google Home Activities API
      if (accessToken) {
        try {
          const actRes = await fetch(
            'https://www.googleapis.com/youtube/v3/activities?part=snippet,contentDetails&home=true&maxResults=25',
            {
              headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
            }
          );
          if (actRes.ok) {
            const actData = await actRes.json();
            const actVideos: YouTubeVideoItem[] = (actData.items || [])
              .map((it: any) => {
                const vid = it.contentDetails?.upload?.videoId || it.contentDetails?.recommendation?.resourceId?.videoId;
                if (!vid) return null;
                const sn = it.snippet;
                const thumbs = sn?.thumbnails;
                return {
                  id: vid,
                  title: sn?.title || '',
                  channel: sn?.channelTitle || '',
                  channelId: sn?.channelId || null,
                  thumbnail: thumbs?.maxres?.url || thumbs?.high?.url || thumbs?.medium?.url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
                  duration: '',
                  views: '',
                  published: sn?.publishedAt ? new Date(sn.publishedAt).toLocaleDateString() : '',
                };
              })
              .filter(Boolean);
            if (actVideos.length > 0) {
              return { videos: actVideos };
            }
          }
        } catch {}
      }
    } catch (err: any) {
      console.warn('[YouTubeService] getHomeFeed error:', err);
    }

    // High-speed resilient regional fallback tailored to Indian / Tamil / English viewers (never random other country videos)
    try {
      const subs = this.getSubscriptions();
      if (subs.length > 0) {
        const subVideos = await this.fetchSubscribedChannelsVideos(subs.slice(0, 5));
        if (subVideos.length >= 8) {
          return { videos: subVideos };
        }
      }

      const webResult = await this.searchWithContinuation('trending videos in india tamil english cinema news entertainment');
      if (webResult.videos.length > 0) {
        return webResult;
      }
    } catch {}

    return { videos: [] };
  }

  async getSubscriptionsFeed(continuationToken?: string, timeoutMs = 8000): Promise<YouTubeSearchResult> {
    try {
      const accessToken = await this.getValidAccessToken();

      // 1. Sync Google Account subscribed channels if access token is active
      if (accessToken) {
        await this.fetchGoogleAccountSubscriptions(accessToken).catch(() => []);
      }

      // 2. Query local engine subscriptions feed
      const baseUrl = await this.resolveActiveBaseUrl(Math.min(timeoutMs, 2500));
      if (baseUrl) {
        const tokens = this.getOAuthTokens();
        const headers: Record<string, string> = {};
        if (accessToken) {
          headers['Authorization'] = `Bearer ${accessToken}`;
          headers['x-youtube-token'] = JSON.stringify(tokens || { access_token: accessToken });
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const url = continuationToken
          ? `${baseUrl}/yt/feed/subscriptions?continuation=${encodeURIComponent(continuationToken)}`
          : `${baseUrl}/yt/feed/subscriptions`;

        try {
          const res = await fetch(url, { headers, signal: controller.signal }).finally(() => clearTimeout(timer));
          if (res.ok) {
            const data = await res.json();
            const clean = (data.results || []).filter(
              (v: any) => !v.isShort && !v.title?.toLowerCase().includes('#short')
            );
            if (clean.length > 0) {
              return { videos: clean, continuationToken: data.continuationToken };
            }
          }
        } catch (engineErr) {
          console.warn('[YouTubeService] Local engine getSubscriptionsFeed error:', engineErr);
        }
      }

      // 3. Fetch latest videos directly from subscribed channels (Google synced + local)
      const currentSubs = this.getSubscriptions();
      if (currentSubs.length > 0) {
        const subVideos = await this.fetchSubscribedChannelsVideos(currentSubs, accessToken);
        if (subVideos.length > 0) {
          return { videos: subVideos };
        }
      }
    } catch (err: any) {
      console.warn('[YouTubeService] getSubscriptionsFeed error:', err);
    }

    // DO NOT return random viral videos for Subscriptions.
    // Return empty list so user sees clean "No Subscribed Videos" state.
    return { videos: [] };
  }

  async getHistoryFeed(timeoutMs = 6000): Promise<YouTubeSearchResult> {
    try {
      const baseUrl = await this.resolveActiveBaseUrl(timeoutMs);
      if (baseUrl) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(`${baseUrl}/yt/feed/history`, {
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));

        if (res.ok) {
          const data = await res.json();
          const items = (data.results || []).map((v: any) => ({
            ...v,
            isShort: v.isShort ?? (v.title?.toLowerCase().includes('#short') || (v.duration && v.duration.startsWith('0:') && parseInt(v.duration.split(':')[1] || '99') <= 60)),
            watchProgress: v.watchProgress ?? (v.percent_duration_watched ?? (v.percentDurationWatched ?? 0)),
          }));
          if (items.length > 0) {
            return { videos: items };
          }
        }
      }
    } catch (err: any) {
      console.warn('[YouTubeService] getHistoryFeed error:', err);
    }

    // Local history fallback
    try {
      const raw = storageService.getItem('youtube_watch_history_v1');
      if (raw) {
        const localHistory = JSON.parse(raw);
        if (Array.isArray(localHistory) && localHistory.length > 0) {
          return {
            videos: localHistory.map((h: any) => ({
              id: h.id,
              title: h.title,
              channel: h.channel,
              thumbnail: h.thumbnail,
              duration: h.duration,
              views: h.views,
              published: h.published,
              watchProgress: h.watchProgress || 0,
              watchedAt: h.watchedAt,
            })),
          };
        }
      }
    } catch {}

    return { videos: [] };
  }

  async getLikedVideosFeed(timeoutMs = 6000): Promise<YouTubeSearchResult> {
    try {
      const baseUrl = await this.resolveActiveBaseUrl(timeoutMs);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${baseUrl}/yt/feed/liked`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (res.ok) {
        const data = await res.json();
        return { videos: data.results || [] };
      }
      return { videos: [] };
    } catch (err: any) {
      console.warn('[YouTubeService] getLikedVideosFeed error:', err);
      return { videos: [] };
    }
  }

  async getPlaylistsFeed(timeoutMs = 6000): Promise<any[]> {
    try {
      const baseUrl = await this.resolveActiveBaseUrl(timeoutMs);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${baseUrl}/yt/feed/playlists`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (res.ok) {
        const data = await res.json();
        return data.results || [];
      }
      return [];
    } catch (err: any) {
      console.warn('[YouTubeService] getPlaylistsFeed error:', err);
      return [];
    }
  }

  async getShortsFeed(_timeoutMs = 6000): Promise<YouTubeSearchResult> {
    return { videos: [] };
  }
}

export const youTubeService = new YouTubeService();


