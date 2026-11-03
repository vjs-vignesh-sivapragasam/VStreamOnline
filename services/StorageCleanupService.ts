import { Paths, Directory, File } from 'expo-file-system';
import { downloadService } from '@/services/DownloadService';
import { myListService } from '@/services/MyListService';
import { youTubeListService } from '@/services/YouTubeListService';
import { tmdbService } from '@/services/TmdbService';

export interface StorageStats {
  tamilmvDownloadsCount: number;
  tamilmvDownloadsBytes: number;
  youtubeDownloadsCount: number;
  youtubeDownloadsBytes: number;
  totalDownloadsBytes: number;
  cacheBytes: number;
  tamilmvMyListCount: number;
  youtubeMyListCount: number;
  totalStorageUsedBytes: number;
}

class StorageCleanupService {
  formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  // Calculate size of a directory recursively
  private calculateDirectorySize(dir: Directory): number {
    let size = 0;
    try {
      if (!dir.exists) return 0;
      const entries = dir.list();
      for (const entry of entries) {
        if (entry instanceof File) {
          size += entry.size || 0;
        } else if (entry instanceof Directory) {
          size += this.calculateDirectorySize(entry);
        }
      }
    } catch {
      // Ignore directory read errors
    }
    return size;
  }

  // Get current storage consumption stats
  async getStorageStats(): Promise<StorageStats> {
    const allDownloads = downloadService.getDownloads();
    const tamilmvDownloads = allDownloads.filter(
      (d) => !d.id.startsWith('yt_') && d.sourceType !== 'direct'
    );
    const youtubeDownloads = allDownloads.filter(
      (d) => d.id.startsWith('yt_') || d.sourceType === 'direct'
    );

    const tamilmvDownloadsBytes = tamilmvDownloads.reduce(
      (acc, cur) => acc + (cur.downloadedBytes || cur.totalBytes || 0),
      0
    );
    const youtubeDownloadsBytes = youtubeDownloads.reduce(
      (acc, cur) => acc + (cur.downloadedBytes || cur.totalBytes || 0),
      0
    );

    let cacheBytes = 0;
    try {
      const cacheDir = new Directory(Paths.cache);
      cacheBytes = this.calculateDirectorySize(cacheDir);
    } catch {
      cacheBytes = 0;
    }

    const tamilmvMyList = myListService.getMyList();
    const youtubeMyList = youTubeListService.getSavedList();

    const totalDownloadsBytes = tamilmvDownloadsBytes + youtubeDownloadsBytes;
    const totalStorageUsedBytes = totalDownloadsBytes + cacheBytes;

    return {
      tamilmvDownloadsCount: tamilmvDownloads.length,
      tamilmvDownloadsBytes,
      youtubeDownloadsCount: youtubeDownloads.length,
      youtubeDownloadsBytes,
      totalDownloadsBytes,
      cacheBytes,
      tamilmvMyListCount: tamilmvMyList.length,
      youtubeMyListCount: youtubeMyList.length,
      totalStorageUsedBytes,
    };
  }

  // Clear application cache (image cache, temp streams, TMDB memory cache)
  async clearCache(): Promise<number> {
    let freedBytes = 0;
    try {
      const cacheDir = new Directory(Paths.cache);
      if (cacheDir.exists) {
        freedBytes = this.calculateDirectorySize(cacheDir);
        const entries = cacheDir.list();
        for (const entry of entries) {
          try {
            entry.delete();
          } catch {}
        }
      }
    } catch (err) {
      console.warn('[StorageCleanupService] Error clearing cache dir:', err);
    }

    // Clear TMDB in-memory cache
    tmdbService.clearCache();

    return freedBytes;
  }

  // Clear TamilMV downloads
  async clearTamilMVDownloads(): Promise<void> {
    await downloadService.clearTamilMVDownloads();
  }

  // Clear YouTube downloads
  async clearYouTubeDownloads(): Promise<void> {
    await downloadService.clearYouTubeDownloads();
  }

  // Clear All downloads
  async clearAllDownloads(): Promise<void> {
    await downloadService.clearAllDownloads();
  }

  // Clear TamilMV Watchlist
  async clearTamilMVMyList(): Promise<void> {
    await myListService.clearAll();
  }

  // Clear YouTube Saved Videos
  async clearYouTubeMyList(): Promise<void> {
    await youTubeListService.clearAll();
  }

  // Clear both MyLists
  async clearAllMyLists(): Promise<void> {
    await Promise.all([
      myListService.clearAll(),
      youTubeListService.clearAll(),
    ]);
  }

  // Clear Everything (Deep Clean: all downloads, cache, and watchlists)
  async clearEverything(): Promise<{ freedBytes: number }> {
    const stats = await this.getStorageStats();
    const freedBytes = stats.totalStorageUsedBytes;

    await Promise.all([
      this.clearAllDownloads(),
      this.clearCache(),
      this.clearAllMyLists(),
    ]);

    return { freedBytes };
  }
}

export const storageCleanupService = new StorageCleanupService();
