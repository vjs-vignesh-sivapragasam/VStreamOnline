import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    ScrollView,
    TouchableOpacity,
    Image,
    StyleSheet,
    RefreshControl,
    FlatList,
    Animated,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StatusBar } from '@/components/Themed';
import { StorageKeys, storageService } from '@/utils/StorageService';
import BlurGradientBackground from '@/components/BlurGradientBackground';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSpacing from '@/components/BottomSpacing';
import { TorrentItem } from '@/hooks/useTamilMv';
import { confirmAction } from '@/utils/platform';
import { downloadService, DownloadItem } from '@/services/DownloadService';
import { myListService, MyListItem } from '@/services/MyListService';
import { externalPlayerService } from '@/utils/ExternalPlayerService';
import { tmdbService } from '@/services/TmdbService';

// ── Watch history shape — must match what MediaPlayerScreen writes ────────────
interface WatchHistoryItem {
    title: string;
    videoUrl: string;
    poster: string;
    progress: number;
    timestamp: number;
    isTorrent: boolean;
    allItems: TorrentItem[];
}

type LibraryTab = 'All' | 'My List' | 'Downloads' | 'History';

const CARD_SPACING = 16;

const LibraryScreen: React.FC = () => {
    const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>([]);
    const [downloads, setDownloads] = useState<DownloadItem[]>([]);
    const [myList, setMyList] = useState<MyListItem[]>([]);
    const [selectedTab, setSelectedTab] = useState<LibraryTab>('All');
    const [refreshing, setRefreshing] = useState(false);
    const animatedValues = useRef(new Map<string, Animated.Value>()).current;

    const getAnimatedValue = (key: string) => {
        if (!animatedValues.has(key)) {
            animatedValues.set(key, new Animated.Value(1));
        }
        return animatedValues.get(key)!;
    };

    useFocusEffect(
        useCallback(() => {
            loadWatchHistory();
            setDownloads(downloadService.getDownloads());
            setMyList(myListService.getMyList());
        }, [])
    );

    // Subscribe to real-time downloads & MyList updates
    useEffect(() => {
        const unsubDownloads = downloadService.addListener((items) => {
            setDownloads(items);
        });
        const unsubMyList = myListService.subscribe((items) => {
            setMyList(items);
        });
        return () => {
            unsubDownloads();
            unsubMyList();
        };
    }, []);

    // Automatically resolve missing posters for downloads in background via TMDB
    useEffect(() => {
        downloads.forEach((item) => {
            if (!item.poster || !item.poster.trim()) {
                tmdbService.getMovieFullInfo(item.title)
                    .then((info) => {
                        if (info?.posterUrl) {
                            downloadService.updateItemPoster(item.infoHash, info.posterUrl);
                        }
                    })
                    .catch(() => {});
            }
        });
    }, [downloads]);

    // ── Data ──────────────────────────────────────────────────────────────────────

    const loadWatchHistory = () => {
        try {
            const raw = storageService.getItem(StorageKeys.WATCH_HISTORY_KEY);
            if (raw) {
                const parsed: WatchHistoryItem[] = JSON.parse(raw);
                setWatchHistory(parsed.slice(0, 20));
            } else {
                setWatchHistory([]);
            }
        } catch (error) {
            console.error('Failed to load watch history:', error);
            setWatchHistory([]);
        } finally {
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadWatchHistory();
        setDownloads(downloadService.getDownloads());
        setMyList(myListService.getMyList());
    };

    // ── Clear all history ─────────────────────────────────────────────────────────

    const clearAllHistory = async () => {
        const confirmed = await confirmAction(
            'Clear All',
            'Remove all titles from your watch history?',
            'Clear All'
        );
        if (!confirmed) return;
        try {
            storageService.setItem(StorageKeys.WATCH_HISTORY_KEY, JSON.stringify([]));
            animatedValues.clear();
            setWatchHistory([]);
        } catch (error) {
            console.error('Failed to clear watch history:', error);
        }
    };

    // ── Remove from history ───────────────────────────────────────────────────────

    const removeFromHistory = (videoUrl: string) => {
        const animValue = getAnimatedValue(videoUrl);

        Animated.parallel([
            Animated.timing(animValue, {
                toValue: 0,
                duration: 280,
                useNativeDriver: true,
            }),
        ]).start(() => {
            try {
                const raw = storageService.getItem(StorageKeys.WATCH_HISTORY_KEY);
                if (!raw) return;
                const parsed: WatchHistoryItem[] = JSON.parse(raw);
                const updated = parsed.filter(item => item.videoUrl !== videoUrl);
                storageService.setItem(StorageKeys.WATCH_HISTORY_KEY, JSON.stringify(updated));
                animatedValues.delete(videoUrl);
                setWatchHistory(updated.slice(0, 20));
            } catch (error) {
                console.error('Failed to remove from history:', error);
            }
        });
    };

    // ── Navigation ────────────────────────────────────────────────────────────────

    const handleHistoryItemPress = (item: WatchHistoryItem) => {
        if (item.isTorrent && item.allItems.length > 0) {
            router.push({
                pathname: '/torrent/details' as any,
                params: {
                    title: item.title,
                    poster: item.poster,
                    allItems: JSON.stringify(item.allItems),
                },
            });
        } else {
            router.push({
                pathname: '/stream/player' as any,
                params: {
                    videoUrl: item.videoUrl,
                    title: item.title,
                    poster: item.poster,
                    progress: item.progress,
                },
            });
        }
    };

    // ── Download actions ─────────────────────────────────────────────────────────

    const handleDownloadItemPress = (item: DownloadItem) => {
        if (item.status === 'completed') {
            // Prompt user with Internal player, VLC, MX Player, or system chooser
            externalPlayerService.promptPlayerSelection({
                fileUri: item.fileUri,
                title: item.title,
                poster: item.poster,
                fileLength: item.totalBytes,
                onPlayInternal: () => {
                    router.push({
                        pathname: '/stream/player' as any,
                        params: {
                            videoUrl: item.fileUri,
                            title: item.title,
                            poster: item.poster,
                        },
                    });
                },
            });
        } else if (item.status === 'downloading') {
            downloadService.pauseDownload(item.id);
        } else if (item.status === 'paused' || item.status === 'error') {
            downloadService.resumeDownload(item.id);
        }
    };

    const handleDeleteDownload = async (item: DownloadItem) => {
        const confirmed = await confirmAction(
            'Delete Download',
            `Delete "${item.title}" from internal storage to free up space?`,
            'Delete'
        );
        if (confirmed) {
            await downloadService.deleteDownload(item.id);
        }
    };

    // ── My List actions ──────────────────────────────────────────────────────────

    const handlePlayMyListItem = (item: MyListItem) => {
        if (item.allItems && item.allItems.length > 0) {
            const streams = item.allItems.map((t) => ({
                name: t.title,
                title: t.title,
                infoHash: t.infoHash,
                fileIdx: 0,
            }));
            router.push({
                pathname: '/stream/player' as any,
                params: {
                    streams: JSON.stringify(streams),
                    selectedStreamIndex: '0',
                    title: item.title,
                    poster: item.poster,
                    allItems: JSON.stringify(item.allItems),
                },
            });
        } else if (item.infoHash) {
            const streams = [
                {
                    name: item.title,
                    title: item.title,
                    infoHash: item.infoHash,
                    fileIdx: 0,
                },
            ];
            router.push({
                pathname: '/stream/player' as any,
                params: {
                    streams: JSON.stringify(streams),
                    selectedStreamIndex: '0',
                    title: item.title,
                    poster: item.poster,
                },
            });
        } else {
            handleMyListItemDetails(item);
        }
    };

    const handleMyListItemDetails = (item: MyListItem) => {
        router.push({
            pathname: '/torrent/details' as any,
            params: {
                guid: item.guid,
                groupid: item.groupid,
                title: item.title,
                magnetUrl: item.magnetUrl,
                infoHash: item.infoHash,
                poster: item.poster,
                publishDate: item.publishDate,
                type: item.type,
                allItems: item.allItems && item.allItems.length > 0 ? JSON.stringify(item.allItems) : undefined,
            },
        });
    };

    const handleRemoveFromMyList = async (item: MyListItem) => {
        const confirmed = await confirmAction(
            'Remove from My List',
            `Remove "${item.title}" from your list?`,
            'Remove'
        );
        if (confirmed) {
            await myListService.removeFromMyList(item.id || item.title);
        }
    };

    // ── Empty states ─────────────────────────────────────────────────────────────

    const renderEmpty = () => {
        let iconName: keyof typeof Ionicons.glyphMap = 'time-outline';
        let title = 'Nothing Here Yet';
        let description = 'Titles you start watching will appear here so you can pick up where you left off.';

        if (selectedTab === 'My List') {
            iconName = 'bookmark-outline';
            title = 'Your List is Empty';
            description = 'Add preferred movies to your list using the bookmark button on any movie poster or details page to play them directly anytime without searching.';
        } else if (selectedTab === 'Downloads') {
            iconName = 'cloud-download-outline';
            title = 'No Downloads Yet';
            description = 'Tap the download button on any movie in the details screen to save it internally and watch offline.';
        }

        return (
            <View style={styles.emptyContainer}>
                <Ionicons name={iconName} size={72} color="#535aff" />
                <Text style={styles.emptyTitle}>{title}</Text>
                <Text style={styles.emptyText}>{description}</Text>
            </View>
        );
    };

    // Filter downloads into active (in-progress/paused) and completed
    const activeDownloads = downloads.filter((d) => d.status === 'downloading' || d.status === 'paused' || d.status === 'error');
    const completedDownloads = downloads.filter((d) => d.status === 'completed');

    // ── Active Downloads Section (with speed, peers, kbs & progress bar) ─────────

    const renderActiveDownloads = () => {
        if (activeDownloads.length === 0) return null;

        return (
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleRow}>
                        <Ionicons name="arrow-down-circle" size={20} color="#535aff" />
                        <Text style={styles.sectionTitle}>Active Downloads</Text>
                        <View style={styles.countBadge}>
                            <Text style={styles.countBadgeText}>{activeDownloads.length}</Text>
                        </View>
                    </View>
                    <Text style={styles.storageInfoText}>
                        {downloadService.formatBytes(downloadService.getFreeDiskSpace())} free
                    </Text>
                </View>

                <View style={styles.activeDownloadsContainer}>
                    {activeDownloads.map((item) => {
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
                                    <Text style={styles.activeTitle} numberOfLines={1}>
                                        {item.title}
                                    </Text>

                                    {/* Stats: Speed (KB/s / MB/s), Peers, Downloaded / Total */}
                                    <View style={styles.statsRow}>
                                        {isDownloading && (
                                            <View style={styles.speedBadge}>
                                                <Ionicons name="flash" size={11} color="#00e676" />
                                                <Text style={styles.speedText}>
                                                    {item.speedFormatted || '0 KB/s'}
                                                </Text>
                                            </View>
                                        )}

                                        {item.peers !== undefined && item.peers > 0 && (
                                            <View style={styles.peersBadge}>
                                                <Ionicons name="people" size={11} color="#535aff" />
                                                <Text style={styles.peersText}>{item.peers} peers</Text>
                                            </View>
                                        )}

                                        <Text style={styles.bytesText}>
                                            {downloadService.formatBytes(item.downloadedBytes)} / {downloadService.formatBytes(item.totalBytes)}
                                        </Text>
                                    </View>

                                    {/* Detailed Progress Bar */}
                                    <View style={styles.progressRow}>
                                        <View style={styles.progressBarTrackLarge}>
                                            <View
                                                style={[
                                                    styles.progressBarFillLarge,
                                                    {
                                                        width: `${Math.min(item.progress, 100)}%`,
                                                        backgroundColor: isPaused ? '#ff9800' : '#535aff',
                                                    },
                                                ]}
                                            />
                                        </View>
                                        <Text style={styles.progressPercentText}>{item.progress}%</Text>
                                    </View>

                                    {item.statusDetail ? (
                                        <Text
                                            style={[
                                                styles.statusDetailText,
                                                item.status === 'error' && { color: '#ff453a' },
                                            ]}
                                            numberOfLines={1}
                                        >
                                            {item.status === 'error' ? `⚠️ ${item.statusDetail}` : item.statusDetail}
                                        </Text>
                                    ) : null}

                                    {/* Controls: Pause / Resume / Cancel */}
                                    <View style={styles.activeControlsRow}>
                                        <TouchableOpacity
                                            style={[styles.controlPill, isPaused && styles.controlPillResume]}
                                            onPress={() => isDownloading ? downloadService.pauseDownload(item.id) : downloadService.resumeDownload(item.id)}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons
                                                name={isDownloading ? 'pause' : 'play'}
                                                size={13}
                                                color="#ffffff"
                                            />
                                            <Text style={styles.controlPillText}>
                                                {isDownloading ? 'Pause' : 'Resume'}
                                            </Text>
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
            </View>
        );
    };

    // ── Completed Downloads Section (Offline Ready) ──────────────────────────────

    const renderCompletedDownloads = () => {
        if (completedDownloads.length === 0) return null;

        return (
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleRow}>
                        <Ionicons name="checkmark-circle" size={20} color="#00e676" />
                        <Text style={styles.sectionTitle}>Completed Downloads</Text>
                        <View style={[styles.countBadge, { backgroundColor: 'rgba(0, 230, 118, 0.15)' }]}>
                            <Text style={[styles.countBadgeText, { color: '#00e676' }]}>
                                {completedDownloads.length}
                            </Text>
                        </View>
                    </View>
                </View>

                <FlatList
                    data={completedDownloads}
                    keyExtractor={(item) => item.id}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={[styles.flatListContent, { gap: CARD_SPACING }]}
                    renderItem={({ item }) => {
                        return (
                            <TouchableOpacity
                                style={styles.posterCard}
                                onPress={() => handleDownloadItemPress(item)}
                                activeOpacity={0.75}
                            >
                                <View style={styles.posterImageWrap}>
                                    <Image
                                        source={{ uri: item.poster }}
                                        style={styles.posterImage}
                                        resizeMode="cover"
                                    />

                                    {/* Offline Ready Badge */}
                                    <View style={styles.offlineReadyBadge}>
                                        <Ionicons name="checkmark-circle" size={12} color="#00e676" />
                                        <Text style={styles.offlineReadyText}>Offline</Text>
                                    </View>

                                    {/* Play with External App (VLC, MX, etc.) */}
                                    <TouchableOpacity
                                        style={styles.externalPlayerButton}
                                        onPress={(e) => {
                                            e.stopPropagation();
                                            handleDownloadItemPress(item);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons name="open-outline" size={12} color="#ffffff" />
                                    </TouchableOpacity>

                                    {/* Delete Button */}
                                    <TouchableOpacity
                                        style={styles.removeButton}
                                        onPress={(e) => {
                                            e.stopPropagation();
                                            handleDeleteDownload(item);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons name="trash-outline" size={12} color="#fff" />
                                    </TouchableOpacity>
                                </View>

                                <Text style={styles.posterTitle} numberOfLines={2}>
                                    {item.title}
                                </Text>
                                <Text style={styles.downloadSizeText}>
                                    {downloadService.formatBytes(item.totalBytes || item.downloadedBytes)}
                                </Text>
                            </TouchableOpacity>
                        );
                    }}
                />
            </View>
        );
    };

    // ── Continue Watching ─────────────────────────────────────────────────────────

    const renderContinueWatching = () => {
        if (watchHistory.length === 0) {
            if (selectedTab === 'History') return renderEmpty();
            return null;
        }

        return (
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleRow}>
                        <Ionicons name="time-outline" size={20} color="#ffffff" />
                        <Text style={styles.sectionTitle}>Continue Watching</Text>
                    </View>
                    <View style={styles.sectionHeaderRight}>
                        <TouchableOpacity
                            style={styles.clearAllButton}
                            onPress={clearAllHistory}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="trash-outline" size={13} color="#ff4d4d" />
                            <Text style={styles.clearAllText}>Clear All</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <FlatList
                    data={watchHistory}
                    keyExtractor={(item) => item.videoUrl}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={[styles.flatListContent, { gap: CARD_SPACING }]}
                    renderItem={({ item }) => {
                        const animValue = getAnimatedValue(item.videoUrl);
                        return (
                            <Animated.View
                                style={{
                                    opacity: animValue,
                                    transform: [{ scale: animValue }],
                                }}
                            >
                                <TouchableOpacity
                                    style={styles.posterCard}
                                    onPress={() => handleHistoryItemPress(item)}
                                    activeOpacity={0.75}
                                >
                                    <View style={styles.posterImageWrap}>
                                        <Image
                                            source={{ uri: item.poster }}
                                            style={styles.posterImage}
                                            resizeMode="cover"
                                        />
                                        {item.isTorrent && (
                                            <View style={styles.torrentBadge}>
                                                <Ionicons name="magnet-outline" size={10} color="#535aff" />
                                            </View>
                                        )}
                                        <TouchableOpacity
                                            style={styles.removeButton}
                                            onPress={(e) => {
                                                e.stopPropagation();
                                                removeFromHistory(item.videoUrl);
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons name="close" size={12} color="#fff" />
                                        </TouchableOpacity>
                                        <View style={styles.progressBarTrack}>
                                            <View
                                                style={[
                                                    styles.progressBarFill,
                                                    { width: `${Math.min(item.progress, 100)}%` },
                                                ]}
                                            />
                                        </View>
                                    </View>
                                    <Text style={styles.posterTitle} numberOfLines={2}>
                                        {item.title}
                                    </Text>
                                </TouchableOpacity>
                            </Animated.View>
                        );
                    }}
                />
            </View>
        );
    };

    // ── My List Section ──────────────────────────────────────────────────────────

    const renderMyList = () => {
        if (selectedTab === 'My List' && myList.length === 0) {
            return renderEmpty();
        }
        if (myList.length === 0) return null;

        if (selectedTab === 'My List') {
            // Full detailed list view when "My List" tab is selected
            return (
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <View style={styles.sectionTitleRow}>
                            <Ionicons name="bookmark" size={20} color="#535aff" />
                            <Text style={styles.sectionTitle}>My List</Text>
                            <View style={styles.countBadge}>
                                <Text style={styles.countBadgeText}>{myList.length}</Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.myListVerticalContainer}>
                        {myList.map((item) => (
                            <View key={item.id} style={styles.myListCardDetailed}>
                                <TouchableOpacity
                                    onPress={() => handleMyListItemDetails(item)}
                                    activeOpacity={0.8}
                                    style={styles.myListPosterWrap}
                                >
                                    <Image
                                        source={{ uri: item.poster }}
                                        style={styles.myListPoster}
                                        resizeMode="cover"
                                    />
                                    {item.type && (
                                        <View style={styles.myListTypeBadge}>
                                            <Text style={styles.myListTypeBadgeText}>
                                                {item.type === 'series' ? 'Series' : 'Movie'}
                                            </Text>
                                        </View>
                                    )}
                                </TouchableOpacity>

                                <View style={styles.myListInfo}>
                                    <TouchableOpacity
                                        onPress={() => handleMyListItemDetails(item)}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={styles.myListTitle} numberOfLines={2}>
                                            {item.title}
                                        </Text>
                                    </TouchableOpacity>

                                    <View style={styles.myListMetaRow}>
                                        {item.allItems && item.allItems.length > 0 && (
                                            <View style={styles.myListQualityPill}>
                                                <Ionicons name="layers-outline" size={12} color="#8E8E93" style={{ marginRight: 4 }} />
                                                <Text style={styles.myListQualityPillText}>
                                                    {item.allItems.length} {item.allItems.length === 1 ? 'quality' : 'qualities'}
                                                </Text>
                                            </View>
                                        )}
                                        {item.publishDate ? (
                                            <Text style={styles.myListDateText}>
                                                {item.publishDate.split('T')[0] || item.publishDate}
                                            </Text>
                                        ) : null}
                                    </View>

                                    {/* Action buttons: Play Directly & Remove */}
                                    <View style={styles.myListActionsRow}>
                                        <TouchableOpacity
                                            style={styles.directPlayButton}
                                            onPress={() => handlePlayMyListItem(item)}
                                            activeOpacity={0.8}
                                        >
                                            <Ionicons name="play" size={14} color="#ffffff" style={{ marginRight: 6 }} />
                                            <Text style={styles.directPlayButtonText}>Play Directly</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={styles.myListDetailsBtn}
                                            onPress={() => handleMyListItemDetails(item)}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons name="options-outline" size={14} color="rgba(255,255,255,0.7)" />
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={styles.myListRemoveBtn}
                                            onPress={() => handleRemoveFromMyList(item)}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons name="trash-outline" size={14} color="#ff4d4d" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </View>
                </View>
            );
        }

        // Horizontal Carousel when "All" tab is selected
        return (
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleRow}>
                        <Ionicons name="bookmark" size={20} color="#535aff" />
                        <Text style={styles.sectionTitle}>My List</Text>
                        <View style={styles.countBadge}>
                            <Text style={styles.countBadgeText}>{myList.length}</Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        style={styles.seeAllButton}
                        onPress={() => setSelectedTab('My List')}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.seeAllText}>See All</Text>
                        <Ionicons name="chevron-forward" size={14} color="#535aff" />
                    </TouchableOpacity>
                </View>

                <FlatList
                    data={myList}
                    keyExtractor={(item) => item.id}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={[styles.flatListContent, { gap: CARD_SPACING }]}
                    renderItem={({ item }) => (
                        <View style={styles.posterCard}>
                            <TouchableOpacity
                                style={styles.posterImageWrap}
                                onPress={() => handleMyListItemDetails(item)}
                                activeOpacity={0.8}
                            >
                                {item.poster && item.poster.trim() ? (
                                    <Image
                                        source={{ uri: item.poster }}
                                        style={styles.posterImage}
                                        resizeMode="cover"
                                    />
                                ) : (
                                    <View style={[styles.posterImage, styles.posterFallback]}>
                                        <Ionicons name="film-outline" size={32} color="#8E8E93" />
                                    </View>
                                )}

                                {/* 1-Tap Play Overlay */}
                                <TouchableOpacity
                                    style={styles.playOverlayButton}
                                    onPress={(e) => {
                                        e.stopPropagation();
                                        handlePlayMyListItem(item);
                                    }}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons name="play" size={14} color="#ffffff" />
                                </TouchableOpacity>

                                {/* Remove Button */}
                                <TouchableOpacity
                                    style={styles.removeButton}
                                    onPress={(e) => {
                                        e.stopPropagation();
                                        handleRemoveFromMyList(item);
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <Ionicons name="trash-outline" size={12} color="#fff" />
                                </TouchableOpacity>

                                {item.allItems && item.allItems.length > 1 && (
                                    <View style={styles.torrentBadge}>
                                        <Text style={styles.variantBadgeText}>
                                            {item.allItems.length}Q
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => handleMyListItemDetails(item)}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.posterTitle} numberOfLines={2}>
                                    {item.title}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                />
            </View>
        );
    };

    // ── Root ──────────────────────────────────────────────────────────────────────

    const showMyList = selectedTab === 'All' || selectedTab === 'My List';
    const showDownloads = selectedTab === 'All' || selectedTab === 'Downloads';
    const showHistory = selectedTab === 'All' || selectedTab === 'History';
    const isTotallyEmpty = myList.length === 0 && downloads.length === 0 && watchHistory.length === 0;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar />
            <BlurGradientBackground />

            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Library</Text>
                <Text style={styles.headerSubtitle}>
                    {myList.length} in list • {downloads.length} {downloads.length === 1 ? 'download' : 'downloads'} •{' '}
                    {watchHistory.length} watched
                </Text>

                {/* Filter Tabs */}
                <View style={styles.tabRow}>
                    {(['All', 'My List', 'Downloads', 'History'] as LibraryTab[]).map((tab) => {
                        const isSelected = selectedTab === tab;
                        const count =
                            tab === 'My List'
                                ? myList.length
                                : tab === 'Downloads'
                                ? downloads.length
                                : tab === 'History'
                                ? watchHistory.length
                                : null;

                        return (
                            <TouchableOpacity
                                key={tab}
                                style={[styles.tabPill, isSelected && styles.tabPillActive]}
                                onPress={() => setSelectedTab(tab)}
                                activeOpacity={0.75}
                            >
                                <Text
                                    style={[
                                        styles.tabPillText,
                                        isSelected && styles.tabPillTextActive,
                                    ]}
                                >
                                    {tab}
                                    {count !== null && count > 0 ? ` (${count})` : ''}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#535aff"
                        colors={['#535aff']}
                    />
                }
            >
                {isTotallyEmpty ? (
                    renderEmpty()
                ) : (
                    <>
                        {showMyList && renderMyList()}
                        {showDownloads && renderActiveDownloads()}
                        {showDownloads && renderCompletedDownloads()}
                        {showDownloads && downloads.length === 0 && selectedTab === 'Downloads' && renderEmpty()}
                        {showHistory && renderContinueWatching()}
                    </>
                )}
                <BottomSpacing space={100} />
            </ScrollView>
        </SafeAreaView>
    );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 10,
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: '700',
        letterSpacing: 0.5,
        marginBottom: 4,
        color: '#fff',
    },
    headerSubtitle: {
        fontSize: 14,
        opacity: 0.6,
        color: '#fff',
        marginBottom: 14,
    },

    // ── Tab filter pills ─────────────────────────────────────────────────────────
    tabRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 4,
    },
    tabPill: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    tabPillActive: {
        backgroundColor: '#535aff',
    },
    tabPillText: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.7)',
    },
    tabPillTextActive: {
        color: '#ffffff',
    },

    // ── Section ──────────────────────────────────────────────────────────────────
    section: {
        marginTop: 20,
        marginBottom: 10,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        marginBottom: 12,
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
    },
    countBadge: {
        backgroundColor: '#535aff30',
        borderRadius: 10,
        paddingHorizontal: 7,
        paddingVertical: 2,
    },
    countBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#7b82ff',
    },
    storageInfoText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
    },
    sectionHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    clearAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        backgroundColor: 'rgba(255,77,77,0.12)',
    },
    clearAllText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#ff4d4d',
    },
    seeAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        paddingVertical: 4,
        paddingHorizontal: 6,
    },
    seeAllText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#535aff',
    },
    flatListContent: {
        paddingHorizontal: 16,
        marginVertical: 10,
    },

    // ── Active Downloads Cards (Speed, Peers, Detailed Progress) ─────────────────
    activeDownloadsContainer: {
        paddingHorizontal: 16,
        gap: 12,
        marginVertical: 6,
    },
    activeDownloadCard: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14,
        padding: 12,
        gap: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    activePoster: {
        width: 60,
        height: 90,
        borderRadius: 8,
        backgroundColor: '#101010',
    },
    posterFallback: {
        backgroundColor: '#1c1c1e',
        justifyContent: 'center',
        alignItems: 'center',
    },
    activeInfo: {
        flex: 1,
        justifyContent: 'space-between',
    },
    activeTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#ffffff',
        letterSpacing: -0.2,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        marginVertical: 4,
    },
    speedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: 'rgba(0, 230, 118, 0.15)',
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    speedText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#00e676',
    },
    peersBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: 'rgba(83, 90, 255, 0.2)',
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    peersText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#7b82ff',
    },
    bytesText: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.5)',
    },
    progressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginVertical: 2,
    },
    progressBarTrackLarge: {
        flex: 1,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.12)',
        overflow: 'hidden',
    },
    progressBarFillLarge: {
        height: '100%',
        borderRadius: 3,
    },
    progressPercentText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#ffffff',
        width: 32,
        textAlign: 'right',
    },
    statusDetailText: {
        fontSize: 11,
        color: '#8E8E93',
        marginTop: 3,
        marginBottom: 2,
    },
    activeControlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
    },
    controlPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#535aff',
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    controlPillResume: {
        backgroundColor: '#ff9800',
    },
    controlPillText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#ffffff',
    },
    cancelPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(255, 77, 77, 0.15)',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    cancelPillText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#ff4d4d',
    },

    // ── Poster card ───────────────────────────────────────────────────────────────
    posterCard: {
        width: 100,
        backgroundColor: 'transparent',
    },
    posterImageWrap: {
        width: 100,
        height: 150,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: '#101010',
    },
    posterImage: {
        width: '100%',
        height: '100%',
    },
    offlineReadyBadge: {
        position: 'absolute',
        bottom: 8,
        left: 6,
        right: 6,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        backgroundColor: 'rgba(0,0,0,0.8)',
        borderRadius: 6,
        paddingVertical: 3,
        paddingHorizontal: 5,
        borderWidth: 1,
        borderColor: 'rgba(0, 230, 118, 0.4)',
    },
    offlineReadyText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#00e676',
    },
    torrentBadge: {
        position: 'absolute',
        top: 6,
        left: 6,
        backgroundColor: 'rgba(0,0,0,0.7)',
        borderRadius: 8,
        padding: 3,
    },
    removeButton: {
        position: 'absolute',
        top: 6,
        right: 6,
        backgroundColor: 'rgba(0,0,0,0.7)',
        borderRadius: 8,
        padding: 4,
    },
    externalPlayerButton: {
        position: 'absolute',
        top: 6,
        left: 6,
        backgroundColor: 'rgba(0,0,0,0.7)',
        borderRadius: 8,
        padding: 4,
    },
    downloadSizeText: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 2,
        paddingHorizontal: 2,
    },
    progressBarTrack: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#535aff',
        borderRadius: 2,
    },
    posterTitle: {
        fontSize: 12,
        fontWeight: '500',
        color: '#fff',
        marginTop: 6,
        paddingHorizontal: 2,
        lineHeight: 16,
        opacity: 0.85,
    },

    // ── My List Specific Styles ───────────────────────────────────────────────────
    playOverlayButton: {
        position: 'absolute',
        bottom: 8,
        right: 8,
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#535aff',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 3,
        elevation: 4,
    },
    variantBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#7b82ff',
    },
    myListVerticalContainer: {
        paddingHorizontal: 16,
        gap: 12,
        marginVertical: 6,
    },
    myListCardDetailed: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14,
        padding: 12,
        gap: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    myListPosterWrap: {
        width: 76,
        height: 114,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: '#101010',
    },
    myListPoster: {
        width: '100%',
        height: '100%',
    },
    myListTypeBadge: {
        position: 'absolute',
        bottom: 4,
        left: 4,
        backgroundColor: 'rgba(0,0,0,0.75)',
        borderRadius: 4,
        paddingHorizontal: 4,
        paddingVertical: 1,
    },
    myListTypeBadgeText: {
        fontSize: 9,
        fontWeight: '600',
        color: '#ffffff',
        textTransform: 'uppercase',
    },
    myListInfo: {
        flex: 1,
        justifyContent: 'space-between',
    },
    myListTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#ffffff',
        letterSpacing: -0.2,
    },
    myListMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginVertical: 4,
    },
    myListQualityPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 6,
    },
    myListQualityPillText: {
        fontSize: 11,
        color: '#8E8E93',
    },
    myListDateText: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
    },
    myListActionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 6,
    },
    directPlayButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#535aff',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 8,
    },
    directPlayButtonText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#ffffff',
    },
    myListDetailsBtn: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    myListRemoveBtn: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: 'rgba(255,77,77,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // ── Empty ─────────────────────────────────────────────────────────────────────
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
        paddingHorizontal: 40,
    },
    emptyTitle: {
        fontSize: 22,
        fontWeight: '500',
        marginTop: 20,
        marginBottom: 8,
        color: '#fff',
    },
    emptyText: {
        fontSize: 14,
        opacity: 0.6,
        textAlign: 'center',
        lineHeight: 20,
        color: '#fff',
    },
});

export default LibraryScreen;
