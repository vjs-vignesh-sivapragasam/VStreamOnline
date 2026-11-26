import { getPlatformSpecificPlayers, Players, isVLCPlayerSupported } from "@/utils/MediaPlayer";
import { showAlert } from "@/utils/platform";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { Platform, Linking, ActivityIndicator, View, Text, StyleSheet, Image, TouchableOpacity, BackHandler } from "react-native";
import { StatusBar } from "expo-status-bar";
import { ServerConfig } from "@/components/ServerConfig";
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StreamingServerClient, resolveStreamingServerClient, getServerCandidates } from "@/clients/stremio";
import * as ScreenOrientation from 'expo-screen-orientation';
import { TorrentItem } from "@/hooks/useTamilMv";
import { StorageKeys, storageService } from "@/utils/StorageService";
import { isKSPlayerAvailable } from "@/components/ksplayer/KSPlayerView";
import { ThemeSpinner } from '@/components/ThemeSpinner';
import { useTheme } from "@/contexts/ThemeContext";
import { ensureEmbeddedServerRunning } from "@/utils/StremioServerManager";
import { Ionicons } from "@expo/vector-icons";
import { File } from "expo-file-system";
import { externalPlayerService } from "@/utils/ExternalPlayerService";

interface UpdateProgressEvent {
  progress: number;
}

interface PlaybackErrorEvent {
  error: string;
}

interface BackEvent {
  message: string;
  code?: string;
  progress: number;
  player: "native" | "ksplayer";
}

interface WatchHistoryItem {
  title: string;
  videoUrl: string;
  poster: string;
  progress: number;
  timestamp: number;
  isTorrent: boolean;
  allItems: TorrentItem[];
}

interface Stream {
  name: string;
  title?: string;
  url?: string;
  infoHash?: string;
  magnet?: string;
  magnetLink?: string;
  fileIdx?: number;
}

const WATCH_HISTORY_KEY = StorageKeys.WATCH_HISTORY_KEY;
const MAX_HISTORY_ITEMS = 30;
const MIN_PROGRESS_TO_REMOVE = 95;
const DEFAULT_MEDIA_PLAYER_KEY = StorageKeys.DEFAULT_MEDIA_PLAYER_KEY;
const SERVERS_KEY = StorageKeys.SERVERS_KEY;

const MediaPlayerScreen: React.FC = () => {
  const router = useRouter();

  const {
    streams: streamsParam,
    selectedStreamIndex,
    videoUrl: directVideoUrl,
    title,
    poster,
    progress: watchHistoryProgress,
    allItems: allItemsParam,
  } = useLocalSearchParams();

  const artwork = (poster as string) ?? '';

  const parsedAllItems: TorrentItem[] = (() => {
    try {
      return allItemsParam ? JSON.parse(allItemsParam as string) : [];
    } catch {
      return [];
    }
  })();

  const isTorrentFlow = parsedAllItems.length > 0;

  const [progress, setProgress] = useState<number>(
    watchHistoryProgress ? parseInt(watchHistoryProgress as string, 10) : 0
  );
  const [streams, setStreams] = useState<Stream[]>([]);
  const [currentStreamIndex, setCurrentStreamIndex] = useState<number>(0);
  const { theme } = useTheme();
  const [streamBufferProgress, setStreamBufferProgress] = useState<number>(0);
  const [streamPeers, setStreamPeers] = useState<number>(0);
  const [streamSpeed, setStreamSpeed] = useState<number>(0);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [isLoadingStream, setIsLoadingStream] = useState<boolean>(true);
  const [streamError, setStreamError] = useState<string>('');
  const [stremioServers, setStremioServers] = useState<ServerConfig[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [players, setPlayers] = useState<{ name: string; scheme: string; encodeUrl: boolean }[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [isTorrent, setIsTorrent] = useState<boolean>(false);
  const [stremioClient, setStremioClient] = useState<StreamingServerClient | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [currentPlayerType, setCurrentPlayerType] = useState<"native" | "ksplayer">("native");
  const [hasTriedNative, setHasTriedNative] = useState(false);
  const [connectingSeconds, setConnectingSeconds] = useState<number>(0);
  const torrentStatsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanupTorrentStats = () => {
    if (torrentStatsIntervalRef.current) {
      clearInterval(torrentStatsIntervalRef.current);
      torrentStatsIntervalRef.current = null;
    }
  };

  const startTorrentStatsPolling = (client: StreamingServerClient, infoHash: string, fileIdx: number) => {
    cleanupTorrentStats();
    setConnectingSeconds(0);
    const startTimestamp = Date.now();
    const cleanHash = (infoHash || '').toLowerCase().trim();
    torrentStatsIntervalRef.current = setInterval(async () => {
      try {
        const stats = await client.getTorrentStats(cleanHash, fileIdx >= 0 ? fileIdx : undefined);
        if (stats) {
          const peers = stats.peers ?? stats.swarmConnections ?? stats.swarmSize ?? 0;
          setStreamPeers(peers);
          if (stats.downloadSpeed !== undefined) {
            setStreamSpeed(stats.downloadSpeed);
          }
          if (peers === 0) {
            setConnectingSeconds(Math.floor((Date.now() - startTimestamp) / 1000));
          } else {
            setConnectingSeconds(0);
          }

          // Initial target buffer to start video stream playback smoothly (~5 MB)
          const TARGET_PREBUFFER_BYTES = 5 * 1024 * 1024;
          const downloaded = stats.downloaded || 0;
          const initialBufferPct = Math.min(Math.round((downloaded / TARGET_PREBUFFER_BYTES) * 100), 99);

          // Head pieces progress (first critical pieces of video stream)
          const headPct = (stats.headProgress !== undefined && stats.headProgress > 0)
            ? Math.round(stats.headProgress * 100)
            : 0;

          // Overall file progress (e.g. if file is partially or fully cached)
          const overallFilePct = (stats.streamProgress !== undefined && stats.streamProgress >= 0)
            ? Math.round(stats.streamProgress * 100)
            : (stats.downloaded && stats.streamLen ? Math.round((stats.downloaded / stats.streamLen) * 100) : 0);

          const pct = Math.min(Math.max(headPct, initialBufferPct, overallFilePct), 100);
          setStreamBufferProgress(pct);
        }
      } catch {}
    }, 600);
  };

  const streamBufferText = useMemo(() => {
    const formatSpeed = (bytesPerSec?: number): string => {
      if (!bytesPerSec || bytesPerSec <= 0) return '';
      if (bytesPerSec >= 1024 * 1024) {
        return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
      }
      return `${Math.round(bytesPerSec / 1024)} KB/s`;
    };

    const speedStr = formatSpeed(streamSpeed);
    const pct = streamBufferProgress;

    if (pct >= 100) {
      return 'Starting playback...';
    }
    if (pct > 0) {
      if (speedStr && streamPeers > 0) {
        return `Buffering: ${pct}% • ${speedStr} (${streamPeers} ${streamPeers === 1 ? 'peer' : 'peers'})`;
      }
      if (speedStr) {
        return `Buffering: ${pct}% • ${speedStr}`;
      }
      if (streamPeers > 0) {
        return `Buffering: ${pct}% (${streamPeers} ${streamPeers === 1 ? 'peer' : 'peers'})`;
      }
      return `Buffering: ${pct}%`;
    }
    if (streamPeers > 0) {
      if (speedStr) {
        return `Buffering: 0% • ${speedStr} (${streamPeers} ${streamPeers === 1 ? 'peer' : 'peers'})`;
      }
      return `Buffering: 0% (${streamPeers} ${streamPeers === 1 ? 'peer' : 'peers'})`;
    }
    if (connectingSeconds >= 14) {
      return 'Searching swarm (Few seeders online)...';
    }
    if (connectingSeconds >= 6) {
      return 'Searching DHT & Trackers...';
    }
    return 'Connecting to peers... 0%';
  }, [streamBufferProgress, streamPeers, streamSpeed, connectingSeconds]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      ensureEmbeddedServerRunning().catch(() => {});

      if (Platform.OS !== 'web') {
        try {
          await ScreenOrientation.unlockAsync();
          await new Promise(r => setTimeout(r, 100));
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
          StatusBar.setHidden(true, 'slide');
        } catch (e) {
          console.warn('Orientation lock failed:', e);
        }
      }

      if (cancelled) return;

      if (streamsParam) {
        try {
          const parsedStreams = JSON.parse(streamsParam as string);
          setStreams(parsedStreams);
          const initialIndex = selectedStreamIndex ? parseInt(selectedStreamIndex as string, 10) : 0;
          setCurrentStreamIndex(initialIndex);
        } catch (e) {
          console.warn('Failed to parse streamsParam:', e);
        }
      }

      if (directVideoUrl) {
        const urlStr = directVideoUrl as string;
        if (urlStr.startsWith('file:') || (!urlStr.startsWith('http://') && !urlStr.startsWith('https://'))) {
          try {
            const f = new File(urlStr);
            if (!f.exists || (f.size !== undefined && f.size === 0)) {
              setStreamError('The downloaded video file is missing or empty. Please re-download this title.');
              setIsLoadingStream(false);
              return;
            }
          } catch {}
        }
        setVideoUrl(urlStr);
        setIsLoadingStream(false);
        return;
      }

      if (streamsParam) {
        try {
          const parsedStreams = JSON.parse(streamsParam as string);
          const initialIndex = selectedStreamIndex ? parseInt(selectedStreamIndex as string, 10) : 0;
          const savedPlayer = loadDefaultPlayer();
          if (!savedPlayer) {
            const platformPlayers = getPlatformSpecificPlayers();
            setPlayers(platformPlayers);
            fetchServerConfigs();
          } else {
            initializePlayerAndSelect(parsedStreams, initialIndex);
          }
        } catch (error) {
          console.error('Failed to parse streams:', error);
          setStreamError('Failed to load streams');
          setIsLoadingStream(false);
        }
      }

    };

    init();

    return () => {
      cleanupTorrentStats();
      (async () => {
        try {
          await ScreenOrientation.unlockAsync();
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
          StatusBar.setHidden(false, 'slide');
        } catch { }
      })();
    };
  }, []);

  useEffect(() => {
    if (currentPlayerType === "ksplayer" && hasTriedNative) {
      setStreamError('');
      setIsLoadingStream(false);
    }
  }, [currentPlayerType, hasTriedNative]);

  // ── Orientation ──────────────────────────────────────────────────────────────

  const setupOrientation = async () => {
    if (Platform.OS !== 'web') {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        StatusBar.setHidden(true);
      } catch (error) {
        console.warn("Failed to set orientation:", error);
      }
    }
  };

  const cleanupOrientation = async () => {
    if (Platform.OS !== 'web') {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT);
      StatusBar.setHidden(false);
    }
  };

  // ── Player / Server init ─────────────────────────────────────────────────────

  const initializePlayerAndSelect = async (parsedStreams: Stream[], streamIndex: number) => {
    setPlayers(getPlatformSpecificPlayers());
    const savedPlayer = loadDefaultPlayer();
    const { servers: serverList, selectedId } = fetchServerConfigs();
    if (!savedPlayer) {
      setSelectedPlayer('Default');
    } else {
      setSelectedPlayer(savedPlayer);
      if (savedPlayer === Players.Default) {
        setupOrientation();
        await loadStream(streamIndex, parsedStreams, serverList, selectedId);
      } else {
        handleExternalPlayer(parsedStreams[streamIndex], savedPlayer, getPlatformSpecificPlayers(), serverList, selectedId);
      }
    }
  };

  const loadDefaultPlayer = () => {
    try {
      const saved = storageService.getItem(DEFAULT_MEDIA_PLAYER_KEY);
      return saved ? JSON.parse(saved) : 'Default';
    } catch {
      return null;
    }
  };

  const fetchServerConfigs = (): { servers: ServerConfig[]; selectedId: string | null } => {
    try {
      const stored = storageService.getItem(SERVERS_KEY);
      let stremio: ServerConfig[] = [];
      if (stored) {
        const all: ServerConfig[] = JSON.parse(stored);
        stremio = all.filter(s => s.serverType === 'stremio');
      }
      if (!stremio.length) {
        const candidates = getServerCandidates();
        stremio = candidates.map((url, idx) => ({
          serverId: `auto-${idx}`,
          serverType: 'stremio',
          serverName: idx === 0 ? 'Primary Streaming Server' : `Server Candidate ${idx + 1}`,
          serverUrl: url,
          current: idx === 0,
        }));
      }
      const current = stremio.find(s => s.current) ?? stremio[0];
      setStremioServers(stremio);
      setSelectedServerId(current.serverId);
      const client = new StreamingServerClient(current.serverUrl);
      setStremioClient(client);
      return { servers: stremio, selectedId: current.serverId };
    } catch {
      const fallbackUrl = 'http://127.0.0.1:11470';
      const fallbackServer: ServerConfig = {
        serverId: 'default-localhost',
        serverType: 'stremio',
        serverName: 'Local Server',
        serverUrl: fallbackUrl,
        current: true,
      };
      const client = new StreamingServerClient(fallbackUrl);
      setStremioClient(client);
      setStremioServers([fallbackServer]);
      setSelectedServerId(fallbackServer.serverId);
      return { servers: [fallbackServer], selectedId: fallbackServer.serverId };
    }
  };

  // ── Stream helpers ───────────────────────────────────────────────────────────

  const getInfoHashFromStream = (stream: Stream): string | null => {
    if (stream.infoHash) return stream.infoHash;
    const magnet = stream.magnet || stream.magnetLink;
    if (magnet) {
      const match = magnet.match(/xt=urn:btih:([a-fA-F0-9]{40}|[a-fA-F0-9]{32})/i);
      return match?.[1] || null;
    }
    return null;
  };

  const generatePlayerUrlWithInfoHash = async (
    infoHash: string,
    serverUrl: string,
    fileIdx: number,
    client?: StreamingServerClient,
    magnetUrl?: string
  ): Promise<string> => {
    const c = client ?? new StreamingServerClient(serverUrl);
    return c.getStreamingURL(infoHash, fileIdx, magnetUrl);
  };

  const loadStream = async (
    streamIndex: number,
    streamList?: Stream[],
    serverList?: ServerConfig[],
    serverId?: string | null
  ) => {
    const list = streamList ?? streams;
    if (!list[streamIndex]) return;

    setIsLoadingStream(true);
    setStreamBufferProgress(0);
    setStreamPeers(0);
    setStreamSpeed(0);
    setStreamError('');
    setCurrentPlayerType("native");
    setHasTriedNative(false);
    cleanupTorrentStats();

    const stream = list[streamIndex];
    const infoHash = getInfoHashFromStream(stream);
    const magnetUrl = stream.magnet || stream.magnetLink;
    const isTorrentStream = !!infoHash;

    try {
      let finalUrl = stream.url ?? '';

      if (isTorrentStream) {
        setIsTorrent(true);
        const safeFileIdx = typeof stream.fileIdx === 'number' && stream.fileIdx >= 0 ? stream.fileIdx : 0;

        let client = stremioClient ?? (await resolveStreamingServerClient());
        let isOnline = await client.isServerOnline(2500);
        if (!isOnline) {
          ensureEmbeddedServerRunning().catch(() => {});
          for (let attempt = 0; attempt < 5; attempt++) {
            await new Promise((r) => setTimeout(r, 1000));
            client = await resolveStreamingServerClient();
            if (await client.isServerOnline(2000)) {
              isOnline = true;
              break;
            }
          }
        }
        if (!isOnline) {
          throw new Error(`Stremio streaming server is offline (${client.getBaseURL()}). Please make sure the server is running.`);
        }
        setStremioClient(client);

        if (!finalUrl || finalUrl.includes('127.0.0.1:11470')) {
          finalUrl = await client.getStreamingURL(infoHash!, safeFileIdx, magnetUrl);
        }
        startTorrentStatsPolling(client, infoHash!, safeFileIdx);
      } else {
        if (!stream.url) return;
        setIsTorrent(false);
      }

      if (!finalUrl) throw new Error('Unable to generate video URL');
      setVideoUrl(finalUrl);
      setIsLoadingStream(false);
    } catch (error) {
      cleanupTorrentStats();
      setStreamError(error instanceof Error ? error.message : 'Failed to load stream');
      setIsLoadingStream(false);
    }
  };

  const handleExternalPlayer = async (
    stream: Stream,
    playerName: string,
    playersList?: any[],
    serverList?: ServerConfig[],
    serverId?: string | null
  ) => {
    if (isProcessing) return;
    setIsProcessing(true);
    const infoHash = getInfoHashFromStream(stream);
    const isTorrentStream = !!infoHash;

    try {
      let url = stream.url ?? '';
      if (isTorrentStream) {
        const client = stremioClient ?? (await resolveStreamingServerClient());
        const safeFileIdx = typeof stream.fileIdx === 'number' && stream.fileIdx >= 0 ? stream.fileIdx : 0;
        url = await client.getStreamingURL(infoHash!, safeFileIdx, stream.magnet || stream.magnetLink);
        startTorrentStatsPolling(client, infoHash!, safeFileIdx);
      }
      if (!url) { showAlert('Error', 'Unable to generate video URL'); return; }

      const p = (playersList ?? players).find((pl: any) => pl.name === playerName);
      if (!p) { showAlert('Error', 'Invalid player selection'); return; }

      const filename = new URL(url).pathname.split('/').pop() ?? '';
      const streamUrl = p.encodeUrl ? encodeURIComponent(url) : url;
      await Linking.openURL(p.scheme.replace('STREAMURL', streamUrl).replace('STREAMTITLE', filename));
      setTimeout(() => router.back(), 1000);
    } catch (error) {
      showAlert('Error', 'Failed to open external player');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStreamChange = (newIndex: number) => {
    if (newIndex < 0 || newIndex >= streams.length) return;
    setCurrentStreamIndex(newIndex);
    const s = streams[newIndex];
    if (s.url) {
      setVideoUrl(s.url);
      setStreamError('');
      setIsLoadingStream(false);
    } else {
      loadStream(newIndex);
    }
  };

  const handlePlaybackError = (event: PlaybackErrorEvent) => {
    if (currentPlayerType === "native" && !hasTriedNative && Platform.OS !== "web" && isKSPlayerAvailable()) {
      setHasTriedNative(true);
      setStreamError('');
      setCurrentPlayerType("ksplayer");
    } else {
      setStreamError(
        currentPlayerType === "ksplayer"
          ? 'KSPlayer was unable to play this format.'
          : (event.error || 'Playback failed')
      );
      setIsLoadingStream(false);
    }
  };

  const saveToWatchHistory = (currentProgress: number) => {
    try {
      const existingJson = storageService.getItem(WATCH_HISTORY_KEY);
      let history: WatchHistoryItem[] = existingJson ? JSON.parse(existingJson) : [];

      if (currentProgress >= MIN_PROGRESS_TO_REMOVE) {
        history = history.filter(item => item.videoUrl !== videoUrl);
        storageService.setItem(WATCH_HISTORY_KEY, JSON.stringify(history));
        return;
      }

      const historyItem: WatchHistoryItem = {
        title: title as string,
        videoUrl: videoUrl as string,
        poster: artwork,
        progress: currentProgress,
        timestamp: Date.now(),
        isTorrent: isTorrentFlow,
        allItems: parsedAllItems,
      };

      const existingIndex = history.findIndex(item => item.videoUrl === videoUrl);

      if (existingIndex !== -1) {
        history[existingIndex] = { ...history[existingIndex], progress: currentProgress, timestamp: Date.now() };
        const [updated] = history.splice(existingIndex, 1);
        history.unshift(updated);
      } else {
        history.unshift(historyItem);
      }

      if (history.length > MAX_HISTORY_ITEMS) {
        history = history.slice(0, MAX_HISTORY_ITEMS);
      }

      storageService.setItem(WATCH_HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('Failed to save watch history:', error);
    }
  };

  // ── Playback callbacks ───────────────────────────────────────────────────────

  const handleBack = async (event?: BackEvent): Promise<void> => {
    cleanupTorrentStats();
    if (event?.progress !== undefined && !isNaN(event.progress)) {
      saveToWatchHistory(Math.floor(event.progress));
    } else if (progress > 0) {
      saveToWatchHistory(Math.floor(progress));
    }

    try {
      if (Platform.OS !== 'web') {
        await ScreenOrientation.unlockAsync();
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        StatusBar.setHidden(false, 'slide');
      }
    } catch {}

    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/youtube/downloads');
    }
  };

  const handleUpdateProgress = async (event: UpdateProgressEvent): Promise<void> => {
    if (event.progress <= 1) return;
    const pct = Math.floor(event.progress);
    setProgress(pct);
    saveToWatchHistory(pct);
  };

  // ── Player selection ─────────────────────────────────────────────────────────
  // Default: react-native-video (ExoPlayer on Android, AVPlayer on iOS)
  // Fallback: KSPlayer (FFmpeg-based, better format support)

  function getPlayer() {
    if (Platform.OS === 'android' && isVLCPlayerSupported()) {
      try {
        const vlc = require("../../components/vlcplayer");
        if (vlc && vlc.MediaPlayer) return vlc.MediaPlayer;
      } catch (e) {
        console.warn('[StreamPlayer] Failed to load VLCPlayer, falling back:', e);
      }
    }
    if (Platform.OS === "ios" && isKSPlayerAvailable()) {
      return require("../../components/ksplayer").MediaPlayer;
    }
    if (currentPlayerType === "ksplayer" && isKSPlayerAvailable()) {
      return require("../../components/ksplayer").MediaPlayer;
    }
    return require("../../components/nativeplayer").MediaPlayer;
  }

  const Player = getPlayer();

  // ── Render ───────────────────────────────────────────────────────────────────

  if (streamError) {
    const activeMagnet =
      streams[currentStreamIndex]?.magnet ||
      streams[currentStreamIndex]?.magnetLink ||
      parsedAllItems[0]?.magnetUrl;

    const isServerOffline = streamError.toLowerCase().includes('server is offline');

    return (
      <GestureHandlerRootView style={styles.rootContainer}>
        <StatusBar hidden={true} style="light" />
        <View style={styles.loadingContainer}>
          {artwork ? <Image source={{ uri: artwork }} style={styles.backdropImage} /> : null}
          <View style={styles.loadingOverlay}>
            <Ionicons name="alert-circle-outline" size={44} color="#ff453a" />
            <Text style={[styles.loadingText, { color: '#ff453a', textAlign: 'center', marginHorizontal: 24, fontSize: 16, fontWeight: '700' }]}>
              {isServerOffline ? 'Streaming Server Offline' : 'Playback Error'}
            </Text>
            <Text style={[styles.loadingText, { color: '#ffffff', opacity: 0.85, fontSize: 13, textAlign: 'center', marginHorizontal: 28, marginTop: 4, marginBottom: 12 }]}>
              {isServerOffline
                ? 'Direct torrent playback requires a background engine (Stremio server) on port 11470 to convert P2P pieces into video. In development mode, run "npm run server" on your PC, or open the magnet in VLC / external player.'
                : streamError}
            </Text>

            {activeMagnet ? (
              <TouchableOpacity
                style={[styles.retryBtn, { backgroundColor: '#FF9800', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }]}
                onPress={async () => {
                  try {
                    await Linking.openURL(activeMagnet);
                  } catch {
                    showAlert('No Torrent App Found', 'Install VLC, Stremio, or LibreTorrent from Google Play Store to stream magnets directly.');
                  }
                }}
              >
                <Ionicons name="open-outline" size={18} color="#000000" style={{ marginRight: 6 }} />
                <Text style={[styles.retryBtnText, { color: '#000000', fontWeight: 'bold' }]}>
                  Open in VLC / External Player
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => {
                if (videoUrl && (videoUrl.startsWith('file:') || (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://')))) {
                  externalPlayerService.promptPlayerSelection({
                    fileUri: videoUrl,
                    title: (title as string) || 'Movie',
                    onPlayInternal: () => {
                      setStreamError('');
                      setIsLoadingStream(false);
                    },
                  });
                } else {
                  loadStream(currentStreamIndex);
                }
              }}
            >
              <Text style={styles.retryBtnText}>
                {videoUrl && (videoUrl.startsWith('file:') || (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://')))
                  ? 'Open with External Player'
                  : 'Retry Stream'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: 'transparent', marginTop: 4 }]}
              onPress={() => router.back()}
            >
              <Text style={[styles.retryBtnText, { color: '#ffffff' }]}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GestureHandlerRootView>
    );
  }

  if (isLoadingStream) {
    return (
      <GestureHandlerRootView style={styles.rootContainer}>
        <StatusBar hidden={true} style="light" />
        <View style={styles.loadingContainer}>
          {artwork ? <Image source={{ uri: artwork }} style={styles.backdropImage} /> : null}
          <View style={styles.loadingOverlay}>
            <ThemeSpinner size={64} color={theme.primary} text={streamBufferText} />
          </View>
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.rootContainer}>
      <StatusBar hidden={true} style="light" />
      <Player
        videoUrl={videoUrl}
        isTorrent={isTorrent}
        title={title as string}
        back={handleBack}
        progress={progress}
        artwork={artwork}
        updateProgress={handleUpdateProgress}
        onPlaybackError={handlePlaybackError}
        streams={streams}
        currentStreamIndex={currentStreamIndex}
        onStreamChange={handleStreamChange}
        torrentBufferProgress={streamBufferProgress}
        torrentBufferText={streamBufferText}
        torrentPeers={streamPeers}
        torrentSpeed={streamSpeed}
      />

      {isTorrent && streamPeers === 0 && connectingSeconds >= 12 && (
        <View style={styles.peerWarningOverlay} pointerEvents="box-none">
          <View style={styles.peerWarningCard}>
            <Ionicons name="information-circle-outline" size={16} color="#FFB020" style={{ marginRight: 6 }} />
            <Text style={styles.peerWarningText}>
              Few seeders found for this file.
            </Text>
            {streams.length > 1 && (
              <TouchableOpacity
                style={styles.switchStreamPill}
                onPress={() => {
                  const nextIndex = (currentStreamIndex + 1) % streams.length;
                  handleStreamChange(nextIndex);
                }}
              >
                <Ionicons name="swap-horizontal" size={13} color="#FFF" style={{ marginRight: 4 }} />
                <Text style={styles.switchStreamPillText}>Try Next Quality</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.externalPlayerPill}
              onPress={() => {
                const s = streams[currentStreamIndex];
                if (s) {
                  const platformPlayers = getPlatformSpecificPlayers();
                  if (platformPlayers.length > 0) {
                    handleExternalPlayer(s, platformPlayers[0].name, platformPlayers);
                  }
                }
              }}
            >
              <Ionicons name="open-outline" size={13} color="#FFF" style={{ marginRight: 4 }} />
              <Text style={styles.switchStreamPillText}>Open in External</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  rootContainer: { flex: 1, backgroundColor: '#000000' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  backdropImage: { position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover', opacity: 0.5 },
  loadingOverlay: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#fff', marginTop: 20, fontSize: 16, fontWeight: '500' },
  retryBtn: {
    marginTop: 20,
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  peerWarningOverlay: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  peerWarningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 20, 25, 0.92)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 176, 32, 0.35)',
    maxWidth: '92%',
  },
  peerWarningText: {
    color: '#E0E0E0',
    fontSize: 12,
    fontWeight: '500',
    marginRight: 10,
  },
  switchStreamPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A84FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    marginRight: 6,
  },
  externalPlayerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#30D158',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  switchStreamPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
});

export default MediaPlayerScreen;
