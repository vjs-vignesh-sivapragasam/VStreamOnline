import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  Modal,
  ToastAndroid,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import {
  youTubeService,
  YouTubeVideoItem,
  YouTubeSearchResult,
  YouTubeVideoDetails,
  YouTubeFormatOption,
  YouTubeAuthStatus,
  extractYouTubeVideoId,
  formatPublishedTime,
} from '@/services/YouTubeService';
import { youTubeListService, SavedYouTubeItem } from '@/services/YouTubeListService';
import { downloadService, DownloadItem } from '@/services/DownloadService';
import { QualityPickerModal } from '@/components/youtube/QualityPickerModal';
import { YouTubeAuthModal } from '@/components/youtube/YouTubeAuthModal';
import { useTheme } from '@/hooks/useTheme';
import { useYouTubePlayer } from '@/contexts/YouTubePlayerContext';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { isHapticsSupported } from '@/utils/platform';

const { width } = Dimensions.get('window');

const CATEGORY_CHIPS = [
  'All',
  'Today Tamil Live News',
  'Trending',
  'Tamil Movies',
  'Trailers',
  'Music',
  'News',
  'Comedy',
  'Podcasts',
  'Gaming',
];

interface CategoryConfig {
  query: string;
  sp?: string;
  refreshSp?: string;
}

const CATEGORY_MAP: Record<string, CategoryConfig> = {
  All: {
    query: 'trending',
    sp: 'CAMSBAgDEAE%253D', // This week's top trending & viral videos
    refreshSp: 'CAMSBAgCEAE%253D', // Today's trending / newly viral videos (updates daily)
  },
  'Today Tamil Live News': {
    query: 'today tamil live news',
    sp: 'EgJAAQ%253D%253D', // Live filter / today live streams
    refreshSp: 'CAI%253D',
  },
  Trending: {
    query: 'trending',
    sp: 'CAMSBAgCEAE%253D', // Today's top trending videos
    refreshSp: 'CAMSBAgDEAE%253D', // This week's trending
  },
  'Tamil Movies': {
    query: 'latest tamil movies 2026',
  },
  Trailers: {
    query: 'latest official trailers',
    sp: 'CAMSBAgDEAE%253D',
  },
  Music: {
    query: 'new trending songs',
    sp: 'CAMSBAgDEAE%253D',
  },
  News: {
    query: 'latest breaking news today',
    sp: 'CAMSBAgCEAE%253D',
  },
  Comedy: {
    query: 'trending comedy videos',
    sp: 'CAMSBAgDEAE%253D',
  },
  Podcasts: {
    query: 'popular podcasts',
    sp: 'CAMSBAgDEAE%253D',
  },
  Gaming: {
    query: 'trending gaming videos',
    sp: 'CAMSBAgDEAE%253D',
  },
};

interface VideoCardProps {
  item: YouTubeVideoItem;
  isLoading: boolean;
  isSaved: boolean;
  downloadItem?: DownloadItem;
  onPress: (item: YouTubeVideoItem) => void;
  onDownload: (item: YouTubeVideoItem) => void;
  onResumeDownload?: (item: YouTubeVideoItem) => void;
  onPauseDownload?: (item: YouTubeVideoItem) => void;
  onToggleSave: (item: YouTubeVideoItem) => void;
  onCopyLink: (item: YouTubeVideoItem) => void;
}

const VideoCard = memo<VideoCardProps>(({
  item,
  isLoading,
  isSaved,
  downloadItem,
  onPress,
  onDownload,
  onResumeDownload,
  onPauseDownload,
  onToggleSave,
  onCopyLink,
}) => {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={styles.cardContainer}
      activeOpacity={0.85}
      onPress={() => onPress(item)}
      disabled={isLoading}
    >
      {/* 16:9 Thumbnail with Duration Badge */}
      <View style={styles.thumbnailContainer}>
        <Image source={{ uri: item.thumbnail }} style={styles.thumbnailImage} />

        {/* Loading Overlay when stream is resolving */}
        {isLoading ? (
          <View style={styles.thumbnailLoadingOverlay}>
            <ActivityIndicator size="small" color="#ffffff" />
            <Text style={styles.loadingThumbText}>Loading stream...</Text>
          </View>
        ) : item.duration ? (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{item.duration}</Text>
          </View>
        ) : null}
      </View>

      {/* Video Metadata & Actions Row */}
      <View style={styles.cardMetaContainer}>
        {/* Channel Avatar Placeholder */}
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarLetter}>{(item.channel[0] || 'Y').toUpperCase()}</Text>
        </View>

        {/* Title & Subtitle */}
        <View style={styles.metaTextContainer}>
          <Text style={styles.videoTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.videoSubtitle} numberOfLines={1}>
            {item.channel}{item.published ? ` • ${formatPublishedTime(item.published)}` : ''}
          </Text>
        </View>

        {/* Action Buttons: Copy Link, Save & Download */}
        <View style={styles.cardActionsGroup}>
          <TouchableOpacity
            style={styles.cardCopyButton}
            onPress={() => onCopyLink(item)}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            activeOpacity={0.7}
          >
            <Ionicons name="copy-outline" size={17} color="#aaaaaa" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.cardBookmarkButton,
              isSaved && [styles.cardBookmarkButtonActive, { backgroundColor: `${theme.primary}33` }],
            ]}
            onPress={() => onToggleSave(item)}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isSaved ? 'bookmark' : 'bookmark-outline'}
              size={18}
              color={isSaved ? theme.primary : '#aaaaaa'}
            />
          </TouchableOpacity>

          {/* Download Button with Peer Health Indicator / Active Progress / Resume State */}
          {downloadItem?.status === 'downloading' ? (
            <TouchableOpacity
              style={[
                styles.cardActiveDownloadBtn,
                {
                  borderColor: theme.primary,
                  backgroundColor: `${theme.primary}18`,
                },
              ]}
              onPress={() => onPauseDownload ? onPauseDownload(item) : onDownload(item)}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              activeOpacity={0.7}
            >
              <ActivityIndicator size={11} color={theme.primary} style={{ marginRight: 4 }} />
              <Text style={[styles.cardProgressText, { color: theme.primaryLight || theme.primary }]}>
                {downloadItem.progress}%
              </Text>
            </TouchableOpacity>
          ) : downloadItem?.status === 'paused' ? (
            <TouchableOpacity
              style={[styles.cardActiveDownloadBtn, styles.cardResumeBtn]}
              onPress={() => onResumeDownload ? onResumeDownload(item) : onDownload(item)}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              activeOpacity={0.7}
            >
              <Ionicons name="play" size={11} color="#ffb300" style={{ marginRight: 3 }} />
              <Text style={[styles.cardProgressText, { color: '#ffb300' }]}>Resume</Text>
            </TouchableOpacity>
          ) : downloadItem?.status === 'completed' ? (
            <TouchableOpacity
              style={[styles.cardActiveDownloadBtn, styles.cardCompletedBtn]}
              onPress={() => onDownload(item)}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle" size={16} color="#00e676" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.cardDownloadButton}
              onPress={() => onDownload(item)}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-down-circle-outline" size={18} color="#ffffff" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function YouTubeScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [authStatus, setAuthStatus] = useState<YouTubeAuthStatus>({ authenticated: false });
  const [isAuthModalVisible, setIsAuthModalVisible] = useState(false);
  const { playVideo: playInYouTubeWatch } = useYouTubePlayer();
  const flatListRef = useRef<FlatList>(null);

  /**
   * Tap "Premium" logo / title to reload and refresh YouTube home
   */
  const handleHomeRefresh = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setSearchQuery('');
    setIsSearchOpen(false);
    setSelectedCategory('All');
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    setRefreshing(true);
    fetchVideos('All', true);
  }, []);


  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [videos, setVideos] = useState<YouTubeVideoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingVideoId, setLoadingVideoId] = useState<string | null>(null);

  // Infinite Scrolling & Lazy Loading State
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  // Pagination & Deduplication Tracking Refs
  const continuationTokenRef = useRef<string | undefined>(undefined);
  const apiKeyRef = useRef<string | undefined>(undefined);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const isLoadingMoreRef = useRef(false);
  const activeQueryRef = useRef('');
  const refreshToggleRef = useRef(false);

  // My List modal state
  const [myListModalVisible, setMyListModalVisible] = useState(false);

  // Header Filter Modal state:
  // "in the filters always selected lastest vidoe at top, language selection - tamil, english by default select"
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [sortBy, setSortBy] = useState<'latest' | 'relevance' | 'views'>('latest');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(['Tamil', 'English']);

  // Download Toast State
  const [downloadToast, setDownloadToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  const showDownloadToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setDownloadToast(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setDownloadToast(null);
    }, 2800);
  }, []);

  // Downloads tracking for header badge & real-time card state
  const [downloadsCount, setDownloadsCount] = useState<number>(() => {
    try {
      return downloadService.getDownloads().filter((d) => d.id.startsWith('yt_') || d.sourceType === 'direct').length;
    } catch {
      return 0;
    }
  });
  const [downloadsMap, setDownloadsMap] = useState<Map<string, DownloadItem>>(new Map());


  // Auto-resume pending downloads on app start
  useEffect(() => {
    const timer = setTimeout(() => {
      downloadService.autoResumePendingDownloads();
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const updateDownloads = (items: DownloadItem[]) => {
      setDownloadsCount(items.filter((d) => d.id.startsWith('yt_') || d.sourceType === 'direct').length);
      const map = new Map<string, DownloadItem>();
      for (const d of items) {
        if (d.id.startsWith('yt_')) {
          const parts = d.id.split('_');
          const videoId = parts[1];
          if (videoId) {
            map.set(videoId, d);
          }
        }
      }
      setDownloadsMap(map);
    };

    updateDownloads(downloadService.getDownloads());
    const unsub = downloadService.addListener(updateDownloads);
    return unsub;
  }, []);

  // Saved YouTube List state & subscription
  const [savedList, setSavedList] = useState<SavedYouTubeItem[]>(() => youTubeListService.getSavedList());
  const savedIds = useMemo(() => new Set(savedList.map((item) => item.id)), [savedList]);

  useEffect(() => {
    const unsub = youTubeListService.subscribe((list) => {
      setSavedList(list);
    });
    return unsub;
  }, []);

  // Quality Download Modal State
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [modalVideoDetails, setModalVideoDetails] = useState<YouTubeVideoDetails | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [targetVideoItem, setTargetVideoItem] = useState<YouTubeVideoItem | null>(null);

  // Check Google / YouTube auth status on mount
  useEffect(() => {
    let mounted = true;
    youTubeService.getAuthStatus().then((status) => {
      if (mounted) {
        setAuthStatus(status);
        if (status.authenticated && selectedCategory === 'All') {
          setSelectedCategory('Home');
        }
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Dynamic Category Chips reflecting Google Account feeds
  const dynamicCategoryChips = useMemo(() => {
    if (authStatus.authenticated) {
      return ['Home', 'Subscriptions', 'History', ...CATEGORY_CHIPS.filter((c) => c !== 'All')];
    }
    return CATEGORY_CHIPS;
  }, [authStatus.authenticated]);

  /**
   * Fetch videos for a query or category with daily updated feed support.
   */
  const fetchVideos = async (target: string, isPullToRefresh = false) => {
    activeQueryRef.current = target;
    setLoadMoreError(null);
    isLoadingMoreRef.current = false;

    if (!isPullToRefresh) {
      setIsLoading(true);
    }

    try {
      let result: YouTubeSearchResult;

      if (target === 'Home') {
        result = await youTubeService.getHomeFeed();
      } else if (target === 'Subscriptions') {
        result = await youTubeService.getSubscriptionsFeed();
      } else if (target === 'History') {
        result = await youTubeService.getHistoryFeed();
      } else {
        let resolvedQuery = target;
        let sp: string | undefined = undefined;

        const catConfig = CATEGORY_MAP[target];
        if (catConfig) {
          resolvedQuery = catConfig.query;
          if (isPullToRefresh && catConfig.refreshSp) {
            refreshToggleRef.current = !refreshToggleRef.current;
            sp = refreshToggleRef.current ? catConfig.refreshSp : catConfig.sp;
          } else {
            sp = catConfig.sp;
          }
        }

        // Apply "Latest videos at top" sort parameter (CAI%253D) if selected
        if (sortBy === 'latest') {
          if (!sp || sp.includes('CAMSBAg')) {
            sp = 'CAI%253D';
          }
        } else if (sortBy === 'views') {
          if (!sp || sp.includes('CAMSBAg')) {
            sp = 'CAM%253D';
          }
        }

        // Apply language preferences to general / broad categories
        if ((target === 'All' || target === 'Trending' || target === 'Trailers') && selectedLanguages.length > 0) {
          const langKeywords = selectedLanguages.map((l) => l.toLowerCase()).join(' ');
          resolvedQuery = `${resolvedQuery} ${langKeywords}`;
        }

        result = await youTubeService.searchWithContinuation(resolvedQuery, sp);
      }

      if (activeQueryRef.current !== target) return;

      const allFetched = (result.videos || []).filter(
        (v) => !v.isShort && !v.title?.toLowerCase().includes('#short')
      );
      seenIdsRef.current = new Set(allFetched.map((v) => v.id));
      continuationTokenRef.current = result.continuationToken;
      apiKeyRef.current = result.apiKey;

      setVideos(allFetched);
      setHasMore(!!result.continuationToken && allFetched.length > 0);
    } catch (err: any) {
      console.warn('[YouTubeScreen] Error fetching videos:', err);
      setLoadMoreError(err?.message || 'Failed to load videos. Tap to retry.');
      setHasMore(false);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  /**
   * Lazily loads the next batch of videos when user approaches the bottom of the list.
   * Prevents concurrent API calls, avoids duplicates, and maintains scroll position.
   */
  const handleLoadMore = useCallback(
    async (isRetry = false) => {
      // 1. Prevent duplicate requests while a previous request is already in progress
      if (isLoadingMoreRef.current || isLoading || refreshing) return;
      if (!hasMore && !isRetry) return;

      const token = continuationTokenRef.current;
      if (!token) {
        setHasMore(false);
        return;
      }

      isLoadingMoreRef.current = true;
      setIsLoadingMore(true);
      setLoadMoreError(null);

      try {
        const continuationResult = await youTubeService.fetchContinuation(
          token,
          apiKeyRef.current
        );

        const fetchedVideos = (continuationResult.videos || []).filter(
          (v) => !v.isShort && !v.title?.toLowerCase().includes('#short')
        );
        continuationTokenRef.current = continuationResult.continuationToken;
        if (continuationResult.apiKey) {
          apiKeyRef.current = continuationResult.apiKey;
        }

        // Avoid loading duplicate videos
        const uniqueVideos: YouTubeVideoItem[] = [];
        for (const item of fetchedVideos) {
          if (item.id && !seenIdsRef.current.has(item.id)) {
            seenIdsRef.current.add(item.id);
            uniqueVideos.push(item);
          }
        }

        if (uniqueVideos.length > 0) {
          setVideos((prev) => [...prev, ...uniqueVideos]);
        }
        setHasMore(!!continuationResult.continuationToken);
      } catch (err: any) {
        console.warn('[YouTubeScreen] Error loading more videos:', err);
        setLoadMoreError(err?.message || 'Could not load more videos.');
      } finally {
        isLoadingMoreRef.current = false;
        setIsLoadingMore(false);
      }
    },
    [isLoading, refreshing, hasMore]
  );

    useEffect(() => {
    fetchVideos(selectedCategory);
  }, [selectedCategory]);



  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchVideos(searchQuery.trim() || selectedCategory, true);
  }, [searchQuery, selectedCategory]);

  const handleToggleSave = useCallback(
    async (item: YouTubeVideoItem) => {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const added = await youTubeListService.toggleSave({
        id: item.id,
        title: item.title,
        channel: item.channel,
        thumbnail: item.thumbnail,
        duration: item.duration,
        views: item.views,
        published: item.published,
      });

      if (added) {
        Alert.alert('Saved', `Added "${item.title}" to your YouTube Saved List.`);
      }
    },
    []
  );



  /**
   * Play video in Real YouTube Watch Screen (matches YouTube iOS layout)
   */
  const handlePlayVideo = useCallback(
    (item: YouTubeVideoItem) => {
      playInYouTubeWatch(item);
    },
    [playInYouTubeWatch]
  );

  const handleSearchSubmit = () => {
    const q = searchQuery.trim();
    if (!q) return;

    const videoId = extractYouTubeVideoId(q);
    if (videoId) {
      setSearchQuery('');
      playInYouTubeWatch({
        id: videoId,
        title: 'YouTube Video',
        channel: 'YouTube',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      });
      return;
    }

    fetchVideos(q);
  };

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
      const trimmed = text.trim();
      const videoId = extractYouTubeVideoId(trimmed);
      // Auto-detect when a YouTube link is pasted directly into the input field
      if (videoId && (trimmed.includes('youtube.com') || trimmed.includes('youtu.be'))) {
        setSearchQuery('');
        playInYouTubeWatch({
          id: videoId,
          title: 'YouTube Video',
          channel: 'YouTube',
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        });
      }
    },
    [playInYouTubeWatch]
  );

  const handleClearSearch = () => {
    setSearchQuery('');
    fetchVideos(selectedCategory);
  };

  const handleCopyLink = useCallback(async (item: YouTubeVideoItem) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const realUrl = `https://www.youtube.com/watch?v=${item.id}`;
    await Clipboard.setStringAsync(realUrl);
    Alert.alert('Link Copied', `Real YouTube link copied to clipboard:\n${realUrl}`);
  }, []);

  const handlePasteLink = useCallback(async () => {
    try {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      const text = await Clipboard.getStringAsync();
      if (!text || !text.trim()) {
        Alert.alert('Clipboard is Empty', 'Copy a real YouTube video link, then tap Paste here.');
        return;
      }

      const trimmed = text.trim();
      const videoId = extractYouTubeVideoId(trimmed);

      if (videoId) {
        // Direct YouTube video link detected! Immediately open & play in real YouTube watch screen
        setSearchQuery('');
        playInYouTubeWatch({
          id: videoId,
          title: 'YouTube Video',
          channel: 'YouTube',
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        });
      } else {
        // Plain text query: paste into search input & search
        setSearchQuery(trimmed);
        fetchVideos(trimmed);
      }
    } catch (err) {
      console.warn('[YouTubeScreen] Error pasting link:', err);
    }
  }, [playInYouTubeWatch]);

  const handleOpenDownloadModal = useCallback(async (item: YouTubeVideoItem) => {
    setTargetVideoItem(item);
    setDownloadModalVisible(true);
    setModalLoading(true);
    setModalVideoDetails(null);

    try {
      const details = await youTubeService.getVideoDetails(item.id);
      setModalVideoDetails(details);
    } catch (err: any) {
      Alert.alert('Format Error', err?.message || 'Could not load formats for this video.');
      setDownloadModalVisible(false);
    } finally {
      setModalLoading(false);
    }
  }, []);

  const handleResumeDownload = useCallback(async (item: YouTubeVideoItem) => {
    const dl = downloadsMap.get(item.id);
    if (dl) {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      await downloadService.resumeDownload(dl.id);
    }
  }, [downloadsMap]);

  const handlePauseDownload = useCallback(async (item: YouTubeVideoItem) => {
    const dl = downloadsMap.get(item.id);
    if (dl) {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      await downloadService.pauseDownload(dl.id);
    }
  }, [downloadsMap]);

  const handlePlaySpecificFormat = useCallback(
    (format: YouTubeFormatOption) => {
      setDownloadModalVisible(false);

      if (!targetVideoItem) return;

      router.push({
        pathname: '/stream/player' as any,
        params: {
          videoUrl: format.url,
          title: `${targetVideoItem.title} (${format.quality})`,
          poster: targetVideoItem.thumbnail,
        },
      });
    },
    [router, targetVideoItem]
  );

  const handleClearAllMyList = useCallback(() => {
    Alert.alert(
      'Clear My List',
      'Are you sure you want to remove all saved videos from My List?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            if (await isHapticsSupported()) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
            await youTubeListService.clearAll();
          },
        },
      ]
    );
  }, []);

  const handleDownloadFormat = async (format: YouTubeFormatOption) => {
    setDownloadModalVisible(false);

    if (!targetVideoItem) return;

    try {
      const isAudio = format.type === 'audio';
      const ext = isAudio ? 'mp3' : 'mp4';
      const cleanTitle = (modalVideoDetails?.title || targetVideoItem.title)
        .replace(/[^a-zA-Z0-9\s-_]/g, '')
        .trim();
      const cleanQuality = format.quality.replace(/[^a-zA-Z0-9]/g, '');
      const fileName = `${cleanTitle}_${cleanQuality}.${ext}`;
      const downloadId = `yt_${targetVideoItem.id}_${format.itag}_${ext}`;

      // Guarantee that downloaded video ALWAYS has an audio track
      const downloadStreamUrl = await youTubeService.resolveDownloadStreamUrl(targetVideoItem.id, format);

      if (!downloadStreamUrl) {
        throw new Error('Unable to resolve download URL. Please try another quality.');
      }

      await downloadService.startDirectDownload({
        id: downloadId,
        title: targetVideoItem.title,
        poster: targetVideoItem.thumbnail,
        fileName,
        streamUrl: downloadStreamUrl,
        fileLength: format.contentLength,
      });

      showDownloadToast(`Download started (${isAudio ? 'MP3 Audio' : format.quality})`);
      if (Platform.OS === 'android') {
        ToastAndroid.show('Download started', ToastAndroid.SHORT);
      }
      if (await isHapticsSupported()) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      showDownloadToast(err?.message || 'Could not start download');
    }
  };

  const renderVideoCard = useCallback(
    ({ item }: { item: YouTubeVideoItem; index: number }) => {
      return (
        <VideoCard
          key={item.id}
          item={item}
          isLoading={loadingVideoId === item.id}
          isSaved={savedIds.has(item.id)}
          downloadItem={downloadsMap.get(item.id)}
          onPress={handlePlayVideo}
          onDownload={handleOpenDownloadModal}
          onResumeDownload={handleResumeDownload}
          onPauseDownload={handlePauseDownload}
          onToggleSave={handleToggleSave}
          onCopyLink={handleCopyLink}
        />
      );
    },
    [loadingVideoId, savedIds, downloadsMap, handlePlayVideo, handleOpenDownloadModal, handleResumeDownload, handlePauseDownload, handleToggleSave, handleCopyLink]
  );

  const keyExtractor = useCallback((item: YouTubeVideoItem) => item.id, []);

  const renderListFooter = useCallback(() => {
    if (isLoadingMore) {
      return (
        <View style={styles.footerContainer}>
          <ActivityIndicator size="small" color="#FF0000" />
          <Text style={styles.footerLoadingText}>Loading more videos...</Text>
        </View>
      );
    }

    if (loadMoreError) {
      return (
        <View style={styles.footerErrorContainer}>
          <Ionicons name="alert-circle-outline" size={20} color="#ff4444" />
          <Text style={styles.footerErrorText}>{loadMoreError}</Text>
          <TouchableOpacity
            style={styles.footerRetryBtn}
            onPress={() => handleLoadMore(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="reload-outline" size={14} color="#ffffff" style={{ marginRight: 4 }} />
            <Text style={styles.footerRetryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!hasMore && videos.length > 0) {
      return (
        <View style={styles.footerEndContainer}>
          <View style={styles.footerEndDot} />
          <Text style={styles.footerEndText}>You've reached the end</Text>
        </View>
      );
    }

    return <View style={styles.footerBottomSpacing} />;
  }, [isLoadingMore, loadMoreError, hasMore, videos.length, handleLoadMore]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />

      {/* Header Bar */}
      <View style={styles.headerBar}>
        <View style={styles.headerTopRow}>
          {/* Logo: Tap "Premium" to refresh and reload YouTube Home */}
          <TouchableOpacity
            style={styles.logoRow}
            onPress={handleHomeRefresh}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View style={styles.ytLogoBox}>
              <Ionicons name="play" size={14} color="#ffffff" />
            </View>
            <Text style={styles.logoText}>Premium</Text>


          </TouchableOpacity>

          {/* Top Header Icons: Downloads, Search, My List, Profile Avatar */}
          <View style={styles.headerActionsRow}>
            {/* 1. Downloads Shortcut with real-time Badge */}
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => router.push({ pathname: '/(tabs)/library' as any, params: { tab: 'YouTube' } })}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            >
              <Ionicons name="cloud-download-outline" size={20} color="#ffffff" />
              {downloadsCount > 0 && (
                <View style={[styles.headerBadge, { backgroundColor: theme.primary }]}>
                  <Text style={styles.headerBadgeText}>
                    {downloadsCount > 99 ? '99+' : downloadsCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* 2. Search Icon */}
            <TouchableOpacity
              style={[
                styles.headerActionBtn,
                isSearchOpen && [
                  styles.headerActionBtnActive,
                  { backgroundColor: `${theme.primary}33`, borderColor: theme.primary, borderWidth: 1 },
                ],
              ]}
              onPress={() => {
                setIsSearchOpen((prev) => {
                  const next = !prev;
                  if (next) {
                    setTimeout(() => searchInputRef.current?.focus(), 100);
                  }
                  return next;
                });
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            >
              <Ionicons
                name={isSearchOpen ? 'close' : 'search-outline'}
                size={21}
                color="#ffffff"
              />
            </TouchableOpacity>

            {/* 2. My List Icon */}
            <TouchableOpacity
              style={[
                styles.headerActionBtn,
                myListModalVisible && [
                  styles.headerActionBtnActive,
                  { backgroundColor: `${theme.primary}33`, borderColor: theme.primary, borderWidth: 1 },
                ],
              ]}
              onPress={async () => {
                if (await isHapticsSupported()) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                setMyListModalVisible(true);
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            >
              <Ionicons
                name="bookmark-outline"
                size={19}
                color="#ffffff"
              />
              {savedList.length > 0 && (
                <View style={[styles.headerBadge, { backgroundColor: theme.primary }]}>
                  <Text style={styles.headerBadgeText}>
                    {savedList.length > 99 ? '99+' : savedList.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* 3. Google / YouTube Account Profile Avatar Button */}
            <TouchableOpacity
              style={[
                styles.headerActionBtn,
                authStatus.authenticated && [styles.headerAccountBtn, { borderColor: theme.primary }],
              ]}
              onPress={async () => {
                if (await isHapticsSupported()) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                setIsAuthModalVisible(true);
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            >
              {authStatus.authenticated && authStatus.user?.avatar ? (
                <Image source={{ uri: authStatus.user.avatar }} style={styles.headerAvatarImg} />
              ) : authStatus.authenticated ? (
                <View style={[styles.headerAvatarFallback, { backgroundColor: theme.primary }]}>
                  <Text style={styles.headerAvatarFallbackText}>
                    {(authStatus.user?.name || 'U').charAt(0).toUpperCase()}
                  </Text>
                </View>
              ) : (
                <Ionicons
                  name="person-circle-outline"
                  size={23}
                  color="#ffffff"
                />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Expandable Search Input Box with Real YouTube Link Paste */}
        {isSearchOpen && (
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#888888" style={styles.searchIcon} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder="Search or paste YouTube link..."
              placeholderTextColor="#777777"
              value={searchQuery}
              onChangeText={handleSearchChange}
              onSubmitEditing={handleSearchSubmit}
              returnKeyType="search"
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity onPress={handleClearSearch} style={styles.clearSearchButton}>
                <Ionicons name="close-circle" size={18} color="#888888" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handlePasteLink}
                style={[styles.pasteButton, { backgroundColor: `${theme.primary}25` }]}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="clipboard-outline" size={15} color={theme.primary} style={{ marginRight: 4 }} />
                <Text style={[styles.pasteButtonText, { color: theme.primary }]}>Paste</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Category Chips Bar */}
      <View style={styles.chipsContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          ListFooterComponent={
            <TouchableOpacity
              style={[
                styles.filterChipRoundBtn,
                (sortBy === 'latest' || selectedLanguages.length > 0) && [
                  styles.filterChipBtnActive,
                  { borderColor: theme.primary },
                ],
              ]}
              onPress={async () => {
                if (await isHapticsSupported()) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                setIsFilterModalVisible(true);
              }}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="options-outline" size={16} color="#ffffff" />
              {(sortBy === 'latest' || selectedLanguages.length > 0) && (
                <View style={[styles.filterIndicatorDot, { backgroundColor: theme.primary }]} />
              )}
            </TouchableOpacity>
          }
          data={dynamicCategoryChips}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.chipsContent}
          renderItem={({ item }) => {
            const isSelected = selectedCategory === item && !searchQuery.trim();
            return (
              <TouchableOpacity
                style={[
                  styles.chipButton,
                  isSelected && styles.chipButtonSelected,
                ]}
                onPress={() => {
                  setSearchQuery('');
                  setSelectedCategory(item);
                }}
                activeOpacity={0.8}
              >
                {item === 'Home' && (
                  <Ionicons
                    name="sparkles"
                    size={13}
                    color={isSelected ? '#000000' : theme.primary}
                    style={{ marginRight: 5 }}
                  />
                )}
                {item === 'Today Tamil Live News' && (
                  <Ionicons
                    name="radio"
                    size={13}
                    color={isSelected ? '#000000' : '#FF0000'}
                    style={{ marginRight: 5 }}
                  />
                )}
                {item === 'Trending' && (
                  <Ionicons
                    name="flame"
                    size={13}
                    color={isSelected ? '#000000' : '#FF6B00'}
                    style={{ marginRight: 5 }}
                  />
                )}
                {item === 'Subscriptions' && (
                  <Ionicons
                    name="albums-outline"
                    size={13}
                    color={isSelected ? '#000000' : theme.primary}
                    style={{ marginRight: 5 }}
                  />
                )}
                {item === 'History' && (
                  <Ionicons
                    name="time-outline"
                    size={13}
                    color={isSelected ? '#000000' : theme.primary}
                    style={{ marginRight: 5 }}
                  />
                )}
                <Text
                  style={[styles.chipText, isSelected && styles.chipTextSelected]}
                  numberOfLines={1}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Videos List Feed */}
      {isLoading && !refreshing ? (
        <View style={styles.loadingFeedContainer}>
          <ActivityIndicator size="large" color="#FF0000" />
          <Text style={styles.loadingFeedText}>Loading videos...</Text>
        </View>
      ) : videos.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name={loadMoreError ? 'alert-circle-outline' : 'film-outline'}
            size={56}
            color={loadMoreError ? '#ff4444' : '#444444'}
          />
          <Text style={styles.emptyTitle}>
            {loadMoreError ? 'Could not load videos' : 'No videos found'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {loadMoreError
              ? loadMoreError
              : 'Try searching for a different keyword or category.'}
          </Text>
          {loadMoreError && (
            <TouchableOpacity
              style={styles.emptyRetryBtn}
              onPress={() => fetchVideos(searchQuery.trim() || selectedCategory)}
              activeOpacity={0.7}
            >
              <Ionicons name="reload-outline" size={15} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.emptyRetryText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          key="videos_list"
          ref={flatListRef}
          data={videos}
          keyExtractor={keyExtractor}
          renderItem={renderVideoCard}
          contentContainerStyle={styles.feedScrollContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          updateCellsBatchingPeriod={50}
          onEndReached={() => handleLoadMore(false)}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderListFooter}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#FF0000"
              colors={['#FF0000']}
            />
          }
        />
      )}

      {/* Quality Picker Modal */}
      <QualityPickerModal
        visible={downloadModalVisible}
        videoDetails={modalVideoDetails}
        isLoading={modalLoading}
        onClose={() => setDownloadModalVisible(false)}
        onSelectFormat={handleDownloadFormat}
        onPlayFormat={handlePlaySpecificFormat}
        isSaved={savedIds.has(modalVideoDetails?.id || targetVideoItem?.id || '')}
        onToggleSave={() => targetVideoItem && handleToggleSave(targetVideoItem)}
      />

      {/* My List / Saved Videos Modal */}
      <Modal
        visible={myListModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setMyListModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setMyListModalVisible(false)}
          />

          <View style={styles.myListModalContent}>
            {/* Drag Handle Indicator */}
            <View style={styles.myListDragHandle} />

            {/* Modal Header */}
            <View style={styles.myListHeader}>
              <View style={styles.myListTitleRow}>
                <Ionicons name="bookmark" size={20} color={theme.primary} style={{ marginRight: 8 }} />
                <Text style={styles.myListTitle}>My List</Text>
                {savedList.length > 0 && (
                  <View style={[styles.myListCountBadge, { backgroundColor: `${theme.primary}33` }]}>
                    <Text style={[styles.myListCountText, { color: theme.primary }]}>{savedList.length}</Text>
                  </View>
                )}
              </View>

              <View style={styles.myListHeaderActions}>
                {savedList.length > 0 && (
                  <TouchableOpacity
                    style={styles.clearAllBtn}
                    onPress={handleClearAllMyList}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={15} color="#ff4444" style={{ marginRight: 4 }} />
                    <Text style={styles.clearAllBtnText}>Clear All</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.myListCloseBtn}
                  onPress={() => setMyListModalVisible(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={22} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Modal Body */}
            {savedList.length === 0 ? (
              <View style={styles.myListEmptyBox}>
                <Ionicons name="bookmark-outline" size={54} color="#444444" />
                <Text style={styles.myListEmptyTitle}>Your List is Empty</Text>
                <Text style={styles.myListEmptySub}>
                  Tap the bookmark icon on any YouTube video to save it to My List for quick access anytime.
                </Text>
              </View>
            ) : (
              <FlatList
                data={savedList}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.myListScrollContent}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.myListItemCard}
                    activeOpacity={0.8}
                    onPress={() => {
                      setMyListModalVisible(false);
                      handlePlayVideo(item);
                    }}
                  >
                    {/* Thumbnail */}
                    <View style={styles.myListThumbWrap}>
                      <Image source={{ uri: item.thumbnail }} style={styles.myListThumb} />
                      {item.duration ? (
                        <View style={styles.myListDurationBadge}>
                          <Text style={styles.myListDurationText}>{item.duration}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Metadata */}
                    <View style={styles.myListMeta}>
                      <Text style={styles.myListItemTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={styles.myListItemChannel} numberOfLines={1}>
                        {item.channel} {item.views ? `• ${item.views}` : ''}
                      </Text>
                    </View>

                    {/* Remove from Saved List Button */}
                    <TouchableOpacity
                      style={styles.myListRemoveBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={async () => {
                        if (await isHapticsSupported()) {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }
                        await youTubeListService.removeItem(item.id);
                      }}
                    >
                      <Ionicons name="trash-outline" size={19} color="#ff4444" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
      {/* YouTube Google Account / SSO Modal */}
      <YouTubeAuthModal
        visible={isAuthModalVisible}
        onClose={() => setIsAuthModalVisible(false)}
        authStatus={authStatus}
        onAuthChange={(s) => {
          setAuthStatus(s);
          if (s.authenticated) {
            setSelectedCategory('Home');
            fetchVideos('Home', true);
          } else {
            setSelectedCategory('All');
            fetchVideos('All', true);
          }
        }}
        onSelectFeed={(feed) => setSelectedCategory(feed)}
      />

      {/* Search & Feed Filter Settings Modal */}
      <Modal
        visible={isFilterModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsFilterModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setIsFilterModalVisible(false)}
          />

          <View style={styles.filterModalCard}>
            {/* Drag Handle Indicator */}
            <View style={styles.myListDragHandle} />

            {/* Modal Header */}
            <View style={styles.filterModalHeader}>
              <View style={styles.filterModalHeaderLeft}>
                <Ionicons name="options-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.filterModalTitle}>Search & Feed Filters</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsFilterModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#aaaaaa" />
              </TouchableOpacity>
            </View>

            {/* Section 1: Sort Order (Latest video at top is always selected by default) */}
            <Text style={styles.filterSectionTitle}>Sort Order (Latest videos at top)</Text>
            <View style={styles.filterOptionsGroup}>
              {[
                { id: 'latest', label: 'Latest videos at top (Newest first)', desc: 'Newly uploaded videos appear first' },
                { id: 'relevance', label: 'Relevance', desc: 'Standard YouTube ranking' },
                { id: 'views', label: 'View count (Most popular)', desc: 'Highest views first' },
              ].map((opt) => {
                const isSelected = sortBy === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.filterRadioRow, isSelected && styles.filterRadioRowActive]}
                    onPress={async () => {
                      if (await isHapticsSupported()) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                      setSortBy(opt.id as any);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.filterRadioTextCol}>
                      <Text style={[styles.filterRadioLabel, isSelected && { color: '#ffffff', fontWeight: '700' }]}>
                        {opt.label}
                      </Text>
                      <Text style={styles.filterRadioDesc}>{opt.desc}</Text>
                    </View>
                    <View style={[styles.radioCircle, isSelected && { borderColor: theme.primary }]}>
                      {isSelected && <View style={[styles.radioCircleFill, { backgroundColor: theme.primary }]} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Section 2: Languages (Tamil, English default selected) */}
            <Text style={[styles.filterSectionTitle, { marginTop: 16 }]}>
              Language Selection (Tamil & English by default)
            </Text>
            <View style={styles.languagesWrap}>
              {['Tamil', 'English', 'Hindi', 'Telugu', 'Malayalam', 'Kannada'].map((lang) => {
                const isChecked = selectedLanguages.includes(lang);
                return (
                  <TouchableOpacity
                    key={lang}
                    style={[
                      styles.langChip,
                      isChecked && [styles.langChipActive, { backgroundColor: `${theme.primary}25`, borderColor: theme.primary }],
                    ]}
                    onPress={async () => {
                      if (await isHapticsSupported()) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                      setSelectedLanguages((prev) =>
                        prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
                      );
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={isChecked ? 'checkmark-circle' : 'ellipse-outline'}
                      size={15}
                      color={isChecked ? theme.primary : '#777777'}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.langChipText, isChecked && { color: '#ffffff', fontWeight: '600' }]}>
                      {lang}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Footer Action Buttons */}
            <View style={styles.filterModalFooter}>
              <TouchableOpacity
                style={styles.filterResetBtn}
                onPress={() => {
                  setSortBy('latest');
                  setSelectedLanguages(['Tamil', 'English']);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.filterResetBtnText}>Reset Defaults</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterApplyBtn, { backgroundColor: theme.primary }]}
                onPress={() => {
                  setIsFilterModalVisible(false);
                  fetchVideos(searchQuery.trim() || selectedCategory, true);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.filterApplyBtnText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Floating Download Toast Pill */}
      {downloadToast && (
        <View style={styles.downloadToastPill} pointerEvents="none">
          <Ionicons name="arrow-down-circle" size={18} color="#00e5ff" style={{ marginRight: 8 }} />
          <Text style={styles.downloadToastText}>{downloadToast}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  headerBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: '#0a0a0c',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerActionBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  headerAccountBtn: {
    borderWidth: 1.5,
    borderColor: '#ffffff',
    overflow: 'hidden',
  },
  headerAvatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  headerAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarFallbackText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  headerBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: '#ff0000',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#0a0a0c',
  },
  headerBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  ytLogoBox: {
    width: 28,
    height: 20,
    borderRadius: 6,
    backgroundColor: '#FF0000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#ffffff',
    fontSize: 21,
    fontFamily: Platform.select({
      ios: 'AvenirNextCondensed-Bold',
      android: 'sans-serif-condensed',
      default: 'sans-serif',
    }),
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  adFreeBadge: {
    backgroundColor: 'rgba(0, 255, 136, 0.15)',
    borderColor: '#00ff88',
    borderWidth: 0.8,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4,
  },
  adFreeText: {
    color: '#00ff88',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginTop: 10,
    marginBottom: 4,
    height: 44,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
    paddingVertical: 8,
    paddingHorizontal: 6,
    height: '100%',
  },
  clearSearchButton: {
    padding: 4,
  },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pasteButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  chipsContainer: {
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  chipsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'nowrap',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  chipButtonSelected: {
    backgroundColor: '#ffffff',
  },
  savedChipButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipText: {
    color: '#aaaaaa',
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 0,
  },
  chipTextSelected: {
    color: '#000000',
  },
  feedScrollContent: {
    paddingBottom: 110,
  },
  cardContainer: {
    marginBottom: 20,
  },
  thumbnailContainer: {
    width: '100%',
    height: width * (9 / 16),
    backgroundColor: '#1f1f23',
    position: 'relative',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  thumbnailLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingThumbText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  cardMetaContainer: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingTop: 10,
    alignItems: 'flex-start',
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2a2a30',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  avatarLetter: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  metaTextContainer: {
    flex: 1,
  },
  videoTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
    marginBottom: 4,
  },
  videoSubtitle: {
    color: '#888888',
    fontSize: 12,
  },
  cardActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    gap: 6,
  },
  cardCopyButton: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardBookmarkButton: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardBookmarkButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  cardDownloadButton: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  loadingFeedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingFeedText: {
    marginTop: 12,
    color: '#888888',
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#777777',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  emptyRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333333',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  emptyRetryText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  footerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  footerLoadingText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    fontWeight: '500',
  },
  footerErrorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 24,
    gap: 8,
  },
  footerErrorText: {
    color: '#ff6b6b',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
  },
  footerRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333333',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    marginTop: 4,
  },
  footerRetryText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  footerEndContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  footerEndDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  footerEndText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 12,
    fontWeight: '500',
  },
  footerBottomSpacing: {
    height: 30,
  },
  playerContainer: {
    width: '100%',
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  playerContainerTheater: {
    backgroundColor: '#000000',
    borderBottomColor: '#222222',
  },
  activeVideoInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#121216',
  },
  activeVideoInfoLeft: {
    flex: 1,
    marginRight: 12,
  },
  activeVideoTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  activeVideoChannel: {
    color: '#aaaaaa',
    fontSize: 12,
    fontWeight: '500',
  },
  closePlayerBtn: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  myListModalContent: {
    backgroundColor: '#16161a',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '80%',
    minHeight: 320,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    paddingHorizontal: 16,
  },
  myListDragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  myListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  myListTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  myListTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  myListCountBadge: {
    marginLeft: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  myListCountText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  myListHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.25)',
  },
  clearAllBtnText: {
    color: '#ff4444',
    fontSize: 12,
    fontWeight: '600',
  },
  myListCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  myListScrollContent: {
    paddingVertical: 12,
    gap: 12,
  },
  myListItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    padding: 10,
    gap: 12,
  },
  myListThumbWrap: {
    width: 96,
    height: 54,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000000',
    position: 'relative',
  },
  myListThumb: {
    width: '100%',
    height: '100%',
  },
  myListDurationBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  myListDurationText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
  },
  myListMeta: {
    flex: 1,
    gap: 4,
  },
  myListItemTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  myListItemChannel: {
    color: '#888888',
    fontSize: 11,
  },
  myListRemoveBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
  },
  myListEmptyBox: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  myListEmptyTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  myListEmptySub: {
    color: '#777777',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 18,
  },
  filterIndicatorDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  filterChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  filterChipBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  filterChipRoundBtn: {
    width: 36,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    marginRight: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  filterChipText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  filterModalCard: {
    backgroundColor: '#16161a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  filterModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 8,
  },
  filterModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  filterSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#aaaaaa',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 8,
  },
  filterOptionsGroup: {
    gap: 8,
  },
  filterRadioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  filterRadioRowActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
  },
  filterRadioTextCol: {
    flex: 1,
  },
  filterRadioLabel: {
    fontSize: 14,
    color: '#dddddd',
    fontWeight: '500',
  },
  filterRadioDesc: {
    fontSize: 11,
    color: '#888888',
    marginTop: 2,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#666666',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  radioCircleFill: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  languagesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  langChipActive: {
    borderWidth: 1,
  },
  langChipText: {
    fontSize: 13,
    color: '#cccccc',
    fontWeight: '500',
  },
  filterModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 22,
  },
  filterResetBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterResetBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#cccccc',
  },
  filterApplyBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterApplyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  cardActiveDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  cardResumeBtn: {
    backgroundColor: 'rgba(255, 179, 0, 0.15)',
    borderColor: 'rgba(255, 179, 0, 0.4)',
  },
  cardCompletedBtn: {
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    borderColor: 'rgba(0, 230, 118, 0.4)',
    paddingHorizontal: 6,
  },
  cardProgressText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
  downloadToastPill: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 20, 24, 0.95)',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 999999,
  },
  downloadToastText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});