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
import { YouTubeVideoDetails, YouTubeFormatOption } from '@/services/YouTubeService';

interface QualityPickerModalProps {
  visible: boolean;
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
  videoDetails,
  isLoading,
  onClose,
  onSelectFormat,
  onPlayFormat,
  isSaved = false,
  onToggleSave,
}) => {
  const [isCopied, setIsCopied] = useState(false);

  const filteredVideoAdaptive = React.useMemo(() => {
    if (!videoDetails?.formats?.videoAdaptive) return [];
    const map = new Map<string, YouTubeFormatOption>();
    for (const f of videoDetails.formats.videoAdaptive) {
      const q = f.quality || 'Standard';
      if (!map.has(q) || (f.container === 'mp4' && map.get(q)?.container !== 'mp4')) {
        map.set(q, f);
      }
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
    return Array.from(map.values()).sort((a, b) => {
      const rankA = qualityRank[a.quality] || parseInt(a.quality) || 0;
      const rankB = qualityRank[b.quality] || parseInt(b.quality) || 0;
      return rankB - rankA;
    });
  }, [videoDetails]);

  const filteredAudioAdaptive = React.useMemo(() => {
    if (!videoDetails?.formats?.audioAdaptive) return [];
    const map = new Map<string, YouTubeFormatOption>();
    for (const f of videoDetails.formats.audioAdaptive) {
      const key = `${f.quality}_${f.container}`;
      if (!map.has(key)) {
        map.set(key, f);
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const numA = parseInt(a.quality) || 0;
      const numB = parseInt(b.quality) || 0;
      return numB - numA;
    });
  }, [videoDetails]);

  if (!visible) return null;

  const handleCopyLink = async () => {
    if (!videoDetails) return;
    const url = `https://www.youtube.com/watch?v=${videoDetails.id}`;
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
            <Text style={styles.sheetTitle}>Stream & Download Options</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#FF0000" />
              <Text style={styles.loadingText}>Fetching available stream formats...</Text>
            </View>
          ) : !videoDetails ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={40} color="#ff4444" />
              <Text style={styles.errorText}>Could not load formats for this video.</Text>
            </View>
          ) : (
            <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
              {/* Video Preview Card */}
              <View style={styles.previewCard}>
                <Image source={{ uri: videoDetails.thumbnail }} style={styles.previewThumbnail} />
                <View style={styles.previewMeta}>
                  <Text style={styles.previewTitle} numberOfLines={2}>
                    {videoDetails.title}
                  </Text>
                  <Text style={styles.previewChannel} numberOfLines={1}>
                    {videoDetails.channel}
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

              {/* ── Section: Video Formats ────────────────────────────────────── */}
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="videocam-outline" size={18} color="#FF0000" />
                <Text style={styles.sectionTitle}>Video Streams</Text>
              </View>

              {/* Progressive combined formats (Video + Audio) */}
              {videoDetails.formats.progressive.length > 0 && (
                <>
                  <View style={styles.sectionHeaderRow}>
                    <Ionicons name="play-circle-outline" size={18} color="#FF0000" />
                    <Text style={styles.sectionTitle}>Combined Stream (Video + Audio)</Text>
                  </View>
                  {videoDetails.formats.progressive.map((f, idx) => (
                    <View key={`prog_${f.itag}_${idx}`} style={styles.formatItem}>
                      <View style={styles.formatBadgeContainer}>
                        <Text style={styles.formatQuality}>{f.quality}</Text>
                        <View style={styles.tagBadge}>
                          <Text style={styles.tagText}>{f.container.toUpperCase()}</Text>
                        </View>
                      </View>
                      <View style={styles.formatMeta}>
                        <Text style={styles.formatLabel}>Video + Audio (Ready to play)</Text>
                        <Text style={styles.formatSize}>{f.sizeFormatted}</Text>
                      </View>
                      <View style={styles.formatActionsRow}>
                        {onPlayFormat && (
                          <TouchableOpacity
                            style={styles.actionIconButton}
                            onPress={() => onPlayFormat(f)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="play-circle" size={28} color="#ffffff" />
                          </TouchableOpacity>
                        )}
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
                </>
              )}

              {/* High-res adaptive video formats (4K, 1440p, 1080p, 720p, 480p, etc.) */}
              {filteredVideoAdaptive.length > 0 && (
                <>
                  <View style={[styles.sectionHeaderRow, { marginTop: videoDetails.formats.progressive.length > 0 ? 16 : 4 }]}>
                    <Ionicons name="videocam-outline" size={18} color="#535aff" />
                    <Text style={styles.sectionTitle}>High Definition Video (Choose Quality)</Text>
                  </View>
                  {filteredVideoAdaptive.map((f, idx) => (
                    <View key={`adapt_${f.itag}_${idx}`} style={styles.formatItem}>
                      <View style={styles.formatBadgeContainer}>
                        <Text style={styles.formatQuality}>{f.quality}</Text>
                        <View style={[styles.tagBadge, { backgroundColor: '#333333' }]}>
                          <Text style={styles.tagText}>{f.container.toUpperCase()} HD</Text>
                        </View>
                      </View>
                      <View style={styles.formatMeta}>
                        <Text style={styles.formatLabel}>HD Video Track</Text>
                        <Text style={styles.formatSize}>{f.sizeFormatted}</Text>
                      </View>
                      <View style={styles.formatActionsRow}>
                        {onPlayFormat && (
                          <TouchableOpacity
                            style={styles.actionIconButton}
                            onPress={() => onPlayFormat(f)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="play-circle" size={28} color="#ffffff" />
                          </TouchableOpacity>
                        )}
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
                </>
              )}

              {/* ── Section: Audio Formats ────────────────────────────────────── */}
              <View style={[styles.sectionHeaderRow, { marginTop: 20 }]}>
                <Ionicons name="musical-notes-outline" size={18} color="#00ffff" />
                <Text style={styles.sectionTitle}>Audio Only (Music / Podcast)</Text>
              </View>

              {filteredAudioAdaptive.length === 0 ? (
                <Text style={styles.emptyText}>No separate audio streams found.</Text>
              ) : (
                filteredAudioAdaptive.map((f, idx) => (
                  <View key={`audio_${f.itag}_${idx}`} style={styles.formatItem}>
                    <View style={styles.formatBadgeContainer}>
                      <Text style={[styles.formatQuality, { color: '#00ffff' }]}>{f.quality}</Text>
                      <View style={[styles.tagBadge, { backgroundColor: '#004455' }]}>
                        <Text style={[styles.tagText, { color: '#00ffff' }]}>M4A AUDIO</Text>
                      </View>
                    </View>
                    <View style={styles.formatMeta}>
                      <Text style={styles.formatLabel}>High-Quality AAC Audio</Text>
                      <Text style={styles.formatSize}>{f.sizeFormatted}</Text>
                    </View>
                    <View style={styles.formatActionsRow}>
                      {onPlayFormat && (
                        <TouchableOpacity
                          style={styles.actionIconButton}
                          onPress={() => onPlayFormat(f)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="play-circle" size={28} color="#00ffff" />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.actionIconButton}
                        onPress={() => onSelectFormat(f)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="arrow-down-circle" size={28} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          )}
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
    maxHeight: '75%',
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
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  closeButton: {
    padding: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  loadingContainer: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 14,
    color: '#aaaaaa',
    fontSize: 14,
  },
  errorContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#ff6666',
    fontSize: 14,
    marginTop: 8,
  },
  scrollArea: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  previewCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 10,
    marginBottom: 16,
    alignItems: 'center',
  },
  previewThumbnail: {
    width: 80,
    height: 45,
    borderRadius: 6,
    backgroundColor: '#333333',
  },
  previewMeta: {
    flex: 1,
    marginLeft: 12,
  },
  previewTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  previewChannel: {
    color: '#aaaaaa',
    fontSize: 12,
    marginTop: 3,
  },
  savePillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(83, 90, 255, 0.15)',
    borderWidth: 1,
    borderColor: '#535aff',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
    gap: 4,
  },
  savePillButtonActive: {
    backgroundColor: '#535aff',
  },
  savePillText: {
    color: '#535aff',
    fontSize: 11,
    fontWeight: '700',
  },
  savePillTextActive: {
    color: '#ffffff',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e0e0e0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  formatBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 80,
    gap: 6,
  },
  formatQuality: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  tagBadge: {
    backgroundColor: 'rgba(255, 0, 0, 0.3)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
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
    color: '#dddddd',
    fontSize: 12,
  },
  formatSize: {
    color: '#888888',
    fontSize: 11,
    marginTop: 2,
  },
  formatActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginLeft: 8,
  },
  actionIconButton: {
    padding: 2,
  },
  emptyText: {
    color: '#777777',
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
});
