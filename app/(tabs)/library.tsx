import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    ScrollView,
    TouchableOpacity,
    Image,
    StyleSheet,
    RefreshControl,
    FlatList,
    Animated,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StatusBar } from '@/components/Themed';
import { StorageKeys, storageService } from '@/utils/StorageService';
import BlurGradientBackground from '@/components/BlurGradientBackground';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSpacing from '@/components/BottomSpacing';
import { TorrentItem } from '@/hooks/useTamilMv';
import { confirmAction } from '@/utils/platform';
import { downloadService, DownloadItem, getDownloadHealth } from '@/services/DownloadService';
import { myListService, MyListItem } from '@/services/MyListService';
import { externalPlayerService } from '@/utils/ExternalPlayerService';
import { tmdbService } from '@/services/TmdbService';
import { useTheme } from '@/contexts/ThemeContext';

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

type LibraryTab = 'All' | 'Movies' | 'Downloads' | 'YouTube' | 'History';

const CARD_SPACING = 16;

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

const LibraryScreen: React.FC = () => {
    const { theme } = useTheme();
    const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>([]);
    const [downloads, setDownloads] = useState<DownloadItem[]>([]);
    const [myList, setMyList] = useState<MyListItem[]>([]);

    const [selectedTab, setSelectedTab] = useState<LibraryTab>('All');
    const [refreshing, setRefreshing] = useState(false);
    const animatedValues = useRef(new Map<string, Animated.Value>()).current;

    const params = useLocalSearchParams<{ tab?: string }>();

    useEffect(() => {
        if (params?.tab === 'YouTube') {
            setSelectedTab('YouTube');
        } else if (params?.tab === 'Downloads') {
            setSelectedTab('Downloads');
        }
    }, [params?.tab]);

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
    // ONLY for torrent items that have an infoHash and are not YouTube items, and only when item count changes
    useEffect(() => {
        downloads.forEach((item) => {
            if (item.infoHash && item.sourceType !== 'direct' && !item.id.startsWith('yt_') && (!item.poster || !item.poster.trim())) {
                tmdbService.getMovieFullInfo(item.title)
                    .then((info) => {
                        if (info?.posterUrl) {
                            downloadService.updateItemPoster(item.infoHash, info.posterUrl);
                        }
                    })
                    .catch(() => {});
            }
        });
    }, [downloads.length]);

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
            if (isAudioDownload(item)) {
                router.push({
                    pathname: '/music/player' as any,
                    params: {
                        id: item.id,
                        fileUri: item.fileUri,
                        title: item.title,
                        poster: item.poster,
                    },
                });
                return;
            }
            // Directly start in-app player immediately - no modal selection popup!
            router.push({
                pathname: '/stream/player' as any,
                params: {
                    videoUrl: item.fileUri,
                    title: item.title,
                    poster: item.poster,
                },
            });
            return;
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

    const handleExportDownload = async (item: DownloadItem) => {
        await downloadService.exportOrShareDownload(item);
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

        if (selectedTab === 'Movies') {
            iconName = 'bookmark-outline';
            title = 'Your Movie List is Empty';
            description = 'Add preferred movies and series to your list using the bookmark button on any movie poster or details page to play them directly anytime.';
        } else if (selectedTab === 'Downloads') {
            iconName = 'cloud-download-outline';
            title = 'No Downloads Yet';
            description = 'Tap the download button on any movie to save it internally and watch offline.';
        } else if (selectedTab === 'YouTube') {
            iconName = 'logo-youtube';
            title = 'No YouTube Downloads Yet';
            description = 'Downloaded YouTube videos and MP3 audio tracks will appear here for offline playback.';
        }

        return (
            <View style={styles.emptyContainer}>
                <Ionicons name={iconName} size={72} color={theme.primary} />
                <Text style={styles.emptyTitle}>{title}</Text>
                <Text style={styles.emptyText}>{description}</Text>
            </View>
        );
    };

    // Filter downloads into Torrent (TamilMV) and YouTube downloads
    const torrentDownloads = downloads.filter((d) => d.sourceType === 'torrent' || (!d.id.startsWith('yt_') && d.sourceType !== 'direct'));
    const youtubeDownloads = downloads.filter((d) => d.id.startsWith('yt_') || d.sourceType === 'direct');

    const activeTorrentDownloads = torrentDownloads.filter((d) => d.status === 'downloading' || d.status === 'paused' || d.status === 'error');
    const completedTorrentDownloads = torrentDownloads.filter((d) => d.status === 'completed');

    const activeYouTubeDownloads = youtubeDownloads.filter((d) => d.status === 'downloading' || d.status === 'paused' || d.status === 'error');
    const completedYouTubeDownloads = youtubeDownloads.filter((d) => d.status === 'completed');

    // Backward-compat aliases
    const activeDownloads = activeTorrentDownloads;
    const completedDownloads = completedTorrentDownloads;

    // ── Active Downloads Section (with speed, peers, kbs & progress bar) ─────────

    const renderActiveDownloads = () => {
        if (activeDownloads.length === 0) return null;

        return (
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleRow}>
                        <Ionicons name="arrow-down-circle" size={20} color={theme.primary} />
                        <Text style={styles.sectionTitle}>Active Downloads</Text>
                        <View style={[styles.countBadge, { backgroundColor: theme.primary + '30' }]}>
                            <Text style={[styles.countBadgeText, { color: theme.primaryLight || theme.primary }]}>{activeDownloads.length}</Text>
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
                                                <Ionicons name="people" size={11} color={theme.primary} />
                                                <Text style={styles.peersText}>{item.peers} peers</Text>
                                            </View>
                                        )}

                                        {isDownloading && (() => {
                                            const health = getDownloadHealth(item.peers || 0, item.speedBps || 0, false);
                                            return (
                                                <View style={[styles.healthBadgeMini, { backgroundColor: health.bgColor, borderColor: health.color }]}>
                                                    <View style={[styles.healthDotMini, { backgroundColor: health.color }]} />
                                                    <Text style={[styles.healthBadgeText, { color: health.color }]}>{health.label}</Text>
                                                </View>
                                            );
                                        })()}

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
                                                        backgroundColor: isPaused ? '#ff9800' : theme.primary,
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
                                            style={[styles.controlPill, isPaused ? styles.controlPillResume : { backgroundColor: theme.primary }]}
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

                                    {/* Export / Share Button (Save to Files / Gallery) */}
                                    <TouchableOpacity
                                        style={styles.exportShareButton}
                                        onPress={(e) => {
                                            e.stopPropagation();
                                            handleExportDownload(item);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons name="share-outline" size={12} color="#ffffff" />
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

    // ── Dedicated YouTube Downloads Section ───────────────────────────────────────

    const renderYouTubeDownloads = () => {
        if (youtubeDownloads.length === 0) {
            if (selectedTab === 'YouTube') return renderEmpty();
            return null;
        }

        return (
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleRow}>
                        <Ionicons name="logo-youtube" size={20} color="#FF0000" />
                        <Text style={styles.sectionTitle}>YouTube Downloads</Text>
                        <View style={[styles.countBadge, { backgroundColor: 'rgba(255, 0, 0, 0.15)' }]}>
                            <Text style={[styles.countBadgeText, { color: '#ff4444' }]}>{youtubeDownloads.length}</Text>
                        </View>
                    </View>
                    <Text style={styles.storageInfoText}>
                        {downloadService.formatBytes(downloadService.getFreeDiskSpace())} free
                    </Text>
                </View>


                {/* Offline Music Player Quick Access Banner */}
                {downloads.filter((d) => d.status === 'completed' && isAudioDownload(d)).length > 0 && (
                    <TouchableOpacity
                        style={[
                            styles.musicHeroBanner,
                            {
                                borderColor: theme.cardBorder || 'rgba(0, 229, 255, 0.35)',
                                backgroundColor: theme.iconBg || 'rgba(0, 229, 255, 0.08)',
                            },
                        ]}
                        onPress={() => {
                            const firstSong = downloads.find((d) => d.status === 'completed' && isAudioDownload(d));
                            if (firstSong) {
                                router.push({
                                    pathname: '/music/player' as any,
                                    params: {
                                        id: firstSong.id,
                                        fileUri: firstSong.fileUri,
                                        title: firstSong.title,
                                        poster: firstSong.poster,
                                    },
                                });
                            }
                        }}
                        activeOpacity={0.8}
                    >
                        <View style={[styles.musicHeroIconWrap, { backgroundColor: theme.primary }]}>
                            <Ionicons name="disc" size={24} color="#ffffff" />
                        </View>
                        <View style={styles.musicHeroTextWrap}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={styles.musicHeroTitle}>Music Player</Text>
                                <View style={styles.musicHeroBadge}>
                                    <Text style={styles.musicHeroBadgeText}>
                                        {downloads.filter((d) => d.status === 'completed' && isAudioDownload(d)).length} Songs
                                    </Text>
                                </View>
                            </View>
                            <Text style={styles.musicHeroSub}>
                                Play downloaded MP3 tracks with audio visualizer & background playback
                            </Text>
                        </View>
                        <Ionicons name="play-circle" size={34} color={theme.primaryLight || '#00e5ff'} />
                    </TouchableOpacity>
                )}

                {/* Active in-progress YouTube downloads */}
                {activeYouTubeDownloads.length > 0 && (
                    <View style={styles.activeDownloadsContainer}>
                        {activeYouTubeDownloads.map((item) => {
                            const isDownloading = item.status === 'downloading';
                            const isPaused = item.status === 'paused';
                            const isAudio = isAudioDownload(item);

                            return (
                                <View key={item.id} style={styles.activeDownloadCard}>
                                    {item.poster && item.poster.trim() ? (
                                        <Image source={{ uri: item.poster }} style={styles.activePoster} resizeMode="cover" />
                                    ) : (
                                        <View style={[styles.activePoster, styles.posterFallback]}>
                                            <Ionicons name={isAudio ? 'musical-notes' : 'film-outline'} size={24} color="#8E8E93" />
                                        </View>
                                    )}

                                    <View style={styles.activeInfo}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <View style={[styles.ytTypeBadge, isAudio ? styles.ytAudioBadge : styles.ytVideoBadge]}>
                                                <Text style={[styles.ytTypeBadgeText, isAudio && { color: '#00e5ff' }]}>
                                                    {isAudio ? 'MP3 AUDIO' : 'VIDEO'}
                                                </Text>
                                            </View>
                                            <Text style={[styles.activeTitle, { flex: 1 }]} numberOfLines={1}>
                                                {item.title}
                                            </Text>
                                        </View>

                                        {/* Speed and Progress */}
                                        <View style={styles.statsRow}>
                                            {isDownloading && (
                                                <View style={styles.speedBadge}>
                                                    <Ionicons name="flash" size={11} color="#00e676" />
                                                    <Text style={styles.speedText}>{item.speedFormatted || 'Downloading...'}</Text>
                                                </View>
                                            )}
                                            {isDownloading && (() => {
                                                const health = getDownloadHealth(item.peers || 28, item.speedBps || 0, true);
                                                return (
                                                    <View style={[styles.healthBadgeMini, { backgroundColor: health.bgColor, borderColor: health.color }]}>
                                                        <View style={[styles.healthDotMini, { backgroundColor: health.color }]} />
                                                        <Text style={[styles.healthBadgeText, { color: health.color }]}>{health.label}</Text>
                                                    </View>
                                                );
                                            })()}
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
                                                            backgroundColor: isPaused ? '#ff9800' : isAudio ? '#00e5ff' : theme.primary,
                                                        },
                                                    ]}
                                                />
                                            </View>
                                            <Text style={styles.progressPercentText}>{item.progress}%</Text>
                                        </View>

                                        {item.statusDetail ? (
                                            <Text style={[styles.statusDetailText, item.status === 'error' && { color: '#ff453a' }]} numberOfLines={1}>
                                                {item.status === 'error' ? `⚠️ ${item.statusDetail}` : item.statusDetail}
                                            </Text>
                                        ) : null}

                                        {/* Controls */}
                                        <View style={styles.activeControlsRow}>
                                            <TouchableOpacity
                                                style={[styles.controlPill, isPaused ? styles.controlPillResume : { backgroundColor: isAudio ? '#007799' : theme.primary }]}
                                                onPress={() => isDownloading ? downloadService.pauseDownload(item.id) : downloadService.resumeDownload(item.id)}
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

                {/* Completed YouTube downloads list */}
                {completedYouTubeDownloads.length > 0 && (
                    <View style={styles.ytCompletedList}>
                        {completedYouTubeDownloads.map((item) => {
                            const isAudio = item.fileName?.endsWith('.mp3') || item.fileName?.endsWith('.m4a');

                            return (
                                <TouchableOpacity
                                    key={item.id}
                                    style={styles.ytDownloadCard}
                                    onPress={() => handleDownloadItemPress(item)}
                                    activeOpacity={0.75}
                                >
                                    <View style={styles.ytThumbWrap}>
                                        {item.poster ? (
                                            <Image source={{ uri: item.poster }} style={styles.ytThumbImage} resizeMode="cover" />
                                        ) : (
                                            <View style={[styles.ytThumbImage, styles.posterFallback]}>
                                                <Ionicons name={isAudio ? 'musical-notes' : 'logo-youtube'} size={24} color="#8E8E93" />
                                            </View>
                                        )}
                                        <View style={[styles.ytTypeBadgeFloating, isAudio ? styles.ytAudioBadge : styles.ytVideoBadge]}>
                                            <Text style={[styles.ytTypeBadgeText, isAudio && { color: '#00e5ff' }]}>
                                                {isAudio ? 'MP3' : 'MP4'}
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={styles.ytCardDetails}>
                                        <Text style={styles.ytCardTitle} numberOfLines={2}>
                                            {item.title}
                                        </Text>
                                        <Text style={styles.ytCardMeta} numberOfLines={1}>
                                            {downloadService.formatBytes(item.totalBytes || item.downloadedBytes)}
                                            {item.fileName ? ` • ${item.fileName.split('.').pop()?.toUpperCase()}` : ''}
                                        </Text>

                                        {/* Action Buttons: Play, Export/Share, Delete */}
                                        <View style={styles.ytCardActionsRow}>
                                            <TouchableOpacity
                                                style={[styles.ytActionBtn, { backgroundColor: isAudio ? '#007799' : theme.primary }]}
                                                onPress={() => handleDownloadItemPress(item)}
                                                activeOpacity={0.7}
                                            >
                                                <Ionicons name="play" size={13} color="#ffffff" />
                                                <Text style={styles.ytActionBtnText}>Play</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[styles.ytActionBtn, styles.ytExportBtn]}
                                                onPress={() => handleExportDownload(item)}
                                                activeOpacity={0.7}
                                            >
                                                <Ionicons name="share-outline" size={13} color="#ffffff" />
                                                <Text style={styles.ytActionBtnText}>Share / Save</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={styles.ytDeleteBtn}
                                                onPress={() => handleDeleteDownload(item)}
                                                activeOpacity={0.7}
                                            >
                                                <Ionicons name="trash-outline" size={15} color="#ff4d4d" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}
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
                                                <Ionicons name="magnet-outline" size={10} color={theme.primary} />
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
                                                    { width: `${Math.min(item.progress, 100)}%`, backgroundColor: theme.primary },
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

    // ── My List Section (Movies & Series) ───────────────────────────────────────

    const renderMyList = () => {
        if (selectedTab === 'Movies' && myList.length === 0) {
            return renderEmpty();
        }
        if (myList.length === 0) return null;

        if (selectedTab === 'Movies') {
            // Full detailed list view when "Movies" tab is selected
            return (
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <View style={styles.sectionTitleRow}>
                            <Ionicons name="bookmark" size={20} color={theme.primary} />
                            <Text style={styles.sectionTitle}>Movies & Series</Text>
                            <View style={[styles.countBadge, { backgroundColor: theme.primary + '30' }]}>
                                <Text style={[styles.countBadgeText, { color: theme.primaryLight || theme.primary }]}>{myList.length}</Text>
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
                                            style={[styles.directPlayButton, { backgroundColor: theme.primary }]}
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
                        <Ionicons name="bookmark" size={20} color={theme.primary} />
                        <Text style={styles.sectionTitle}>Movies & Series</Text>
                        <View style={[styles.countBadge, { backgroundColor: theme.primary + '30' }]}>
                            <Text style={[styles.countBadgeText, { color: theme.primaryLight || theme.primary }]}>{myList.length}</Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        style={styles.seeAllButton}
                        onPress={() => setSelectedTab('Movies')}
                        activeOpacity={0.7}
                    >
                        <Text style={[styles.seeAllText, { color: theme.primary }]}>See All</Text>
                        <Ionicons name="chevron-forward" size={14} color={theme.primary} />
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

    const showMovies = selectedTab === 'All' || selectedTab === 'Movies';
    const showDownloads = selectedTab === 'All' || selectedTab === 'Downloads';
    const showYouTube = selectedTab === 'All' || selectedTab === 'YouTube';
    const showHistory = selectedTab === 'All' || selectedTab === 'History';
    const isTotallyEmpty =
        myList.length === 0 &&
        downloads.length === 0 &&
        watchHistory.length === 0;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar />
            <BlurGradientBackground />

            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Library</Text>
                <Text style={styles.headerSubtitle}>
                    {myList.length} {myList.length === 1 ? 'movie' : 'movies'} • {downloads.length} {downloads.length === 1 ? 'download' : 'downloads'} •{' '}
                    {watchHistory.length} watched
                </Text>

                {/* Filter Tabs - Horizontally Scrollable */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.tabScrollView}
                    contentContainerStyle={styles.tabRow}
                >
                    {(['All', 'Movies', 'Downloads', 'YouTube', 'History'] as LibraryTab[]).map((tab) => {
                        const isSelected = selectedTab === tab;
                        const count =
                            tab === 'Movies'
                                ? myList.length
                                : tab === 'Downloads'
                                ? torrentDownloads.length
                                : tab === 'YouTube'
                                ? youtubeDownloads.length
                                : tab === 'History'
                                ? watchHistory.length
                                : null;

                        const iconName =
                            tab === 'All'
                                ? 'grid-outline'
                                : tab === 'Movies'
                                ? 'film-outline'
                                : tab === 'Downloads'
                                ? 'cloud-download-outline'
                                : tab === 'YouTube'
                                ? 'logo-youtube'
                                : 'time-outline';

                        const iconColor = isSelected ? '#ffffff' : 'rgba(255,255,255,0.7)';

                        return (
                            <TouchableOpacity
                                key={tab}
                                style={[
                                    styles.tabPill,
                                    isSelected && [
                                        styles.tabPillActive,
                                        { backgroundColor: tab === 'YouTube' ? '#cc0000' : theme.primary, borderColor: tab === 'YouTube' ? '#ff0000' : theme.primary },
                                    ],
                                ]}
                                onPress={() => setSelectedTab(tab)}
                                activeOpacity={0.75}
                            >
                                <Ionicons
                                    name={iconName}
                                    size={14}
                                    color={iconColor}
                                    style={styles.tabPillIcon}
                                />
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
                </ScrollView>
            </View>

            <ScrollView
                style={styles.mainScrollView}
                contentContainerStyle={styles.mainScrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={theme.primary}
                        colors={[theme.primary]}
                    />
                }
            >
                {isTotallyEmpty ? (
                    renderEmpty()
                ) : (
                    <>
                        {showMovies && renderMyList()}
                        {showDownloads && renderActiveDownloads()}
                        {showDownloads && renderCompletedDownloads()}
                        {showDownloads && torrentDownloads.length === 0 && selectedTab === 'Downloads' && renderEmpty()}
                        {showYouTube && renderYouTubeDownloads()}
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

    mainScrollView: {
        flex: 1,
    },
    mainScrollContent: {
        flexGrow: 1,
    },

    // ── Tab filter pills ─────────────────────────────────────────────────────────
    tabScrollView: {
        marginHorizontal: -16,
        marginTop: 4,
    },
    tabRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        gap: 8,
        alignItems: 'center',
    },
    tabPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    tabPillActive: {
        backgroundColor: '#535aff',
        borderColor: '#535aff',
    },
    tabPillIcon: {
        marginRight: 6,
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
    healthBadgeMini: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 1.5,
        borderWidth: 0.8,
    },
    healthDotMini: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
    },
    healthBadgeText: {
        fontSize: 10,
        fontWeight: '700',
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
    exportShareButton: {
        position: 'absolute',
        top: 34,
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

    // ── YouTube Downloads Section ─────────────────────────────────────────────────
    musicHeroBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 16,
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
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
    },
    musicHeroTitle: {
        color: '#ffffff',
        fontSize: 15,
        fontWeight: '800',
    },
    musicHeroBadge: {
        backgroundColor: 'rgba(0, 229, 255, 0.2)',
        paddingVertical: 2,
        paddingHorizontal: 7,
        borderRadius: 10,
        borderWidth: 0.8,
        borderColor: '#00e5ff',
    },
    musicHeroBadgeText: {
        color: '#00e5ff',
        fontSize: 10,
        fontWeight: '800',
    },
    musicHeroSub: {
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: 12,
        marginTop: 3,
        lineHeight: 16,
    },
    ytCompletedList: {
        gap: 12,
    },
    ytDownloadCard: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 14,
        padding: 10,
        gap: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    ytThumbWrap: {
        width: 120,
        height: 70,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: '#1a1a1f',
        position: 'relative',
    },
    ytThumbImage: {
        width: '100%',
        height: '100%',
    },
    ytTypeBadgeFloating: {
        position: 'absolute',
        bottom: 4,
        left: 4,
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 4,
    },
    ytTypeBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    ytTypeBadgeText: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#ffffff',
        letterSpacing: 0.5,
    },
    ytAudioBadge: {
        backgroundColor: 'rgba(0, 229, 255, 0.25)',
    },
    ytVideoBadge: {
        backgroundColor: 'rgba(255, 0, 0, 0.25)',
    },
    ytCardDetails: {
        flex: 1,
        justifyContent: 'center',
    },
    ytCardTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#ffffff',
        marginBottom: 3,
        lineHeight: 17,
    },
    ytCardMeta: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.5)',
        marginBottom: 8,
    },
    ytCardActionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    ytActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
    },
    ytActionBtnText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#ffffff',
    },
    ytExportBtn: {
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
    },
    ytDeleteBtn: {
        padding: 5,
        marginLeft: 'auto',
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
