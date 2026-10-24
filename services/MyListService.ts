import { StorageKeys, storageService } from '@/utils/StorageService';
import { TorrentItem } from '@/hooks/useTamilMv';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MyListItem {
  id: string; // unique identifier (title or groupid or infoHash)
  title: string;
  poster: string;
  publishDate?: string;
  type?: 'movie' | 'series' | string;
  guid?: string;
  groupid?: string;
  infoHash?: string;
  magnetUrl?: string;
  allItems?: TorrentItem[];
  addedAt: number;
}

type MyListListener = (items: MyListItem[]) => void;

class MyListManager {
  private inMemoryList: MyListItem[] = [];
  private hasLoaded = false;
  private listeners: Set<MyListListener> = new Set();

  constructor() {
    this.ensureLoaded();
  }

  private ensureLoaded(): void {
    if (!this.hasLoaded) {
      this.inMemoryList = this.readFromStorage();
      this.hasLoaded = true;

      // Also hydrate asynchronously from AsyncStorage to guarantee persistence
      AsyncStorage.getItem(StorageKeys.MY_LIST_KEY)
        .then((raw) => {
          if (raw) {
            try {
              const parsed: MyListItem[] = JSON.parse(raw);
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

  private readFromStorage(): MyListItem[] {
    try {
      const raw = storageService.getItem(StorageKeys.MY_LIST_KEY);
      if (!raw) return [];
      const parsed: MyListItem[] = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('[MyListService] Failed to read MyList from storage:', err);
      return [];
    }
  }

  private notifyListeners(): void {
    const snapshot = [...this.inMemoryList];
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.warn('[MyListService] Error in listener:', err);
      }
    });
  }

  private persist(): void {
    const json = JSON.stringify(this.inMemoryList);
    try {
      storageService.setItem(StorageKeys.MY_LIST_KEY, json);
    } catch (e) {
      console.warn('[MyListService] storageService.setItem error:', e);
    }
    AsyncStorage.setItem(StorageKeys.MY_LIST_KEY, json).catch((e) => {
      console.warn('[MyListService] AsyncStorage.setItem error:', e);
    });
  }

  // Get full list of bookmarked movies
  getMyList(): MyListItem[] {
    this.ensureLoaded();
    return [...this.inMemoryList];
  }

  // Check if an item is already in MyList (matches by id, title, or infoHash)
  isInMyList(idOrTitle?: string | null): boolean {
    if (!idOrTitle) return false;
    this.ensureLoaded();
    const cleanQuery = idOrTitle.trim().toLowerCase();
    return this.inMemoryList.some(
      (item) =>
        item.id.toLowerCase() === cleanQuery ||
        item.title.toLowerCase() === cleanQuery ||
        (item.infoHash && item.infoHash.toLowerCase() === cleanQuery) ||
        (item.groupid && item.groupid.toLowerCase() === cleanQuery)
    );
  }

  // Add a movie to MyList
  async addToMyList(item: Omit<MyListItem, 'addedAt'>): Promise<void> {
    this.ensureLoaded();
    if (this.isInMyList(item.id) || this.isInMyList(item.title)) {
      return;
    }

    const newItem: MyListItem = {
      ...item,
      addedAt: Date.now(),
    };

    this.inMemoryList.unshift(newItem);
    this.notifyListeners();
    this.persist();
  }

  // Remove a movie from MyList
  async removeFromMyList(idOrTitle: string): Promise<void> {
    this.ensureLoaded();
    const cleanQuery = idOrTitle.trim().toLowerCase();
    this.inMemoryList = this.inMemoryList.filter(
      (item) =>
        item.id.toLowerCase() !== cleanQuery &&
        item.title.toLowerCase() !== cleanQuery &&
        (!item.infoHash || item.infoHash.toLowerCase() !== cleanQuery) &&
        (!item.groupid || item.groupid.toLowerCase() !== cleanQuery)
    );
    this.notifyListeners();
    this.persist();
  }

  // Toggle in/out of MyList
  async toggleMyList(item: Omit<MyListItem, 'addedAt'>): Promise<boolean> {
    if (this.isInMyList(item.id) || this.isInMyList(item.title)) {
      await this.removeFromMyList(item.id || item.title);
      return false; // removed
    } else {
      await this.addToMyList(item);
      return true; // added
    }
  }

  // Subscribe to changes in real-time
  subscribe(listener: MyListListener): () => void {
    this.listeners.add(listener);
    this.ensureLoaded();
    listener([...this.inMemoryList]);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const myListService = new MyListManager();
