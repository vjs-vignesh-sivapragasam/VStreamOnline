import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import { YouTubeVideoDetails, YouTubeFormatOption, YouTubeVideoItem } from '@/services/YouTubeService';

interface QualityPickerModalProps {
  visible: boolean;
  videoItem?: YouTubeVideoItem | null;
  videoDetails: YouTubeVideoDetails | null;
  isLoading: boolean;
  onClose: () => void;
  onSelectFormat: (format: YouTubeFormatOption) => void;
  onPlayFormat?: (format: YouTubeFormatOption) => void;
  isSaved?: boolean;
  onToggleSave?: () => void;
}

const { width } = Dimensions.get('window');

export const QualityPickerModal: React.FC<QualityPickerModalProps> = ({
  visible,
  videoItem,
  videoDetails,
  isLoading,
  onClose,
  onSelectFormat,
  onPlayFormat,
  isSaved = false,
  onToggleSave,
}) => {
  const [isCopied, setIsCopied] = useState(false);

  // Fallback items if details are still fetching or offline
  const fallbackFormats = React.useMemo(() => {
    const videoFormats: YouTubeFormatOption[] = [
      { itag: 22, quality: '720p', container: 'mp4', mimeType: 'video/mp4', url: '', sizeFormatted: 'HD (720p with Audio)', hasAudio: true, hasVideo: true, type: 'video' },
      { itag: 18, quality: '360p', container: 'mp4', mimeType: 'video/mp4', url: '', sizeFormatted: 'Standard (360p with Audio)', hasAudio: true, hasVideo: true, type: 'video' },
    ];
    const audioFormats: YouTubeFormatOption[] = [
      { itag: 140, quality: '128 kbps', container: 'mp3', mimeType: 'audio/mp4', url: '', sizeFormatted: 'High Quality MP3', hasAudio: true, hasVideo: false, type: 'audio' },
      { itag: 141, quality: '160 kbps', container: 'mp3', mimeType: 'audio/mp4', url: '', sizeFormatted: 'Studio Audio MP3', hasAudio: true, hasVideo: false, type: 'audio' },
      { itag: 139, quality: '64 kbps', container: 'mp3', mimeType: 'audio/mp4', url: '', sizeFormatted: 'Fast Audio MP3', hasAudio: true, hasVideo: false, type: 'audio' },
    ];
    return { videoFormats, audioFormats };
  }, []);

  const videoList = React.useMemo(() => {
    const list: YouTubeFormatOption[] = [];
    const map = new Map<string, YouTubeFormatOption>();

    if (videoDetails?.formats) {
      // First add progressive formats (which have video + audio combined)
      for (const f of videoDetails.formats.progressive || []) {
        const q = f.quality || (f.itag === 22 ? '720p' : '360p');
        map.set(q, {
          ...f,
          hasAudio: true,
          hasVideo: true,
          sizeFormatted: f.sizeFormatted || `${q} (Video + Audio)`,
        });
      }
      // Also add videoAdaptive formats for qualities not yet mapped (e.g. 1080p, 480p, etc.)
      for (const f of videoDetails.formats.videoAdaptive || []) {
        const q = f.quality || 'Standard';
        if (!map.has(q)) {
          map.set(q, f);
        }
      }
    }

    if (map.size > 0) {
      list.push(...Array.from(map.values()));
    } else {
      list.push(...fallbackFormats.videoFormats);
    }

    const qualityRank: Record<string, number> = {
      '2160p': 2160,
      '1440p': 1440,
      '1080p': 1080,
      '720p': 720,
      '480p': 480,
      '360p': 360,
      '240p': 240,
      '144p': 144,
    };

    return list.sort((a, b) => {
      const rankA = qualityRank[a.quality] || parseInt(a.quality, 10) || 0;
      const rankB = qualityRank[b.quality] || parseInt(b.quality, 10) || 0;
      return rankB - rankA;
    });
  }, [videoDetails, fallbackFormats]);

  const audioList = React.useMemo(() => {
    let list: YouTubeFormatOption[] = [];

    if (videoDetails?.formats?.audioAdaptive && videoDetails.formats.audioAdaptive.length > 0) {
      const map = new Map<string, YouTubeFormatOption>();
      for (const f of videoDetails.formats.audioAdaptive) {
        const key = `${f.quality}_${f.container}`;
        if (!map.has(key)) {
          map.set(key, { ...f, type: 'audio' as const, container: 'mp3' });
        }
      }
      list = Array.from(map.values()).sort((a, b) => {
        const numA = parseInt(a.quality, 10) || 0;
        const numB = parseInt(b.quality, 10) || 0;
        return numB - numA;
      });
    }

    if (list.length === 0 && videoDetails?.formats?.progressive && videoDetails.formats.progressive.length > 0) {
      const best = videoDetails.formats.progressive[0];
      list.push({
        ...best,
        quality: '128 kbps',
        container: 'mp3',
        type: 'audio' as const,
        sizeFormatted: 'High Quality MP3',
      });
    }

    if (list.length === 0) {
      list = fallbackFormats.audioFormats;
    }

    return list;
  }, [videoDetails, fallbackFormats]);

  if (!visible) return null;

  const displayTitle = videoDetails?.title || videoItem?.title || 'YouTube Video';
  const displayChannel = videoDetails?.channel || videoItem?.channel || 'YouTube';
  const displayId = videoDetails?.id || videoItem?.id || '';
  const displayThumbnail =
    videoDetails?.thumbnail ||
    videoItem?.thumbnail ||
    (displayId ? `https://i.ytimg.com/vi/${displayId}/hqdefault.jpg` : '');

  const handleCopyLink = async () => {
    if (!displayId) return;
    const url = `https://www.youtube.com/watch?v=${displayId}`;
    await Clipboard.setStringAsync(url);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <TouchableOpacity style={styles.backdropDismiss} activeOpacity={1} onPress={onClose} />

        <BlurView intensity={40} tint="dark" style={styles.sheetContainer}>
          {/* Header Bar Indicator */}
          <View style={styles.dragIndicator} />

          {/* Title Row */}
          <View style={styles.sheetHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.sheetTitle}>Download Video & Audio</Text>
              {isLoading && <ActivityIndicator size="small" color="#FF0000" />}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Video Preview Card */}
            <View style={styles.previewCard}>
              {displayThumbnail ? (
                <Image source={{ uri: displayThumbnail }} style={styles.previewThumbnail} />
              ) : (
                <View style={[styles.previewThumbnail, { backgroundColor: '#222222', justifyContent: 'center', alignItems: 'center' }]}>
                  <Ionicons name="videocam-outline" size={24} color="#888888" />
                </View>
              )}
              <View style={styles.previewMeta}>
                <Text style={styles.previewTitle} numberOfLines={2}>
                  {displayTitle}
                </Text>
                <Text style={styles.previewChannel} numberOfLines={1}>
                  {displayChannel}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                  <TouchableOpacity
                    style={[styles.savePillButton, isCopied && styles.savePillButtonActive]}
                    onPress={handleCopyLink}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={isCopied ? 'checkmark' : 'copy-outline'}
                      size={13}
                      color={isCopied ? '#00e676' : '#ffffff'}
                    />
                    <Text style={[styles.savePillText, isCopied && { color: '#00e676' }]}>
                      {isCopied ? 'Copied' : 'Copy link'}
                    </Text>
                  </TouchableOpacity>

                  {onToggleSave && (
                    <TouchableOpacity
                      style={[styles.savePillButton, isSaved && styles.savePillButtonActive]}
                      onPress={onToggleSave}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isSaved ? 'bookmark' : 'bookmark-outline'}
                        size={13}
                        color={isSaved ? '#ffffff' : '#535aff'}
                      />
                      <Text style={[styles.savePillText, isSaved && styles.savePillTextActive]}>
                        {isSaved ? 'Saved to List' : 'Save to List'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>

            {/* ── Section: Video Resolutions ─────────────────────────────────── */}
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="videocam" size={18} color="#FF0000" />
              <Text style={styles.sectionTitle}>Video Downloads (Choose Resolution)</Text>
            </View>

            {videoList.map((f, idx) => (
              <View key={`video_${f.itag}_${idx}`} style={styles.formatItem}>
                <View style={styles.formatBadgeContainer}>
                  <Text style={styles.formatQuality}>{f.quality}</Text>
                  <View style={[styles.tagBadge, f.quality.includes('1080') || f.quality.includes('720') ? { backgroundColor: '#535aff' } : undefined]}>
                    <Text style={styles.tagText}>{f.quality.includes('1080') || f.quality.includes('720') ? 'MP4 HD' : 'MP4'}</Text>
                  </View>
                </View>
                <View style={styles.formatMeta}>
                  <Text style={styles.formatLabel}>
                    {f.quality.includes('1080')
                      ? 'Full HD 1080p Video'
                      : f.quality.includes('720')
                      ? 'High Definition 720p'
                      : f.quality.includes('480')
                      ? 'Standard Definition 480p'
                      : `${f.quality} Video Track`}
                  </Text>
                  <Text style={styles.formatSize}>{f.sizeFormatted || 'Standard file size'}</Text>
                </View>
                <View style={styles.formatActionsRow}>

                  <TouchableOpacity
                    style={styles.actionIconButton}
                    onPress={() => onSelectFormat(f)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="arrow-down-circle" size={28} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* ── Section: Audio Downloads ───────────────────────────────────── */}
            <View style={[styles.sectionHeaderRow, { marginTop: 22 }]}>
              <Ionicons name="musical-notes" size={18} color="#00e5ff" />
              <Text style={styles.sectionTitle}>Audio / MP3 Downloads</Text>
            </View>

            {audioList.map((f, idx) => (
              <View key={`audio_${f.itag}_${idx}`} style={styles.formatItem}>
                <View style={styles.formatBadgeContainer}>
                  <Text style={[styles.formatQuality, { color: '#00e5ff' }]}>{f.quality}</Text>
                  <View style={[styles.tagBadge, { backgroundColor: '#004455' }]}>
                    <Text style={[styles.tagText, { color: '#00e5ff' }]}>MP3 AUDIO</Text>
                  </View>
                </View>
                <View style={styles.formatMeta}>
                  <Text style={styles.formatLabel}>MP3 Music Track (Audio Only)</Text>
                  <Text style={styles.formatSize}>{f.sizeFormatted || 'Audio stream'}</Text>
                </View>
                <View style={styles.formatActionsRow}>

                  <TouchableOpacity
                    style={styles.actionIconButton}
                    onPress={() => onSelectFormat(f)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="arrow-down-circle" size={28} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </BlurView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  backdropDismiss: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: 'rgba(20, 20, 24, 0.96)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    paddingTop: 10,
    paddingBottom: 36,
    maxHeight: '80%',
  },
  dragIndicator: {
    width: 38,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sheetTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  closeButton: {
    padding: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  scrollArea: {
    paddingHorizontal: 16,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  previewCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    padding: 10,
    marginBottom: 18,
    alignItems: 'center',
  },
  previewThumbnail: {
    width: 104,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#111111',
  },
  previewMeta: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  previewTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  previewChannel: {
    color: '#aaaaaa',
    fontSize: 11,
    marginTop: 2,
  },
  savePillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  savePillButtonActive: {
    backgroundColor: 'rgba(83, 90, 255, 0.25)',
  },
  savePillText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '500',
  },
  savePillTextActive: {
    color: '#8c91ff',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    marginTop: 6,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  formatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  formatBadgeContainer: {
    width: 76,
    alignItems: 'flex-start',
  },
  formatQuality: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  tagBadge: {
    backgroundColor: '#333333',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 3,
  },
  tagText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
  },
  formatMeta: {
    flex: 1,
    marginLeft: 8,
  },
  formatLabel: {
    color: '#e0e0e0',
    fontSize: 13,
    fontWeight: '500',
  },
  formatSize: {
    color: '#888888',
    fontSize: 11,
    marginTop: 2,
  },
  formatActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionIconButton: {
    padding: 2,
  },
});
