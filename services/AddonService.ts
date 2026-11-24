import { storageService, StorageKeys } from '@/utils/StorageService';
import { GroupedItem, TorrentItem } from '@/hooks/useTamilMv';

// ─── Interfaces & Models ──────────────────────────────────────────────────────

export interface StremioCatalog {
  type: string;
  id: string;
  name: string;
  genres?: string[];
  extra?: { name: string; isRequired?: boolean; options?: string[] }[];
  extraSupported?: string[];
}

export type AddonResource = string | { name: string; types: string[]; idPrefixes?: string[] };

export interface StremioManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  logo?: string;
  background?: string;
  resources: AddonResource[];
  types: string[];
  catalogs?: StremioCatalog[];
  behaviorHints?: any;
}

export interface InstalledAddon {
  transportUrl: string; // Base manifest URL (e.g. https://v3-cinemeta.strem.io/manifest.json)
  manifest: StremioManifest;
  enabled: boolean;
  installedAt: number;
}

export interface StremioMetaItem {
  id: string; // IMDb id (tt...) or tmdb:...
  type: string; // movie, series
  name: string;
  poster?: string;
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  year?: string;
  imdbRating?: string;
  genres?: string[];
  cast?: string[];
  director?: string[];
}

export interface StremioStream {
  name?: string;
  title?: string;
  infoHash?: string;
  fileIdx?: number;
  url?: string;
  behaviorHints?: any;
  sources?: string[];
  addonName?: string;
}

export interface AddonCatalogOption {
  addonId: string;
  addonName: string;
  transportUrl: string;
  catalogId: string;
  catalogName: string;
  type: string;
}

// ─── Featured & Popular Addons ────────────────────────────────────────────────

export const POPULAR_ADDONS: {
  id: string;
  name: string;
  manifestUrl: string;
  description: string;
  icon: string;
  badge: string;
}[] = [
  {
    id: 'com.linvo.cinemeta',
    name: 'Cinemeta',
    manifestUrl: 'https://v3-cinemeta.strem.io/manifest.json',
    description: 'Official Stremio catalog & metadata provider for popular movies and series.',
    icon: 'film-outline',
    badge: 'Catalog & Meta',
  },
  {
    id: 'com.stremio.torrentio.addon',
    name: 'Torrentio',
    manifestUrl: 'https://torrentio.strem.fun/manifest.json',
    description: 'Scrapes torrent streams from popular torrent trackers with quality & seeders.',
    icon: 'flash-outline',
    badge: 'Streams',
  },
  {
    id: 'org.elfhosted.cyberflix',
    name: 'CyberFlix Catalog',
    manifestUrl: 'https://cyberflix.elfhosted.com/manifest.json',
    description: 'Catalogs for Netflix, Disney+, Apple TV+, HBO Max & Prime Video.',
    icon: 'tv-outline',
    badge: 'Catalogs',
  },
  {
    id: 'org.elfhosted.mediafusion',
    name: 'MediaFusion',
    manifestUrl: 'https://mediafusion.elfhosted.com/manifest.json',
    description: 'Multilingual movies, regional Indian cinema (Tamil, Telugu, Hindi) & global titles.',
    icon: 'globe-outline',
    badge: 'Streams & Catalogs',
  },
  {
    id: 'org.stremio.opensubtitlesv3',
    name: 'OpenSubtitles v3',
    manifestUrl: 'https://opensubtitles-v3.strem.io/manifest.json',
    description: 'Official community subtitle search & auto-fetch across languages.',
    icon: 'chatbubble-ellipses-outline',
    badge: 'Subtitles',
  },
];

// Default addons pre-configured on first run
const DEFAULT_PRESET_ADDONS: { manifestUrl: string }[] = [
  { manifestUrl: 'https://v3-cinemeta.strem.io/manifest.json' },
  { manifestUrl: 'https://torrentio.strem.fun/manifest.json' },
];

// ─── Service Implementation ───────────────────────────────────────────────────

class AddonService {
  private addons: InstalledAddon[] = [];
  private listeners = new Set<() => void>();
  private isLoaded = false;

  constructor() {
    this.loadAddons();
  }

  /**
   * Remove any duplicate addons sharing the same manifest.id or transportUrl
   */
  public deduplicateAddons(addons: InstalledAddon[]): InstalledAddon[] {
    const seenUrls = new Set<string>();
    const seenIds = new Set<string>();
    const unique: InstalledAddon[] = [];

    for (const a of addons) {
      if (!a || !a.transportUrl) continue;
      const cleanUrl = this.cleanManifestUrl(a.transportUrl).toLowerCase();
      const id = (a.manifest?.id || cleanUrl).toLowerCase();

      if (!seenUrls.has(cleanUrl) && !seenIds.has(id)) {
        seenUrls.add(cleanUrl);
        seenIds.add(id);
        unique.push({ ...a, transportUrl: this.cleanManifestUrl(a.transportUrl) });
      }
    }
    return unique;
  }

  /**
   * Cleans and formats addon URL to valid https manifest URL
   */
  public cleanManifestUrl(rawUrl: string): string {
    let url = (rawUrl || '').trim();
    if (url.startsWith('stremio://')) {
      url = 'https://' + url.slice('stremio://'.length);
    }
    // Remove trailing slashes
    url = url.replace(/\/+$/, '');
    if (!url.endsWith('/manifest.json')) {
      url = url + '/manifest.json';
    }
    return url;
  }

  /**
   * Load installed addons from local storage or install default presets
   */
  public loadAddons(): InstalledAddon[] {
    try {
      const raw = storageService.getItem(StorageKeys.ADDONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.addons = this.deduplicateAddons(parsed);
          this.isLoaded = true;
          // Persist the deduplicated list to clear out stale duplicates from storage
          if (this.addons.length !== parsed.length) {
            storageService.setItem(StorageKeys.ADDONS_KEY, JSON.stringify(this.addons));
          }
          return this.addons;
        }
      }
    } catch (e) {
      console.warn('[AddonService] Error reading addons from storage:', e);
    }

    // Default initialization
    this.addons = [];
    this.isLoaded = true;
    this.initializeDefaults();
    return this.addons;
  }

  private async initializeDefaults() {
    try {
      for (const preset of DEFAULT_PRESET_ADDONS) {
        try {
          await this.installAddon(preset.manifestUrl, true);
        } catch {}
      }
    } catch (err) {
      console.warn('[AddonService] Error initializing default addons:', err);
    }
  }

  public getInstalledAddons(): InstalledAddon[] {
    if (!this.isLoaded) {
      this.loadAddons();
    }
    return this.deduplicateAddons(this.addons);
  }

  public getEnabledAddons(): InstalledAddon[] {
    return this.getInstalledAddons().filter((a) => a.enabled);
  }

  /**
   * Save addons array to persistent storage
   */
  private saveAddons() {
    try {
      this.addons = this.deduplicateAddons(this.addons);
      storageService.setItem(StorageKeys.ADDONS_KEY, JSON.stringify(this.addons));
    } catch (e) {
      console.error('[AddonService] Failed to save addons to storage:', e);
    }
    this.notifyListeners();
  }

  /**
   * Fetches manifest from URL and installs the addon
   */
  public async installAddon(rawUrl: string, silent = false): Promise<InstalledAddon> {
    const cleanUrl = this.cleanManifestUrl(rawUrl);

    // Check if already installed
    const existing = this.addons.find((a) => a.transportUrl === cleanUrl);
    if (existing) {
      if (!existing.enabled) {
        existing.enabled = true;
        this.saveAddons();
      }
      return existing;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(cleanUrl, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Addon server responded with status ${res.status}`);
      }

      const manifest: StremioManifest = await res.json();
      if (!manifest.id || !manifest.name) {
        throw new Error('Invalid addon manifest: missing id or name');
      }

      const newAddon: InstalledAddon = {
        transportUrl: cleanUrl,
        manifest,
        enabled: true,
        installedAt: Date.now(),
      };

      // Filter out any existing addon matching either URL or manifest ID
      const filtered = this.addons.filter(
        (a) =>
          this.cleanManifestUrl(a.transportUrl).toLowerCase() !== cleanUrl.toLowerCase() &&
          (a.manifest?.id || '').toLowerCase() !== manifest.id.toLowerCase()
      );

      this.addons = this.deduplicateAddons([...filtered, newAddon]);
      this.saveAddons();
      return newAddon;
    } catch (err: any) {
      clearTimeout(timeout);
      if (!silent) {
        console.error('[AddonService] Failed to install addon:', cleanUrl, err);
      }
      throw err;
    }
  }

  /**
   * Toggle addon enabled status
   */
  public toggleAddon(transportUrl: string, enabled: boolean): void {
    const clean = this.cleanManifestUrl(transportUrl);
    this.addons = this.addons.map((a) => (a.transportUrl === clean ? { ...a, enabled } : a));
    this.saveAddons();
  }

  /**
   * Remove/uninstall addon
   */
  public removeAddon(transportUrl: string): void {
    const clean = this.cleanManifestUrl(transportUrl);
    this.addons = this.addons.filter((a) => a.transportUrl !== clean);
    this.saveAddons();
  }

  /**
   * Check if addon has a specific resource (e.g. 'catalog', 'stream', 'meta', 'subtitles')
   */
  public hasResource(addon: InstalledAddon, resourceName: string): boolean {
    if (!addon.manifest?.resources) return false;
    return addon.manifest.resources.some((r) => {
      if (typeof r === 'string') return r === resourceName;
      return r.name === resourceName;
    });
  }

  /**
   * Get all available catalogs across all enabled addons
   */
  public getAvailableCatalogs(): AddonCatalogOption[] {
    const options: AddonCatalogOption[] = [];
    const enabled = this.getEnabledAddons();

    for (const addon of enabled) {
      if (!addon.manifest.catalogs) continue;
      for (const cat of addon.manifest.catalogs) {
        options.push({
          addonId: addon.manifest.id,
          addonName: addon.manifest.name,
          transportUrl: addon.transportUrl,
          catalogId: cat.id,
          catalogName: cat.name || `${cat.type} (${cat.id})`,
          type: cat.type || 'movie',
        });
      }
    }
    return options;
  }

  /**
   * Fetch movies/series from an addon catalog endpoint
   * GET /catalog/{type}/{id}.json or /catalog/{type}/{id}/skip={number}.json or /catalog/{type}/{id}/search={query}.json
   */
  public async fetchCatalogMetas(
    addon: InstalledAddon,
    type: string,
    catalogId: string,
    skip: number = 0,
    search?: string
  ): Promise<StremioMetaItem[]> {
    const baseUrl = addon.transportUrl.replace(/\/manifest\.json$/, '');
    let endpoint = `${baseUrl}/catalog/${encodeURIComponent(type)}/${encodeURIComponent(catalogId)}`;

    if (search && search.trim().length > 0) {
      endpoint += `/search=${encodeURIComponent(search.trim())}.json`;
    } else if (skip > 0) {
      endpoint += `/skip=${skip}.json`;
    } else {
      endpoint += '.json';
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);

    try {
      const res = await fetch(endpoint, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`Catalog request failed: ${res.status}`);
      }

      const data = await res.json();
      return (data.metas || []) as StremioMetaItem[];
    } catch (e) {
      clearTimeout(timer);
      console.warn(`[AddonService] Failed fetching catalog from ${endpoint}:`, e);
      return [];
    }
  }

  /**
   * Converts StremioMetaItem into GroupedItem compatible with existing search & details components
   */
  public metaToGroupedItem(meta: StremioMetaItem, addonName: string = 'Addon'): GroupedItem {
    const yearStr = meta.year || (meta.releaseInfo ? meta.releaseInfo.slice(0, 4) : null);
    const torrentItem: TorrentItem = {
      name: meta.name,
      year: yearStr,
      language: 'English',
      groupid: meta.id, // IMDb ID e.g. tt1375666
      guid: meta.id,
      poster: meta.poster || null,
      title: meta.name,
      magnetUrl: '', // Will be dynamically resolved by stream addons on details page
      infoHash: '',
      publishDate: meta.releaseInfo || (yearStr ? `${yearStr}-01-01` : ''),
    };

    const grouped: GroupedItem & { type?: string; imdbId?: string; addonName?: string; description?: string } = {
      name: meta.name,
      year: yearStr,
      items: [torrentItem],
    };
    (grouped as any).type = meta.type || 'movie';
    (grouped as any).imdbId = meta.id;
    (grouped as any).addonName = addonName;
    (grouped as any).description = meta.description;
    (grouped as any).poster = meta.poster;
    (grouped as any).imdbRating = meta.imdbRating;
    return grouped;
  }

  /**
   * Fetch streams for a given media from all enabled stream addons
   * GET /stream/{type}/{id}.json
   * (e.g. /stream/movie/tt1375666.json or /stream/series/tt0944947:1:1.json)
   */
  public async fetchStreamsForMedia(type: string, id: string): Promise<StremioStream[]> {
    if (!id) return [];
    const enabled = this.getEnabledAddons();
    const streamAddons = enabled.filter((a) => this.hasResource(a, 'stream'));

    if (streamAddons.length === 0) return [];

    const promises = streamAddons.map(async (addon) => {
      const baseUrl = addon.transportUrl.replace(/\/manifest\.json$/, '');
      const endpoint = `${baseUrl}/stream/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      try {
        const res = await fetch(endpoint, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timer);

        if (!res.ok) return [];
        const data = await res.json();
        const streams: StremioStream[] = (data.streams || []).map((s: any) => ({
          ...s,
          addonName: addon.manifest.name,
        }));
        return streams;
      } catch (err) {
        clearTimeout(timer);
        return [];
      }
    });

    const results = await Promise.allSettled(promises);
    const allStreams: StremioStream[] = [];

    for (const r of results) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        allStreams.push(...r.value);
      }
    }

    return allStreams;
  }

  /**
   * Search across all enabled catalog addons for a search query
   */
  public async searchAllCatalogs(query: string): Promise<GroupedItem[]> {
    const q = query.trim();
    if (!q) return [];

    const catalogs = this.getAvailableCatalogs();
    const enabled = this.getEnabledAddons();
    const results: GroupedItem[] = [];
    const seenIds = new Set<string>();

    const searchPromises = catalogs.slice(0, 4).map(async (cat) => {
      const addon = enabled.find((a) => a.transportUrl === cat.transportUrl);
      if (!addon) return [];
      const metas = await this.fetchCatalogMetas(addon, cat.type, cat.catalogId, 0, q);
      return metas.map((m) => this.metaToGroupedItem(m, cat.addonName));
    });

    const settled = await Promise.allSettled(searchPromises);
    for (const res of settled) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        for (const item of res.value) {
          const id = (item as any).imdbId || item.name;
          if (id && !seenIds.has(id)) {
            seenIds.add(id);
            results.push(item);
          }
        }
      }
    }

    return results;
  }

  // ── Listener subscription ──
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((l) => {
      try {
        l();
      } catch (e) {
        console.error('[AddonService] Listener error:', e);
      }
    });
  }
}

export const addonService = new AddonService();
