import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import { useTheme } from '@/contexts/ThemeContext';
import { storageCleanupService, StorageStats } from '@/services/StorageCleanupService';
import { dataConsumptionService, DataConsumptionStats } from '@/services/DataConsumptionService';

export interface StorageCleanupCardProps {
  onStatsChange?: () => void;
}

export const StorageCleanupCard: React.FC<StorageCleanupCardProps> = ({ onStatsChange }) => {
  const { theme } = useTheme();
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [dataStats, setDataStats] = useState<DataConsumptionStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setIsLoading(true);
      const [storageData, consumptionData] = await Promise.all([
        storageCleanupService.getStorageStats(),
        dataConsumptionService.getDataConsumptionStats(),
      ]);
      setStats(storageData);
      setDataStats(consumptionData);
      onStatsChange?.();
    } catch (err) {
      console.warn('[StorageCleanupCard] Error loading stats:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const triggerHaptic = async (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(style);
    }
  };

  // 1. Clear Downloads Action
  const handleClearDownloads = () => {
    if (!stats || (stats.tamilmvDownloadsCount === 0 && stats.youtubeDownloadsCount === 0)) {
      Alert.alert('No Downloads', 'Your downloads directory is currently empty.');
      return;
    }

    Alert.alert(
      'Clear Downloads',
      `You currently have ${stats.tamilmvDownloadsCount} TamilMV downloads (${storageCleanupService.formatBytes(stats.tamilmvDownloadsBytes)}) and ${stats.youtubeDownloadsCount} YouTube downloads (${storageCleanupService.formatBytes(stats.youtubeDownloadsBytes)}).\n\nWhat would you like to delete?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'TamilMV Only',
          onPress: async () => {
            await triggerHaptic();
            setActionInProgress('downloads');
            await storageCleanupService.clearTamilMVDownloads();
            await loadStats();
            setActionInProgress(null);
            Alert.alert('Done', 'TamilMV downloads cleared successfully.');
          },
        },
        {
          text: 'YouTube Only',
          onPress: async () => {
            await triggerHaptic();
            setActionInProgress('downloads');
            await storageCleanupService.clearYouTubeDownloads();
            await loadStats();
            setActionInProgress(null);
            Alert.alert('Done', 'YouTube downloads cleared successfully.');
          },
        },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await triggerHaptic(Haptics.ImpactFeedbackStyle.Heavy);
            setActionInProgress('downloads');
            await storageCleanupService.clearAllDownloads();
            await loadStats();
            setActionInProgress(null);
            Alert.alert('Done', 'All downloaded movies and videos have been deleted.');
          },
        },
      ]
    );
  };

  // 2. Clear Cache Action
  const handleClearCache = () => {
    Alert.alert(
      'Clear App Cache',
      'This will delete cached images, stream buffer chunks, and temporary API metadata. Your saved downloads and settings will NOT be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cache',
          style: 'destructive',
          onPress: async () => {
            await triggerHaptic();
            setActionInProgress('cache');
            const freed = await storageCleanupService.clearCache();
            await loadStats();
            setActionInProgress(null);
            Alert.alert(
              'Cache Cleared',
              `Freed ${storageCleanupService.formatBytes(freed)} of temporary cache memory.`
            );
          },
        },
      ]
    );
  };

  // 3. Clear My List Action
  const handleClearMyLists = () => {
    if (!stats || (stats.tamilmvMyListCount === 0 && stats.youtubeMyListCount === 0)) {
      Alert.alert('No Items', 'Your watchlists are already empty.');
      return;
    }

    Alert.alert(
      'Clear Watchlists & Saved Items',
      `You currently have ${stats.tamilmvMyListCount} movies/series in TamilMV Watchlist and ${stats.youtubeMyListCount} saved YouTube videos.\n\nChoose which list to clear:`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'TamilMV Only',
          onPress: async () => {
            await triggerHaptic();
            setActionInProgress('mylist');
            await storageCleanupService.clearTamilMVMyList();
            await loadStats();
            setActionInProgress(null);
            Alert.alert('Done', 'TamilMV Watchlist cleared.');
          },
        },
        {
          text: 'YouTube Only',
          onPress: async () => {
            await triggerHaptic();
            setActionInProgress('mylist');
            await storageCleanupService.clearYouTubeMyList();
            await loadStats();
            setActionInProgress(null);
            Alert.alert('Done', 'YouTube Saved List cleared.');
          },
        },
        {
          text: 'Clear Both',
          style: 'destructive',
          onPress: async () => {
            await triggerHaptic(Haptics.ImpactFeedbackStyle.Heavy);
            setActionInProgress('mylist');
            await storageCleanupService.clearAllMyLists();
            await loadStats();
            setActionInProgress(null);
            Alert.alert('Done', 'All watchlists and saved items have been cleared.');
          },
        },
      ]
    );
  };

  const handleResetDataTracking = () => {
    Alert.alert(
      'Reset Data Usage Tracking',
      'This will reset today and overall streaming data consumption counters back to 0 B.\n\nOffline downloads and cache will NOT be deleted. Do you want to proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Tracking',
          style: 'destructive',
          onPress: async () => {
            await triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
            setActionInProgress('resetData');
            await dataConsumptionService.resetAll();
            await loadStats();
            setActionInProgress(null);
            Alert.alert('Done', 'Data consumption counters have been reset.');
          },
        },
      ]
    );
  };

  // 4. Deep Clean / Clear Everything Action
  const handleClearEverything = () => {
    Alert.alert(
      'Deep Clean App Memory',
      'This will delete ALL downloads (TamilMV & YouTube), wipe all temporary cache, and clear your watchlists. The app memory will be completely freed.\n\nAre you sure you want to proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe Everything',
          style: 'destructive',
          onPress: async () => {
            await triggerHaptic(Haptics.ImpactFeedbackStyle.Heavy);
            setActionInProgress('everything');
            const res = await storageCleanupService.clearEverything();
            await dataConsumptionService.resetAll();
            await loadStats();
            setActionInProgress(null);
            Alert.alert(
              'Memory Cleanup Complete',
              `Successfully freed ${storageCleanupService.formatBytes(res.freedBytes)} of device storage.`
            );
          },
        },
      ]
    );
  };

  const totalUsedFormatted = stats
    ? storageCleanupService.formatBytes(stats.totalStorageUsedBytes)
    : '0 B';
  const downloadsFormatted = stats
    ? storageCleanupService.formatBytes(stats.totalDownloadsBytes)
    : '0 B';
  const cacheFormatted = stats
    ? storageCleanupService.formatBytes(stats.cacheBytes)
    : '0 B';

  // Calculate percentages for data consumption segment bar
  const totalTraffic = (dataStats?.overallTotalBytes || 1);
  const streamPct = Math.max(5, Math.min(85, Math.round(((dataStats?.overallStreamBytes || 0) / totalTraffic) * 100)));
  const downloadPct = Math.max(5, Math.min(85, Math.round(((dataStats?.overallDownloadBytes || 0) / totalTraffic) * 100)));
  const cachePct = Math.max(2, 100 - streamPct - downloadPct);

  return (
    <View style={styles.cardContainer}>
      {/* ── 1. Top Section: Data Consumption Analytics ──────────────────────── */}
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.headerIconBox, { backgroundColor: '#30d1581F' }]}>
            <Ionicons name="cellular-outline" size={20} color="#30d158" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Data Consumption Analytics</Text>
            <Text style={styles.headerSubtitle}>
              Today's usage vs overall app throughput
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={loadStats}
          disabled={isLoading}
          style={styles.refreshBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Ionicons name="refresh" size={17} color="#8E8E93" />
          )}
        </TouchableOpacity>
      </View>

      {/* Two Prominent KPI Cards: Today vs Overall */}
      <View style={styles.kpiCardsRow}>
        {/* Card 1: Today's Consumption */}
        <View style={[styles.kpiCard, styles.todayCard]}>
          <View style={styles.kpiTopRow}>
            <View style={styles.kpiTagWrap}>
              <View style={[styles.kpiTagDot, { backgroundColor: '#30d158' }]} />
              <Text style={styles.kpiTagText}>CONSUMED TODAY</Text>
            </View>
            <Ionicons name="today-outline" size={15} color="#30d158" />
          </View>

          <Text style={styles.kpiMainValue}>
            {dataStats?.todayFormatted || '0 B'}
          </Text>

          <View style={styles.kpiDivider} />

          <View style={styles.kpiDetailRow}>
            <View style={styles.kpiDetailItem}>
              <Text style={styles.kpiDetailLabel}>Streaming</Text>
              <Text style={styles.kpiDetailVal}>
                {dataStats ? dataConsumptionService.formatBytes(dataStats.todayStreamBytes) : '0 B'}
              </Text>
            </View>
            <View style={styles.kpiDetailItem}>
              <Text style={styles.kpiDetailLabel}>Downloads</Text>
              <Text style={styles.kpiDetailVal}>
                {dataStats ? dataConsumptionService.formatBytes(dataStats.todayDownloadBytes) : '0 B'}
              </Text>
            </View>
          </View>

          <View style={styles.kpiPlaybackRow}>
            <Ionicons name="time-outline" size={12} color="rgba(255, 255, 255, 0.55)" />
            <Text style={styles.kpiPlaybackText}>
              ~{dataStats?.todayStreamMinutes || 0} mins watched today
            </Text>
          </View>
        </View>

        {/* Card 2: Overall App Consumption */}
        <View style={[styles.kpiCard, styles.overallCard, { borderColor: theme.primary + '33' }]}>
          <View style={styles.kpiTopRow}>
            <View style={styles.kpiTagWrap}>
              <View style={[styles.kpiTagDot, { backgroundColor: theme.primary }]} />
              <Text style={styles.kpiTagText}>OVERALL (ALL TIME)</Text>
            </View>
            <Ionicons name="globe-outline" size={15} color={theme.primary} />
          </View>

          <Text style={[styles.kpiMainValue, { color: theme.primaryLight || theme.primary }]}>
            {dataStats?.overallFormatted || '0 B'}
          </Text>

          <View style={styles.kpiDivider} />

          <View style={styles.kpiDetailRow}>
            <View style={styles.kpiDetailItem}>
              <Text style={styles.kpiDetailLabel}>All Streams</Text>
              <Text style={styles.kpiDetailVal}>
                {dataStats ? dataConsumptionService.formatBytes(dataStats.overallStreamBytes) : '0 B'}
              </Text>
            </View>
            <View style={styles.kpiDetailItem}>
              <Text style={styles.kpiDetailLabel}>Disk Storage</Text>
              <Text style={styles.kpiDetailVal}>{totalUsedFormatted}</Text>
            </View>
          </View>

          <View style={styles.kpiPlaybackRow}>
            <Ionicons name="play-circle-outline" size={12} color="rgba(255, 255, 255, 0.55)" />
            <Text style={styles.kpiPlaybackText}>
              ~{dataStats?.overallStreamMinutes || 0} mins total streamed
            </Text>
          </View>
        </View>
      </View>

      {/* Segmented Traffic Distribution Bar */}
      <View style={styles.distributionContainer}>
        <View style={styles.distributionHeader}>
          <Text style={styles.distributionTitle}>Traffic Distribution Breakdown</Text>
          <Text style={styles.distributionSub}>All-time network throughput</Text>
        </View>

        <View style={styles.segmentTrack}>
          <View style={[styles.segmentFill, { width: `${streamPct}%`, backgroundColor: theme.primary }]} />
          <View style={[styles.segmentFill, { width: `${downloadPct}%`, backgroundColor: '#30d158' }]} />
          <View style={[styles.segmentFill, { width: `${cachePct}%`, backgroundColor: '#ff9f0a' }]} />
        </View>

        <View style={styles.segmentLegendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.primary }]} />
            <Text style={styles.legendText}>
              Streaming ({dataStats ? dataConsumptionService.formatBytes(dataStats.overallStreamBytes) : '0 B'})
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#30d158' }]} />
            <Text style={styles.legendText}>
              Downloads ({dataStats ? dataConsumptionService.formatBytes(dataStats.overallDownloadBytes) : '0 B'})
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#ff9f0a' }]} />
            <Text style={styles.legendText}>
              Cache ({cacheFormatted})
            </Text>
          </View>
        </View>
      </View>

      {/* ── 2. Device Storage & Local Disk Memory ────────────────────────────── */}
      <View style={styles.storageSectionDivider} />

      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.headerIconBox, { backgroundColor: theme.primary + '1F' }]}>
            <Ionicons name="pie-chart-outline" size={20} color={theme.primary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Device Storage & Memory Cleanup</Text>
            <Text style={styles.headerSubtitle}>Manage offline media, cache & lists</Text>
          </View>
        </View>
      </View>

      {/* Storage Summary Big Pill */}
      <View style={[styles.storageBanner, { borderColor: theme.primary + '33', backgroundColor: theme.primary + '0D' }]}>
        <View style={styles.storageBannerLeft}>
          <Text style={styles.storageBannerLabel}>TOTAL DISK STORAGE USED</Text>
          <Text style={[styles.storageBannerValue, { color: theme.primaryLight || theme.primary }]}>
            {totalUsedFormatted}
          </Text>
        </View>
        <View style={styles.storageBannerRight}>
          <View style={styles.storagePillRow}>
            <View style={[styles.statDot, { backgroundColor: '#30d158' }]} />
            <Text style={styles.statPillText}>Downloads: {downloadsFormatted}</Text>
          </View>
          <View style={styles.storagePillRow}>
            <View style={[styles.statDot, { backgroundColor: '#ff9f0a' }]} />
            <Text style={styles.statPillText}>Cache: {cacheFormatted}</Text>
          </View>
        </View>
      </View>

      {/* Granular Breakdown Badges */}
      <View style={styles.breakdownGrid}>
        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownLabel}>TamilMV Downloads</Text>
          <Text style={styles.breakdownValue}>
            {stats ? `${stats.tamilmvDownloadsCount} items` : '0'} ({stats ? storageCleanupService.formatBytes(stats.tamilmvDownloadsBytes) : '0 B'})
          </Text>
        </View>

        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownLabel}>YouTube Downloads</Text>
          <Text style={styles.breakdownValue}>
            {stats ? `${stats.youtubeDownloadsCount} items` : '0'} ({stats ? storageCleanupService.formatBytes(stats.youtubeDownloadsBytes) : '0 B'})
          </Text>
        </View>

        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownLabel}>TamilMV Watchlist</Text>
          <Text style={styles.breakdownValue}>{stats?.tamilmvMyListCount || 0} movies</Text>
        </View>

        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownLabel}>YouTube Saved</Text>
          <Text style={styles.breakdownValue}>{stats?.youtubeMyListCount || 0} videos</Text>
        </View>
      </View>

      {/* ── 3. Action Buttons Grid ─────────────────────────────────────────── */}
      <View style={styles.actionsContainer}>
        {/* 1. Clear All Downloads Button */}
        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: theme.primary + '3A', backgroundColor: 'rgba(255, 255, 255, 0.04)' }]}
          onPress={handleClearDownloads}
          disabled={actionInProgress !== null}
          activeOpacity={0.7}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: theme.primary + '18' }]}>
            {actionInProgress === 'downloads' ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Ionicons name="arrow-down-circle-outline" size={18} color={theme.primary} />
            )}
          </View>
          <View style={styles.actionTextWrap}>
            <Text style={styles.actionBtnTitle}>Clear All Downloads</Text>
            <Text style={styles.actionBtnSub}>Delete offline TamilMV & YouTube files</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#6E6E73" />
        </TouchableOpacity>

        {/* 2. Clear Cache Button */}
        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: theme.primary + '3A', backgroundColor: 'rgba(255, 255, 255, 0.04)' }]}
          onPress={handleClearCache}
          disabled={actionInProgress !== null}
          activeOpacity={0.7}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: theme.primary + '18' }]}>
            {actionInProgress === 'cache' ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Ionicons name="trash-bin-outline" size={18} color={theme.primary} />
            )}
          </View>
          <View style={styles.actionTextWrap}>
            <Text style={styles.actionBtnTitle}>Clear App Cache</Text>
            <Text style={styles.actionBtnSub}>Free temporary image & stream buffer memory</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#6E6E73" />
        </TouchableOpacity>

        {/* 3. Clear My List Button */}
        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: theme.primary + '3A', backgroundColor: 'rgba(255, 255, 255, 0.04)' }]}
          onPress={handleClearMyLists}
          disabled={actionInProgress !== null}
          activeOpacity={0.7}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: theme.primary + '18' }]}>
            {actionInProgress === 'mylist' ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Ionicons name="bookmark-outline" size={18} color={theme.primary} />
            )}
          </View>
          <View style={styles.actionTextWrap}>
            <Text style={styles.actionBtnTitle}>Clear Watchlists & My List</Text>
            <Text style={styles.actionBtnSub}>Reset saved TamilMV & YouTube lists</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#6E6E73" />
        </TouchableOpacity>

                {/* Reset Data Tracking Button */}
        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: '#30d1583A', backgroundColor: 'rgba(255, 255, 255, 0.04)' }]}
          onPress={handleResetDataTracking}
          disabled={actionInProgress !== null}
          activeOpacity={0.7}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: '#30d15818' }]}>
            {actionInProgress === 'resetData' ? (
              <ActivityIndicator size="small" color="#30d158" />
            ) : (
              <Ionicons name="refresh-circle-outline" size={18} color="#30d158" />
            )}
          </View>
          <View style={styles.actionTextWrap}>
            <Text style={styles.actionBtnTitle}>Reset Data Consumption Counters</Text>
            <Text style={styles.actionBtnSub}>Reset today & overall streaming throughput counters</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#6E6E73" />
        </TouchableOpacity>

        {/* 4. Master Deep Clean Button */}
        <TouchableOpacity
          style={[
            styles.deepCleanBtn,
            { backgroundColor: '#e50914' },
            actionInProgress === 'everything' && { opacity: 0.7 },
          ]}
          onPress={handleClearEverything}
          disabled={actionInProgress !== null}
          activeOpacity={0.8}
        >
          {actionInProgress === 'everything' ? (
            <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
          ) : (
            <Ionicons name="sparkles" size={16} color="#ffffff" style={{ marginRight: 8 }} />
          )}
          <Text style={styles.deepCleanBtnText}>Deep Clean (Wipe All App Data)</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: 'rgba(18, 18, 20, 0.98)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  refreshBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },

  // ── Dual KPI Stat Cards (Today vs Overall) ─────────────────────────────────
  kpiCardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  todayCard: {
    backgroundColor: 'rgba(48, 209, 88, 0.07)',
    borderColor: 'rgba(48, 209, 88, 0.28)',
  },
  overallCard: {
    backgroundColor: 'rgba(83, 90, 255, 0.07)',
  },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  kpiTagWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  kpiTagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  kpiTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.5,
  },
  kpiMainValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#30d158',
    letterSpacing: -0.5,
    marginVertical: 2,
  },
  kpiDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    marginVertical: 8,
  },
  kpiDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  kpiDetailItem: {
    gap: 2,
  },
  kpiDetailLabel: {
    fontSize: 10,
    color: '#8E8E93',
  },
  kpiDetailVal: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
  },
  kpiPlaybackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  kpiPlaybackText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.65)',
    fontWeight: '500',
  },

  // ── Traffic Distribution Segment Bar ───────────────────────────────────────
  distributionContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 14,
  },
  distributionHeader: {
    marginBottom: 8,
  },
  distributionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  distributionSub: {
    fontSize: 10,
    color: '#8E8E93',
    marginTop: 1,
  },
  segmentTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 8,
  },
  segmentFill: {
    height: '100%',
  },
  segmentLegendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.75)',
  },

  storageSectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 14,
  },

  // ── Storage Banner ─────────────────────────────────────────────────────────
  storageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  storageBannerLeft: {
    gap: 2,
  },
  storageBannerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.8,
  },
  storageBannerValue: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  storageBannerRight: {
    gap: 4,
    alignItems: 'flex-end',
  },
  storagePillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D1D1D6',
  },

  // ── Breakdown Grid ─────────────────────────────────────────────────────────
  breakdownGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  breakdownItem: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  breakdownLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginBottom: 2,
  },
  breakdownValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },

  // ── Action Buttons ─────────────────────────────────────────────────────────
  actionsContainer: {
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionTextWrap: {
    flex: 1,
  },
  actionBtnTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  actionBtnSub: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 1,
  },
  deepCleanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  deepCleanBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
