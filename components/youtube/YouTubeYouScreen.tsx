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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { youTubeHistoryService, YouTubeHistoryItem } from '@/services/YouTubeHistoryService';
import { youTubeListService, SavedYouTubeItem } from '@/services/YouTubeListService';
import { youTubeService, YouTubeAuthStatus, YouTubeVideoItem } from '@/services/YouTubeService';
import { downloadService, DownloadItem } from '@/services/DownloadService';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface YouTubeYouScreenProps {
  authStatus: YouTubeAuthStatus;
  onOpenAuth: () => void;
  onLogout?: () => void;
  onOpenSearch: () => void;
  onPlayVideo: (video: YouTubeVideoItem) => void;
  onDownloadVideo: (video: YouTubeVideoItem) => void;
  onOpenSettings?: () => void;
  onBackToFeed?: () => void;
  theme: any;
}

type LibraryFilterType = 'Recent' | 'Downloaded' | 'Playlists' | 'Music';

export const YouTubeYouScreen: React.FC<YouTubeYouScreenProps> = ({
  authStatus,
  onOpenAuth,
  onLogout,
  onOpenSearch,
  onPlayVideo,
  onDownloadVideo,
  onOpenSettings,
  onBackToFeed,
  theme,
}) => {
  const [historyList, setHistoryList] = useState<YouTubeHistoryItem[]>([]);
  const [likedList, setLikedList] = useState<SavedYouTubeItem[]>([]);
  const [savedShortsList, setSavedShortsList] = useState<SavedYouTubeItem[]>([]);
  const [myList, setMyList] = useState<SavedYouTubeItem[]>([]);
  const [downloadedList, setDownloadedList] = useState<DownloadItem[]>([]);
  const [onlinePlaylists, setOnlinePlaylists] = useState<any[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<LibraryFilterType>('Recent');
  const [refreshing, setRefreshing] = useState(false);

  // Selected item for 3-dots action sheet
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<YouTubeHistoryItem | null>(null);
  const [isHistoryActionSheetVisible, setIsHistoryActionSheetVisible] = useState(false);

  // Playlist view modal (for Liked Videos, Saved Shorts, or My List)
  const [activePlaylistTitle, setActivePlaylistTitle] = useState<string | null>(null);
  const [activePlaylistVideos, setActivePlaylistVideos] = useState<any[]>([]);
  const [isPlaylistModalVisible, setIsPlaylistModalVisible] = useState(false);

  const loadAllData = useCallback(async () => {
    try {
      const history = await youTubeHistoryService.getHistory();
      setHistoryList(history);

      const liked = youTubeHistoryService.getLikedVideos();
      setLikedList(liked);

      const shorts = youTubeHistoryService.getSavedShorts();
      setSavedShortsList(shorts);

      const saved = youTubeListService.getSavedList();
      setMyList(saved);

      const dl = downloadService.getDownloads().filter((d) => d.id.startsWith('yt_') || d.sourceType === 'direct');
      setDownloadedList(dl);

      if (authStatus.authenticated) {
        const playlists = await youTubeService.getPlaylistsFeed();
        setOnlinePlaylists(playlists);
      }
    } catch (err) {
      console.warn('[YouTubeYouScreen] loadAllData error:', err);
    }
  }, [authStatus.authenticated]);

  useEffect(() => {
    loadAllData();
    const unsubHistory = youTubeHistoryService.subscribe(() => {
      loadAllData();
    });
    const unsubList = youTubeListService.subscribe((list) => {
      setMyList(list);
    });
    const unsubDl = downloadService.addListener((items) => {
      setDownloadedList(items.filter((d) => d.id.startsWith('yt_') || d.sourceType === 'direct'));
    });

    return () => {
      unsubHistory();
      unsubList();
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

  // First thumbnail helpers for playlists
  const likedThumbnail = likedList[0]?.thumbnail || historyList[0]?.thumbnail || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400';
  const shortsThumbnail = savedShortsList[0]?.thumbnail || historyList.find((h) => h.isShort)?.thumbnail || 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=400';
  const myListThumbnail = myList[0]?.thumbnail || historyList[1]?.thumbnail || 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=400';

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
              onOpenAuth();
            } catch {}
          }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF0000" colors={['#FF0000']} />
      }
    >
      {/* ── 1. Top Header Row (Accounts v | Bell 9+ | Search | Settings) ── */}
      <View style={styles.topHeaderBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {onBackToFeed && (
            <TouchableOpacity
              style={styles.iconCircleBtn}
              onPress={async () => {
                if (await isHapticsSupported()) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                onBackToFeed();
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="arrow-back" size={22} color="#ffffff" />
            </TouchableOpacity>
          )}

          {/* Left: Accounts Dropdown Button */}
          <TouchableOpacity
            style={styles.accountsBtn}
          onPress={async () => {
            if (await isHapticsSupported()) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            onOpenAuth();
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.accountsBtnText}>
            {authStatus.authenticated ? 'Accounts' : 'Sign in'}
          </Text>
          <Ionicons name="chevron-down" size={14} color="#ffffff" style={{ marginLeft: 5 }} />
        </TouchableOpacity>
        </View>

        {/* Right Action Icons: Notifications (9+), Search, Settings */}
        <View style={styles.topHeaderRightIcons}>
          {/* Notifications with badge */}
          <TouchableOpacity
            style={styles.iconCircleBtn}
            activeOpacity={0.7}
            onPress={() => {}}
          >
            <Ionicons name="notifications-outline" size={21} color="#ffffff" />
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>9+</Text>
            </View>
          </TouchableOpacity>

          {/* Search */}
          <TouchableOpacity
            style={styles.iconCircleBtn}
            onPress={onOpenSearch}
            activeOpacity={0.7}
          >
            <Ionicons name="search-outline" size={21} color="#ffffff" />
          </TouchableOpacity>

          {/* Settings */}
          <TouchableOpacity
            style={styles.iconCircleBtn}
            onPress={() => {
              if (onOpenSettings) onOpenSettings();
              else onOpenAuth();
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="settings-outline" size={21} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 2. Profile Card (Dynamic Authenticated vs Signed-Out) ── */}
      {authStatus.authenticated && authStatus.user ? (
        <View style={styles.profileSection}>
          <View style={styles.profileInfoRow}>
            {/* Circular Avatar */}
            {authStatus.user.avatar ? (
              <Image source={{ uri: authStatus.user.avatar }} style={styles.profileAvatar} />
            ) : (
              <View style={[styles.profileAvatarFallback, { backgroundColor: theme.primary || '#FF0000' }]}>
                <Text style={styles.profileAvatarInitial}>
                  {(authStatus.user.name || 'Y').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}

            {/* Dynamic Name & Handle */}
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

          {/* Action Buttons: Switch account | Google Account | Sign Out */}
          <View style={styles.profileButtonsRow}>
            <TouchableOpacity
              style={styles.switchAccountBtn}
              onPress={onOpenAuth}
              activeOpacity={0.8}
            >
              <Ionicons name="swap-horizontal-outline" size={15} color="#0f0f0f" style={{ marginRight: 4 }} />
              <Text style={styles.switchAccountBtnText} numberOfLines={1}>Switch</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.googleAccountBtn}
              onPress={onOpenAuth}
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
                onOpenAuth();
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
                {/* Thumbnail Container */}
                <TouchableOpacity
                  style={styles.historyThumbBox}
                  activeOpacity={0.8}
                  onPress={() => onPlayVideo(item)}
                >
                  <Image source={{ uri: item.thumbnail }} style={styles.historyThumbImg} />

                  {/* Shorts Icon Badge on bottom-right of thumbnail */}
                  {isShort && (
                    <View style={styles.shortsBadge}>
                      <Ionicons name="flash" size={11} color="#ffffff" />
                    </View>
                  )}

                  {/* Red Watch Progress Bar at Bottom of Thumbnail */}
                  <View style={styles.progressBarTrack}>
                    <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
                  </View>
                </TouchableOpacity>

                {/* Details below Thumbnail: Title, 3-dots, Channel */}
                <View style={styles.historyCardMeta}>
                  <View style={styles.historyTitleRow}>
                    <Text
                      style={styles.historyCardTitle}
                      numberOfLines={2}
                      onPress={() => onPlayVideo(item)}
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

      {/* Library Filter Pills (Recent v | Downloaded | Playlists | Music) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterPillsContent}
        style={styles.filterPillsScroll}
      >
        {(['Recent', 'Downloaded', 'Playlists', 'Music'] as LibraryFilterType[]).map((pill) => {
          const isSelected = selectedFilter === pill;
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
              <Text style={[styles.filterPillText, isSelected && styles.filterPillTextSelected]}>
                {pill}
              </Text>
              {pill === 'Recent' && (
                <Ionicons
                  name="chevron-down"
                  size={12}
                  color={isSelected ? '#000000' : '#ffffff'}
                  style={{ marginLeft: 4 }}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── 5. Library Items List ── */}
      <View style={styles.libraryListContainer}>
        {/* If Downloaded filter is selected */}
        {selectedFilter === 'Downloaded' ? (
          downloadedList.length === 0 ? (
            <View style={styles.emptyLibraryBox}>
              <Ionicons name="cloud-download-outline" size={38} color="#555555" />
              <Text style={styles.emptyLibraryTitle}>No Downloads</Text>
              <Text style={styles.emptyLibrarySub}>Downloaded YouTube videos will appear here for offline viewing</Text>
            </View>
          ) : (
            downloadedList.map((d) => (
              <TouchableOpacity
                key={d.id}
                style={styles.libraryRowItem}
                activeOpacity={0.7}
                onPress={() => {
                  onPlayVideo({
                    id: d.id.replace('yt_', ''),
                    title: d.title,
                    channel: 'Downloaded',
                    thumbnail: d.streamUrl || '',
                  });
                }}
              >
                <View style={styles.libraryThumbWrapper}>
                  <View style={[styles.libraryThumbPlaceholder, { backgroundColor: '#222222' }]}>
                    <Ionicons name="videocam" size={28} color="#FF0000" />
                  </View>
                  <View style={styles.thumbIconBadge}>
                    <Ionicons name="checkmark-circle" size={13} color="#00e676" />
                  </View>
                </View>
                <View style={styles.libraryItemMeta}>
                  <Text style={styles.libraryItemTitle} numberOfLines={1}>{d.title}</Text>
                  <Text style={styles.libraryItemSubtitle}>Downloaded · Ready to watch offline</Text>
                </View>
                <Ionicons name="ellipsis-vertical" size={18} color="#888888" />
              </TouchableOpacity>
            ))
          )
        ) : (
          <>
            {/* 1. Liked videos */}
            <TouchableOpacity
              style={styles.libraryRowItem}
              activeOpacity={0.7}
              onPress={() => openPlaylist('Liked videos', likedList.length > 0 ? likedList : historyList.slice(0, 5))}
            >
              <View style={styles.libraryThumbWrapper}>
                <Image source={{ uri: likedThumbnail }} style={styles.libraryThumbImg} />
                <View style={styles.thumbIconBadge}>
                  <Ionicons name="thumbs-up" size={12} color="#ffffff" />
                </View>
              </View>
              <View style={styles.libraryItemMeta}>
                <Text style={styles.libraryItemTitle} numberOfLines={1}>Liked videos</Text>
                <Text style={styles.libraryItemSubtitle}>
                  Private {likedList.length > 0 ? `· ${likedList.length} videos` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.rowDotsBtn}
                onPress={() => openPlaylist('Liked videos', likedList.length > 0 ? likedList : historyList.slice(0, 5))}
              >
                <Ionicons name="ellipsis-vertical" size={18} color="#888888" />
              </TouchableOpacity>
            </TouchableOpacity>

            {/* 2. Saved Shorts */}
            <TouchableOpacity
              style={styles.libraryRowItem}
              activeOpacity={0.7}
              onPress={() => openPlaylist('Saved Shorts', savedShortsList.length > 0 ? savedShortsList : historyList.filter((h) => h.isShort))}
            >
              <View style={styles.libraryThumbWrapper}>
                <Image source={{ uri: shortsThumbnail }} style={styles.libraryThumbImg} />
                <View style={styles.thumbIconBadge}>
                  <Ionicons name="flash" size={12} color="#ffffff" />
                </View>
              </View>
              <View style={styles.libraryItemMeta}>
                <Text style={styles.libraryItemTitle} numberOfLines={1}>Saved Shorts</Text>
                <Text style={styles.libraryItemSubtitle}>
                  Private {savedShortsList.length > 0 ? `· ${savedShortsList.length} shorts` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.rowDotsBtn}
                onPress={() => openPlaylist('Saved Shorts', savedShortsList.length > 0 ? savedShortsList : historyList.filter((h) => h.isShort))}
              >
                <Ionicons name="ellipsis-vertical" size={18} color="#888888" />
              </TouchableOpacity>
            </TouchableOpacity>

            {/* 3. My List / Custom Playlists */}
            <TouchableOpacity
              style={styles.libraryRowItem}
              activeOpacity={0.7}
              onPress={() => openPlaylist('My List', myList)}
            >
              <View style={styles.libraryThumbWrapper}>
                <Image source={{ uri: myListThumbnail }} style={styles.libraryThumbImg} />
                <View style={styles.thumbIconBadge}>
                  <Ionicons name="bookmark" size={12} color="#ffffff" />
                </View>
              </View>
              <View style={styles.libraryItemMeta}>
                <Text style={styles.libraryItemTitle} numberOfLines={1}>My List</Text>
                <Text style={styles.libraryItemSubtitle}>
                  Private · {myList.length} {myList.length === 1 ? 'video' : 'videos'}
                </Text>
              </View>
              <TouchableOpacity style={styles.rowDotsBtn} onPress={() => openPlaylist('My List', myList)}>
                <Ionicons name="ellipsis-vertical" size={18} color="#888888" />
              </TouchableOpacity>
            </TouchableOpacity>

            {/* 4. Google Account Playlists (if any) */}
            {onlinePlaylists.map((pl, idx) => (
              <TouchableOpacity
                key={pl.id || `pl_${idx}`}
                style={styles.libraryRowItem}
                activeOpacity={0.7}
                onPress={() => {
                  youTubeService.searchWithContinuation(pl.title || 'Playlist').then((res) => {
                    openPlaylist(pl.title || 'Playlist', res.videos);
                  });
                }}
              >
                <View style={styles.libraryThumbWrapper}>
                  {pl.thumbnail ? (
                    <Image source={{ uri: pl.thumbnail }} style={styles.libraryThumbImg} />
                  ) : (
                    <View style={[styles.libraryThumbPlaceholder, { backgroundColor: '#1E1E1E' }]}>
                      <Ionicons name="list" size={24} color="#ffffff" />
                    </View>
                  )}
                  <View style={styles.thumbIconBadge}>
                    <Ionicons name="list" size={12} color="#ffffff" />
                  </View>
                </View>
                <View style={styles.libraryItemMeta}>
                  <Text style={styles.libraryItemTitle} numberOfLines={1}>{pl.title}</Text>
                  <Text style={styles.libraryItemSubtitle}>Public · Playlist</Text>
                </View>
                <Ionicons name="ellipsis-vertical" size={18} color="#888888" />
              </TouchableOpacity>
            ))}
          </>
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
                  if (selectedHistoryItem) onPlayVideo(selectedHistoryItem);
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
                  if (selectedHistoryItem) onDownloadVideo(selectedHistoryItem);
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

      {/* ── Modal: Playlist Viewer (Liked Videos, Saved Shorts, My List) ── */}
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
                      onPlayVideo(item);
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
                        onPlayVideo(item);
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
  accountsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#272727',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  accountsBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  topHeaderRightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notifBadge: {
    position: 'absolute',
    top: 2,
    right: 1,
    backgroundColor: '#cc0000',
    borderRadius: 9,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
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
  viewChannelBtn: {
    flex: 1,
    backgroundColor: '#ffffff',
    height: 38,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewChannelBtnText: {
    color: '#0f0f0f',
    fontSize: 13,
    fontWeight: '700',
  },
  getPremiumBtn: {
    flex: 1,
    backgroundColor: '#272727',
    height: 38,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  getPremiumBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
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
  filterPillsScroll: {
    maxHeight: 46,
    marginBottom: 8,
  },
  filterPillsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#272727',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
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
  libraryListContainer: {
    paddingHorizontal: 16,
    marginTop: 10,
    gap: 14,
  },
  libraryRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  libraryThumbWrapper: {
    width: 138,
    height: 78,
    borderRadius: 10,
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
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryItemMeta: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  libraryItemTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  libraryItemSubtitle: {
    color: '#aaaaaa',
    fontSize: 13,
    marginTop: 3,
  },
  rowDotsBtn: {
    padding: 8,
  },
  emptyLibraryBox: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
