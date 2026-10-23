import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    FlatList,
    Dimensions,
    TouchableOpacity,
    StyleSheet,
    ImageBackground,
} from 'react-native';
import { ActivityIndicator, Text } from '@/components/Themed';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { GroupedItem, Language, TorrentItem, useTamilMV } from '@/hooks/useTamilMv';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CarouselItem {
    id: string;
    title: string;
    posterUrl: string;
    magnetUrl: string;
    infoHash: string;
    publishDate: string;
    type: 'movie' | 'series';
    groupid: string;
    guid: string;
    allItems: TorrentItem[]; // ← added
}

interface CarouselProps {
    filter?: Language;
    onItemPress?: (item: CarouselItem) => void;
    autoPlay?: boolean;
    autoPlayInterval?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickItemFromGroup(
    group: GroupedItem,
    type: 'movie' | 'series',
): CarouselItem | null {
    const torrent = group.items.find((i) => i.poster && i.magnetUrl);
    if (!torrent) return null;
    return {
        id:          torrent.guid,
        title:       group.name ?? torrent.title,
        posterUrl:   torrent.poster!,
        magnetUrl:   torrent.magnetUrl,
        infoHash:    torrent.infoHash,
        publishDate: torrent.publishDate,
        type,
        groupid:     torrent.groupid,
        guid:        torrent.guid,
        allItems:    group.items, // ← added
    };
}

// Languages that have no 'series' forum category
const NO_SERIES_LANGUAGES: Language[] = ['hindi', 'telugu', 'malayalam', 'kannada'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function PosterCarousel({
    filter = 'tamil',
    onItemPress,
    autoPlay = true,
    autoPlayInterval = 5000,
}: CarouselProps) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [dimensions, setDimensions] = useState(() => {
        const { width, height } = Dimensions.get('window');
        return { width, height, isLandscape: width > height };
    });

    const flatListRef = useRef<FlatList>(null);
    const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const hasSeriesCategory = !NO_SERIES_LANGUAGES.includes(filter);

    const { groups: movieGroups, loading: moviesLoading } = useTamilMV(filter, 'webhd');
    const { groups: seriesGroups, loading: seriesLoading } = useTamilMV(filter, hasSeriesCategory ? 'series' : 'webhd');

    const loading = moviesLoading || (hasSeriesCategory && seriesLoading);

    const data: CarouselItem[] = React.useMemo(() => {
        const movies = movieGroups
            .slice(0, 4)
            .map((g: any) => pickItemFromGroup(g, 'movie'))
            .filter((i: any): i is CarouselItem => i !== null);

        const series = (hasSeriesCategory ? seriesGroups : [])
            .slice(0, 3)
            .map((g: any) => pickItemFromGroup(g, 'series'))
            .filter((i: any): i is CarouselItem => i !== null);

        const interleaved: CarouselItem[] = [];
        const maxLen = Math.max(movies.length, series.length);
        for (let i = 0; i < maxLen; i++) {
            if (movies[i]) interleaved.push(movies[i]);
            if (series[i]) interleaved.push(series[i]);
        }
        return interleaved.slice(0, 6);
    }, [movieGroups, seriesGroups, hasSeriesCategory]);

    useEffect(() => {
        setActiveIndex(0);
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, [filter]);

    useEffect(() => {
        const sub = Dimensions.addEventListener('change', ({ window }) => {
            setDimensions({
                width: window.width,
                height: window.height,
                isLandscape: window.width > window.height,
            });
        });
        return () => sub?.remove();
    }, []);

    const carouselHeight = dimensions.isLandscape
        ? dimensions.height * 0.9
        : dimensions.height * 0.5;

    useEffect(() => {
        if (autoPlay && data.length > 1) {
            autoPlayRef.current = setInterval(() => {
                setActiveIndex((prev) => {
                    const next = (prev + 1) % data.length;
                    flatListRef.current?.scrollToIndex({ index: next, animated: true });
                    return next;
                });
            }, autoPlayInterval);
        }
        return () => {
            if (autoPlayRef.current) {
                clearInterval(autoPlayRef.current);
                autoPlayRef.current = null;
            }
        };
    }, [autoPlay, autoPlayInterval, data.length]);

    const stopAutoPlay = () => {
        if (autoPlayRef.current) {
            clearInterval(autoPlayRef.current);
            autoPlayRef.current = null;
        }
    };

    const handleScroll = (event: any) => {
        const index = Math.round(event.nativeEvent.contentOffset.x / dimensions.width);
        if (index !== activeIndex && index >= 0 && index < data.length) {
            setActiveIndex(index);
        }
    };

    const handleItemPress = (item: CarouselItem) => {
        stopAutoPlay();
        onItemPress?.(item);
    };

    const scrollToIndex = (index: number) => {
        if (flatListRef.current && index >= 0 && index < data.length) {
            flatListRef.current.scrollToIndex({ index, animated: true, viewPosition: 0 });
            setActiveIndex(index);
            stopAutoPlay();
        }
    };

    const renderCarouselItem = ({ item, index }: { item: CarouselItem; index: number }) => (
        <TouchableOpacity
            style={[styles.carouselItem, { width: dimensions.width, height: carouselHeight }]}
            onPress={() => handleItemPress(item)}
            activeOpacity={0.9}
        >
            <ImageBackground
                key={`${item.id}-${index}`}
                source={{ uri: item.posterUrl }}
                style={styles.backdropImage}
                resizeMode="cover"
            >
                <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.85)']}
                    style={StyleSheet.absoluteFill}
                />
                <View
                    style={[
                        styles.contentContainer,
                        {
                            paddingHorizontal: dimensions.isLandscape ? 40 : 20,
                            paddingBottom: 40,
                        },
                    ]}
                >
                    <View style={styles.typeIndicator}>
                        <Text style={styles.typeText}>
                            {item.type === 'movie' ? 'MOVIE' : 'SERIES'}
                        </Text>
                    </View>
                    <Text style={styles.title} numberOfLines={2}>
                        {item.title}
                    </Text>
                </View>
            </ImageBackground>
        </TouchableOpacity>
    );

    if (loading || !data.length) {
        return (
            <View style={[styles.loadingContainer, { height: carouselHeight }]}>
                {loading
                    ? <ActivityIndicator color="#535aff" />
                    : <Text style={styles.emptyText}>No content available</Text>
                }
            </View>
        );
    }

    return (
        <View style={[styles.container, { height: carouselHeight }]}>
            <FlatList
                ref={flatListRef}
                data={data}
                renderItem={renderCarouselItem}
                keyExtractor={(item, index) => `${item.id}-${index}`}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleScroll}
                decelerationRate="fast"
                snapToInterval={dimensions.width}
                snapToAlignment="start"
                removeClippedSubviews={false}
                initialNumToRender={3}
                maxToRenderPerBatch={3}
                windowSize={5}
                getItemLayout={(_data, index) => ({
                    length: dimensions.width,
                    offset: dimensions.width * index,
                    index,
                })}
            />

            {data.length > 1 && (
                <View
                    style={[
                        styles.paginationContainer,
                        {
                            bottom: dimensions.isLandscape ? 15 : 20,
                            left: dimensions.isLandscape ? 35 : 20,
                        },
                    ]}
                >
                    <BlurView intensity={20} style={styles.paginationBlur}>
                        <View style={styles.paginationDots}>
                            {data.map((_, index) => (
                                <TouchableOpacity
                                    key={`dot-${index}`}
                                    style={[
                                        styles.paginationDot,
                                        activeIndex === index && styles.paginationDotActive,
                                    ]}
                                    onPress={() => scrollToIndex(index)}
                                />
                            ))}
                        </View>
                    </BlurView>
                </View>
            )}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        backgroundColor: '#101010',
    },
    carouselItem: {
        marginBottom: 10,
    },
    backdropImage: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    contentContainer: {
        zIndex: 1,
    },
    typeIndicator: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        marginBottom: 8,
    },
    typeText: {
        fontWeight: '600',
        color: '#fff',
        fontSize: 11,
        letterSpacing: 1,
    },
    title: {
        fontWeight: '700',
        color: '#fff',
        fontSize: 22,
        lineHeight: 28,
        textShadowColor: 'rgba(0,0,0,0.9)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 6,
    },
    loadingContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000',
    },
    emptyText: {
        color: '#8E8E93',
        fontSize: 14,
    },
    paginationContainer: {
        position: 'absolute',
        borderRadius: 20,
        overflow: 'hidden',
    },
    paginationBlur: {
        paddingHorizontal: 8,
        paddingVertical: 8,
    },
    paginationDots: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    paginationDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.4)',
        marginHorizontal: 4,
    },
    paginationDotActive: {
        backgroundColor: '#fff',
        width: 12,
        height: 8,
        borderRadius: 4,
    },
});