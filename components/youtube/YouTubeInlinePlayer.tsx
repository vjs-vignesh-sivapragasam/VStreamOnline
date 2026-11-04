import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Video, { VideoRef, ResizeMode } from 'react-native-video';
import Slider from '@react-native-assets/slider';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import KSPlayerView, { isKSPlayerAvailable, KSPlayerRef } from '@/components/ksplayer/KSPlayerView';
import { isRCTVideoAvailable } from '@/components/nativeplayer';
import { WebView } from 'react-native-webview';

export interface YouTubeInlinePlayerProps {
  videoId?: string;
  title?: string;
  channel?: string;
  streamUrl: string | null;
  poster: string;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  seekTarget: number | null;
  playbackError?: string | null;
  currentQuality?: string;
  playbackSpeed?: number;
  isLooping?: boolean;
  availableQualities?: string[];
  onChangeQuality?: (quality: string) => void;
  onSetPlaybackSpeed?: (speed: number) => void;
  onToggleLoop?: () => void;
  onTogglePlay: () => void;
  onMinimize: () => void;
  onFullScreen: () => void;
  onSeek: (seconds: number) => void;
  onClearSeekTarget: () => void;
  onProgress: (currentTime: number, duration: number) => void;
  setIsBuffering: (buffering: boolean) => void;
  onPlaybackError?: (error: string) => void;
  onRetry?: () => void;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs > 0) {
    return `${hrs}:${remMins < 10 ? '0' : ''}${remMins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}



const INJECTED_CLEAN_PLAYER_JS = `
  (function() {
    function injectStyle() {
      if (document.getElementById('clean-yt-style')) return;
      const style = document.createElement('style');
      style.id = 'clean-yt-style';
      style.textContent = \`
        /* Hide YouTube mobile top bar: logo, search, menu, open app */
        #header,
        ytm-header,
        header,
        .mobile-topbar-header,
        .ghost-header {
          display: none !important;
          visibility: hidden !important;
          height: 0 !important;
          overflow: hidden !important;
        }

        /* Hide duplicate title banner below the video */
        ytm-slim-video-metadata-renderer,
        .slim-video-metadata-header,
        .slim-video-information-holder,
        .watch-below-the-player,
        #related,
        ytm-item-section-renderer,
        ytm-comment-section-renderer,
        ytm-pivot-bar-renderer,
        ytm-engagement-panel-section-list-renderer {
          display: none !important;
          visibility: hidden !important;
          height: 0 !important;
          overflow: hidden !important;
        }

        /* Hide Open App buttons, dialogs, promos */
        ytm-open-app-button,
        .open-in-app-dialog,
        .upsell-dialog,
        ytm-upsell-dialog-renderer,
        ytm-promoted-sparkles-web-renderer,
        ytm-bottom-sheet-renderer {
          display: none !important;
          visibility: hidden !important;
          height: 0 !important;
          overflow: hidden !important;
        }

        /* Clean 16:9 container without scrolling */
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          background-color: #000000 !important;
        }
      \`;
      (document.head || document.documentElement).appendChild(style);
    }

    injectStyle();

    function setupQualityAndPlay() {
      const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
      if (player) {
        try {
          if (typeof player.setPlaybackQualityRange === 'function') {
            player.setPlaybackQualityRange('large', 'hd720');
          }
          if (typeof player.setPlaybackQuality === 'function') {
            player.setPlaybackQuality('large');
          }
          if (typeof player.playVideo === 'function') {
            player.playVideo();
          }
        } catch (e) {}
      }
      const v = document.querySelector('video');
      if (v && v.paused) {
        v.play().catch(() => {});
      }
      const playBtn = document.querySelector('.ytp-large-play-button, .player-control-play-pause-icon');
      if (playBtn && document.querySelector('video')?.paused) {
        try { playBtn.click(); } catch(e) {}
      }
    }

    setupQualityAndPlay();

    let count = 0;
    const interval = setInterval(function() {
      count++;
      injectStyle();
      setupQualityAndPlay();
      if (count > 10) clearInterval(interval);
    }, 400);
  })();
  true;
`;

export const YouTubeInlinePlayer: React.FC<YouTubeInlinePlayerProps> = ({
  videoId,
  title,
  channel,
  streamUrl,
  poster,
  isPlaying,
  isBuffering,
  currentTime,
  duration,
  seekTarget,
  playbackError,
  currentQuality = '480p',
  playbackSpeed = 1.0,
  isLooping = false,
  availableQualities = ['Auto', '1080p', '720p', '480p', '360p'],
  onChangeQuality,
  onSetPlaybackSpeed,
  onToggleLoop,
  onTogglePlay,
  onMinimize,
  onFullScreen,
  onSeek,
  onClearSeekTarget,
  onProgress,
  setIsBuffering,
  onPlaybackError,
  onRetry,
}) => {
  const [showControls, setShowControls] = useState(false);
  const [videoResizeMode, setVideoResizeMode] = useState<'cover' | 'contain'>('cover');
  const [feedbackPill, setFeedbackPill] = useState<string | null>(null);
  const feedbackTimerRef = useRef<any>(null);
  const [isSliding, setIsSliding] = useState(false);
  const [sliderPos, setSliderPos] = useState(0);
  // Default to react-native-video (AVPlayer on iOS, ExoPlayer on Android) for native MP4 streaming
  const [useKSPlayer, setUseKSPlayer] = useState(false);
  const [useWebFallback, setUseWebFallback] = useState(false);

  useEffect(() => {
    setUseWebFallback(false);
  }, [videoId]);

  // Seamless auto-fallback: if direct stream fails (e.g. 403 or engine starting), immediately play via web player
  
  useEffect(() => {
    if (!streamUrl && videoId && !useWebFallback) {
      const timer = setTimeout(() => {
        console.log('[YouTubeInlinePlayer] ⏱️ Engine stream pending, seamlessly playing via clean Web Player');
        setUseWebFallback(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [streamUrl, videoId, useWebFallback]);

  useEffect(() => {
    if (playbackError && videoId) {
      console.log('[YouTubeInlinePlayer] 🔄 Error encountered, seamlessly auto-playing via Web Player:', playbackError);
      setUseWebFallback(true);
    }
  }, [playbackError, videoId]);

  const handleOpenYouTubeApp = useCallback(async () => {
    if (!videoId) return;
    const appUrl = `vnd.youtube://${videoId}`;
    const webUrl = `https://www.youtube.com/watch?v=${videoId}`;
    try {
      const canOpen = await Linking.canOpenURL(appUrl);
      if (canOpen) {
        await Linking.openURL(appUrl);
      } else {
        await Linking.openURL(webUrl);
      }
    } catch {
      await Linking.openURL(webUrl);
    }
  }, [videoId]);

  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [settingsSubView, setSettingsSubView] = useState<'main' | 'quality' | 'speed'>('main');

  const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

  const playerHeaders: Record<string, string> = useMemo(() => {
    const headers: Record<string, string> = {};
    if (streamUrl?.includes('googlevideo.com')) {
      headers['User-Agent'] = Platform.OS === 'ios'
        ? 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X; en_US)'
        : 'com.google.android.youtube/19.29.37 (Linux; U; Android 14; en_US)';
      headers['Accept'] = '*/*';
    }
    return headers;
  }, [streamUrl]);

  const hideTimerRef = useRef<any>(null);
  const videoRef = useRef<VideoRef>(null);
  const ksRef = useRef<KSPlayerRef>(null);
  // Initially hide controls when a new video stream loads
  useEffect(() => {
    setShowControls(false);
  }, [streamUrl]);

  useEffect(() => {
    console.log('[YouTubeInlinePlayer] 🎬 streamUrl:', streamUrl ? streamUrl.substring(0, 85) + '...' : 'null');
    console.log('[YouTubeInlinePlayer] 📱 Platform:', Platform.OS, '| Engine:', useKSPlayer ? 'KSPlayer (fallback)' : 'react-native-video (AVPlayer/ExoPlayer)');
    console.log('[YouTubeInlinePlayer] ⏯️ isPlaying:', isPlaying, '| isBuffering:', isBuffering, '| Error:', playbackError || 'none');
  }, [streamUrl, isPlaying, isBuffering, useKSPlayer, playbackError]);

  // Reset auto-hide timer
  const scheduleControlsHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3500);
  }, []);

  const handleToggleResizeMode = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setVideoResizeMode((prev) => {
      const next = prev === 'cover' ? 'contain' : 'cover';
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      setFeedbackPill(next === 'cover' ? 'Fit to Screen' : 'Original (Contain)');
      feedbackTimerRef.current = setTimeout(() => {
        setFeedbackPill(null);
      }, 1800);
      return next;
    });
    scheduleControlsHide();
  }, [scheduleControlsHide]);

  const [isAutoplay, setIsAutoplay] = useState(true);
  const [isCCOn, setIsCCOn] = useState(false);

  const handleToggleAutoplay = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsAutoplay((prev) => {
      const next = !prev;
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      setFeedbackPill(next ? 'Autoplay is on' : 'Autoplay is off');
      feedbackTimerRef.current = setTimeout(() => {
        setFeedbackPill(null);
      }, 1800);
      return next;
    });
    scheduleControlsHide();
  }, [scheduleControlsHide]);

  const handleToggleCC = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsCCOn((prev) => {
      const next = !prev;
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      setFeedbackPill(next ? 'Subtitles turned on' : 'Subtitles turned off');
      feedbackTimerRef.current = setTimeout(() => {
        setFeedbackPill(null);
      }, 1800);
      return next;
    });
    scheduleControlsHide();
  }, [scheduleControlsHide]);

  const handleCastPress = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setFeedbackPill('Searching for cast devices...');
    feedbackTimerRef.current = setTimeout(() => {
      setFeedbackPill(null);
    }, 1800);
    scheduleControlsHide();
  }, [scheduleControlsHide]);

  const handleToggleControls = useCallback(() => {
    setShowControls((prev) => {
      const next = !prev;
      if (next) scheduleControlsHide();
      return next;
    });
  }, [scheduleControlsHide]);

  useEffect(() => {
    if (isPlaying && showControls && !isSliding) {
      scheduleControlsHide();
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isPlaying, showControls, isSliding, scheduleControlsHide]);

  // Handle seek target (native player)
  useEffect(() => {
    if (seekTarget !== null) {
      console.log('[YouTubeInlinePlayer] ⏩ Seeking player to:', seekTarget);
      if (useKSPlayer) {
        ksRef.current?.seek(seekTarget);
      } else {
        videoRef.current?.seek(seekTarget);
      }
      onClearSeekTarget();
    }
  }, [seekTarget, useKSPlayer, onClearSeekTarget]);

  // Seek forward / backward 10s
  const handleSkip = useCallback(
    (offsetSec: number) => {
      const newTime = Math.max(0, Math.min(duration || 1, currentTime + offsetSec));
      console.log(`[YouTubeInlinePlayer] ⏩ Skip ${offsetSec}s -> new target: ${newTime}s`);
      onSeek(newTime);
      scheduleControlsHide();
    },
    [currentTime, duration, onSeek, scheduleControlsHide]
  );

  const progressPct = duration > 0 ? (isSliding ? sliderPos : currentTime / duration) : 0;

  if ((useWebFallback || (playbackError && !streamUrl)) && videoId) {
    return (
      <View style={styles.container}>
        <WebView
          key={videoId}
          source={{
            uri: `https://m.youtube.com/watch?v=${videoId}`,
          }}
          style={StyleSheet.absoluteFill}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsFullscreenVideo={true}
          scrollEnabled={false}
          bounces={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          injectedJavaScript={INJECTED_CLEAN_PLAYER_JS}
          userAgent={
            Platform.OS === 'ios'
              ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
              : 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
          }
          onShouldStartLoadWithRequest={(request) => {
            // Only block app switching / store URLs; never block web traffic
            if (
              request.url.startsWith('vnd.youtube') ||
              request.url.startsWith('intent://') ||
              request.url.startsWith('itms-appss://')
            ) {
              return false;
            }
            return true;
          }}
          onLoadEnd={() => setIsBuffering(false)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {streamUrl ? (
        useKSPlayer && isKSPlayerAvailable() ? (
          <KSPlayerView
            ref={ksRef}
            url={streamUrl}
            headers={playerHeaders}
            paused={!isPlaying}
            rate={playbackSpeed}
            resizeMode={videoResizeMode}
            style={StyleSheet.absoluteFill}
            onProgress={(e) => {
              if (!isSliding) {
                onProgress(e.currentTime, e.duration || duration);
              }
            }}
            onLoad={(e) => {
              console.log('[YouTubeInlinePlayer] ✅ KSPlayer onLoad event fired! Duration:', e.duration, 'currentTime:', e.currentTime);
              setIsBuffering(false);
              onProgress(e.currentTime || 0, e.duration || duration);
            }}
            onBuffer={(e) => {
              console.log('[YouTubeInlinePlayer] ⏳ KSPlayer onBuffer:', e.isBuffering);
              setIsBuffering(e.isBuffering);
            }}
            onError={(e) => {
              console.error('[YouTubeInlinePlayer] ❌ KSPlayer onError fired:', JSON.stringify(e));
              setIsBuffering(false);
              setUseKSPlayer(false);
              setUseWebFallback(true);
              onPlaybackError?.(e?.error?.message || 'KSPlayer playback error');
            }}
          />
        ) : (
          <Video
            ref={videoRef}
            source={{
              uri: streamUrl,
              headers: playerHeaders,
            }}
            paused={!isPlaying}
            rate={playbackSpeed}
            resizeMode={videoResizeMode}
            style={StyleSheet.absoluteFill}
            controls={false}
            playInBackground={false}
            playWhenInactive={false}
            ignoreSilentSwitch="ignore"
            progressUpdateInterval={250}
            onProgress={(e) => {
              if (!isSliding) {
                onProgress(e.currentTime, e.seekableDuration || duration);
              }
            }}
            onLoad={(e) => {
              console.log('[YouTubeInlinePlayer] ✅ react-native-video onLoad fired! Duration:', e.duration, 'currentTime:', currentTime);
              setIsBuffering(false);
              if (seekTarget !== null && seekTarget > 0) {
                videoRef.current?.seek(seekTarget);
              } else if (currentTime > 0) {
                videoRef.current?.seek(currentTime);
              }
              onProgress(currentTime > 0 ? currentTime : 0, e.duration || duration);
            }}
            onBuffer={(e) => {
              console.log('[YouTubeInlinePlayer] ⏳ react-native-video onBuffer:', e.isBuffering);
              setIsBuffering(e.isBuffering);
            }}
            onEnd={() => {
              if (isLooping) {
                videoRef.current?.seek(0);
              }
            }}
            onError={(e) => {
              console.error('[YouTubeInlinePlayer] ❌ react-native-video onError fired:', JSON.stringify(e));
              setIsBuffering(false);
              if (isKSPlayerAvailable() && !useKSPlayer) {
                console.log('[YouTubeInlinePlayer] 🔄 Falling back to KSPlayer...');
                setUseKSPlayer(true);
                return;
              }
              const errStr = e?.error?.errorString || 'Video stream could not be opened';
              setUseWebFallback(true);
              onPlaybackError?.(errStr);
            }}
          />
        )
      ) : (
        <View style={StyleSheet.absoluteFill}>
          {poster ? (
            <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#141416' }]} />
          )}
          <View style={[StyleSheet.absoluteFill, styles.loadingBackdrop]}>
            {isBuffering && !playbackError && (
              <ActivityIndicator size="large" color="#ffffff" />
            )}
            {playbackError ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle-outline" size={36} color="#ff4444" />
                <Text style={styles.errorTitle}>Playback Error</Text>
                <Text style={styles.errorText} numberOfLines={3}>
                  {playbackError}
                </Text>
                {videoId ? (
                  <View style={{ width: '100%', alignItems: 'center', marginTop: 10 }}>
                    <TouchableOpacity
                      style={[styles.retryButton, { backgroundColor: '#FF0000', paddingHorizontal: 16 }]}
                      onPress={handleOpenYouTubeApp}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="logo-youtube" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                      <Text style={styles.retryButtonText}>Watch in YouTube App (1-Tap)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.retryButton, { backgroundColor: 'rgba(255, 255, 255, 0.15)', marginTop: 8, paddingHorizontal: 16 }]}
                      onPress={() => setUseWebFallback(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="globe-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                      <Text style={styles.retryButtonText}>Play in Mobile Web Player</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {onRetry && (
                  <TouchableOpacity style={[styles.retryButton, { marginTop: 8, backgroundColor: 'transparent' }]} onPress={onRetry} activeOpacity={0.8}>
                    <Ionicons name="refresh" size={14} color="#8E8E93" style={{ marginRight: 4 }} />
                    <Text style={[styles.retryButtonText, { color: '#8E8E93', fontSize: 12 }]}>Retry Local Engine Connection</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}
          </View>
        </View>
      )}

      {/* Tap Overlay to reveal/hide controls */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={handleToggleControls}
      />

      {/* On-Screen Error Overlay (if streamUrl set but playback failed) */}
      {playbackError && streamUrl ? (
        <View style={[StyleSheet.absoluteFill, styles.errorOverlay]} pointerEvents="box-none">
          <Ionicons name="alert-circle-outline" size={40} color="#ff4444" />
          <Text style={styles.errorTitle}>Playback Error</Text>
          <Text style={styles.errorText} numberOfLines={2}>
            {playbackError}
          </Text>
          {onRetry && (
            <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.8}>
              <Ionicons name="refresh" size={15} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.retryButtonText}>Switch / Retry Stream</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}



      {/* Visual Feedback Pill for Aspect Ratio */}
      {feedbackPill ? (
        <View style={styles.gestureFeedbackPill} pointerEvents="none">
          <Ionicons
            name={videoResizeMode === 'cover' ? 'expand' : 'contract'}
            size={14}
            color="#ffffff"
            style={{ marginRight: 6 }}
          />
          <Text style={styles.gestureFeedbackText}>{feedbackPill}</Text>
        </View>
      ) : null}

      {/* Controls Overlay (native player only) */}
      {showControls && (
        <View style={styles.controlsOverlay} pointerEvents="box-none">
          {/* Top Bar: Real YouTube Icons (Chevron Down, Autoplay, Cast, CC, Screen Fit, Settings) */}
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={onMinimize}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-down" size={26} color="#ffffff" />
            </TouchableOpacity>

            <View style={styles.topBarRight}>
              {/* Autoplay Toggle Switch */}
              <TouchableOpacity
                style={[styles.autoplayToggleTrack, isAutoplay && styles.autoplayToggleTrackOn]}
                onPress={handleToggleAutoplay}
                activeOpacity={0.8}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <View style={[styles.autoplayToggleThumb, isAutoplay && styles.autoplayToggleThumbOn]}>
                  <Ionicons
                    name={isAutoplay ? 'play' : 'pause'}
                    size={8}
                    color="#000000"
                    style={isAutoplay ? { marginLeft: 1 } : undefined}
                  />
                </View>
              </TouchableOpacity>

              {/* Cast Icon */}
              <TouchableOpacity
                style={styles.topIconBtn}
                onPress={handleCastPress}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <Ionicons name="tv-outline" size={20} color="#ffffff" />
              </TouchableOpacity>

              {/* Closed Captions (CC) Icon */}
              <TouchableOpacity
                style={styles.topIconBtn}
                onPress={handleToggleCC}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <View style={[styles.ccIconBadge, isCCOn && styles.ccIconBadgeActive]}>
                  <Text style={[styles.ccIconText, isCCOn && styles.ccIconTextActive]}>CC</Text>
                </View>
              </TouchableOpacity>

              {/* Screen Fit / Zoom Toggle Button */}
              <TouchableOpacity
                style={styles.topIconBtn}
                onPress={handleToggleResizeMode}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <Ionicons
                  name={videoResizeMode === 'cover' ? 'contract-outline' : 'scan-outline'}
                  size={19}
                  color="#ffffff"
                />
              </TouchableOpacity>

              {/* Settings Gear Button */}
              <TouchableOpacity
                style={styles.topIconBtn}
                onPress={() => {
                  setSettingsSubView('main');
                  setSettingsModalVisible(true);
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <Ionicons name="settings-sharp" size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Center Playback Controls: Real YouTube Circular Controls */}
          <View style={styles.centerControls} pointerEvents="box-none">
            {/* Previous Track / Skip Backward */}
            <TouchableOpacity
              style={styles.centerSkipBtn}
              onPress={() => handleSkip(-10)}
              activeOpacity={0.7}
            >
              <Ionicons name="play-skip-back" size={22} color="#ffffff" />
            </TouchableOpacity>

            {/* Play / Pause Large Center Circle */}
            <TouchableOpacity
              style={styles.centerPlayPauseBtn}
              onPress={() => {
                onTogglePlay();
                scheduleControlsHide();
              }}
              activeOpacity={0.8}
            >
              {isBuffering ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={32}
                  color="#ffffff"
                  style={{ marginLeft: isPlaying ? 0 : 3 }}
                />
              )}
            </TouchableOpacity>

            {/* Next Track / Skip Forward */}
            <TouchableOpacity
              style={styles.centerSkipBtn}
              onPress={() => handleSkip(10)}
              activeOpacity={0.7}
            >
              <Ionicons name="play-skip-forward" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Bottom Bar: Real YouTube Time Pill, Chapter Pill & Fullscreen Icon */}
          <View style={styles.bottomMetaRow}>
            <View style={styles.bottomLeftPills}>
              {/* Time Pill */}
              <View style={styles.timePill}>
                <Text style={styles.timePillText}>
                  {formatTime(isSliding ? sliderPos * duration : currentTime)} / {formatTime(duration)}
                </Text>
              </View>

              {/* Chapter / Quality Pill */}
              <TouchableOpacity
                style={styles.chapterPill}
                onPress={() => {
                  setSettingsSubView('quality');
                  setSettingsModalVisible(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.chapterPillText} numberOfLines={1}>
                  {currentQuality || '480p'}
                </Text>
                <Ionicons name="chevron-forward" size={11} color="rgba(255, 255, 255, 0.7)" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.fullscreenButton}
              onPress={onFullScreen}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="scan-outline" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ONLY ONE Single Progress Bar at Bottom Position */}
      {duration > 0 && (
        showControls ? (
          <View style={styles.bottomScrubberContainer}>
            <Slider
              style={styles.bottomSlider}
              minimumValue={0}
              maximumValue={1}
              value={progressPct}
              onValueChange={(val) => {
                setIsSliding(true);
                setSliderPos(val);
              }}
              onSlidingComplete={(val) => {
                setIsSliding(false);
                onSeek(val * (duration || 1));
                scheduleControlsHide();
              }}
              minimumTrackTintColor="#ff0000"
              maximumTrackTintColor="rgba(255, 255, 255, 0.35)"
              thumbTintColor="#ff0000"
              thumbSize={12}
              trackHeight={3}
            />
          </View>
        ) : (
          <View style={styles.slimScrubTrack} pointerEvents="none">
            <View
              style={[
                styles.slimScrubFill,
                { width: `${Math.min(100, Math.max(0, (currentTime / duration) * 100))}%` },
              ]}
            />
          </View>
        )
      )}

      {/* Player Settings Bottom Sheet Modal */}
      <Modal
        visible={settingsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSettingsModalVisible(false)}
      >
        <Pressable
          style={styles.settingsBackdrop}
          onPress={() => setSettingsModalVisible(false)}
        >
          <View style={styles.settingsSheet}>
            <View style={styles.sheetHandle} />

            {/* 1. Main Settings Menu */}
            {settingsSubView === 'main' && (
              <View>
                <View style={styles.settingsHeader}>
                  <Text style={styles.settingsTitle}>Settings</Text>
                  <TouchableOpacity
                    onPress={() => setSettingsModalVisible(false)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={22} color="#ffffff" />
                  </TouchableOpacity>
                </View>

                <View style={styles.settingsDivider} />

                {/* Quality Option */}
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => setSettingsSubView('quality')}
                  activeOpacity={0.7}
                >
                  <View style={styles.settingsRowLeft}>
                    <Ionicons name="options-outline" size={20} color="#ffffff" />
                    <Text style={styles.settingsRowLabel}>Quality</Text>
                  </View>
                  <View style={styles.settingsRowRight}>
                    <Text style={styles.settingsRowValue}>
                      {currentQuality === 'Auto' ? 'Auto' : currentQuality}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="rgba(255, 255, 255, 0.45)" />
                  </View>
                </TouchableOpacity>

                {/* Playback Speed Option */}
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => setSettingsSubView('speed')}
                  activeOpacity={0.7}
                >
                  <View style={styles.settingsRowLeft}>
                    <Ionicons name="speedometer-outline" size={20} color="#ffffff" />
                    <Text style={styles.settingsRowLabel}>Playback speed</Text>
                  </View>
                  <View style={styles.settingsRowRight}>
                    <Text style={styles.settingsRowValue}>
                      {playbackSpeed === 1.0 ? 'Normal' : `${playbackSpeed}x`}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="rgba(255, 255, 255, 0.45)" />
                  </View>
                </TouchableOpacity>

                {/* Screen Fit / Aspect Ratio Option */}
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={handleToggleResizeMode}
                  activeOpacity={0.7}
                >
                  <View style={styles.settingsRowLeft}>
                    <Ionicons name="scan-outline" size={20} color="#ffffff" />
                    <Text style={styles.settingsRowLabel}>Screen fit</Text>
                  </View>
                  <View style={styles.settingsRowRight}>
                    <Text style={[styles.settingsRowValue, videoResizeMode === 'cover' && { color: '#535aff', fontWeight: '700' }]}>
                      {videoResizeMode === 'cover' ? 'Fit to Screen (Fill)' : 'Original (Fit)'}
                    </Text>
                    <Ionicons name="swap-horizontal" size={16} color="rgba(255, 255, 255, 0.45)" />
                  </View>
                </TouchableOpacity>

                {/* Loop Video Option */}
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={onToggleLoop}
                  activeOpacity={0.7}
                >
                  <View style={styles.settingsRowLeft}>
                    <Ionicons name="repeat-outline" size={20} color="#ffffff" />
                    <Text style={styles.settingsRowLabel}>Loop video</Text>
                  </View>
                  <View style={styles.settingsRowRight}>
                    <Text style={[styles.settingsRowValue, isLooping && { color: '#535aff', fontWeight: '700' }]}>
                      {isLooping ? 'On' : 'Off'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* 2. Quality Sub-Menu */}
            {settingsSubView === 'quality' && (
              <View>
                <View style={styles.settingsSubHeader}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setSettingsSubView('main')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="arrow-back" size={20} color="#ffffff" />
                  </TouchableOpacity>
                  <View style={styles.subHeaderTitleWrap}>
                    <Text style={styles.settingsTitle}>Quality for current video</Text>
                    <Text style={styles.settingsSubTitle}>Preserves playback position</Text>
                  </View>
                </View>

                <View style={styles.settingsDivider} />

                <ScrollView style={styles.subOptionsScroll} showsVerticalScrollIndicator={false}>
                  {availableQualities.map((q) => {
                    const isSelected = currentQuality === q;
                    return (
                      <TouchableOpacity
                        key={q}
                        style={styles.optionItemRow}
                        onPress={async () => {
                          if (await isHapticsSupported()) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }
                          onChangeQuality?.(q);
                          setSettingsModalVisible(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.optionItemLeft}>
                          <Text style={[styles.optionItemText, isSelected && styles.optionItemTextActive]}>
                            {q === 'Auto' ? 'Auto (Recommended)' : q}
                          </Text>
                          {q === '1080p' || q === '720p' ? (
                            <View style={styles.hdBadgeMini}>
                              <Text style={styles.hdBadgeMiniText}>HD</Text>
                            </View>
                          ) : null}
                        </View>
                        {isSelected && (
                          <Ionicons name="checkmark" size={18} color="#535aff" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* 3. Playback Speed Sub-Menu */}
            {settingsSubView === 'speed' && (
              <View>
                <View style={styles.settingsSubHeader}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setSettingsSubView('main')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="arrow-back" size={20} color="#ffffff" />
                  </TouchableOpacity>
                  <View style={styles.subHeaderTitleWrap}>
                    <Text style={styles.settingsTitle}>Playback speed</Text>
                  </View>
                </View>

                <View style={styles.settingsDivider} />

                <ScrollView style={styles.subOptionsScroll} showsVerticalScrollIndicator={false}>
                  {SPEED_OPTIONS.map((s) => {
                    const isSelected = playbackSpeed === s;
                    const label = s === 1.0 ? 'Normal (1x)' : `${s}x`;
                    return (
                      <TouchableOpacity
                        key={s}
                        style={styles.optionItemRow}
                        onPress={async () => {
                          if (await isHapticsSupported()) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }
                          onSetPlaybackSpeed?.(s);
                          setSettingsModalVisible(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.optionItemText, isSelected && styles.optionItemTextActive]}>
                          {label}
                        </Text>
                        {isSelected && (
                          <Ionicons name="checkmark" size={18} color="#535aff" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  slimScrubTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  slimScrubFill: {
    height: '100%',
    backgroundColor: '#ff0000',
  },
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topIconBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoplayToggleTrack: {
    width: 32,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  autoplayToggleTrackOn: {
    backgroundColor: '#ffffff',
  },
  autoplayToggleThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoplayToggleThumbOn: {
    alignSelf: 'flex-end',
    backgroundColor: '#0f0f0f',
  },
  ccIconBadge: {
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  ccIconBadgeActive: {
    borderColor: '#ffffff',
    backgroundColor: '#ffffff',
  },
  ccIconText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 10,
  },
  ccIconTextActive: {
    color: '#000000',
  },
  fitModeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gestureFeedbackPill: {
    position: 'absolute',
    top: '44%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 99,
  },
  gestureFeedbackText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  loadingBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
  errorBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  errorOverlay: {
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 8,
    zIndex: 10,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    maxWidth: 300,
  },
  errorTitle: {
    color: '#ff4444',
    fontSize: 15,
    fontWeight: '700',
  },
  errorText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#535aff',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    marginTop: 6,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconButton: {
    padding: 4,
  },
  centerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
  },
  centerSkipBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPlayPauseBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  bottomLeftPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timePill: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  timePillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  chapterPill: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 160,
  },
  chapterPillText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    fontWeight: '500',
  },
  fullscreenButton: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomScrubberContainer: {
    position: 'absolute',
    bottom: -8,
    left: 0,
    right: 0,
    height: 20,
    justifyContent: 'center',
    zIndex: 30,
  },
  bottomSlider: {
    width: '100%',
    height: 20,
  },
  settingsBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  settingsSheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  settingsSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  subHeaderTitleWrap: {
    flex: 1,
  },
  backButton: {
    padding: 4,
  },
  settingsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  settingsSubTitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 2,
  },
  settingsDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 6,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
  },
  settingsRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsRowLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
  },
  settingsRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  settingsRowValue: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  subOptionsScroll: {
    maxHeight: 280,
  },
  optionItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  optionItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionItemText: {
    fontSize: 14,
    color: '#ffffff',
  },
  optionItemTextActive: {
    color: '#535aff',
    fontWeight: '700',
  },
  hdBadgeMini: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  hdBadgeMiniText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#ffffff',
  },
  webPlayerHeaderPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 99,
  },
  switchPlayerPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    zIndex: 99,
  },
  switchPlayerText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
});
