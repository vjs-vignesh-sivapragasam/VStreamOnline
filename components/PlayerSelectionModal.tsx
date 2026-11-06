import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Image,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import {
  externalPlayerService,
  PlayerModalData,
} from '@/utils/ExternalPlayerService';

function formatSize(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

export const PlayerSelectionModal: React.FC = () => {
  const [data, setData] = useState<PlayerModalData | null>(null);
  const { width } = useWindowDimensions();
  const isTabletOrDesktop = width >= 600;

  useEffect(() => {
    return externalPlayerService.registerModalListener((modalData) => {
      setData(modalData);
    });
  }, []);

  if (!data) return null;

  const handleClose = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setData(null);
  };

  const handlePlayInternal = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const fn = data.onPlayInternal;
    setData(null);
    fn();
  };

  const handleOpenVLC = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const { fileUri, title } = data;
    setData(null);
    await externalPlayerService.openInVLC(fileUri, title);
  };

  const handleOpenMX = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const { fileUri, title } = data;
    setData(null);
    await externalPlayerService.openInMXPlayer(fileUri, title);
  };

  const handleOpenSystem = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const { fileUri, title } = data;
    setData(null);
    await externalPlayerService.openWithSystemChooser(fileUri, title);
  };

  const formattedSize = formatSize(data.fileLength);

  return (
    <Modal
      visible={Boolean(data)}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <View
          style={[
            styles.sheetContainer,
            isTabletOrDesktop && styles.sheetContainerTablet,
          ]}
        >
          {/* Subtle Top Grab Handle */}
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          {/* Compact Movie Header Card */}
          <View style={styles.movieHeader}>
            {data.poster ? (
              <Image
                source={{ uri: data.poster }}
                style={styles.posterThumbnail}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.posterThumbnail, styles.posterFallback]}>
                <Ionicons name="film-outline" size={24} color="#8E8E93" />
              </View>
            )}

            <View style={styles.movieInfo}>
              <Text style={styles.movieTitle} numberOfLines={2}>
                {data.title}
              </Text>

              <View style={styles.badgeRow}>
                <View style={styles.offlineBadge}>
                  <Ionicons
                    name="checkmark-circle"
                    size={12}
                    color="#34c759"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.offlineBadgeText}>Downloaded</Text>
                </View>

                {formattedSize && (
                  <View style={styles.sizeBadge}>
                    <Text style={styles.sizeBadgeText}>{formattedSize}</Text>
                  </View>
                )}
              </View>
            </View>

            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeCircleButton}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={17} color="rgba(255, 255, 255, 0.75)" />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Section Header */}
          <Text style={styles.sectionLabel}>CHOOSE VIDEO PLAYER</Text>

          {/* Player Options Cards */}
          <View style={styles.optionsList}>
            {/* 1. In-App Player (Recommended) */}
            <TouchableOpacity
              style={[styles.playerOption, styles.playerOptionFeatured]}
              onPress={handlePlayInternal}
              activeOpacity={0.75}
            >
              <View style={[styles.iconBox, { backgroundColor: '#535aff' }]}>
                <Ionicons name="play" size={22} color="#ffffff" style={{ marginLeft: 2 }} />
              </View>

              <View style={styles.optionContent}>
                <View style={styles.optionTitleRow}>
                  <Text style={styles.optionTitle}>In-App Player</Text>
                  <View style={styles.recommendedPill}>
                    <Text style={styles.recommendedText}>Recommended</Text>
                  </View>
                </View>
                <Text style={styles.optionSubtitle}>
                  Subtitles, gesture controls & background audio
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={18} color="#7b82ff" />
            </TouchableOpacity>

            {/* 2. VLC Media Player */}
            <TouchableOpacity
              style={styles.playerOption}
              onPress={handleOpenVLC}
              activeOpacity={0.75}
            >
              <View style={[styles.iconBox, { backgroundColor: '#ff9500' }]}>
                <Ionicons name="film" size={21} color="#ffffff" />
              </View>

              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>VLC Media Player</Text>
                <Text style={styles.optionSubtitle}>
                  Hardware acceleration & universal codec support
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={17} color="rgba(255, 255, 255, 0.3)" />
            </TouchableOpacity>

            {/* 3. MX Player (Android) */}
            {Platform.OS === 'android' && (
              <TouchableOpacity
                style={styles.playerOption}
                onPress={handleOpenMX}
                activeOpacity={0.75}
              >
                <View style={[styles.iconBox, { backgroundColor: '#007aff' }]}>
                  <Ionicons name="play-forward" size={20} color="#ffffff" />
                </View>

                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>MX Player</Text>
                  <Text style={styles.optionSubtitle}>
                    HW+ decoder, audio boost & zoom gestures
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={17} color="rgba(255, 255, 255, 0.3)" />
              </TouchableOpacity>
            )}

            {/* 4. Infuse Player (iOS) */}
            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={styles.playerOption}
                onPress={async () => {
                  if (await isHapticsSupported()) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }
                  const { fileUri, title } = data;
                  setData(null);
                  await externalPlayerService.openInInfuse(fileUri, title);
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.iconBox, { backgroundColor: '#ff2d55' }]}>
                  <Ionicons name="flame" size={21} color="#ffffff" />
                </View>

                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Infuse Player</Text>
                  <Text style={styles.optionSubtitle}>
                    HDR, Dolby Atmos & smooth 4K playback on iOS
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={17} color="rgba(255, 255, 255, 0.3)" />
              </TouchableOpacity>
            )}

            {/* 5. Other Video Players... */}
            <TouchableOpacity
              style={styles.playerOption}
              onPress={handleOpenSystem}
              activeOpacity={0.75}
            >
              <View style={[styles.iconBox, { backgroundColor: '#343438' }]}>
                <Ionicons name="open-outline" size={20} color="#ffffff" />
              </View>

              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Other Video Players...</Text>
                <Text style={styles.optionSubtitle}>
                  Open with any other installed media player
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={17} color="rgba(255, 255, 255, 0.3)" />
            </TouchableOpacity>
          </View>

          {/* Full-width Cancel Button */}
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleClose}
            activeOpacity={0.75}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheetContainer: {
    width: '100%',
    backgroundColor: '#18181a',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.09)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 25,
  },
  sheetContainerTablet: {
    maxWidth: 480,
    width: '92%',
    borderRadius: 28,
    marginBottom: 'auto',
    marginTop: 'auto',
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  handleWrap: {
    alignItems: 'center',
    paddingVertical: 2,
    marginBottom: 12,
  },
  handle: {
    width: 38,
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  movieHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  posterThumbnail: {
    width: 52,
    height: 74,
    borderRadius: 10,
    backgroundColor: '#242428',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  posterFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  movieInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 10,
    justifyContent: 'center',
  },
  movieTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.3,
    lineHeight: 21,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
    gap: 8,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  offlineBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#34c759',
    letterSpacing: -0.1,
  },
  sizeBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  sizeBadgeText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.65)',
  },
  closeCircleButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    marginVertical: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.42)',
    letterSpacing: 0.8,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  optionsList: {
    gap: 10,
  },
  playerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  playerOptionFeatured: {
    backgroundColor: 'rgba(83, 90, 255, 0.09)',
    borderWidth: 1.5,
    borderColor: '#535aff',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  optionContent: {
    flex: 1,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  recommendedPill: {
    backgroundColor: '#535aff',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  recommendedText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  optionSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.52)',
    marginTop: 2.5,
    lineHeight: 16,
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
});
