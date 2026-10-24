import { Text, ActivityIndicator, TextInput, View, StatusBar } from '@/components/Themed';
import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  ScrollView,
  Pressable,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import BottomSpacing from '@/components/BottomSpacing';
import { SafeAreaView } from 'react-native-safe-area-context';
import BlurGradientBackground from '@/components/BlurGradientBackground';
import {
  useTamilMV,
  Language,
  searchTamilMV,
  GroupedItem,
  TorrentItem,
} from '@/hooks/useTamilMv';
import { useLocalSearchParams, router } from 'expo-router';
import { SvgXml } from 'react-native-svg';
import { DefaultPosterImgXml } from '@/utils/Svg';

// ─── Constants ────────────────────────────────────────────────────────────────

export type LanguageFilterKey = Language | 'all';

interface FilterItem {
  key: LanguageFilterKey;
  label: string;
}

const LANGUAGE_FILTERS: FilterItem[] = [
  { key: 'all',       label: 'All' },
  { key: 'tamil',     label: 'Tamil' },
  { key: 'telugu',    label: 'Telugu' },
  { key: 'hindi',     label: 'Hindi' },
  { key: 'malayalam', label: 'Malayalam' },
  { key: 'kannada',   label: 'Kannada' },
  { key: 'english',   label: 'English' },
];

const NO_SERIES_LANGUAGES: Language[] = ['hindi', 'telugu', 'malayalam', 'kannada'];

const QUICK_TRENDING_SUGGESTIONS = [
  'Hi Nanna',
  'Amaran',
  'GOAT',
  'Devara',
  'Leo',
  'Kalki',
  'Vettaiyan',
  'Kantara',
  'Vikram',
  'Jailer',
];

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
  const type = (group as any).type || 'movie';
  const releasesCount = group.items.length;
  const lang = best?.language || 'tamil';

  return (
    <Pressable
      style={[styles.cardContainer, { width: cardWidth }]}
      onPress={() => onPress(group)}
    >
      <View style={[styles.posterWrap, { width: cardWidth, height: posterHeight }]}>
        {best?.poster && !imgError ? (
          <Image
            source={{ uri: best.poster }}
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

        {/* Source indicator */}
        <View style={styles.sourceBadge}>
          <Ionicons name="globe-outline" size={10} color="#00e676" style={{ marginRight: 3 }} />
          <Text style={styles.sourceBadgeText}>1TamilMV</Text>
        </View>
      </View>

      <Text style={[styles.cardTitle, { width: cardWidth }]} numberOfLines={2}>
        {group.name ?? best.title}
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
  const [query, setQuery]                   = useState(params.query || '');
  const [debouncedQuery, setDebouncedQuery] = useState(params.query || '');
  const [language, setLanguage]             = useState<LanguageFilterKey>('all');
  const debounceRef                         = useRef<any>(null);

  const { width } = useWindowDimensions();
  const numColumns = width < 580 ? 3 : width < 1024 ? 5 : 7;
  const cardSpacing = 12;
  const totalHorizontalPadding = 32;
  const cardWidth = (width - totalHorizontalPadding - (numColumns - 1) * cardSpacing) / numColumns;
  const posterHeight = cardWidth * 1.5;

  // Local RSS feeds
  const activeRssLanguage: Language = language === 'all' ? 'tamil' : language;
  const hasSeriesCategory = !NO_SERIES_LANGUAGES.includes(activeRssLanguage);

  const { groups: movieGroups, loading: moviesLoading } = useTamilMV(activeRssLanguage, 'webhd');
  const { groups: multiAudioGroups, loading: multiLoading } = useTamilMV(
    activeRssLanguage,
    activeRssLanguage === 'tamil' ? 'multiaudio' : 'webhd'
  );
  const { groups: seriesGroups, loading: seriesLoading } = useTamilMV(
    activeRssLanguage,
    hasSeriesCategory ? 'series' : 'webhd',
  );

  const localLoading = moviesLoading || (activeRssLanguage === 'tamil' && multiLoading) || (hasSeriesCategory && seriesLoading);

  // Web search state from 1TamilMV website
  const [webResults, setWebResults]         = useState<GroupedItem[]>([]);
  const [isWebSearching, setIsWebSearching] = useState(false);
  const searchRequestId                     = useRef(0);

  useEffect(() => {
    if (params.query && params.query !== query) {
      setQuery(params.query);
      setDebouncedQuery(params.query);
    }
  }, [params.query]);

  // ── Web search effect ───────────────────────────────────────────────────────
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed) {
      setWebResults([]);
      setIsWebSearching(false);
      return;
    }

    const currentReqId = ++searchRequestId.current;
    setIsWebSearching(true);

    searchTamilMV(trimmed, language)
      .then((results) => {
        if (currentReqId === searchRequestId.current) {
          setWebResults(results);
        }
      })
      .catch((err) => {
        console.warn('[SearchScreen] Web search error:', err);
      })
      .finally(() => {
        if (currentReqId === searchRequestId.current) {
          setIsWebSearching(false);
        }
      });
  }, [debouncedQuery, language]);

  // ── Merge Local + Online Web Results ────────────────────────────────────────

  const allLocalMovies = useMemo(() => {
    if (activeRssLanguage !== 'tamil') return movieGroups;
    const combined = [...movieGroups];
    multiAudioGroups.forEach(item => {
      if (!combined.some(c => c.name === item.name)) {
        combined.push(item);
      }
    });
    return combined;
  }, [activeRssLanguage, movieGroups, multiAudioGroups]);

  const allCombinedResults = useMemo(() => {
    const q = debouncedQuery.toLowerCase().trim();
    if (!q) return [];

    // 1. Local RSS items
    const localMatches = allLocalMovies.filter(g => g.name?.toLowerCase().includes(q));
    const localSeries = hasSeriesCategory ? seriesGroups.filter(g => g.name?.toLowerCase().includes(q)) : [];

    const result: GroupedItem[] = [...localMatches, ...localSeries];
    const seenNames = new Set(result.map(m => m.name?.toLowerCase()));

    // 2. Web search items from 1TamilMV
    webResults.forEach(item => {
      const norm = item.name?.toLowerCase();
      if (norm && !seenNames.has(norm)) {
        seenNames.add(norm);
        result.push(item);
      } else if (norm && seenNames.has(norm)) {
        // Merge topics into existing group
        const existing = result.find(r => r.name?.toLowerCase() === norm);
        if (existing) {
          item.items.forEach(it => {
            if (!existing.items.some(ei => ei.guid === it.guid)) {
              existing.items.push(it);
            }
          });
        }
      }
    });

    return result;
  }, [debouncedQuery, allLocalMovies, seriesGroups, hasSeriesCategory, webResults]);

  const hasResults = allCombinedResults.length > 0;
  const isOverallLoading = (localLoading && !hasResults) || (isWebSearching && !hasResults);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleTextChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(text), 350);
  }, []);

  const clearSearch = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setQuery('');
    setDebouncedQuery('');
    setWebResults([]);
  }, []);

  const handleLanguageChange = useCallback(async (lang: LanguageFilterKey) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setLanguage(lang);
  }, []);

  const handleSuggestionPress = useCallback(async (sug: string) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setQuery(sug);
    setDebouncedQuery(sug);
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
        title: group.name ?? best.title,
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar />
      <BlurGradientBackground />

      {/* Header */}
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Search</Text>
      </View>

      {/* Search Input Section */}
      <View style={styles.searchSection}>
        <View style={styles.searchInputContainer}>
          <View style={styles.searchIconContainer}>
            <Ionicons name="search-outline" size={20} color="#6E6E73" />
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search movies, series, or keywords..."
            placeholderTextColor="#6E6E73"
            value={query}
            onChangeText={handleTextChange}
            onSubmitEditing={() => setDebouncedQuery(query)}
            returnKeyType="search"
            submitBehavior="blurAndSubmit"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <Pressable onPress={clearSearch} style={styles.clearButton}>
              <Ionicons name="close-circle" size={20} color="#6E6E73" />
            </Pressable>
          )}
        </View>

        {/* Live web searching indicator */}
        {isWebSearching && (
          <View style={styles.webSearchBanner}>
            <ActivityIndicator size="small" color="#535aff" style={{ marginRight: 6 }} />
            <Text style={styles.webSearchBannerText}>
              Searching 1TamilMV website live…
            </Text>
          </View>
        )}
      </View>

      {/* Language filter pills */}
      <View style={styles.filtersContainer}>
        <FlatList
          data={LANGUAGE_FILTERS}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterButton,
                language === item.key && styles.filterButtonActive,
              ]}
              onPress={() => handleLanguageChange(item.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  language === item.key && styles.filterButtonTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Main Content Area */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.contentContainer}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Idle: Quick Trending Suggestions */}
        {!debouncedQuery.trim() && (
          <View style={styles.idleContainer}>
            <View style={styles.emptyStateIconContainer}>
              <Ionicons name="search" color="#535aff" size={42} />
            </View>
            <Text style={styles.idleTitle}>Find Movies & TV Series</Text>
            <Text style={styles.idleSubtitle}>
              Searches live torrent releases directly from 1TamilMV across all quality formats.
            </Text>

            <View style={styles.suggestionsSection}>
              <Text style={styles.suggestionsHeader}>TRENDING ON 1TAMILMV</Text>
              <View style={styles.suggestionsWrap}>
                {QUICK_TRENDING_SUGGESTIONS.map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={styles.suggestionPill}
                    onPress={() => handleSuggestionPress(item)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trending-up-outline" size={13} color="#535aff" style={{ marginRight: 5 }} />
                    <Text style={styles.suggestionPillText}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Loading State */}
        {isOverallLoading && debouncedQuery.trim() !== '' && !hasResults && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#535aff" />
            <Text style={styles.loadingText}>Searching 1TamilMV online catalog...</Text>
          </View>
        )}

        {/* No Results Found */}
        {debouncedQuery.trim() !== '' && !hasResults && !isOverallLoading && !isWebSearching && (
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyStateIconContainer}>
              <Ionicons name="sad-outline" color="#535aff" size={48} />
            </View>
            <Text style={styles.emptyStateTitle}>No results found</Text>
            <Text style={styles.emptyStateSubtitle}>
              No releases found for "{debouncedQuery}" on 1TamilMV. Try searching with a different movie title or switch to "All" languages.
            </Text>
          </View>
        )}

        {/* Search Results Grid */}
        {hasResults && (
          <View style={styles.resultsGridSection}>
            <View style={styles.resultsHeaderRow}>
              <Text style={styles.resultsCountText}>
                {allCombinedResults.length} {allCombinedResults.length === 1 ? 'Release' : 'Releases'} on 1TamilMV
              </Text>
              <View style={styles.liveBadge}>
                <View style={styles.liveBadgeDot} />
                <Text style={styles.liveBadgeText}>Online Live</Text>
              </View>
            </View>

            <View style={styles.gridWrap}>
              {allCombinedResults.map((group) => (
                <SearchMovieCard
                  key={`${group.name}-${group.year || ''}`}
                  group={group}
                  cardWidth={cardWidth}
                  posterHeight={posterHeight}
                  onPress={handleCardPress}
                />
              ))}
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
  webSearchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  webSearchBannerText: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  filtersContainer: {
    paddingBottom: 12,
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterButton: {
    paddingVertical: 7,
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
  contentContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  idleContainer: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 16,
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
  idleTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  idleSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  suggestionsSection: {
    marginTop: 36,
    width: '100%',
  },
  suggestionsHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.8,
    marginBottom: 12,
    textAlign: 'center',
  },
  suggestionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  suggestionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#19191d',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#26262c',
  },
  suggestionPillText: {
    fontSize: 13,
    color: '#c7c7cc',
    fontWeight: '500',
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
  liveBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00e676',
    marginRight: 5,
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
  sourceBadge: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sourceBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#00e676',
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
});

export default SearchScreen;
