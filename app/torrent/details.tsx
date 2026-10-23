import React, { useRef, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Pressable,
  Platform,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { StatusBar, Text, View } from '../../components/Themed';
import BottomSpacing from '@/components/BottomSpacing';
import MediaContentPoster from '@/components/MediaContentPoster';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported, showAlert } from '@/utils/platform';
import { Ionicons } from '@expo/vector-icons';
import { TorrentItem } from '@/hooks/useTamilMv';
import { StreamingServerClient, TorrentFile } from '@/clients/stremio';

const client = new StreamingServerClient();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractQualityTag(title: string): string | null {
  const match = title.match(/\b(2160p|1080p|720p|4K)[^)]*?(WEB-?DL|BluRay|WEBRip|HDTV|x265|x264|HEVC|AVC)?/i);
  if (!match) return null;
  return [match[1], match[2]].filter(Boolean).join(' ');
}

function cleanTitle(title: string): string {
  return title.replace(/^[^-]+-\s*/, '').trim();
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

// ─── Component ────────────────────────────────────────────────────────────────
const TorrentDetails = () => {
  const {
    title,
    poster,
    type,
    publishDate,
    allItems: allItemsRaw,
  } = useLocalSearchParams<{
    title: string;
    poster: string;
    type: 'movie' | 'series';
    publishDate: string;
    allItems: string;
  }>();

  const { height, width } = useWindowDimensions();
  const isPortrait = height > width;
  const ref = useRef<ScrollView | null>(null);

  // ── File picker state ──
  const [loadingItem, setLoadingItem] = useState<string | null>(null); // guid of loading item
  const [pickerFiles, setPickerFiles] = useState<TorrentFile[]>([]);
  const [pendingItem, setPendingItem] = useState<TorrentItem | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  const allItems = useMemo<TorrentItem[]>(() => {
    try {
      return allItemsRaw ? JSON.parse(allItemsRaw) : [];
    } catch {
      return [];
    }
  }, [allItemsRaw]);

  const formattedDate = publishDate
    ? new Date(publishDate).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
    : null;

  // ── Navigate to player ──
  const navigateToPlayer = (item: TorrentItem, fileIdx: number) => {
    const streams = JSON.stringify([
      {
        name: item.title,
        title: item.title,
        infoHash: item.infoHash,
        fileIdx,
      },
    ]);
    router.push({
      pathname: '/stream/player',
      params: { streams, selectedStreamIndex: '0', title, poster: poster ?? '' },
    });
  };

  // ── Handle stream: fetch files via /create, auto-select or show picker ──
  const handleStream = async (item: TorrentItem) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setLoadingItem(item.guid);
    try {
      const files = await client.getTorrentFiles(item.infoHash);

      if (files.length <= 1) {
        // Single file or empty — use default index
        navigateToPlayer(item, files.length === 1 ? files[0].id : 0);
      } else {
        // Multiple files — show picker
        setPendingItem(item);
        setPickerFiles(files);
        setPickerVisible(true);
      }
    } catch (e) {
      console.error('getTorrentFiles error:', e);
      showAlert('Error', 'Could not load file list. Starting default stream.');
      navigateToPlayer(item, 0);
    } finally {
      setLoadingItem(null);
    }
  };

  // ── File picker: user picks a file ──
  const handleFilePick = (file: TorrentFile) => {
    setPickerVisible(false);
    if (pendingItem) {
      navigateToPlayer(pendingItem, file.id);
    }
    setPendingItem(null);
    setPickerFiles([]);
  };

  return (
    <>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
      >
        <StatusBar />

        {/* ── Poster ── */}
        <MediaContentPoster background={poster ?? ''} isPortrait={isPortrait} />

        {/* ── Header ── */}
        <View style={styles.headerCard}>
          <Text style={styles.movieTitle}>{title}</Text>
          <View style={styles.pillRow}>
            {type ? (
              <View style={styles.pill}>
                <Ionicons
                  name={type === 'series' ? 'tv-outline' : 'film-outline'}
                  size={12}
                  color="#535aff"
                  style={{ marginRight: 5 }}
                />
                <Text style={styles.pillText}>
                  {type === 'series' ? 'Series' : 'Movie'}
                </Text>
              </View>
            ) : null}
            {formattedDate ? (
              <View style={[styles.pill, styles.pillNeutral]}>
                <Ionicons
                  name="calendar-outline"
                  size={12}
                  color="#8E8E93"
                  style={{ marginRight: 5 }}
                />
                <Text style={styles.pillTextNeutral}>{formattedDate}</Text>
              </View>
            ) : null}
            {allItems.length > 0 ? (
              <View style={[styles.pill, styles.pillNeutral]}>
                <Ionicons
                  name="layers-outline"
                  size={12}
                  color="#8E8E93"
                  style={{ marginRight: 5 }}
                />
                <Text style={styles.pillTextNeutral}>{allItems.length} variants</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Torrents ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose Quality</Text>
          <View style={styles.torrentList}>
            {allItems.map((item, index) => {
              const clean = cleanTitle(item.title);
              const qualityTag = extractQualityTag(clean);
              const isLast = index === allItems.length - 1;
              const isLoading = loadingItem === item.guid;

              return (
                <Pressable
                  key={item.guid}
                  style={({ pressed }) => [
                    styles.torrentRow,
                    isLast && styles.torrentRowLast,
                    pressed && styles.torrentRowPressed,
                    isLoading && styles.torrentRowLoading,
                  ]}
                  onPress={() => handleStream(item)}
                  disabled={loadingItem !== null}
                >
                  <View style={styles.torrentIconWrap}>
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#535aff" />
                    ) : (
                      <Ionicons name="play-circle-outline" size={36} color="#ffffff" />
                    )}
                  </View>
                  <View style={styles.torrentBody}>
                    <Text style={styles.torrentTitle}>{clean}</Text>
                    {qualityTag ? (
                      <View style={styles.qualityBadge}>
                        <Text style={styles.qualityBadgeText}>{qualityTag}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#3a3a3c" />
                </Pressable>
              );
            })}
          </View>
        </View>

        <BottomSpacing space={50} />
      </ScrollView>

      {/* ── File Picker Modal ── */}
      <Modal
        visible={pickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPickerVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={() => { }}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Select File</Text>
              <Text style={styles.modalSubtitle}>
                {pickerFiles.length} files found in this torrent
              </Text>
            </View>

            {/* File list */}
            <FlatList
              data={pickerFiles}
              keyExtractor={(f, index) => `file-${f.id ?? index}`}
              style={styles.fileList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: file, index }) => {
                const isLast = index === pickerFiles.length - 1;
                const ext = file.name.split('.').pop()?.toUpperCase() ?? '';
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.fileRow,
                      isLast && styles.fileRowLast,
                      pressed && styles.fileRowPressed,
                    ]}
                    onPress={() => handleFilePick(file)}
                  >
                    <View style={styles.fileIconWrap}>
                      <Ionicons name="document-outline" size={22} color="#535aff" />
                    </View>
                    <View style={styles.fileBody}>
                      <Text style={styles.fileName} numberOfLines={2}>
                        {file.name}
                      </Text>
                      <View style={styles.fileMeta}>
                        {ext ? (
                          <View style={styles.extBadge}>
                            <Text style={styles.extBadgeText}>{ext}</Text>
                          </View>
                        ) : null}
                        <Text style={styles.fileSize}>{formatFileSize(file.length)}</Text>
                      </View>
                    </View>
                    <Ionicons name="play-circle-outline" size={26} color="#ffffff" />
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { paddingBottom: 20 },

  /* Header */
  headerCard: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 6 },
  movieTitle: {
    fontSize: 26, fontWeight: '700', color: '#ffffff',
    letterSpacing: -0.5, lineHeight: 32, marginBottom: 14,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#535aff18', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#535aff40',
  },
  pillNeutral: { backgroundColor: '#ffffff08', borderColor: '#ffffff14' },
  pillText: { fontSize: 12, fontWeight: '600', color: '#535aff', letterSpacing: 0.1 },
  pillTextNeutral: { fontSize: 12, fontWeight: '500', color: '#8E8E93' },

  /* Section */
  section: { marginTop: 28, paddingHorizontal: 20 },
  sectionTitle: {
    fontSize: 18, fontWeight: '700', color: '#ffffff',
    letterSpacing: -0.3, marginBottom: 14,
  },

  /* Torrent list */
  torrentList: {
    backgroundColor: '#1c1c1e', borderRadius: 16, overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
      android: { elevation: 6 },
    }),
  },
  torrentRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2c2c2e', gap: 14,
  },
  torrentRowLast: { borderBottomWidth: 0 },
  torrentRowPressed: { backgroundColor: '#535aff12' },
  torrentRowLoading: { opacity: 0.6 },
  torrentIconWrap: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  torrentBody: { flex: 1, gap: 7 },
  torrentTitle: { fontSize: 14, fontWeight: '500', color: '#ffffff', letterSpacing: -0.1, lineHeight: 20 },
  qualityBadge: {
    alignSelf: 'flex-start', backgroundColor: '#535aff22',
    borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#535aff44',
  },
  qualityBadgeText: { fontSize: 11, fontWeight: '600', color: '#7b82ff', letterSpacing: 0.3 },

  /* Modal */
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalSheet: {
    backgroundColor: '#1c1c1e', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '75%', paddingBottom: 34,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.4, shadowRadius: 20 },
      android: { elevation: 20 },
    }),
  },
  modalHeader: { alignItems: 'center', paddingTop: 12, paddingBottom: 16, paddingHorizontal: 20 },
  modalHandle: { width: 36, height: 4, backgroundColor: '#3a3a3c', borderRadius: 2, marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff', letterSpacing: -0.3 },
  modalSubtitle: { fontSize: 13, color: '#8E8E93', marginTop: 4 },

  /* File list */
  fileList: { paddingHorizontal: 16 },
  fileRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2c2c2e',
  },
  fileRowLast: { borderBottomWidth: 0 },
  fileRowPressed: { backgroundColor: '#535aff12', borderRadius: 10 },
  fileIconWrap: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#535aff18', borderRadius: 10 },
  fileBody: { flex: 1, gap: 5 },
  fileName: { fontSize: 13, fontWeight: '500', color: '#ffffff', lineHeight: 18 },
  fileMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  extBadge: { backgroundColor: '#2c2c2e', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  extBadgeText: { fontSize: 10, fontWeight: '700', color: '#8E8E93', letterSpacing: 0.5 },
  fileSize: { fontSize: 12, color: '#636366' },
});

export default TorrentDetails;