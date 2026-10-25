import { MagnetParser } from '@/utils/MagnetParser';
import { StorageKeys, storageService } from '@/utils/StorageService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useCallback } from 'react';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ─── Base URL & Constants ─────────────────────────────────────────────────────

export const DEFAULT_TAMILMV_BASE_URL = 'https://www.1tamilmv.solar';

export const KNOWN_TAMILMV_MIRRORS = [
  'https://www.1tamilmv.style',
  'https://www.1tamilmv.solar',
  'https://www.1tamilmv.cards',
  'https://www.1tamilmv.pizza',
  'https://www.1tamilmv.fi',
  'https://www.1tamilmv.live',
  'https://www.1tamilmv.pm',
  'https://www.1tamilmv.yt',
  'https://www.1tamilmv.mx',
  'https://www.1tamilmv.tf',
  'https://www.1tamilmv.com',
];

type BaseUrlListener = (newUrl: string) => void;
const baseUrlListeners = new Set<BaseUrlListener>();

export function subscribeTamilMVBaseUrl(listener: BaseUrlListener): () => void {
  baseUrlListeners.add(listener);
  return () => {
    baseUrlListeners.delete(listener);
  };
}

function notifyBaseUrlChanged(newUrl: string): void {
  baseUrlListeners.forEach(listener => {
    try {
      listener(newUrl);
    } catch (err) {
      console.error('Error in base URL listener:', err);
    }
  });
}

// In-memory cache for fast synchronous access
let cachedTamilMVBaseUrl: string = DEFAULT_TAMILMV_BASE_URL;

// 1. Initial attempt from synchronous storage (if available)
try {
  const customUrl = storageService.getItem(StorageKeys.TAMILMV_BASE_URL_KEY);
  if (customUrl && customUrl.trim() && customUrl.trim() !== 'https://www.1tamilmv.com') {
    cachedTamilMVBaseUrl = customUrl.trim().replace(/\/+$/, '');
  } else {
    cachedTamilMVBaseUrl = DEFAULT_TAMILMV_BASE_URL;
  }
} catch (e) {
  console.warn('Failed to read TamilMV base URL from storageService', e);
}

// 2. Hydrate from AsyncStorage immediately so domain persists across app reloads/restarts
AsyncStorage.getItem(StorageKeys.TAMILMV_BASE_URL_KEY)
  .then(storedUrl => {
    if (storedUrl && storedUrl.trim() && storedUrl.trim() !== 'https://www.1tamilmv.com') {
      const sanitized = storedUrl.trim().replace(/\/+$/, '');
      if (sanitized !== cachedTamilMVBaseUrl) {
        cachedTamilMVBaseUrl = sanitized;
        try {
          storageService.setItem(StorageKeys.TAMILMV_BASE_URL_KEY, sanitized);
        } catch {}
        notifyBaseUrlChanged(sanitized);
      }
    } else {
      cachedTamilMVBaseUrl = DEFAULT_TAMILMV_BASE_URL;
      try {
        storageService.setItem(StorageKeys.TAMILMV_BASE_URL_KEY, DEFAULT_TAMILMV_BASE_URL);
      } catch {}
      AsyncStorage.setItem(StorageKeys.TAMILMV_BASE_URL_KEY, DEFAULT_TAMILMV_BASE_URL).catch(() => {});
      notifyBaseUrlChanged(DEFAULT_TAMILMV_BASE_URL);
    }
  })
  .catch(err => {
    console.warn('[useTamilMv] Failed to load TamilMV domain from AsyncStorage:', err);
  });

export function getTamilMVBaseUrl(): string {
  if (cachedTamilMVBaseUrl && cachedTamilMVBaseUrl !== DEFAULT_TAMILMV_BASE_URL) {
    return cachedTamilMVBaseUrl;
  }
  try {
    const customUrl = storageService.getItem(StorageKeys.TAMILMV_BASE_URL_KEY);
    if (customUrl && customUrl.trim()) {
      cachedTamilMVBaseUrl = customUrl.trim().replace(/\/+$/, '');
      return cachedTamilMVBaseUrl;
    }
  } catch (e) {
    console.warn('Failed to read TamilMV base URL from storage', e);
  }
  return cachedTamilMVBaseUrl || DEFAULT_TAMILMV_BASE_URL;
}

export async function getTamilMVBaseUrlAsync(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(StorageKeys.TAMILMV_BASE_URL_KEY);
    if (stored && stored.trim()) {
      const sanitized = stored.trim().replace(/\/+$/, '');
      cachedTamilMVBaseUrl = sanitized;
      return sanitized;
    }
  } catch (e) {
    console.warn('[useTamilMv] Failed to read TamilMV base URL from AsyncStorage', e);
  }
  return getTamilMVBaseUrl();
}

export async function setTamilMVBaseUrl(url: string): Promise<void> {
  const sanitized = url.trim().replace(/\/+$/, '');
  cachedTamilMVBaseUrl = sanitized;

  try {
    storageService.setItem(StorageKeys.TAMILMV_BASE_URL_KEY, sanitized);
  } catch (e) {
    console.warn('Failed to save TamilMV base URL to storageService', e);
  }

  try {
    await AsyncStorage.setItem(StorageKeys.TAMILMV_BASE_URL_KEY, sanitized);
  } catch (e) {
    console.warn('Failed to save TamilMV base URL to AsyncStorage', e);
  }

  clearAllRssCache();
  notifyBaseUrlChanged(sanitized);
}

export async function resetTamilMVBaseUrl(): Promise<void> {
  cachedTamilMVBaseUrl = DEFAULT_TAMILMV_BASE_URL;
  try {
    storageService.removeItem(StorageKeys.TAMILMV_BASE_URL_KEY);
  } catch { }
  try {
    await AsyncStorage.removeItem(StorageKeys.TAMILMV_BASE_URL_KEY);
  } catch { }
  clearAllRssCache();
  notifyBaseUrlChanged(DEFAULT_TAMILMV_BASE_URL);
}

export function clearAllRssCache(): void {
  (Object.keys(FORUM_IDS) as Language[]).forEach(lang => {
    (Object.keys(FORUM_IDS[lang] || {}) as Category[]).forEach(cat => {
      deleteCache(getCacheKey(lang, cat));
    });
  });
}

export function useTamilMVBaseUrl(): string {
  const [url, setUrl] = useState<string>(() => getTamilMVBaseUrl());
  useEffect(() => {
    getTamilMVBaseUrlAsync().then(u => {
      if (u) setUrl(u);
    });
    return subscribeTamilMVBaseUrl(newUrl => setUrl(newUrl));
  }, []);
  return url;
}

// ─── Ping & Health Check ──────────────────────────────────────────────────────

export interface PingResult {
  success: boolean;
  latencyMs: number;
  httpStatus?: number;
  rssWorking: boolean;
  message: string;
  error?: string;
}

export async function pingTamilMV(targetUrl?: string): Promise<PingResult> {
  const baseUrl = (targetUrl || getTamilMVBaseUrl()).trim().replace(/\/+$/, '');

  if (!baseUrl) {
    return {
      success: false,
      latencyMs: 0,
      rssWorking: false,
      message: 'Base URL cannot be empty',
    };
  }

  try {
    const parsed = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return {
        success: false,
        latencyMs: 0,
        rssWorking: false,
        message: 'URL must start with http:// or https://',
      };
    }
  } catch {
    return {
      success: false,
      latencyMs: 0,
      rssWorking: false,
      message: 'Invalid URL format',
    };
  }

  const startTime = Date.now();
  const testFeedUrl = `${baseUrl}/index.php?/forums/forum/11-web-hd-itunes-hd-bluray/all.xml`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(testFeedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (response.ok) {
      const text = await response.text();
      const hasRss = text.includes('<rss') || text.includes('<channel') || text.includes('<feed');
      if (hasRss) {
        return {
          success: true,
          latencyMs,
          httpStatus: response.status,
          rssWorking: true,
          message: `Connected (${latencyMs}ms) • RSS feed verified`,
        };
      } else {
        return {
          success: true,
          latencyMs,
          httpStatus: response.status,
          rssWorking: false,
          message: `Domain reachable (${latencyMs}ms), but RSS content is invalid (possibly parked domain)`,
        };
      }
    }

    if (response.status === 403 || response.status === 503) {
      return {
        success: false,
        latencyMs,
        httpStatus: response.status,
        rssWorking: false,
        message: `HTTP ${response.status} • Cloudflare / bot protection active`,
      };
    }

    return await pingFallbackRoot(baseUrl, latencyMs, response.status);
  } catch (err: any) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    return await pingFallbackRoot(baseUrl, latencyMs, undefined, err);
  }
}

async function pingFallbackRoot(baseUrl: string, elapsedMs: number, feedStatus?: number, originalError?: any): Promise<PingResult> {
  const rootStart = Date.now();
  const rootController = new AbortController();
  const rootTimeout = setTimeout(() => rootController.abort(), 4000);

  try {
    const rootRes = await fetch(baseUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: rootController.signal,
    });
    clearTimeout(rootTimeout);
    const totalLatency = elapsedMs + (Date.now() - rootStart);

    if (rootRes.ok || (rootRes.status >= 200 && rootRes.status < 400)) {
      return {
        success: true,
        latencyMs: totalLatency,
        httpStatus: rootRes.status,
        rssWorking: false,
        message: `Base domain reachable (${totalLatency}ms), but RSS endpoint returned ${feedStatus ?? 'error'}`,
      };
    }

    return {
      success: false,
      latencyMs: totalLatency,
      httpStatus: rootRes.status,
      rssWorking: false,
      message: `HTTP error ${rootRes.status} from base domain`,
    };
  } catch (rootErr: any) {
    clearTimeout(rootTimeout);
    const totalLatency = elapsedMs + (Date.now() - rootStart);
    const errObj = originalError || rootErr;
    const isTimeout =
      errObj?.name === 'AbortError' ||
      errObj?.message?.toLowerCase().includes('timeout') ||
      errObj?.message?.toLowerCase().includes('aborted');

    return {
      success: false,
      latencyMs: totalLatency,
      rssWorking: false,
      message: isTimeout ? `Connection timed out (${totalLatency}ms)` : `Unreachable (${errObj?.message || 'Network error'})`,
      error: errObj?.message,
    };
  }
}

let isAutoDiscovering = false;

/**
 * Searches Google, Bing, DuckDuckGo in the background to harvest live TamilMV domains.
 */
export async function searchGoogleForTamilMVDomains(): Promise<string[]> {
  const found = new Set<string>();

  const searchUrls = [
    'https://www.google.com/search?q=TamilMV&hl=en',
    'https://www.google.com/search?q=1TamilMV+official+proxy&hl=en',
    'https://www.bing.com/search?q=1TamilMV+proxy+domain&setlang=en',
    'https://html.duckduckgo.com/html/?q=1TamilMV',
  ];

  await Promise.allSettled(
    searchUrls.map(async (url) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);
        const res = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const html = await res.text();

        // 1. Extract from redirect params (e.g. google url?q= or duckduckgo uddg=)
        const paramMatches = html.match(/(?:url\?q=|uddg=)(https?%3A%2F%2F[^&"'\s<>]+)/gi) || [];
        for (const m of paramMatches) {
          try {
            const raw = m.replace(/^(?:url\?q=|uddg=)/i, '');
            const decoded = decodeURIComponent(raw);
            const u = new URL(decoded);
            if (/tamilmv/i.test(u.hostname)) {
              let host = u.hostname.toLowerCase();
              if (!host.startsWith('www.') && !host.startsWith('1tamilmv.')) {
                host = `www.${host}`;
              }
              found.add(`https://${host}`);
            }
          } catch {}
        }

        // 2. Direct domains in href or text
        const domainMatches = html.match(/https?:\/\/(?:www\.)?(?:[a-zA-Z0-9-]+\.)?1?tamilmv\.[a-z]{2,10}/gi) || [];
        for (const m of domainMatches) {
          try {
            const u = new URL(m);
            let host = u.hostname.toLowerCase();
            if (!host.startsWith('www.') && !host.startsWith('1tamilmv.')) {
              host = `www.${host}`;
            }
            found.add(`https://${host}`);
          } catch {}
        }

        // 3. Naked domains mentioned in text
        const nakedMatches = html.match(/\b(?:www\.)?1?tamilmv\.[a-z]{2,10}\b/gi) || [];
        for (const m of nakedMatches) {
          const lower = m.toLowerCase();
          const host = lower.startsWith('www.') ? lower : `www.${lower}`;
          found.add(`https://${host}`);
        }
      } catch {
        // Silently continue to next search engine
      }
    })
  );

  return Array.from(found);
}

/**
 * Probes official proxy redirectors to capture dynamic 301/302 redirects to current domain.
 */
export async function probeRedirectTargets(): Promise<string[]> {
  const probes = [
    'https://www.1tamilmv.solar',
    'https://www.1tamilmv.cards',
    'https://www.1tamilmv.pizza',
    'https://www.1tamilmv.fi',
    'https://www.1tamilmv.live',
    'https://www.1tamilmv.art',
    'https://www.1tamilmv.cloud',
    'https://www.1tamilmv.me',
  ];

  const targets = new Set<string>();
  await Promise.allSettled(
    probes.map(async (url) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Connection': 'close',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.url) {
          try {
            const parsed = new URL(res.url);
            if (/tamilmv/i.test(parsed.hostname)) {
              let host = parsed.hostname.toLowerCase();
              if (!host.startsWith('www.') && !host.startsWith('1tamilmv.')) {
                host = `www.${host}`;
              }
              targets.add(`https://${host}`);
            }
          } catch {}
        }
      } catch {}
    })
  );

  return Array.from(targets);
}

/**
 * Verifies that a domain is live, reachable, and contains real TamilMV forum/RSS content (not parked).
 */
export async function verifyTamilMVDomain(domainUrl: string): Promise<boolean> {
  const normalized = domainUrl.trim().replace(/\/+$/, '');

  // 1. Quick ping check
  try {
    const ping = await pingTamilMV(normalized);
    if (ping.success && ping.rssWorking) {
      return true;
    }
  } catch {}

  // 2. Direct forum page probe
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const testUrl = `${normalized}/index.php?/discover/`;

    const res = await fetch(testUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Connection': 'close',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const html = await res.text();
      const isRealTamilMV =
        (html.includes('TamilMV') || html.includes('1TamilMV')) &&
        (html.includes('ipsLayout') || html.includes('forum') || html.includes('topic'));
      const isParked =
        html.includes('/lander') ||
        html.includes('domain is for sale') ||
        html.includes('GoDaddy') ||
        html.includes('parking');

      if (isRealTamilMV && !isParked) {
        return true;
      }
    }
  } catch {}

  return false;
}

/**
 * Searches Google in the background, checks dynamic redirect targets, verifies availability,
 * and automatically updates & persists the base URL configuration.
 */
export async function autoDetectTamilMVDomain(
  onProgress?: (status: string) => void
): Promise<string | null> {
  onProgress?.('Searching Google & online sources for TamilMV domain...');

  // Step 1: Search online via Google, Bing, DuckDuckGo
  const googleCandidates = await searchGoogleForTamilMVDomains();

  onProgress?.('Checking dynamic mirror resolvers...');
  // Step 2: Probe dynamic redirect resolvers
  const redirectCandidates = await probeRedirectTargets();

  // Step 3: Combine discovered candidates + known mirrors (prioritizing detected candidates)
  const candidatePool = Array.from(
    new Set([
      ...googleCandidates,
      ...redirectCandidates,
      ...KNOWN_TAMILMV_MIRRORS,
      'https://www.1tamilmv.solar',
      'https://www.1tamilmv.fi',
      'https://www.1tamilmv.cards',
      'https://www.1tamilmv.pizza',
      'https://www.1tamilmv.live',
      'https://www.1tamilmv.pm',
      'https://www.1tamilmv.yt',
      'https://www.1tamilmv.mx',
    ])
  );

  onProgress?.(`Verifying ${candidatePool.length} domain candidates...`);

  // Step 4: Verify candidates sequentially
  for (const candidate of candidatePool) {
    onProgress?.(`Verifying domain: ${candidate}...`);
    const isValid = await verifyTamilMVDomain(candidate);
    if (isValid) {
      onProgress?.(`Configuring base URL with: ${candidate}`);
      console.log(`[TamilMV] Auto-detected active working domain: ${candidate}. Updating configuration.`);
      await setTamilMVBaseUrl(candidate);
      return candidate;
    }
  }

  return null;
}

/**
 * Automatically discovers a working domain and updates the base URL configuration.
 * Called automatically when base URL requests fail or during background checks.
 */
export async function autoDiscoverWorkingDomain(): Promise<string | null> {
  if (isAutoDiscovering) return null;
  isAutoDiscovering = true;
  try {
    return await autoDetectTamilMVDomain();
  } catch (e) {
    console.warn('[TamilMV] Error during domain auto-discovery:', e);
    return null;
  } finally {
    isAutoDiscovering = false;
  }
}

export type Language = 'tamil' | 'english' | 'hindi' | 'telugu' | 'malayalam' | 'kannada';
export type Category = 'predvd' | 'webhd' | 'hdrip' | 'hdtv' | 'series' | 'multiaudio';

const FORUM_IDS: Record<Language, Partial<Record<Category, string>>> = {
  tamil: {
    predvd: '10-predvd-dvdscr-cam-tc',
    webhd: '11-web-hd-itunes-hd-bluray',
    multiaudio: '17-hollywood-movies-in-multi-audios',
    series: '19-web-series-tv-shows',
    hdrip: '12-hd-rips-dvd-rips-br-rips',
    hdtv: '14-hdtv-sdtv-hdtv-rips',
  },
  english: {
    predvd: '46-predvd-dvdscr-cam-tc',
    webhd: '49-web-hd-itunes-hd-bluray',
    hdrip: '50-hd-rips-dvd-rips-br-rips',
  },
  hindi: {
    predvd: '57-predvd-dvdscr-cam-tc',
    webhd: '58-web-hd-itunes-hd-bluray',
    hdrip: '59-hd-rips-dvd-rips-br-rips',
  },
  telugu: {
    predvd: '23-predvd-dvdscr-cam-tc',
    webhd: '24-web-hd-itunes-hd-bluray',
    hdrip: '25-hd-rips-dvd-rips-br-rips',
  },
  malayalam: {
    predvd: '35-predvd-dvdscr-cam-tc',
    webhd: '36-web-hd-itunes-hd-bluray',
    hdrip: '37-hd-rips-dvd-rips-br-rips',
  },
  kannada: {
    predvd: '68-predvd-dvdscr-cam-tc',
    webhd: '69-web-hd-itunes-hd-bluray',
    hdrip: '70-hd-rips-dvd-rips-br-rips',
  },
};

const CATEGORY_LABELS: Record<Category, string> = {
  predvd: 'HQ PreDVD (HQ Clean)',
  webhd: 'Web HD',
  multiaudio: 'Hollywood Movies in Multi Audios',
  series: 'Web Series & TV Shows',
  hdrip: 'HD Rip',
  hdtv: 'HD TV',
};

const CATEGORY_TYPE: Record<Category, 'movie' | 'series'> = {
  predvd: 'movie',
  webhd: 'movie',
  hdrip: 'movie',
  hdtv: 'movie',
  multiaudio: 'movie',
  series: 'series',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TorrentItem {
  name: string | null;
  year: string | null;
  language: string;
  groupid: string;
  guid: string;
  poster: string | null;
  title: string;
  magnetUrl: string;
  infoHash: string;
  publishDate: string;
}

export interface GroupedItem {
  name: string | null;
  year: string | null;
  items: TorrentItem[];
}

export interface CatalogSection {
  category: Category;
  label: string;
  type: 'movie' | 'series';
  groups: GroupedItem[];
}

interface CacheEntry {
  data: GroupedItem[];
  timestamp: number;
}

// ─── XML Parsing ──────────────────────────────────────────────────────────────

function getTagContent(xml: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

function extractCDATA(content: string): string {
  const m = content.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1] : content;
}

function decodeHtml(html: string): string {
  if (!html) return html;
  const entities: Record<string, string> = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
    '&#x2F;': '/', '&#x3D;': '=', '&#39;': "'",
  };
  let decoded = html;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }
  decoded = decoded.replace(/&#(\d+);/g, (_m, dec: string) => String.fromCharCode(parseInt(dec, 10)));
  decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return decoded;
}

function extractPoster(description: string): string | null {
  const m = description.match(/<img [^>]*src="([^"]+)"/i);
  return m ? decodeHtml(m[1]) : null;
}

const INVALID_RELEASE_REGEX = /\s(cam|unknown|telesync|dvdsrc|dvdscr|predvdrip|prehd|pre-hdrip|hdts|hdtv|camrip)\s/i;
const LOW_QUALITY_REGEX = /(480p|720p|360p|240p)/i;
const TITLE_YEAR_REGEX = /^([^(]+)\s*\((\d{4})\)/;

function isValidQuality(displayName: string, category: Category): boolean {
  if (category === 'predvd') {
    // In PreDVD category: allow PreDVD, HQ Clean, 1080p, 720p, etc. Filter out blurry CAM / telesync / hdts
    const INVALID = /\s(cam|unknown|telesync|hdts|camrip)\s/i;
    const LOW_RES = /(360p|240p)/i;
    return !INVALID.test(displayName) && !LOW_RES.test(displayName);
  }
  return !INVALID_RELEASE_REGEX.test(displayName) && !LOW_QUALITY_REGEX.test(displayName);
}

function extractTitleYear(title: string): { name: string | null; year: string | null } {
  // Strip domain prefix e.g. "www.1TamilMV.solar - " or "1TamilMV.capital - "
  const cleaned = title
    .replace(/^(?:https?:\/\/)?(?:www\.)?[^\s-]+\.[a-z]{2,10}\s*[-_:]\s*/i, '')
    .replace(/^www\.[^-]+-\s*/i, '');
  const match = cleaned.match(TITLE_YEAR_REGEX);
  if (match) {
    return { name: match[1].trim(), year: match[2] };
  }
  const fallbackCleaned = title.replace(/^[^-]+-\s*/, '');
  const fallbackMatch = fallbackCleaned.match(TITLE_YEAR_REGEX);
  return fallbackMatch ? { name: fallbackMatch[1].trim(), year: fallbackMatch[2] } : { name: null, year: null };
}

function parseRSSFeed(xmlString: string, language: Language, category: Category): GroupedItem[] {
  const itemMatches = [...xmlString.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  const grouped: Record<string, GroupedItem> = {};

  for (const match of itemMatches) {
    const itemContent = match[1];
    const description = extractCDATA(getTagContent(itemContent, 'description'));
    const pubDate = getTagContent(itemContent, 'pubDate');
    const guid = getTagContent(itemContent, 'guid');
    const poster = extractPoster(description);

    const magnetLinks = MagnetParser.extractMagnetLinks(description);
    if (magnetLinks.length === 0) continue;

    magnetLinks.forEach((magnetLink, i) => {
      const displayName = MagnetParser.extractDisplayName(magnetLink);
      if (!displayName || !isValidQuality(displayName, category)) return;

      const { name, year } = extractTitleYear(displayName);
      const key = `${name}|||${year}`;

      if (!grouped[key]) {
        grouped[key] = { name, year, items: [] };
      }

      let infoHash = '';
      try {
        const url = new URL(magnetLink);
        infoHash = url.searchParams.get('xt')?.replace('urn:btih:', '') ?? '';
      } catch { }

      grouped[key].items.push({
        name,
        year,
        language,
        groupid: guid,
        guid: `${guid}-magnet-${i}`,
        poster,
        title: displayName,
        magnetUrl: magnetLink,
        infoHash,
        publishDate: pubDate || new Date().toUTCString(),
      });
    });
  }

  return Object.values(grouped).sort((a, b) => {
    const aDate = a.items[0]?.publishDate ?? '';
    const bDate = b.items[0]?.publishDate ?? '';
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });
}

// ─── Fetch + Cache ────────────────────────────────────────────────────────────

function getRssUrl(language: Language, category: Category, customBaseUrl?: string): string | null {
  const forumId = FORUM_IDS[language]?.[category];
  if (!forumId) return null;
  const baseUrl = customBaseUrl || getTamilMVBaseUrl();
  return `${baseUrl}/index.php?/forums/forum/${forumId}/all.xml`;
}

function getCacheKey(language: Language, category: Category): string {
  return `rss:${language}:${category}`;
}

function readCache(key: string): GroupedItem[] | null {
  try {
    const raw = storageService.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: GroupedItem[]): void {
  try {
    const entry: CacheEntry = { data, timestamp: Date.now() };
    storageService.setItem(key, JSON.stringify(entry));
  } catch (e) {
    console.warn('Cache write failed', e);
  }
}

function deleteCache(key: string): void {
  try {
    storageService.removeItem(key);
  } catch { }
}

async function fetchAndParse(language: Language, category: Category): Promise<GroupedItem[]> {
  const cacheKey = getCacheKey(language, category);
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const url = getRssUrl(language, category);
  if (!url) return [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const xml = await response.text();
    const groups = parseRSSFeed(xml, language, category);
    writeCache(cacheKey, groups);
    return groups;
  } catch (error: any) {
    clearTimeout(timeoutId);

    // If the active domain fails (blocked by ISP / offline), auto-discover a working mirror from presets and persist to AsyncStorage
    const currentBase = getTamilMVBaseUrl();
    const workingMirror = await autoDiscoverWorkingDomain();
    if (workingMirror && workingMirror !== currentBase) {
      const retryUrl = getRssUrl(language, category, workingMirror);
      if (retryUrl) {
        const retryController = new AbortController();
        const retryTimeout = setTimeout(() => retryController.abort(), 15000);
        try {
          const retryRes = await fetch(retryUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/rss+xml, application/xml, text/xml, */*',
              'Cache-Control': 'no-cache',
            },
            signal: retryController.signal,
          });
          clearTimeout(retryTimeout);
          if (retryRes.ok) {
            const xml = await retryRes.text();
            const groups = parseRSSFeed(xml, language, category);
            writeCache(cacheKey, groups);
            return groups;
          }
        } catch {
          clearTimeout(retryTimeout);
        }
      }
    }

    throw error;
  }
}

// ─── Hook: single category ────────────────────────────────────────────────────

interface UseTamilMVResult {
  groups: GroupedItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useTamilMV(language: Language, category: Category): UseTamilMVResult {
  const [groups, setGroups] = useState<GroupedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    deleteCache(getCacheKey(language, category));
    setTick((t) => t + 1);
  }, [language, category]);

  useEffect(() => {
    return subscribeTamilMVBaseUrl(() => {
      setTick((t) => t + 1);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchAndParse(language, category)
      .then((data) => { if (!cancelled) setGroups(data); })
      .catch((e: any) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [language, category, tick]);

  return { groups, loading, error, refresh };
}

// ─── Hook: all categories for a language (home screen) ───────────────────────

interface UseTamilMVCatalogResult {
  sections: CatalogSection[];
  loading: boolean;
  errors: string[];
  refresh: () => void;
}

export function useTamilMVCatalog(language: Language): UseTamilMVCatalogResult {
  const availableCategories = Object.keys(FORUM_IDS[language]) as Category[];

  const [sections, setSections] = useState<CatalogSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    availableCategories.forEach((cat) => deleteCache(getCacheKey(language, cat)));
    setTick((t) => t + 1);
  }, [language]);

  useEffect(() => {
    return subscribeTamilMVBaseUrl(() => {
      setTick((t) => t + 1);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrors([]);
    setSections([]);

    const results: CatalogSection[] = [];
    const errs: string[] = [];

    Promise.all(
      availableCategories.map(async (category) => {
        try {
          const groups = await fetchAndParse(language, category);
          results.push({
            category,
            label: CATEGORY_LABELS[category],
            type: CATEGORY_TYPE[category],
            groups,
          });
        } catch (e: any) {
          errs.push(`${category}: ${e.message}`);
        }
      }),
    ).then(() => {
      if (cancelled) return;
      const ordered = availableCategories
        .map((cat) => results.find((r) => r.category === cat))
        .filter((s): s is CatalogSection => Boolean(s));
      setSections(ordered);
      setErrors(errs);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [language, tick]);

  return { sections, loading, errors, refresh };
}

// ─── Re-export helpers for consumers ─────────────────────────────────────────

export { FORUM_IDS, CATEGORY_LABELS, CATEGORY_TYPE };

// ─── Website Search & Topic Magnets Scraper ──────────────────────────────────

const FORUM_LANGUAGES: Record<string, Language> = {
  '10': 'tamil', '11': 'tamil', '12': 'tamil', '14': 'tamil', '17': 'tamil', '19': 'tamil',
  '46': 'english', '49': 'english', '50': 'english',
  '57': 'hindi', '58': 'hindi', '59': 'hindi',
  '23': 'telugu', '24': 'telugu', '25': 'telugu',
  '35': 'malayalam', '36': 'malayalam', '37': 'malayalam',
  '68': 'kannada', '69': 'kannada', '70': 'kannada',
};

export function detectLanguageFromTitle(title: string, forumId?: string | null): Language {
  if (forumId && FORUM_LANGUAGES[forumId]) {
    return FORUM_LANGUAGES[forumId];
  }
  const lower = title.toLowerCase();
  if (lower.includes('tamil') || lower.includes('தமிழ்')) return 'tamil';
  if (lower.includes('telugu') || lower.includes('తెలుగు')) return 'telugu';
  if (lower.includes('hindi') || lower.includes('हिन्दी')) return 'hindi';
  if (lower.includes('malayalam') || lower.includes('മലയാളം')) return 'malayalam';
  if (lower.includes('kannada') || lower.includes('ಕನ್ನಡ')) return 'kannada';
  if (lower.includes('english') || lower.includes('eng')) return 'english';
  return 'tamil';
}

export function cleanTopicTitle(title: string): { name: string; year: string | null } {
  let cleaned = title.replace(/^(?:https?:\/\/)?(?:www\.)?[\w\.-]+\.(?:com|org|net|cz|win|pm|re|to|yt|wf|ws|me|solar|mx|cards|pizza|fi|live|style)\s*[-_:]\s*/i, '');
  cleaned = cleaned.replace(/^(?:https?:\/\/)?(?:www\.)?(?:1tamilmv|tamilmv)[\w\.-]*\s*[-_:]\s*/i, '');
  cleaned = cleaned.replace(/^\[?\b(?:1tamilmv|tamilmv)\b\]?\s*[-_:]?\s*/i, '');
  cleaned = cleaned.replace(/^[\s\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+/u, '').trim();

  const match = cleaned.match(/^([^(]+?)\s*\((\d{4})\)/);
  if (match) {
    return { name: match[1].trim(), year: match[2] };
  }
  const beforeRes = cleaned.split(/\s*[-–]\s*(?:4K|2160p|1080p|720p|TRUE|WEB|HDRip|DVDRip|DVD|HDTV|PreDVD)/i)[0];
  return { name: beforeRes.trim(), year: null };
}

export async function fetchTamilMVTopicMagnets(topicUrl: string): Promise<{ poster: string | null; items: TorrentItem[] }> {
  const currentBase = getTamilMVBaseUrl();
  let urlToFetch = topicUrl;

  try {
    const parsed = new URL(topicUrl);
    const activeParsed = new URL(currentBase);
    if (parsed.host !== activeParsed.host) {
      urlToFetch = `${activeParsed.origin}${parsed.pathname}${parsed.search}`;
    }
  } catch {}

  const mirrorsToTry = [urlToFetch];
  KNOWN_TAMILMV_MIRRORS.forEach(m => {
    try {
      const p = new URL(topicUrl);
      mirrorsToTry.push(`${m}${p.pathname}${p.search}`);
    } catch {}
  });

  let lastError: any = null;

  for (const targetUrl of mirrorsToTry) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Connection': 'close',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) continue;

      const html = await res.text();
      const rawMagnets = html.match(/magnet:\?[^\s"'<>]+/gi) || [];
      const magnets = rawMagnets.map(m => m.replace(/&amp;/g, '&'));

      let poster: string | null = null;
      const ipsImgs = [...html.matchAll(/<img[^>]*class=['"][^'"]*ipsImage[^'"]*['"][^>]*src=['"]([^'"]+)['"]/gi)];
      if (ipsImgs.length > 0) {
        poster = ipsImgs[0][1];
      } else {
        const allImgs = [...html.matchAll(/<img[^>]*src=['"]([^'"]+)['"]/gi)].map(m => m[1]);
        const candidate = allImgs.find(s =>
          !s.includes('avatar') &&
          !s.includes('theme') &&
          !s.includes('emoticons') &&
          !s.includes('reactions') &&
          !s.includes('svg')
        );
        if (candidate) poster = candidate;
      }

      const items: TorrentItem[] = magnets.map((magnetUrl, i) => {
        const dnMatch = magnetUrl.match(/dn=([^&]+)/);
        let displayName = `Variant ${i + 1}`;
        if (dnMatch) {
          try {
            displayName = decodeURIComponent(dnMatch[1].replace(/\+/g, ' '));
          } catch {
            displayName = dnMatch[1].replace(/\+/g, ' ');
          }
        }

        const xtMatch = magnetUrl.match(/urn:btih:([a-zA-Z0-9]+)/i);
        const infoHash = xtMatch ? xtMatch[1] : '';

        return {
          guid: `${topicUrl}-magnet-${i}-${infoHash}`,
          groupid: topicUrl,
          name: displayName,
          title: displayName,
          year: null,
          language: 'tamil',
          poster,
          magnetUrl,
          infoHash,
          publishDate: new Date().toISOString(),
        };
      });

      return { poster, items };
    } catch (err) {
      clearTimeout(timeout);
      lastError = err;
    }
  }

  throw lastError || new Error('Failed to fetch topic magnets from all mirrors');
}

async function fetchSearchHtml(searchQuery: string, baseUrl: string): Promise<{ html: string; successfulBase: string }> {
  const searchPath = `/index.php?/search/&q=${encodeURIComponent(searchQuery)}&type=forums_topic&search_and_or=or&sortby=relevancy`;
  const mirrorsToTry = [baseUrl, ...KNOWN_TAMILMV_MIRRORS.filter(m => m !== baseUrl)];

  for (const mirror of mirrorsToTry) {
    const targetUrl = `${mirror}${searchPath}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Connection': 'close',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const text = await res.text();
        return { html: text, successfulBase: mirror };
      }
    } catch {
      clearTimeout(timeout);
    }
  }

  return { html: '', successfulBase: baseUrl };
}

function parseTamilMVSearchHtml(html: string, successfulBase: string, language: Language | 'all'): GroupedItem[] {
  const streamItemRegex = /<li[^>]*class=['"][^'"]*ipsStreamItem[^'"]*['"][\s\S]*?<\/li>/gi;
  const items = [...html.matchAll(streamItemRegex)];
  const grouped: Record<string, GroupedItem> = {};

  for (const item of items) {
    const str = item[0];

    const topicMatch = str.match(/<span[^>]*class=['"][^'"]*ipsType_break[^'"]*['"][^>]*>\s*<a\s+[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i)
      || str.match(/<a\s+[^>]*href=['"]([^'"]*\/forums\/topic\/(\d+)-[^'"]*)['"][^>]*>([\s\S]*?)<\/a>/i);
    if (!topicMatch) continue;

    const rawTitle = (topicMatch[2] || topicMatch[3] || '').replace(/<[^>]+>/g, '').trim();
    let topicUrl = (topicMatch[1] || '').replace(/&amp;/g, '&');
    if (topicUrl.startsWith('//')) topicUrl = 'https:' + topicUrl;
    else if (topicUrl.startsWith('/')) topicUrl = `${successfulBase}${topicUrl}`;

    const forumMatch = str.match(/\/forums\/forum\/(\d+)-/i);
    const forumId = forumMatch ? forumMatch[1] : null;

    const itemLang = detectLanguageFromTitle(rawTitle, forumId);

    // Filter by language if a specific language is requested
    if (language !== 'all' && itemLang !== language) {
      if (!rawTitle.toLowerCase().includes(language.toLowerCase())) {
        continue;
      }
    }

    const isSeries = /series|season|episode|s\d{2}|e\d{2}/i.test(rawTitle) || forumId === '19';
    const type: 'movie' | 'series' = isSeries ? 'series' : 'movie';

    const dateMatch = str.match(/<time[^>]*datetime=['"]([^'"]+)['"]/i);
    const date = dateMatch ? dateMatch[1] : new Date().toISOString();

    let poster: string | null = null;
    const imgMatches = [...str.matchAll(/<img[^>]*src=['"]([^'"]+)['"]/gi)].map(m => m[1]);
    const candidate = imgMatches.find(s =>
      !s.includes('avatar') &&
      !s.includes('emoticons') &&
      !s.includes('reactions') &&
      !s.includes('theme') &&
      !s.includes('svg')
    );
    if (candidate) poster = candidate;

    const { name, year } = cleanTopicTitle(rawTitle);
    const key = `${name.toLowerCase()}|||${year || ''}`;

    const torrentItem: TorrentItem = {
      guid: topicUrl,
      groupid: topicUrl,
      name,
      year,
      language: itemLang,
      poster,
      title: rawTitle,
      magnetUrl: '', // fetched on-demand
      infoHash: '',
      publishDate: date,
    };

    if (!grouped[key]) {
      grouped[key] = {
        name,
        year,
        items: [torrentItem],
      };
      (grouped[key] as any).type = type;
    } else {
      grouped[key].items.push(torrentItem);
      if (!grouped[key].items[0].poster && poster) {
        grouped[key].items[0].poster = poster;
      }
    }
  }

  return Object.values(grouped);
}

export async function searchTamilMV(
  query: string,
  language: Language | 'all' = 'all',
  customBaseUrl?: string
): Promise<GroupedItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const baseUrl = customBaseUrl || getTamilMVBaseUrl();

  // Strip generic filler words like "movie", "movies", "film", "padam"
  const cleanQ = trimmed.replace(/\b(movies?|films?|padam|cinema)\b/gi, '').trim() || trimmed;

  // 1. Primary search
  const { html, successfulBase } = await fetchSearchHtml(trimmed, baseUrl);
  let results = parseTamilMVSearchHtml(html, successfulBase, language);

  // 2. If no results and cleanQ is different from trimmed, try cleanQ
  if (results.length === 0 && cleanQ !== trimmed) {
    const { html: fallbackHtml, successfulBase: fallbackBase } = await fetchSearchHtml(cleanQ, baseUrl);
    results = parseTamilMVSearchHtml(fallbackHtml, fallbackBase, language);
  }

  // 3. If short query (<= 3 chars) returns 0 results, try with wildcard *
  if (results.length === 0 && cleanQ.length <= 3 && !cleanQ.includes('*')) {
    const { html: wcHtml, successfulBase: wcBase } = await fetchSearchHtml(`${cleanQ}*`, baseUrl);
    results = parseTamilMVSearchHtml(wcHtml, wcBase, language);
  }

  // 4. If still no results, use TMDB to find matching Indian movie titles (e.g. "Hi" -> "Hi Nanna")
  if (results.length === 0) {
    try {
      const tmdbKey = 'a07e22bc18f5cb106bfe4cc1f83ad8ed';
      const tmdbRes = await fetch(
        `https://api.themoviedb.org/3/search/movie?api_key=${tmdbKey}&query=${encodeURIComponent(cleanQ)}&include_adult=false`
      );
      if (tmdbRes.ok) {
        const tmdbData = await tmdbRes.json();
        const suggestions = (tmdbData.results || [])
          .filter((m: any) => ['te', 'ta', 'hi', 'ml', 'kn', 'en'].includes(m.original_language))
          .slice(0, 3)
          .map((m: any) => m.title);

        for (const sugTitle of suggestions) {
          if (sugTitle.toLowerCase() !== cleanQ.toLowerCase()) {
            const { html: sugHtml, successfulBase: sugBase } = await fetchSearchHtml(sugTitle, baseUrl);
            const sugResults = parseTamilMVSearchHtml(sugHtml, sugBase, language);
            if (sugResults.length > 0) {
              return sugResults;
            }
          }
        }
      }
    } catch {}
  }

  return results;
}

// ─── 1TamilMV Homepage "Recently Added" & "Top Releases" Scraper ─────────────

export async function fetchTamilMVRecentlyAdded(
  forceRefresh: boolean = false,
  customBaseUrl?: string
): Promise<GroupedItem[]> {
  const baseUrl = customBaseUrl || getTamilMVBaseUrl();
  const cacheKey = 'tamilmv:recently_added';

  if (!forceRefresh) {
    try {
      const raw = storageService.getItem(cacheKey);
      if (raw) {
        const entry: { data: GroupedItem[]; timestamp: number } = JSON.parse(raw);
        if (Date.now() - entry.timestamp < 10 * 60 * 1000) {
          return entry.data;
        }
      }
    } catch {}
  }

  const mirrorsToTry = [baseUrl, ...KNOWN_TAMILMV_MIRRORS.filter(m => m !== baseUrl)];
  let html = '';
  let successfulBase = baseUrl;

  for (const mirror of mirrorsToTry) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(mirror, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Connection': 'close',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        html = await res.text();
        successfulBase = mirror;
        break;
      }
    } catch {
      clearTimeout(timeout);
    }
  }

  if (!html) {
    try {
      const raw = storageService.getItem(cacheKey);
      if (raw) return JSON.parse(raw).data;
    } catch {}
    return [];
  }

  const recIdx = html.indexOf('RECENTLY ADDED');
  if (recIdx === -1) return [];

  const topIdx = html.indexOf('TOP RELEASES THIS WEEK');
  const startIdx = topIdx !== -1 && topIdx < recIdx ? topIdx : recIdx;

  const endIdx = html.indexOf('id="elForumRow_', startIdx) !== -1
    ? html.indexOf('id="elForumRow_', startIdx)
    : html.indexOf('ipsLayout_sidebar', startIdx) !== -1
      ? html.indexOf('ipsLayout_sidebar', startIdx)
      : startIdx + 80000;

  const sectionHtml = html.substring(startIdx, endIdx);
  const rawLines = sectionHtml.split(/<br\s*\/?>/i);

  // Build local poster lookup from cached RSS
  const posterLookup = new Map<string, string>();
  try {
    const langs: Language[] = ['tamil', 'telugu', 'hindi', 'malayalam', 'kannada', 'english'];
    const cats: Category[] = ['predvd', 'webhd', 'multiaudio', 'hdrip', 'series'];
    for (const l of langs) {
      for (const c of cats) {
        const raw = storageService.getItem(getCacheKey(l, c));
        if (raw) {
          const entry: CacheEntry = JSON.parse(raw);
          (entry.data || []).forEach(g => {
            if (g.name) {
              const p = g.items.find(i => i.poster)?.poster;
              if (p) posterLookup.set(g.name.toLowerCase().trim(), p);
            }
          });
        }
      }
    }
  } catch {}

  const grouped: Record<string, GroupedItem> = {};

  for (const line of rawLines) {
    const linkMatch = line.match(/href="([^"]*\/forums\/topic\/(\d+)-[^"]*)"/i);
    if (!linkMatch) continue;

    let topicUrl = linkMatch[1].replace(/&amp;/g, '&');
    if (topicUrl.startsWith('//')) topicUrl = 'https:' + topicUrl;
    else if (topicUrl.startsWith('/')) topicUrl = `${successfulBase}${topicUrl}`;

    const cleanText = line
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\b(TOP RELEASES THIS WEEK|RECENTLY ADDED)\b/gi, '')
      .replace(/\[\s*W\s*\]/gi, '')
      .trim();

    if (!cleanText || cleanText.length < 5) continue;

    const { name, year } = cleanTopicTitle(cleanText);
    const lang = detectLanguageFromTitle(cleanText);
    const isSeries = /series|season|episode|s\d{2}|e\d{2}|ep\s*\(/i.test(cleanText);

    const key = `${name.toLowerCase()}|||${year || ''}`;
    const poster = posterLookup.get(name.toLowerCase().trim()) || null;

    const torrentItem: TorrentItem = {
      guid: topicUrl,
      groupid: topicUrl,
      name,
      year,
      language: lang,
      poster,
      title: cleanText,
      magnetUrl: '',
      infoHash: '',
      publishDate: new Date().toISOString(),
    };

    if (!grouped[key]) {
      grouped[key] = {
        name,
        year,
        items: [torrentItem],
      };
      (grouped[key] as any).type = isSeries ? 'series' : 'movie';
    } else {
      if (!grouped[key].items.some(i => i.guid === topicUrl)) {
        grouped[key].items.push(torrentItem);
      }
    }
  }

  const results = Object.values(grouped);
  try {
    storageService.setItem(cacheKey, JSON.stringify({ data: results, timestamp: Date.now() }));
  } catch {}

  return results;
}

// ─── Fetch All Movies (Recently Added + All Major Catalog Feeds) ─────────────

export async function fetchAllTamilMVMovies(
  forceRefresh: boolean = false,
  customBaseUrl?: string
): Promise<GroupedItem[]> {
  const recentItems = await fetchTamilMVRecentlyAdded(forceRefresh, customBaseUrl);
  const movieMap = new Map<string, GroupedItem>();

  for (const item of recentItems) {
    const key = `${(item.name || '').toLowerCase().trim()}|||${item.year || ''}`;
    movieMap.set(key, item);
  }

  // Also load movies from catalog feeds across languages
  const langs: Language[] = ['tamil', 'telugu', 'hindi', 'malayalam', 'kannada', 'english'];
  const cats: Category[] = ['webhd', 'predvd'];

  const feedPromises = [];
  for (const lang of langs) {
    for (const cat of cats) {
      feedPromises.push(
        fetchAndParse(lang, cat).catch(() => [] as GroupedItem[])
      );
    }
  }

  try {
    const allFeeds = await Promise.all(feedPromises);
    for (const feed of allFeeds) {
      for (const group of feed) {
        const key = `${(group.name || '').toLowerCase().trim()}|||${group.year || ''}`;
        if (!movieMap.has(key)) {
          movieMap.set(key, group);
        } else {
          const existing = movieMap.get(key)!;
          for (const it of group.items) {
            if (!existing.items.some((i) => i.guid === it.guid)) {
              existing.items.push(it);
            }
          }
        }
      }
    }
  } catch {}

  return Array.from(movieMap.values());
}

// ─── Utility: Clean Movie/Series Title ───────────────────────────────────────

export function cleanMovieTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(/^(?:https?:\/\/)?(?:www\.)?[\w\.-]+\.(?:com|org|net|cz|win|pm|re|to|yt|wf|ws|me|solar|mx|cards|pizza|fi|live|style)\s*[-_:]\s*/gi, '')
    .replace(/^(?:https?:\/\/)?(?:www\.)?(?:1tamilmv|tamilmv)[\w\.-]*\s*[-_:]\s*/gi, '')
    .replace(/^\[?\b(?:1tamilmv|tamilmv)\b\]?\s*[-_:]?\s*/gi, '')
    .replace(/\b(?:1tamilmv|tamilmv)\b/gi, '')
    .replace(/^[\s\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\-_–]+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Web Series Dynamic Pagination ──────────────────────────────────────────

export interface WebSeriesPageResult {
  items: GroupedItem[];
  totalPages: number;
  currentPage: number;
}

export function parseWebSeriesPageHtml(html: string, baseUrl: string): { items: GroupedItem[]; totalPages: number } {
  let totalPages = 1;
  const pageMatch = html.match(/data-pages=["'](\d+)["']/i) ||
                    html.match(/data-ipsPagination-pages=["'](\d+)["']/i) ||
                    html.match(/Page\s+\d+\s+of\s+(\d+)/i) ||
                    html.match(/rel=["']last["'][^>]*data-page=["'](\d+)["']/i);
  if (pageMatch) {
    totalPages = parseInt(pageMatch[1], 10);
  }

  const rowRegex = /<li[^>]*class=["'][^"']*ipsDataItem[^"']*["'][^>]*data-rowID=["'](\d+)["'][\s\S]*?<\/li>/gi;
  const rows = [...html.matchAll(rowRegex)];
  const grouped: Record<string, GroupedItem> = {};

  for (const row of rows) {
    const rowHtml = row[0];
    const linkMatch = rowHtml.match(/<h4[^>]*class=["'][^"']*ipsDataItem_title[^"']*["'][\s\S]*?<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    let topicUrl = linkMatch[1].replace(/&amp;/g, '&').trim();
    if (topicUrl.startsWith('//')) topicUrl = 'https:' + topicUrl;
    else if (topicUrl.startsWith('/')) topicUrl = `${baseUrl}${topicUrl}`;

    const rawTitle = linkMatch[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    if (!rawTitle || rawTitle.length < 4) continue;

    const { name, year } = cleanTopicTitle(rawTitle);
    const lang = detectLanguageFromTitle(rawTitle, '19');
    const key = `${name.toLowerCase()}|||${year || ''}`;

    const torrentItem: TorrentItem = {
      guid: topicUrl,
      groupid: topicUrl,
      name,
      year,
      language: lang,
      poster: null,
      title: rawTitle,
      magnetUrl: '',
      infoHash: '',
      publishDate: new Date().toISOString(),
    };

    if (!grouped[key]) {
      grouped[key] = {
        name,
        year,
        items: [torrentItem],
      };
      (grouped[key] as any).type = 'series';
    } else {
      if (!grouped[key].items.some((i) => i.guid === topicUrl)) {
        grouped[key].items.push(torrentItem);
      }
    }
  }

  return {
    items: Object.values(grouped),
    totalPages,
  };
}

export async function fetchWebSeriesPage(
  page: number = 1,
  forceRefresh: boolean = false,
  customBaseUrl?: string
): Promise<WebSeriesPageResult> {
  const baseUrl = customBaseUrl || getTamilMVBaseUrl();
  const cacheKey = `tamilmv:webseries:page:${page}`;

  if (!forceRefresh) {
    try {
      const raw = storageService.getItem(cacheKey);
      if (raw) {
        const entry = JSON.parse(raw);
        if (Date.now() - entry.timestamp < 10 * 60 * 1000) {
          return entry.data;
        }
      }
    } catch {}
  }

  const mirrorsToTry = [baseUrl, ...KNOWN_TAMILMV_MIRRORS.filter((m) => m !== baseUrl)];

  for (const mirror of mirrorsToTry) {
    try {
      if (page === 1) {
        // Page 1: Load XML feed & detect total pages from HTML
        const xmlUrl = `${mirror}/index.php?/forums/forum/19-web-series-tv-shows/all.xml`;
        const htmlUrl = `${mirror}/index.php?/forums/forum/19-web-series-tv-shows/`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 16000);

        const [xmlRes, htmlRes] = await Promise.all([
          fetch(xmlUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            },
            signal: controller.signal,
          }).catch(() => null),
          fetch(htmlUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: controller.signal,
          }).catch(() => null),
        ]);

        clearTimeout(timeout);

        let totalPages = 1;
        if (htmlRes && htmlRes.ok) {
          const html = await htmlRes.text();
          const pageMatch = html.match(/data-pages=["'](\d+)["']/i) ||
                            html.match(/data-ipsPagination-pages=["'](\d+)["']/i) ||
                            html.match(/Page\s+\d+\s+of\s+(\d+)/i) ||
                            html.match(/rel=["']last["'][^>]*data-page=["'](\d+)["']/i);
          if (pageMatch) totalPages = parseInt(pageMatch[1], 10);
        }

        // If totalPages is still 1, retry fetching html from another mirror if needed
        if (totalPages <= 1) {
          for (const m2 of mirrorsToTry.slice(0, 3)) {
            if (m2 === mirror) continue;
            try {
              const r2 = await fetch(`${m2}/index.php?/forums/forum/19-web-series-tv-shows/`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
              });
              if (r2.ok) {
                const h2 = await r2.text();
                const pm2 = h2.match(/data-pages=["'](\d+)["']/i) ||
                            h2.match(/data-ipsPagination-pages=["'](\d+)["']/i) ||
                            h2.match(/Page\s+\d+\s+of\s+(\d+)/i) ||
                            h2.match(/rel=["']last["'][^>]*data-page=["'](\d+)["']/i);
                if (pm2) {
                  totalPages = parseInt(pm2[1], 10);
                  break;
                }
              }
            } catch {}
          }
        }

        if (xmlRes && xmlRes.ok) {
          const xml = await xmlRes.text();
          let items = parseRSSFeed(xml, 'tamil', 'series');

          // If XML returned 0 items, fallback to parsing HTML
          if (items.length === 0 && htmlRes && htmlRes.ok) {
            const html = await htmlRes.text();
            items = parseWebSeriesPageHtml(html, mirror).items;
          }

          if (items.length > 0) {
            const result: WebSeriesPageResult = {
              items,
              totalPages: Math.max(totalPages, 1),
              currentPage: 1,
            };

            try {
              storageService.setItem(cacheKey, JSON.stringify({ data: result, timestamp: Date.now() }));
            } catch {}

            return result;
          }
        }
      } else {
        // Page > 1 from forum pagination HTML
        const htmlUrl = `${mirror}/index.php?/forums/forum/19-web-series-tv-shows/page/${page}/`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 16000);

        const res = await fetch(htmlUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.ok) {
          const html = await res.text();
          const { items, totalPages } = parseWebSeriesPageHtml(html, mirror);

          if (items.length > 0) {
            const result: WebSeriesPageResult = {
              items,
              totalPages: Math.max(totalPages, 1),
              currentPage: page,
            };

            try {
              storageService.setItem(cacheKey, JSON.stringify({ data: result, timestamp: Date.now() }));
            } catch {}

            return result;
          }
        }
      }
    } catch {}
  }

  // Fallback to cache if available
  try {
    const raw = storageService.getItem(cacheKey);
    if (raw) return JSON.parse(raw).data;
  } catch {}

  throw new Error(`Failed to load Web Series page ${page}. Please check your connection or mirror.`);
}

export interface UseWebSeriesPaginatedResult {
  items: GroupedItem[];
  currentPage: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  goToPage: (page: number) => void;
  refresh: () => void;
}

export function useWebSeriesPaginated(initialPage: number = 1): UseWebSeriesPaginatedResult {
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [items, setItems] = useState<GroupedItem[]>([]);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (page: number, forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWebSeriesPage(page, forceRefresh);
      setItems(res.items);
      setTotalPages((prev) => (res.totalPages > 1 ? res.totalPages : prev));
      setCurrentPage(res.currentPage);
    } catch (err: any) {
      setError(err?.message || `Failed to load page ${page}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPage(currentPage, false);
  }, [currentPage, loadPage]);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const refresh = useCallback(() => {
    loadPage(currentPage, true);
  }, [currentPage, loadPage]);

  return {
    items,
    currentPage,
    totalPages,
    loading,
    error,
    goToPage,
    refresh,
  };
}

export function getPaginationItems(currentPage: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 1) return [1];
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, '...', totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [
      1,
      '...',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    1,
    '...',
    currentPage - 1,
    currentPage,
    currentPage + 1,
    '...',
    totalPages,
  ];
}

