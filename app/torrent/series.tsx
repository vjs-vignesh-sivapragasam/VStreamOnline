import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Image,
  Pressable,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Text } from '@/components/Themed';
import {
  useWebSeriesPaginated,
  getPaginationItems,
  cleanMovieTitle,
  GroupedItem,
  TorrentItem,
} from '@/hooks/useTamilMv';
import { tmdbService } from '@/services/TmdbService';
import { SvgXml } from 'react-native-svg';
import { DefaultPosterImgXml } from '@/utils/Svg';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import BottomSpacing from '@/components/BottomSpacing';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBestItem(group: GroupedItem): TorrentItem {
  return group.items.find((i) => i.poster) ?? group.items[0];
}

// ─── Series Card Component ─────────────────────────────────────────────────────

const SeriesCard = ({
  group,
  cardWidth,
  posterHeight,
  onPress,
}: {
  group: GroupedItem;
  cardWidth: number;
  posterHeight: number;
  onPress: (group: GroupedItem, posterUrl: string | null) => void;
}) => {
  const [imgError, setImgError] = useState(false);
  const best = getBestItem(group);
  const [posterUri, setPosterUri] = useState<string | null>(best?.poster || null);
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
    tmdbService
      .getMovieFullInfo(group.name || '', group.year || undefined, 'series')
      .then((info) => {
        if (isMounted && info?.posterUrl) {
          setPosterUri(info.posterUrl);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [best?.poster, group.name, group.year]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.cardContainer,
        { width: cardWidth, opacity: pressed ? 0.75 : 1 },
      ]}
      onPress={() => onPress(group, posterUri)}
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
            <SvgXml
              xml={DefaultPosterImgXml}
              width={cardWidth * 0.5}
              height={posterHeight * 0.4}
            />
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

        {releasesCount > 1 ? (
          <View style={styles.releaseBadge}>
            <Text style={styles.releaseBadgeText}>{releasesCount} releases</Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.cardTitle, { width: cardWidth }]} numberOfLines={2}>
        {cleanedTitle}
      </Text>
      {group.year ? <Text style={styles.cardYear}>{group.year}</Text> : null}
    </Pressable>
  );
};

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
          Page <Text style={styles.paginationSummaryHighlight}>{currentPage}</Text> of{' '}
          <Text style={styles.paginationSummaryHighlight}>{totalPages}</Text>
        </Text>
        {totalPages > 1 && (
          <TouchableOpacity
            style={styles.jumpButton}
            onPress={onOpenJumpModal}
            activeOpacity={0.7}
          >
            <Ionicons name="search-outline" size={13} color="#8E8E93" style={{ marginRight: 4 }} />
            <Text style={styles.jumpButtonText}>Jump to Page</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Pagination button bar: Previous | 1 | 2 | 3 | … | 42 | Next */}
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

        {pages.map((item, index) => {
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
              style={[styles.pageBtn, isActive && styles.pageBtnActive]}
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
            <TouchableOpacity style={styles.modalGoBtn} onPress={handleConfirm}>
              <Text style={styles.modalGoText}>Go</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WebSeriesScreen() {
  const params = useLocalSearchParams<{
    title?: string;
  }>();

  const title = params.title || 'Web Series & TV Shows';
  const { items, currentPage, totalPages, loading, error, goToPage, refresh } =
    useWebSeriesPaginated(1);

  const [jumpModalVisible, setJumpModalVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const { width } = useWindowDimensions();
  const numColumns = 3;
  const spacing = 12;
  const horizontalPadding = 15;
  const itemWidth =
    (width - horizontalPadding * 2 - spacing * (numColumns - 1)) / numColumns;
  const posterHeight = itemWidth * 1.5;

  const handlePageChange = useCallback(
    (page: number) => {
      goToPage(page);
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    },
    [goToPage]
  );

  const handlePressCard = useCallback(
    async (group: GroupedItem, posterUrl: string | null) => {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      const best = getBestItem(group);
      router.push({
        pathname: '/torrent/details',
        params: {
          guid: best.guid,
          groupid: best.groupid,
          topicUrl: best.guid,
          title: group.name ?? best.title,
          magnetUrl: best.magnetUrl,
          infoHash: best.infoHash,
          poster: posterUrl || best.poster || '',
          type: 'series',
          publishDate: best.publishDate,
          allItems: JSON.stringify(group.items),
        },
      });
    },
    []
  );

  if (loading && items.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#535aff" />
        <Text style={styles.loadingText}>Loading Web Series (Page {currentPage})…</Text>
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color="#ff4444" />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={refresh}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        ref={flatListRef}
        data={items}
        keyExtractor={(item, index) => `${item.name}-${currentPage}-${index}`}
        numColumns={numColumns}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            tintColor="#535aff"
            colors={['#535aff']}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            <Text style={styles.screenTitle}>{title}</Text>
            <View style={styles.headerMetaRow}>
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>
                  PAGE {currentPage} OF {totalPages}
                </Text>
              </View>
              {items.length > 0 && (
                <Text style={styles.headerCountText}>
                  {items.length} Series
                </Text>
              )}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <SeriesCard
            group={item}
            cardWidth={itemWidth}
            posterHeight={posterHeight}
            onPress={handlePressCard}
          />
        )}
        ListFooterComponent={
          <View>
            {totalPages > 0 && (
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                onOpenJumpModal={() => setJumpModalVisible(true)}
              />
            )}
            <BottomSpacing space={60} />
          </View>
        }
      />

      <JumpModal
        visible={jumpModalVisible}
        onClose={() => setJumpModalVisible(false)}
        totalPages={totalPages}
        onJump={handlePageChange}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  listContent: {
    marginTop: 20,
    paddingHorizontal: 15,
    paddingTop: 16,
    paddingBottom: 24,
  },
  row: {
    gap: 12,
    marginBottom: 14,
  },
  headerContainer: {
    marginBottom: 20,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerBadge: {
    backgroundColor: 'rgba(83, 90, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(83, 90, 255, 0.45)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  headerBadgeText: {
    color: '#7b82ff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headerCountText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '500',
  },

  // ─── Card Styles ─────────────────────────────────────────────────────────────
  cardContainer: {
    marginBottom: 6,
  },
  posterWrap: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#141414',
    position: 'relative',
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#161618',
  },
  topBadgesRow: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  yearBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  yearBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  langBadge: {
    backgroundColor: 'rgba(83, 90, 255, 0.85)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  langBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  releaseBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  releaseBadgeText: {
    color: '#b0b0b5',
    fontSize: 10,
    fontWeight: '500',
  },
  cardTitle: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  cardYear: {
    marginTop: 2,
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '500',
  },

  // ─── Pagination Styles ───────────────────────────────────────────────────────
  paginationContainer: {
    marginTop: 24,
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
    color: '#ffffff',
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
  pageBtnActive: {
    backgroundColor: '#535aff',
    borderColor: '#535aff',
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

  // ─── Modal Styles ────────────────────────────────────────────────────────────
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
    backgroundColor: '#535aff',
  },
  modalGoText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },

  // ─── Status Views ────────────────────────────────────────────────────────────
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    gap: 14,
    paddingHorizontal: 24,
  },
  loadingText: {
    color: '#8E8E93',
    fontSize: 14,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    marginTop: 8,
    backgroundColor: '#1c1c1e',
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
