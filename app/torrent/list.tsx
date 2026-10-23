import React from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Image,
  Pressable,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Text } from '@/components/Themed';
import { useTamilMV, Language, Category, GroupedItem, TorrentItem } from '@/hooks/useTamilMv';
import { SvgXml } from 'react-native-svg';
import { DefaultPosterImgXml } from '@/utils/Svg';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import BottomSpacing from '@/components/BottomSpacing';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBestItem(group: GroupedItem): TorrentItem {
  return group.items.find((i) => i.poster) ?? group.items[0];
}

// ─── Grid item ────────────────────────────────────────────────────────────────

const GridItem = ({
  group,
  type,
  itemWidth,
}: {
  group: GroupedItem;
  type: 'movie' | 'series';
  itemWidth: number;
}) => {
  const [imgError, setImgError] = React.useState(false);
  const best = getBestItem(group);
  const posterHeight = itemWidth * 1.5;

  const handlePress = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push({
      pathname: '/torrent/details',
      params: {
        guid: best.guid,
        groupid: best.groupid,
        title: group.name ?? best.title,
        magnetUrl: best.magnetUrl,
        infoHash: best.infoHash,
        poster: best.poster ?? '',
        type,
        publishDate: best.publishDate,
        allItems: JSON.stringify(group.items),
      },
    });
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.gridItem,
        { width: itemWidth, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {best.poster && !imgError ? (
        <Image
          source={{ uri: best.poster }}
          onError={() => setImgError(true)}
          style={[styles.poster, { width: itemWidth, height: posterHeight }]}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.poster, styles.posterFallback, { width: itemWidth, height: posterHeight }]}>
          <SvgXml xml={DefaultPosterImgXml} />
        </View>
      )}
      <Text numberOfLines={2} style={[styles.itemTitle, { width: itemWidth }]}>
        {group.name ?? best.title}
      </Text>
      {group.year ? <Text style={styles.itemYear}>{group.year}</Text> : null}
    </Pressable>
  );
};

// ─── Screen ───────────────────────────────────────────────────────────────────

const TorrentList = () => {
  const { title, language, category } = useLocalSearchParams<{
    title: string;
    language: Language;
    category: Category;
  }>();

  const { groups, loading, error, refresh } = useTamilMV(
    language ?? 'tamil',
    category ?? 'webhd',
  );

  const { width } = useWindowDimensions();
  const numColumns = 3;
  const spacing = 12;
  const horizontalPadding = 15;
  const itemWidth = (width - horizontalPadding * 2 - spacing * (numColumns - 1)) / numColumns;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#535aff" />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={refresh}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView>
      <FlatList
        data={groups}
        keyExtractor={(item, index) => `${item.name}-${index}`}
        numColumns={numColumns}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <Text style={styles.screenTitle}>{title}</Text>
        }
        renderItem={({ item }) => (
          <GridItem
            group={item}
            type={category === 'series' ? 'series' : 'movie'}
            itemWidth={itemWidth}
          />
        )}
        ListFooterComponent={<BottomSpacing space={50} />}
        onRefresh={refresh}
        refreshing={loading}
      />
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  listContent: {
    marginTop: 30,
    paddingHorizontal: 15,
    paddingTop: 16,
  },
  row: {
    gap: 12,
    marginBottom: 12,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.5,
    marginBottom: 20,
  },
  gridItem: {
    marginBottom: 4,
  },
  poster: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#101010',
  },
  posterFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemTitle: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '500',
    color: '#ffffff',
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  itemYear: {
    marginTop: 3,
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '500',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#8E8E93',
    fontSize: 14,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  retryButton: {
    backgroundColor: '#1c1c1e',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default TorrentList;