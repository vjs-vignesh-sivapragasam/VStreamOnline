import { Paths, Directory, File, DownloadTask, DownloadProgress } from 'expo-file-system';
import { Alert, Share, Platform } from 'react-native';
import { StorageKeys, storageService } from '@/utils/StorageService';
import { getDevHostIp, youTubeService } from '@/services/YouTubeService';
import {
  StreamingServerClient,
  TorrentStats,
  getActiveStreamingClient,
  resolveStreamingServerClient,
} from '@/clients/stremio';

export interface DownloadItem {
  id: string; // e.g. `${infoHash}_${fileIdx}`
  title: string;
  poster: string;
  infoHash: string;
  fileIdx: number;
  fileName: string;
  fileUri: string; // Local device file:/// URI
  streamUrl: string;
  totalBytes: number;
  downloadedBytes: number;
  progress: number; // 0 to 100
  status: 'downloading' | 'paused' | 'completed' | 'error';
  statusDetail?: string; // Descriptive real-time state for UI diagnostic
  speedBps: number;
  speedFormatted: string; // e.g. "2.4 MB/s" or "820 KB/s"
  peers: number; // Connected peers
  errorMessage?: string;
  createdAt: number;
  sourceType?: 'torrent' | 'direct';
}

type DownloadListener = (items: DownloadItem[]) => void;

class DownloadManager {
  private inMemoryDownloads: DownloadItem[] = [];
  private hasLoadedFromStorage = false;
  private activeTasks: Map<string, DownloadTask> = new Map();
  private listeners: Set<DownloadListener> = new Set();
  private statsIntervals: Map<string, NodeJS.Timeout> = new Map();
  private persistTimeout: NodeJS.Timeout | null = null;
  private lastPersistTime = 0;

  // Get or create the downloads directory in internal document storage
  getDownloadsDirectory(): Directory {
    const dir = new Directory(Paths.document, 'downloads');
    if (!dir.exists) {
      try {
        dir.create();
      } catch (err) {
        console.warn('[DownloadService] Failed to create downloads directory:', err);
      }
    }
    return dir;
  }

  private ensureLoaded(): void {
    if (!this.hasLoadedFromStorage) {
      this.inMemoryDownloads = this.readFromStorage();
      this.hasLoadedFromStorage = true;
    }
  }

  private readFromStorage(): DownloadItem[] {
    try {
      const raw = storageService.getItem(StorageKeys.DOWNLOADS_KEY);
      if (!raw) return [];
      const parsed: DownloadItem[] = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('[DownloadService] Error reading downloads from storage:', err);
      return [];
    }
  }

  // Retrieve all downloads from memory cache (fast, non-blocking)
  getDownloads(): DownloadItem[] {
    this.ensureLoaded();
    return this.inMemoryDownloads;
  }

  // Subscribe to download updates
  addListener(listener: DownloadListener): () => void {
    this.listeners.add(listener);
    this.ensureLoaded();
    listener([...this.inMemoryDownloads]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // In-memory synchronous UI broadcast (0 latency, 60fps)
  private notifyListeners(): void {
    this.ensureLoaded();
    const snapshot = [...this.inMemoryDownloads];
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.warn('[DownloadService] Error in download listener:', err);
      }
    });
  }

  // Immediate persistence on user actions or completion
  private persistDownloadsImmediately(): void {
    if (this.persistTimeout) {
      clearTimeout(this.persistTimeout);
      this.persistTimeout = null;
    }
    this.lastPersistTime = Date.now();
    try {
      storageService.setItem(StorageKeys.DOWNLOADS_KEY, JSON.stringify(this.inMemoryDownloads));
    } catch (err) {
      console.warn('[DownloadService] Error saving downloads to storage:', err);
    }
  }

  // Throttled persistence (max once every 4 seconds during active downloading)
  private persistDownloadsThrottled(): void {
    const now = Date.now();
    if (now - this.lastPersistTime > 4000) {
      this.persistDownloadsImmediately();
      return;
    }
    if (!this.persistTimeout) {
      this.persistTimeout = setTimeout(() => {
        this.persistTimeout = null;
        this.persistDownloadsImmediately();
      }, 4000);
    }
  }

  // Check if a specific item is already downloaded or downloading
  getDownload(infoHash: string, fileIdx: number = 0): DownloadItem | undefined {
    this.ensureLoaded();
    const id = `${infoHash}_${fileIdx}`;
    return this.inMemoryDownloads.find((d) => d.id === id);
  }

  // Format speed into KB/s or MB/s
  formatSpeed(bytesPerSecond: number): string {
    if (!bytesPerSecond || bytesPerSecond <= 0) return '0 KB/s';
    if (bytesPerSecond >= 1e6) {
      return `${(bytesPerSecond / 1e6).toFixed(1)} MB/s`;
    }
    return `${Math.round(bytesPerSecond / 1e3)} KB/s`;
  }

  // Format file sizes (bytes to MB / GB)
  formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
    return `${bytes} B`;
  }

  // Check remaining device storage in bytes
  getFreeDiskSpace(): number {
    try {
      return Paths.availableDiskSpace;
    } catch {
      return 0;
    }
  }

  private stopTracking(id: string): void {
    if (this.statsIntervals.has(id)) {
      clearInterval(this.statsIntervals.get(id));
      this.statsIntervals.delete(id);
    }
    if (this.activeTasks.has(id)) {
      try {
        this.activeTasks.get(id)?.cancel();
      } catch {}
      this.activeTasks.delete(id);
    }
  }

  // Apply swarm statistics from Stremio engine to download item
  private applyStatsToItem(item: DownloadItem, stats: TorrentStats): void {
    let updated = false;

    if (stats.peers !== undefined && stats.peers !== item.peers) {
      item.peers = stats.peers;
      updated = true;
    }

    if (stats.downloadSpeed !== undefined && stats.downloadSpeed > 0) {
      item.speedBps = stats.downloadSpeed;
      item.speedFormatted = this.formatSpeed(stats.downloadSpeed);
      updated = true;
    }

    if (stats.streamLen !== undefined && stats.streamLen > 0 && item.totalBytes === 0) {
      item.totalBytes = stats.streamLen;
      updated = true;
    }

    if (stats.streamProgress !== undefined && stats.streamProgress >= 0) {
      const swarmPct = Math.min(Math.round(stats.streamProgress * 100), 100);
      if (swarmPct > item.progress) {
        item.progress = swarmPct;
        updated = true;
      }
      if (item.totalBytes > 0) {
        const calculatedBytes = Math.round((item.progress / 100) * item.totalBytes);
        if (calculatedBytes > item.downloadedBytes) {
          item.downloadedBytes = calculatedBytes;
          updated = true;
        }
      }
    } else if (stats.downloaded !== undefined && stats.downloaded > item.downloadedBytes) {
      item.downloadedBytes = stats.downloaded;
      if (item.totalBytes > 0) {
        const calcPct = Math.min(Math.round((item.downloadedBytes / item.totalBytes) * 100), 100);
        if (calcPct > item.progress) item.progress = calcPct;
      }
      updated = true;
    }

    // Dynamic descriptive diagnostic for user
    if (item.progress >= 100) {
      item.status = 'completed';
      item.statusDetail = 'Download complete';
      updated = true;
    } else if (item.peers === 0) {
      item.statusDetail = 'Searching for swarm peers (0 peers)...';
      updated = true;
    } else if (item.progress === 0 && item.downloadedBytes === 0) {
      item.statusDetail = `Buffering swarm (${item.peers} peers)...`;
      updated = true;
    } else if (item.progress > 0) {
      item.statusDetail = `Downloading (${item.peers} peers)`;
      updated = true;
    }

    if (updated) {
      this.notifyListeners();
      this.persistDownloadsThrottled();
    }
  }

  // Update item poster (e.g. resolved from TMDB or page extraction in background)
  updateItemPoster(infoHash: string, poster: string): void {
    if (!poster || !poster.trim()) return;
    this.ensureLoaded();
    let changed = false;
    this.inMemoryDownloads.forEach((item) => {
      if (item.infoHash.toLowerCase() === infoHash.toLowerCase()) {
        if (!item.poster || item.poster.trim() === '' || item.poster !== poster) {
          item.poster = poster;
          changed = true;
        }
      }
    });

    if (changed) {
      this.notifyListeners();
      this.persistDownloadsImmediately();
    }
  }

  // Update item metadata when file list resolves in background
  updateItemMetadata(infoHash: string, fileIdx: number, fileName?: string, fileLength?: number, poster?: string): void {
    this.ensureLoaded();
    const id = `${infoHash}_${fileIdx}`;
    const item = this.inMemoryDownloads.find((d) => d.id === id);
    if (!item) return;

    let changed = false;
    if (poster && (!item.poster || item.poster.trim() === '')) {
      item.poster = poster;
      changed = true;
    }
    if (fileName && fileName !== item.fileName) {
      item.fileName = fileName;
      changed = true;
    }
    if (fileLength && fileLength > 0 && item.totalBytes === 0) {
      item.totalBytes = fileLength;
      if (item.downloadedBytes > 0) {
        item.progress = Math.min(Math.round((item.downloadedBytes / item.totalBytes) * 100), 100);
      }
      changed = true;
    }

    if (changed) {
      this.notifyListeners();
      this.persistDownloadsThrottled();
    }
  }

  // Start or resume a download with instant UI response and live speed/peer/progress tracking
  async startDownload(params: {
    infoHash: string;
    fileIdx: number;
    title: string;
    poster: string;
    fileName: string;
    streamUrl: string;
    fileLength?: number;
  }): Promise<DownloadItem> {
    this.ensureLoaded();
    const downloadsDir = this.getDownloadsDirectory();
    const id = `${params.infoHash}_${params.fileIdx}`;
    let item = this.inMemoryDownloads.find((d) => d.id === id);

    const sanitizedFileName = (params.fileName || `${params.title}.mp4`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetFile = new File(downloadsDir, `${id}_${sanitizedFileName}`);

    if (!item) {
      item = {
        id,
        title: params.title,
        poster: params.poster || '',
        infoHash: params.infoHash,
        fileIdx: params.fileIdx,
        fileName: params.fileName || `${params.title}.mp4`,
        fileUri: targetFile.uri,
        streamUrl: params.streamUrl,
        totalBytes: params.fileLength || 0,
        downloadedBytes: 0,
        progress: 0,
        status: 'downloading',
        statusDetail: 'Connecting to streaming engine...',
        speedBps: 0,
        speedFormatted: '0 KB/s',
        peers: 0,
        createdAt: Date.now(),
      };
      this.inMemoryDownloads.unshift(item);
    } else {
      item.status = 'downloading';
      item.statusDetail = 'Connecting to streaming engine...';
      item.streamUrl = params.streamUrl;
      item.fileUri = targetFile.uri;
      if (params.poster && (!item.poster || item.poster.trim() === '')) item.poster = params.poster;
      if (params.fileLength && params.fileLength > 0) item.totalBytes = params.fileLength;
      item.speedBps = 0;
      item.speedFormatted = '0 KB/s';
      item.errorMessage = undefined;
    }

    // Instantly notify listeners and persist so the UI responds immediately (<10ms)
    this.notifyListeners();
    this.persistDownloadsImmediately();

    this.stopTracking(id);

    const client = await resolveStreamingServerClient();
    const isOnline = await client.isServerOnline(2000);
    if (!isOnline && item!.status === 'downloading') {
      item!.status = 'error';
      item!.statusDetail = `Server offline (${client.getBaseURL()})`;
      item!.errorMessage = `Cannot connect to streaming server at ${client.getBaseURL()}. Run 'npm run server' in a terminal on your computer, or check Settings > Streaming Server.`;
      this.notifyListeners();
      this.persistDownloadsImmediately();
      return item;
    }

    // Update streamUrl with resolved active server
    const activeStreamUrl = await client.getStreamingURL(params.infoHash, params.fileIdx);
    item.streamUrl = activeStreamUrl;

    // Check initial torrent stats
    try {
      const stats = await client.getTorrentStats(params.infoHash, params.fileIdx);
      if (stats && item!.status === 'downloading') {
        this.applyStatsToItem(item!, stats);
      }
    } catch {}

    // Poll torrent stats from Stremio engine every 1500ms
    const statsTimer = setInterval(async () => {
      try {
        const stats = await client.getTorrentStats(params.infoHash, params.fileIdx);
        if (stats && item!.status === 'downloading') {
          this.applyStatsToItem(item!, stats);
        }
      } catch {}
    }, 1500);

    this.statsIntervals.set(id, statsTimer);

    // Track download progress from native download task using sessionType: 'foreground'
    let lastProgressBytes = item.downloadedBytes;
    let lastProgressTime = Date.now();

    const task = new DownloadTask(activeStreamUrl, targetFile, {
      sessionType: 'foreground',
      onProgress: (progressData: DownloadProgress) => {
        if (item!.status !== 'downloading') return;
        const now = Date.now();
        const downloaded = progressData.bytesWritten;

        if (downloaded > item!.downloadedBytes) {
          item!.downloadedBytes = downloaded;
        }
        if (progressData.totalBytes > 0) {
          item!.totalBytes = progressData.totalBytes;
        }

        if (item!.totalBytes > 0) {
          const httpPct = Math.min(Math.round((item!.downloadedBytes / item!.totalBytes) * 100), 100);
          if (httpPct > item!.progress) {
            item!.progress = httpPct;
          }
        }

        // Calculate transfer speed in bytes per second
        const timeDiff = Math.max((now - lastProgressTime) / 1000, 0.1);
        const bytesDiff = Math.max(downloaded - lastProgressBytes, 0);
        const speed = Math.round(bytesDiff / timeDiff);
        lastProgressBytes = downloaded;
        lastProgressTime = now;

        if (speed > 0) {
          item!.speedBps = speed;
          item!.speedFormatted = this.formatSpeed(speed);
        }

        if (item!.progress > 0) {
          item!.statusDetail = item!.peers > 0 ? `Downloading (${item!.peers} peers)` : 'Downloading...';
        }

        this.notifyListeners();
        this.persistDownloadsThrottled();
      },
    });

    this.activeTasks.set(id, task);

    // Run the download asynchronously
    task
      .downloadAsync()
      .then((fileResult: File | null) => {
        this.activeTasks.delete(id);
        this.stopTracking(id);

        if (fileResult && fileResult.exists) {
          item!.status = 'completed';
          item!.progress = 100;
          item!.statusDetail = 'Download complete';
          item!.speedBps = 0;
          item!.speedFormatted = '';
          if (fileResult.size) {
            item!.downloadedBytes = fileResult.size;
            item!.totalBytes = fileResult.size;
          }
        } else if (item!.status !== 'paused') {
          item!.status = 'error';
          item!.statusDetail = 'Download did not complete';
          item!.errorMessage = 'Download did not complete';
        }
        this.notifyListeners();
        this.persistDownloadsImmediately();
      })
      .catch((err: any) => {
        this.activeTasks.delete(id);
        this.stopTracking(id);

        if (item!.status !== 'paused') {
          item!.status = 'error';
          const msg = err?.message || 'Download error';
          item!.statusDetail = msg.includes('connect') ? `Server unreachable (${client.getBaseURL()})` : msg;
          item!.errorMessage = msg;
          this.notifyListeners();
          this.persistDownloadsImmediately();
        }
      });

    return item;
  }

  // Start or resume a direct URL download (e.g. YouTube MP4 / M4A) with zero torrent dependencies
  async startDirectDownload(params: {
    id: string;
    title: string;
    poster: string;
    fileName: string;
    streamUrl: string;
    fileLength?: number;
  }): Promise<DownloadItem> {
    this.ensureLoaded();
    const downloadsDir = this.getDownloadsDirectory();
    const id = params.id;
    let item = this.inMemoryDownloads.find((d) => d.id === id);

    const sanitizedFileName = (params.fileName || `${params.title}.mp4`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetFile = new File(downloadsDir, `${id}_${sanitizedFileName}`);

    if (!item) {
      item = {
        id,
        title: params.title,
        poster: params.poster || '',
        infoHash: '',
        fileIdx: 0,
        fileName: params.fileName || `${params.title}.mp4`,
        fileUri: targetFile.uri,
        streamUrl: params.streamUrl,
        totalBytes: params.fileLength || 0,
        downloadedBytes: 0,
        progress: 0,
        status: 'downloading',
        statusDetail: 'Starting download...',
        speedBps: 0,
        speedFormatted: '0 KB/s',
        peers: 0,
        createdAt: Date.now(),
        sourceType: 'direct',
      };
      this.inMemoryDownloads.unshift(item);
    } else {
      item.status = 'downloading';
      item.statusDetail = 'Resuming download...';
      item.streamUrl = params.streamUrl;
      item.fileUri = targetFile.uri;
      if (params.poster && (!item.poster || item.poster.trim() === '')) item.poster = params.poster;
      if (params.fileLength && params.fileLength > 0) item.totalBytes = params.fileLength;
      item.speedBps = 0;
      item.speedFormatted = '0 KB/s';
      item.errorMessage = undefined;
      item.sourceType = 'direct';
    }

    this.notifyListeners();
    this.persistDownloadsImmediately();

    this.stopTracking(id);

    let lastProgressBytes = item.downloadedBytes;
    let lastProgressTime = Date.now();

    let downloadUrl = params.streamUrl;
    let directUrl = downloadUrl;

    if (downloadUrl.includes('/yt/proxy-stream')) {
      try {
        const u = new URL(downloadUrl);
        const raw = u.searchParams.get('url');
        if (raw) directUrl = decodeURIComponent(raw);
      } catch {}
    }

    const isGoogleVideo = directUrl.includes('googlevideo.com');
    const isAdaptiveOrAudio = directUrl.includes('mime=audio') || !directUrl.includes('ratebypass=yes') || params.fileName?.endsWith('.mp3');

    // Use fast chunked proxy for adaptive/audio streams (Google CDN throttles unchunked adaptive streams)
    let targetDownloadUrl = downloadUrl;
    if (isGoogleVideo) {
      if (isAdaptiveOrAudio) {
        const base = youTubeService.getActiveBaseUrl() || (getDevHostIp() ? `http://${getDevHostIp()}:11472` : 'http://127.0.0.1:11472');
        targetDownloadUrl = `${base}/yt/proxy-stream?url=${encodeURIComponent(directUrl)}`;
      } else {
        targetDownloadUrl = directUrl;
      }
    }
    item.streamUrl = targetDownloadUrl;

    const isIosClient = directUrl.includes('c=IOS');
    const directHeaders = isGoogleVideo && targetDownloadUrl === directUrl
      ? {
          'User-Agent': isIosClient
            ? 'com.google.ios.youtube/19.29.1 (iPhone14,3; U; CPU OS 17_5_1 like Mac OS X)'
            : 'com.google.android.youtube/19.29.37 (Linux; U; Android 11)',
          'Accept': '*/*',
        }
      : undefined;

    const task = new DownloadTask(targetDownloadUrl, targetFile, {
      sessionType: 'foreground',
      headers: directHeaders,
      onProgress: (progressData: DownloadProgress) => {
        if (item!.status !== 'downloading') return;
        const now = Date.now();
        const downloaded = progressData.bytesWritten;

        if (downloaded > item!.downloadedBytes) {
          item!.downloadedBytes = downloaded;
        }
        if (progressData.totalBytes > 0) {
          item!.totalBytes = progressData.totalBytes;
        }

        if (item!.totalBytes > 0) {
          const pct = Math.min(Math.round((item!.downloadedBytes / item!.totalBytes) * 100), 100);
          if (pct > item!.progress) {
            item!.progress = pct;
          }
        }

        const timeDiff = Math.max((now - lastProgressTime) / 1000, 0.1);
        const bytesDiff = Math.max(downloaded - lastProgressBytes, 0);
        const speed = Math.round(bytesDiff / timeDiff);
        lastProgressBytes = downloaded;
        lastProgressTime = now;

        if (speed > 0) {
          item!.speedBps = speed;
          item!.speedFormatted = this.formatSpeed(speed);
        }

        item!.statusDetail = `Downloading (${item!.progress}%)`;

        this.notifyListeners();
        this.persistDownloadsThrottled();
      },
    });

    this.activeTasks.set(id, task);

    task
      .downloadAsync()
      .then((fileResult: File | null) => {
        this.activeTasks.delete(id);
        this.stopTracking(id);

        if (fileResult && fileResult.exists) {
          item!.status = 'completed';
          item!.progress = 100;
          item!.statusDetail = 'Download complete';
          item!.speedBps = 0;
          item!.speedFormatted = '';
          if (fileResult.size) {
            item!.downloadedBytes = fileResult.size;
            item!.totalBytes = fileResult.size;
          }
        } else if (item!.status !== 'paused') {
          item!.status = 'error';
          item!.statusDetail = 'Download did not complete';
          item!.errorMessage = 'Download did not complete';
        }
        this.notifyListeners();
        this.persistDownloadsImmediately();
      })
      .catch(async (err: any) => {
        // Fallback: If direct Google Video CDN download failed, attempt retry via local proxy if available
        if (isGoogleVideo && targetDownloadUrl === directUrl) {
          try {
            const devIp = getDevHostIp();
            const base = youTubeService.getActiveBaseUrl() || (devIp ? `http://${devIp}:11472` : 'http://127.0.0.1:11472');
            const proxyFallbackUrl = `${base}/yt/proxy-stream?url=${encodeURIComponent(directUrl)}`;
            console.log('[DownloadService] Direct download failed, attempting proxy fallback:', err?.message);

            const retryTask = new DownloadTask(proxyFallbackUrl, targetFile, {
              sessionType: 'foreground',
              onProgress: (progressData: DownloadProgress) => {
                if (item!.status !== 'downloading') return;
                const downloaded = progressData.bytesWritten;
                if (downloaded > item!.downloadedBytes) item!.downloadedBytes = downloaded;
                if (progressData.totalBytes > 0) item!.totalBytes = progressData.totalBytes;
                if (item!.totalBytes > 0) {
                  item!.progress = Math.min(Math.round((item!.downloadedBytes / item!.totalBytes) * 100), 100);
                }
                item!.statusDetail = `Downloading (${item!.progress}%)`;
                this.notifyListeners();
                this.persistDownloadsThrottled();
              },
            });

            this.activeTasks.set(id, retryTask);
            const retryResult = await retryTask.downloadAsync();
            if (retryResult && retryResult.exists) {
              item!.status = 'completed';
              item!.progress = 100;
              item!.statusDetail = 'Download complete';
              item!.speedBps = 0;
              item!.speedFormatted = '';
              if (retryResult.size) {
                item!.downloadedBytes = retryResult.size;
                item!.totalBytes = retryResult.size;
              }
              this.activeTasks.delete(id);
              this.notifyListeners();
              this.persistDownloadsImmediately();
              return;
            }
          } catch (retryErr) {
            console.warn('[DownloadService] Proxy retry also failed:', retryErr);
          }
        }

        this.activeTasks.delete(id);
        this.stopTracking(id);

        if (item!.status !== 'paused') {
          item!.status = 'error';
          const msg = err?.message || 'Download error';
          item!.statusDetail = msg;
          item!.errorMessage = msg;
          this.notifyListeners();
          this.persistDownloadsImmediately();
        }
      });

    return item;
  }

  // Pause an active download
  async pauseDownload(id: string): Promise<void> {
    this.stopTracking(id);
    this.ensureLoaded();
    const item = this.inMemoryDownloads.find((d) => d.id === id);
    if (item) {
      item.status = 'paused';
      item.statusDetail = 'Paused';
      item.speedBps = 0;
      item.speedFormatted = '';
      this.notifyListeners();
      this.persistDownloadsImmediately();
    }
  }

  // Resume a paused download
  async resumeDownload(id: string): Promise<void> {
    this.ensureLoaded();
    const item = this.inMemoryDownloads.find((d) => d.id === id);
    if (!item) return;

    if (item.sourceType === 'direct') {
      await this.startDirectDownload({
        id: item.id,
        title: item.title,
        poster: item.poster,
        fileName: item.fileName,
        streamUrl: item.streamUrl,
        fileLength: item.totalBytes,
      });
      return;
    }

    await this.startDownload({
      infoHash: item.infoHash,
      fileIdx: item.fileIdx,
      title: item.title,
      poster: item.poster,
      fileName: item.fileName,
      streamUrl: item.streamUrl,
      fileLength: item.totalBytes,
    });
  }

  // Cancel and delete a download from storage
  async deleteDownload(id: string): Promise<void> {
    this.stopTracking(id);
    this.ensureLoaded();
    const item = this.inMemoryDownloads.find((d) => d.id === id);
    if (item) {
      try {
        const file = new File(item.fileUri);
        if (file.exists) {
          file.delete();
        }
      } catch (err) {
        console.warn('[DownloadService] Error deleting file:', err);
      }
    }

    this.inMemoryDownloads = this.inMemoryDownloads.filter((d) => d.id !== id);
    this.notifyListeners();
    this.persistDownloadsImmediately();
  }

  // Clear all downloads (both TamilMV and YouTube)
  async clearAllDownloads(): Promise<void> {
    this.ensureLoaded();
    for (const item of [...this.inMemoryDownloads]) {
      this.stopTracking(item.id);
      try {
        const file = new File(item.fileUri);
        if (file.exists) {
          file.delete();
        }
      } catch (err) {
        console.warn('[DownloadService] Error deleting file:', err);
      }
    }
    this.inMemoryDownloads = [];
    this.notifyListeners();
    this.persistDownloadsImmediately();
  }

  // Clear only TamilMV torrent downloads
  async clearTamilMVDownloads(): Promise<void> {
    this.ensureLoaded();
    const targets = this.inMemoryDownloads.filter((d) => !d.id.startsWith('yt_') && d.sourceType !== 'direct');
    for (const item of targets) {
      this.stopTracking(item.id);
      try {
        const file = new File(item.fileUri);
        if (file.exists) {
          file.delete();
        }
      } catch (err) {
        console.warn('[DownloadService] Error deleting file:', err);
      }
    }
    this.inMemoryDownloads = this.inMemoryDownloads.filter((d) => d.id.startsWith('yt_') || d.sourceType === 'direct');
    this.notifyListeners();
    this.persistDownloadsImmediately();
  }

  // Clear only YouTube downloads
  async clearYouTubeDownloads(): Promise<void> {
    this.ensureLoaded();
    const targets = this.inMemoryDownloads.filter((d) => d.id.startsWith('yt_') || d.sourceType === 'direct');
    for (const item of targets) {
      this.stopTracking(item.id);
      try {
        const file = new File(item.fileUri);
        if (file.exists) {
          file.delete();
        }
      } catch (err) {
        console.warn('[DownloadService] Error deleting file:', err);
      }
    }
    this.inMemoryDownloads = this.inMemoryDownloads.filter((d) => !d.id.startsWith('yt_') && d.sourceType !== 'direct');
    this.notifyListeners();
    this.persistDownloadsImmediately();
  }

  // Export or share a downloaded file to Files Explorer, Gallery, or external applications
  async exportOrShareDownload(idOrItem: string | DownloadItem): Promise<boolean> {
    const item = typeof idOrItem === 'string'
      ? this.inMemoryDownloads.find((d) => d.id === idOrItem)
      : idOrItem;

    if (!item) {
      Alert.alert('Download Not Found', 'Could not locate the download details.');
      return false;
    }

    if (item.status !== 'completed' || !item.fileUri) {
      Alert.alert('Download Incomplete', 'Please wait until the download finishes before exporting.');
      return false;
    }

    try {
      const file = new File(item.fileUri);
      if (!file.exists) {
        Alert.alert('File Missing', 'The downloaded file was not found on local storage.');
        return false;
      }

      // Attempt native expo-sharing if available in the custom binary without crashing if absent
      let shared = false;
      try {
        const expoSharing = require('expo-sharing');
        if (expoSharing && typeof expoSharing.isAvailableAsync === 'function') {
          const available = await expoSharing.isAvailableAsync().catch(() => false);
          if (available) {
            const name = item.fileName || item.title || 'media';
            const isAudio = name.endsWith('.mp3') || name.endsWith('.m4a') || name.endsWith('.aac') || name.endsWith('.opus');
            const mimeType = isAudio ? 'audio/mp4' : 'video/mp4';

            await expoSharing.shareAsync(item.fileUri, {
              mimeType,
              dialogTitle: `Export "${item.title}"`,
              UTI: isAudio ? 'public.audio' : 'public.movie',
            });
            shared = true;
          }
        }
      } catch (_) {
        shared = false;
      }

      // Built-in React Native Share fallback (works out-of-the-box on every device with zero native compilation)
      if (!shared) {
        await Share.share(
          Platform.select({
            ios: {
              url: item.fileUri,
              title: item.title,
            },
            default: {
              title: item.title,
              message: item.fileUri,
              url: item.fileUri,
            },
          })!
        );
      }
      return true;
    } catch (err: any) {
      console.warn('[DownloadService] Share/Export error:', err?.message || err);
      Alert.alert('Export', err?.message || 'Could not export file.');
      return false;
    }
  }
}

export const downloadService = new DownloadManager();
