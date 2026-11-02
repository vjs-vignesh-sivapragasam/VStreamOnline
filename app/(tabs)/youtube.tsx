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
  extractYouTubeVideoId,
} from '@/services/YouTubeService';
import { youTubeListService, SavedYouTubeItem } from '@/services/YouTubeListService';
import { downloadService } from '@/services/DownloadService';
import { QualityPickerModal } from '@/components/youtube/QualityPickerModal';
import { useYouTubePlayer } from '@/contexts/YouTubePlayerContext';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { isHapticsSupported } from '@/utils/platform';

const { width } = Dimensions.get('window');

const CATEGORY_CHIPS = [
  'All',
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
  onPress: (item: YouTubeVideoItem) => void;
  onDownload: (item: YouTubeVideoItem) => void;
  onToggleSave: (item: YouTubeVideoItem) => void;
  onCopyLink: (item: YouTubeVideoItem) => void;
}

const VideoCard = memo<VideoCardProps>(({ item, isLoading, isSaved, onPress, onDownload, onToggleSave, onCopyLink }) => {
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
            style={[styles.cardBookmarkButton, isSaved && styles.cardBookmarkButtonActive]}
            onPress={() => onToggleSave(item)}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isSaved ? 'bookmark' : 'bookmark-outline'}
              size={18}
              color={isSaved ? '#535aff' : '#aaaaaa'}
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
      let resolvedQuery = target;
      let sp: string | undefined = undefined;

      const catConfig = CATEGORY_MAP[target];
      if (catConfig) {
        resolvedQuery = catConfig.query;
        if (isPullToRefresh && catConfig.refreshSp) {
          // Toggle sp on pull-to-refresh to fetch fresh daily videos
          refreshToggleRef.current = !refreshToggleRef.current;
          sp = refreshToggleRef.current ? catConfig.refreshSp : catConfig.sp;
        } else {
          sp = catConfig.sp;
        }
      }

      const result = await youTubeService.searchWithContinuation(resolvedQuery, sp);

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
    ({ item }: { item: YouTubeVideoItem }) => {
      return (
        <VideoCard
          item={item}
          isLoading={loadingVideoId === item.id}
          isSaved={savedIds.has(item.id)}
          onPress={handlePlayVideo}
          onDownload={handleOpenDownloadModal}
          onToggleSave={handleToggleSave}
          onCopyLink={handleCopyLink}
        />
      );
    },
    [loadingVideoId, savedIds, handlePlayVideo, handleOpenDownloadModal, handleToggleSave, handleCopyLink]
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

          {/* Top Header Icons: Search, My List, Download */}
          <View style={styles.headerActionsRow}>
            {/* Search Icon */}
            <TouchableOpacity
              style={[styles.headerActionBtn, isSearchOpen && styles.headerActionBtnActive]}
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

            {/* My List Icon */}
            <TouchableOpacity
              style={[styles.headerActionBtn, myListModalVisible && styles.headerActionBtnActive]}
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
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>
                    {savedList.length > 99 ? '99+' : savedList.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Download Icon */}
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
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>
                    {downloadsCount > 99 ? '99+' : downloadsCount}
                  </Text>
                </View>
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
                style={styles.pasteButton}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="clipboard-outline" size={15} color="#535aff" style={{ marginRight: 4 }} />
                <Text style={styles.pasteButtonText}>Paste</Text>
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
          data={CATEGORY_CHIPS}
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
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
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
                <Ionicons name="bookmark" size={20} color="#535aff" style={{ marginRight: 8 }} />
                <Text style={styles.myListTitle}>My List</Text>
                {savedList.length > 0 && (
                  <View style={styles.myListCountBadge}>
                    <Text style={styles.myListCountText}>{savedList.length}</Text>
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
    backgroundColor: 'rgba(83, 90, 255, 0.25)',
  },
  headerBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: '#535aff',
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
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
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
    backgroundColor: 'rgba(83, 90, 255, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pasteButtonText: {
    color: '#7b82ff',
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
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  chipButtonSelected: {
    backgroundColor: '#ffffff',
  },
  savedChipButton: {
    backgroundColor: 'rgba(83, 90, 255, 0.15)',
    borderColor: '#535aff',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipText: {
    color: '#aaaaaa',
    fontSize: 13,
    fontWeight: '600',
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
    backgroundColor: 'rgba(83, 90, 255, 0.25)',
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
    backgroundColor: 'rgba(83, 90, 255, 0.2)',
  },
  myListCountText: {
    color: '#535aff',
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