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
  }, [onStatsChange]);

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
    const tmvCount = stats?.tamilmvDownloadsCount || 0;
    const ytCount = stats?.youtubeDownloadsCount || 0;
    if (!stats || (tmvCount === 0 && ytCount === 0)) {
      Alert.alert('No Downloads', 'Your downloads directory is currently empty.');
      return;
    }

    Alert.alert(
      'Clear Downloads',
      `Choose downloads to delete:`,
      [
        { text: 'Cancel', style: 'cancel' },
        ...(tmvCount > 0
          ? [
              {
                text: `TamilMV (${tmvCount})`,
                onPress: async () => {
                  await triggerHaptic();
                  setActionInProgress('downloads');
                  await storageCleanupService.clearTamilMVDownloads();
                  await loadStats();
                  setActionInProgress(null);
                },
              },
            ]
          : []),
        ...(ytCount > 0
          ? [
              {
                text: `YouTube (${ytCount})`,
                onPress: async () => {
                  await triggerHaptic();
                  setActionInProgress('downloads');
                  await storageCleanupService.clearYouTubeDownloads();
                  await loadStats();
                  setActionInProgress(null);
                },
              },
            ]
          : []),
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await triggerHaptic(Haptics.ImpactFeedbackStyle.Heavy);
            setActionInProgress('downloads');
            await storageCleanupService.clearAllDownloads();
            await loadStats();
            setActionInProgress(null);
          },
        },
      ]
    );
  };

  // 2. Clear Cache Action
  const handleClearCache = () => {
    Alert.alert(
      'Clear App Cache',
      'Delete cached images, buffer chunks, and temp metadata? Downloads will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cache',
          style: 'destructive',
          onPress: async () => {
            await triggerHaptic();
            setActionInProgress('cache');
            await storageCleanupService.clearCache();
            await loadStats();
            setActionInProgress(null);
          },
        },
      ]
    );
  };

  // 3. Clear Watchlists Action
  const handleClearMyLists = () => {
    const tmvCount = stats?.tamilmvMyListCount || 0;
    const ytCount = stats?.youtubeMyListCount || 0;
    if (!stats || (tmvCount === 0 && ytCount === 0)) {
      Alert.alert('No Items', 'Your saved watchlists are already empty.');
      return;
    }

    Alert.alert(
      'Clear Watchlists',
      'Select list to clear:',
      [
        { text: 'Cancel', style: 'cancel' },
        ...(tmvCount > 0
          ? [
              {
                text: `TamilMV (${tmvCount})`,
                onPress: async () => {
                  await triggerHaptic();
                  setActionInProgress('mylist');
                  await storageCleanupService.clearTamilMVMyList();
                  await loadStats();
                  setActionInProgress(null);
                },
              },
            ]
          : []),
        ...(ytCount > 0
          ? [
              {
                text: `YouTube (${ytCount})`,
                onPress: async () => {
                  await triggerHaptic();
                  setActionInProgress('mylist');
                  await storageCleanupService.clearYouTubeMyList();
                  await loadStats();
                  setActionInProgress(null);
                },
              },
            ]
          : []),
        {
          text: 'Clear Both',
          style: 'destructive',
          onPress: async () => {
            await triggerHaptic(Haptics.ImpactFeedbackStyle.Heavy);
            setActionInProgress('mylist');
            await storageCleanupService.clearAllMyLists();
            await loadStats();
            setActionInProgress(null);
          },
        },
      ]
    );
  };

  // 4. Reset Data Usage
  const handleResetDataTracking = () => {
    Alert.alert(
      'Reset Data Usage',
      'Reset data consumption counters back to 0 B? Downloads and cache will remain intact.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await triggerHaptic();
            setActionInProgress('resetData');
            await dataConsumptionService.resetAll();
            await loadStats();
            setActionInProgress(null);
          },
        },
      ]
    );
  };

  // 5. Deep Clean Everything
  const handleClearEverything = () => {
    Alert.alert(
      'Deep Clean App Storage',
      'This will delete all downloads, cache, and watchlists. App data will be completely cleared.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe Everything',
          style: 'destructive',
          onPress: async () => {
            await triggerHaptic(Haptics.ImpactFeedbackStyle.Heavy);
            setActionInProgress('everything');
            await storageCleanupService.clearEverything();
            await dataConsumptionService.resetAll();
            await loadStats();
            setActionInProgress(null);
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

  const totalUsedBytes = stats?.totalStorageUsedBytes || 0;
  const downloadBytes = stats?.totalDownloadsBytes || 0;
  const barMax = Math.max(totalUsedBytes, 1);
  const downloadBarPct = totalUsedBytes > 0 ? Math.round((downloadBytes / barMax) * 100) : 0;
  const cacheBarPct = totalUsedBytes > 0 ? Math.max(0, 100 - downloadBarPct) : 0;

  const totalDownloadItems = (stats?.tamilmvDownloadsCount || 0) + (stats?.youtubeDownloadsCount || 0);
  const totalListItems = (stats?.tamilmvMyListCount || 0) + (stats?.youtubeMyListCount || 0);

  return (
    <View style={styles.container}>
      {/* ── 1. Storage Overview Meter Card ──────────────────────── */}
      <View style={styles.overviewCard}>
        <View style={styles.overviewHeader}>
          <View>
            <Text style={styles.overviewSub}>TOTAL STORAGE USED</Text>
            <Text style={[styles.overviewTitle, { color: theme.primaryLight || theme.primary }]}>
              {totalUsedFormatted}
            </Text>
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

        {/* Visual Segment Bar */}
        <View style={styles.barTrack}>
          {downloadBarPct > 0 && (
            <View style={[styles.barSegment, { width: `${downloadBarPct}%`, backgroundColor: '#0a84ff' }]} />
          )}
          {cacheBarPct > 0 && (
            <View style={[styles.barSegment, { width: `${cacheBarPct}%`, backgroundColor: '#ff9f0a' }]} />
          )}
        </View>

        {/* Legend */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#0a84ff' }]} />
            <Text style={styles.legendLabel}>Downloads</Text>
            <Text style={styles.legendValue}>{downloadsFormatted}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#ff9f0a' }]} />
            <Text style={styles.legendLabel}>Cache</Text>
            <Text style={styles.legendValue}>{cacheFormatted}</Text>
          </View>
        </View>
      </View>

      {/* ── 2. Network Data Usage (Today & Total) ────────────────── */}
      <View style={styles.dataRow}>
        <View style={styles.dataCard}>
          <View style={styles.dataCardHeader}>
            <Ionicons name="today-outline" size={14} color="#30d158" />
            <Text style={styles.dataCardLabel}>Today's Data</Text>
          </View>
          <Text style={styles.dataCardValue}>{dataStats?.todayFormatted || '0 B'}</Text>
          <Text style={styles.dataCardSub}>
            ~{dataStats?.todayStreamMinutes || 0}m streamed
          </Text>
        </View>

        <View style={styles.dataCard}>
          <View style={styles.dataCardHeader}>
            <Ionicons name="globe-outline" size={14} color={theme.primary} />
            <Text style={styles.dataCardLabel}>Total Usage</Text>
          </View>
          <Text style={[styles.dataCardValue, { color: theme.primaryLight || theme.primary }]}>
            {dataStats?.overallFormatted || '0 B'}
          </Text>
          <Text style={styles.dataCardSub}>
            ~{dataStats?.overallStreamMinutes || 0}m all-time
          </Text>
        </View>
      </View>

      {/* ── 3. Manage & Cleanup List ─────────────────────────────── */}
      <Text style={styles.sectionHeading}>CLEANUP</Text>
      <View style={styles.groupedList}>
        {/* Downloads */}
        <TouchableOpacity
          style={styles.listItem}
          onPress={handleClearDownloads}
          disabled={actionInProgress !== null}
          activeOpacity={0.7}
        >
          <View style={[styles.itemIcon, { backgroundColor: '#0a84ff1C' }]}>
            <Ionicons name="arrow-down-circle" size={18} color="#0a84ff" />
          </View>
          <View style={styles.itemContent}>
            <Text style={styles.itemTitle}>Downloads</Text>
            <Text style={styles.itemSub}>
              {totalDownloadItems > 0 ? `${totalDownloadItems} files • ${downloadsFormatted}` : 'Empty'}
            </Text>
          </View>
          {actionInProgress === 'downloads' ? (
            <ActivityIndicator size="small" color="#0a84ff" />
          ) : (
            <View style={styles.actionPill}>
              <Text style={styles.actionPillText}>Clear</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.listDivider} />

        {/* Cache */}
        <TouchableOpacity
          style={styles.listItem}
          onPress={handleClearCache}
          disabled={actionInProgress !== null}
          activeOpacity={0.7}
        >
          <View style={[styles.itemIcon, { backgroundColor: '#ff9f0a1C' }]}>
            <Ionicons name="trash-bin" size={18} color="#ff9f0a" />
          </View>
          <View style={styles.itemContent}>
            <Text style={styles.itemTitle}>App Cache</Text>
            <Text style={styles.itemSub}>{cacheFormatted} temporary buffer</Text>
          </View>
          {actionInProgress === 'cache' ? (
            <ActivityIndicator size="small" color="#ff9f0a" />
          ) : (
            <View style={styles.actionPill}>
              <Text style={styles.actionPillText}>Clear</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.listDivider} />

        {/* Watchlists */}
        <TouchableOpacity
          style={styles.listItem}
          onPress={handleClearMyLists}
          disabled={actionInProgress !== null}
          activeOpacity={0.7}
        >
          <View style={[styles.itemIcon, { backgroundColor: '#af52de1C' }]}>
            <Ionicons name="bookmark" size={18} color="#af52de" />
          </View>
          <View style={styles.itemContent}>
            <Text style={styles.itemTitle}>Saved Watchlists</Text>
            <Text style={styles.itemSub}>
              {totalListItems > 0 ? `${totalListItems} saved items` : 'Empty'}
            </Text>
          </View>
          {actionInProgress === 'mylist' ? (
            <ActivityIndicator size="small" color="#af52de" />
          ) : (
            <View style={styles.actionPill}>
              <Text style={styles.actionPillText}>Clear</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.listDivider} />

        {/* Reset Data Counters */}
        <TouchableOpacity
          style={styles.listItem}
          onPress={handleResetDataTracking}
          disabled={actionInProgress !== null}
          activeOpacity={0.7}
        >
          <View style={[styles.itemIcon, { backgroundColor: '#30d1581C' }]}>
            <Ionicons name="refresh-circle" size={18} color="#30d158" />
          </View>
          <View style={styles.itemContent}>
            <Text style={styles.itemTitle}>Reset Data Tracking</Text>
            <Text style={styles.itemSub}>Clear usage stats back to 0 B</Text>
          </View>
          {actionInProgress === 'resetData' ? (
            <ActivityIndicator size="small" color="#30d158" />
          ) : (
            <View style={[styles.actionPill, styles.actionPillGreen]}>
              <Text style={[styles.actionPillText, { color: '#30d158' }]}>Reset</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── 4. Deep Clean Button (Subtle & Clean) ─────────────────── */}
      <TouchableOpacity
        style={styles.deepCleanBtn}
        onPress={handleClearEverything}
        disabled={actionInProgress !== null}
        activeOpacity={0.75}
      >
        {actionInProgress === 'everything' ? (
          <ActivityIndicator size="small" color="#ff453a" />
        ) : (
          <>
            <Ionicons name="sparkles-outline" size={16} color="#ff453a" />
            <Text style={styles.deepCleanText}>Deep Clean (Wipe All App Storage)</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
    gap: 14,
  },

  /* Overview Card */
  overviewCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  overviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  overviewSub: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  overviewTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  barTrack: {
    height: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 4,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 12,
  },
  barSegment: {
    height: '100%',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  legendValue: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
  },

  /* Data KPI Cards */
  dataRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dataCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  dataCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  dataCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  dataCardValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 2,
  },
  dataCardSub: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.45)',
    fontWeight: '500',
  },

  /* Grouped List */
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.6,
    marginLeft: 4,
    marginTop: 2,
  },
  groupedList: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  itemIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  itemSub: {
    fontSize: 12,
    color: '#8E8E93',
  },
  listDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginLeft: 58,
  },
  actionPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  actionPillGreen: {
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
  },
  actionPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },

  /* Deep Clean */
  deepCleanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 69, 58, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.22)',
    marginTop: 4,
  },
  deepCleanText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ff453a',
  },
});
