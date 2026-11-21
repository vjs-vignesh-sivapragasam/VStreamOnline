import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Dimensions,
  ScrollView,
  RefreshControl,
  Modal,
  Alert,
  Share,
  Platform,
  ToastAndroid,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import { useTheme } from '@/hooks/useTheme';
import { useYouTubePlayer } from '@/contexts/YouTubePlayerContext';
import {
  youTubeService,
  YouTubeAuthStatus,
  YouTubeVideoItem,
  YouTubeVideoDetails,
  YouTubeFormatOption,
} from '@/services/YouTubeService';
import { youTubeHistoryService, YouTubeHistoryItem } from '@/services/YouTubeHistoryService';
import { youTubeListService, SavedYouTubeItem } from '@/services/YouTubeListService';
import { downloadService, DownloadItem, getDownloadHealth } from '@/services/DownloadService';
import { YouTubeAuthModal } from '@/components/youtube/YouTubeAuthModal';
import { QualityPickerModal } from '@/components/youtube/QualityPickerModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type LibraryFilterType = 'Downloaded' | 'Music';

const isAudioDownload = (item: DownloadItem): boolean => {
  const fileName = (item.fileName || '').toLowerCase();
  const fileUri = (item.fileUri || '').toLowerCase();
  const id = (item.id || '').toLowerCase();
  const title = (item.title || '').toLowerCase();
  return (
    fileName.endsWith('.mp3') ||
    fileName.endsWith('.m4a') ||
    fileName.endsWith('.aac') ||
    fileName.endsWith('.wav') ||
    fileName.endsWith('.flac') ||
    fileName.endsWith('.opus') ||
    fileUri.endsWith('.mp3') ||
    fileUri.endsWith('.m4a') ||
    fileUri.endsWith('.aac') ||
    id.includes('_mp3') ||
    id.includes('_audio') ||
    title.endsWith('.mp3') ||
    title.endsWith('.m4a')
  );
};

export default function YouTubeSettingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { theme } = useTheme();
  const { playVideo: playInYouTubeWatch } = useYouTubePlayer();

  // ── Auth State ──
  const [authStatus, setAuthStatus] = useState<YouTubeAuthStatus>(() => youTubeService.getCachedAuthStatus());
  const [isAuthModalVisible, setIsAuthModalVisible] = useState(false);

  // ── History & Downloads State ──
  const [historyList, setHistoryList] = useState<YouTubeHistoryItem[]>([]);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<LibraryFilterType>(() => {
    return params?.tab === 'Music' ? 'Music' : 'Downloaded';
  });
  const [refreshing, setRefreshing] = useState(false);

  // ── Modals & Sheets ──
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<YouTubeHistoryItem | null>(null);
  const [isHistoryActionSheetVisible, setIsHistoryActionSheetVisible] = useState(false);
  const [activePlaylistTitle, setActivePlaylistTitle] = useState<string | null>(null);
  const [activePlaylistVideos, setActivePlaylistVideos] = useState<any[]>([]);
  const [isPlaylistModalVisible, setIsPlaylistModalVisible] = useState(false);

  // Quality Download Modal for re-downloading from history
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [modalVideoDetails, setModalVideoDetails] = useState<YouTubeVideoDetails | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [targetVideoItem, setTargetVideoItem] = useState<YouTubeVideoItem | null>(null);

  // Load all initial data
  const loadAllData = useCallback(async () => {
    try {
      const [hist, status] = await Promise.all([
        youTubeHistoryService.getHistory(),
        youTubeService.getAuthStatus(),
      ]);
      setHistoryList(hist);
      setAuthStatus(status);
      setDownloads(downloadService.getDownloads());
    } catch (err) {
      console.warn('[YouTubeSettingsScreen] loadAllData error:', err);
    }
  }, []);

  useEffect(() => {
    loadAllData();

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        youTubeService.getAuthStatus().then(setAuthStatus).catch(() => {});
      }
    });

    const unsubHistory = youTubeHistoryService.subscribe(() => {
      youTubeHistoryService.getHistory().then(setHistoryList);
    });
    const unsubDl = downloadService.addListener((items) => {
      setDownloads(items);
    });

    return () => {
      appStateSub.remove();
      unsubHistory();
      unsubDl();
    };
  }, [loadAllData]);

  // Sync tab param if changed
  useEffect(() => {
    if (params?.tab === 'Music') {
      setSelectedFilter('Music');
    } else if (params?.tab === 'Downloaded') {
      setSelectedFilter('Downloaded');
    }
  }, [params?.tab]);

  const handleRefresh = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  };

  // User handle display
  const displayHandle = useMemo(() => {
    if (!authStatus.user) return '';
    if (authStatus.user.email) {
      const e = authStatus.user.email;
      return e.startsWith('@') ? e : `@${e.split('@')[0]}`;
    }
    if (authStatus.user.name) {
      return `@${authStatus.user.name.toLowerCase().replace(/[^a-z0-9_]/g, '')}`;
    }
    return '';
  }, [authStatus.user]);

  // Logout handler
  const handleLogoutPress = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out of your YouTube account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          if (await isHapticsSupported()) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
          try {
            await youTubeService.logout();
            const status = await youTubeService.getAuthStatus();
            setAuthStatus(status);
          } catch {}
        },
      },
    ]);
  };

  // ── History Handlers ──
  const openPlaylist = (title: string, items: any[]) => {
    setActivePlaylistTitle(title);
    setActivePlaylistVideos(items);
    setIsPlaylistModalVisible(true);
  };

  const handleHistoryMenuPress = (item: YouTubeHistoryItem) => {
    setSelectedHistoryItem(item);
    setIsHistoryActionSheetVisible(true);
  };

  const handleRemoveFromHistory = async () => {
    if (!selectedHistoryItem) return;
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    await youTubeHistoryService.removeFromHistory(selectedHistoryItem.id);
    setHistoryList((prev) => prev.filter((h) => h.id !== selectedHistoryItem.id));
    setIsHistoryActionSheetVisible(false);
  };

  const handleToggleSaveFromHistory = async () => {
    if (!selectedHistoryItem) return;
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await youTubeListService.toggleSave({
      id: selectedHistoryItem.id,
      title: selectedHistoryItem.title,
      channel: selectedHistoryItem.channel,
      thumbnail: selectedHistoryItem.thumbnail,
      duration: selectedHistoryItem.duration,
      views: selectedHistoryItem.views,
      published: selectedHistoryItem.published,
    });
    setIsHistoryActionSheetVisible(false);
  };

  const handleShareHistoryItem = async () => {
    if (!selectedHistoryItem) return;
    try {
      await Share.share({
        message: `Watch "${selectedHistoryItem.title}" on YouTube: https://youtu.be/${selectedHistoryItem.id}`,
        url: `https://youtu.be/${selectedHistoryItem.id}`,
      });
    } catch {}
    setIsHistoryActionSheetVisible(false);
  };

  const handleDownloadHistoryItem = async (item: YouTubeHistoryItem) => {
    setIsHistoryActionSheetVisible(false);
    setTargetVideoItem(item);
    setDownloadModalVisible(true);
    setModalLoading(true);
    setModalVideoDetails(null);

    try {
      const details = await youTubeService.getVideoDetails(item.id);
      setModalVideoDetails(details);
    } catch (err: any) {
      Alert.alert('Format Error', err?.message || 'Could not load formats for this video.');
      setDownloadModalVisible(false);
    } finally {
      setModalLoading(false);
    }
  };

  const handleDownloadFormat = async (format: YouTubeFormatOption) => {
    setDownloadModalVisible(false);
    if (!targetVideoItem) return;

    try {
      const isAudio = format.type === 'audio';
      const ext = isAudio ? 'mp3' : 'mp4';
      const cleanTitle = (modalVideoDetails?.title || targetVideoItem.title)
        .replace(/[^a-zA-Z0-9\s-_]/g, '')
        .trim();
      const cleanQuality = format.quality.replace(/[^a-zA-Z0-9]/g, '');
      const fileName = `${cleanTitle}_${cleanQuality}.${ext}`;
      const downloadId = `yt_${targetVideoItem.id}_${format.itag}_${ext}`;

      const downloadStreamUrl = await youTubeService.resolveDownloadStreamUrl(targetVideoItem.id, format);
      if (!downloadStreamUrl) {
        throw new Error('Unable to resolve download URL. Please try another quality.');
      }

      await downloadService.startDirectDownload({
        id: downloadId,
        title: targetVideoItem.title,
        poster: targetVideoItem.thumbnail,
        fileName,
        streamUrl: downloadStreamUrl,
        fileLength: format.contentLength,
      });

      if (Platform.OS === 'android') {
        ToastAndroid.show(`Download started (${isAudio ? 'MP3 Audio' : format.quality})`, ToastAndroid.SHORT);
      }
      if (await isHapticsSupported()) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      Alert.alert('Download Error', err?.message || 'Could not start download');
    }
  };

  // ── Download Actions ──
  const handlePlayDownloadedVideo = useCallback(
    async (item: DownloadItem) => {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      if (item.status !== 'completed' || !item.fileUri) {
        Alert.alert(
          'Download Incomplete',
          `This video is currently ${item.status} (${Math.round(item.progress || 0)}%). Please wait until download finishes.`
        );
        return;
      }

      router.push({
        pathname: '/stream/player' as any,
        params: {
          videoUrl: item.fileUri,
          title: item.title,
          poster: item.poster || '',
        },
      });
    },
    [router]
  );

  const handlePlayDownloadedAudio = useCallback(
    async (item: DownloadItem) => {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      if (item.status !== 'completed' || !item.fileUri) {
        Alert.alert(
          'Download Incomplete',
          `This track is currently ${item.status} (${Math.round(item.progress || 0)}%). Please wait until download finishes.`
        );
        return;
      }

      router.push({
        pathname: '/music/player' as any,
        params: {
          id: item.id,
          fileUri: item.fileUri,
          title: item.title,
          poster: item.poster || '',
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

  const handleDeleteDownload = useCallback(async (item: DownloadItem) => {
    Alert.alert(
      'Delete Download',
      `Delete "${item.title}" from your device storage?`,
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

  const handleExportDownload = useCallback(async (item: DownloadItem) => {
    await downloadService.exportOrShareDownload(item);
  }, []);

  // ── Filtered Download Lists ──
  const ytDownloads = useMemo(() => {
    return downloads.filter((d) => d.id.startsWith('yt_') || d.sourceType === 'direct');
  }, [downloads]);

  // Video downloads
  const videoDownloads = useMemo(() => {
    return ytDownloads.filter((d) => !isAudioDownload(d));
  }, [ytDownloads]);
  const activeVideoDownloads = useMemo(() => {
    return videoDownloads.filter((d) => d.status === 'downloading' || d.status === 'paused' || d.status === 'error');
  }, [videoDownloads]);
  const completedVideoDownloads = useMemo(() => {
    return videoDownloads.filter((d) => d.status === 'completed');
  }, [videoDownloads]);

  // Music downloads
  const musicDownloads = useMemo(() => {
    return ytDownloads.filter((d) => isAudioDownload(d));
  }, [ytDownloads]);
  const activeMusicDownloads = useMemo(() => {
    return musicDownloads.filter((d) => d.status === 'downloading' || d.status === 'paused' || d.status === 'error');
  }, [musicDownloads]);
  const completedMusicDownloads = useMemo(() => {
    return musicDownloads.filter((d) => d.status === 'completed');
  }, [musicDownloads]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      {/* ── 1. Top Header Row (Back | Title) ── */}
      <View style={styles.topHeaderBar}>
        <View style={styles.headerLeftRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={async () => {
              if (await isHapticsSupported()) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              router.back();
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitleText}>YouTube Settings</Text>
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary || '#FF0000'}
            colors={[theme.primary || '#FF0000']}
          />
        }
      >
        {/* ── 2. Profile Card (Authenticated vs Signed-Out) ── */}
        {authStatus.authenticated && authStatus.user ? (
          <View style={styles.profileSection}>
            <View style={styles.profileInfoRow}>
              {authStatus.user.avatar ? (
                <Image source={{ uri: authStatus.user.avatar }} style={styles.profileAvatar} />
              ) : (
                <View style={[styles.profileAvatarFallback, { backgroundColor: theme.primary || '#FF0000' }]}>
                  <Text style={styles.profileAvatarInitial}>
                    {(authStatus.user.name || 'Y').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}

              <View style={styles.profileMetaBox}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {authStatus.user.name || 'YouTube User'}
                </Text>
                {displayHandle ? (
                  <Text style={styles.profileHandle} numberOfLines={1}>
                    {displayHandle}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Profile Action Buttons: Switch | Google | Sign Out */}
            <View style={styles.profileButtonsRow}>
              <TouchableOpacity
                style={styles.switchAccountBtn}
                onPress={() => setIsAuthModalVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="swap-horizontal-outline" size={15} color="#0f0f0f" style={{ marginRight: 4 }} />
                <Text style={styles.switchAccountBtnText} numberOfLines={1}>Switch</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.googleAccountBtn}
                onPress={() => setIsAuthModalVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-google" size={14} color="#ffffff" style={{ marginRight: 4 }} />
                <Text style={styles.googleAccountBtnText} numberOfLines={1}>Google</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.signOutBtn}
                onPress={handleLogoutPress}
                activeOpacity={0.8}
              >
                <Ionicons name="log-out-outline" size={15} color="#ff453a" style={{ marginRight: 4 }} />
                <Text style={styles.signOutBtnText} numberOfLines={1}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.profileSection}>
            <View style={styles.signedOutRow}>
              <View style={styles.signedOutAvatar}>
                <Ionicons name="person" size={32} color="rgba(255, 255, 255, 0.75)" />
              </View>
              <View style={styles.signedOutMetaBox}>
                <Text style={styles.signedOutTitle}>Sign in to YouTube</Text>
                <Text style={styles.signedOutSubtitle}>
                  Sign in to sync your subscriptions, playlists, and recommendations
                </Text>
              </View>
            </View>

            <View style={styles.profileButtonsRow}>
              <TouchableOpacity
                style={[styles.signInPrimaryBtn, { backgroundColor: '#ffffff' }]}
                onPress={async () => {
                  if (await isHapticsSupported()) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  setIsAuthModalVisible(true);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-google" size={16} color="#EA4335" style={{ marginRight: 6 }} />
                <Text style={styles.signInPrimaryBtnText}>Sign in with Google</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── 3. History Section ── */}
        <View style={styles.sectionHeaderRow}>
          <TouchableOpacity
            style={styles.sectionTitleRow}
            activeOpacity={0.7}
            onPress={() => openPlaylist('Watch History', historyList)}
          >
            <Text style={styles.sectionTitle}>History</Text>
            {historyList.length > 0 && (
              <View style={styles.sectionCountBadge}>
                <Text style={styles.sectionCountText}>{historyList.length}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={18} color="#ffffff" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>

        {historyList.length === 0 ? (
          <View style={styles.emptyHistoryBox}>
            <Ionicons name="time-outline" size={32} color="#666666" style={{ marginBottom: 6 }} />
            <Text style={styles.emptyHistoryText}>No watch history yet</Text>
            <Text style={styles.emptyHistorySub}>Videos and Shorts you watch will appear here</Text>
          </View>
        ) : (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={historyList}
            keyExtractor={(item) => `hist_${item.id}`}
            contentContainerStyle={styles.historyCarouselContent}
            renderItem={({ item }) => {
              const isShort = !!item.isShort;
              const progressPct = typeof item.watchProgress === 'number' ? Math.max(5, item.watchProgress) : 40;

              return (
                <View style={styles.historyCardContainer}>
                  <TouchableOpacity
                    style={styles.historyThumbBox}
                    activeOpacity={0.8}
                    onPress={() => playInYouTubeWatch(item)}
                  >
                    <Image source={{ uri: item.thumbnail }} style={styles.historyThumbImg} />

                    {isShort && (
                      <View style={styles.shortsBadge}>
                        <Ionicons name="flash" size={11} color="#ffffff" />
                      </View>
                    )}

                    <View style={styles.progressBarTrack}>
                      <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
                    </View>
                  </TouchableOpacity>

                  <View style={styles.historyCardMeta}>
                    <View style={styles.historyTitleRow}>
                      <Text
                        style={styles.historyCardTitle}
                        numberOfLines={2}
                        onPress={() => playInYouTubeWatch(item)}
                      >
                        {item.title}
                      </Text>
                      <TouchableOpacity
                        style={styles.threeDotsBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        onPress={() => handleHistoryMenuPress(item)}
                      >
                        <Ionicons name="ellipsis-vertical" size={14} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.historyCardChannel} numberOfLines={1}>
                      {item.channel}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* ── 4. Library Section (Downloaded | Music) ── */}
        <View style={[styles.sectionHeaderRow, { marginTop: 28 }]}>
          <Text style={styles.sectionTitle}>Library</Text>
        </View>

        {/* Filter Pills (Downloaded | Music) */}
        <View style={styles.filterPillsRow}>
          {(['Downloaded', 'Music'] as LibraryFilterType[]).map((pill) => {
            const isSelected = selectedFilter === pill;
            const count = pill === 'Downloaded' ? videoDownloads.length : musicDownloads.length;

            return (
              <TouchableOpacity
                key={pill}
                style={[styles.filterPill, isSelected && styles.filterPillSelected]}
                onPress={async () => {
                  if (await isHapticsSupported()) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  setSelectedFilter(pill);
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={pill === 'Downloaded' ? 'film-outline' : 'musical-notes-outline'}
                  size={15}
                  color={isSelected ? '#000000' : '#ffffff'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.filterPillText, isSelected && styles.filterPillTextSelected]}>
                  {pill === 'Downloaded' ? 'Downloaded Videos' : 'Music Tracks'}
                </Text>
                {count > 0 && (
                  <View style={[styles.pillBadge, isSelected && styles.pillBadgeSelected]}>
                    <Text style={[styles.pillBadgeText, isSelected && styles.pillBadgeTextSelected]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── 5. Library Content List ── */}
        <View style={styles.libraryContentContainer}>
          {selectedFilter === 'Downloaded' ? (
            /* ── DOWNLOADED VIDEOS ── */
            videoDownloads.length === 0 ? (
              <View style={styles.emptyLibraryBox}>
                <Ionicons name="cloud-download-outline" size={44} color="#555555" />
                <Text style={styles.emptyLibraryTitle}>No Video Downloads</Text>
                <Text style={styles.emptyLibrarySub}>
                  Downloaded YouTube videos will appear here for offline viewing
                </Text>
              </View>
            ) : (
              <>
                {/* Active in-progress video downloads */}
                {activeVideoDownloads.length > 0 && (
                  <View style={styles.activeDownloadsGroup}>
                    <Text style={styles.subSectionTitle}>In Progress ({activeVideoDownloads.length})</Text>
                    {activeVideoDownloads.map((item) => {
                      const isDownloading = item.status === 'downloading';
                      const isPaused = item.status === 'paused';

                      return (
                        <View key={item.id} style={styles.activeDownloadCard}>
                          {item.poster && item.poster.trim() ? (
                            <Image source={{ uri: item.poster }} style={styles.activePoster} resizeMode="cover" />
                          ) : (
                            <View style={[styles.activePoster, styles.posterFallback]}>
                              <Ionicons name="film-outline" size={24} color="#8E8E93" />
                            </View>
                          )}

                          <View style={styles.activeInfo}>
                            <View style={styles.badgeTitleRow}>
                              <View style={[styles.typeBadge, styles.videoBadge]}>
                                <Text style={styles.videoBadgeText}>VIDEO</Text>
                              </View>
                              <Text style={styles.activeTitle} numberOfLines={1}>
                                {item.title}
                              </Text>
                            </View>

                            <View style={styles.statsRow}>
                              {isDownloading && (
                                <View style={styles.speedBadge}>
                                  <Ionicons name="flash" size={11} color="#00e676" />
                                  <Text style={styles.speedText}>{item.speedFormatted || 'Downloading...'}</Text>
                                </View>
                              )}
                              <Text style={styles.bytesText}>
                                {downloadService.formatBytes(item.downloadedBytes)} / {downloadService.formatBytes(item.totalBytes)}
                              </Text>
                            </View>

                            <View style={styles.progressRow}>
                              <View style={styles.progressBarTrackLarge}>
                                <View
                                  style={[
                                    styles.progressBarFillLarge,
                                    {
                                      width: `${Math.min(item.progress, 100)}%`,
                                      backgroundColor: isPaused ? '#ff9800' : theme.primary || '#FF0000',
                                    },
                                  ]}
                                />
                              </View>
                              <Text style={styles.progressPercentText}>{Math.round(item.progress)}%</Text>
                            </View>

                            <View style={styles.activeControlsRow}>
                              <TouchableOpacity
                                style={[styles.controlPill, isPaused ? styles.controlPillResume : { backgroundColor: theme.primary || '#FF0000' }]}
                                onPress={() => handleTogglePause(item)}
                                activeOpacity={0.7}
                              >
                                <Ionicons name={isDownloading ? 'pause' : 'play'} size={13} color="#ffffff" />
                                <Text style={styles.controlPillText}>{isDownloading ? 'Pause' : 'Resume'}</Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.cancelPill}
                                onPress={() => handleDeleteDownload(item)}
                                activeOpacity={0.7}
                              >
                                <Ionicons name="close" size={13} color="#ff4d4d" />
                                <Text style={styles.cancelPillText}>Cancel</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Completed video downloads */}
                {completedVideoDownloads.length > 0 && (
                  <View style={styles.completedListGroup}>
                    {activeVideoDownloads.length > 0 && (
                      <Text style={styles.subSectionTitle}>Completed ({completedVideoDownloads.length})</Text>
                    )}
                    {completedVideoDownloads.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.completedCard}
                        onPress={() => handlePlayDownloadedVideo(item)}
                        activeOpacity={0.75}
                      >
                        <View style={styles.completedThumbWrap}>
                          {item.poster && item.poster.trim() ? (
                            <Image source={{ uri: item.poster }} style={styles.completedThumbImage} resizeMode="cover" />
                          ) : (
                            <View style={[styles.completedThumbImage, styles.posterFallback]}>
                              <Ionicons name="logo-youtube" size={26} color="#FF0000" />
                            </View>
                          )}
                          <View style={[styles.floatingBadge, styles.videoBadge]}>
                            <Text style={styles.videoBadgeText}>MP4</Text>
                          </View>
                        </View>

                        <View style={styles.completedDetails}>
                          <Text style={styles.completedTitle} numberOfLines={2}>
                            {item.title}
                          </Text>
                          <Text style={styles.completedMeta} numberOfLines={1}>
                            {downloadService.formatBytes(item.totalBytes || item.downloadedBytes)}
                            {item.fileName ? ` • ${item.fileName.split('.').pop()?.toUpperCase()}` : ''}
                          </Text>

                          <View style={styles.cardActionsRow}>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: theme.primary || '#FF0000' }]}
                              onPress={() => handlePlayDownloadedVideo(item)}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="play" size={13} color="#ffffff" />
                              <Text style={styles.actionBtnText}>Play</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.actionBtn, styles.exportBtn]}
                              onPress={() => handleExportDownload(item)}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="share-outline" size={13} color="#ffffff" />
                              <Text style={styles.actionBtnText}>Share</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.deleteBtn}
                              onPress={() => handleDeleteDownload(item)}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="trash-outline" size={14} color="#ff453a" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )
          ) : (
            /* ── MUSIC & AUDIO TRACKS ── */
            musicDownloads.length === 0 ? (
              <View style={styles.emptyLibraryBox}>
                <Ionicons name="musical-notes-outline" size={44} color="#555555" />
                <Text style={styles.emptyLibraryTitle}>No Music Downloads</Text>
                <Text style={styles.emptyLibrarySub}>
                  Downloaded MP3 music tracks and audio will appear here for offline playback
                </Text>
              </View>
            ) : (
              <>
                {/* Offline Music Player Quick Access Hero Banner */}
                {completedMusicDownloads.length > 0 && (
                  <TouchableOpacity
                    style={styles.musicHeroBanner}
                    onPress={() => handlePlayDownloadedAudio(completedMusicDownloads[0])}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.musicHeroIconWrap, { backgroundColor: theme.primary || '#FF0000' }]}>
                      <Ionicons name="disc" size={24} color="#ffffff" />
                    </View>
                    <View style={styles.musicHeroTextWrap}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.musicHeroTitle}>Music Player</Text>
                        <View style={styles.musicHeroBadge}>
                          <Text style={styles.musicHeroBadgeText}>{completedMusicDownloads.length} Songs</Text>
                        </View>
                      </View>
                      <Text style={styles.musicHeroSub} numberOfLines={1}>
                        Play downloaded MP3 tracks with audio visualizer & background playback
                      </Text>
                    </View>
                    <Ionicons name="play-circle" size={32} color="#00e5ff" />
                  </TouchableOpacity>
                )}

                {/* Active in-progress audio downloads */}
                {activeMusicDownloads.length > 0 && (
                  <View style={styles.activeDownloadsGroup}>
                    <Text style={styles.subSectionTitle}>In Progress ({activeMusicDownloads.length})</Text>
                    {activeMusicDownloads.map((item) => {
                      const isDownloading = item.status === 'downloading';
                      const isPaused = item.status === 'paused';

                      return (
                        <View key={item.id} style={styles.activeDownloadCard}>
                          {item.poster && item.poster.trim() ? (
                            <Image source={{ uri: item.poster }} style={styles.activePoster} resizeMode="cover" />
                          ) : (
                            <View style={[styles.activePoster, styles.posterFallback]}>
                              <Ionicons name="musical-notes" size={24} color="#00e5ff" />
                            </View>
                          )}

                          <View style={styles.activeInfo}>
                            <View style={styles.badgeTitleRow}>
                              <View style={[styles.typeBadge, styles.audioBadge]}>
                                <Text style={styles.audioBadgeText}>MP3 AUDIO</Text>
                              </View>
                              <Text style={styles.activeTitle} numberOfLines={1}>
                                {item.title}
                              </Text>
                            </View>

                            <View style={styles.statsRow}>
                              {isDownloading && (
                                <View style={styles.speedBadge}>
                                  <Ionicons name="flash" size={11} color="#00e676" />
                                  <Text style={styles.speedText}>{item.speedFormatted || 'Downloading...'}</Text>
                                </View>
                              )}
                              <Text style={styles.bytesText}>
                                {downloadService.formatBytes(item.downloadedBytes)} / {downloadService.formatBytes(item.totalBytes)}
                              </Text>
                            </View>

                            <View style={styles.progressRow}>
                              <View style={styles.progressBarTrackLarge}>
                                <View
                                  style={[
                                    styles.progressBarFillLarge,
                                    {
                                      width: `${Math.min(item.progress, 100)}%`,
                                      backgroundColor: isPaused ? '#ff9800' : '#00e5ff',
                                    },
                                  ]}
                                />
                              </View>
                              <Text style={styles.progressPercentText}>{Math.round(item.progress)}%</Text>
                            </View>

                            <View style={styles.activeControlsRow}>
                              <TouchableOpacity
                                style={[styles.controlPill, isPaused ? styles.controlPillResume : { backgroundColor: '#007799' }]}
                                onPress={() => handleTogglePause(item)}
                                activeOpacity={0.7}
                              >
                                <Ionicons name={isDownloading ? 'pause' : 'play'} size={13} color="#ffffff" />
                                <Text style={styles.controlPillText}>{isDownloading ? 'Pause' : 'Resume'}</Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.cancelPill}
                                onPress={() => handleDeleteDownload(item)}
                                activeOpacity={0.7}
                              >
                                <Ionicons name="close" size={13} color="#ff4d4d" />
                                <Text style={styles.cancelPillText}>Cancel</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Completed music downloads */}
                {completedMusicDownloads.length > 0 && (
                  <View style={styles.completedListGroup}>
                    {activeMusicDownloads.length > 0 && (
                      <Text style={styles.subSectionTitle}>Completed Songs ({completedMusicDownloads.length})</Text>
                    )}
                    {completedMusicDownloads.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.completedCard}
                        onPress={() => handlePlayDownloadedAudio(item)}
                        activeOpacity={0.75}
                      >
                        <View style={styles.completedThumbWrap}>
                          {item.poster && item.poster.trim() ? (
                            <Image source={{ uri: item.poster }} style={styles.completedThumbImage} resizeMode="cover" />
                          ) : (
                            <View style={[styles.completedThumbImage, styles.posterFallback]}>
                              <Ionicons name="musical-notes" size={26} color="#00e5ff" />
                            </View>
                          )}
                          <View style={[styles.floatingBadge, styles.audioBadge]}>
                            <Text style={styles.audioBadgeText}>MP3</Text>
                          </View>
                        </View>

                        <View style={styles.completedDetails}>
                          <Text style={styles.completedTitle} numberOfLines={2}>
                            {item.title}
                          </Text>
                          <Text style={styles.completedMeta} numberOfLines={1}>
                            {downloadService.formatBytes(item.totalBytes || item.downloadedBytes)} • High Quality Audio
                          </Text>

                          <View style={styles.cardActionsRow}>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#007799' }]}
                              onPress={() => handlePlayDownloadedAudio(item)}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="play" size={13} color="#ffffff" />
                              <Text style={styles.actionBtnText}>Play</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.actionBtn, styles.exportBtn]}
                              onPress={() => handleExportDownload(item)}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="share-outline" size={13} color="#ffffff" />
                              <Text style={styles.actionBtnText}>Share</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.deleteBtn}
                              onPress={() => handleDeleteDownload(item)}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="trash-outline" size={14} color="#ff453a" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )
          )}
        </View>
      </ScrollView>

      {/* ── 6. Bottom Sheet Modal: History Item 3-Dots Actions ── */}
      <Modal
        visible={isHistoryActionSheetVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsHistoryActionSheetVisible(false)}
      >
        <View style={styles.actionSheetBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setIsHistoryActionSheetVisible(false)}
          />

          <View style={styles.actionSheetBox}>
            <View style={styles.actionSheetHandle} />

            {selectedHistoryItem && (
              <View style={styles.actionSheetHeader}>
                <Image source={{ uri: selectedHistoryItem.thumbnail }} style={styles.actionSheetThumb} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.actionSheetTitle} numberOfLines={2}>
                    {selectedHistoryItem.title}
                  </Text>
                  <Text style={styles.actionSheetSub} numberOfLines={1}>
                    {selectedHistoryItem.channel}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.actionSheetOptionsList}>
              <TouchableOpacity
                style={styles.actionSheetRow}
                onPress={() => {
                  setIsHistoryActionSheetVisible(false);
                  if (selectedHistoryItem) playInYouTubeWatch(selectedHistoryItem);
                }}
              >
                <Ionicons name="play-circle-outline" size={22} color="#ffffff" style={styles.actionSheetIcon} />
                <Text style={styles.actionSheetRowText}>Play Video</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionSheetRow} onPress={handleToggleSaveFromHistory}>
                <Ionicons name="bookmark-outline" size={22} color="#ffffff" style={styles.actionSheetIcon} />
                <Text style={styles.actionSheetRowText}>
                  {selectedHistoryItem && youTubeListService.isSaved(selectedHistoryItem.id)
                    ? 'Remove from My List'
                    : 'Save to My List'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionSheetRow}
                onPress={() => {
                  if (selectedHistoryItem) handleDownloadHistoryItem(selectedHistoryItem);
                }}
              >
                <Ionicons name="arrow-down-circle-outline" size={22} color="#ffffff" style={styles.actionSheetIcon} />
                <Text style={styles.actionSheetRowText}>Download Video</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionSheetRow} onPress={handleShareHistoryItem}>
                <Ionicons name="share-social-outline" size={22} color="#ffffff" style={styles.actionSheetIcon} />
                <Text style={styles.actionSheetRowText}>Share Link</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionSheetRow} onPress={handleRemoveFromHistory}>
                <Ionicons name="trash-outline" size={22} color="#ff453a" style={styles.actionSheetIcon} />
                <Text style={[styles.actionSheetRowText, { color: '#ff453a' }]}>Remove from watch history</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 7. Modal: Full History Viewer ── */}
      <Modal
        visible={isPlaylistModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsPlaylistModalVisible(false)}
      >
        <View style={styles.actionSheetBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setIsPlaylistModalVisible(false)}
          />

          <View style={styles.playlistModalContent}>
            <View style={styles.actionSheetHandle} />

            <View style={styles.playlistModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.playlistModalTitle}>{activePlaylistTitle}</Text>
                <Text style={styles.playlistModalCount}>{activePlaylistVideos.length} items</Text>
              </View>
              <TouchableOpacity
                style={styles.playlistModalCloseBtn}
                onPress={() => setIsPlaylistModalVisible(false)}
              >
                <Ionicons name="close" size={22} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {activePlaylistVideos.length === 0 ? (
              <View style={styles.playlistEmptyContainer}>
                <Ionicons name="folder-open-outline" size={44} color="#666666" />
                <Text style={styles.playlistEmptyText}>No videos in {activePlaylistTitle}</Text>
              </View>
            ) : (
              <FlatList
                data={activePlaylistVideos}
                keyExtractor={(item) => `pl_vid_${item.id}`}
                contentContainerStyle={{ paddingBottom: 30 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.playlistVideoRow}
                    activeOpacity={0.7}
                    onPress={() => {
                      setIsPlaylistModalVisible(false);
                      playInYouTubeWatch(item);
                    }}
                  >
                    <Image source={{ uri: item.thumbnail }} style={styles.playlistVideoThumb} />
                    <View style={styles.playlistVideoMeta}>
                      <Text style={styles.playlistVideoTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={styles.playlistVideoChannel} numberOfLines={1}>
                        {item.channel}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={{ padding: 6 }}
                      onPress={() => {
                        setIsPlaylistModalVisible(false);
                        playInYouTubeWatch(item);
                      }}
                    >
                      <Ionicons name="play-circle" size={24} color="#ffffff" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── 8. Google / YouTube Auth Modal ── */}
      <YouTubeAuthModal
        visible={isAuthModalVisible}
        onClose={() => setIsAuthModalVisible(false)}
        authStatus={authStatus}
        onAuthChange={(newStatus) => {
          setAuthStatus(newStatus);
        }}
      />

      {/* ── 9. Quality Picker Modal for Downloads ── */}
      <QualityPickerModal
        visible={downloadModalVisible}
        videoItem={targetVideoItem}
        videoDetails={modalVideoDetails}
        isLoading={modalLoading}
        onClose={() => setDownloadModalVisible(false)}
        onSelectFormat={handleDownloadFormat}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  scrollContent: {
    paddingBottom: 60,
  },
  // ── Top Header Bar ──
  topHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#0f0f0f',
  },
  headerLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f1f1f',
  },
  headerTitleText: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  iconCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f1f1f',
  },
  // ── Profile Section ──
  profileSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  profileInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  profileAvatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarInitial: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
  },
  profileMetaBox: {
    marginLeft: 16,
    flex: 1,
  },
  profileName: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  profileHandle: {
    color: '#aaaaaa',
    fontSize: 13,
    fontWeight: '400',
    marginTop: 3,
  },
  profileButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  switchAccountBtn: {
    flex: 1,
    backgroundColor: '#ffffff',
    height: 38,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchAccountBtnText: {
    color: '#0f0f0f',
    fontSize: 13,
    fontWeight: '700',
  },
  googleAccountBtn: {
    flex: 1,
    backgroundColor: '#272727',
    height: 38,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleAccountBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  signOutBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    height: 38,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutBtnText: {
    color: '#ff453a',
    fontSize: 13,
    fontWeight: '700',
  },
  signedOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  signedOutAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#272727',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signedOutMetaBox: {
    marginLeft: 14,
    flex: 1,
  },
  signedOutTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  signedOutSubtitle: {
    color: '#aaaaaa',
    fontSize: 12,
    fontWeight: '400',
    marginTop: 3,
    lineHeight: 16,
  },
  signInPrimaryBtn: {
    flex: 1,
    backgroundColor: '#ffffff',
    height: 40,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInPrimaryBtnText: {
    color: '#0f0f0f',
    fontSize: 14,
    fontWeight: '700',
  },
  // ── History Section ──
  sectionHeaderRow: {
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sectionCountBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
    marginLeft: 8,
  },
  sectionCountText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  historyCarouselContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  historyCardContainer: {
    width: 154,
  },
  historyThumbBox: {
    width: 154,
    height: 88,
    borderRadius: 10,
    backgroundColor: '#1e1e1e',
    overflow: 'hidden',
    position: 'relative',
  },
  historyThumbImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  shortsBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 6,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBarTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3.5,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FF0000',
  },
  historyCardMeta: {
    marginTop: 8,
  },
  historyTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  historyCardTitle: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  threeDotsBtn: {
    paddingLeft: 6,
    paddingTop: 1,
  },
  historyCardChannel: {
    color: '#aaaaaa',
    fontSize: 12,
    marginTop: 3,
  },
  emptyHistoryBox: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#181818',
    marginHorizontal: 16,
    borderRadius: 12,
  },
  emptyHistoryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyHistorySub: {
    color: '#888888',
    fontSize: 12,
    marginTop: 2,
  },
  // ── Library Filter Tabs ──
  filterPillsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 14,
  },
  filterPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#272727',
    paddingVertical: 10,
    borderRadius: 12,
  },
  filterPillSelected: {
    backgroundColor: '#ffffff',
  },
  filterPillText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  filterPillTextSelected: {
    color: '#0f0f0f',
  },
  pillBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 6,
  },
  pillBadgeSelected: {
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  pillBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  pillBadgeTextSelected: {
    color: '#000000',
  },
  // ── Library Content ──
  libraryContentContainer: {
    paddingHorizontal: 16,
  },
  subSectionTitle: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 6,
  },
  activeDownloadsGroup: {
    marginBottom: 16,
  },
  completedListGroup: {
    gap: 12,
  },
  emptyLibraryBox: {
    paddingVertical: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161616',
    borderRadius: 14,
    paddingHorizontal: 20,
  },
  emptyLibraryTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
  },
  emptyLibrarySub: {
    color: '#888888',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 18,
  },
  // ── Active Download Card ──
  activeDownloadCard: {
    flexDirection: 'row',
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    alignItems: 'center',
  },
  activePoster: {
    width: 78,
    height: 78,
    borderRadius: 8,
    backgroundColor: '#2c2c2e',
  },
  posterFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  badgeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  videoBadge: {
    backgroundColor: 'rgba(255, 0, 0, 0.2)',
  },
  videoBadgeText: {
    color: '#ff4444',
    fontSize: 9,
    fontWeight: '800',
  },
  audioBadge: {
    backgroundColor: 'rgba(0, 229, 255, 0.2)',
  },
  audioBadgeText: {
    color: '#00e5ff',
    fontSize: 9,
    fontWeight: '800',
  },
  activeTitle: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  speedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  speedText: {
    color: '#00e676',
    fontSize: 11,
    fontWeight: '600',
  },
  bytesText: {
    color: '#888888',
    fontSize: 11,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  progressBarTrackLarge: {
    flex: 1,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#333333',
    overflow: 'hidden',
  },
  progressBarFillLarge: {
    height: '100%',
    borderRadius: 2.5,
  },
  progressPercentText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    minWidth: 32,
    textAlign: 'right',
  },
  activeControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  controlPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 4,
  },
  controlPillResume: {
    backgroundColor: '#ff9800',
  },
  controlPillText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  cancelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 77, 77, 0.15)',
    gap: 3,
  },
  cancelPillText: {
    color: '#ff4d4d',
    fontSize: 11,
    fontWeight: '700',
  },
  // ── Completed Download Card ──
  completedCard: {
    flexDirection: 'row',
    backgroundColor: '#181818',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  completedThumbWrap: {
    width: 90,
    height: 56,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#262626',
  },
  completedThumbImage: {
    width: '100%',
    height: '100%',
  },
  floatingBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  completedDetails: {
    flex: 1,
    marginLeft: 12,
  },
  completedTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  completedMeta: {
    color: '#888888',
    fontSize: 11,
    marginTop: 3,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 4,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  exportBtn: {
    backgroundColor: '#2a2a2a',
  },
  deleteBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
  },
  // ── Music Hero Banner ──
  musicHeroBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderColor: 'rgba(0, 229, 255, 0.35)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  musicHeroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  musicHeroTextWrap: {
    flex: 1,
    marginLeft: 12,
  },
  musicHeroTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  musicHeroBadge: {
    backgroundColor: 'rgba(0, 229, 255, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  musicHeroBadgeText: {
    color: '#00e5ff',
    fontSize: 10,
    fontWeight: '700',
  },
  musicHeroSub: {
    color: '#aaaaaa',
    fontSize: 11,
    marginTop: 2,
  },
  // ── Action Sheet Modal ──
  actionSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  actionSheetBox: {
    backgroundColor: '#212121',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingTop: 10,
  },
  actionSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#555555',
    alignSelf: 'center',
    marginBottom: 12,
  },
  actionSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333333',
  },
  actionSheetThumb: {
    width: 60,
    height: 34,
    borderRadius: 6,
  },
  actionSheetTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  actionSheetSub: {
    color: '#888888',
    fontSize: 12,
    marginTop: 2,
  },
  actionSheetOptionsList: {
    paddingTop: 8,
  },
  actionSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  actionSheetIcon: {
    marginRight: 16,
    width: 24,
  },
  actionSheetRowText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
  // ── Playlist Modal ──
  playlistModalContent: {
    backgroundColor: '#1b1b1b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 30,
    paddingTop: 10,
  },
  playlistModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333333',
  },
  playlistModalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  playlistModalCount: {
    color: '#888888',
    fontSize: 13,
    marginTop: 2,
  },
  playlistModalCloseBtn: {
    padding: 6,
  },
  playlistEmptyContainer: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistEmptyText: {
    color: '#888888',
    fontSize: 14,
    marginTop: 10,
  },
  playlistVideoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  playlistVideoThumb: {
    width: 80,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#262626',
  },
  playlistVideoMeta: {
    flex: 1,
    marginLeft: 12,
  },
  playlistVideoTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  playlistVideoChannel: {
    color: '#888888',
    fontSize: 12,
    marginTop: 2,
  },
});
