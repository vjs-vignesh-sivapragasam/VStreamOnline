import { Text, ActivityIndicator, TextInput, View, StatusBar } from '@/components/Themed';
import { useState, useRef, useCallback, useMemo } from 'react';
import { ScrollView, Pressable, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import BottomSpacing from '@/components/BottomSpacing';
import PosterList from '@/components/PosterList';
import { SafeAreaView } from 'react-native-safe-area-context';
import BlurGradientBackground from '@/components/BlurGradientBackground';
import { useTamilMV, Language } from '@/hooks/useTamilMv';

// ─── Constants ────────────────────────────────────────────────────────────────

interface FilterItem {
  key: Language;
  label: string;
}

const LANGUAGE_FILTERS: FilterItem[] = [
  { key: 'tamil',     label: 'Tamil' },
  { key: 'english',   label: 'English' },
  { key: 'malayalam', label: 'Malayalam' },
  { key: 'hindi',     label: 'Hindi' },
  { key: 'telugu',    label: 'Telugu' },
  { key: 'kannada',   label: 'Kannada' },
];

const NO_SERIES_LANGUAGES: Language[] = ['hindi', 'telugu', 'malayalam', 'kannada'];

// ─── Search Screen ────────────────────────────────────────────────────────────

const SearchScreen = () => {
  const [query, setQuery]                   = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [language, setLanguage]             = useState<Language>('tamil');
  const debounceRef                         = useRef<any>(null);

  const hasSeriesCategory = !NO_SERIES_LANGUAGES.includes(language);

  const { groups: movieGroups,  loading: moviesLoading } = useTamilMV(language, 'webhd');
  const { groups: seriesGroups, loading: seriesLoading } = useTamilMV(
    language,
    hasSeriesCategory ? 'series' : 'webhd',
  );

  const loading = moviesLoading || (hasSeriesCategory && seriesLoading);

  // ── Filter groups by query ────────────────────────────────────────────────

  const filteredMovies = useMemo(() => {
    if (!debouncedQuery.trim()) return [];
    const q = debouncedQuery.toLowerCase();
    return movieGroups.filter(g => g.name?.toLowerCase().includes(q));
  }, [debouncedQuery, movieGroups]);

  const filteredSeries = useMemo(() => {
    if (!debouncedQuery.trim() || !hasSeriesCategory) return [];
    const q = debouncedQuery.toLowerCase();
    return seriesGroups.filter(g => g.name?.toLowerCase().includes(q));
  }, [debouncedQuery, seriesGroups, hasSeriesCategory]);

  const hasResults = filteredMovies.length > 0 || filteredSeries.length > 0;

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
  }, []);

  const handleLanguageChange = useCallback(async (lang: Language) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setLanguage(lang);
  }, []);

  // ── Empty state ───────────────────────────────────────────────────────────

  const emptyState = useMemo(() => {
    if (!debouncedQuery.trim()) {
      return {
        icon: 'search' as const,
        title: 'Start your search',
        subtitle: 'What would you like to watch today?',
      };
    }
    if (!hasResults && !loading) {
      return {
        icon: 'sad-outline' as const,
        title: 'No results found',
        subtitle: `No matches for "${debouncedQuery}" in ${LANGUAGE_FILTERS.find(f => f.key === language)?.label}`,
      };
    }
    return null;
  }, [debouncedQuery, hasResults, loading, language]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar />
      <BlurGradientBackground />

      {/* Header */}
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Search</Text>
      </View>

      {/* Search input */}
      <View style={styles.searchSection}>
        <View style={styles.searchInputContainer}>
          <View style={styles.searchIconContainer}>
            <Ionicons name="search-outline" size={20} color="#6E6E73" />
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search movies or series..."
            placeholderTextColor="#6E6E73"
            value={query}
            onChangeText={handleTextChange}
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

      {/* Loading */}
      {loading && debouncedQuery.trim() !== '' && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#535aff" />
        </View>
      )}

      {/* Results */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.contentContainer}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Empty / idle state */}
        {emptyState && !loading && (
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyStateIconContainer}>
              <Ionicons name={emptyState.icon} color="#535aff" size={48} />
            </View>
            <Text style={styles.emptyStateTitle}>{emptyState.title}</Text>
            <Text style={styles.emptyStateSubtitle}>{emptyState.subtitle}</Text>
          </View>
        )}

        {/* Movie results */}
        {filteredMovies.length > 0 && (
          <PosterList
            groups={filteredMovies}
            title="Movies"
            type="movie"
            language={language}
            category="webhd"
            hideSeeAll
          />
        )}

        {/* Series results */}
        {filteredSeries.length > 0 && (
          <PosterList
            groups={filteredSeries}
            title="Series"
            type="series"
            language={language}
            category="series"
            hideSeeAll
          />
        )}

        <BottomSpacing space={50} />
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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    height: 48,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  searchIconContainer: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    color: '#ffffff',
    fontWeight: '400',
    letterSpacing: -0.2,
  },
  clearButton: {
    marginLeft: 8,
    padding: 2,
  },
  filtersContainer: {
    paddingBottom: 12,
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 10,
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  filterButtonActive: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  filterButtonTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyStateIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(83, 90, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  emptyStateSubtitle: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
    fontWeight: '400',
    letterSpacing: -0.1,
  },
});

export default SearchScreen;