import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { youTubeHistoryService, YouTubeHistoryItem } from '@/services/YouTubeHistoryService';
import { youTubeListService } from '@/services/YouTubeListService';
import { youTubeService, YouTubeAuthStatus, YouTubeVideoItem } from '@/services/YouTubeService';
import { downloadService, DownloadItem } from '@/services/DownloadService';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface YouTubeYouScreenProps {
  authStatus?: YouTubeAuthStatus;
  onOpenAuth?: () => void;
  onLogout?: () => void;
  onOpenSearch?: () => void;
  onPlayVideo?: (video: YouTubeVideoItem) => void;
  onDownloadVideo?: (video: YouTubeVideoItem) => void;
  onOpenSettings?: () => void;
  onBackToFeed?: () => void;
  theme?: any;
}

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

export const YouTubeYouScreen: React.FC<YouTubeYouScreenProps> = ({
  authStatus: propAuthStatus,
  onOpenAuth,
  onLogout,
  onOpenSearch,
  onPlayVideo,
  onDownloadVideo,
  onOpenSettings,
  onBackToFeed,
  theme,
}) => {
  const router = useRouter();
  const [internalAuthStatus, setInternalAuthStatus] = useState<YouTubeAuthStatus>(() =>
    propAuthStatus || youTubeService.getCachedAuthStatus()
  );
  const authStatus = propAuthStatus || internalAuthStatus;

  const [historyList, setHistoryList] = useState<YouTubeHistoryItem[]>([]);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<LibraryFilterType>('Downloaded');
  const [refreshing, setRefreshing] = useState(false);

  // Selected item for 3-dots action sheet
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<YouTubeHistoryItem | null>(null);
  const [isHistoryActionSheetVisible, setIsHistoryActionSheetVisible] = useState(false);

  // Playlist view modal (for Watch History)
  const [activePlaylistTitle, setActivePlaylistTitle] = useState<string | null>(null);
  const [activePlaylistVideos, setActivePlaylistVideos] = useState<any[]>([]);
  const [isPlaylistModalVisible, setIsPlaylistModalVisible] = useState(false);

  const loadAllData = useCallback(async () => {
    try {
      const history = await youTubeHistoryService.getHistory();
      setHistoryList(history);

      const dl = downloadService.getDownloads().filter((d) => d.id.startsWith('yt_') || d.sourceType === 'direct');
      setDownloads(dl);

      if (!propAuthStatus) {
        const s = await youTubeService.getAuthStatus();
        setInternalAuthStatus(s);
      }
    } catch (err) {
      console.warn('[YouTubeYouScreen] loadAllData error:', err);
    }
  }, [propAuthStatus]);

  useEffect(() => {
    loadAllData();
    const unsubHistory = youTubeHistoryService.subscribe(() => {
      youTubeHistoryService.getHistory().then(setHistoryList);
    });
    const unsubDl = downloadService.addListener((items) => {
      setDownloads(items.filter((d) => d.id.startsWith('yt_') || d.sourceType === 'direct'));
    });
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        youTubeService.getAuthStatus().then(setInternalAuthStatus).catch(() => {});
      }
    });

    return () => {
      appStateSub.remove();
      unsubHistory();
      unsubDl();
    };
  }, [loadAllData]);

  const handleRefresh = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  };

  // Dynamic User Profile Data
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

  // Open Playlist Viewer
  const openPlaylist = (title: string, items: any[]) => {
    setActivePlaylistTitle(title);
    setActivePlaylistVideos(items);
    setIsPlaylistModalVisible(true);
  };

  // Open History 3-dots sheet
  const handleHistoryMenuPress = (item: YouTubeHistoryItem) => {
    setSelectedHistoryItem(item);
    setIsHistoryActionSheetVisible(true);
  };

  // History Actions
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
          if (onLogout) {
            onLogout();
          } else {
            try {
              await youTubeService.logout();
              if (onOpenAuth) onOpenAuth();
            } catch {}
          }
        },
      },
    ]);
  };

  // Download actions
  const handlePlayDownloadedVideo = (item: DownloadItem) => {
    if (item.status === 'completed' && item.fileUri) {
      router.push({
        pathname: '/stream/player' as any,
        params: {
          videoUrl: item.fileUri,
          title: item.title,
          poster: item.poster || '',
        },
      });
    } else if (onPlayVideo) {
      onPlayVideo({
        id: item.id.replace('yt_', ''),
        title: item.title,
        channel: 'Downloaded',
        thumbnail: item.poster || '',
      });
    }
  };

  const handlePlayDownloadedAudio = (item: DownloadItem) => {
    if (item.status === 'completed' && item.fileUri) {
      router.push({
        pathname: '/music/player' as any,
        params: {
          id: item.id,
          fileUri: item.fileUri,
          title: item.title,
          poster: item.poster || '',
        },
      });
    }
  };

  const handleTogglePause = async (item: DownloadItem) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (item.status === 'downloading') {
      downloadService.pauseDownload(item.id);
    } else {
      downloadService.resumeDownload(item.id);
    }
  };

  const handleDeleteDownload = async (item: DownloadItem) => {
    Alert.alert('Delete Download', `Delete "${item.title}" from your device?`, [
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
    ]);
  };

  const handleExportDownload = async (item: DownloadItem) => {
    await downloadService.exportOrShareDownload(item);
  };

  // Filter video vs audio downloads
  const videoDownloads = useMemo(() => {
    return downloads.filter((d) => !isAudioDownload(d));
  }, [downloads]);
  const activeVideoDownloads = useMemo(() => {
    return videoDownloads.filter((d) => d.status === 'downloading' || d.status === 'paused' || d.status === 'error');
  }, [videoDownloads]);
  const completedVideoDownloads = useMemo(() => {
    return videoDownloads.filter((d) => d.status === 'completed');
  }, [videoDownloads]);

  const musicDownloads = useMemo(() => {
    return downloads.filter((d) => isAudioDownload(d));
  }, [downloads]);
  const activeMusicDownloads = useMemo(() => {
    return musicDownloads.filter((d) => d.status === 'downloading' || d.status === 'paused' || d.status === 'error');
  }, [musicDownloads]);
  const completedMusicDownloads = useMemo(() => {
    return musicDownloads.filter((d) => d.status === 'completed');
  }, [musicDownloads]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF0000" colors={['#FF0000']} />
      }
    >
      {/* ── 1. Top Header Row (Back | Title | Settings) ── */}
      <View style={styles.topHeaderBar}>
        <View style={styles.headerLeftRow}>
          <TouchableOpacity
            style={styles.iconCircleBtn}
            onPress={async () => {
              if (await isHapticsSupported()) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              if (onBackToFeed) onBackToFeed();
              else router.back();
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={22} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitleText}>YouTube Settings</Text>
        </View>
      </View>

      {/* ── 2. Profile Card (Dynamic Authenticated vs Signed-Out) ── */}
      {authStatus.authenticated && authStatus.user ? (
        <View style={styles.profileSection}>
          <View style={styles.profileInfoRow}>
            {authStatus.user.avatar ? (
              <Image source={{ uri: authStatus.user.avatar }} style={styles.profileAvatar} />
            ) : (
              <View style={[styles.profileAvatarFallback, { backgroundColor: theme?.primary || '#FF0000' }]}>
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

          {/* Action Buttons: Switch | Google | Sign Out */}
          <View style={styles.profileButtonsRow}>
            <TouchableOpacity
              style={styles.switchAccountBtn}
              onPress={() => (onOpenAuth ? onOpenAuth() : null)}
              activeOpacity={0.8}
            >
              <Ionicons name="swap-horizontal-outline" size={15} color="#0f0f0f" style={{ marginRight: 4 }} />
              <Text style={styles.switchAccountBtnText} numberOfLines={1}>Switch</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.googleAccountBtn}
              onPress={() => (onOpenAuth ? onOpenAuth() : null)}
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
              style={styles.signInPrimaryBtn}
              onPress={async () => {
                if (await isHapticsSupported()) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                if (onOpenAuth) onOpenAuth();
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="person-circle-outline" size={18} color="#0f0f0f" style={{ marginRight: 6 }} />
              <Text style={styles.signInPrimaryBtnText}>Sign in</Text>
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
                  onPress={() => onPlayVideo && onPlayVideo(item)}
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
                      onPress={() => onPlayVideo && onPlayVideo(item)}
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

      {/* ── 4. Library Section ── */}
      <View style={[styles.sectionHeaderRow, { marginTop: 28 }]}>
        <Text style={styles.sectionTitle}>Library</Text>
      </View>

      {/* Library Filter Pills (Downloaded | Music) */}
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

      {/* ── 5. Library Items List ── */}
      <View style={styles.libraryListContainer}>
        {selectedFilter === 'Downloaded' ? (
          videoDownloads.length === 0 ? (
            <View style={styles.emptyLibraryBox}>
              <Ionicons name="cloud-download-outline" size={38} color="#555555" />
              <Text style={styles.emptyLibraryTitle}>No Video Downloads</Text>
              <Text style={styles.emptyLibrarySub}>Downloaded YouTube videos will appear here for offline viewing</Text>
            </View>
          ) : (
            <>
              {/* Active in-progress video downloads */}
              {activeVideoDownloads.length > 0 && (
                <View style={{ marginBottom: 14 }}>
                  <Text style={styles.subSectionTitle}>In Progress ({activeVideoDownloads.length})</Text>
                  {activeVideoDownloads.map((item) => (
                    <View key={item.id} style={styles.activeCard}>
                      {item.poster ? (
                        <Image source={{ uri: item.poster }} style={styles.activePoster} />
                      ) : (
                        <View style={[styles.activePoster, styles.posterFallback]}>
                          <Ionicons name="film-outline" size={24} color="#888888" />
                        </View>
                      )}
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.activeTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.activeMeta}>
                          {downloadService.formatBytes(item.downloadedBytes)} / {downloadService.formatBytes(item.totalBytes)} • {Math.round(item.progress)}%
                        </Text>
                        <View style={styles.activeBtnRow}>
                          <TouchableOpacity
                            style={[styles.smallBtn, { backgroundColor: '#333333' }]}
                            onPress={() => handleTogglePause(item)}
                          >
                            <Text style={styles.smallBtnText}>{item.status === 'downloading' ? 'Pause' : 'Resume'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.smallBtn, { backgroundColor: 'rgba(255, 69, 58, 0.2)' }]}
                            onPress={() => handleDeleteDownload(item)}
                          >
                            <Text style={[styles.smallBtnText, { color: '#ff453a' }]}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Completed video downloads */}
              {completedVideoDownloads.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={styles.libraryRowItem}
                  activeOpacity={0.7}
                  onPress={() => handlePlayDownloadedVideo(d)}
                >
                  <View style={styles.libraryThumbWrapper}>
                    {d.poster ? (
                      <Image source={{ uri: d.poster }} style={styles.libraryThumbImg} />
                    ) : (
                      <View style={[styles.libraryThumbPlaceholder, { backgroundColor: '#222222' }]}>
                        <Ionicons name="videocam" size={28} color="#FF0000" />
                      </View>
                    )}
                    <View style={styles.thumbIconBadge}>
                      <Ionicons name="checkmark-circle" size={13} color="#00e676" />
                    </View>
                  </View>
                  <View style={styles.libraryItemMeta}>
                    <Text style={styles.libraryItemTitle} numberOfLines={1}>{d.title}</Text>
                    <Text style={styles.libraryItemSubtitle}>
                      {downloadService.formatBytes(d.totalBytes || d.downloadedBytes)} • Ready to watch offline
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.rowDotsBtn}
                    onPress={() => handleExportDownload(d)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="share-outline" size={18} color="#888888" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rowDotsBtn}
                    onPress={() => handleDeleteDownload(d)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="trash-outline" size={18} color="#ff453a" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </>
          )
        ) : (
          /* MUSIC TAB */
          musicDownloads.length === 0 ? (
            <View style={styles.emptyLibraryBox}>
              <Ionicons name="musical-notes-outline" size={38} color="#555555" />
              <Text style={styles.emptyLibraryTitle}>No Music Downloads</Text>
              <Text style={styles.emptyLibrarySub}>Downloaded MP3 tracks and audio will appear here for offline listening</Text>
            </View>
          ) : (
            <>
              {/* Music Player Hero */}
              {completedMusicDownloads.length > 0 && (
                <TouchableOpacity
                  style={styles.musicHeroBanner}
                  onPress={() => handlePlayDownloadedAudio(completedMusicDownloads[0])}
                  activeOpacity={0.8}
                >
                  <View style={[styles.musicHeroIconWrap, { backgroundColor: '#FF0000' }]}>
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
                <View style={{ marginBottom: 14 }}>
                  <Text style={styles.subSectionTitle}>In Progress ({activeMusicDownloads.length})</Text>
                  {activeMusicDownloads.map((item) => (
                    <View key={item.id} style={styles.activeCard}>
                      {item.poster ? (
                        <Image source={{ uri: item.poster }} style={styles.activePoster} />
                      ) : (
                        <View style={[styles.activePoster, styles.posterFallback]}>
                          <Ionicons name="musical-notes" size={24} color="#00e5ff" />
                        </View>
                      )}
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.activeTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.activeMeta}>
                          {downloadService.formatBytes(item.downloadedBytes)} / {downloadService.formatBytes(item.totalBytes)} • {Math.round(item.progress)}%
                        </Text>
                        <View style={styles.activeBtnRow}>
                          <TouchableOpacity
                            style={[styles.smallBtn, { backgroundColor: '#333333' }]}
                            onPress={() => handleTogglePause(item)}
                          >
                            <Text style={styles.smallBtnText}>{item.status === 'downloading' ? 'Pause' : 'Resume'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.smallBtn, { backgroundColor: 'rgba(255, 69, 58, 0.2)' }]}
                            onPress={() => handleDeleteDownload(item)}
                          >
                            <Text style={[styles.smallBtnText, { color: '#ff453a' }]}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Completed music downloads */}
              {completedMusicDownloads.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={styles.libraryRowItem}
                  activeOpacity={0.7}
                  onPress={() => handlePlayDownloadedAudio(d)}
                >
                  <View style={styles.libraryThumbWrapper}>
                    {d.poster ? (
                      <Image source={{ uri: d.poster }} style={styles.libraryThumbImg} />
                    ) : (
                      <View style={[styles.libraryThumbPlaceholder, { backgroundColor: '#1a2228' }]}>
                        <Ionicons name="musical-notes" size={26} color="#00e5ff" />
                      </View>
                    )}
                    <View style={[styles.thumbIconBadge, { backgroundColor: '#00e5ff' }]}>
                      <Ionicons name="musical-note" size={11} color="#000000" />
                    </View>
                  </View>
                  <View style={styles.libraryItemMeta}>
                    <Text style={styles.libraryItemTitle} numberOfLines={1}>{d.title}</Text>
                    <Text style={styles.libraryItemSubtitle}>
                      {downloadService.formatBytes(d.totalBytes || d.downloadedBytes)} • MP3 Audio
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.rowDotsBtn}
                    onPress={() => handleExportDownload(d)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="share-outline" size={18} color="#888888" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rowDotsBtn}
                    onPress={() => handleDeleteDownload(d)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="trash-outline" size={18} color="#ff453a" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </>
          )
        )}
      </View>

      {/* ── Bottom Sheet Modal: History Item 3-Dots Actions ── */}
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
                  if (selectedHistoryItem && onPlayVideo) onPlayVideo(selectedHistoryItem);
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
                  setIsHistoryActionSheetVisible(false);
                  if (selectedHistoryItem && onDownloadVideo) onDownloadVideo(selectedHistoryItem);
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
                <Ionicons name="trash-outline" size={22} color="#ff4444" style={styles.actionSheetIcon} />
                <Text style={[styles.actionSheetRowText, { color: '#ff4444' }]}>Remove from watch history</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal: Playlist Viewer (Watch History) ── */}
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
                      if (onPlayVideo) onPlayVideo(item);
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
                        if (onPlayVideo) onPlayVideo(item);
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
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  scrollContent: {
    paddingBottom: 60,
  },
  // ── Top Bar ──
  topHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : 16,
    paddingBottom: 12,
  },
  headerLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitleText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
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
    paddingTop: 8,
    paddingBottom: 16,
  },
  profileInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
  },
  profileAvatarFallback: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarInitial: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
  },
  profileMetaBox: {
    marginLeft: 16,
    flex: 1,
  },
  profileName: {
    color: '#ffffff',
    fontSize: 22,
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
  googleAccountBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  signedOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  signedOutAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
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
    fontSize: 19,
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
    height: 38,
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
  // ── Section Headers ──
  sectionHeaderRow: {
    paddingHorizontal: 16,
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
  // ── History Carousel ──
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
  // ── Library Section ──
  filterPillsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 12,
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
  libraryListContainer: {
    paddingHorizontal: 16,
    marginTop: 6,
    gap: 12,
  },
  subSectionTitle: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  activeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  activePoster: {
    width: 60,
    height: 60,
    borderRadius: 6,
    backgroundColor: '#2a2a2a',
  },
  posterFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  activeMeta: {
    color: '#888888',
    fontSize: 11,
    marginTop: 3,
  },
  activeBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  smallBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  libraryRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    borderRadius: 10,
    padding: 10,
  },
  libraryThumbWrapper: {
    width: 100,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1e1e1e',
  },
  libraryThumbImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  libraryThumbPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbIconBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryItemMeta: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  libraryItemTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  libraryItemSubtitle: {
    color: '#aaaaaa',
    fontSize: 12,
    marginTop: 3,
  },
  rowDotsBtn: {
    padding: 8,
  },
  emptyLibraryBox: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161616',
    borderRadius: 12,
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
  },
  musicHeroBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderColor: 'rgba(0, 229, 255, 0.35)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
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
