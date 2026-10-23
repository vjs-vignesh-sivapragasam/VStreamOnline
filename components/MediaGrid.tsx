import React, { useMemo } from 'react';
import {
    FlatList,
    Image,
    StyleSheet,
    Pressable,
    useWindowDimensions,
} from 'react-native';
import { ActivityIndicator, StatusBar, Text, View } from '@/components/Themed';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GroupedItem, Language, TorrentItem, useTamilMVCatalog } from '@/hooks/useTamilMv';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GridItemData {
    guid: string;
    groupid: string;
    name: string;
    year: string | null;
    poster: string | null;
    magnetUrl: string;
    infoHash: string;
    publishDate: string;
    type: 'movie' | 'series';
    allItems: TorrentItem[];
}

interface MediaGridProps {
    title: string;
    type: 'movie' | 'series';
    detailsPath: '/torrent/details';
    language?: Language;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function groupToGridItem(group: GroupedItem, type: 'movie' | 'series'): GridItemData | null {
    if (!group.items.length) return null;
    const best = group.items.find((i) => i.poster) ?? group.items[0];
    return {
        guid:        best.guid,
        groupid:     best.groupid,
        name:        group.name ?? best.title,
        year:        group.year,
        poster:      best.poster,
        magnetUrl:   best.magnetUrl,
        infoHash:    best.infoHash,
        publishDate: best.publishDate,
        type,
        allItems:    group.items,
    };
}

// ─── Component ────────────────────────────────────────────────────────────────

const MediaGrid: React.FC<MediaGridProps> = ({
    title,
    type,
    detailsPath,
    language = 'tamil',
}) => {
    const router = useRouter();
    const { width, height } = useWindowDimensions();
    const isPortrait = height >= width;
    const shortSide = Math.min(width, height);

    const isMobile  = shortSide < 580;
    const isTablet  = shortSide >= 580  && shortSide < 1024;
    const isLaptop  = shortSide >= 1024 && shortSide < 1440;
    const isDesktop = shortSide >= 1440;

    const getNumColumns = () => {
        if (isMobile)  return isPortrait ? 3 : 5;
        if (isTablet)  return isPortrait ? 5 : 8;
        if (isLaptop)  return isPortrait ? 6 : 9;
        if (isDesktop) return isPortrait ? 7 : 10;
        return 5;
    };

    const numColumns = getNumColumns();
    const spacing = isMobile ? 12 : 16;

    // Fetch all categories for this language, then flatten all groups that
    // match the requested type into one big grid
    const { sections, loading } = useTamilMVCatalog(language);

    const data = useMemo<GridItemData[]>(() => {
        return sections
            .filter((s) => s.type === type)
            .flatMap((s) => s.groups)
            .map((g) => groupToGridItem(g, type))
            .filter((i): i is GridItemData => i !== null);
    }, [sections, type]);

    const renderItem = ({ item }: { item: GridItemData }) => {
        const handlePress = () => {
            router.push({
                pathname: detailsPath,
                params: {
                    guid:        item.guid,
                    groupid:     item.groupid,
                    title:       item.name,
                    magnetUrl:   item.magnetUrl,
                    infoHash:    item.infoHash,
                    poster:      item.poster ?? '',
                    type:        item.type,
                    publishDate: item.publishDate,
                },
            });
        };

        return (
            <Pressable
                style={({ pressed }) => [
                    styles.posterContainer,
                    {
                        flexBasis: `${100 / numColumns}%`,
                        paddingHorizontal: spacing / 2,
                        opacity: pressed ? 0.7 : 1,
                    },
                ]}
                onPress={handlePress}
            >
                <View style={styles.imageContainer}>
                    {item.poster ? (
                        <Image
                            source={{ uri: item.poster }}
                            style={styles.posterImage}
                            resizeMode="cover"
                        />
                    ) : (
                        <View style={[styles.posterImage, styles.noPoster]}>
                            <Text style={styles.noPosterText} numberOfLines={3}>
                                {item.name}
                            </Text>
                        </View>
                    )}
                </View>
                <View style={styles.infoContainer}>
                    <Text numberOfLines={2} ellipsizeMode="tail" style={styles.posterTitle}>
                        {item.name}
                    </Text>
                    {item.year ? (
                        <Text style={styles.posterYear}>{item.year}</Text>
                    ) : null}
                </View>
            </Pressable>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar />
            {loading ? (
                <View style={styles.centeredContainer}>
                    <ActivityIndicator size="large" color="#535aff" />
                    <Text style={styles.loadingText}>Loading {title}…</Text>
                </View>
            ) : data.length === 0 ? (
                <View style={styles.centeredContainer}>
                    <Text style={styles.loadingText}>No content found</Text>
                </View>
            ) : (
                <FlatList
                    data={data}
                    renderItem={renderItem}
                    keyExtractor={(item, index) => `${item.guid}-${index}`}
                    numColumns={numColumns}
                    key={numColumns}
                    columnWrapperStyle={{ paddingHorizontal: spacing / 2 }}
                    contentContainerStyle={[styles.listContent, { paddingBottom: 30 }]}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </SafeAreaView>
    );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
        marginTop: 30,
    },
    listContent: {
        paddingTop: 8,
    },
    posterContainer: {
        marginBottom: 24,
    },
    imageContainer: {
        position: 'relative',
        width: '100%',
        aspectRatio: 2 / 3,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#101010',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    posterImage: {
        width: '100%',
        height: '100%',
    },
    noPoster: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 8,
        backgroundColor: '#1a1a1a',
    },
    noPosterText: {
        fontSize: 12,
        color: '#8E8E93',
        textAlign: 'center',
        fontWeight: '500',
    },
    infoContainer: {
        marginTop: 10,
        paddingHorizontal: 2,
        gap: 4,
    },
    posterTitle: {
        fontSize: 14,
        fontWeight: '500',
        lineHeight: 18,
    },
    posterYear: {
        fontSize: 12,
        color: '#999',
        fontWeight: '500',
    },
    centeredContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        gap: 16,
    },
    loadingText: {
        fontSize: 16,
        textAlign: 'center',
        opacity: 0.7,
    },
});

export default MediaGrid;