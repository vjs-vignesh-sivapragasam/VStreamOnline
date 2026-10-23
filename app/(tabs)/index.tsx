import { router } from 'expo-router';
import React, { useState, useCallback, useEffect } from 'react';
import nodejs from 'nodejs-mobile-react-native';
import {
  ScrollView,
  StyleSheet,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { StatusBar, Text } from '@/components/Themed';
import PosterList from '@/components/PosterList';
import BottomSpacing from '@/components/BottomSpacing';
import PosterCarousel from '@/components/PosterCarousel';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import BlurGradientBackground from '@/components/BlurGradientBackground';
import { useTamilMVCatalog, Language, CatalogSection } from '@/hooks/useTamilMv';

interface FilterItem {
  key: Language;
  label: string;
  icon: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LANGUAGE_FILTERS: FilterItem[] = [
  { key: 'tamil', label: 'Tamil', icon: 'language-outline' },
  { key: 'english', label: 'English', icon: 'globe-outline' },
  { key: 'malayalam', label: 'Malayalam', icon: 'language-outline' },
  { key: 'hindi', label: 'Hindi', icon: 'language-outline' },
  { key: 'telugu', label: 'Telugu', icon: 'language-outline' },
  { key: 'kannada', label: 'Kannada', icon: 'language-outline' },
];

// ─── Lazy section wrapper ─────────────────────────────────────────────────────

const LazySection = ({
  section,
  index,
  language,
}: {
  section: CatalogSection;
  index: number;
  language: Language;
}) => {
  const [shouldLoad, setShouldLoad] = useState(index < 2);

  return (
    <View onLayout={() => { if (!shouldLoad) setShouldLoad(true); }}>
      {shouldLoad ? (
        <PosterList
          groups={section.groups}
          title={section.label}
          type={section.type}
          language={language}
          category={section.category}
        />
      ) : (
        <View style={{ height: 280, marginBottom: 20 }} />
      )}
    </View>
  );
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const [language, setLanguage] = useState<Language>('tamil');

  const { sections, loading, errors, refresh } = useTamilMVCatalog(language);
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 1500);
  }, [refresh]);

  useEffect(() => {
    try {
      nodejs.start('wrapper.js');
    } catch (err: any) {
      console.log('ServerJs Error', err);
    }
  }, []);

  const handleLanguageChange = async (newLanguage: Language) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setLanguage(newLanguage);
  };

  const handleCarouselItemPress = (item: any) => {
    router.push({
      pathname: '/torrent/details',
      params: {
        guid:        item.guid,
        groupid:     item.groupid,
        title:       item.title,
        magnetUrl:   item.magnetUrl,
        infoHash:    item.infoHash,
        poster:      item.posterUrl,
        type:        item.type,
        publishDate: item.publishDate,
        allItems:    JSON.stringify(item.allItems), // ← fixed
      },
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar />
      <BlurGradientBackground />

      <ScrollView
        showsVerticalScrollIndicator={false}
        key={language}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#535aff"
            colors={['#535aff']}
          />
        }
      >
        <PosterCarousel
          filter={language}
          onItemPress={handleCarouselItemPress}
          autoPlay={true}
          autoPlayInterval={6000}
        />

        <View style={styles.contentContainer}>
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
                  <Ionicons
                    name={item.icon as any}
                    size={18}
                    color={language === item.key ? '#000000' : '#8E8E93'}
                    style={styles.filterIcon}
                  />
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

          {/* Loading state */}
          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#535aff" size="large" />
              <Text style={styles.loadingText}>
                Loading content…
              </Text>
            </View>
          )}

          {/* Error state */}
          {!loading && errors.length > 0 && sections.length === 0 && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Failed to load feed</Text>
              <TouchableOpacity style={styles.retryButton} onPress={refresh}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Category sections */}
          {sections.map((section, i) => (
            <LazySection
              key={`${language}-${section.category}`}
              section={section}
              index={i}
              language={language}
            />
          ))}
        </View>

        <BottomSpacing space={100} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  filtersContainer: { paddingVertical: 12, paddingHorizontal: 5 },
  filterRow: { paddingHorizontal: 10, gap: 15 },
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
  filterButtonActive: { backgroundColor: '#ffffff', borderColor: '#ffffff' },
  filterIcon: { marginRight: 6 },
  filterButtonText: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  filterButtonTextActive: { color: '#000000', fontWeight: '700' },
  contentContainer: { marginTop: 16 },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: { color: '#8E8E93', fontSize: 14 },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  errorText: { color: '#ff4444', fontSize: 15 },
  retryButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  retryText: { color: '#fff', fontWeight: '600' },
});