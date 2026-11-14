import React, { useState, useRef, useEffect, useMemo } from 'react';
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
import { GroupedItem, Language, TorrentItem, useTamilMV, useTamilMVTopReleases, cleanTopicTitle } from '@/hooks/useTamilMv';
import { tmdbService, TmdbDetails } from '@/services/TmdbService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CarouselItem {
    id: string;
    title: string;
    posterUrl: string;
    magnetUrl: string;
    infoHash: string;
    publishDate: string;
    year?: string;
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
    const torrent = group.items.find((i) => i.poster && i.magnetUrl) || group.items.find((i) => i.poster) || group.items[0];
    if (!torrent || !torrent.poster) return null;
    return {
        id:          torrent.guid,
        title:       group.name ?? torrent.title,
        posterUrl:   torrent.poster!,
        magnetUrl:   torrent.magnetUrl || '',
        infoHash:    torrent.infoHash || '',
        publishDate: torrent.publishDate,
        year:        group.year || (torrent.publishDate ? new Date(torrent.publishDate).getFullYear().toString() : undefined),
        type:        (group as any).type || type,
        groupid:     torrent.groupid,
        guid:        torrent.guid,
        allItems:    group.items, // ← added
    };
}

// Languages that have no 'series' forum category
const NO_SERIES_LANGUAGES: Language[] = ['hindi', 'telugu', 'malayalam', 'kannada'];

// ─── Carousel Slide Item Component (matching highlighted design) ────────────

interface SlideItemProps {
    item: CarouselItem;
    dimensions: { width: number; height: number; isLandscape: boolean };
    carouselHeight: number;
    onPress: () => void;
}

const CarouselSlideItem = ({
    item,
    dimensions,
    carouselHeight,
    onPress,
}: SlideItemProps) => {
    const [tmdb, setTmdb] = useState<TmdbDetails | null>(null);
    const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const year = item.publishDate ? new Date(item.publishDate).getFullYear().toString() : undefined;
        tmdbService
            .getMovieFullInfo(item.title, year, item.type)
            .then((data) => {
                if (isMounted && data) {
                    setTmdb(data);
                }
            })
            .catch(() => {});
        return () => {
            isMounted = false;
        };
    }, [item.title, item.publishDate, item.type]);

    const backdropUri = tmdb?.backdropUrl || item.posterUrl;

    const cleanTitle = useMemo(() => {
        const raw = tmdb?.title || item.title;
        return cleanTopicTitle(raw).name.replace(/^[a-z0-9\.-]+\.[a-z]{2,6}\s*[-_:]\s*/i, '').trim();
    }, [tmdb?.title, item.title]);

    const year = tmdb?.year || (item.publishDate ? new Date(item.publishDate).getFullYear().toString() : '2024');
    const genres = tmdb?.genres
        ? tmdb.genres.split(',').slice(0, 2).map((g) => g.trim()).join(', ')
        : (item.type === 'series' ? 'Drama, Series' : 'Adventure, Thriller');
    const runtime = tmdb?.runtimeFormatted || (item.type === 'series' ? '1 Season' : '120 min');
    const certification = tmdb?.certification || 'PG-13';

    const imdbRating = tmdb?.imdbRating || '7.1';
    const tmdbRating = tmdb?.tmdbRating || '7.5';
    const rtScore = tmdb?.rtScore || '84%';
    const audienceScore = tmdb?.audienceScore || '94%';

    const tagline = tmdb?.tagline || '';
    const overview = tmdb?.overview || '';

    return (
        <TouchableOpacity
            style={[styles.carouselItem, { width: dimensions.width, height: carouselHeight }]}
            onPress={onPress}
            activeOpacity={0.92}
        >
            <ImageBackground
                source={{ uri: backdropUri }}
                style={styles.backdropImage}
                resizeMode="cover"
            >
                <LinearGradient
                    colors={[
                        'rgba(0,0,0,0.3)',
                        'transparent',
                        'rgba(0,0,0,0.65)',
                        'rgba(0,0,0,0.92)',
                        '#000000',
                    ]}
                    locations={[0, 0.2, 0.5, 0.8, 1]}
                    style={StyleSheet.absoluteFill}
                />

                <View
                    style={[
                        styles.slideContent,
                        {
                            paddingHorizontal: dimensions.isLandscape ? 40 : 20,
                            paddingBottom: 28,
                        },
                    ]}
                >
                    {/* Movie Title */}
                    <Text style={styles.slideTitle} numberOfLines={2}>
                        {cleanTitle}
                    </Text>

                    {/* Metadata Row: 2026 · Adventure, Thriller · 1 min · PG-13 */}
                    <Text style={styles.metaRowText} numberOfLines={1}>
                        {`${year}  ·  ${genres}  ·  ${runtime}  ·  ${certification}`}
                    </Text>

                    {/* Ratings Badges Row: [IMDb 7.1] [TMDB 7.5] [RT 84%] [🍿 94%] */}
                    <View style={styles.ratingsRow}>
                        {/* IMDb Badge */}
                        <View style={styles.badgePill}>
                            <View style={styles.imdbLabel}>
                                <Text style={styles.imdbLabelText}>IMDb</Text>
                            </View>
                            <Text style={styles.badgeScoreText}>{imdbRating}</Text>
                        </View>

                        {/* TMDB Badge */}
                        <View style={styles.badgePill}>
                            <View style={styles.tmdbLabel}>
                                <Text style={styles.tmdbLabelText}>TMDB</Text>
                            </View>
                            <Text style={styles.badgeScoreText}>{tmdbRating}</Text>
                        </View>

                        {/* RT Badge */}
                        <View style={styles.badgePill}>
                            <View style={styles.rtLabel}>
                                <Text style={styles.rtLabelText}>RT</Text>
                            </View>
                            <Text style={styles.badgeScoreText}>{rtScore}</Text>
                        </View>

                        {/* Popcorn Audience Badge */}
                        <View style={[styles.badgePill, styles.popcornPill]}>
                            <Text style={styles.popcornText}>🍿 {audienceScore}</Text>
                        </View>
                    </View>

                    {/* Tagline / Subtitle */}
                    {tagline ? (
                        <Text style={styles.taglineText} numberOfLines={1}>
                            {tagline}
                        </Text>
                    ) : null}

                    {/* Overview Paragraph with more toggle */}
                    {overview ? (
                        <View style={styles.overviewWrap}>
                            <Text
                                style={styles.overviewText}
                                numberOfLines={isOverviewExpanded ? undefined : 2}
                            >
                                {overview}
                            </Text>
                            {overview.length > 80 ? (
                                <TouchableOpacity
                                    onPress={(e) => {
                                        e.stopPropagation();
                                        setIsOverviewExpanded(!isOverviewExpanded);
                                    }}
                                    activeOpacity={0.7}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Text style={styles.moreText}>
                                        {isOverviewExpanded ? 'less' : 'more'}
                                    </Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    ) : null}
                </View>
            </ImageBackground>
        </TouchableOpacity>
    );
};

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

    const { groups: topReleasesGroups, loading: topLoading } = useTamilMVTopReleases(filter);
    const { groups: preDvdGroups } = useTamilMV(filter, 'predvd');
    const { groups: movieGroups, loading: moviesLoading } = useTamilMV(filter, 'webhd');
    const { groups: seriesGroups, loading: seriesLoading } = useTamilMV(filter, hasSeriesCategory ? 'series' : 'webhd');

    const loading = (topLoading && moviesLoading) || (!topReleasesGroups.length && moviesLoading);

    const data: CarouselItem[] = React.useMemo(() => {
        const seenTitles = new Set<string>();

        // 1. Load all "Top Releases This Week" into the slideshow
        const topItems = (topReleasesGroups || [])
            .map((g: any) => pickItemFromGroup(g, (g as any).type || 'movie'))
            .filter((i: any): i is CarouselItem => {
                if (!i) return false;
                const clean = (i.title || '').toLowerCase().trim();
                if (seenTitles.has(clean)) return false;
                seenTitles.add(clean);
                return true;
            });

        // 2. Interleave with other fresh catalog items (PreDVD, WebHD, Series)
        const preDvd = (preDvdGroups || [])
            .map((g: any) => pickItemFromGroup(g, 'movie'))
            .filter((i: any): i is CarouselItem => {
                if (!i) return false;
                const clean = (i.title || '').toLowerCase().trim();
                if (seenTitles.has(clean)) return false;
                seenTitles.add(clean);
                return true;
            })
            .slice(0, 3);

        const movies = (movieGroups || [])
            .map((g: any) => pickItemFromGroup(g, 'movie'))
            .filter((i: any): i is CarouselItem => {
                if (!i) return false;
                const clean = (i.title || '').toLowerCase().trim();
                if (seenTitles.has(clean)) return false;
                seenTitles.add(clean);
                return true;
            })
            .slice(0, 4);

        const series = (hasSeriesCategory ? seriesGroups : [])
            .map((g: any) => pickItemFromGroup(g, 'series'))
            .filter((i: any): i is CarouselItem => {
                if (!i) return false;
                const clean = (i.title || '').toLowerCase().trim();
                if (seenTitles.has(clean)) return false;
                seenTitles.add(clean);
                return true;
            })
            .slice(0, 3);

        const interleaved: CarouselItem[] = [...topItems];
        const maxLen = Math.max(preDvd.length, movies.length, series.length);
        for (let i = 0; i < maxLen; i++) {
            if (preDvd[i]) interleaved.push(preDvd[i]);
            if (movies[i]) interleaved.push(movies[i]);
            if (series[i]) interleaved.push(series[i]);
        }
        return interleaved.slice(0, 15);
    }, [topReleasesGroups, preDvdGroups, movieGroups, seriesGroups, hasSeriesCategory]);

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
        ? dimensions.height * 0.95
        : Math.min(Math.max(dimensions.height * 0.68, 520), 620);

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

    const renderCarouselItem = ({ item }: { item: CarouselItem; index: number }) => (
        <CarouselSlideItem
            item={item}
            dimensions={dimensions}
            carouselHeight={carouselHeight}
            onPress={() => handleItemPress(item)}
        />
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
                extraData={activeIndex}
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
                            bottom: 12,
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
        backgroundColor: '#0a0a0a',
    },
    carouselItem: {
        position: 'relative',
    },
    backdropImage: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    slideContent: {
        zIndex: 2,
        alignItems: 'center',
        paddingBottom: 38,
    },
    slideTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: '#ffffff',
        textAlign: 'center',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        textShadowColor: 'rgba(0, 0, 0, 0.95)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 8,
        paddingHorizontal: 16,
    },
    metaRowText: {
        fontSize: 13,
        fontWeight: '500',
        color: '#D1D1D6',
        textAlign: 'center',
        marginTop: 6,
        letterSpacing: 0.3,
    },
    ratingsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        marginTop: 10,
        flexWrap: 'wrap',
    },
    badgePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    imdbLabel: {
        paddingVertical: 0,
    },
    imdbLabelText: {
        fontSize: 12,
        fontWeight: '900',
        color: '#F5C518',
        letterSpacing: -0.2,
    },
    tmdbLabel: {
        paddingVertical: 0,
    },
    tmdbLabelText: {
        fontSize: 11,
        fontWeight: '900',
        color: '#01B4E4',
        letterSpacing: -0.2,
    },
    rtLabel: {
        paddingVertical: 0,
    },
    rtLabelText: {
        fontSize: 12,
        fontWeight: '900',
        color: '#FA320A',
        letterSpacing: -0.2,
    },
    badgeScoreText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#ffffff',
    },
    popcornPill: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    popcornText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#ffffff',
    },
    taglineText: {
        fontSize: 12,
        fontStyle: 'italic',
        color: '#9E9E9E',
        textAlign: 'center',
        marginTop: 8,
        paddingHorizontal: 20,
    },
    overviewWrap: {
        alignItems: 'center',
        marginTop: 8,
        paddingHorizontal: 20,
        maxWidth: 480,
    },
    overviewText: {
        fontSize: 12.5,
        lineHeight: 18,
        color: '#C7C7CC',
        textAlign: 'center',
    },
    moreText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#ffffff',
        marginTop: 3,
        textAlign: 'center',
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
        bottom: 12,
        alignSelf: 'center',
        borderRadius: 20,
        overflow: 'hidden',
    },
    paginationBlur: {
        paddingHorizontal: 8,
        paddingVertical: 6,
    },
    paginationDots: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    paginationDot: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
        backgroundColor: 'rgba(255, 255, 255, 0.4)',
        marginHorizontal: 3.5,
    },
    paginationDotActive: {
        backgroundColor: '#ffffff',
        width: 12,
        height: 7,
        borderRadius: 3.5,
    },
});