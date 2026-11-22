import { Text, ActivityIndicator, TextInput, View, StatusBar } from '@/components/Themed';
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ScrollView,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  useWindowDimensions,
  RefreshControl,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import BottomSpacing from '@/components/BottomSpacing';
import { SafeAreaView } from 'react-native-safe-area-context';
import BlurGradientBackground from '@/components/BlurGradientBackground';
import { useTheme } from '@/contexts/ThemeContext';
import {
  fetchTamilMVRecentlyAdded,
  searchTamilMV,
  getPaginationItems,
  GroupedItem,
  TorrentItem,
} from '@/hooks/useTamilMv';
import { tmdbService } from '@/services/TmdbService';
import { addonService, AddonCatalogOption } from '@/services/AddonService';
import { storageService } from '@/utils/StorageService';
import { useLocalSearchParams, router } from 'expo-router';
import { SvgXml } from 'react-native-svg';
import { DefaultPosterImgXml } from '@/utils/Svg';

// ─── Utility: Clean Movie Title ───────────────────────────────────────────────

export type MovieCategoryKey =
  | 'all'
  | 'kollywood'
  | 'hollywood'
  | 'series'
  | 'tollywood'
  | 'bollywood'
  | 'mollywood';

export const CATEGORY_CONFIG: {
  key: MovieCategoryKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'all', label: 'All', icon: 'apps-outline' },
  { key: 'kollywood', label: 'Kollywood', icon: 'film-outline' },
  { key: 'hollywood', label: 'Hollywood', icon: 'videocam-outline' },
  { key: 'series', label: 'Web Series', icon: 'tv-outline' },
  { key: 'tollywood', label: 'Tollywood', icon: 'film-outline' },
  { key: 'bollywood', label: 'Bollywood', icon: 'film-outline' },
  { key: 'mollywood', label: 'Mollywood', icon: 'film-outline' },
];

// Caches for maximum performance & zero re-computation
const categoryCache = new WeakMap<GroupedItem, MovieCategoryKey>();
const titleCache = new Map<string, string>();
const globalPosterCache = new Map<string, string | null>();

// Concurrency-limited poster loader (max 3 concurrent)
class PosterQueue {
  private queue: (() => Promise<void>)[] = [];
  private activeCount = 0;
  private maxConcurrent = 3;

  enqueue(fn: () => Promise<void>) {
    this.queue.push(fn);
    this.processNext();
  }

  private processNext() {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) return;
    const task = this.queue.shift();
    if (!task) return;
    this.activeCount++;
    task().finally(() => {
      this.activeCount--;
      this.processNext();
    });
  }
}

const posterQueue = new PosterQueue();

export function getGroupCategory(group: GroupedItem): MovieCategoryKey {
  const cached = categoryCache.get(group);
  if (cached) return cached;

  let result: MovieCategoryKey = 'kollywood';

  const isSeries =
    (group as any).type === 'series' ||
    group.items.some((i) => {
      const t = (i.title || '').toLowerCase();
      const url = (i.guid || i.groupid || '').toLowerCase();
      return (
        /series|season|episode|s\d{2}|e\d{2}|ep\s*\(/i.test(t) ||
        url.includes('/19-web-series') ||
        url.includes('series')
      );
    });

  if (isSeries) {
    result = 'series';
  } else {
    const best = group.items.find((i) => i.poster) ?? group.items[0];
    const lang = (best?.language || '').toLowerCase();
    const allTitles = group.items.map((i) => (i.title || '').toLowerCase()).join(' ');
    const allUrls = group.items.map((i) => (i.guid || i.groupid || '').toLowerCase()).join(' ');

    // 1. Hollywood (English, forum 17 multi-audio Hollywood, or Hollywood in title/url)
    if (
      lang === 'english' ||
      allTitles.includes('hollywood') ||
      allUrls.includes('17-hollywood') ||
      allUrls.includes('/forums/forum/46-') ||
      allUrls.includes('/forums/forum/49-') ||
      allUrls.includes('/forums/forum/50-')
    ) {
      result = 'hollywood';
    } else if (lang === 'telugu' || allTitles.includes('telugu') || allUrls.includes('telugu')) {
      result = 'tollywood';
    } else if (lang === 'hindi' || allTitles.includes('hindi') || allUrls.includes('hindi')) {
      result = 'bollywood';
    } else if (lang === 'malayalam' || allTitles.includes('malayalam') || allUrls.includes('malayalam')) {
      result = 'mollywood';
    } else {
      result = 'kollywood';
    }
  }

  categoryCache.set(group, result);
  return result;
}

const cleanMovieTitle = (title: string): string => {
  if (!title) return '';
  const cached = titleCache.get(title);
  if (cached !== undefined) return cached;

  const cleaned = title
    .replace(/^(?:https?:\/\/)?(?:www\.)?[\w\.-]+\.(?:com|org|net|cz|win|pm|re|to|yt|wf|ws|me|solar|mx|cards|pizza|fi|live)\s*[-_:]\s*/gi, '')
    .replace(/^(?:https?:\/\/)?(?:www\.)?(?:1tamilmv|tamilmv)[\w\.-]*\s*[-_:]\s*/gi, '')
    .replace(/^\[?\b(?:1tamilmv|tamilmv)\b\]?\s*[-_:]?\s*/gi, '')
    .replace(/\b(?:1tamilmv|tamilmv)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  titleCache.set(title, cleaned);
  return cleaned;
};

// ─── Search Movie Card Component ─────────────────────────────────────────────

const SearchMovieCard = React.memo(({
  group,
  cardWidth,
  posterHeight,
  onPress,
}: {
  group: GroupedItem;
  cardWidth: number;
  posterHeight: number;
  onPress: (group: GroupedItem) => void;
}) => {
  const [imgError, setImgError] = useState(false);
  const best: TorrentItem = group.items.find((i) => i.poster) ?? group.items[0];
  const type = (group as any).type || 'movie';
  const releasesCount = group.items.length;

  const titleKey = useMemo(() => {
    return `${(group.name || best?.title || '').toLowerCase().trim()}_${group.year || ''}_${type}`;
  }, [group.name, group.year, best?.title, type]);

  const [posterUri, setPosterUri] = useState<string | null>(() => {
    if (best?.poster) return best.poster;
    return globalPosterCache.get(titleKey) || null;
  });

  const cleanedTitle = useMemo(() => {
    return cleanMovieTitle(group.name ?? best?.title ?? '');
  }, [group.name, best?.title]);

  useEffect(() => {
    if (best?.poster) {
      setPosterUri(best.poster);
      globalPosterCache.set(titleKey, best.poster);
      return;
    }

    if (globalPosterCache.has(titleKey)) {
      const cached = globalPosterCache.get(titleKey);
      if (cached) setPosterUri(cached);
      return;
    }

    let isMounted = true;
    posterQueue.enqueue(async () => {
      if (!isMounted) return;
      try {
        const poster = await tmdbService.getMoviePoster(
          group.name || best?.title || '',
          group.year || undefined,
          type
        );
        if (poster) {
          globalPosterCache.set(titleKey, poster);
          if (isMounted) {
            setPosterUri(poster);
          }
        } else {
          globalPosterCache.set(titleKey, null);
        }
      } catch {}
    });

    return () => {
      isMounted = false;
    };
  }, [best?.poster, group.name, group.year, type, titleKey]);

  const handlePress = useCallback(() => {
    onPress(group);
  }, [onPress, group]);

  return (
    <Pressable
      style={[styles.cardContainer, { width: cardWidth }]}
      onPress={handlePress}
    >
      <View style={[styles.posterWrap, { width: cardWidth, height: posterHeight }]}>
        {posterUri && !imgError ? (
          <Image
            source={{ uri: posterUri }}
            onError={() => setImgError(true)}
            style={styles.posterImage}
            resizeMode="cover"
            fadeDuration={150}
          />
        ) : (
          <View style={[styles.posterImage, styles.posterFallback]}>
            <SvgXml xml={DefaultPosterImgXml} width={cardWidth * 0.5} height={posterHeight * 0.4} />
          </View>
        )}
      </View>

      <Text style={[styles.cardTitle, { width: cardWidth }]} numberOfLines={2}>
        {cleanedTitle}
      </Text>

      <View style={styles.cardFooter}>
        <Text style={styles.cardSub}>
          {type === 'series' ? 'Series' : 'Movie'}{group.year ? ` • ${group.year}` : ''} • {releasesCount} {releasesCount === 1 ? 'source' : 'sources'}
        </Text>
      </View>
    </Pressable>
  );
});

// ─── Pagination Controls ───────────────────────────────────────────────────────

const PaginationControls = ({
  currentPage,
  totalPages,
  onPageChange,
  onOpenJumpModal,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onOpenJumpModal: () => void;
}) => {
  const { theme } = useTheme();
  const pages = useMemo(
    () => getPaginationItems(currentPage, totalPages),
    [currentPage, totalPages]
  );

  const handlePrev = async () => {
    if (currentPage > 1) {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = async () => {
    if (currentPage < totalPages) {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onPageChange(currentPage + 1);
    }
  };

  const handlePageSelect = async (page: number) => {
    if (page !== currentPage) {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onPageChange(page);
    }
  };

  return (
    <View style={styles.paginationContainer}>
      {/* Top summary row: Page X of Y with quick jump button */}
      <View style={styles.paginationSummaryRow}>
        <Text style={styles.paginationSummaryText}>
          Page <Text style={[styles.paginationSummaryHighlight, { color: theme.primary }]}>{currentPage}</Text> of{' '}
          <Text style={[styles.paginationSummaryHighlight, { color: theme.primary }]}>{totalPages}</Text>
        </Text>
        {totalPages > 1 && (
          <TouchableOpacity
            style={styles.jumpButton}
            onPress={onOpenJumpModal}
            activeOpacity={0.7}
          >
            <Ionicons name="search-outline" size={13} color={theme.primary} style={{ marginRight: 4 }} />
            <Text style={styles.jumpButtonText}>Jump to Page</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Pagination button bar: Previous | 1 | 2 | 3 | … | N | Next */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.paginationBar}
      >
        <TouchableOpacity
          style={[styles.navBtn, currentPage <= 1 && styles.navBtnDisabled]}
          onPress={handlePrev}
          disabled={currentPage <= 1}
          activeOpacity={0.7}
        >
          <Ionicons
            name="chevron-back"
            size={16}
            color={currentPage <= 1 ? '#444' : '#ffffff'}
          />
          <Text style={[styles.navBtnText, currentPage <= 1 && styles.navBtnTextDisabled]}>
            Previous
          </Text>
        </TouchableOpacity>

        {pages.map((item: number | '...', index: number) => {
          if (item === '...') {
            return (
              <TouchableOpacity
                key={`ellipsis-${index}`}
                style={styles.ellipsisBtn}
                onPress={onOpenJumpModal}
                activeOpacity={0.7}
              >
                <Text style={styles.ellipsisText}>…</Text>
              </TouchableOpacity>
            );
          }

          const isActive = item === currentPage;
          return (
            <TouchableOpacity
              key={`page-${item}`}
              style={[
                styles.pageBtn,
                isActive && { backgroundColor: theme.primary, borderColor: theme.primary },
              ]}
              onPress={() => handlePageSelect(item)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pageBtnText, isActive && styles.pageBtnTextActive]}>
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={[styles.navBtn, currentPage >= totalPages && styles.navBtnDisabled]}
          onPress={handleNext}
          disabled={currentPage >= totalPages}
          activeOpacity={0.7}
        >
          <Text style={[styles.navBtnText, currentPage >= totalPages && styles.navBtnTextDisabled]}>
            Next
          </Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={currentPage >= totalPages ? '#444' : '#ffffff'}
          />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

// ─── Jump To Page Modal ────────────────────────────────────────────────────────

const JumpModal = ({
  visible,
  onClose,
  totalPages,
  onJump,
}: {
  visible: boolean;
  onClose: () => void;
  totalPages: number;
  onJump: (page: number) => void;
}) => {
  const { theme } = useTheme();
  const [pageInput, setPageInput] = useState('');

  const handleConfirm = () => {
    const p = parseInt(pageInput.trim(), 10);
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      onJump(p);
      setPageInput('');
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Jump to Page</Text>
          <Text style={styles.modalSubtitle}>
            Enter page number (1 – {totalPages})
          </Text>

          <TextInput
            style={styles.modalInput}
            value={pageInput}
            onChangeText={setPageInput}
            placeholder={`1 - ${totalPages}`}
            placeholderTextColor="#666"
            keyboardType="number-pad"
            autoFocus
            onSubmitEditing={handleConfirm}
          />

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalGoBtn, { backgroundColor: theme.primary }]}
              onPress={handleConfirm}
            >
              <Text style={styles.modalGoText}>Go</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

// ─── Search Screen ────────────────────────────────────────────────────────────

const SearchScreen = () => {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ query?: string }>();
  const [query, setQuery]                         = useState(params.query || '');
  const ITEMS_PER_PAGE                            = 24;
  const [searchPage, setSearchPage]               = useState(1);
  const [recentPage, setRecentPage]               = useState(1);
  const [jumpModalVisible, setJumpModalVisible]   = useState(false);
  const [jumpTarget, setJumpTarget]               = useState<'search' | 'recent'>('search');
  const searchScrollRef                           = useRef<ScrollView>(null);
  const recentScrollRef                           = useRef<ScrollView>(null);
  const [showRecentlyAdded, setShowRecentlyAdded] = useState(false);
  const [recentlyAddedMovies, setRecentlyAddedMovies] = useState<GroupedItem[]>(() => {
    try {
      const raw = storageService.getItem('tamilmv:recently_added');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        if (parsed?.data && Array.isArray(parsed.data)) return parsed.data;
      }
    } catch {}
    return [];
  });
  const [isLoadingRecent, setIsLoadingRecent]     = useState(false);
  const [selectedCategory, setSelectedCategory]   = useState<MovieCategoryKey>('all');

  const [liveSearchResults, setLiveSearchResults] = useState<GroupedItem[]>([]);
  const [isSearchingLive, setIsSearchingLive]     = useState(false);

  // ── Addon State ──
  const [showAddons, setShowAddons]                 = useState(false);
  const [addonMovies, setAddonMovies]               = useState<GroupedItem[]>([]);
  const [isLoadingAddons, setIsLoadingAddons]       = useState(false);
  const [availableCatalogs, setAvailableCatalogs]   = useState<AddonCatalogOption[]>([]);
  const [selectedCatalogIdx, setSelectedCatalogIdx] = useState(0);
  const [addonPage, setAddonPage]                   = useState(1);

  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { width } = useWindowDimensions();
  const numColumns = width < 580 ? 3 : width < 1024 ? 5 : 7;
  const cardSpacing = 12;
  const totalHorizontalPadding = 32;
  const cardWidth = (width - totalHorizontalPadding - (numColumns - 1) * cardSpacing) / numColumns;
  const posterHeight = cardWidth * 1.5;

  const handleRecentlyAddedPress = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowRecentlyAdded(true);
    setShowAddons(false);
    setSelectedCategory('all');
    if (recentlyAddedMovies.length === 0) {
      setIsLoadingRecent(true);
      try {
        const items = await fetchTamilMVRecentlyAdded(false);
        setRecentlyAddedMovies(items || []);
      } catch (e) {
        console.warn('[Search] Failed to fetch recently added:', e);
      } finally {
        setIsLoadingRecent(false);
      }
    }
  }, [recentlyAddedMovies.length]);

  const handleClearRecentlyAdded = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowRecentlyAdded(false);
    setSelectedCategory('all');
  }, []);

  const loadAddonCatalog = useCallback(async (catalogIdx = 0, page = 1) => {
    setIsLoadingAddons(true);
    try {
      let catalogs = addonService.getAvailableCatalogs();
      if (catalogs.length === 0) {
        await addonService.installAddon('https://v3-cinemeta.strem.io/manifest.json', true);
        await addonService.installAddon('https://torrentio.strem.fun/manifest.json', true);
        catalogs = addonService.getAvailableCatalogs();
      }
      setAvailableCatalogs(catalogs);
      if (catalogs.length > 0) {
        const safeIdx = Math.min(catalogIdx, catalogs.length - 1);
        const targetCat = catalogs[safeIdx];
        const enabled = addonService.getEnabledAddons();
        const addon = enabled.find((a) => a.transportUrl === targetCat.transportUrl);
        if (addon) {
          const skip = (page - 1) * 50;
          const metas = await addonService.fetchCatalogMetas(
            addon,
            targetCat.type,
            targetCat.catalogId,
            skip
          );
          const grouped = metas.map((m) => addonService.metaToGroupedItem(m, targetCat.addonName));
          setAddonMovies(grouped);
        }
      } else {
        setAddonMovies([]);
      }
    } catch (e) {
      console.warn('[Search] Failed to load addon catalog:', e);
    } finally {
      setIsLoadingAddons(false);
    }
  }, []);

  const handleAddonsPress = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowAddons(true);
    setShowRecentlyAdded(false);
    setSelectedCategory('all');
    setAddonPage(1);
    loadAddonCatalog(selectedCatalogIdx, 1);
  }, [loadAddonCatalog, selectedCatalogIdx]);

  const handleClearAddons = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowAddons(false);
  }, []);

  const handleCatalogSelect = useCallback(
    (idx: number) => {
      setSelectedCatalogIdx(idx);
      setAddonPage(1);
      loadAddonCatalog(idx, 1);
    },
    [loadAddonCatalog]
  );

  const handleAddonPageChange = useCallback(
    (newPage: number) => {
      setAddonPage(newPage);
      loadAddonCatalog(selectedCatalogIdx, newPage);
    },
    [loadAddonCatalog, selectedCatalogIdx]
  );

  const handleRefreshRecent = useCallback(async () => {
    setIsLoadingRecent(true);
    try {
      const items = await fetchTamilMVRecentlyAdded(true);
      setRecentlyAddedMovies(items || []);
    } catch (e) {
      console.warn('[Search] Failed to refresh recently added:', e);
    } finally {
      setIsLoadingRecent(false);
    }
  }, []);

  const handleCategorySelect = useCallback(async (key: MovieCategoryKey) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedCategory(key);
    setSearchPage(1);
    setRecentPage(1);
  }, []);

  // If a query parameter was passed on mount, handle it
  useEffect(() => {
    if (params.query && params.query !== query) {
      setQuery(params.query);
    }
  }, [params.query]);

  // Live web search when user types query
  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2) {
      setLiveSearchResults([]);
      setIsSearchingLive(false);
      return;
    }

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = setTimeout(async () => {
      setIsSearchingLive(true);
      try {
        const [liveItems, addonItems] = await Promise.all([
          searchTamilMV(q, 'all').catch(() => []),
          addonService.searchAllCatalogs(q).catch(() => []),
        ]);
        setLiveSearchResults([...liveItems, ...addonItems]);

      } catch {
        // Fallback
      } finally {
        setIsSearchingLive(false);
      }
    }, 600);

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [query]);

  const handleClearQuery = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setQuery('');
    setLiveSearchResults([]);
    setSelectedCategory('all');
  }, []);

  const handleOpenWebView = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push('/browser' as any);
  }, []);

  const handleCardPress = useCallback(async (group: GroupedItem) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const best = group.items.find((i) => i.poster) ?? group.items[0];
    const type = (group as any).type || 'movie';

    router.push({
      pathname: '/torrent/details',
      params: {
        guid: best.guid,
        groupid: best.groupid,
        title: cleanMovieTitle(group.name ?? best.title),
        magnetUrl: best.magnetUrl,
        infoHash: best.infoHash,
        poster: best.poster ?? '',
        year: group.year || (best.publishDate ? new Date(best.publishDate).getFullYear().toString() : ''),
        type,
        publishDate: best.publishDate,
        allItems: JSON.stringify(group.items),
        topicUrl: best.groupid,
        imdbId: (group as any).imdbId || (best.guid?.startsWith('tt') ? best.guid : undefined),
      },
    });
  }, []);

  // Filter movies by query: combine local recently added and live search results (deduplicated)
  const filteredMovies = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const normQ = q.replace(/[._-]+/g, ' ').trim();
    const qWords = normQ.split(/\s+/).filter(Boolean);

    const matchesQuery = (g: GroupedItem) => {
      // Exclude audio / song releases that may have slipped into cache or live results
      const allTitles = (g.name || '') + ' ' + g.items.map((i) => i.title || '').join(' ');
      if (
        /\b(video\s*songs?|mp3\s*songs?|soundtracks?|alac|flac\s*musical|audio\s*track)\b/i.test(allTitles) ||
        /\b(original motion picture soundtrack|anirudh ravichander musical|ar rahman musical)\b/i.test(allTitles)
      ) {
        return false;
      }

      const normName = (g.name || '').toLowerCase().replace(/[._-]+/g, ' ');
      const rawName = (g.name || '').toLowerCase();

      // Check full phrase match
      if (normName.includes(normQ) || rawName.includes(q)) return true;

      // Check all words match in name
      if (qWords.length > 1 && qWords.every((w) => normName.includes(w))) return true;

      // Check year match if user typed a year
      if (g.year && qWords.includes(g.year.toString())) return true;

      // Check items title match
      return g.items.some((i) => {
        const normTitle = (i.title || '').toLowerCase().replace(/[._-]+/g, ' ');
        if (normTitle.includes(normQ) || (i.title || '').toLowerCase().includes(q)) return true;
        if (qWords.length > 1 && qWords.every((w) => normTitle.includes(w))) return true;
        return false;
      });
    };

    const movieMap = new Map<string, GroupedItem>();

    // 1. Populate from recentlyAddedMovies first (instant match for movies in recently added!)
    for (const g of recentlyAddedMovies) {
      if (matchesQuery(g)) {
        const key = `${(g.name || '').toLowerCase().trim()}|||${g.year || ''}`;
        movieMap.set(key, g);
      }
    }

    // 2. Merge matching movies from liveSearchResults
    for (const g of liveSearchResults) {
      if (matchesQuery(g)) {
        const key = `${(g.name || '').toLowerCase().trim()}|||${g.year || ''}`;
        const existing = movieMap.get(key);
        if (!existing) {
          movieMap.set(key, g);
        } else {
          const existingGuids = new Set(existing.items.map((it) => it.guid || it.groupid));
          const newItems = g.items.filter((it) => !existingGuids.has(it.guid || it.groupid));
          if (newItems.length > 0) {
            existing.items = [...existing.items, ...newItems];
          }
          if (!existing.items[0]?.poster && g.items.find((it) => it.poster)) {
            const p = g.items.find((it) => it.poster)?.poster;
            if (p && existing.items[0]) existing.items[0].poster = p;
          }
        }
      }
    }

    return Array.from(movieMap.values());
  }, [query, recentlyAddedMovies, liveSearchResults]);

  // Category statistics & grouped sections for Recently Added (single-pass O(N))
  const { recentCategoryCounts, recentGroupedByCategory } = useMemo(() => {
    const counts: Record<MovieCategoryKey, number> = {
      all: recentlyAddedMovies.length,
      kollywood: 0,
      hollywood: 0,
      series: 0,
      tollywood: 0,
      bollywood: 0,
      mollywood: 0,
    };
    const map = new Map<MovieCategoryKey, GroupedItem[]>();

    for (const g of recentlyAddedMovies) {
      const cat = getGroupCategory(g);
      counts[cat] = (counts[cat] || 0) + 1;
      let list = map.get(cat);
      if (!list) {
        list = [];
        map.set(cat, list);
      }
      list.push(g);
    }

    const sections: { key: MovieCategoryKey; label: string; items: GroupedItem[] }[] = [];
    for (const cfg of CATEGORY_CONFIG) {
      if (cfg.key === 'all') continue;
      const items = map.get(cfg.key);
      if (items && items.length > 0) {
        sections.push({
          key: cfg.key,
          label: cfg.label,
          items,
        });
      }
    }

    return { recentCategoryCounts: counts, recentGroupedByCategory: sections };
  }, [recentlyAddedMovies]);

  const displayedRecentMovies = useMemo(() => {
    if (selectedCategory === 'all') return recentlyAddedMovies;
    return recentlyAddedMovies.filter((g) => getGroupCategory(g) === selectedCategory);
  }, [recentlyAddedMovies, selectedCategory]);

  const recentCategoryFilterOptions = useMemo(() => {
    return CATEGORY_CONFIG.filter((cfg) => {
      if (cfg.key === 'all') return true;
      return (recentCategoryCounts[cfg.key] || 0) > 0;
    }).map((cfg) => ({
      ...cfg,
      count: recentCategoryCounts[cfg.key] || 0,
    }));
  }, [recentCategoryCounts]);

  // Category statistics & grouped sections for Search Results (single-pass O(N))
  const { searchCategoryCounts, searchGroupedByCategory } = useMemo(() => {
    const counts: Record<MovieCategoryKey, number> = {
      all: filteredMovies.length,
      kollywood: 0,
      hollywood: 0,
      series: 0,
      tollywood: 0,
      bollywood: 0,
      mollywood: 0,
    };
    const map = new Map<MovieCategoryKey, GroupedItem[]>();

    for (const g of filteredMovies) {
      const cat = getGroupCategory(g);
      counts[cat] = (counts[cat] || 0) + 1;
      let list = map.get(cat);
      if (!list) {
        list = [];
        map.set(cat, list);
      }
      list.push(g);
    }

    const sections: { key: MovieCategoryKey; label: string; items: GroupedItem[] }[] = [];
    for (const cfg of CATEGORY_CONFIG) {
      if (cfg.key === 'all') continue;
      const items = map.get(cfg.key);
      if (items && items.length > 0) {
        sections.push({
          key: cfg.key,
          label: cfg.label,
          items,
        });
      }
    }

    return { searchCategoryCounts: counts, searchGroupedByCategory: sections };
  }, [filteredMovies]);

  const displayedSearchMovies = useMemo(() => {
    if (selectedCategory === 'all') return filteredMovies;
    return filteredMovies.filter((g) => getGroupCategory(g) === selectedCategory);
  }, [filteredMovies, selectedCategory]);

  const searchTotalPages = Math.ceil(displayedSearchMovies.length / ITEMS_PER_PAGE);
  const paginatedSearchMovies = useMemo(() => {
    if (searchTotalPages <= 1) return displayedSearchMovies;
    const start = (searchPage - 1) * ITEMS_PER_PAGE;
    return displayedSearchMovies.slice(start, start + ITEMS_PER_PAGE);
  }, [displayedSearchMovies, searchPage, searchTotalPages]);

  const recentTotalPages = Math.ceil(displayedRecentMovies.length / ITEMS_PER_PAGE);
  const paginatedRecentMovies = useMemo(() => {
    if (recentTotalPages <= 1) return displayedRecentMovies;
    const start = (recentPage - 1) * ITEMS_PER_PAGE;
    return displayedRecentMovies.slice(start, start + ITEMS_PER_PAGE);
  }, [displayedRecentMovies, recentPage, recentTotalPages]);

  const searchCategoryFilterOptions = useMemo(() => {
    return CATEGORY_CONFIG.filter((cfg) => {
      if (cfg.key === 'all') return true;
      return (searchCategoryCounts[cfg.key] || 0) > 0;
    }).map((cfg) => ({
      ...cfg,
      count: searchCategoryCounts[cfg.key] || 0,
    }));
  }, [searchCategoryCounts]);

  const renderCategoryFilterChips = (
    options: { key: MovieCategoryKey; label: string; icon: keyof typeof Ionicons.glyphMap; count: number }[]
  ) => {
    if (options.length <= 1) return null;
    return (
      <View style={styles.filtersContainer}>
        <FlatList
          data={options}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => {
            const isSelected = selectedCategory === item.key;
            return (
              <TouchableOpacity
                style={[
                  styles.filterButton,
                  isSelected && styles.filterButtonActive,
                ]}
                onPress={() => handleCategorySelect(item.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={item.icon as any}
                  size={18}
                  color={isSelected ? '#000000' : '#8E8E93'}
                  style={styles.filterIcon}
                />
                <Text
                  style={[
                    styles.filterButtonText,
                    isSelected && styles.filterButtonTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar />
      <BlurGradientBackground />

      {/* Header */}
      <View style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Search</Text>
        </View>
      </View>

      {/* Search Input Section */}
      <View style={styles.searchSection}>
        <View style={styles.searchInputContainer}>
          <View style={styles.searchIconContainer}>
            <Ionicons name="search-outline" size={20} color="#6E6E73" />
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search movie title..."
            placeholderTextColor="#6E6E73"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            submitBehavior="blurAndSubmit"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {isSearchingLive && (
            <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 6 }} />
          )}
          {query.length > 0 && (
            <Pressable onPress={handleClearQuery} style={styles.clearButton} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color="#ff453a" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Main Content Area */}
      {query.trim().length > 0 ? (
        /* 1. Active Search Results View */
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.contentContainer}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {isSearchingLive && filteredMovies.length === 0 ? (
            <View style={styles.searchingLoadingContainer}>
              <View style={[styles.loadingPulseCircle, { backgroundColor: theme.iconBg, borderColor: theme.indicator || theme.cardBorder }]}>
                <ActivityIndicator size="large" color={theme.primary} />
              </View>
              <Text style={styles.catalogLoadingTitle}>Searching for "{query}"</Text>
              <Text style={styles.catalogLoadingText}>Finding best movie matches across all categories…</Text>
            </View>
          ) : filteredMovies.length > 0 ? (
            <View style={styles.resultsGridSection}>
              <View style={styles.resultsHeaderRow}>
                <Text style={styles.resultsCountText}>
                  {selectedCategory === 'all'
                    ? `${filteredMovies.length} ${filteredMovies.length === 1 ? 'Movie' : 'Movies'} found`
                    : `${searchCategoryFilterOptions.find((o) => o.key === selectedCategory)?.label || 'Filtered'} (${displayedSearchMovies.length} ${displayedSearchMovies.length === 1 ? 'Match' : 'Matches'})`}
                </Text>
                <TouchableOpacity
                  style={styles.clearIconButton}
                  onPress={handleClearQuery}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle-outline" size={15} color="#ff453a" />
                  <Text style={styles.clearIconText}>Clear</Text>
                </TouchableOpacity>
              </View>

              {/* Category Filter Chips Bar matching index.tsx */}
              {renderCategoryFilterChips(searchCategoryFilterOptions)}

              {selectedCategory === 'all' ? (
                /* Grouped by Category Sections (like index.tsx) */
                searchGroupedByCategory.map((sec) => (
                  <View key={`search-sec-${sec.key}`} style={styles.categorySection}>
                    <View style={styles.categorySectionHeader}>
                      <Text style={styles.categorySectionTitle}>
                        {sec.label}
                      </Text>
                      <TouchableOpacity
                        style={styles.seeAllButton}
                        onPress={() => handleCategorySelect(sec.key)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.seeAllText}>See all ({sec.items.length})</Text>
                        <Ionicons name="chevron-forward" size={15} color="#8E8E93" style={styles.chevronIcon} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.gridWrap}>
                      {sec.items.map((group) => (
                        <SearchMovieCard
                          key={`movie-${sec.key}-${group.name}-${group.year || ''}`}
                          group={group}
                          cardWidth={cardWidth}
                          posterHeight={posterHeight}
                          onPress={handleCardPress}
                        />
                      ))}
                    </View>
                  </View>
                ))
              ) : (
                /* Single Filtered Category Grid */
                displayedSearchMovies.length > 0 ? (
                  <View>
                    <View style={styles.gridWrap}>
                      {paginatedSearchMovies.map((group) => (
                        <SearchMovieCard
                          key={`movie-${group.name}-${group.year || ''}`}
                          group={group}
                          cardWidth={cardWidth}
                          posterHeight={posterHeight}
                          onPress={handleCardPress}
                        />
                      ))}
                    </View>
                    {searchTotalPages > 1 && (
                      <PaginationControls
                        currentPage={searchPage}
                        totalPages={searchTotalPages}
                        onPageChange={(p) => {
                          setSearchPage(p);
                          searchScrollRef.current?.scrollTo({ y: 0, animated: true });
                        }}
                        onOpenJumpModal={() => {
                          setJumpTarget('search');
                          setJumpModalVisible(true);
                        }}
                      />
                    )}
                  </View>
                ) : (
                  <View style={styles.emptyCategoryWrap}>
                    <Ionicons name="film-outline" size={36} color="#6E6E73" />
                    <Text style={styles.emptyCategoryText}>
                      No {searchCategoryFilterOptions.find((o) => o.key === selectedCategory)?.label || selectedCategory} matches found.
                    </Text>
                    <TouchableOpacity
                      style={[styles.retryButton, { marginTop: 12 }]}
                      onPress={() => setSelectedCategory('all')}
                    >
                      <Text style={styles.retryButtonText}>Show All Matches</Text>
                    </TouchableOpacity>
                  </View>
                )
              )}
            </View>
          ) : null}

          {/* No Search Matches Found */}
          {!isSearchingLive && filteredMovies.length === 0 && (
            <View style={styles.emptyStateContainer}>
              <View style={[styles.emptyStateIconContainer, { backgroundColor: theme.iconBg }]}>
                <Ionicons name="search-outline" color={theme.primary} size={48} />
              </View>
              <Text style={styles.emptyStateTitle}>No movies found</Text>
              <Text style={styles.emptyStateSubtitle}>
                No movies match "{query}". Try another title, clear the search, or use Web view.
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={styles.retryButton} onPress={handleClearQuery}>
                  <Text style={styles.retryButtonText}>Clear Search</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.retryButton, { backgroundColor: theme.primary, borderColor: theme.primary }]}
                  onPress={handleOpenWebView}
                >
                  <Text style={styles.retryButtonText}>Open Web view</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <BottomSpacing space={60} />
        </ScrollView>
      ) : showRecentlyAdded ? (
        /* 2. Recently Added Raw View (All recently added movies loaded raw) */
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.contentContainer}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isLoadingRecent}
              onRefresh={handleRefreshRecent}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
        >
          {isLoadingRecent && recentlyAddedMovies.length === 0 ? (
            <View style={styles.catalogLoadingContainer}>
              <View style={[styles.loadingPulseCircle, { backgroundColor: theme.iconBg, borderColor: theme.indicator || theme.cardBorder }]}>
                <ActivityIndicator color={theme.primary} size="large" />
              </View>
              <Text style={styles.catalogLoadingTitle}>Loading Recently Added</Text>
              <Text style={styles.catalogLoadingText}>
                Fetching latest releases across Kollywood, Hollywood & Web Series…
              </Text>

              {/* Skeleton Cards Preview Grid */}
              <View style={styles.loadingSkeletonGrid}>
                {Array.from({ length: numColumns * 2 }).map((_, k) => (
                  <View
                    key={`skeleton-${k}`}
                    style={[
                      styles.skeletonCard,
                      { width: cardWidth, height: posterHeight },
                    ]}
                  >
                    <View style={styles.skeletonInner} />
                  </View>
                ))}
              </View>
            </View>
          ) : recentlyAddedMovies.length > 0 ? (
            <View style={styles.resultsGridSection}>
              <View style={styles.resultsHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="time-outline" size={16} color={theme.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.resultsCountText}>
                    {selectedCategory === 'all'
                      ? `Recently Added (${recentlyAddedMovies.length} ${recentlyAddedMovies.length === 1 ? 'Movie' : 'Movies'})`
                      : `${recentCategoryFilterOptions.find((o) => o.key === selectedCategory)?.label || 'Filtered'} (${displayedRecentMovies.length} ${displayedRecentMovies.length === 1 ? 'Title' : 'Titles'})`}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.clearIconButton}
                  onPress={handleClearRecentlyAdded}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle-outline" size={15} color="#ff453a" />
                  <Text style={styles.clearIconText}>Clear</Text>
                </TouchableOpacity>
              </View>

              {/* Category Filter Chips Bar matching index.tsx */}
              {renderCategoryFilterChips(recentCategoryFilterOptions)}

              {selectedCategory === 'all' ? (
                /* Grouped by Category Sections (like index.tsx) */
                recentGroupedByCategory.map((sec) => (
                  <View key={`recent-sec-${sec.key}`} style={styles.categorySection}>
                    <View style={styles.categorySectionHeader}>
                      <Text style={styles.categorySectionTitle}>
                        {sec.label}
                      </Text>
                      <TouchableOpacity
                        style={styles.seeAllButton}
                        onPress={() => handleCategorySelect(sec.key)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.seeAllText}>See all ({sec.items.length})</Text>
                        <Ionicons name="chevron-forward" size={15} color="#8E8E93" style={styles.chevronIcon} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.gridWrap}>
                      {sec.items.map((group, index) => (
                        <SearchMovieCard
                          key={`recent-${sec.key}-${group.name}-${group.year || ''}-${index}`}
                          group={group}
                          cardWidth={cardWidth}
                          posterHeight={posterHeight}
                          onPress={handleCardPress}
                        />
                      ))}
                    </View>
                  </View>
                ))
              ) : (
                /* Single Filtered Category Grid */
                displayedRecentMovies.length > 0 ? (
                  <View>
                    <View style={styles.gridWrap}>
                      {paginatedRecentMovies.map((group, index) => (
                        <SearchMovieCard
                          key={`recent-${group.name}-${group.year || ''}-${index}`}
                          group={group}
                          cardWidth={cardWidth}
                          posterHeight={posterHeight}
                          onPress={handleCardPress}
                        />
                      ))}
                    </View>
                    {recentTotalPages > 1 && (
                      <PaginationControls
                        currentPage={recentPage}
                        totalPages={recentTotalPages}
                        onPageChange={(p) => {
                          setRecentPage(p);
                          recentScrollRef.current?.scrollTo({ y: 0, animated: true });
                        }}
                        onOpenJumpModal={() => {
                          setJumpTarget('recent');
                          setJumpModalVisible(true);
                        }}
                      />
                    )}
                  </View>
                ) : (
                  <View style={styles.emptyCategoryWrap}>
                    <Ionicons name="film-outline" size={36} color="#6E6E73" />
                    <Text style={styles.emptyCategoryText}>
                      No {recentCategoryFilterOptions.find((o) => o.key === selectedCategory)?.label || selectedCategory} releases found in this batch.
                    </Text>
                    <TouchableOpacity
                      style={[styles.retryButton, { marginTop: 12 }]}
                      onPress={() => setSelectedCategory('all')}
                    >
                      <Text style={styles.retryButtonText}>Show All Releases</Text>
                    </TouchableOpacity>
                  </View>
                )
              )}
            </View>
          ) : (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyStateIconContainer}>
                <Ionicons name="time-outline" color={theme.primary} size={48} />
              </View>
              <Text style={styles.emptyStateTitle}>No movies found</Text>
              <Text style={styles.emptyStateSubtitle}>
                Failed to load recently added movies. Please check your connection or retry.
              </Text>
              <TouchableOpacity style={styles.retryButton} onPress={handleRecentlyAddedPress}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          <BottomSpacing space={60} />
        </ScrollView>
      ) : showAddons ? (
        /* 3. Addon Respective Movies View */
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.contentContainer}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isLoadingAddons}
              onRefresh={() => loadAddonCatalog(selectedCatalogIdx, addonPage)}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
        >
          <View style={styles.resultsGridSection}>
            <View style={styles.resultsHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="extension-puzzle-outline" size={17} color={theme.primary} style={{ marginRight: 6 }} />
                <Text style={styles.resultsCountText}>
                  {availableCatalogs[selectedCatalogIdx]?.catalogName || 'Addon Movies'} ({addonMovies.length} Titles)
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity
                  style={styles.addonSettingsIconBtn}
                  onPress={() => router.push('/settings/addons' as any)}
                  hitSlop={8}
                >
                  <Ionicons name="settings-outline" size={18} color="#8E8E93" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.clearIconButton}
                  onPress={handleClearAddons}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle-outline" size={15} color="#ff453a" />
                  <Text style={styles.clearIconText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Catalog Selector Chips */}
            {availableCatalogs.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.catalogPillsRow}
              >
                {availableCatalogs.map((cat, idx) => {
                  const isSelected = selectedCatalogIdx === idx;
                  return (
                    <TouchableOpacity
                      key={`${cat.transportUrl}-${cat.catalogId}-${idx}`}
                      style={[
                        styles.catalogPill,
                        isSelected && [styles.catalogPillActive, { backgroundColor: theme.primary }],
                      ]}
                      onPress={() => handleCatalogSelect(idx)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.catalogPillText,
                          isSelected && styles.catalogPillTextActive,
                        ]}
                      >
                        {cat.addonName}: {cat.catalogName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Loading / Grid / Empty View */}
            {isLoadingAddons && addonMovies.length === 0 ? (
              <View style={styles.catalogLoadingContainer}>
                <View style={[styles.loadingPulseCircle, { backgroundColor: theme.iconBg, borderColor: theme.indicator || theme.cardBorder }]}>
                  <ActivityIndicator color={theme.primary} size="large" />
                </View>
                <Text style={styles.catalogLoadingTitle}>Loading Addon Movies</Text>
                <Text style={styles.catalogLoadingText}>
                  Fetching titles from {availableCatalogs[selectedCatalogIdx]?.addonName || 'installed addons'}…
                </Text>
              </View>
            ) : addonMovies.length > 0 ? (
              <View>
                <View style={styles.gridWrap}>
                  {addonMovies.map((group, index) => (
                    <SearchMovieCard
                      key={`addon-${group.name}-${group.year || ''}-${index}`}
                      group={group}
                      cardWidth={cardWidth}
                      posterHeight={posterHeight}
                      onPress={handleCardPress}
                    />
                  ))}
                </View>

                {/* Pagination Controls */}
                <View style={styles.addonPaginationBar}>
                  <TouchableOpacity
                    style={[
                      styles.addonPageButton,
                      { borderColor: theme.cardBorder, backgroundColor: theme.iconBg },
                      addonPage === 1 && { opacity: 0.4 },
                    ]}
                    onPress={() => handleAddonPageChange(Math.max(1, addonPage - 1))}
                    disabled={addonPage === 1 || isLoadingAddons}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chevron-back" size={16} color="#ffffff" style={{ marginRight: 4 }} />
                    <Text style={[styles.addonPageButtonText, { color: '#ffffff' }]}>Previous</Text>
                  </TouchableOpacity>

                  <Text style={styles.addonPageIndicator}>Page {addonPage}</Text>

                  <TouchableOpacity
                    style={[
                      styles.addonPageButton,
                      { borderColor: theme.cardBorder, backgroundColor: theme.iconBg },
                      addonMovies.length < 20 && { opacity: 0.4 },
                    ]}
                    onPress={() => handleAddonPageChange(addonPage + 1)}
                    disabled={addonMovies.length < 20 || isLoadingAddons}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.addonPageButtonText, { color: '#ffffff' }]}>Next</Text>
                    <Ionicons name="chevron-forward" size={16} color="#ffffff" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.emptyStateContainer}>
                <View style={styles.emptyStateIconContainer}>
                  <Ionicons name="extension-puzzle-outline" color={theme.primary} size={48} />
                </View>
                <Text style={styles.emptyStateTitle}>No Addon Movies Found</Text>
                <Text style={styles.emptyStateSubtitle}>
                  Ensure your addons have active catalogs, or open Addon Settings to configure addons.
                </Text>
                <TouchableOpacity
                  style={[styles.retryButton, { backgroundColor: theme.primary, borderColor: theme.primary }]}
                  onPress={() => router.push('/settings/addons' as any)}
                >
                  <Text style={styles.retryButtonText}>Manage Addons</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <BottomSpacing space={60} />
        </ScrollView>
      ) : (
        /* 4. Idle / Initial State */
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.contentContainer}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyStateIconContainer}>
              <Ionicons name="film-outline" color={theme.primary} size={48} />
            </View>
            <Text style={styles.emptyStateTitle}>Discover Movies</Text>
            <Text style={styles.emptyStateSubtitle}>
              Search for any movie above, or browse recently added releases and Web view.
            </Text>
            <View style={styles.emptyStateActionsRow}>
              <TouchableOpacity
                style={[
                  styles.loadRecentBtn,
                  { backgroundColor: theme.primary },
                  isLoadingRecent && { opacity: 0.8 },
                ]}
                onPress={handleRecentlyAddedPress}
                activeOpacity={0.8}
                disabled={isLoadingRecent}
              >
                {isLoadingRecent ? (
                  <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
                ) : (
                  <Ionicons name="time-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                )}
                <Text style={styles.loadRecentBtnText}>
                  {isLoadingRecent ? 'Loading recently added…' : 'Recently added'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.webViewBtn,
                  {
                    backgroundColor: theme.iconBg,
                    borderColor: theme.indicator || theme.cardBorder,
                  },
                ]}
                onPress={handleOpenWebView}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="globe-outline"
                  size={16}
                  color={theme.primaryLight || theme.primary}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.webViewBtnText}>Web view</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.addonBtn,
                  {
                    backgroundColor: theme.iconBg,
                    borderColor: theme.indicator || theme.cardBorder,
                  },
                ]}
                onPress={handleAddonsPress}
                activeOpacity={0.8}
                disabled={isLoadingAddons}
              >
                {isLoadingAddons ? (
                  <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 6 }} />
                ) : (
                  <Ionicons
                    name="extension-puzzle-outline"
                    size={16}
                    color={theme.primaryLight || theme.primary}
                    style={{ marginRight: 6 }}
                  />
                )}
                <Text style={styles.addonBtnText}>Addons</Text>
              </TouchableOpacity>
            </View>
          </View>

          <BottomSpacing space={60} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181a',
    borderRadius: 14,
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#28282c',
  },
  searchIconContainer: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '400',
    letterSpacing: -0.2,
  },
  clearButton: {
    marginLeft: 8,
    padding: 2,
  },

  catalogLoadingContainer: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 4,
    width: '100%',
  },
  loadingPulseCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(83, 90, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(83, 90, 255, 0.25)',
  },
  catalogLoadingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  catalogLoadingText: {
    color: '#8E8E93',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 28,
    maxWidth: 320,
    lineHeight: 18,
  },
  loadingSkeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%',
  },
  skeletonCard: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#18181a',
    borderWidth: 1,
    borderColor: '#28282c',
    marginBottom: 14,
  },
  skeletonInner: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },

  // Action / Status Badges
  resultsActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearIconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.28)',
  },
  clearIconText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ff453a',
    marginLeft: 3,
  },

  contentContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyStateIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(83, 90, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
    marginBottom: 16,
  },
  emptyStateActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  loadRecentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#535aff',
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 22,
  },
  loadRecentBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  webViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 22,
  },
  addonBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 22,
  },
  addonBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  catalogPillsRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  catalogPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  catalogPillActive: {
    borderColor: 'transparent',
  },
  catalogPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
  },
  catalogPillTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  addonSettingsIconBtn: {
    padding: 6,
    marginRight: 6,
  },
  addonPaginationBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 20,
    marginBottom: 10,
  },
  addonPageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  addonPageButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  addonPageIndicator: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
  },
  webViewBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },

  // Grid Results
  resultsGridSection: {
    paddingTop: 8,
  },
  resultsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  resultsCountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cardContainer: {
    marginBottom: 14,
  },
  posterWrap: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#1b1b1e',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#151518',
  },
  // ─── Pagination Styles ───────────────────────────────────────────────────────
  paginationContainer: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  paginationSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  paginationSummaryText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
  },
  paginationSummaryHighlight: {
    fontWeight: '700',
  },
  jumpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  jumpButtonText: {
    color: '#d1d1d6',
    fontSize: 12,
    fontWeight: '500',
  },
  paginationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
    flexGrow: 1,
  },
  pageBtn: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#18181a',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageBtnText: {
    color: '#d1d1d6',
    fontSize: 13,
    fontWeight: '600',
  },
  pageBtnTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  ellipsisBtn: {
    minWidth: 32,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ellipsisText: {
    color: '#8E8E93',
    fontSize: 16,
    fontWeight: '700',
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#18181a',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 4,
  },
  navBtnDisabled: {
    opacity: 0.35,
    backgroundColor: '#121214',
    borderColor: 'transparent',
  },
  navBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  navBtnTextDisabled: {
    color: '#666666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#121214',
    borderWidth: 1,
    borderColor: '#3a3a3c',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 16,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#2c2c2e',
  },
  modalCancelText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  modalGoBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  modalGoText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  searchingLoadingContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 16,
    width: '100%',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
    marginTop: 6,
    lineHeight: 17,
  },
  cardFooter: {
    marginTop: 2,
  },
  cardSub: {
    fontSize: 11,
    color: '#8E8E93',
  },
  retryButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginTop: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },

  // Filters Container matching index.tsx
  filtersContainer: {
    paddingVertical: 12,
    marginHorizontal: -16,
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 12,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  filterButtonActive: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  filterIcon: {
    marginRight: 6,
  },
  filterButtonText: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  filterButtonTextActive: {
    color: '#000000',
    fontWeight: '700',
  },

  // Category Sections (like index.tsx / PosterList)
  categorySection: {
    marginBottom: 24,
  },
  categorySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  categorySectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#cccccc',
    letterSpacing: -0.1,
  },
  chevronIcon: {
    marginLeft: 2,
  },
  emptyCategoryWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    width: '100%',
  },
  emptyCategoryText: {
    color: '#8E8E93',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});

export default SearchScreen;
