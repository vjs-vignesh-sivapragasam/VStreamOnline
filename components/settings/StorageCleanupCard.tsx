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

export const StorageCleanupCard: React.FC = () => {
  const { theme } = useTheme();
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await storageCleanupService.getStorageStats();
      setStats(data);
    } catch (err) {
      console.warn('[StorageCleanupCard] Error loading storage stats:', err);
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

  return (
    <View style={styles.cardContainer}>
      {/* Top Header Row with Refresh */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIconBox, { backgroundColor: theme.primary + '1F' }]}>
            <Ionicons name="pie-chart-outline" size={20} color={theme.primary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Storage & Memory Usage</Text>
            <Text style={styles.headerSubtitle}>Manage offline media, cache & lists</Text>
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

      {/* Storage Summary Big Pill */}
      <View style={[styles.storageBanner, { borderColor: theme.primary + '33', backgroundColor: theme.primary + '0D' }]}>
        <View style={styles.storageBannerLeft}>
          <Text style={styles.storageBannerLabel}>TOTAL DATA CONSUMED</Text>
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

      {/* Action Buttons Grid */}
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

        {/* 4. Master Deep Clean Button */}
        <TouchableOpacity
          style={[
            styles.deepCleanBtn,
            {
              backgroundColor: theme.primary,
              shadowColor: theme.primary,
            },
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
          <Text style={styles.deepCleanBtnText}>
            {actionInProgress === 'everything' ? 'Cleaning All Storage...' : 'Deep Clean & Free Everything'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#101012',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerLeft: {
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
