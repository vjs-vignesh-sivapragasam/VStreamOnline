import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { downloadService, DownloadItem } from '@/services/DownloadService';
import { externalPlayerService } from '@/utils/ExternalPlayerService';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';

export default function YouTubeDownloadsScreen() {
  const router = useRouter();
  const [downloads, setDownloads] = useState<DownloadItem[]>(() => {
    return downloadService.getDownloads().filter(
      (item) => item.id.startsWith('yt_') || item.sourceType === 'direct'
    );
  });

  useEffect(() => {
    const unsub = downloadService.addListener((all) => {
      const ytItems = all.filter(
        (item) => item.id.startsWith('yt_') || item.sourceType === 'direct'
      );
      setDownloads(ytItems);
    });
    return unsub;
  }, []);

  const activeDownloads = downloads.filter(
    (d) => d.status === 'downloading' || d.status === 'paused' || d.status === 'error'
  );
  const completedDownloads = downloads.filter((d) => d.status === 'completed');

  const handlePlayDownloadedItem = useCallback(
    async (item: DownloadItem) => {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      if (item.status !== 'completed' || !item.fileUri) {
        Alert.alert(
          'Download Incomplete',
          `This video is currently ${item.status} (${Math.round(item.progress || 0)}%). Please wait until the download finishes.`
        );
        return;
      }

      externalPlayerService.promptPlayerSelection({
        fileUri: item.fileUri,
        title: item.title,
        poster: item.poster || '',
        fileLength: item.totalBytes,
        onPlayInternal: () => {
          router.push({
            pathname: '/stream/player',
            params: {
              videoUrl: item.fileUri,
              title: item.title,
              poster: item.poster || '',
              progress: '0',
            },
          } as any);
        },
      });
    },
    [router]
  );

  const handleTogglePause = useCallback(async (item: DownloadItem) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (item.status === 'downloading') {
      downloadService.pauseDownload(item.id);
    } else {
      downloadService.resumeDownload(item.id);
    }
  }, []);

  const handleDeleteItem = useCallback(async (item: DownloadItem) => {
    Alert.alert(
      'Delete Download',
      `Are you sure you want to delete "${item.title}" from your device?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (await isHapticsSupported()) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
            await downloadService.deleteDownload(item.id);
          },
        },
      ]
    );
  }, []);

  const handleClearAll = useCallback(() => {
    if (downloads.length === 0) return;

    Alert.alert(
      'Clear All Downloads',
      `This will delete all ${downloads.length} YouTube downloads from your internal storage.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            if (await isHapticsSupported()) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            }
            for (const item of downloads) {
              await downloadService.deleteDownload(item.id);
            }
          },
        },
      ]
    );
  }, [downloads]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>

        <View style={styles.titleWrap}>
          <Text style={styles.headerTitle}>YouTube Downloads</Text>
          <Text style={styles.headerSubtitle}>
            {downloads.length} {downloads.length === 1 ? 'video' : 'videos'} saved
          </Text>
        </View>

        {downloads.length > 0 && (
          <TouchableOpacity
            style={styles.clearAllBtn}
            onPress={handleClearAll}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={15} color="#ff4444" style={{ marginRight: 4 }} />
            <Text style={styles.clearAllBtnText}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Storage Diagnostic Bar */}
      <View style={styles.storageBar}>
        <View style={styles.storageLeft}>
          <Ionicons name="phone-portrait-outline" size={16} color="#888888" />
          <Text style={styles.storageText}>
            Internal Storage • {downloadService.formatBytes(downloadService.getFreeDiskSpace())} free
          </Text>
        </View>
        <Text style={styles.storageCount}>
          {completedDownloads.length} ready offline
        </Text>
      </View>

      {/* Downloads Feed */}
      {downloads.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="arrow-down-circle-outline" size={54} color="#444444" />
          </View>
          <Text style={styles.emptyTitle}>No Downloads Yet</Text>
          <Text style={styles.emptySub}>
            Tap the download button on any YouTube video to save it to your device and watch offline without internet.
          </Text>
          <TouchableOpacity
            style={styles.browseButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="compass-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.browseButtonText}>Explore YouTube</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={downloads}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isCompleted = item.status === 'completed';
            const isDownloading = item.status === 'downloading';
            const isPaused = item.status === 'paused';

            return (
              <TouchableOpacity
                style={styles.downloadCard}
                activeOpacity={0.8}
                onPress={() => handlePlayDownloadedItem(item)}
              >
                {/* Thumbnail Wrap */}
                <View style={styles.thumbWrap}>
                  {item.poster ? (
                    <Image source={{ uri: item.poster }} style={styles.thumbImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.thumbFallback}>
                      <Ionicons name="film-outline" size={24} color="#666666" />
                    </View>
                  )}
                  {isCompleted ? (
                    <View style={styles.offlineBadge}>
                      <Ionicons name="checkmark-circle" size={11} color="#00e676" style={{ marginRight: 3 }} />
                      <Text style={styles.offlineBadgeText}>Offline</Text>
                    </View>
                  ) : (
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusBadgeText}>
                        {isDownloading ? 'Downloading' : isPaused ? 'Paused' : 'Error'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Details */}
                <View style={styles.cardDetails}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {downloadService.formatBytes(item.totalBytes || item.downloadedBytes)}
                    {item.fileName ? ` • ${item.fileName.split('.').pop()?.toUpperCase()}` : ''}
                  </Text>

                  {/* Active Download Progress & Speed */}
                  {!isCompleted && (
                    <View style={styles.progressSection}>
                      <View style={styles.progressBarBg}>
                        <View
                          style={[
                            styles.progressBarFill,
                            { width: `${Math.min(100, Math.max(0, item.progress || 0))}%` },
                          ]}
                        />
                      </View>
                      <View style={styles.speedRow}>
                        <Text style={styles.progressPercentText}>
                          {Math.round(item.progress || 0)}%
                        </Text>
                        <Text style={styles.speedText}>
                          {item.speedFormatted || 'Downloading...'}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Actions */}
                <View style={styles.cardActions}>
                  {!isCompleted ? (
                    <TouchableOpacity
                      style={styles.actionCircleBtn}
                      onPress={() => handleTogglePause(item)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name={isDownloading ? 'pause' : 'play'}
                        size={18}
                        color="#535aff"
                      />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.actionCircleBtn}
                      onPress={() => handlePlayDownloadedItem(item)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="play" size={18} color="#ffffff" />
                    </TouchableOpacity>
                  )}

                  {isCompleted && (
                    <TouchableOpacity
                      style={styles.actionCircleBtn}
                      onPress={() => downloadService.exportOrShareDownload(item)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="share-outline" size={17} color="#ffffff" />
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.actionCircleBtn}
                    onPress={() => handleDeleteItem(item)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={17} color="#ff4444" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    marginLeft: 8,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 68, 68, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.25)',
  },
  clearAllBtnText: {
    color: '#ff4444',
    fontSize: 12,
    fontWeight: '700',
  },
  storageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  storageLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  storageText: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '500',
  },
  storageCount: {
    color: '#00e676',
    fontSize: 11,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  downloadCard: {
    flexDirection: 'row',
    backgroundColor: '#16161a',
    borderRadius: 12,
    overflow: 'hidden',
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  thumbWrap: {
    width: 105,
    height: 64,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#222228',
    position: 'relative',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  offlineBadgeText: {
    color: '#00e676',
    fontSize: 9,
    fontWeight: '700',
  },
  statusBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(83, 90, 255, 0.85)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
  },
  cardDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  cardMeta: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    marginTop: 4,
  },
  progressSection: {
    marginTop: 6,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#535aff',
  },
  speedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 3,
  },
  progressPercentText: {
    color: '#535aff',
    fontSize: 10,
    fontWeight: '700',
  },
  speedText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 10,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  actionCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySub: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  browseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#535aff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  browseButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
