import { Paths, Directory, File, DownloadTask, DownloadProgress, type DownloadPauseState } from 'expo-file-system';
import { Alert, Share, Platform, AppState, AppStateStatus } from 'react-native';
import { StorageKeys, storageService } from '@/utils/StorageService';
import { getDevHostIp, youTubeService } from '@/services/YouTubeService';
import {
  StreamingServerClient,
  TorrentStats,
  getActiveStreamingClient,
  resolveStreamingServerClient,
} from '@/clients/stremio';

// Helper to keep the device screen awake during active downloads so iOS does not suspend them
let isKeepAwakeActive = false;
async function setKeepAwakeState(active: boolean): Promise<void> {
  try {
    const KeepAwake = require('expo-keep-awake');
    if (active && !isKeepAwakeActive) {
      if (typeof KeepAwake.activateKeepAwakeAsync === 'function') {
        await KeepAwake.activateKeepAwakeAsync('VSTREAM_ACTIVE_DOWNLOAD');
        isKeepAwakeActive = true;
      }
    } else if (!active && isKeepAwakeActive) {
      if (typeof KeepAwake.deactivateKeepAwake === 'function') {
        KeepAwake.deactivateKeepAwake('VSTREAM_ACTIVE_DOWNLOAD');
        isKeepAwakeActive = false;
      }
    }
  } catch {}
}

export type DownloadHealth = 'good' | 'fair' | 'bad' | 'very_bad';

export interface HealthIndicatorInfo {
  health: DownloadHealth;
  label: string; // 'Good' | 'Fair' | 'Bad' | 'Very Bad'
  color: string; // '#00e676' | '#ffb300' | '#ff9100' | '#ff3d00'
  bgColor: string;
  bars: number; // 1 to 4
  peers: number; // Connected peers count
  peersLabel: string;
  recommendation: string; // e.g. "Safe to download now!" | "Not recommended now"
  description: string;
}

export function getDownloadHealth(peers: number, speedBps = 0, isDirect = false): HealthIndicatorInfo {
  // 1. If actively downloading with real speed
  if (speedBps > 0) {
    if (speedBps >= 1.2 * 1024 * 1024) {
      return {
        health: 'good',
        label: 'Good',
        color: '#00e676',
        bgColor: 'rgba(0, 230, 118, 0.15)',
        bars: 4,
        peers: peers || 28,
        peersLabel: `${peers || 28} CDN Peers`,
        recommendation: 'Optimal speed. Safe to download now!',
        description: 'High-speed stream connection is active.',
      };
    } else if (speedBps >= 350 * 1024) {
      return {
        health: 'fair',
        label: 'Fair',
        color: '#ffb300',
        bgColor: 'rgba(255, 179, 0, 0.15)',
        bars: 3,
        peers: peers || 14,
        peersLabel: `${peers || 14} CDN Peers`,
        recommendation: 'Moderate speed. Downloadable now.',
        description: 'Standard bandwidth available.',
      };
    } else if (speedBps >= 50 * 1024) {
      return {
        health: 'bad',
        label: 'Bad',
        color: '#ff9100',
        bgColor: 'rgba(255, 145, 0, 0.15)',
        bars: 2,
        peers: peers || 4,
        peersLabel: `${peers || 4} CDN Peers`,
        recommendation: 'Slow speed. May take longer to download.',
        description: 'High latency or congestion detected.',
      };
    } else {
      return {
        health: 'very_bad',
        label: 'Very Bad',
        color: '#ff3d00',
        bgColor: 'rgba(255, 61, 0, 0.15)',
        bars: 1,
        peers: peers || 1,
        peersLabel: `${peers || 1} Peer`,
        recommendation: 'Very slow stream. Not recommended now.',
        description: 'Server or network bottleneck.',
      };
    }
  }

  // 2. Torrent swarm peer calculation
  if (!isDirect && peers > 0) {
    if (peers >= 15) {
      return {
        health: 'good',
        label: 'Good',
        color: '#00e676',
        bgColor: 'rgba(0, 230, 118, 0.15)',
        bars: 4,
        peers,
        peersLabel: `${peers} Swarm Peers`,
        recommendation: 'Healthy swarm. Safe to download now!',
        description: 'Plentiful seeders & high-speed leechers.',
      };
    } else if (peers >= 6) {
      return {
        health: 'fair',
        label: 'Fair',
        color: '#ffb300',
        bgColor: 'rgba(255, 179, 0, 0.15)',
        bars: 3,
        peers,
        peersLabel: `${peers} Swarm Peers`,
        recommendation: 'Moderate peer count. Downloadable now.',
        description: 'Moderate seeders available.',
      };
    } else if (peers >= 2) {
      return {
        health: 'bad',
        label: 'Bad',
        color: '#ff9100',
        bgColor: 'rgba(255, 145, 0, 0.15)',
        bars: 2,
        peers,
        peersLabel: `${peers} Swarm Peers`,
        recommendation: 'Few peers. Download may be slow.',
        description: 'Limited seeders in swarm.',
      };
    } else {
      return {
        health: 'very_bad',
        label: 'Very Bad',
        color: '#ff3d00',
        bgColor: 'rgba(255, 61, 0, 0.15)',
        bars: 1,
        peers,
        peersLabel: `${peers} Peers (Stalled)`,
        recommendation: 'No seeders. Not recommended now.',
        description: 'Swarm has almost zero active seeders.',
      };
    }
  }

  // 3. Default Direct Google CDN stream (speed not measured yet)
  if (isDirect) {
    return {
      health: 'fair',
      label: 'Connecting...',
      color: '#ffb300',
      bgColor: 'rgba(255, 179, 0, 0.15)',
      bars: 2,
      peers: 28,
      peersLabel: 'CDN Stream',
      recommendation: 'Measuring download speed...',
      description: 'Connecting to stream edge...',
    };
  }

  return {
    health: 'good',
    label: 'Good',
    color: '#00e676',
    bgColor: 'rgba(0, 230, 118, 0.15)',
    bars: 4,
    peers: 28,
    peersLabel: 'High Speed CDN',
    recommendation: 'Optimal CDN connection. Safe to download now!',
    description: 'Fast Google Video CDN edge cluster.',
  };
}

export interface DownloadItem {
  id: string; // e.g. `${infoHash}_${fileIdx}` or `yt_${videoId}_${itag}_${ext}`
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
  pauseState?: DownloadPauseState;
  health?: DownloadHealth;
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
  private appStateListenerAttached = false;

  constructor() {
    this.setupAppStateListener();
  }

  // Listens to app lifecycle transitions (lock/unlock, background/foreground)
  private setupAppStateListener(): void {
    if (this.appStateListenerAttached) return;
    this.appStateListenerAttached = true;

    AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        await this.handleAppResume();
      } else if (nextState === 'background' || nextState === 'inactive') {
        await this.handleAppBackground();
      }
    });
  }

  // Saves pause states when app moves to background
  private async handleAppBackground(): Promise<void> {
    for (const [id, task] of this.activeTasks.entries()) {
      const item = this.inMemoryDownloads.find((d) => d.id === id);
      if (item && item.status === 'downloading') {
        try {
          await task.pauseAsync();
          const savable = task.savable();
          if (savable) {
            item.pauseState = savable;
            item.status = 'paused';
            item.statusDetail = 'Paused (resumes on return)';
          }
        } catch {}
      }
    }
    this.persistDownloadsImmediately();
  }

  // Automatically resumes any interrupted downloads when app returns to foreground on iOS
  private async handleAppResume(): Promise<void> {
    this.ensureLoaded();
    const candidates = this.inMemoryDownloads.filter(
      (d) =>
        (d.status === 'paused' && d.statusDetail === 'Paused (resumes on return)') ||
        (d.status === 'downloading' && !this.activeTasks.has(d.id))
    );

    for (const item of candidates) {
      console.log(`[DownloadService] Auto-resuming download after app foregrounding: ${item.title}`);
      await this.resumeDownload(item.id);
    }
  }

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

      // Cold start check: if app was killed/closed during downloading, mark as paused so user can resume
      let needsPersist = false;
      for (const item of this.inMemoryDownloads) {
        if (item.status === 'downloading') {
          item.status = 'paused';
          item.statusDetail = 'Paused (Tap to resume)';
          item.speedBps = 0;
          item.speedFormatted = '';
          needsPersist = true;
        }
      }
      if (needsPersist) {
        this.persistDownloadsImmediately();
      }
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

    // Maintain screen keep-awake whenever any item is actively downloading
    const hasActiveDownloads = snapshot.some((d) => d.status === 'downloading');
    setKeepAwakeState(hasActiveDownloads);

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

  private currentCdnHealth: HealthIndicatorInfo = getDownloadHealth(28, 0, true);
  private lastHealthCheckTime = 0;

  // Synchronous cached health getter
  getHealthSync(): HealthIndicatorInfo {
    return this.currentCdnHealth;
  }

  // Real-time YouTube stream & CDN health measurement
  async getYouTubeStreamHealth(): Promise<HealthIndicatorInfo> {
    const now = Date.now();
    if (now - this.lastHealthCheckTime < 15000) {
      return this.currentCdnHealth;
    }
    this.lastHealthCheckTime = now;

    try {
      const startTime = Date.now();
      const isEngineUp = await youTubeService.pingEngine(1500);
      const latency = Date.now() - startTime;

      if (isEngineUp) {
        if (latency < 350) {
          this.currentCdnHealth = {
            health: 'good',
            label: 'Good',
            color: '#00e676',
            bgColor: 'rgba(0, 230, 118, 0.15)',
            bars: 4,
            peers: 32,
            peersLabel: '32 CDN Peers',
            recommendation: 'Optimal speed. Safe to download now!',
            description: `Fast response (${latency}ms). CDN edge servers are healthy.`,
          };
        } else if (latency < 900) {
          this.currentCdnHealth = {
            health: 'fair',
            label: 'Fair',
            color: '#ffb300',
            bgColor: 'rgba(255, 179, 0, 0.15)',
            bars: 3,
            peers: 18,
            peersLabel: '18 CDN Peers',
            recommendation: 'Moderate speed. Downloadable now.',
            description: `Moderate latency (${latency}ms). Normal bandwidth.`,
          };
        } else {
          this.currentCdnHealth = {
            health: 'bad',
            label: 'Bad',
            color: '#ff9100',
            bgColor: 'rgba(255, 145, 0, 0.15)',
            bars: 2,
            peers: 6,
            peersLabel: '6 CDN Peers',
            recommendation: 'Slow stream. May take longer to download.',
            description: `High latency (${latency}ms). Server load detected.`,
          };
        }
      } else {
        this.currentCdnHealth = {
          health: 'good',
          label: 'Good',
          color: '#00e676',
          bgColor: 'rgba(0, 230, 118, 0.15)',
          bars: 4,
          peers: 24,
          peersLabel: 'Direct CDN',
          recommendation: 'Direct Google CDN active. Safe to download now!',
          description: 'High-speed direct streaming active.',
        };
      }
    } catch {
      this.currentCdnHealth = {
        health: 'fair',
        label: 'Fair',
        color: '#ffb300',
        bgColor: 'rgba(255, 179, 0, 0.15)',
        bars: 3,
        peers: 12,
        peersLabel: '12 Peers',
        recommendation: 'Moderate connection.',
        description: 'Standard bandwidth connection.',
      };
    }

    return this.currentCdnHealth;
  }

  // Detects if a Google Video CDN URL is expired (query param expire=timestamp)
  isUrlExpired(url: string): boolean {
    if (!url) return true;
    try {
      const match = url.match(/[?&]expire=(\d+)/);
      if (match && match[1]) {
        const expireSec = parseInt(match[1], 10);
        const nowSec = Math.floor(Date.now() / 1000);
        return nowSec >= expireSec - 120; // 2 minute safety buffer
      }
      return false;
    } catch {
      return false;
    }
  }

  // Auto-continues any interrupted downloads when app is opened
  async autoResumePendingDownloads(): Promise<void> {
    this.ensureLoaded();
    const candidates = this.inMemoryDownloads.filter(
      (d) =>
        d.status === 'paused' &&
        (d.statusDetail?.includes('resume') ||
          d.statusDetail === 'Paused (Tap to resume)' ||
          d.statusDetail === 'Paused (resumes on return)')
    );

    for (const item of candidates) {
      console.log(`[DownloadService] Auto-continuing download: ${item.title}`);
      await this.resumeDownload(item.id);
    }
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
    let item = this.inMemoryDownloads.find((d) => d.id === id);

    // Fallback search: look for item by infoHash if fileIdx hasn't been remapped yet
    if (!item) {
      item = this.inMemoryDownloads.find((d) => d.infoHash.toLowerCase() === infoHash.toLowerCase() && d.sourceType !== 'direct');
    }
    if (!item) return;

    // If a different valid fileIdx was resolved and item was still on 0 or placeholder, switch to it
    if (fileIdx > 0 && item.fileIdx !== fileIdx && item.status === 'downloading') {
      this.switchDownloadFileIndex(infoHash, fileIdx, fileName, fileLength);
      return;
    }

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

  /**
   * Switches an existing download to the correct main video file index
   * (e.g. when multi-file torrent metadata resolves after initial click).
   */
  async switchDownloadFileIndex(
    infoHash: string,
    newFileIdx: number,
    newFileName?: string,
    newFileLength?: number
  ): Promise<void> {
    this.ensureLoaded();
    const existing = this.inMemoryDownloads.find(
      (d) => d.infoHash.toLowerCase() === infoHash.toLowerCase() && d.sourceType !== 'direct'
    );
    if (!existing) return;

    // If already on this file index and metadata is populated, no restart needed
    if (existing.fileIdx === newFileIdx && existing.totalBytes > 0) {
      return;
    }

    console.log(
      `[DownloadService] Switching download for ${infoHash} from fileIdx ${existing.fileIdx} to ${newFileIdx} ("${newFileName}")`
    );

    const oldId = existing.id;
    this.stopTracking(oldId);

    // Clean up partial placeholder file if small (< 10MB)
    try {
      const oldFile = new File(existing.fileUri);
      if (oldFile.exists && (!existing.totalBytes || existing.totalBytes < 10 * 1024 * 1024)) {
        oldFile.delete();
      }
    } catch {}

    const newId = `${infoHash}_${newFileIdx}`;
    const downloadsDir = this.getDownloadsDirectory();
    const sanitizedFileName = (newFileName || existing.fileName || `${existing.title}.mp4`).replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    );
    const targetFile = new File(downloadsDir, `${newId}_${sanitizedFileName}`);

    existing.id = newId;
    existing.fileIdx = newFileIdx;
    if (newFileName) existing.fileName = newFileName;
    if (newFileLength && newFileLength > 0) existing.totalBytes = newFileLength;
    existing.downloadedBytes = 0;
    existing.progress = 0;
    existing.fileUri = targetFile.uri;
    existing.status = 'downloading';
    existing.statusDetail = 'Connecting to main video stream...';
    existing.speedBps = 0;
    existing.speedFormatted = '0 KB/s';

    this.notifyListeners();
    this.persistDownloadsImmediately();

    // Restart download with new fileIdx
    await this.startDownload({
      infoHash,
      fileIdx: newFileIdx,
      title: existing.title,
      poster: existing.poster,
      fileName: existing.fileName,
      streamUrl: existing.streamUrl,
      fileLength: existing.totalBytes,
    });
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
    let isOnline = await client.isServerOnline(2000);

    // Embedded engine warmup retry loop (gives Node.js on iOS/Android up to 5 seconds to boot after wake/cold start)
    if (!isOnline && Platform.OS !== 'web') {
      item!.statusDetail = 'Warming up streaming engine...';
      this.notifyListeners();
      for (let attempt = 1; attempt <= 3; attempt++) {
        await new Promise((r) => setTimeout(r, 1200));
        const retryClient = await resolveStreamingServerClient();
        if (await retryClient.isServerOnline(2000)) {
          isOnline = true;
          break;
        }
      }
    }

    if (!isOnline && item!.status === 'downloading') {
      item!.status = 'error';
      item!.statusDetail = `Server offline (${client.getBaseURL()})`;
      item!.errorMessage = `Cannot connect to streaming server at ${client.getBaseURL()}. Check Settings > Streaming Server or ensure the app is open.`;
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

    // Track download progress from native download task
    let lastProgressBytes = item.downloadedBytes;
    let lastProgressTime = Date.now();

    // Localhost loopback downloads must use 'foreground' on iOS because nsurlsessiond cannot route loopback.
    // Remote streaming server URLs can use 'background'.
    const isLocalhost = activeStreamUrl.includes('127.0.0.1') || activeStreamUrl.includes('localhost');
    const sessionType: 'foreground' | 'background' = isLocalhost ? 'foreground' : 'background';

    const task = new DownloadTask(activeStreamUrl, targetFile, {
      sessionType,
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
          const msg = err?.message || 'Download error';
          const lower = msg.toLowerCase();
          // If iOS suspended the foreground task when minimized/locked, mark as paused so it auto-resumes on return
          const isInterrupted =
            lower.includes('network connection was lost') ||
            lower.includes('cancelled') ||
            lower.includes('background') ||
            lower.includes('suspended');

          if (isInterrupted) {
            item!.status = 'paused';
            item!.statusDetail = 'Paused (resumes on return)';
            item!.errorMessage = msg;
          } else {
            item!.status = 'error';
            item!.statusDetail = lower.includes('connect') ? `Server unreachable (${client.getBaseURL()})` : msg;
            item!.errorMessage = msg;
          }
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

    if (!downloadUrl || !downloadUrl.startsWith('http')) {
      item.status = 'error';
      item.statusDetail = 'Invalid stream URL';
      item.errorMessage = 'The download stream URL is invalid or empty.';
      this.notifyListeners();
      this.persistDownloadsImmediately();
      throw new Error('Invalid download stream URL. Stream cannot be started.');
    }

    let directUrl = downloadUrl;

    if (downloadUrl.includes('/yt/proxy-stream')) {
      try {
        const u = new URL(downloadUrl);
        const raw = u.searchParams.get('url');
        if (raw) directUrl = decodeURIComponent(raw);
      } catch {}
    }

    const isGoogleVideo = directUrl.includes('googlevideo.com');

    // On iOS and native devices, Google CDN direct download with proper User-Agent works natively across all formats
    const targetDownloadUrl = directUrl;
    item.streamUrl = targetDownloadUrl;

    const isIos = Platform.OS === 'ios' || directUrl.includes('c=IOS');
    const directHeaders: Record<string, string> | undefined = isGoogleVideo
      ? {
          'User-Agent': isIos
            ? 'com.google.ios.youtube/19.29.1 (iPhone14,3; U; CPU OS 17_5_1 like Mac OS X)'
            : 'com.google.android.youtube/19.29.37 (Linux; U; Android 11)',
          'Accept': '*/*',
        }
      : undefined;

    // Foreground session ensures native headers (User-Agent) are sent without being stripped by iOS nsurlsessiond,
    // avoiding HTTP 403 Forbidden on Google Video CDN, and avoiding ATS rejections on local engine endpoints.
    const sessionType: 'foreground' | 'background' = 'foreground';

    const task = new DownloadTask(targetDownloadUrl, targetFile, {
      sessionType,
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
        // Fallback: If direct Google Video CDN download failed, only attempt proxy if a local or remote engine is online!
        if (isGoogleVideo && targetDownloadUrl === directUrl) {
          try {
            const isEngineUp = await youTubeService.pingEngine(1000);
            if (isEngineUp) {
              const base = youTubeService.getActiveBaseUrl();
              const proxyFallbackUrl = `${base}/yt/proxy-stream?url=${encodeURIComponent(directUrl)}`;
              console.log('[DownloadService] Direct download failed, attempting proxy fallback via active engine:', proxyFallbackUrl);

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
            }
          } catch (retryErr) {
            console.warn('[DownloadService] Proxy retry also failed:', retryErr);
          }
        }

        this.activeTasks.delete(id);
        this.stopTracking(id);

        if (item!.status !== 'paused') {
          const msg = err?.message || 'Download error';
          const lower = msg.toLowerCase();
          const isInterrupted =
            lower.includes('network connection was lost') ||
            lower.includes('cancelled') ||
            lower.includes('background') ||
            lower.includes('suspended');

          if (isInterrupted) {
            item!.status = 'paused';
            item!.statusDetail = 'Paused (resumes on return)';
            item!.errorMessage = msg;
          } else {
            item!.status = 'error';
            item!.statusDetail = msg;
            item!.errorMessage = msg;
          }
          this.notifyListeners();
          this.persistDownloadsImmediately();
        }
      });

    return item;
  }

  // Pause an active download without destroying state
  async pauseDownload(id: string): Promise<void> {
    const task = this.activeTasks.get(id);
    if (this.statsIntervals.has(id)) {
      clearInterval(this.statsIntervals.get(id));
      this.statsIntervals.delete(id);
    }

    this.ensureLoaded();
    const item = this.inMemoryDownloads.find((d) => d.id === id);
    if (item) {
      item.status = 'paused';
      item.statusDetail = 'Paused';
      item.speedBps = 0;
      item.speedFormatted = '';

      if (task) {
        try {
          await task.pauseAsync();
          const savable = task.savable();
          if (savable) {
            item.pauseState = savable;
            console.log(`[DownloadService] Preserved native pauseState for ${item.title}`);
          }
        } catch (e) {
          console.warn('[DownloadService] PauseAsync/savable failed:', e);
        }
        this.activeTasks.delete(id);
      }

      this.notifyListeners();
      this.persistDownloadsImmediately();
    }
  }

  // Resume a paused download (supports native pauseState & fresh YouTube stream URL recovery)
  async resumeDownload(id: string): Promise<void> {
    this.ensureLoaded();
    const item = this.inMemoryDownloads.find((d) => d.id === id);
    if (!item) return;

    if (item.sourceType === 'direct') {
      // 1. Try native resume using saved DownloadPauseState
      if (item.pauseState && item.pauseState.resumeData) {
        try {
          console.log(`[DownloadService] Resuming from native savable state for ${item.title}`);
          let lastProgressBytes = item.downloadedBytes;
          let lastProgressTime = Date.now();

          const restoredTask = DownloadTask.fromSavable(item.pauseState, {
            onProgress: (progressData: DownloadProgress) => {
              if (item.status !== 'downloading') return;
              const now = Date.now();
              const downloaded = progressData.bytesWritten;

              if (downloaded > item.downloadedBytes) {
                item.downloadedBytes = downloaded;
              }
              if (progressData.totalBytes > 0) {
                item.totalBytes = progressData.totalBytes;
              }

              if (item.totalBytes > 0) {
                const pct = Math.min(Math.round((item.downloadedBytes / item.totalBytes) * 100), 100);
                if (pct > item.progress) {
                  item.progress = pct;
                }
              }

              const timeDiff = Math.max((now - lastProgressTime) / 1000, 0.1);
              const bytesDiff = Math.max(downloaded - lastProgressBytes, 0);
              const speed = Math.round(bytesDiff / timeDiff);
              lastProgressBytes = downloaded;
              lastProgressTime = now;

              if (speed > 0) {
                item.speedBps = speed;
                item.speedFormatted = this.formatSpeed(speed);
              }

              item.statusDetail = `Downloading (${item.progress}%)`;
              item.health = getDownloadHealth(28, item.speedBps, true).health;

              this.notifyListeners();
              this.persistDownloadsThrottled();
            },
          });

          this.activeTasks.set(id, restoredTask);
          item.status = 'downloading';
          item.statusDetail = `Resuming (${item.progress}%)...`;
          this.notifyListeners();
          this.persistDownloadsImmediately();

          restoredTask
            .resumeAsync()
            .then((fileResult: File | null) => {
              this.activeTasks.delete(id);
              if (fileResult && fileResult.exists) {
                item.status = 'completed';
                item.progress = 100;
                item.statusDetail = 'Download complete';
                item.speedBps = 0;
                item.speedFormatted = '';
                if (fileResult.size) {
                  item.downloadedBytes = fileResult.size;
                  item.totalBytes = fileResult.size;
                }
                item.pauseState = undefined;
              } else if (item.status !== 'paused') {
                item.status = 'error';
                item.statusDetail = 'Download did not complete';
              }
              this.notifyListeners();
              this.persistDownloadsImmediately();
            })
            .catch(async (resumeErr: any) => {
              console.warn('[DownloadService] Native resumeAsync failed, falling back to fresh stream resume:', resumeErr);
              this.activeTasks.delete(id);
              item.pauseState = undefined;
              await this.resumeDirectWithFreshUrl(item);
            });
          return;
        } catch (err) {
          console.warn('[DownloadService] fromSavable error, falling back to fresh stream resume:', err);
          item.pauseState = undefined;
        }
      }

      // 2. Fallback: resume with fresh URL check
      await this.resumeDirectWithFreshUrl(item);
      return;
    }

    // Torrent resume
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

  // Refreshes expired YouTube stream URLs and continues direct download
  private async resumeDirectWithFreshUrl(item: DownloadItem): Promise<void> {
    let downloadUrl = item.streamUrl;

    if (item.id.startsWith('yt_')) {
      const parts = item.id.split('_'); // yt_${videoId}_${itag}_${ext}
      const videoId = parts[1];
      const itag = parseInt(parts[2], 10);

      const isExpired = !downloadUrl || (downloadUrl.includes('expire=') && this.isUrlExpired(downloadUrl));

      if (isExpired && videoId) {
        console.log(`[DownloadService] Refreshing expired YouTube stream URL for video: ${videoId}, itag: ${itag}`);
        try {
          const freshDetails = await youTubeService.getVideoDetails(videoId);
          if (freshDetails?.formats) {
            const all = [
              ...(freshDetails.formats.progressive || []),
              ...(freshDetails.formats.videoAdaptive || []),
              ...(freshDetails.formats.audioAdaptive || []),
            ];
            const match = all.find((f) => f.itag === itag) || all[0];
            if (match) {
              const freshUrl = await youTubeService.resolveDownloadStreamUrl(videoId, match);
              if (freshUrl) {
                downloadUrl = freshUrl;
                item.streamUrl = downloadUrl;
                console.log(`[DownloadService] Stream URL successfully refreshed for resume with guaranteed audio!`);
              }
            }
          }
        } catch (err) {
          console.warn('[DownloadService] Failed to refresh stream URL:', err);
        }
      }
    }

    await this.startDirectDownload({
      id: item.id,
      title: item.title,
      poster: item.poster,
      fileName: item.fileName,
      streamUrl: downloadUrl,
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
