import { StorageKeys, storageService } from '@/utils/StorageService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SavedYouTubeItem {
  id: string; // YouTube video ID
  title: string;
  channel: string;
  thumbnail: string;
  duration?: string;
  views?: string;
  published?: string;
  savedAt: number;
}

type YouTubeListListener = (items: SavedYouTubeItem[]) => void;

const YT_SAVED_LIST_KEY = 'yt_saved_list';

class YouTubeListManager {
  private inMemoryList: SavedYouTubeItem[] = [];
  private hasLoaded = false;
  private listeners: Set<YouTubeListListener> = new Set();

  constructor() {
    this.ensureLoaded();
  }

  private ensureLoaded(): void {
    if (!this.hasLoaded) {
      this.inMemoryList = this.readFromStorage();
      this.hasLoaded = true;

      // Hydrate asynchronously from AsyncStorage to guarantee persistence
      AsyncStorage.getItem(YT_SAVED_LIST_KEY)
        .then((raw) => {
          if (raw) {
            try {
              const parsed: SavedYouTubeItem[] = JSON.parse(raw);
              if (Array.isArray(parsed) && parsed.length > 0) {
                this.inMemoryList = parsed;
                this.notifyListeners();
              }
            } catch {}
          }
        })
        .catch(() => {});
    }
  }

  private readFromStorage(): SavedYouTubeItem[] {
    try {
      const raw = storageService.getItem(YT_SAVED_LIST_KEY);
      if (!raw) return [];
      const parsed: SavedYouTubeItem[] = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('[YouTubeListService] Failed to read from storage:', err);
      return [];
    }
  }

  private notifyListeners(): void {
    const snapshot = [...this.inMemoryList];
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.warn('[YouTubeListService] Error in listener:', err);
      }
    });
  }

  private persist(): void {
    const json = JSON.stringify(this.inMemoryList);
    try {
      storageService.setItem(YT_SAVED_LIST_KEY, json);
    } catch (e) {
      console.warn('[YouTubeListService] storageService.setItem error:', e);
    }
    AsyncStorage.setItem(YT_SAVED_LIST_KEY, json).catch((e) => {
      console.warn('[YouTubeListService] AsyncStorage.setItem error:', e);
    });
  }

  // Get full list of saved YouTube videos
  getSavedList(): SavedYouTubeItem[] {
    this.ensureLoaded();
    return [...this.inMemoryList];
  }

  // Check if a video is already saved
  isSaved(id: string): boolean {
    if (!id) return false;
    this.ensureLoaded();
    return this.inMemoryList.some((item) => item.id === id);
  }

  // Save a video
  async saveItem(item: Omit<SavedYouTubeItem, 'savedAt'>): Promise<void> {
    this.ensureLoaded();
    if (this.isSaved(item.id)) return;

    const newItem: SavedYouTubeItem = {
      ...item,
      savedAt: Date.now(),
    };

    this.inMemoryList.unshift(newItem);
    this.notifyListeners();
    this.persist();
  }

  // Remove a video
  async removeItem(id: string): Promise<void> {
    this.ensureLoaded();
    this.inMemoryList = this.inMemoryList.filter((item) => item.id !== id);
    this.notifyListeners();
    this.persist();
  }

  // Toggle save/remove
  async toggleSave(item: Omit<SavedYouTubeItem, 'savedAt'>): Promise<boolean> {
    if (this.isSaved(item.id)) {
      await this.removeItem(item.id);
      return false; // removed
    } else {
      await this.saveItem(item);
      return true; // saved
    }
  }

  // Clear all saved YouTube videos
  async clearAll(): Promise<void> {
    this.ensureLoaded();
    this.inMemoryList = [];
    this.notifyListeners();
    this.persist();
  }

  // Subscribe to real-time changes
  subscribe(listener: YouTubeListListener): () => void {
    this.listeners.add(listener);
    listener([...this.inMemoryList]);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const youTubeListService = new YouTubeListManager();
