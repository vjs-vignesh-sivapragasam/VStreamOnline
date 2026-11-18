import { StorageKeys, storageService } from '@/utils/StorageService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { YouTubeVideoItem } from './YouTubeService';

export interface YouTubeHistoryItem extends YouTubeVideoItem {
  watchedAt: number;
}

type YouTubeHistoryListener = (items: YouTubeHistoryItem[]) => void;
type YouTubeSearchHistoryListener = (searches: string[]) => void;

const YT_WATCH_HISTORY_KEY = StorageKeys.YOUTUBE_WATCH_HISTORY_KEY;
const YT_SEARCH_HISTORY_KEY = StorageKeys.YOUTUBE_SEARCH_HISTORY_KEY;
const MAX_WATCH_HISTORY = 100;
const MAX_SEARCH_HISTORY = 20;

class YouTubeHistoryManager {
  private inMemoryHistory: YouTubeHistoryItem[] = [];
  private inMemorySearches: string[] = [];
  private hasHistoryLoaded = false;
  private hasSearchesLoaded = false;
  private historyListeners: Set<YouTubeHistoryListener> = new Set();
  private searchListeners: Set<YouTubeSearchHistoryListener> = new Set();

  constructor() {
    this.ensureHistoryLoaded();
    this.ensureSearchesLoaded();
  }

  private ensureHistoryLoaded(): void {
    if (!this.hasHistoryLoaded) {
      this.inMemoryHistory = this.readHistoryFromStorage();
      this.hasHistoryLoaded = true;

      AsyncStorage.getItem(YT_WATCH_HISTORY_KEY)
        .then((raw) => {
          if (raw) {
            try {
              const parsed: YouTubeHistoryItem[] = JSON.parse(raw);
              if (Array.isArray(parsed) && parsed.length > 0) {
                this.inMemoryHistory = parsed;
                this.notifyHistoryListeners();
              }
            } catch {}
          }
        })
        .catch(() => {});
    }
  }

  private ensureSearchesLoaded(): void {
    if (!this.hasSearchesLoaded) {
      this.inMemorySearches = this.readSearchesFromStorage();
      this.hasSearchesLoaded = true;

      AsyncStorage.getItem(YT_SEARCH_HISTORY_KEY)
        .then((raw) => {
          if (raw) {
            try {
              const parsed: string[] = JSON.parse(raw);
              if (Array.isArray(parsed) && parsed.length > 0) {
                this.inMemorySearches = parsed;
                this.notifySearchListeners();
              }
            } catch {}
          }
        })
        .catch(() => {});
    }
  }

  private readHistoryFromStorage(): YouTubeHistoryItem[] {
    try {
      const raw = storageService.getItem(YT_WATCH_HISTORY_KEY);
      if (!raw) return [];
      const parsed: YouTubeHistoryItem[] = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('[YouTubeHistoryService] Failed to read history from storage:', err);
      return [];
    }
  }

  private readSearchesFromStorage(): string[] {
    try {
      const raw = storageService.getItem(YT_SEARCH_HISTORY_KEY);
      if (!raw) return [];
      const parsed: string[] = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('[YouTubeHistoryService] Failed to read searches from storage:', err);
      return [];
    }
  }

  private notifyHistoryListeners(): void {
    const snapshot = [...this.inMemoryHistory];
    this.historyListeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.warn('[YouTubeHistoryService] Error in history listener:', err);
      }
    });
  }

  private notifySearchListeners(): void {
    const snapshot = [...this.inMemorySearches];
    this.searchListeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.warn('[YouTubeHistoryService] Error in search listener:', err);
      }
    });
  }

  private persistHistory(): void {
    const json = JSON.stringify(this.inMemoryHistory);
    try {
      storageService.setItem(YT_WATCH_HISTORY_KEY, json);
    } catch (e) {
      console.warn('[YouTubeHistoryService] storageService.setItem error:', e);
    }
    AsyncStorage.setItem(YT_WATCH_HISTORY_KEY, json).catch((e) => {
      console.warn('[YouTubeHistoryService] AsyncStorage.setItem error:', e);
    });
  }

  private persistSearches(): void {
    const json = JSON.stringify(this.inMemorySearches);
    try {
      storageService.setItem(YT_SEARCH_HISTORY_KEY, json);
    } catch (e) {
      console.warn('[YouTubeHistoryService] storageService.setItem error:', e);
    }
    AsyncStorage.setItem(YT_SEARCH_HISTORY_KEY, json).catch((e) => {
      console.warn('[YouTubeHistoryService] AsyncStorage.setItem error:', e);
    });
  }

  // ── Watch History Methods ──────────────────────────────────────────

  getHistory(): YouTubeHistoryItem[] {
    this.ensureHistoryLoaded();
    return [...this.inMemoryHistory];
  }

  async addToHistory(video: {
    id: string;
    title: string;
    channel?: string;
    thumbnail?: string;
    duration?: string;
    views?: string;
    published?: string;
  }): Promise<void> {
    if (!video || !video.id) return;
    this.ensureHistoryLoaded();

    const newItem: YouTubeHistoryItem = {
      id: video.id,
      title: video.title || 'YouTube Video',
      channel: video.channel || 'YouTube',
      thumbnail: video.thumbnail || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
      duration: video.duration,
      views: video.views,
      published: video.published,
      watchedAt: Date.now(),
    };

    // Remove existing entry if already in history so it moves to top
    this.inMemoryHistory = this.inMemoryHistory.filter((item) => item.id !== video.id);
    this.inMemoryHistory.unshift(newItem);

    // Limit to max history items
    if (this.inMemoryHistory.length > MAX_WATCH_HISTORY) {
      this.inMemoryHistory = this.inMemoryHistory.slice(0, MAX_WATCH_HISTORY);
    }

    this.notifyHistoryListeners();
    this.persistHistory();
  }

  async removeFromHistory(id: string): Promise<void> {
    if (!id) return;
    this.ensureHistoryLoaded();
    this.inMemoryHistory = this.inMemoryHistory.filter((item) => item.id !== id);
    this.notifyHistoryListeners();
    this.persistHistory();
  }

  async clearHistory(): Promise<void> {
    this.ensureHistoryLoaded();
    this.inMemoryHistory = [];
    this.notifyHistoryListeners();
    this.persistHistory();
  }

  subscribeHistory(listener: YouTubeHistoryListener): () => void {
    this.historyListeners.add(listener);
    listener([...this.inMemoryHistory]);
    return () => {
      this.historyListeners.delete(listener);
    };
  }

  // ── Search History Methods ─────────────────────────────────────────

  getSearchHistory(): string[] {
    this.ensureSearchesLoaded();
    return [...this.inMemorySearches];
  }

  async addSearchQuery(query: string): Promise<void> {
    const trimmed = query.trim();
    if (!trimmed) return;
    this.ensureSearchesLoaded();

    // Deduplicate case-insensitively
    this.inMemorySearches = this.inMemorySearches.filter(
      (q) => q.toLowerCase() !== trimmed.toLowerCase()
    );
    this.inMemorySearches.unshift(trimmed);

    if (this.inMemorySearches.length > MAX_SEARCH_HISTORY) {
      this.inMemorySearches = this.inMemorySearches.slice(0, MAX_SEARCH_HISTORY);
    }

    this.notifySearchListeners();
    this.persistSearches();
  }

  async removeSearchQuery(query: string): Promise<void> {
    this.ensureSearchesLoaded();
    this.inMemorySearches = this.inMemorySearches.filter(
      (q) => q.toLowerCase() !== query.toLowerCase()
    );
    this.notifySearchListeners();
    this.persistSearches();
  }

  async clearSearchHistory(): Promise<void> {
    this.ensureSearchesLoaded();
    this.inMemorySearches = [];
    this.notifySearchListeners();
    this.persistSearches();
  }

  subscribeSearchHistory(listener: YouTubeSearchHistoryListener): () => void {
    this.searchListeners.add(listener);
    listener([...this.inMemorySearches]);
    return () => {
      this.searchListeners.delete(listener);
    };
  }
}

export const youTubeHistoryService = new YouTubeHistoryManager();
