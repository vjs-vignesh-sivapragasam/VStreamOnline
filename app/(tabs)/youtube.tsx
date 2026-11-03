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
} from '@/services/YouTubeService';
import { youTubeListService, SavedYouTubeItem } from '@/services/YouTubeListService';
import { downloadService } from '@/services/DownloadService';
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
  'Shorts',
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
  Shorts: {
    query: '#shorts',
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

interface ShortCardProps {
  item: YouTubeVideoItem;
  isLoading: boolean;
  onPress: (item: YouTubeVideoItem) => void;
  width?: number;
}

const ShortCard = memo<ShortCardProps>(({ item, isLoading, onPress, width: customWidth }) => {
  const cardWidth = customWidth || 148;
  const cardHeight = Math.round(cardWidth * (16 / 9));

  return (
    <TouchableOpacity
      style={[styles.shortCardContainer, { width: cardWidth, height: cardHeight }]}
      activeOpacity={0.88}
      onPress={() => onPress(item)}
      disabled={isLoading}
    >
      <Image source={{ uri: item.thumbnail }} style={styles.shortThumbnailImage} />

      {/* Smooth Bottom Gradient for text readability without any harsh box shadow */}
      <LinearGradient
        colors={['transparent', 'rgba(0, 0, 0, 0.35)', 'rgba(0, 0, 0, 0.88)']}
        locations={[0, 0.5, 1]}
        style={styles.shortGradientOverlay}
        pointerEvents="none"
      />

      {/* Top Shorts Logo Badge */}
      <View style={styles.shortBadgeContainer}>
        <View style={styles.shortBadgeIconBox}>
          <Ionicons name="play" size={9} color="#ffffff" />
        </View>
        <Text style={styles.shortBadgeText}>Shorts</Text>
      </View>

      {/* Bottom Title & Views */}
      <View style={styles.shortMetaContainer}>
        <Text style={styles.shortTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.views ? (
          <Text style={styles.shortViewsText} numberOfLines={1}>
            {item.views}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

interface ShortsShelfProps {
  shorts: YouTubeVideoItem[];
  isLoading: boolean;
  onPressShort: (item: YouTubeVideoItem) => void;
  onSeeAll?: () => void;
}

const ShortsShelf = memo<ShortsShelfProps>(({ shorts, isLoading, onPressShort, onSeeAll }) => {
  if (shorts.length === 0) return null;

  return (
    <View style={styles.shortsShelfContainer}>
      <View style={styles.shortsShelfHeader}>
        <View style={styles.shortsShelfTitleRow}>
          <View style={styles.shortsLogoIconBox}>
            <Ionicons name="play" size={13} color="#ffffff" />
          </View>
          <Text style={styles.shortsShelfTitle}>Shorts</Text>
        </View>
        {onSeeAll && (
          <TouchableOpacity
            onPress={onSeeAll}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Text style={styles.shortsSeeAllText}>View all</Text>
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={shorts}
        keyExtractor={(item) => `shelf_short_${item.id}`}
        contentContainerStyle={styles.shortsShelfContent}
        renderItem={({ item }) => (
          <ShortCard item={item} isLoading={isLoading} onPress={onPressShort} />
        )}
      />
    </View>
  );
});

interface VideoCardProps {
  item: YouTubeVideoItem;
  isLoading: boolean;
  isSaved: boolean;
  onPress: (item: YouTubeVideoItem) => void;
  onDownload: (item: YouTubeVideoItem) => void;
  onToggleSave: (item: YouTubeVideoItem) => void;
  onCopyLink: (item: YouTubeVideoItem) => void;
}

const VideoCard = memo<VideoCardProps>(({ item, isLoading, isSaved, onPress, onDownload, onToggleSave, onCopyLink }) => {
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
            {item.channel} {item.views ? `• ${item.views}` : ''} {item.published ? `• ${item.published}` : ''}
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

          <TouchableOpacity
            style={styles.cardDownloadButton}
            onPress={() => onDownload(item)}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-down-circle-outline" size={18} color="#ffffff" />
          </TouchableOpacity>
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

  // Downloads tracking for header badge
  const [downloadsCount, setDownloadsCount] = useState<number>(() => {
    try {
      return downloadService.getDownloads().filter((d) => d.id.startsWith('yt_') || d.sourceType === 'direct').length;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    try {
      const unsub = downloadService.addListener((items) => {
        setDownloadsCount(items.filter((d) => d.id.startsWith('yt_') || d.sourceType === 'direct').length);
      });
      return unsub;
    } catch {}
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

  // Shorts Shelf state
  const [shortsList, setShortsList] = useState<YouTubeVideoItem[]>([]);

  // Load Shorts on mount
  useEffect(() => {
    let mounted = true;
    youTubeService.getShortsFeed().then((res) => {
      if (mounted && res.videos?.length) {
        setShortsList(res.videos);
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Dynamic Category Chips reflecting Google Account feeds
  const dynamicCategoryChips = useMemo(() => {
    if (authStatus.authenticated) {
      return ['Home', 'Shorts', 'Subscriptions', 'History', ...CATEGORY_CHIPS.filter((c) => c !== 'All' && c !== 'Shorts')];
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
    } else {
      youTubeService.getShortsFeed().then((res) => {
        if (res.videos?.length) setShortsList(res.videos);
      }).catch(() => {});
    }

    try {
      let result: YouTubeSearchResult;

      if (target === 'Home') {
        result = await youTubeService.getHomeFeed();
      } else if (target === 'Shorts') {
        result = await youTubeService.getShortsFeed();
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
        result = await youTubeService.searchWithContinuation(resolvedQuery, sp);
      }

      if (activeQueryRef.current !== target) return;

      const allFetched = result.videos || [];
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

        const fetchedVideos = continuationResult.videos || [];
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

      await downloadService.startDirectDownload({
        id: downloadId,
        title: targetVideoItem.title,
        poster: targetVideoItem.thumbnail,
        fileName,
        streamUrl: format.url || format.proxyUrl || '',
        fileLength: format.contentLength,
      });

      Alert.alert(
        'Download Started',
        `Downloading "${cleanTitle}" (${isAudio ? 'MP3 Audio' : format.quality + ' MP4'}) to YouTube Downloads.`,
        [
          { text: 'View Downloads', onPress: () => router.push('/youtube/downloads' as any) },
          { text: 'OK', style: 'cancel' },
        ]
      );
    } catch (err: any) {
      Alert.alert('Download Failed', err?.message || 'Could not start download.');
    }
  };

  const renderVideoCard = useCallback(
    ({ item, index }: { item: YouTubeVideoItem; index: number }) => {
      const isShelfIndex = index === 1 && shortsList.length > 0 && selectedCategory !== 'Shorts' && !searchQuery.trim();
      return (
        <View key={item.id}>
          {isShelfIndex && (
            <ShortsShelf
              shorts={shortsList}
              isLoading={loadingVideoId !== null}
              onPressShort={handlePlayVideo}
              onSeeAll={() => {
                setSearchQuery('');
                setSelectedCategory('Shorts');
              }}
            />
          )}
          <VideoCard
            item={item}
            isLoading={loadingVideoId === item.id}
            isSaved={savedIds.has(item.id)}
            onPress={handlePlayVideo}
            onDownload={handleOpenDownloadModal}
            onToggleSave={handleToggleSave}
            onCopyLink={handleCopyLink}
          />
        </View>
      );
    },
    [loadingVideoId, savedIds, shortsList, selectedCategory, searchQuery, handlePlayVideo, handleOpenDownloadModal, handleToggleSave, handleCopyLink]
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

          {/* Top Header Icons in requested order: Search, My List, Download, User Profile Avatar */}
          <View style={styles.headerActionsRow}>
            {/* 1. Search Icon */}
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

            {/* 3. Download Icon */}
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={async () => {
                if (await isHapticsSupported()) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                router.push('/youtube/downloads' as any);
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            >
              <Ionicons
                name="arrow-down-circle-outline"
                size={21}
                color="#ffffff"
              />
              {downloadsCount > 0 && (
                <View style={[styles.headerBadge, { backgroundColor: theme.primary }]}>
                  <Text style={styles.headerBadgeText}>
                    {downloadsCount > 99 ? '99+' : downloadsCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* 4. Google / YouTube Account Profile Avatar Button */}
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
                {item === 'Shorts' && (
                  <Ionicons
                    name="play-circle"
                    size={14}
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
      ) : selectedCategory === 'Shorts' ? (
        <FlatList
          key="shorts_grid"
          ref={flatListRef}
          data={videos}
          keyExtractor={keyExtractor}
          numColumns={2}
          columnWrapperStyle={styles.shortsGridColumnWrapper}
          contentContainerStyle={styles.shortsGridContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          renderItem={({ item }) => (
            <ShortCard
              item={item}
              isLoading={loadingVideoId === item.id}
              onPress={handlePlayVideo}
              width={(width - 42) / 2}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#FF0000"
              colors={['#FF0000']}
            />
          }
        />
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
          } else {
            setSelectedCategory('All');
          }
        }}
        onSelectFeed={(feed) => setSelectedCategory(feed)}
      />
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

  // Shorts Shelf & Grid Styles (Real YouTube Look)
  shortsShelfContainer: {
    paddingVertical: 14,
    marginBottom: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  shortsShelfHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  shortsShelfTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shortsLogoIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#FF0000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortsShelfTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  shortsSeeAllText: {
    color: '#7b82ff',
    fontSize: 13,
    fontWeight: '600',
  },
  shortsShelfContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  shortCardContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1c1c20',
    position: 'relative',
  },
  shortThumbnailImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  shortGradientOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '46%',
  },
  shortBadgeContainer: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 4,
  },
  shortBadgeIconBox: {
    width: 14,
    height: 14,
    borderRadius: 4,
    backgroundColor: '#FF0000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  shortMetaContainer: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
  },
  shortTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginBottom: 4,
  },
  shortViewsText: {
    color: '#dddddd',
    fontSize: 11,
    fontWeight: '600',
  },
  shortsGridColumnWrapper: {
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 14,
  },
  shortsGridContent: {
    paddingTop: 12,
    paddingBottom: 110,
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
});