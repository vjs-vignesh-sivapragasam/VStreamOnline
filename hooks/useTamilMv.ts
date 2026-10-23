import { MagnetParser } from '@/utils/MagnetParser';
import { StorageKeys, storageService } from '@/utils/StorageService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useCallback } from 'react';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ─── Base URL & Constants ─────────────────────────────────────────────────────

export const DEFAULT_TAMILMV_BASE_URL = 'https://www.1tamilmv.com';

export const KNOWN_TAMILMV_MIRRORS = [
  'https://www.1tamilmv.pm',
  'https://www.1tamilmv.yt',
  'https://www.1tamilmv.tf',
  'https://www.1tamilmv.mx',
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
  if (customUrl && customUrl.trim()) {
    cachedTamilMVBaseUrl = customUrl.trim().replace(/\/+$/, '');
  }
} catch (e) {
  console.warn('Failed to read TamilMV base URL from storageService', e);
}

// 2. Hydrate from AsyncStorage immediately so domain persists across app reloads/restarts
AsyncStorage.getItem(StorageKeys.TAMILMV_BASE_URL_KEY)
  .then(storedUrl => {
    if (storedUrl && storedUrl.trim()) {
      const sanitized = storedUrl.trim().replace(/\/+$/, '');
      if (sanitized !== cachedTamilMVBaseUrl) {
        cachedTamilMVBaseUrl = sanitized;
        try {
          storageService.setItem(StorageKeys.TAMILMV_BASE_URL_KEY, sanitized);
        } catch {}
        notifyBaseUrlChanged(sanitized);
      }
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
 * Pings known TamilMV mirrors and automatically selects & saves the first working mirror to AsyncStorage.
 */
export async function autoDiscoverWorkingDomain(): Promise<string | null> {
  if (isAutoDiscovering) return null;
  isAutoDiscovering = true;
  try {
    for (const mirror of KNOWN_TAMILMV_MIRRORS) {
      try {
        const res = await pingTamilMV(mirror);
        if (res.success && res.rssWorking) {
          console.log(`[TamilMV] Active mirror found: ${mirror} (${res.latencyMs}ms). Persisting to AsyncStorage.`);
          await setTamilMVBaseUrl(mirror);
          return mirror;
        }
      } catch (err) {
        // Continue testing other mirrors
      }
    }
  } catch (e) {
    console.warn('[TamilMV] Error during domain auto-discovery:', e);
  } finally {
    isAutoDiscovering = false;
  }
  return null;
}

export type Language = 'tamil' | 'english' | 'hindi' | 'telugu' | 'malayalam' | 'kannada';
export type Category = 'webhd' | 'hdrip' | 'hdtv' | 'series' | 'multiaudio';

const FORUM_IDS: Record<Language, Partial<Record<Category, string>>> = {
  tamil: {
    webhd: '11-web-hd-itunes-hd-bluray',
    series: '19-web-series-tv-shows',
    multiaudio: '17-hollywood-movies-in-multi-audios',
    hdrip: '12-hd-rips-dvd-rips-br-rips',
    hdtv: '14-hdtv-sdtv-hdtv-rips',
  },
  english: {
    webhd: '49-web-hd-itunes-hd-bluray',
    hdrip: '50-hd-rips-dvd-rips-br-rips'
  },
  hindi: {
    webhd: '58-web-hd-itunes-hd-bluray',
    hdrip: '59-hd-rips-dvd-rips-br-rips'
  },
  telugu: {
    webhd: '24-web-hd-itunes-hd-bluray',
    hdrip: '25-hd-rips-dvd-rips-br-rips'
  },
  malayalam: {
    webhd: '36-web-hd-itunes-hd-bluray',
    hdrip: '37-hd-rips-dvd-rips-br-rips'
  },
  kannada: {
    webhd: '69-web-hd-itunes-hd-bluray',
    hdrip: '70-hd-rips-dvd-rips-br-rips'
  },
};

const CATEGORY_LABELS: Record<Category, string> = {
  webhd: 'Web HD',
  hdrip: 'HD Rip',
  hdtv: 'HD TV',
  multiaudio: 'Multi Audios',
  series: 'Web Series & TV Shows',
};

const CATEGORY_TYPE: Record<Category, 'movie' | 'series'> = {
  webhd: 'movie',
  hdrip: 'movie',
  hdtv: 'movie',
  multiaudio: 'movie',
  series: 'series'
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
  return !INVALID_RELEASE_REGEX.test(displayName) && !LOW_QUALITY_REGEX.test(displayName);
}

function extractTitleYear(title: string): { name: string | null; year: string | null } {
  const cleaned = title.replace(/^[^-]+-\s*/, '');
  const match = cleaned.match(TITLE_YEAR_REGEX);
  return match ? { name: match[1].trim(), year: match[2] } : { name: null, year: null };
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