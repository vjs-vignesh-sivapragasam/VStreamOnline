import React, { useMemo, useState, useCallback } from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  View as RNView,
} from 'react-native';
import { Text, View } from './Themed';
import { router } from 'expo-router';
import { SvgXml } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import { DefaultPosterImgXml } from '@/utils/Svg';
import { Ionicons } from '@expo/vector-icons';
import { TorrentItem, GroupedItem, Language, Category } from '@/hooks/useTamilMv';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PosterItemData {
  guid: string;
  groupid: string;
  name: string;
  year: string | null;
  poster: string | null;
  type: 'movie' | 'series';
  magnetUrl: string;
  infoHash: string;
  publishDate: string;
  allItems: TorrentItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupToItem(group: GroupedItem, type: 'movie' | 'series'): PosterItemData | null {
  if (!group.items.length) return null;
  const best = group.items.find((i) => i.poster) ?? group.items[0];
  return {
    guid: best.guid,
    groupid: best.groupid,
    name: group.name ?? best.title,
    year: group.year,
    poster: best.poster,
    type,
    magnetUrl: best.magnetUrl,
    infoHash: best.infoHash,
    publishDate: best.publishDate,
    allItems: group.items,
  };
}

// ─── PosterItem ───────────────────────────────────────────────────────────────

const PosterItem = ({
  item,
  posterWidth,
  posterHeight,
  spacing,
}: {
  item: PosterItemData;
  posterWidth: number;
  posterHeight: number;
  spacing: number;
}) => {
  const [imgError, setImgError] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const handlePress = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push({
      pathname: '/torrent/details',
      params: {
        guid: item.guid,
        groupid: item.groupid,
        title: item.name,
        magnetUrl: item.magnetUrl,
        infoHash: item.infoHash,
        poster: item.poster ?? '',
        type: item.type,
        publishDate: item.publishDate,
        allItems: JSON.stringify(item.allItems),
      },
    });
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
      style={[
        styles.posterContainer,
        { width: posterWidth, marginRight: spacing },
        isPressed && styles.posterPressed,
      ]}
    >
      {item.poster && !imgError ? (
        <Image
          source={{ uri: item.poster }}
          onError={() => setImgError(true)}
          style={[styles.posterImage, { width: posterWidth, height: posterHeight }]}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            styles.posterImage,
            { width: posterWidth, height: posterHeight, justifyContent: 'center', alignItems: 'center' },
          ]}
        >
          <SvgXml xml={DefaultPosterImgXml} />
        </View>
      )}
      <Text numberOfLines={2} style={[styles.posterTitle, { width: posterWidth }]}>
        {item.name}
      </Text>
      {item.year ? <Text style={styles.posterYear}>{item.year}</Text> : null}
    </Pressable>
  );
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const SkeletonPoster = ({
  posterWidth,
  posterHeight,
  spacing,
}: {
  posterWidth: number;
  posterHeight: number;
  spacing: number;
}) => (
  <RNView style={[styles.posterContainer, { width: posterWidth, marginRight: spacing }]}>
    <RNView style={[styles.posterImage, styles.skeletonPoster, { width: posterWidth, height: posterHeight }]} />
    <RNView style={[styles.skeletonText, { width: posterWidth * 0.85, marginTop: 10 }]} />
    <RNView style={[styles.skeletonText, { width: posterWidth * 0.5, marginTop: 6, height: 12 }]} />
  </RNView>
);

// ─── PosterList ───────────────────────────────────────────────────────────────

interface PosterListProps {
  groups: GroupedItem[];
  title: string;
  type: 'movie' | 'series';
  language: Language;
  category: Category;
  loading?: boolean;
  hideSeeAll?: boolean;
}

const PosterList = ({ groups, title, type, language, category, loading = false, hideSeeAll = false }: PosterListProps) => {
  const { width, height } = useWindowDimensions();
  const shortSide = Math.min(width, height);
  const isPortrait = height >= width;

  const getPostersPerScreen = () => {
    if (shortSide < 580) return isPortrait ? 3 : 5;
    if (shortSide < 1024) return isPortrait ? 6 : 8;
    if (shortSide < 1440) return isPortrait ? 7 : 9;
    return isPortrait ? 7 : 10;
  };

  const postersPerScreen = getPostersPerScreen();
  const spacing = 12;
  const containerMargin = 15;

  const posterWidth = useMemo(() => {
    const totalSpacing = spacing * (postersPerScreen - 1);
    const totalMargins = containerMargin * 2;
    return (width - totalSpacing - totalMargins) / postersPerScreen;
  }, [width, postersPerScreen]);

  const posterHeight = posterWidth * 1.5;

  const data = useMemo<PosterItemData[]>(() => {
    return groups
      .map((g) => groupToItem(g, type))
      .filter((i): i is PosterItemData => i !== null)
      .slice(0, 20);
  }, [groups, type]);

  const handleSeeAllPress = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push({
      pathname: '/torrent/list',
      params: { title, language, category },
    });
  }, [title, language, category]);

  if (loading) {
    return (
      <RNView style={styles.container}>
        <RNView style={styles.header}>
          <Text style={styles.title}>{title}</Text>
        </RNView>
        <FlatList
          data={[1, 2, 3, 4, 5]}
          horizontal
          renderItem={() => (
            <SkeletonPoster posterWidth={posterWidth} posterHeight={posterHeight} spacing={spacing} />
          )}
          keyExtractor={(_, index) => `skeleton-${index}`}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: 4 }}
        />
      </RNView>
    );
  }

  if (!data.length) return null;

  return (
    <RNView style={styles.container}>
      <RNView style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {!hideSeeAll && (
          <Pressable onPress={handleSeeAllPress} style={styles.seeAllButton}>
            <Text style={styles.seeAllText}>See All</Text>
            <Ionicons name="chevron-forward" size={16} color="#8E8E93" style={styles.chevronIcon} />
          </Pressable>
        )}
      </RNView>

      <FlatList
        data={data}
        horizontal
        renderItem={({ item }) => (
          <PosterItem
            item={item}
            posterWidth={posterWidth}
            posterHeight={posterHeight}
            spacing={spacing}
          />
        )}
        keyExtractor={(item, index) => `${item.guid}-${index}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 4 }}
        initialNumToRender={postersPerScreen}
        maxToRenderPerBatch={postersPerScreen}
        windowSize={3}
      />
    </RNView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingTop: 10,
    marginBottom: 20,
    marginHorizontal: 15
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '500',
    letterSpacing: 0.2,
    color: '#ffffff',
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  seeAllText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#cccccc',
    letterSpacing: -0.1,
  },
  chevronIcon: {
    marginLeft: 2,
  },
  posterContainer: {
    marginBottom: 10,
  },
  posterPressed: {
    opacity: 0.7,
  },
  posterImage: {
    borderRadius: 6,
    backgroundColor: '#101010',
    overflow: 'hidden',
  },
  posterTitle: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  posterYear: {
    marginTop: 4,
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  skeletonPoster: {
    backgroundColor: '#101010',
  },
  skeletonText: {
    height: 14,
    backgroundColor: '#101010',
    borderRadius: 6,
  },
});

export default PosterList;