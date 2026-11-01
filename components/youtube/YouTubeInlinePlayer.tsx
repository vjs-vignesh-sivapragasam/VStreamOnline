import React, { useState, useRef, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Video, { VideoRef, ResizeMode } from 'react-native-video';
import Slider from '@react-native-assets/slider';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import KSPlayerView, { isKSPlayerAvailable, KSPlayerRef } from '@/components/ksplayer/KSPlayerView';
import { isRCTVideoAvailable } from '@/components/nativeplayer';

export interface YouTubeInlinePlayerProps {
  streamUrl: string | null;
  poster: string;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  seekTarget: number | null;
  playbackError?: string | null;
  isTheaterMode?: boolean;
  currentQuality?: string;
  playbackSpeed?: number;
  isLooping?: boolean;
  availableQualities?: string[];
  onChangeQuality?: (quality: string) => void;
  onSetPlaybackSpeed?: (speed: number) => void;
  onToggleLoop?: () => void;
  onToggleTheaterMode?: () => void;
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

export const YouTubeInlinePlayer: React.FC<YouTubeInlinePlayerProps> = ({
  streamUrl,
  poster,
  isPlaying,
  isBuffering,
  currentTime,
  duration,
  seekTarget,
  playbackError,
  isTheaterMode = false,
  currentQuality = 'Auto',
  playbackSpeed = 1.0,
  isLooping = false,
  availableQualities = ['Auto', '1080p', '720p', '480p', '360p'],
  onChangeQuality,
  onSetPlaybackSpeed,
  onToggleLoop,
  onToggleTheaterMode,
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
  const [showControls, setShowControls] = useState(true);
  const [isSliding, setIsSliding] = useState(false);
  const [sliderPos, setSliderPos] = useState(0);
  const [useKSPlayer, setUseKSPlayer] = useState(Platform.OS === 'ios');

  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [settingsSubView, setSettingsSubView] = useState<'main' | 'quality' | 'speed'>('main');

  const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

  const hideTimerRef = useRef<any>(null);
  const videoRef = useRef<VideoRef>(null);
  const ksRef = useRef<KSPlayerRef>(null);

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

  // Handle native seek target
  useEffect(() => {
    if (seekTarget !== null) {
      console.log('[YouTubeInlinePlayer] ⏩ Seeking native player to:', seekTarget);
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

  return (
    <View
      style={[styles.container, isTheaterMode && styles.containerTheater]}
    >
      {/* Native Video Engine */}
      {streamUrl ? (
        useKSPlayer ? (
          <KSPlayerView
            ref={ksRef}
            url={streamUrl}
            paused={!isPlaying}
            rate={playbackSpeed}
            resizeMode="contain"
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
              // Auto-fallback from KSPlayer to react-native-video (Android only)
              if (Platform.OS !== 'ios') {
                setUseKSPlayer(false);
              }
              onPlaybackError?.(e?.error?.message || 'KSPlayer playback error');
            }}
          />
        ) : isRCTVideoAvailable() ? (
          <Video
            ref={videoRef}
            source={{ uri: streamUrl }}
            paused={!isPlaying}
            rate={playbackSpeed}
            resizeMode="contain"
            style={StyleSheet.absoluteFill}
            controls={false}
            playInBackground={false}
            playWhenInactive={false}
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
              const errStr = e?.error?.errorString || 'Video stream could not be opened';
              onPlaybackError?.(errStr);
            }}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' }]}>
            <Text style={{ color: '#ffffff', textAlign: 'center', paddingHorizontal: 20 }}>
              Native video player is initializing...
            </Text>
          </View>
        )
      ) : (
        <View style={StyleSheet.absoluteFill}>
          {poster ? (
            <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#141416' }]} />
          )}
          <View style={[StyleSheet.absoluteFill, styles.loadingBackdrop]}>
            {playbackError ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle-outline" size={36} color="#ff4444" />
                <Text style={styles.errorTitle}>Playback Error</Text>
                <Text style={styles.errorText} numberOfLines={3}>
                  {playbackError}
                </Text>
                {onRetry && (
                  <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.8}>
                    <Ionicons name="refresh" size={15} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.retryButtonText}>Retry Stream</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <>
                <ActivityIndicator size="large" color="#ff0000" />
                <Text style={styles.loadingText}>Loading video stream...</Text>
              </>
            )}
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



      {/* Controls Overlay */}
      {showControls && (
        <View style={styles.controlsOverlay} pointerEvents="box-none">
          {/* Top Bar: Minimize Chevron, Theater Pill & Quality Tag */}
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={onMinimize}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-down" size={28} color="#ffffff" />
            </TouchableOpacity>

            <View style={styles.topBarRight}>
              {onToggleTheaterMode && (
                <TouchableOpacity
                  style={[styles.theaterToggleBtn, isTheaterMode && styles.theaterToggleBtnActive]}
                  onPress={onToggleTheaterMode}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={isTheaterMode ? 'film' : 'film-outline'}
                    size={14}
                    color={isTheaterMode ? '#535aff' : '#ffffff'}
                  />
                  <Text style={[styles.theaterToggleText, isTheaterMode && { color: '#535aff' }]}>
                    {isTheaterMode ? 'Theater On' : 'Theater'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Quality Resolution Badge (Tapping opens Quality selection) */}
              <TouchableOpacity
                style={styles.qualityBadge}
                onPress={() => {
                  setSettingsSubView('quality');
                  setSettingsModalVisible(true);
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <Text style={styles.qualityBadgeText}>
                  {currentQuality === 'Auto' ? 'HD' : currentQuality}
                </Text>
              </TouchableOpacity>

              {/* Settings Gear Button (Tapping opens Settings menu) */}
              <TouchableOpacity
                style={styles.settingsGearBtn}
                onPress={() => {
                  setSettingsSubView('main');
                  setSettingsModalVisible(true);
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <Ionicons name="settings-outline" size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Center Playback Controls */}
          <View style={styles.centerControls} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.skipButton}
              onPress={() => handleSkip(-10)}
              activeOpacity={0.7}
            >
              <Ionicons name="play-back" size={26} color="#ffffff" />
              <Text style={styles.skipText}>10</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.playPauseButton}
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
                  size={34}
                  color="#ffffff"
                  style={{ marginLeft: isPlaying ? 0 : 3 }}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipButton}
              onPress={() => handleSkip(10)}
              activeOpacity={0.7}
            >
              <Ionicons name="play-forward" size={26} color="#ffffff" />
              <Text style={styles.skipText}>10</Text>
            </TouchableOpacity>
          </View>

          {/* Bottom Bar: Scrubber, Timestamps & Fullscreen Icon */}
          <View style={styles.bottomBar}>
            <View style={styles.sliderContainer}>
              <Slider
                style={styles.slider}
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
                thumbSize={14}
                trackHeight={3}
              />
            </View>

            <View style={styles.bottomMetaRow}>
              <Text style={styles.timeText}>
                {formatTime(isSliding ? sliderPos * duration : currentTime)} / {formatTime(duration)}
              </Text>

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
        </View>
      )}

      {/* Real YouTube Slim Bottom Scrub Line (shown when controls are hidden) */}
      {!showControls && duration > 0 && (
        <View style={styles.slimScrubTrack} pointerEvents="none">
          <View
            style={[
              styles.slimScrubFill,
              { width: `${Math.min(100, Math.max(0, (currentTime / duration) * 100))}%` },
            ]}
          />
        </View>
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
  containerTheater: {
    width: '100%',
    height: 310,
    aspectRatio: undefined,
    backgroundColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  theaterToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    gap: 4,
  },
  theaterToggleBtnActive: {
    backgroundColor: 'rgba(83, 90, 255, 0.25)',
    borderColor: '#535aff',
  },
  theaterToggleText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
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
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    justifyContent: 'space-between',
    padding: 12,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconButton: {
    padding: 4,
  },
  qualityBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  qualityBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  centerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 36,
  },
  skipButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  skipText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    marginTop: -2,
  },
  playPauseButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    width: '100%',
  },
  sliderContainer: {
    height: 20,
    justifyContent: 'center',
  },
  slider: {
    width: '100%',
    height: 20,
  },
  bottomMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  timeText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  fullscreenButton: {
    padding: 4,
  },
  settingsGearBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
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
});
