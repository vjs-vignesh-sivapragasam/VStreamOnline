import { getPlatformSpecificPlayers, Players } from "@/utils/MediaPlayer";
import { showAlert } from "@/utils/platform";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, Linking, ActivityIndicator, View, Text, StyleSheet, Image, StatusBar } from "react-native";
import { ServerConfig } from "@/components/ServerConfig";
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StreamingServerClient } from "@/clients/stremio";
import * as ScreenOrientation from 'expo-screen-orientation';
import { TorrentItem } from "@/hooks/useTamilMv";
import { StorageKeys, storageService } from "@/utils/StorageService";

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

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
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

      if (directVideoUrl) {
        setVideoUrl(directVideoUrl as string);
        setIsLoadingStream(false);
        return;
      }

      if (streamsParam) {
        try {
          const parsedStreams = JSON.parse(streamsParam as string);
          setStreams(parsedStreams);
          const initialIndex = selectedStreamIndex ? parseInt(selectedStreamIndex as string) : 0;
          setCurrentStreamIndex(initialIndex);
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
      if (!stored) { setStremioClient(null); return { servers: [], selectedId: null }; }
      const all: ServerConfig[] = JSON.parse(stored);
      const stremio = all.filter(s => s.serverType === 'stremio');
      if (!stremio.length) { setStremioClient(null); return { servers: [], selectedId: null }; }
      const current = stremio.find(s => s.current) ?? stremio[0];
      setStremioServers(stremio);
      setSelectedServerId(current.serverId);
      const client = new StreamingServerClient(current.serverUrl);
      setStremioClient(client);
      return { servers: stremio, selectedId: current.serverId };
    } catch {
      setStremioClient(null);
      return { servers: [], selectedId: null };
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
    client?: StreamingServerClient
  ): Promise<string> => {
    const c = client ?? new StreamingServerClient(serverUrl);
    return c.getStreamingURL(infoHash, fileIdx);
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
    setStreamError('');
    setCurrentPlayerType("native");
    setHasTriedNative(false);

    const stream = list[streamIndex];
    const infoHash = getInfoHashFromStream(stream);
    const isTorrentStream = !stream.url && !!infoHash;

    try {
      let finalUrl = stream.url ?? '';

      if (isTorrentStream) {
        const servers = serverList ?? stremioServers;
        const sid = serverId !== undefined ? serverId : selectedServerId;
        if (!sid || !servers.length) throw new Error('No Stremio server configured. Please add one in Settings.');
        const server = servers.find(s => s.serverId === sid);
        if (!server) throw new Error('Stremio server not found.');
        setIsTorrent(true);
        finalUrl = await generatePlayerUrlWithInfoHash(infoHash!, server.serverUrl, stream.fileIdx ?? -1, stremioClient ?? undefined);
      } else {
        if (!stream.url) return;
        setIsTorrent(false);
      }

      if (!finalUrl) throw new Error('Unable to generate video URL');
      setVideoUrl(finalUrl);
      setIsLoadingStream(false);
    } catch (error) {
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
    const isTorrentStream = !stream.url && !!infoHash;

    try {
      let url = stream.url ?? '';
      if (isTorrentStream) {
        const servers = serverList ?? stremioServers;
        const sid = serverId !== undefined ? serverId : selectedServerId;
        if (!sid || !servers.length) { showAlert('Error', 'No Stremio server configured.'); return; }
        const server = servers.find(s => s.serverId === sid);
        if (!server) { showAlert('Error', 'Stremio server not found.'); return; }
        url = `${server.serverUrl}/${encodeURIComponent(infoHash!)}/${encodeURIComponent(stream.fileIdx ?? -1)}`;
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
    if (selectedPlayer === Players.Default) {
      if (s.url) {
        setVideoUrl(s.url);
        setCurrentPlayerType("native");
        setHasTriedNative(false);
      } else {
        loadStream(newIndex);
      }
    }
  };

  const handlePlaybackError = (event: PlaybackErrorEvent) => {
    if (currentPlayerType === "native" && !hasTriedNative && Platform.OS !== "web") {
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

  const handleBack = async (event: BackEvent): Promise<void> => {
    saveToWatchHistory(Math.floor(event.progress));
    router.back();
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
    if (Platform.OS === "ios") {
      return require("../../components/ksplayer").MediaPlayer;
    }
    if (currentPlayerType === "ksplayer") {
      return require("../../components/ksplayer").MediaPlayer;
    }
    return require("../../components/nativeplayer").MediaPlayer;
  }

  const Player = getPlayer();

  // ── Render ───────────────────────────────────────────────────────────────────

  if (isLoadingStream) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.loadingContainer}>
          {artwork ? <Image source={{ uri: artwork }} style={styles.backdropImage} /> : null}
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#535aff" />
            <Text style={styles.loadingText}>
              {streamError || 'Loading stream. Please wait...'}
            </Text>
          </View>
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
      />
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  backdropImage: { position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover', opacity: 0.5 },
  loadingOverlay: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#fff', marginTop: 20, fontSize: 16, fontWeight: '500' },
});

export default MediaPlayerScreen;