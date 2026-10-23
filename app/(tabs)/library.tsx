import React, { useState, useCallback, useRef } from 'react';
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

const CARD_SPACING = 16;

const LibraryScreen: React.FC = () => {
    const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>([]);
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
        }, [])
    );

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

    // ── Empty state ───────────────────────────────────────────────────────────────

    const renderEmpty = () => (
        <View style={styles.emptyContainer}>
            <Ionicons name="time-outline" size={72} color="#535aff" />
            <Text style={styles.emptyTitle}>Nothing Here Yet</Text>
            <Text style={styles.emptyText}>
                Titles you start watching will appear here so you can pick up where you left off
            </Text>
        </View>
    );

    // ── Continue Watching ─────────────────────────────────────────────────────────

    const renderContinueWatching = () => (
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

    // ── Root ──────────────────────────────────────────────────────────────────────

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar />
            <BlurGradientBackground />

            <View style={styles.header}>
                <Text style={styles.headerTitle}>Library</Text>
                <Text style={styles.headerSubtitle}>
                    {watchHistory.length} {watchHistory.length === 1 ? 'title' : 'titles'}
                </Text>
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
                {watchHistory.length === 0 ? renderEmpty() : renderContinueWatching()}
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
    },

    // ── Section ──────────────────────────────────────────────────────────────────
    section: {
        marginTop: 24,
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
        gap: 10,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
    },
    sectionHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    sectionCount: {
        fontSize: 14,
        opacity: 0.5,
        fontWeight: '500',
        color: '#fff',
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
    flatListContent: {
        paddingHorizontal: 16,
        marginVertical: 10,
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