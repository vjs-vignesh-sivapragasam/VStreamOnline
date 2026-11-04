import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Share,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Pressable,
  PanResponder,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { isHapticsSupported } from '@/utils/platform';
import { useYouTubePlayer } from '@/contexts/YouTubePlayerContext';
import { youTubeService, YouTubeVideoItem, YouTubeVideoDetails, YouTubeFormatOption } from '@/services/YouTubeService';
import { youTubeListService } from '@/services/YouTubeListService';
import { downloadService } from '@/services/DownloadService';
import { QualityPickerModal } from '@/components/youtube/QualityPickerModal';
import { YouTubeInlinePlayer, ScreenFitMode } from '@/components/youtube/YouTubeInlinePlayer';
import BottomSpacing from '@/components/BottomSpacing';

interface VideoComment {
  id: string;
  author: string;
  avatarColor: string;
  timeAgo: string;
  text: string;
  likes: number;
  isLiked?: boolean;
}

const DEFAULT_COMMENTS: VideoComment[] = [
  {
    id: 'c1',
    author: 'MusicVibeCentral',
    avatarColor: '#535aff',
    timeAgo: '2 hours ago',
    text: 'The sound design on this track is absolutely insane! Replaying it on repeat 🔥',
    likes: 342,
  },
  {
    id: 'c2',
    author: 'CinemaFanatic',
    avatarColor: '#ff2d55',
    timeAgo: '1 day ago',
    text: 'Visuals and editing quality are next level. Truly outstanding work by the team.',
    likes: 128,
  },
  {
    id: 'c3',
    author: 'BeatLover99',
    avatarColor: '#34c759',
    timeAgo: '3 days ago',
    text: 'Bassline drops so clean in high quality. Best release this month!',
    likes: 85,
  },
  {
    id: 'c4',
    author: 'Alex_R',
    avatarColor: '#af52de',
    timeAgo: '5 days ago',
    text: 'Can we appreciate how smooth the transitions are? Pure masterclass.',
    likes: 47,
  },
  {
    id: 'c5',
    author: 'SoundWaveStudio',
    avatarColor: '#ff9500',
    timeAgo: '1 week ago',
    text: 'Deserves 100M+ views easy. Unbelievable vibes!',
    likes: 219,
  },
];

class WatchOverlayErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error: error?.message || 'Watch overlay error' };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('[YouTubeWatchOverlay] Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

const YouTubeWatchOverlayInner: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const {
    currentVideo,
    videoDetails,
    streamUrl,
    isPlaying,
    isBuffering,
    isMinimized,
    currentTime,
    duration,
    seekTarget,
    playbackError,
    togglePlay,
    pauseVideo,
    minimize,
    expand,
    close,
    seekTo,
    clearSeekTarget,
    updateProgress,
    setIsBuffering,
    playVideo,
    handlePlayerError,
    retryStream,
    currentQuality,
    playbackSpeed,
    isLooping,
    availableQualities,
    changeQuality,
    setPlaybackSpeed,
    setIsLooping,
  } = useYouTubePlayer();

  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  // Go back to Home Screen on deliberate swipe left
  const handleGoBackHome = useCallback(async () => {
    console.log('[YouTubeWatchOverlay] 👈 Swipe left detected -> Returning to Home Screen');
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    close();
    try {
      router.replace('/(tabs)');
    } catch {
      try {
        router.navigate('/(tabs)');
      } catch {}
    }
  }, [close, router]);

  // Screen-wide swipe gesture: swipe left anywhere on screen to return to home screen
  const screenPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        // Deliberate horizontal swipe left (dx < -45) or swipe right (dx > 55)
        const isHorizontalSwipe =
          (gestureState.dx < -45 || gestureState.dx > 55) &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5;
        return isHorizontalSwipe;
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderRelease: async (_evt, gestureState) => {
        if (gestureState.dx < -45 || gestureState.dx > 55) {
          handleGoBackHome();
        }
      },
    })
  ).current;

  // Related videos state
  const [relatedVideos, setRelatedVideos] = useState<YouTubeVideoItem[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [shortsVideos, setShortsVideos] = useState<YouTubeVideoItem[]>([]);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  // Download modal state
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [activeDownloadItem, setActiveDownloadItem] = useState<YouTubeVideoItem | null>(null);
  const insets = useSafeAreaInsets();
  const [screenFitMode, setScreenFitMode] = useState<ScreenFitMode>('cover');
  const [modalVideoDetails, setModalVideoDetails] = useState<YouTubeVideoDetails | null>(null);
  const [isLoadingModalDetails, setIsLoadingModalDetails] = useState(false);

  const handleOpenDownload = useCallback(
    async (item: YouTubeVideoItem) => {
      setActiveDownloadItem(item);
      setDownloadModalVisible(true);

      if (currentVideo && item.id === currentVideo.id && videoDetails) {
        setModalVideoDetails(videoDetails);
        return;
      }

      setIsLoadingModalDetails(true);
      try {
        const details = await youTubeService.getVideoDetails(item.id, item);
        setModalVideoDetails(details);
      } catch (err) {
        console.warn('[YouTubeWatchOverlay] Could not fetch download formats:', err);
      } finally {
        setIsLoadingModalDetails(false);
      }
    },
    [currentVideo, videoDetails]
  );

  useEffect(() => {
    if (videoDetails && activeDownloadItem?.id === currentVideo?.id) {
      setModalVideoDetails(videoDetails);
    }
  }, [videoDetails, activeDownloadItem, currentVideo]);

  // Comments modal state
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [commentsList, setCommentsList] = useState<VideoComment[]>(DEFAULT_COMMENTS);
  const [newCommentText, setNewCommentText] = useState('');

  // Item options sheet state (for 3-dots on related cards)
  const [selectedOptionItem, setSelectedOptionItem] = useState<YouTubeVideoItem | null>(null);
  const [optionsModalVisible, setOptionsModalVisible] = useState(false);

  // Sync saved & subscription state when currentVideo changes
  useEffect(() => {
    if (currentVideo) {
      setIsSaved(youTubeListService.isSaved(currentVideo.id));
      setIsSubscribed(youTubeService.isSubscribed(currentVideo.channel));
      setIsLiked(false);
      setIsDisliked(false);
      setDescriptionExpanded(false);
      setCommentsList(DEFAULT_COMMENTS);
      setActiveDownloadItem(null);

      // Fetch related recommendations and shorts
      fetchRelated(currentVideo.channel || currentVideo.title);
      youTubeService
        .getShortsFeed(5000)
        .then((res) => {
          if (res.videos.length > 0) {
            setShortsVideos(res.videos.slice(0, 4));
          }
        })
        .catch(() => {});
      youTubeService
        .getAuthStatus()
        .then((st) => {
          if (st.authenticated && st.user?.avatar) {
            setUserAvatar(st.user.avatar);
          }
        })
        .catch(() => {});
    }
  }, [currentVideo?.id]);

  const fetchRelated = async (query: string) => {
    try {
      setLoadingRelated(true);
      const results = await youTubeService.search(query);
      // Filter out current video
      setRelatedVideos(results.filter((v) => v.id !== currentVideo?.id));
    } catch {
      setRelatedVideos([]);
    } finally {
      setLoadingRelated(false);
    }
  };

  const handleLike = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsLiked((prev) => !prev);
    if (!isLiked) setIsDisliked(false);
  }, [isLiked]);

  const handleDislike = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsDisliked((prev) => !prev);
    if (!isDisliked) setIsLiked(false);
  }, [isDisliked]);

  const handleShare = useCallback(async (videoToShare = currentVideo) => {
    if (!videoToShare) return;
    try {
      await Share.share({
        title: videoToShare.title,
        message: `${videoToShare.title}\nhttps://www.youtube.com/watch?v=${videoToShare.id}`,
      });
    } catch (err) {
      console.warn('Share error:', err);
    }
  }, [currentVideo]);

  const handleCopyLink = useCallback(async (videoToCopy = currentVideo) => {
    if (!videoToCopy) return;
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const realUrl = `https://www.youtube.com/watch?v=${videoToCopy.id}`;
    await Clipboard.setStringAsync(realUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  }, [currentVideo]);

  const handleToggleSave = useCallback(async (videoToSave = currentVideo) => {
    if (!videoToSave) return;
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const added = await youTubeListService.toggleSave({
      id: videoToSave.id,
      title: videoToSave.title,
      channel: videoToSave.channel,
      thumbnail: videoToSave.thumbnail,
      duration: videoToSave.duration,
      views: videoToSave.views,
      published: videoToSave.published,
    });
    if (videoToSave.id === currentVideo?.id) {
      setIsSaved(added);
    }
  }, [currentVideo]);

  const handleToggleSubscribe = useCallback(async () => {
    if (!currentVideo) return;
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const subscribed = youTubeService.toggleSubscription({
      channelId: currentVideo.channel,
      channelTitle: currentVideo.channel,
      avatarUrl: currentVideo.thumbnail,
    });
    setIsSubscribed(subscribed);
  }, [currentVideo]);

  const handleDownloadFormat = useCallback(
    async (format: YouTubeFormatOption) => {
      setDownloadModalVisible(false);
      const targetVideo = activeDownloadItem || currentVideo;
      if (!targetVideo) return;

      try {
        const isAudio = format.type === 'audio';
        const ext = isAudio ? 'mp3' : 'mp4';
        const cleanTitle = (modalVideoDetails?.title || videoDetails?.title || targetVideo.title)
          .replace(/[^a-zA-Z0-9\s-_]/g, '')
          .trim();
        const cleanQuality = format.quality.replace(/[^a-zA-Z0-9]/g, '');
        const fileName = `${cleanTitle}_${cleanQuality}.${ext}`;
        const downloadId = `yt_${targetVideo.id}_${format.itag}_${ext}`;

        await downloadService.startDirectDownload({
          id: downloadId,
          title: targetVideo.title,
          poster: targetVideo.thumbnail,
          fileName,
          streamUrl: format.url || format.proxyUrl || '',
          fileLength: format.contentLength,
        });

        Alert.alert(
          'Download Started',
          `Downloading "${cleanTitle}" (${isAudio ? 'MP3 Audio' : format.quality + ' MP4'}) to your Downloads.`,
          [
            { text: 'View Downloads', onPress: () => router.push('/youtube/downloads' as any) },
            { text: 'OK', style: 'cancel' },
          ]
        );
      } catch (err: any) {
        Alert.alert('Download Failed', err?.message || 'Could not start download.');
      }
    },
    [currentVideo, activeDownloadItem, videoDetails, modalVideoDetails, router]
  );

  const handleFullScreen = useCallback(() => {
    if (!currentVideo || !streamUrl) return;

    // Pause the inline player before switching to fullscreen
    pauseVideo();

    // Route to the app's tested cinematic landscape player with resume progress
    router.push({
      pathname: '/stream/player' as any,
      params: {
        videoUrl: streamUrl,
        title: currentVideo.title,
        poster: currentVideo.thumbnail,
        progress: duration > 0 ? Math.floor((currentTime / duration) * 100) : 0,
      },
    });
  }, [currentVideo, streamUrl, currentTime, duration, router, pauseVideo]);



  const handleOpenItemOptions = (item: YouTubeVideoItem) => {
    setSelectedOptionItem(item);
    setOptionsModalVisible(true);
  };

  const handleAddComment = () => {
    if (!newCommentText.trim()) return;
    const newComment: VideoComment = {
      id: `c_${Date.now()}`,
      author: 'You',
      avatarColor: '#535aff',
      timeAgo: 'Just now',
      text: newCommentText.trim(),
      likes: 1,
    };
    setCommentsList([newComment, ...commentsList]);
    setNewCommentText('');
  };

  const channelHandle = useMemo(() => {
    if (!currentVideo) return '@YouTube';
    return `@${currentVideo.channel.replace(/[^a-zA-Z0-9_]/g, '') || 'Official'}`;
  }, [currentVideo]);

  if (!currentVideo) return null;
  // While fullscreen player is active, suppress the portrait overlay
  if (pathname === '/stream/player') return null;

  // Mini player removed completely
  if (isMinimized) {
    return null;
  }

  // ── Render Full Real YouTube Watch Screen ──────────────────────────────────
  return (
    <View style={styles.fullWatchOverlay} {...screenPanResponder.panHandlers}>
      <SafeAreaView style={styles.safeArea} edges={screenFitMode === 'hero' ? [] : ['top']}>
        {/* Top 16:9 Video Player */}
        <View {...screenPanResponder.panHandlers}>
          <YouTubeInlinePlayer
            videoId={currentVideo.id}
            title={currentVideo.title}
            channel={currentVideo.channel}
            streamUrl={streamUrl}
            poster={currentVideo.thumbnail}
            isPlaying={isPlaying}
            isBuffering={isBuffering}
            currentTime={currentTime}
            duration={duration}
            seekTarget={seekTarget}
            playbackError={playbackError}
            onTogglePlay={togglePlay}
            onMinimize={handleGoBackHome}
            onSwipeExit={handleGoBackHome}
            onFullScreen={handleFullScreen}
            onSeek={seekTo}
            onClearSeekTarget={clearSeekTarget}
            onProgress={updateProgress}
            setIsBuffering={setIsBuffering}
            onPlaybackError={handlePlayerError}
            onRetry={retryStream}
            currentQuality={currentQuality}
            playbackSpeed={playbackSpeed}
            isLooping={isLooping}
            availableQualities={availableQualities}
            onChangeQuality={changeQuality}
            onSetPlaybackSpeed={setPlaybackSpeed}
            onToggleLoop={() => setIsLooping(!isLooping)}
          />
        </View>

        {/* Watch Details & Related Feed */}
        <ScrollView
          style={styles.contentScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.contentBodyWrap}>
            {/* 1. Real YouTube Title Section (16px bold, 2 lines max) */}
            <View style={styles.titleSection}>
              <Text style={styles.videoTitle} numberOfLines={2}>
                {currentVideo.title}
              </Text>

            {/* YouTube Metadata Line: @ChannelHandle  likes  views  time  #Hashtag  ...more */}
            <TouchableOpacity
              style={styles.statsRow}
              activeOpacity={0.7}
              onPress={() => setDescriptionExpanded((prev) => !prev)}
            >
              <Text style={styles.channelHandleText}>{channelHandle}</Text>
              <Text style={styles.metaBullet}> </Text>
              <Text style={styles.statDetailText}>{isLiked ? '4.5K likes' : '4.4K likes'}</Text>
              <Text style={styles.metaBullet}> </Text>
              <Text style={styles.statDetailText}>{currentVideo.views || '113k views'}</Text>
              <Text style={styles.metaBullet}> </Text>
              <Text style={styles.statDetailText}>{currentVideo.published || '3 wk ago'}</Text>
              <Text style={styles.metaBullet}> </Text>
              <Text style={styles.hashtagText}>#Featured</Text>
              <Text style={styles.metaBullet}> </Text>
              <Text style={styles.moreToggleText}>
                {descriptionExpanded ? 'less' : '...more'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Expanded Description Accordion */}
          {descriptionExpanded && (
            <View style={styles.expandedDescBox}>
              <Text style={styles.expandedDescHeading}>Description</Text>
              <Text style={styles.expandedDescText}>
                {videoDetails?.title || currentVideo.title}
                {'\n\n'}
                High Definition 1080p playback powered by high-speed streaming. Zero advertisements, pure audio-visual fidelity.
                {'\n\n'}
                Channel: {currentVideo.channel}
                {'\n'}
                Duration: {currentVideo.duration || 'Full length'}
                {'\n'}
                License: Standard YouTube License
              </Text>
              <TouchableOpacity
                onPress={() => setDescriptionExpanded(false)}
                style={styles.collapseDescBtn}
              >
                <Text style={styles.collapseDescText}>Show less</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 2. Real YouTube Channel & Subscribe Row with Horizontal Action Buttons */}
          <View style={styles.channelRow}>
            {/* Channel Avatar Circle & Channel Handle */}
            <View style={styles.channelRowLeft}>
              <View style={styles.channelAvatar}>
                <Text style={styles.channelAvatarText}>
                  {(currentVideo.channel || 'Y')[0].toUpperCase()}
                </Text>
              </View>
              <Text style={styles.channelNameText} numberOfLines={1}>
                {channelHandle}
              </Text>

              {/* YouTube Subscribe / Bell Button */}
              <TouchableOpacity
                style={[styles.subscribeButton, isSubscribed && styles.subscribedButton]}
                onPress={handleToggleSubscribe}
                activeOpacity={0.8}
              >
                {isSubscribed ? (
                  <View style={styles.subscribedBellWrap}>
                    <Ionicons name="notifications" size={15} color="#ffffff" />
                    <Ionicons name="chevron-down" size={12} color="#ffffff" style={{ marginLeft: 3 }} />
                  </View>
                ) : (
                  <Text style={styles.subscribeButtonText}>Subscribe</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Action Pills in Horizontal Scroll */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.actionPillsScroll}
            style={styles.actionsScrollView}
          >
            {/* Like / Dislike Split Pill */}
            <View style={styles.likeDislikePill}>
              <TouchableOpacity
                style={styles.likeHalf}
                onPress={handleLike}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isLiked ? 'thumbs-up' : 'thumbs-up-outline'}
                  size={17}
                  color={isLiked ? '#535aff' : '#ffffff'}
                />
                <Text style={[styles.actionText, isLiked && { color: '#535aff' }]}>
                  {isLiked ? '299' : '298'}
                </Text>
              </TouchableOpacity>

              <View style={styles.actionDivider} />

              <TouchableOpacity
                style={styles.dislikeHalf}
                onPress={handleDislike}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isDisliked ? 'thumbs-down' : 'thumbs-down-outline'}
                  size={17}
                  color={isDisliked ? '#535aff' : '#ffffff'}
                />
              </TouchableOpacity>
            </View>

            {/* Share Pill */}
            <TouchableOpacity
              style={styles.actionPill}
              onPress={() => handleShare()}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-redo-outline" size={17} color="#ffffff" />
              <Text style={styles.actionText}>Share</Text>
            </TouchableOpacity>

            {/* Remix Pill (Sparkles) */}
            <TouchableOpacity
              style={styles.actionPill}
              onPress={() => {
                Alert.alert('Remix', 'YouTube Remix & Sound creation is ready for this video.');
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="sparkles-outline" size={16} color="#ffffff" />
              <Text style={styles.actionText}>Remix</Text>
            </TouchableOpacity>

            {/* Download Pill */}
            <TouchableOpacity
              style={styles.actionPill}
              onPress={() => {
                if (currentVideo) handleOpenDownload(currentVideo);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-down-circle-outline" size={17} color="#ffffff" />
              <Text style={styles.actionText}>Download</Text>
            </TouchableOpacity>

            {/* More Options Pill */}
            <TouchableOpacity
              style={styles.actionPillRound}
              onPress={() => handleOpenItemOptions(currentVideo)}
              activeOpacity={0.7}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color="#ffffff" />
            </TouchableOpacity>
          </ScrollView>

          {/* 3. Real YouTube Comments Preview Card */}
          <TouchableOpacity
            style={styles.commentsCard}
            activeOpacity={0.8}
            onPress={() => setCommentsModalVisible(true)}
          >
            <View style={styles.commentsHeaderRow}>
              <View style={styles.commentsTitleGroup}>
                <Text style={styles.commentsTitle}>Comments</Text>
                <Text style={styles.commentsCount}>{commentsList.length}</Text>
              </View>
              <Ionicons name="ellipsis-horizontal" size={16} color="rgba(255, 255, 255, 0.5)" />
            </View>

            <View style={styles.commentsInputRow}>
              {userAvatar ? (
                <Image source={{ uri: userAvatar }} style={styles.commentAvatarImg} />
              ) : (
                <View style={styles.commentUserAvatar}>
                  <Ionicons name="person" size={13} color="#ffffff" />
                </View>
              )}
              <View style={styles.mockCommentInput}>
                <Text style={styles.mockCommentPlaceholder}>
                  Comment...
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* 4. Real YouTube Shorts Shelf */}
          {shortsVideos.length > 0 && (
            <View style={styles.shortsShelfWrap}>
              <View style={styles.shortsHeader}>
                <View style={styles.shortsTitleRow}>
                  <Ionicons name="logo-youtube" size={22} color="#ff0000" />
                  <Text style={styles.shortsTitleText}>Shorts</Text>
                </View>
              </View>

              <View style={styles.shortsGrid}>
                {shortsVideos.slice(0, 2).map((item) => (
                  <TouchableOpacity
                    key={`short_${item.id}`}
                    style={styles.shortCard}
                    activeOpacity={0.9}
                    onPress={() => playVideo(item)}
                  >
                    <Image source={{ uri: item.thumbnail }} style={styles.shortThumb} resizeMode="cover" />
                    <LinearGradient
                      colors={['transparent', 'rgba(0, 0, 0, 0.35)', 'rgba(0, 0, 0, 0.88)']}
                      locations={[0, 0.5, 1]}
                      style={styles.shortGradientBottom}
                      pointerEvents="none"
                    >
                      <Text style={styles.shortVideoTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={styles.shortViewsText}>
                        {item.views || '1.2M views'}
                      </Text>
                    </LinearGradient>
                    <TouchableOpacity
                      style={styles.shortDotsBtn}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleOpenItemOptions(item);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="ellipsis-vertical" size={14} color="#ffffff" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* 4. Real YouTube Up Next / Related Feed (Full-Width 16:9 Cards) */}
          <View style={styles.feedContainer}>
            {loadingRelated ? (
              <View style={styles.relatedLoading}>
                <ActivityIndicator size="small" color="#535aff" />
                <Text style={styles.relatedLoadingText}>Loading recommendations...</Text>
              </View>
            ) : (
              relatedVideos.map((item) => (
                <View key={item.id} style={styles.feedCard}>
                  {/* Full-Width 16:9 Thumbnail with Rounded Corners */}
                  <TouchableOpacity
                    style={styles.feedThumbWrap}
                    activeOpacity={0.9}
                    onPress={() => playVideo(item)}
                  >
                    <Image
                      source={{ uri: item.thumbnail }}
                      style={styles.feedThumb}
                      resizeMode="cover"
                    />
                    {item.duration ? (
                      <View style={styles.durationBadge}>
                        <Ionicons
                          name="musical-notes"
                          size={10}
                          color="#ffffff"
                          style={{ marginRight: 3 }}
                        />
                        <Text style={styles.durationText}>{item.duration}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>

                  {/* Channel Avatar, 2-line Title, Verified Badge & 3-Dots */}
                  <View style={styles.feedMetaRow}>
                    <TouchableOpacity
                      style={styles.feedAvatar}
                      activeOpacity={0.8}
                      onPress={() => playVideo(item)}
                    >
                      <Text style={styles.feedAvatarText}>
                        {(item.channel || 'Y')[0].toUpperCase()}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.feedInfo}
                      activeOpacity={0.8}
                      onPress={() => playVideo(item)}
                    >
                      <Text style={styles.feedTitle} numberOfLines={2}>
                        {item.title}
                      </Text>

                      <View style={styles.feedSubtitleRow}>
                        <Text style={styles.feedChannelName} numberOfLines={1}>
                          {item.channel}
                        </Text>
                        <Ionicons
                          name="checkmark-circle"
                          size={12}
                          color="rgba(255, 255, 255, 0.65)"
                          style={styles.verifiedCheck}
                        />
                        <Text style={styles.feedStatsText} numberOfLines={1}>
                          • {item.views || '1.1M'} • {item.published || 'Recently'}
                        </Text>
                      </View>

                      <Text style={styles.youtubeFeaturedTag}>YouTube featured</Text>
                    </TouchableOpacity>

                    {/* 3-Dots Options Menu Trigger */}
                    <TouchableOpacity
                      style={styles.feedDotsBtn}
                      activeOpacity={0.7}
                      onPress={() => handleOpenItemOptions(item)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="ellipsis-vertical" size={18} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>

          </View>

          <BottomSpacing space={60} />
        </ScrollView>

        {/* Quality Download Modal */}
        <QualityPickerModal
          visible={downloadModalVisible}
          isLoading={isLoadingModalDetails}
          videoDetails={modalVideoDetails || (activeDownloadItem?.id === currentVideo?.id ? videoDetails : null)}
          isSaved={isSaved}
          onToggleSave={() => handleToggleSave(activeDownloadItem || currentVideo)}
          onClose={() => setDownloadModalVisible(false)}
          onSelectFormat={handleDownloadFormat}
          onPlayFormat={() => setDownloadModalVisible(false)}
        />

        {/* Interactive Real YouTube Comments Modal */}
        <Modal
          visible={commentsModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setCommentsModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalBackdrop}
          >
            <Pressable
              style={styles.modalDismissArea}
              onPress={() => setCommentsModalVisible(false)}
            />
            <View style={styles.commentsSheet}>
              {/* Top Drag Handle */}
              <View style={styles.sheetHandle} />

              {/* Comments Sheet Header */}
              <View style={styles.commentsSheetHeader}>
                <View style={styles.commentsTitleGroup}>
                  <Text style={styles.sheetTitle}>Comments</Text>
                  <Text style={styles.sheetCount}>{commentsList.length}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setCommentsModalVisible(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={22} color="#ffffff" />
                </TouchableOpacity>
              </View>

              {/* Quick Filter Chips */}
              <View style={styles.sheetChipsRow}>
                <View style={[styles.filterChip, styles.filterChipActive]}>
                  <Text style={[styles.filterChipText, styles.filterChipTextActive]}>
                    Top comments
                  </Text>
                </View>
                <View style={styles.filterChip}>
                  <Text style={styles.filterChipText}>Newest first</Text>
                </View>
              </View>

              {/* Comments List */}
              <ScrollView style={styles.commentsScroll} showsVerticalScrollIndicator={false}>
                {commentsList.map((c) => (
                  <View key={c.id} style={styles.commentItem}>
                    <View style={[styles.commentAvatarCircle, { backgroundColor: c.avatarColor }]}>
                      <Text style={styles.commentAvatarInitial}>
                        {c.author[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.commentItemContent}>
                      <View style={styles.commentAuthorRow}>
                        <Text style={styles.commentAuthor}>{c.author}</Text>
                        <Text style={styles.commentTimeAgo}>• {c.timeAgo}</Text>
                      </View>
                      <Text style={styles.commentBody}>{c.text}</Text>
                      <View style={styles.commentReactionRow}>
                        <Ionicons name="thumbs-up-outline" size={14} color="#aaaaaa" />
                        <Text style={styles.commentLikeCount}>{c.likes}</Text>
                        <Ionicons
                          name="thumbs-down-outline"
                          size={14}
                          color="#aaaaaa"
                          style={{ marginLeft: 16 }}
                        />
                        <Text style={styles.replyButtonText}>Reply</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>

              {/* Add Comment Input Bar */}
              <View style={styles.commentInputBar}>
                <View style={[styles.commentAvatarCircle, { backgroundColor: '#535aff', width: 30, height: 30, borderRadius: 15 }]}>
                  <Ionicons name="person" size={14} color="#ffffff" />
                </View>
                <TextInput
                  style={styles.commentTextInput}
                  placeholder="Add a comment..."
                  placeholderTextColor="rgba(255, 255, 255, 0.45)"
                  value={newCommentText}
                  onChangeText={setNewCommentText}
                  returnKeyType="send"
                  onSubmitEditing={handleAddComment}
                />
                <TouchableOpacity
                  style={[
                    styles.commentSendBtn,
                    !newCommentText.trim() && styles.commentSendBtnDisabled,
                  ]}
                  onPress={handleAddComment}
                  disabled={!newCommentText.trim()}
                >
                  <Ionicons
                    name="arrow-up-circle"
                    size={28}
                    color={newCommentText.trim() ? '#535aff' : 'rgba(255, 255, 255, 0.3)'}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* 3-Dots Quick Action Menu for Related Video */}
        <Modal
          visible={optionsModalVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setOptionsModalVisible(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setOptionsModalVisible(false)}
          >
            <View style={styles.optionsSheet}>
              <View style={styles.sheetHandle} />

              {selectedOptionItem && (
                <View style={styles.optionsHeader}>
                  <Image
                    source={{ uri: selectedOptionItem.thumbnail }}
                    style={styles.optionsThumb}
                  />
                  <View style={styles.optionsHeaderTextWrap}>
                    <Text style={styles.optionsHeaderTitle} numberOfLines={2}>
                      {selectedOptionItem.title}
                    </Text>
                    <Text style={styles.optionsHeaderSubtitle} numberOfLines={1}>
                      {selectedOptionItem.channel}
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.optionsDivider} />

              {/* Play Now */}
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  setOptionsModalVisible(false);
                  if (selectedOptionItem) playVideo(selectedOptionItem);
                }}
              >
                <Ionicons name="play-outline" size={22} color="#ffffff" />
                <Text style={styles.optionRowText}>Play now</Text>
              </TouchableOpacity>

              {/* Download */}
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  setOptionsModalVisible(false);
                  if (selectedOptionItem) {
                    handleOpenDownload(selectedOptionItem);
                  }
                }}
              >
                <Ionicons name="arrow-down-circle-outline" size={22} color="#ffffff" />
                <Text style={styles.optionRowText}>Download video / audio</Text>
              </TouchableOpacity>

              {/* Save to My List */}
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  setOptionsModalVisible(false);
                  if (selectedOptionItem) handleToggleSave(selectedOptionItem);
                }}
              >
                <Ionicons name="bookmark-outline" size={22} color="#ffffff" />
                <Text style={styles.optionRowText}>Save to My List</Text>
              </TouchableOpacity>

              {/* Copy Link */}
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  setOptionsModalVisible(false);
                  if (selectedOptionItem) handleCopyLink(selectedOptionItem);
                }}
              >
                <Ionicons name="copy-outline" size={22} color="#ffffff" />
                <Text style={styles.optionRowText}>Copy video link</Text>
              </TouchableOpacity>

              {/* Share */}
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  setOptionsModalVisible(false);
                  if (selectedOptionItem) handleShare(selectedOptionItem);
                }}
              >
                <Ionicons name="arrow-redo-outline" size={22} color="#ffffff" />
                <Text style={styles.optionRowText}>Share</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  fullWatchOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0a0a0c',
    zIndex: 99999,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  contentScroll: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  contentBodyWrap: {
    flex: 1,
  },

  // ── Title & Real YouTube Metadata Line ─────────────────────────────────────
  titleSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  videoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  channelHandleText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
  },
  metaBullet: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.35)',
    marginHorizontal: 3,
  },
  statDetailText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.65)',
  },
  hashtagText: {
    fontSize: 12,
    color: '#535aff',
    fontWeight: '500',
  },
  moreToggleText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '700',
  },

  // ── Expanded Description ───────────────────────────────────────────────────
  expandedDescBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 14,
  },
  expandedDescHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 6,
  },
  expandedDescText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 19,
  },
  collapseDescBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 4,
  },
  collapseDescText: {
    color: '#535aff',
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Channel Row & Action Pills ─────────────────────────────────────────────
  channelRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  channelRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  channelNameText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    maxWidth: 140,
  },
  subscribedBellWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionsScrollView: {
    paddingHorizontal: 16,
    marginVertical: 4,
  },
  channelAndActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  channelAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelAvatarText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  subscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
  },
  subscribedButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  subscribeButtonText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700',
  },
  subscribedButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  actionPillsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 10,
  },
  likeDislikePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 18,
    height: 34,
    paddingHorizontal: 10,
    gap: 8,
  },
  likeHalf: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dislikeHalf: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDivider: {
    width: 1,
    height: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 18,
    height: 34,
    paddingHorizontal: 12,
    gap: 6,
  },
  actionPillRound: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPillActive: {
    backgroundColor: 'rgba(83, 90, 255, 0.2)',
  },
  actionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Comments Preview Card (Exact Match to Screenshot) ──────────────────────
  commentsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  commentsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  commentsTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  commentsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  commentsCount: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.75)',
  },
  commentsInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentUserAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#3f3f46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarImg: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  mockCommentInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 16,
    height: 32,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  mockCommentPlaceholder: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
  },

  // ── Shorts Shelf Under Comments (Real YouTube Style) ───────────────────────
  shortsShelfWrap: {
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  shortsHeader: {
    marginBottom: 10,
  },
  shortsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shortsTitleText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  shortsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  shortCard: {
    flex: 1,
    aspectRatio: 9 / 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1c1c1e',
    position: 'relative',
  },
  shortThumb: {
    width: '100%',
    height: '100%',
  },
  shortGradientBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 18,
  },
  shortVideoTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  shortViewsText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 11,
    marginTop: 3,
  },
  shortDotsBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Up Next / Related Full-Width 16:9 Feed ─────────────────────────────────
  feedContainer: {
    marginTop: 6,
  },
  relatedLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  relatedLoadingText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
  },
  feedCard: {
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  feedThumbWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1c1c1e',
    position: 'relative',
  },
  feedThumb: {
    width: '100%',
    height: '100%',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  feedMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 10,
    gap: 12,
  },
  feedAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2c2c2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedAvatarText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  feedInfo: {
    flex: 1,
  },
  feedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 20,
  },
  feedSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 3,
  },
  feedChannelName: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.65)',
    fontWeight: '500',
  },
  verifiedCheck: {
    marginLeft: 2,
    marginRight: 2,
  },
  feedStatsText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  youtubeFeaturedTag: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.45)',
    marginTop: 2,
    fontWeight: '500',
  },
  feedDotsBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Floating Mini Player Bar Styles ────────────────────────────────────────
  miniPlayerContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 84 : 70,
    left: 8,
    right: 8,
    zIndex: 9999,
  },
  miniPlayerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(28, 28, 30, 0.96)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  miniThumbWrap: {
    width: 86,
    height: 48,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  miniThumb: {
    width: '100%',
    height: '100%',
  },
  miniInfo: {
    flex: 1,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  miniTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: -0.1,
  },
  miniChannel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.55)',
    marginTop: 2,
  },
  miniActionBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },

  // ── Modals & Sheets ────────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  commentsSheet: {
    backgroundColor: '#18181b',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '75%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
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
  commentsSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  sheetCount: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  sheetChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  filterChipActive: {
    backgroundColor: '#ffffff',
  },
  filterChipText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#000000',
  },
  commentsScroll: {
    paddingHorizontal: 16,
    maxHeight: 320,
  },
  commentItem: {
    flexDirection: 'row',
    marginVertical: 10,
    gap: 10,
  },
  commentAvatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarInitial: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  commentItemContent: {
    flex: 1,
  },
  commentAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  commentTimeAgo: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.45)',
  },
  commentBody: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 3,
    lineHeight: 18,
  },
  commentReactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  commentLikeCount: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.55)',
  },
  replyButtonText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.65)',
    fontWeight: '600',
    marginLeft: 18,
  },
  commentInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    gap: 10,
  },
  commentTextInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    height: 38,
    paddingHorizontal: 14,
    color: '#ffffff',
    fontSize: 13,
  },
  commentSendBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentSendBtnDisabled: {
    opacity: 0.4,
  },

  // ── 3-Dots Options Sheet Styles ────────────────────────────────────────────
  optionsSheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
  },
  optionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  optionsThumb: {
    width: 60,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#000000',
  },
  optionsHeaderTextWrap: {
    flex: 1,
  },
  optionsHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 17,
  },
  optionsHeaderSubtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 2,
  },
  optionsDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  optionRowText: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: '500',
  },
});

export const YouTubeWatchOverlay: React.FC = () => {
  return (
    <WatchOverlayErrorBoundary>
      <YouTubeWatchOverlayInner />
    </WatchOverlayErrorBoundary>
  );
};
