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
      animationType="fade"
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
          {/* Top Grab Handle */}
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          {/* Movie Header Card */}
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
                    color="#00e676"
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
              <Ionicons name="close" size={18} color="#8E8E93" />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Section Header */}
          <Text style={styles.sectionLabel}>CHOOSE VIDEO PLAYER</Text>

          {/* Player Options List */}
          <View style={styles.optionsList}>
            {/* 1. In-App Player */}
            <TouchableOpacity
              style={[styles.playerOption, styles.playerOptionFeatured]}
              onPress={handlePlayInternal}
              activeOpacity={0.7}
            >
              <View style={[styles.iconBox, { backgroundColor: '#535aff' }]}>
                <Ionicons name="play" size={20} color="#ffffff" />
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

              <Ionicons name="chevron-forward" size={18} color="#535aff" />
            </TouchableOpacity>

            {/* 2. VLC Media Player */}
            <TouchableOpacity
              style={styles.playerOption}
              onPress={handleOpenVLC}
              activeOpacity={0.7}
            >
              <View style={[styles.iconBox, { backgroundColor: '#ff8800' }]}>
                <Ionicons name="film" size={20} color="#ffffff" />
              </View>

              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>VLC Media Player</Text>
                <Text style={styles.optionSubtitle}>
                  Hardware acceleration & universal codec support
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={18} color="#48484a" />
            </TouchableOpacity>

            {/* 3. MX Player (Android) */}
            {Platform.OS === 'android' && (
              <TouchableOpacity
                style={styles.playerOption}
                onPress={handleOpenMX}
                activeOpacity={0.7}
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

                <Ionicons name="chevron-forward" size={18} color="#48484a" />
              </TouchableOpacity>
            )}

            {/* 4. Infuse (iOS) */}
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
                activeOpacity={0.7}
              >
                <View style={[styles.iconBox, { backgroundColor: '#ff2d55' }]}>
                  <Ionicons name="flame" size={20} color="#ffffff" />
                </View>

                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Infuse Player</Text>
                  <Text style={styles.optionSubtitle}>
                    HDR, Dolby Atmos & smooth 4K playback on iOS
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={18} color="#48484a" />
              </TouchableOpacity>
            )}

            {/* 5. System Chooser / Other Apps */}
            <TouchableOpacity
              style={styles.playerOption}
              onPress={handleOpenSystem}
              activeOpacity={0.7}
            >
              <View style={[styles.iconBox, { backgroundColor: '#2c2c2e' }]}>
                <Ionicons name="open-outline" size={20} color="#ffffff" />
              </View>

              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Other Video Players...</Text>
                <Text style={styles.optionSubtitle}>
                  Open with any other installed media player
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={18} color="#48484a" />
            </TouchableOpacity>
          </View>

          {/* Cancel Button */}
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleClose}
            activeOpacity={0.7}
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
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheetContainer: {
    width: '100%',
    backgroundColor: '#161618',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderWidth: 1,
    borderColor: '#262628',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 24,
  },
  sheetContainerTablet: {
    maxWidth: 500,
    borderRadius: 26,
    marginBottom: 40,
  },
  handleWrap: {
    alignItems: 'center',
    paddingVertical: 4,
    marginBottom: 10,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3a3a3c',
  },
  movieHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  posterThumbnail: {
    width: 50,
    height: 72,
    borderRadius: 8,
    backgroundColor: '#202022',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  posterFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  movieInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  movieTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 230, 118, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.28)',
  },
  offlineBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00e676',
    letterSpacing: -0.1,
  },
  sizeBadge: {
    backgroundColor: '#26262a',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sizeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
  },
  closeCircleButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#26262a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#232326',
    marginVertical: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  optionsList: {
    gap: 10,
  },
  playerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f1f22',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a2e',
  },
  playerOptionFeatured: {
    backgroundColor: 'rgba(83, 90, 255, 0.08)',
    borderColor: 'rgba(83, 90, 255, 0.35)',
  },
  iconBox: {
    width: 42,
    height: 42,
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
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  recommendedPill: {
    backgroundColor: 'rgba(83, 90, 255, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(83, 90, 255, 0.45)',
  },
  recommendedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7d83ff',
    letterSpacing: 0.2,
  },
  optionSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
    lineHeight: 16,
  },
  cancelButton: {
    backgroundColor: '#202024',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#2e2e32',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#c7c7cc',
  },
});
