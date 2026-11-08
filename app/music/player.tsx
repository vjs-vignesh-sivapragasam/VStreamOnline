import React, { useState, useRef, useEffect, useCallback, useMemo, Component, ReactNode, ErrorInfo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
  Easing,
  Modal,
  FlatList,
  Platform,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-assets/slider';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import { useTheme } from '@/contexts/ThemeContext';
import { downloadService, DownloadItem } from '@/services/DownloadService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { File } from 'expo-file-system';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Proportional sizing: fits every phone screen without squishing or overflowing
const DISC_SIZE = Math.min(SCREEN_WIDTH * 0.65, SCREEN_HEIGHT * 0.32, 240);
const VISUALIZER_BARS = 22;

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0 || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs > 0) {
    return `${hrs}:${remMins < 10 ? '0' : ''}${remMins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

const isAudioDownload = (item: DownloadItem): boolean => {
  const fileName = (item.fileName || '').toLowerCase();
  const fileUri = (item.fileUri || '').toLowerCase();
  const id = (item.id || '').toLowerCase();
  const title = (item.title || '').toLowerCase();
  return (
    fileName.endsWith('.mp3') ||
    fileName.endsWith('.m4a') ||
    fileName.endsWith('.aac') ||
    fileName.endsWith('.wav') ||
    fileName.endsWith('.flac') ||
    fileName.endsWith('.opus') ||
    fileName.endsWith('.ogg') ||
    fileUri.endsWith('.mp3') ||
    fileUri.endsWith('.m4a') ||
    fileUri.endsWith('.aac') ||
    fileUri.endsWith('.wav') ||
    fileUri.endsWith('.flac') ||
    fileUri.endsWith('.opus') ||
    id.includes('_mp3') ||
    id.includes('_audio') ||
    title.includes('.mp3') ||
    title.includes('.m4a') ||
    title.toLowerCase().includes('audio')
  );
};

// ─── Sandboxed HTML5 Web Audio Engine with Blob-based Random-Access Seeking ──
const AUDIO_ENGINE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>body { margin:0; padding:0; background:transparent; overflow:hidden; }</style>
</head>
<body>
  <audio id="audioPlayer" playsinline webkit-playsinline preload="auto"></audio>
  <script>
    (function() {
      var audio = document.getElementById('audioPlayer');
      var currentBlobUrl = null;

      function postMsg(data) {
        try {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify(data));
          }
        } catch(e) {}
      }

      try {
        Object.defineProperty(document, 'hidden', { get: function() { return false; }, configurable: true });
        Object.defineProperty(document, 'visibilityState', { get: function() { return 'visible'; }, configurable: true });
      } catch(e) {}

      audio.addEventListener('loadedmetadata', function() {
        var dur = audio.duration;
        postMsg({
          type: 'LOADED',
          duration: (typeof dur === 'number' && !isNaN(dur) && isFinite(dur) && dur > 0) ? dur : 0
        });
      });

      audio.addEventListener('durationchange', function() {
        var dur = audio.duration;
        if (typeof dur === 'number' && !isNaN(dur) && isFinite(dur) && dur > 0) {
          postMsg({
            type: 'DURATION',
            duration: dur
          });
        }
      });

      audio.addEventListener('timeupdate', function() {
        var cur = audio.currentTime;
        var dur = audio.duration;
        postMsg({
          type: 'PROGRESS',
          currentTime: (typeof cur === 'number' && !isNaN(cur) && isFinite(cur)) ? cur : 0,
          duration: (typeof dur === 'number' && !isNaN(dur) && isFinite(dur) && dur > 0) ? dur : 0
        });
      });

      audio.addEventListener('ended', function() {
        postMsg({ type: 'ENDED' });
      });

      audio.addEventListener('play', function() {
        postMsg({ type: 'PLAYING' });
      });

      audio.addEventListener('pause', function() {
        postMsg({ type: 'PAUSED' });
      });

      audio.addEventListener('error', function() {
        var err = audio.error;
        postMsg({
          type: 'ERROR',
          code: err ? err.code : -1,
          message: err ? err.message : 'Audio decode error'
        });
      });

      window.playTrack = function(src, rate) {
        try {
          if (!src) return;
          if (src.indexOf('data:') === 0) {
            // Convert data URI to in-memory Blob for instant, reliable seeking
            fetch(src)
              .then(function(res) { return res.blob(); })
              .then(function(blob) {
                if (currentBlobUrl) {
                  try { URL.revokeObjectURL(currentBlobUrl); } catch(e) {}
                }
                currentBlobUrl = URL.createObjectURL(blob);
                audio.src = currentBlobUrl;
                audio.playbackRate = rate || 1.0;
                audio.load();
                var p = audio.play();
                if (p && p.catch) {
                  p.catch(function(err) {
                    postMsg({ type: 'PLAY_FAIL', message: String(err) });
                  });
                }
              })
              .catch(function(err) {
                audio.src = src;
                audio.playbackRate = rate || 1.0;
                audio.load();
                var p = audio.play();
                if (p && p.catch) p.catch(function() {});
              });
            return;
          }
          audio.src = src;
          audio.playbackRate = rate || 1.0;
          audio.load();
          var p = audio.play();
          if (p && p.catch) p.catch(function() {});
        } catch(e) {
          postMsg({ type: 'EXCEPTION', message: String(e) });
        }
      };

      window.resumeTrack = function() {
        try {
          var p = audio.play();
          if (p && p.catch) p.catch(function() {});
        } catch(e) {}
      };

      window.pauseTrack = function() {
        try {
          audio.pause();
        } catch(e) {}
      };

      window.seekTrack = function(sec) {
        try {
          if (typeof sec === 'number' && !isNaN(sec) && isFinite(sec)) {
            var dur = audio.duration;
            var target = Math.max(0, (dur && isFinite(dur)) ? Math.min(sec, dur) : sec);
            audio.currentTime = target;
            postMsg({
              type: 'PROGRESS',
              currentTime: audio.currentTime,
              duration: (dur && isFinite(dur)) ? dur : 0
            });
          }
        } catch(e) {}
      };

      window.skipSeconds = function(deltaSec) {
        try {
          var cur = audio.currentTime || 0;
          var dur = audio.duration;
          var maxDur = (dur && isFinite(dur)) ? dur : 999999;
          var target = Math.max(0, Math.min(cur + deltaSec, maxDur));
          audio.currentTime = target;
          postMsg({
            type: 'PROGRESS',
            currentTime: audio.currentTime,
            duration: (dur && isFinite(dur)) ? dur : 0
          });
        } catch(e) {}
      };

      window.setRate = function(rate) {
        try {
          audio.playbackRate = rate || 1.0;
        } catch(e) {}
      };

      postMsg({ type: 'READY' });
    })();
  </script>
</body>
</html>
`;

// ─── Crash-Proof Error Boundary ───────────────────────────────────────────────
class MusicPlayerErrorBoundary extends Component<{ children: ReactNode; onBack: () => void }, { hasError: boolean; errorMsg: string }> {
  state = { hasError: false, errorMsg: '' };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMsg: error?.message || 'Playback error' };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('[MusicPlayer] Error boundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <StatusBar style="light" />
          <Ionicons name="musical-notes-outline" size={64} color="#ff453a" />
          <Text style={styles.errorTitle}>Unable to Play Audio</Text>
          <Text style={styles.errorSub}>{this.state.errorMsg || 'Please try another track'}</Text>
          <TouchableOpacity style={styles.errorBtn} onPress={this.props.onBack}>
            <Ionicons name="arrow-back" size={18} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.errorBtnText}>Back to Library</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── Main Music Player Inner Screen ───────────────────────────────────────────
function MusicPlayerScreenInner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  // Keep screen awake while enjoying music
  useKeepAwake('VPLEX_MUSIC_PLAYER');

  const params = useLocalSearchParams<{
    id?: string;
    fileUri?: string;
    title?: string;
    poster?: string;
  }>();

  // ── Playlist Queue State ──────────────────────────────────────────────────
  const [downloads, setDownloads] = useState<DownloadItem[]>(() => {
    try {
      return downloadService.getDownloads();
    } catch {
      return [];
    }
  });

  const audioQueue = useMemo(() => {
    const list = downloads.filter((d) => d.status === 'completed' && isAudioDownload(d));
    if (params.id && !list.some((d) => d.id === params.id) && params.fileUri) {
      list.unshift({
        id: params.id,
        title: params.title || 'Unknown Track',
        poster: params.poster || '',
        fileUri: params.fileUri,
        fileName: 'track.mp3',
        infoHash: '',
        fileIdx: 0,
        streamUrl: '',
        totalBytes: 0,
        downloadedBytes: 0,
        progress: 100,
        status: 'completed',
        speedBps: 0,
        speedFormatted: '',
        peers: 0,
        createdAt: Date.now(),
      });
    }
    return list;
  }, [downloads, params.id, params.fileUri, params.title, params.poster]);

  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    if (params.id) {
      const idx = audioQueue.findIndex((d) => d.id === params.id);
      if (idx !== -1) return idx;
    }
    return 0;
  });

  const syncedParamIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (params.id && params.id !== syncedParamIdRef.current && audioQueue.length > 0) {
      const idx = audioQueue.findIndex((d) => d.id === params.id);
      if (idx !== -1) {
        syncedParamIdRef.current = params.id;
        setCurrentIndex(idx);
      }
    }
  }, [params.id, audioQueue]);

  const currentTrack = audioQueue[currentIndex] || {
    id: params.id || 'single',
    title: params.title || 'Music Track',
    poster: params.poster || '',
    fileUri: params.fileUri || '',
  };

  // ── Audio Engine & Playback State ─────────────────────────────────────────
  const webViewRef = useRef<WebView>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSliding, setIsSliding] = useState(false);
  const isSlidingRef = useRef(false);
  const [sliderPos, setSliderPos] = useState(0);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('all');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [displayMode, setDisplayMode] = useState<'vinyl' | 'artwork'>('vinyl');
  const [queueModalVisible, setQueueModalVisible] = useState(false);
  const [speedModalVisible, setSpeedModalVisible] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  // Subscribe to download updates
  useEffect(() => {
    const unsub = downloadService.addListener((items) => {
      setDownloads(items);
    });
    return unsub;
  }, []);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 1800);
  }, []);

  // ── Vinyl Disc Continuous Spin Animation ──────────────────────────────────
  const spinAnim = useRef(new Animated.Value(0)).current;
  const isSpinningRef = useRef(false);
  const spinLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const startSpinAnimation = useCallback(() => {
    if (isSpinningRef.current) return;
    isSpinningRef.current = true;
    spinLoopRef.current = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 14000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spinLoopRef.current.start();
  }, [spinAnim]);

  const stopSpinAnimation = useCallback(() => {
    if (spinLoopRef.current) {
      spinLoopRef.current.stop();
      isSpinningRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (isPlaying) {
      startSpinAnimation();
    } else {
      stopSpinAnimation();
    }
  }, [isPlaying, startSpinAnimation, stopSpinAnimation]);

  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // ── Glowing Pulse Animation ───────────────────────────────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isPlaying) {
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.98,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();
      return () => pulseLoop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isPlaying, pulseAnim]);

  // ── Native Visualizer Waves (ScaleY) ──────────────────────────────────────
  const barAnims = useRef(
    Array.from({ length: VISUALIZER_BARS }, () => new Animated.Value(0.2))
  ).current;

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    let isCancelled = false;

    const animateVisualizer = () => {
      if (!isPlaying || isCancelled) return;

      const animations = barAnims.map((bar) => {
        const randomScale = Math.random() * 0.85 + 0.15;
        return Animated.timing(bar, {
          toValue: randomScale,
          duration: 130 + Math.random() * 80,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        });
      });

      Animated.parallel(animations).start(() => {
        if (!isCancelled && isPlaying) {
          timer = setTimeout(animateVisualizer, 35);
        }
      });
    };

    if (isPlaying) {
      animateVisualizer();
    } else {
      barAnims.forEach((bar) => {
        Animated.timing(bar, {
          toValue: 0.1,
          duration: 300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }).start();
      });
    }

    return () => {
      isCancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isPlaying, barAnims]);

  // ── Audio Track Loading with Native Base64 / Blob Support ─────────────────
  useEffect(() => {
    let isCancelled = false;

    const loadAndPlayAudio = async () => {
      if (!engineReady || !currentTrack.fileUri) return;

      try {
        const targetFile = new File(currentTrack.fileUri);
        if (targetFile.exists) {
          const b64 = await targetFile.base64();
          if (isCancelled) return;
          const mime = (currentTrack.fileName || '').endsWith('.m4a') ? 'audio/mp4' : 'audio/mp3';
          const dataUrl = `data:${mime};base64,${b64}`;

          webViewRef.current?.injectJavaScript(`
            if (window.playTrack) {
              window.playTrack(${JSON.stringify(dataUrl)}, ${playbackSpeed});
            }
            true;
          `);
          setIsPlaying(true);
          return;
        }
      } catch (e) {
        console.warn('[MusicPlayer] base64 loading failed, trying direct URI fallback:', e);
      }

      // Direct URI fallback
      if (!isCancelled) {
        webViewRef.current?.injectJavaScript(`
          if (window.playTrack) {
            window.playTrack(${JSON.stringify(currentTrack.fileUri)}, ${playbackSpeed});
          }
          true;
        `);
        setIsPlaying(true);
      }
    };

    loadAndPlayAudio();

    return () => {
      isCancelled = true;
    };
  }, [engineReady, currentTrack.fileUri, currentIndex]);

  // ── Controls: Play, Pause, Next, Prev, Skip, Shuffle, Repeat ──────────────
  const togglePlay = useCallback(async () => {
    try {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (_) {}

    setIsPlaying((prev) => {
      const next = !prev;
      if (next) {
        webViewRef.current?.injectJavaScript(`if (window.resumeTrack) { window.resumeTrack(); } true;`);
      } else {
        webViewRef.current?.injectJavaScript(`if (window.pauseTrack) { window.pauseTrack(); } true;`);
      }
      return next;
    });
  }, []);

  const handleNext = useCallback(async () => {
    try {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (_) {}

    if (audioQueue.length <= 1) {
      webViewRef.current?.injectJavaScript(`if (window.seekTrack) { window.seekTrack(0); window.resumeTrack(); } true;`);
      setCurrentTime(0);
      return;
    }

    if (isShuffle) {
      let nextIdx = Math.floor(Math.random() * audioQueue.length);
      if (nextIdx === currentIndex && audioQueue.length > 1) {
        nextIdx = (nextIdx + 1) % audioQueue.length;
      }
      setCurrentIndex(nextIdx);
    } else {
      setCurrentIndex((prev) => (prev + 1) % audioQueue.length);
    }
    setCurrentTime(0);
    setIsPlaying(true);
  }, [audioQueue.length, isShuffle, currentIndex]);

  const handlePrev = useCallback(async () => {
    try {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (_) {}

    if (currentTime > 3) {
      webViewRef.current?.injectJavaScript(`if (window.seekTrack) { window.seekTrack(0); window.resumeTrack(); } true;`);
      setCurrentTime(0);
      return;
    }

    if (audioQueue.length <= 1) {
      webViewRef.current?.injectJavaScript(`if (window.seekTrack) { window.seekTrack(0); window.resumeTrack(); } true;`);
      setCurrentTime(0);
      return;
    }

    setCurrentIndex((prev) => (prev - 1 + audioQueue.length) % audioQueue.length);
    setCurrentTime(0);
    setIsPlaying(true);
  }, [currentTime, audioQueue.length]);

  // Fast Skip Forward (+10s) or Rewind (-10s)
  const handleSkipSeconds = useCallback(
    async (deltaSec: number) => {
      try {
        if (await isHapticsSupported()) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      } catch (_) {}

      const total = duration > 0 ? duration : 180;
      const target = Math.max(0, Math.min(currentTime + deltaSec, total));
      setCurrentTime(target);
      webViewRef.current?.injectJavaScript(`if (window.skipSeconds) { window.skipSeconds(${deltaSec}); } true;`);
      showToast(deltaSec > 0 ? `+${deltaSec}s ⏩` : `${deltaSec}s ⏪`);
    },
    [currentTime, duration, showToast]
  );

  const toggleShuffle = useCallback(async () => {
    try {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (_) {}

    setIsShuffle((prev) => {
      const next = !prev;
      showToast(next ? 'Shuffle: ON 🔀' : 'Shuffle: OFF ➡️');
      return next;
    });
  }, [showToast]);

  const toggleRepeat = useCallback(async () => {
    try {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (_) {}

    setRepeatMode((prev) => {
      if (prev === 'all') {
        showToast('Repeat: CURRENT SONG 🔂');
        return 'one';
      } else if (prev === 'one') {
        showToast('Repeat: OFF ⏹️');
        return 'off';
      } else {
        showToast('Repeat: ALL SONGS 🔁');
        return 'all';
      }
    });
  }, [showToast]);

  const toggleFavorite = useCallback(async () => {
    try {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (_) {}

    setIsFavorite((prev) => {
      const next = !prev;
      showToast(next ? 'Added to Favorites ❤️' : 'Removed from Favorites 🤍');
      return next;
    });
  }, [showToast]);

  // Reliable, high-precision seek handler
  const handleSeek = useCallback(
    (val: number) => {
      const total = duration > 0 ? duration : 180;
      const target = Math.max(0, Math.min(total, val * (total || 1)));
      setCurrentTime(target);
      webViewRef.current?.injectJavaScript(`if (window.seekTrack) { window.seekTrack(${target}); } true;`);
    },
    [duration]
  );

  const handleTrackEnd = useCallback(() => {
    if (repeatMode === 'one') {
      webViewRef.current?.injectJavaScript(`if (window.seekTrack) { window.seekTrack(0); window.resumeTrack(); } true;`);
      setCurrentTime(0);
      setIsPlaying(true);
    } else if (repeatMode === 'all') {
      handleNext();
    } else {
      if (currentIndex < audioQueue.length - 1) {
        handleNext();
      } else {
        setIsPlaying(false);
      }
    }
  }, [repeatMode, handleNext, currentIndex, audioQueue.length]);

  const handleShareTrack = useCallback(async () => {
    if (!currentTrack) return;
    try {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      if (currentTrack.fileUri) {
        await Share.share({
          url: currentTrack.fileUri,
          title: currentTrack.title,
          message: `Listening to "${currentTrack.title}" on VStream!`,
        });
      }
    } catch (_) {}
  }, [currentTrack]);

  // Handle incoming events from the Web Audio Engine
  const handleWebViewMessage = useCallback(
    (event: any) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'READY') {
          setEngineReady(true);
        } else if (data.type === 'LOADED' || data.type === 'DURATION') {
          if (typeof data.duration === 'number' && data.duration > 0 && isFinite(data.duration)) {
            setDuration(data.duration);
          }
        } else if (data.type === 'PROGRESS') {
          // Never overwrite slider thumb while user's finger is on it
          if (!isSlidingRef.current && typeof data.currentTime === 'number' && isFinite(data.currentTime)) {
            setCurrentTime(data.currentTime);
          }
          if (typeof data.duration === 'number' && data.duration > 0 && isFinite(data.duration)) {
            setDuration(data.duration);
          }
        } else if (data.type === 'ENDED') {
          handleTrackEnd();
        } else if (data.type === 'PLAYING') {
          setIsPlaying(true);
        } else if (data.type === 'PAUSED') {
          setIsPlaying(false);
        }
      } catch (err) {
        console.warn('[MusicPlayer] WebView message parse error:', err);
      }
    },
    [handleTrackEnd]
  );

  const effectiveDuration = duration > 0 ? duration : 180;
  const currentProgress = isSliding
    ? sliderPos
    : Math.min(1, Math.max(0, currentTime / effectiveDuration));

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Headless Audio Engine (Hidden outside layout tree so it never disrupts Yoga flex) */}
      <View style={styles.engineWrapper} pointerEvents="none">
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: AUDIO_ENGINE_HTML, baseUrl: 'file:///' }}
          allowFileAccess={true}
          allowFileAccessFromFileURLs={true}
          allowUniversalAccessFromFileURLs={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          style={styles.hiddenWebView}
          onMessage={handleWebViewMessage}
        />
      </View>

      {/* Global Theme Gradient Background */}
      <LinearGradient
        colors={[
          theme.gradientColors[0] || '#0a0a0c',
          theme.gradientColors[1] || '#111224',
          theme.gradientColors[2] || '#1a1c38',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* ── Main Screen Layout: Clean, Pinned 3-Tier Layout ────────────────── */}
      <View
        style={[
          styles.mainLayout,
          {
            paddingTop: Math.max(insets.top, 14) + 6,
            paddingBottom: Math.max(insets.bottom, 14) + 6,
          },
        ]}
      >
        {/* Tier 1: Top Header Navigation Bar (Right under phone status bar) */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-down" size={24} color="#ffffff" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerEyebrow}>PLAYING FROM DOWNLOADS</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {audioQueue.length > 0 ? `Song ${currentIndex + 1} of ${audioQueue.length}` : 'Offline Audio'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setQueueModalVisible(true)}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="list" size={22} color="#ffffff" />
            {audioQueue.length > 1 && (
              <View style={[styles.queueCountBadge, { backgroundColor: theme.primary }]}>
                <Text style={styles.queueCountText}>{audioQueue.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Tier 2: Center Stage (Hero Vinyl / Artwork + Visualizer) */}
        <View style={styles.centerStage}>
          {/* Animated Glow Aura behind artwork */}
          <Animated.View
            style={[
              styles.discGlowAura,
              {
                backgroundColor: theme.glow || 'rgba(83, 90, 255, 0.35)',
                transform: [{ scale: pulseAnim }],
              },
            ]}
          />

          {displayMode === 'vinyl' ? (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setDisplayMode('artwork')}
              style={styles.discTouchable}
            >
              {/* Outer Grooved Vinyl Disc */}
              <Animated.View
                style={[
                  styles.vinylRecord,
                  {
                    transform: [{ rotate: spinInterpolate }],
                  },
                ]}
              >
                {/* Vinyl Grooves Texture */}
                <View style={styles.vinylGroove1} />
                <View style={styles.vinylGroove2} />
                <View style={styles.vinylGroove3} />

                {/* Vinyl Gloss Sheen Highlights */}
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.15)', 'transparent', 'rgba(255, 255, 255, 0.05)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />

                {/* Inner Album Label */}
                <View style={[styles.vinylLabel, { borderColor: theme.primary }]}>
                  {currentTrack.poster ? (
                    <Image source={{ uri: currentTrack.poster }} style={styles.vinylThumb} resizeMode="cover" />
                  ) : (
                    <View style={[styles.vinylThumb, { backgroundColor: '#161622' }]}>
                      <Ionicons name="musical-notes" size={36} color={theme.primaryLight || '#ffffff'} />
                    </View>
                  )}
                  {/* Center Spindle Hole */}
                  <View style={styles.vinylCenterHole} />
                </View>
              </Animated.View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setDisplayMode('vinyl')}
              style={styles.discTouchable}
            >
              <View style={[styles.fullArtworkCard, { borderColor: theme.cardBorder || 'rgba(255, 255, 255, 0.14)' }]}>
                {currentTrack.poster ? (
                  <Image source={{ uri: currentTrack.poster }} style={styles.fullArtworkImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.fullArtworkImage, { backgroundColor: '#16161f', alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name="musical-notes" size={64} color={theme.primaryLight || '#ffffff'} />
                  </View>
                )}
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.5)']}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
              </View>
            </TouchableOpacity>
          )}

          {/* Mode switch pill hint */}
          <TouchableOpacity
            style={styles.modeSwitchPill}
            onPress={() => setDisplayMode((prev) => (prev === 'vinyl' ? 'artwork' : 'vinyl'))}
            activeOpacity={0.7}
          >
            <Ionicons
              name={displayMode === 'vinyl' ? 'image-outline' : 'disc-outline'}
              size={12}
              color="rgba(255, 255, 255, 0.75)"
              style={{ marginRight: 5 }}
            />
            <Text style={styles.modeSwitchText}>
              {displayMode === 'vinyl' ? 'Show Album Artwork' : 'Show Vinyl Disc'}
            </Text>
          </TouchableOpacity>

          {/* ── 22-Bar Native Visualizer Waves ─────────────────────────────── */}
          <View style={styles.visualizerContainer}>
            {barAnims.map((anim, idx) => (
              <Animated.View
                key={`vbar-${idx}`}
                style={[
                  styles.visualizerBar,
                  {
                    backgroundColor: idx % 2 === 0 ? theme.primary : (theme.primaryLight || '#00e5ff'),
                    transform: [{ scaleY: anim }],
                  },
                ]}
              />
            ))}
          </View>
        </View>

        {/* Tier 3: Bottom Controls Deck (Metadata + Scrubber + Controls + Utilities) */}
        <View style={styles.bottomSection}>
          {/* Track Title and Artist / Info + Favorite & Share */}
          <View style={styles.trackInfoRow}>
            <View style={styles.trackMetaTextWrap}>
              <Text style={styles.trackTitle} numberOfLines={1}>
                {currentTrack.title || 'Unknown Track'}
              </Text>
              <Text style={styles.trackArtist} numberOfLines={1}>
                {downloadService.formatBytes(currentTrack.totalBytes || currentTrack.downloadedBytes)} • High Quality MP3
              </Text>
            </View>

            <View style={styles.trackActionsRight}>
              <TouchableOpacity
                style={styles.actionIconBtn}
                onPress={toggleFavorite}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              >
                <Ionicons
                  name={isFavorite ? 'heart' : 'heart-outline'}
                  size={22}
                  color={isFavorite ? '#ff3b30' : 'rgba(255, 255, 255, 0.75)'}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionIconBtn}
                onPress={handleShareTrack}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              >
                <Ionicons name="share-outline" size={20} color="rgba(255, 255, 255, 0.75)" />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Progress Slider with Floating Time Tooltip ──────────────────── */}
          <View style={styles.sliderContainer}>
            {/* Real-time floating timestamp tooltip above slider thumb */}
            {isSliding && (
              <View
                style={[
                  styles.scrubTooltipBubble,
                  {
                    left: `${Math.max(8, Math.min(92, (sliderPos || currentProgress) * 100))}%`,
                  },
                ]}
                pointerEvents="none"
              >
                <Text style={styles.scrubTooltipText}>
                  {formatTime((sliderPos || currentProgress) * effectiveDuration)}
                </Text>
              </View>
            )}

            <Slider
              value={currentProgress}
              slideOnTap={true}
              hitSlop={{ top: 20, bottom: 20, left: 10, right: 10 }}
              thumbSize={17}
              trackHeight={4.5}
              onSlidingStart={(val) => {
                isSlidingRef.current = true;
                setIsSliding(true);
                setSliderPos(val);
              }}
              onValueChange={(val) => {
                isSlidingRef.current = true;
                setIsSliding(true);
                setSliderPos(val);
              }}
              onSlidingComplete={(val) => {
                isSlidingRef.current = false;
                setIsSliding(false);
                setSliderPos(val);
                handleSeek(val);
              }}
              minimumTrackTintColor={theme.primary}
              maximumTrackTintColor="rgba(255, 255, 255, 0.2)"
              thumbTintColor="#ffffff"
              style={styles.slider}
            />

            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(isSliding ? sliderPos * effectiveDuration : currentTime)}</Text>
              <Text style={styles.timeText}>
                {duration > 0
                  ? `-${formatTime(Math.max(0, duration - (isSliding ? sliderPos * effectiveDuration : currentTime)))}`
                  : formatTime(effectiveDuration)}
              </Text>
            </View>
          </View>

          {/* ── Main Music Controls Deck with Forward/Rewind 10s ────────────── */}
          <View style={styles.controlsRow}>
            {/* Shuffle Button */}
            <TouchableOpacity
              style={[
                styles.sideControlBtn,
                isShuffle && { backgroundColor: theme.iconBg || 'rgba(83, 90, 255, 0.22)' },
              ]}
              onPress={toggleShuffle}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="shuffle"
                size={20}
                color={isShuffle ? (theme.primaryLight || '#00e5ff') : 'rgba(255, 255, 255, 0.5)'}
              />
            </TouchableOpacity>

            {/* Previous Track Button */}
            <TouchableOpacity
              style={styles.skipTrackBtn}
              onPress={handlePrev}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="play-skip-back" size={24} color="#ffffff" />
            </TouchableOpacity>

            {/* Fast Rewind 10s Button */}
            <TouchableOpacity
              style={styles.seekStepBtn}
              onPress={() => handleSkipSeconds(-10)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="play-back" size={18} color="rgba(255, 255, 255, 0.85)" />
              <Text style={styles.seekStepBadgeText}>10</Text>
            </TouchableOpacity>

            {/* Large Center Play / Pause Button */}
            <TouchableOpacity
              style={[
                styles.mainPlayBtn,
                {
                  backgroundColor: theme.primary,
                  shadowColor: theme.glow || theme.primary,
                },
              ]}
              onPress={togglePlay}
              activeOpacity={0.85}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={32}
                color="#ffffff"
                style={{ marginLeft: isPlaying ? 0 : 3 }}
              />
            </TouchableOpacity>

            {/* Fast Forward 10s Button */}
            <TouchableOpacity
              style={styles.seekStepBtn}
              onPress={() => handleSkipSeconds(10)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="play-forward" size={18} color="rgba(255, 255, 255, 0.85)" />
              <Text style={styles.seekStepBadgeText}>10</Text>
            </TouchableOpacity>

            {/* Next Track Button */}
            <TouchableOpacity
              style={styles.skipTrackBtn}
              onPress={handleNext}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="play-skip-forward" size={24} color="#ffffff" />
            </TouchableOpacity>

            {/* Repeat Button */}
            <TouchableOpacity
              style={[
                styles.sideControlBtn,
                repeatMode !== 'off' && { backgroundColor: theme.iconBg || 'rgba(83, 90, 255, 0.22)' },
              ]}
              onPress={toggleRepeat}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={repeatMode === 'one' ? 'repeat' : 'repeat-outline'}
                size={20}
                color={repeatMode !== 'off' ? (theme.primaryLight || '#00e5ff') : 'rgba(255, 255, 255, 0.5)'}
              />
              {repeatMode === 'one' && (
                <View style={styles.repeatBadgeOne}>
                  <Text style={styles.repeatBadgeOneText}>1</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Sub Bar: Speed and Queue Quick Actions ─────────────────────── */}
          <View style={styles.subActionsBar}>
            <TouchableOpacity
              style={styles.subActionChip}
              onPress={() => setSpeedModalVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="speedometer-outline" size={13} color="rgba(255, 255, 255, 0.75)" />
              <Text style={styles.subActionChipText}>{playbackSpeed}x Speed</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.subActionChip}
              onPress={() => setQueueModalVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="musical-notes-outline" size={13} color="rgba(255, 255, 255, 0.75)" />
              <Text style={styles.subActionChipText}>
                {audioQueue.length} {audioQueue.length === 1 ? 'Track' : 'Tracks'} in Queue
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Toast Notification Pill ────────────────────────────────────────── */}
      {toastMessage && (
        <View style={styles.toastContainer} pointerEvents="none">
          <View style={[styles.toastBubble, { borderColor: theme.primary }]}>
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </View>
      )}

      {/* ── Queue Bottom Sheet Modal ────────────────────────────────────────── */}
      <Modal
        visible={queueModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setQueueModalVisible(false)}
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
        statusBarTranslucent={true}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalDismissArea}
            activeOpacity={1}
            onPress={() => setQueueModalVisible(false)}
          />
          <View style={styles.queueSheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.queueHeaderRow}>
              <View>
                <Text style={styles.queueHeaderTitle}>Songs Queue</Text>
                <Text style={styles.queueHeaderSub}>
                  {audioQueue.length} Downloaded {audioQueue.length === 1 ? 'Song' : 'Songs'}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeSheetBtn}
                onPress={() => setQueueModalVisible(false)}
              >
                <Ionicons name="close" size={22} color="rgba(255, 255, 255, 0.7)" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={audioQueue}
              keyExtractor={(item, idx) => `${item.id}-${idx}`}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }}
              renderItem={({ item, index }) => {
                const isCurrent = index === currentIndex;

                return (
                  <TouchableOpacity
                    style={[
                      styles.queueTrackCard,
                      isCurrent && {
                        backgroundColor: theme.iconBg || 'rgba(83, 90, 255, 0.16)',
                        borderColor: theme.primary,
                      },
                    ]}
                    onPress={() => {
                      setCurrentIndex(index);
                      setCurrentTime(0);
                      setIsPlaying(true);
                      setQueueModalVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.queueIndexCol}>
                      {isCurrent && isPlaying ? (
                        <Ionicons name="volume-high" size={18} color={theme.primaryLight || '#00e5ff'} />
                      ) : (
                        <Text style={[styles.queueIndexText, isCurrent && { color: theme.primaryLight }]}>
                          {index + 1}
                        </Text>
                      )}
                    </View>

                    <View style={styles.queueThumbWrap}>
                      {item.poster ? (
                        <Image source={{ uri: item.poster }} style={styles.queueThumb} resizeMode="cover" />
                      ) : (
                        <View style={[styles.queueThumb, { backgroundColor: '#22222e', alignItems: 'center', justifyContent: 'center' }]}>
                          <Ionicons name="musical-note" size={16} color="rgba(255, 255, 255, 0.4)" />
                        </View>
                      )}
                    </View>

                    <View style={styles.queueTrackInfo}>
                      <Text
                        style={[
                          styles.queueTrackTitle,
                          isCurrent && { color: theme.primaryLight || '#ffffff', fontWeight: '700' },
                        ]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      <Text style={styles.queueTrackMeta}>
                        {downloadService.formatBytes(item.totalBytes || item.downloadedBytes)} • MP3
                      </Text>
                    </View>

                    {isCurrent && (
                      <View style={[styles.activePlayingDot, { backgroundColor: theme.primary }]} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ── Playback Speed Modal ────────────────────────────────────────────── */}
      <Modal
        visible={speedModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSpeedModalVisible(false)}
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
        statusBarTranslucent={true}
      >
        <TouchableOpacity
          style={styles.modalCenterBackdrop}
          activeOpacity={1}
          onPress={() => setSpeedModalVisible(false)}
        >
          <View style={styles.speedDialogCard}>
            <Text style={styles.speedDialogTitle}>Playback Speed</Text>

            {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => {
              const isSelected = playbackSpeed === rate;

              return (
                <TouchableOpacity
                  key={`rate-${rate}`}
                  style={[
                    styles.speedOptionRow,
                    isSelected && { backgroundColor: theme.iconBg || 'rgba(83, 90, 255, 0.16)' },
                  ]}
                  onPress={() => {
                    setPlaybackSpeed(rate);
                    webViewRef.current?.injectJavaScript(`if (window.setRate) { window.setRate(${rate}); } true;`);
                    setSpeedModalVisible(false);
                    showToast(`Speed: ${rate}x`);
                  }}
                >
                  <Text style={[styles.speedOptionText, isSelected && { color: theme.primaryLight || '#00e5ff', fontWeight: '700' }]}>
                    {rate === 1.0 ? '1.0x (Normal)' : `${rate}x`}
                  </Text>
                  {isSelected && <Ionicons name="checkmark" size={18} color={theme.primaryLight || '#00e5ff'} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default function MusicPlayerScreen() {
  const router = useRouter();

  return (
    <MusicPlayerErrorBoundary onBack={() => router.back()}>
      <MusicPlayerScreenInner />
    </MusicPlayerErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  engineWrapper: {
    position: 'absolute',
    top: -500,
    left: -500,
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  hiddenWebView: {
    width: 1,
    height: 1,
  },
  mainLayout: {
    flex: 1,
    justifyContent: 'space-between',
  },

  // ── Top Header ───────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    flexShrink: 0,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 12,
  },
  headerEyebrow: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  headerSubtitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  queueCountBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  queueCountText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },

  // ── Center Stage ─────────────────────────────────────────────────────────────
  centerStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  discGlowAura: {
    position: 'absolute',
    width: DISC_SIZE * 0.95,
    height: DISC_SIZE * 0.95,
    borderRadius: (DISC_SIZE * 0.95) / 2,
    opacity: 0.4,
  },
  discTouchable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  vinylRecord: {
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: DISC_SIZE / 2,
    backgroundColor: '#0c0c10',
    borderWidth: 3,
    borderColor: '#1d1d26',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 16,
  },
  vinylGroove1: {
    position: 'absolute',
    width: DISC_SIZE * 0.86,
    height: DISC_SIZE * 0.86,
    borderRadius: (DISC_SIZE * 0.86) / 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  vinylGroove2: {
    position: 'absolute',
    width: DISC_SIZE * 0.72,
    height: DISC_SIZE * 0.72,
    borderRadius: (DISC_SIZE * 0.72) / 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  vinylGroove3: {
    position: 'absolute',
    width: DISC_SIZE * 0.58,
    height: DISC_SIZE * 0.58,
    borderRadius: (DISC_SIZE * 0.58) / 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  vinylLabel: {
    width: DISC_SIZE * 0.44,
    height: DISC_SIZE * 0.44,
    borderRadius: (DISC_SIZE * 0.44) / 2,
    overflow: 'hidden',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161622',
  },
  vinylThumb: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vinylCenterHole: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#0a0a0c',
    borderWidth: 2,
    borderColor: '#2d2d3d',
  },
  fullArtworkCard: {
    width: DISC_SIZE * 0.96,
    height: DISC_SIZE * 0.96,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.65,
    shadowRadius: 18,
    elevation: 14,
  },
  fullArtworkImage: {
    width: '100%',
    height: '100%',
  },
  modeSwitchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modeSwitchText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Spectrum Visualizer ──────────────────────────────────────────────────────
  visualizerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
    gap: 4,
    marginTop: 10,
    paddingHorizontal: 20,
  },
  visualizerBar: {
    width: 3.5,
    height: 22,
    borderRadius: 2,
  },

  // ── Bottom Controls Section ──────────────────────────────────────────────────
  bottomSection: {
    paddingHorizontal: 22,
    flexShrink: 0,
  },
  trackInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  trackMetaTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  trackTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  trackArtist: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 13,
    marginTop: 3,
    fontWeight: '500',
  },
  trackActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Scrubber Slider ──────────────────────────────────────────────────────────
  sliderContainer: {
    marginBottom: 6,
    position: 'relative',
  },
  slider: {
    width: '100%',
    height: 32,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: -2,
  },
  timeText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  scrubTooltipBubble: {
    position: 'absolute',
    top: -28,
    transform: [{ translateX: -24 }],
    backgroundColor: 'rgba(12, 12, 18, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  scrubTooltipText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  // ── Controls Row ─────────────────────────────────────────────────────────────
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 6,
    paddingHorizontal: 2,
  },
  sideControlBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatBadgeOne: {
    position: 'absolute',
    top: 4,
    right: 5,
    backgroundColor: '#00e5ff',
    borderRadius: 4,
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatBadgeOneText: {
    color: '#000000',
    fontSize: 8,
    fontWeight: '900',
  },
  skipTrackBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekStepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  seekStepBadgeText: {
    position: 'absolute',
    bottom: 3,
    right: 5,
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '900',
  },
  mainPlayBtn: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: 12,
  },

  // ── Sub Actions Bar ──────────────────────────────────────────────────────────
  subActionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
  },
  subActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  subActionChipText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Toast Pill ───────────────────────────────────────────────────────────────
  toastContainer: {
    position: 'absolute',
    top: 75,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  toastBubble: {
    backgroundColor: 'rgba(18, 18, 26, 0.96)',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 10,
  },
  toastText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Queue Modal ──────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  queueSheet: {
    backgroundColor: '#12121a',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: SCREEN_HEIGHT * 0.72,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  queueHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  queueHeaderTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  queueHeaderSub: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  closeSheetBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueTrackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 6,
  },
  queueIndexCol: {
    width: 26,
    alignItems: 'center',
  },
  queueIndexText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 13,
    fontWeight: '700',
  },
  queueThumbWrap: {
    width: 42,
    height: 42,
    borderRadius: 8,
    overflow: 'hidden',
    marginHorizontal: 10,
  },
  queueThumb: {
    width: '100%',
    height: '100%',
  },
  queueTrackInfo: {
    flex: 1,
  },
  queueTrackTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  queueTrackMeta: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 11,
    marginTop: 3,
  },
  activePlayingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },

  // ── Speed Modal ──────────────────────────────────────────────────────────────
  modalCenterBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  speedDialogCard: {
    width: '100%',
    backgroundColor: '#161622',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  speedDialogTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center',
  },
  speedOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginBottom: 6,
  },
  speedOptionText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 15,
    fontWeight: '500',
  },

  // ── Error Boundary Screen ────────────────────────────────────────────────────
  errorContainer: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  errorTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 16,
  },
  errorSub: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  errorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#535aff',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 24,
    marginTop: 24,
  },
  errorBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
