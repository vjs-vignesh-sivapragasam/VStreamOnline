import { Text, ActivityIndicator, TextInput, View, StatusBar } from '@/components/Themed';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ScrollView,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  Image,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import BottomSpacing from '@/components/BottomSpacing';
import { SafeAreaView } from 'react-native-safe-area-context';
import BlurGradientBackground from '@/components/BlurGradientBackground';
import {
  fetchAllTamilMVMovies,
  searchTamilMV,
  GroupedItem,
  TorrentItem,
} from '@/hooks/useTamilMv';
import { tmdbService } from '@/services/TmdbService';
import { useLocalSearchParams, router } from 'expo-router';
import { SvgXml } from 'react-native-svg';
import { DefaultPosterImgXml } from '@/utils/Svg';

// ─── Utility: Clean Movie Title ───────────────────────────────────────────────

const cleanMovieTitle = (title: string): string => {
  if (!title) return '';
  return title
    .replace(/^(?:https?:\/\/)?(?:www\.)?[\w\.-]+\.(?:com|org|net|cz|win|pm|re|to|yt|wf|ws|me|solar|mx|cards|pizza|fi|live)\s*[-_:]\s*/gi, '')
    .replace(/^(?:https?:\/\/)?(?:www\.)?(?:1tamilmv|tamilmv)[\w\.-]*\s*[-_:]\s*/gi, '')
    .replace(/^\[?\b(?:1tamilmv|tamilmv)\b\]?\s*[-_:]?\s*/gi, '')
    .replace(/\b(?:1tamilmv|tamilmv)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// ─── Movie Card Component ─────────────────────────────────────────────────────

const SearchMovieCard = ({
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
  const [posterUri, setPosterUri] = useState<string | null>(best?.poster || null);
  const type = (group as any).type || 'movie';
  const releasesCount = group.items.length;
  const lang = best?.language || 'tamil';

  const cleanedTitle = useMemo(() => {
    return cleanMovieTitle(group.name ?? best?.title ?? '');
  }, [group.name, best?.title]);

  useEffect(() => {
    if (best?.poster) {
      setPosterUri(best.poster);
      return;
    }
    let isMounted = true;
    tmdbService.getMovieFullInfo(group.name || '', group.year || undefined, type)
      .then((info) => {
        if (isMounted && info?.posterUrl) {
          setPosterUri(info.posterUrl);
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [best?.poster, group.name, group.year, type]);

  return (
    <Pressable
      style={[styles.cardContainer, { width: cardWidth }]}
      onPress={() => onPress(group)}
    >
      <View style={[styles.posterWrap, { width: cardWidth, height: posterHeight }]}>
        {posterUri && !imgError ? (
          <Image
            source={{ uri: posterUri }}
            onError={() => setImgError(true)}
            style={styles.posterImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.posterImage, styles.posterFallback]}>
            <SvgXml xml={DefaultPosterImgXml} width={cardWidth * 0.5} height={posterHeight * 0.4} />
          </View>
        )}

        {/* Top Badges */}
        <View style={styles.topBadgesRow}>
          {group.year ? (
            <View style={styles.yearBadge}>
              <Text style={styles.yearBadgeText}>{group.year}</Text>
            </View>
          ) : null}

          {lang ? (
            <View style={styles.langBadge}>
              <Text style={styles.langBadgeText}>{lang.toUpperCase()}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <Text style={[styles.cardTitle, { width: cardWidth }]} numberOfLines={2}>
        {cleanedTitle}
      </Text>

      <View style={styles.cardFooter}>
        <Text style={styles.cardSub}>
          {type === 'series' ? 'Series' : 'Movie'} • {releasesCount} {releasesCount === 1 ? 'source' : 'sources'}
        </Text>
      </View>
    </Pressable>
  );
};

// ─── Search Screen ────────────────────────────────────────────────────────────

const SearchScreen = () => {
  const params = useLocalSearchParams<{ query?: string }>();
  const [query, setQuery]                           = useState(params.query || '');
  const [allMoviesList, setAllMoviesList]           = useState<GroupedItem[]>([]);
  const [liveSearchResults, setLiveSearchResults]   = useState<GroupedItem[]>([]);
  const [isSearchingLive, setIsSearchingLive]       = useState(false);
  const [isCleared, setIsCleared]                   = useState(false);
  const [isLoading, setIsLoading]                   = useState(false);
  const [error, setError]                           = useState<string | null>(null);

  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { width } = useWindowDimensions();
  const numColumns = width < 580 ? 3 : width < 1024 ? 5 : 7;
  const cardSpacing = 12;
  const totalHorizontalPadding = 32;
  const cardWidth = (width - totalHorizontalPadding - (numColumns - 1) * cardSpacing) / numColumns;
  const posterHeight = cardWidth * 1.5;

  const loadAllMovies = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const items = await fetchAllTamilMVMovies(forceRefresh);
      setAllMoviesList(items);
      setIsCleared(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to load movies');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllMovies(false);
  }, [loadAllMovies]);

  useEffect(() => {
    if (params.query && params.query !== query) {
      setQuery(params.query);
      setIsCleared(false);
    }
  }, [params.query]);

  // Live web search when user types query
  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2 || isCleared) {
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
        const liveItems = await searchTamilMV(q, 'all');
        setLiveSearchResults(liveItems);
      } catch {
        // Fallback to in-memory filter
      } finally {
        setIsSearchingLive(false);
      }
    }, 600);

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [query, isCleared]);

  const handleClearList = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsCleared(true);
    setQuery('');
    setLiveSearchResults([]);
  }, []);

  const handleClearQuery = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setQuery('');
    setLiveSearchResults([]);
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
        type,
        publishDate: best.publishDate,
        allItems: JSON.stringify(group.items),
        topicUrl: best.groupid,
      },
    });
  }, []);

  // Filter movies by query
  const filteredMovies = useMemo(() => {
    if (isCleared) return [];
    const q = query.trim().toLowerCase();
    if (!q) return allMoviesList;

    const inMemory = allMoviesList.filter((group) => {
      const nameMatch = group.name?.toLowerCase().includes(q);
      const yearMatch = group.year ? group.year.toString().includes(q) : false;
      const titleMatch = group.items.some((i) => i.title.toLowerCase().includes(q));
      const langMatch = group.items.some((i) => i.language?.toLowerCase().includes(q));
      return nameMatch || yearMatch || titleMatch || langMatch;
    });

    if (liveSearchResults.length === 0) return inMemory;

    // Combine in-memory and live search results (deduplicating by title + year)
    const movieMap = new Map<string, GroupedItem>();
    inMemory.forEach((g) => {
      const key = `${(g.name || '').toLowerCase()}|||${g.year || ''}`;
      movieMap.set(key, g);
    });
    liveSearchResults.forEach((g) => {
      const key = `${(g.name || '').toLowerCase()}|||${g.year || ''}`;
      if (!movieMap.has(key)) {
        movieMap.set(key, g);
      }
    });

    return Array.from(movieMap.values());
  }, [query, allMoviesList, liveSearchResults, isCleared]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar />
      <BlurGradientBackground />

      {/* Header */}
      <View style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Search</Text>

          {/* Web view Shortcut in Header */}
          <TouchableOpacity
            style={styles.webViewHeaderButton}
            onPress={handleOpenWebView}
            activeOpacity={0.8}
          >
            <Ionicons name="globe-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.webViewHeaderButtonText}>Web view</Text>
          </TouchableOpacity>
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
            placeholder="Search all movies..."
            placeholderTextColor="#6E6E73"
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              if (isCleared) setIsCleared(false);
            }}
            returnKeyType="search"
            submitBehavior="blurAndSubmit"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {isSearchingLive && (
            <ActivityIndicator size="small" color="#535aff" style={{ marginRight: 6 }} />
          )}
          {query.length > 0 && (
            <Pressable onPress={handleClearQuery} style={styles.clearButton} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color="#6E6E73" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Action / Filter Row */}
      <View style={styles.filtersContainer}>
        <View style={styles.filterRow}>
          {/* All Movies Button */}
          <TouchableOpacity
            style={[styles.filterButton, !isCleared && styles.filterButtonActive]}
            onPress={() => {
              setIsCleared(false);
              loadAllMovies(false);
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="film-outline"
              size={15}
              color={!isCleared ? '#000000' : '#8E8E93'}
              style={styles.filterIcon}
            />
            <Text style={[styles.filterButtonText, !isCleared && styles.filterButtonTextActive]}>
              All Movies
            </Text>
            {allMoviesList.length > 0 && !isCleared && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{allMoviesList.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Clear List Button */}
          <TouchableOpacity
            style={[styles.filterButton, styles.clearListButton]}
            onPress={handleClearList}
            activeOpacity={0.7}
          >
            <Ionicons
              name="trash-outline"
              size={14}
              color="#ff453a"
              style={styles.filterIcon}
            />
            <Text style={styles.clearListButtonText}>Clear</Text>
          </TouchableOpacity>

          {/* Web view Filter Button */}
          <TouchableOpacity
            style={[styles.filterButton, styles.webViewFilterButton]}
            onPress={handleOpenWebView}
            activeOpacity={0.7}
          >
            <Ionicons
              name="globe-outline"
              size={14}
              color="#535aff"
              style={styles.filterIcon}
            />
            <Text style={styles.webViewFilterButtonText}>Web view</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content Area */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.contentContainer}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => loadAllMovies(true)}
            tintColor="#535aff"
            colors={['#535aff']}
          />
        }
      >
        {/* Loading state on first load */}
        {isLoading && allMoviesList.length === 0 && !isCleared && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#535aff" />
            <Text style={styles.loadingText}>Loading all movies…</Text>
          </View>
        )}

        {/* Error state */}
        {!isLoading && error && allMoviesList.length === 0 && !isCleared && (
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyStateIconContainer}>
              <Ionicons name="alert-circle-outline" color="#ff5252" size={48} />
            </View>
            <Text style={styles.emptyStateTitle}>Failed to load movies</Text>
            <Text style={styles.emptyStateSubtitle}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => loadAllMovies(true)}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Cleared State */}
        {isCleared && (
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyStateIconContainer}>
              <Ionicons name="film-outline" color="#535aff" size={48} />
            </View>
            <Text style={styles.emptyStateTitle}>Movie List Cleared</Text>
            <Text style={styles.emptyStateSubtitle}>
              Tap below or search to reload movies.
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setIsCleared(false);
                loadAllMovies(false);
              }}
            >
              <Text style={styles.retryButtonText}>Load All Movies</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Results Grid */}
        {!isCleared && filteredMovies.length > 0 && (
          <View style={styles.resultsGridSection}>
            <View style={styles.resultsHeaderRow}>
              <Text style={styles.resultsCountText}>
                {query.trim()
                  ? `${filteredMovies.length} ${filteredMovies.length === 1 ? 'Movie' : 'Movies'} found`
                  : `${allMoviesList.length} ${allMoviesList.length === 1 ? 'Movie' : 'Movies'} • All Releases`}
              </Text>
              <TouchableOpacity
                style={styles.liveBadge}
                onPress={() => loadAllMovies(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh" size={11} color="#00e676" style={{ marginRight: 4 }} />
                <Text style={styles.liveBadgeText}>Live</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.gridWrap}>
              {filteredMovies.map((group) => (
                <SearchMovieCard
                  key={`movie-${group.name}-${group.year || ''}`}
                  group={group}
                  cardWidth={cardWidth}
                  posterHeight={posterHeight}
                  onPress={handleCardPress}
                />
              ))}
            </View>
          </View>
        )}

        {/* No Search Matches Found */}
        {!isCleared && !isLoading && allMoviesList.length > 0 && filteredMovies.length === 0 && query.trim() !== '' && (
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyStateIconContainer}>
              <Ionicons name="search-outline" color="#535aff" size={48} />
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
                style={[styles.retryButton, { backgroundColor: '#535aff', borderColor: '#535aff' }]}
                onPress={handleOpenWebView}
              >
                <Text style={styles.retryButtonText}>Open Web view</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <BottomSpacing space={60} />
      </ScrollView>
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
  webViewHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#535aff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#535aff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 3,
  },
  webViewHeaderButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
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
  filtersContainer: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 6,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#18181a',
    borderWidth: 1,
    borderColor: '#26262a',
  },
  filterButtonActive: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  clearListButton: {
    backgroundColor: 'rgba(255, 69, 58, 0.08)',
    borderColor: 'rgba(255, 69, 58, 0.28)',
  },
  clearListButtonText: {
    fontSize: 13,
    color: '#ff453a',
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  webViewFilterButton: {
    backgroundColor: 'rgba(83, 90, 255, 0.1)',
    borderColor: 'rgba(83, 90, 255, 0.3)',
  },
  webViewFilterButtonText: {
    fontSize: 13,
    color: '#535aff',
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  filterIcon: {
    marginRight: 6,
  },
  filterButtonText: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  filterButtonTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  countBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000000',
  },
  contentContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#8E8E93',
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
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 230, 118, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.25)',
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#00e676',
    letterSpacing: 0.2,
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
  topBadgesRow: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  yearBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  yearBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#ffffff',
  },
  langBadge: {
    backgroundColor: 'rgba(83, 90, 255, 0.85)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  langBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.2,
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
});

export default SearchScreen;
