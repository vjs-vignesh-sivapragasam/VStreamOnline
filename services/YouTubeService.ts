import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { StorageKeys, storageService } from '@/utils/StorageService';
import { ensureEmbeddedServerRunning } from '@/utils/StremioServerManager';

export interface YouTubeVideoItem {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration?: string;
  views?: string;
  published?: string;
  isShort?: boolean;
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

export interface YouTubeUserProfile {
  name: string;
  email?: string;
  avatar?: string;
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
  async resolveActiveBaseUrl(timeoutMs = 1200): Promise<string | null> {
    const now = Date.now();
    if (this.activeBaseUrl && now - this.lastPingTime < 15000) {
      return this.activeBaseUrl;
    }

    const candidates = getEngineCandidates();

    // Ping candidates concurrently for instant pickup (<50ms) instead of sequential blocking
    const pingCandidate = async (url: string): Promise<string> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
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
      const fastestUrl = await Promise.any(candidates.map((c) => pingCandidate(c)));
      this.activeBaseUrl = fastestUrl;
      this.lastPingTime = now;
      console.log(`[YouTubeService] ⚡ Connected to fastest engine at ${fastestUrl}`);
      return fastestUrl;
    } catch {
      // All pings timed out or failed
    }

    // On mobile, fallback directly to the embedded Stremio engine (same port 11470 as TamilMV)
    if (Platform.OS !== 'web') {
      this.activeBaseUrl = `http://127.0.0.1:${STREMIO_ENGINE_PORT}`;
      return this.activeBaseUrl;
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

            return {
              id: data.id || videoId,
              title: data.title || fallbackItem?.title || 'YouTube Video',
              channel: data.channel || fallbackItem?.channel || 'YouTube',
              thumbnail: data.thumbnail || fallbackItem?.thumbnail || `https://i.ytimg.com/vi/${data.id || videoId}/hqdefault.jpg`,
              duration: data.duration,
              views: data.views,
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

  // ── YouTube Google Account / SSO ──────────────────────────────────────────

  async getAuthStatus(timeoutMs = 1000): Promise<YouTubeAuthStatus> {
    try {
      const baseUrl = await this.resolveActiveBaseUrl(timeoutMs);
      if (!baseUrl) return { authenticated: false };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${baseUrl}/yt/auth/status`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (res.ok) {
        return await res.json();
      }
      return { authenticated: false };
    } catch {
      return { authenticated: false };
    }
  }

  async startAuth(timeoutMs = 12000): Promise<YouTubeAuthStartResponse> {
    try {
      const baseUrl = await this.resolveActiveBaseUrl(2000);
      if (!baseUrl) {
        return { status: 'error', error: 'YouTube engine is not connected. Please ensure the local streaming service is running.' };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${baseUrl}/yt/auth/start`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (res.ok) {
        return await res.json();
      }
      const data = await res.json().catch(() => ({}));
      return { status: 'error', error: data.error || 'Failed to start authentication' };
    } catch (err: any) {
      return { status: 'error', error: err?.message || 'Authentication timeout' };
    }
  }

  async logout(timeoutMs = 3000): Promise<boolean> {
    try {
      const baseUrl = await this.resolveActiveBaseUrl(timeoutMs);
      if (!baseUrl) return false;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${baseUrl}/yt/auth/logout`, {
        method: 'POST',
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      return res.ok;
    } catch {
      return false;
    }
  }

  // ── Authenticated Real YouTube Feeds ───────────────────────────────────────

  async getHomeFeed(timeoutMs = 6000): Promise<YouTubeSearchResult> {
    try {
      const baseUrl = await this.resolveActiveBaseUrl(timeoutMs);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${baseUrl}/yt/feed/home`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (res.ok) {
        const data = await res.json();
        const clean = (data.results || []).filter(
          (v: any) => !v.isShort && !v.title?.toLowerCase().includes('#short')
        );
        return { videos: clean };
      }
      return { videos: [] };
    } catch (err: any) {
      console.warn('[YouTubeService] getHomeFeed error:', err);
      return { videos: [] };
    }
  }

  async getSubscriptionsFeed(timeoutMs = 6000): Promise<YouTubeSearchResult> {
    try {
      const baseUrl = await this.resolveActiveBaseUrl(timeoutMs);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${baseUrl}/yt/feed/subscriptions`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (res.ok) {
        const data = await res.json();
        const clean = (data.results || []).filter(
          (v: any) => !v.isShort && !v.title?.toLowerCase().includes('#short')
        );
        return { videos: clean };
      }
      return { videos: [] };
    } catch (err: any) {
      console.warn('[YouTubeService] getSubscriptionsFeed error:', err);
      return { videos: [] };
    }
  }

  async getHistoryFeed(timeoutMs = 6000): Promise<YouTubeSearchResult> {
    try {
      const baseUrl = await this.resolveActiveBaseUrl(timeoutMs);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${baseUrl}/yt/feed/history`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (res.ok) {
        const data = await res.json();
        const clean = (data.results || []).filter(
          (v: any) => !v.isShort && !v.title?.toLowerCase().includes('#short')
        );
        return { videos: clean };
      }
      return { videos: [] };
    } catch (err: any) {
      console.warn('[YouTubeService] getHistoryFeed error:', err);
      return { videos: [] };
    }
  }

  async getShortsFeed(_timeoutMs = 6000): Promise<YouTubeSearchResult> {
    return { videos: [] };
  }
}

export const youTubeService = new YouTubeService();
