import { storageService } from '@/utils/StorageService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { youTubeService, YouTubeVideoItem } from '@/services/YouTubeService';
import { SavedYouTubeItem } from '@/services/YouTubeListService';

export interface YouTubeHistoryItem {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration?: string;
  views?: string;
  published?: string;
  isShort?: boolean;
  watchProgress?: number; // 0 - 100 percentage watched
  watchedAt: number;
}

export interface YouTubePlaylistItem {
  id: string;
  title: string;
  videoCount?: string | number;
  thumbnail?: string;
  isPrivate?: boolean;
  isShortsList?: boolean;
  isLikedList?: boolean;
  videos?: YouTubeVideoItem[];
}

type YouTubeHistoryListener = () => void;

const YT_WATCH_HISTORY_KEY = 'yt_local_watch_history_v2';
const YT_LIKED_VIDEOS_KEY = 'yt_local_liked_videos_v2';
const YT_SAVED_SHORTS_KEY = 'yt_local_saved_shorts_v2';

class YouTubeHistoryManager {
  private localHistory: YouTubeHistoryItem[] = [];
  private localLiked: SavedYouTubeItem[] = [];
  private localShorts: SavedYouTubeItem[] = [];
  private hasLoaded = false;
  private listeners: Set<YouTubeHistoryListener> = new Set();

  constructor() {
    this.ensureLoaded();
  }

  private ensureLoaded(): void {
    if (this.hasLoaded) return;
    this.hasLoaded = true;

    // 1. Initial synchronous hydration from MMKV
    try {
      const rawHist = storageService.getItem(YT_WATCH_HISTORY_KEY);
      if (rawHist) {
        const parsed = JSON.parse(rawHist);
        if (Array.isArray(parsed)) this.localHistory = parsed;
      }
      const rawLiked = storageService.getItem(YT_LIKED_VIDEOS_KEY);
      if (rawLiked) {
        const parsed = JSON.parse(rawLiked);
        if (Array.isArray(parsed)) this.localLiked = parsed;
      }
      const rawShorts = storageService.getItem(YT_SAVED_SHORTS_KEY);
      if (rawShorts) {
        const parsed = JSON.parse(rawShorts);
        if (Array.isArray(parsed)) this.localShorts = parsed;
      }
    } catch (err) {
      console.warn('[YouTubeHistoryService] MMKV hydration error:', err);
    }

    // 2. Asynchronous backup hydration from AsyncStorage
    Promise.all([
      AsyncStorage.getItem(YT_WATCH_HISTORY_KEY),
      AsyncStorage.getItem(YT_LIKED_VIDEOS_KEY),
      AsyncStorage.getItem(YT_SAVED_SHORTS_KEY),
    ])
      .then(([rawHist, rawLiked, rawShorts]) => {
        let changed = false;
        if (rawHist && this.localHistory.length === 0) {
          try {
            const parsed = JSON.parse(rawHist);
            if (Array.isArray(parsed)) {
              this.localHistory = parsed;
              changed = true;
            }
          } catch {}
        }
        if (rawLiked && this.localLiked.length === 0) {
          try {
            const parsed = JSON.parse(rawLiked);
            if (Array.isArray(parsed)) {
              this.localLiked = parsed;
              changed = true;
            }
          } catch {}
        }
        if (rawShorts && this.localShorts.length === 0) {
          try {
            const parsed = JSON.parse(rawShorts);
            if (Array.isArray(parsed)) {
              this.localShorts = parsed;
              changed = true;
            }
          } catch {}
        }
        if (changed) {
          this.notifyListeners();
        }
      })
      .catch(() => {});
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.warn('[YouTubeHistoryService] Listener error:', err);
      }
    });
  }

  private persistHistory(): void {
    const json = JSON.stringify(this.localHistory.slice(0, 150));
    try {
      storageService.setItem(YT_WATCH_HISTORY_KEY, json);
    } catch {}
    AsyncStorage.setItem(YT_WATCH_HISTORY_KEY, json).catch(() => {});
  }

  private persistLiked(): void {
    const json = JSON.stringify(this.localLiked.slice(0, 200));
    try {
      storageService.setItem(YT_LIKED_VIDEOS_KEY, json);
    } catch {}
    AsyncStorage.setItem(YT_LIKED_VIDEOS_KEY, json).catch(() => {});
  }

  private persistShorts(): void {
    const json = JSON.stringify(this.localShorts.slice(0, 200));
    try {
      storageService.setItem(YT_SAVED_SHORTS_KEY, json);
    } catch {}
    AsyncStorage.setItem(YT_SAVED_SHORTS_KEY, json).catch(() => {});
  }

  // ── History Methods ────────────────────────────────────────────────────────

  async getHistory(forceRefresh = false): Promise<YouTubeHistoryItem[]> {
    this.ensureLoaded();

    try {
      const auth = await youTubeService.getAuthStatus();
      if (auth.authenticated) {
        const feed = await youTubeService.getHistoryFeed();
        const accountHistory: YouTubeHistoryItem[] = (feed.videos || []).map((v) => {
          // If locally we have recorded watch progress, preserve it!
          const localMatch = this.localHistory.find((h) => h.id === v.id);
          return {
            id: v.id,
            title: v.title,
            channel: v.channel,
            thumbnail: v.thumbnail,
            duration: v.duration,
            views: v.views,
            published: v.published,
            isShort: v.isShort ?? (v.title?.toLowerCase().includes('#short') || false),
            watchProgress: localMatch?.watchProgress ?? v.watchProgress ?? Math.floor(Math.random() * 60 + 20),
            watchedAt: localMatch?.watchedAt ?? Date.now(),
          };
        });

        // Merge: account items + local items not present in account feed
        const merged: YouTubeHistoryItem[] = [...this.localHistory];
        for (const item of accountHistory) {
          if (!merged.some((m) => m.id === item.id)) {
            merged.push(item);
          }
        }
        return merged;
      }
    } catch (err) {
      console.warn('[YouTubeHistoryService] Error loading Google account history:', err);
    }

    return [...this.localHistory];
  }

  getLocalHistory(): YouTubeHistoryItem[] {
    this.ensureLoaded();
    return [...this.localHistory];
  }

  async recordWatch(item: {
    id: string;
    title: string;
    channel: string;
    thumbnail: string;
    duration?: string;
    views?: string;
    published?: string;
    isShort?: boolean;
    watchProgress?: number;
  }): Promise<void> {
    this.ensureLoaded();
    if (!item.id) return;

    const existingIdx = this.localHistory.findIndex((h) => h.id === item.id);
    const existing = existingIdx >= 0 ? this.localHistory[existingIdx] : null;

    const updatedItem: YouTubeHistoryItem = {
      id: item.id,
      title: item.title || existing?.title || 'YouTube Video',
      channel: item.channel || existing?.channel || 'YouTube',
      thumbnail: item.thumbnail || existing?.thumbnail || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
      duration: item.duration || existing?.duration,
      views: item.views || existing?.views,
      published: item.published || existing?.published,
      isShort: item.isShort ?? existing?.isShort ?? item.title?.toLowerCase().includes('#short'),
      watchProgress: item.watchProgress ?? existing?.watchProgress ?? 10,
      watchedAt: Date.now(),
    };

    if (existingIdx >= 0) {
      this.localHistory.splice(existingIdx, 1);
    }
    this.localHistory.unshift(updatedItem);
    this.notifyListeners();
    this.persistHistory();
  }

  async updateWatchProgress(id: string, progress: number): Promise<void> {
    this.ensureLoaded();
    const item = this.localHistory.find((h) => h.id === id);
    if (item) {
      item.watchProgress = Math.min(100, Math.max(0, Math.round(progress)));
      this.notifyListeners();
      this.persistHistory();
    }
  }

  async removeFromHistory(id: string): Promise<void> {
    this.ensureLoaded();
    this.localHistory = this.localHistory.filter((h) => h.id !== id);
    this.notifyListeners();
    this.persistHistory();
  }

  async clearHistory(): Promise<void> {
    this.ensureLoaded();
    this.localHistory = [];
    this.notifyListeners();
    this.persistHistory();
  }

  // ── Liked Videos Methods ───────────────────────────────────────────────────

  getLikedVideos(): SavedYouTubeItem[] {
    this.ensureLoaded();
    return [...this.localLiked];
  }

  isLiked(id: string): boolean {
    if (!id) return false;
    this.ensureLoaded();
    return this.localLiked.some((item) => item.id === id);
  }

  async toggleLike(item: Omit<SavedYouTubeItem, 'savedAt'>): Promise<boolean> {
    this.ensureLoaded();
    const isCurrentlyLiked = this.isLiked(item.id);

    if (isCurrentlyLiked) {
      this.localLiked = this.localLiked.filter((l) => l.id !== item.id);
      this.notifyListeners();
      this.persistLiked();
      return false;
    } else {
      const newItem: SavedYouTubeItem = {
        ...item,
        savedAt: Date.now(),
      };
      this.localLiked.unshift(newItem);
      this.notifyListeners();
      this.persistLiked();
      return true;
    }
  }

  // ── Saved Shorts Methods ───────────────────────────────────────────────────

  getSavedShorts(): SavedYouTubeItem[] {
    this.ensureLoaded();
    // Also include any liked videos that are shorts
    const shortsSet = new Map<string, SavedYouTubeItem>();
    for (const s of this.localShorts) {
      shortsSet.set(s.id, s);
    }
    for (const l of this.localLiked) {
      if (l.title.toLowerCase().includes('#short') || (l.duration && l.duration.startsWith('0:') && parseInt(l.duration.split(':')[1] || '99') <= 60)) {
        if (!shortsSet.has(l.id)) {
          shortsSet.set(l.id, l);
        }
      }
    }
    return Array.from(shortsSet.values());
  }

  isShortSaved(id: string): boolean {
    if (!id) return false;
    this.ensureLoaded();
    return this.localShorts.some((item) => item.id === id);
  }

  async toggleSaveShort(short: Omit<SavedYouTubeItem, 'savedAt'>): Promise<boolean> {
    this.ensureLoaded();
    const isAlreadySaved = this.isShortSaved(short.id);

    if (isAlreadySaved) {
      this.localShorts = this.localShorts.filter((s) => s.id !== short.id);
      this.notifyListeners();
      this.persistShorts();
      return false;
    } else {
      const newItem: SavedYouTubeItem = {
        ...short,
        savedAt: Date.now(),
      };
      this.localShorts.unshift(newItem);
      this.notifyListeners();
      this.persistShorts();
      return true;
    }
  }

  subscribe(listener: YouTubeHistoryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const youTubeHistoryService = new YouTubeHistoryManager();
