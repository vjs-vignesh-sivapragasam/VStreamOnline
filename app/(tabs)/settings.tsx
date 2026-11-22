import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { StyleSheet, Pressable, View, ScrollView, Modal, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { StatusBar, Text } from '@/components/Themed';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSpacing from '@/components/BottomSpacing';
import Constants from 'expo-constants';
import BlurGradientBackground from '@/components/BlurGradientBackground';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeSelector } from '@/components/settings/ThemeSelector';
import { StorageCleanupCard } from '@/components/settings/StorageCleanupCard';
import { dataConsumptionService, DataConsumptionStats } from '@/services/DataConsumptionService';
import { storageCleanupService } from '@/services/StorageCleanupService';
import { tamilMVNotificationService } from '@/services/TamilMVNotificationService';
import { isScreenKeepAwakeEnabled, isBackgroundAudioKeepAliveEnabled } from '@/utils/StremioKeepAliveManager';
import { addonService } from '@/services/AddonService';

const { width } = Dimensions.get('window');

interface SettingItemConfig {
  title: string;
  route?: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBg?: string;
  subtitle?: string;
  badgeText?: string;
  badgeColor?: string;
  onPress?: () => void;
}

export default function SettingsScreen() {
  const router = useRouter();
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const { theme } = useTheme();

  // Modals for Theme Selection & Storage Cleanup
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [storageModalVisible, setStorageModalVisible] = useState(false);
  const [dataStats, setDataStats] = useState<DataConsumptionStats | null>(null);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [screenKeepAwake, setScreenKeepAwake] = useState(true);
  const [bgAudioKeepAlive, setBgAudioKeepAlive] = useState(false);
  const [addonsCount, setAddonsCount] = useState(() => addonService.getEnabledAddons().length);

  // Fast, non-blocking stats loader
  const loadDataStats = useCallback(async () => {
    try {
      const stats = await dataConsumptionService.getDataConsumptionStats();
      setDataStats(stats);
    } catch (err) {
      console.warn('[Settings] Failed to load data consumption stats:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setNotifEnabled(tamilMVNotificationService.isNotificationsEnabled());
      setScreenKeepAwake(isScreenKeepAwakeEnabled());
      setBgAudioKeepAlive(isBackgroundAudioKeepAliveEnabled());
      setAddonsCount(addonService.getEnabledAddons().length);
      loadDataStats();
    }, [loadDataStats])
  );

  const triggerHaptic = async (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(style);
    }
  };

  const navigateTo = async (route: string) => {
    await triggerHaptic();
    router.push(route as any);
  };

  // ── Setting Item Component with Ultra-Smooth Press State ──
  const SettingItem = ({
    item,
    isFirst = false,
    isLast = false,
  }: {
    item: SettingItemConfig;
    isFirst?: boolean;
    isLast?: boolean;
  }) => {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.settingItem,
          {
            backgroundColor: pressed ? 'rgba(255, 255, 255, 0.08)' : 'rgba(25, 25, 28, 0.7)',
            borderTopLeftRadius: isFirst ? 16 : 0,
            borderTopRightRadius: isFirst ? 16 : 0,
            borderBottomLeftRadius: isLast ? 16 : 0,
            borderBottomRightRadius: isLast ? 16 : 0,
          },
        ]}
        onPress={item.onPress ? item.onPress : () => item.route && navigateTo(item.route)}
      >
        <View style={styles.leftContent}>
          <View
            style={[
              styles.iconContainer,
              {
                backgroundColor: item.iconBg || (item.iconColor ? item.iconColor + '18' : theme.iconBg || 'rgba(255,255,255,0.06)'),
              },
            ]}
          >
            <Ionicons name={item.icon} size={20} color={item.iconColor || theme.primary} />
          </View>
          <View style={styles.itemTextContainer}>
            <Text style={styles.settingText}>{item.title}</Text>
            {item.subtitle ? <Text style={styles.settingSubtitle} numberOfLines={1}>{item.subtitle}</Text> : null}
          </View>
        </View>

        <View style={styles.rightContent}>
          {item.badgeText ? (
            <View
              style={[
                styles.menuBadge,
                {
                  backgroundColor: (item.badgeColor || theme.primary) + '1A',
                  borderColor: (item.badgeColor || theme.primary) + '3A',
                },
              ]}
            >
              <View style={[styles.menuBadgeDot, { backgroundColor: item.badgeColor || theme.primary }]} />
              <Text style={[styles.menuBadgeText, { color: item.badgeColor || theme.primary }]}>
                {item.badgeText}
              </Text>
            </View>
          ) : null}
          <MaterialIcons name="chevron-right" size={20} color="#6E6E73" />
        </View>

        {!isLast && <View style={styles.separator} />}
      </Pressable>
    );
  };

  // ── Sections Configuration ──
  const streamingItems: SettingItemConfig[] = [
    {
      title: 'Streaming Engine',
      subtitle: screenKeepAwake ? 'Port 11470 • Screen keep-awake active' : 'Port 11470 • Embedded Node.js engine',
      route: '/settings/stremioserver',
      icon: 'server-outline',
      iconColor: '#30d158',
      badgeText: 'Active',
      badgeColor: '#30d158',
    },
    {
      title: 'Stremio Addons',
      subtitle: addonsCount > 0 ? `${addonsCount} active • Catalogs, torrent streams & community plugins` : 'Install Cinemeta, Torrentio & community plugins',
      route: '/settings/addons',
      icon: 'extension-puzzle-outline',
      iconColor: '#ff2d55',
      badgeText: addonsCount > 0 ? `${addonsCount} Active` : undefined,
      badgeColor: '#ff2d55',
    },
    {
      title: 'YouTube Preferences',
      subtitle: 'Hero banner fit, player quality & watch history',
      route: '/youtubeSettings',
      icon: 'logo-youtube',
      iconColor: '#FF0000',
    },
    {
      title: 'Movie Mirrors & Alerts',
      subtitle: notifEnabled ? 'Mirror domain active • Push alerts enabled' : 'Mirror domain & push notification alerts',
      route: '/settings/tamilmv',
      icon: 'globe-outline',
      iconColor: '#0a84ff',
      badgeText: notifEnabled ? 'Alerts On' : undefined,
      badgeColor: '#30d158',
    },
  ];

  const metadataItems: SettingItemConfig[] = [
    {
      title: 'The Movie Database (TMDB)',
      subtitle: 'Posters, descriptions, ratings & API setup',
      route: '/settings/tmdb',
      icon: 'film-outline',
      iconColor: '#01b4e4',
    },
    {
      title: 'OpenSubtitles',
      subtitle: 'Multi-language subtitle search & auto-fetch',
      route: '/settings/opensubtitles',
      icon: 'chatbox-ellipses-outline',
      iconColor: '#ffd60a',
    },
  ];

  const storageItems: SettingItemConfig[] = [
    {
      title: 'Storage & Data Manager',
      subtitle: dataStats
        ? `${dataStats.todayFormatted} today • ${dataStats.overallFormatted} all-time`
        : 'Manage downloads, app cache & cleanup',
      icon: 'pie-chart-outline',
      iconColor: '#bf5af2',
      badgeText: dataStats?.todayFormatted || undefined,
      badgeColor: '#bf5af2',
      onPress: () => {
        triggerHaptic();
        setStorageModalVisible(true);
      },
    },
  ];

  const appearanceItems: SettingItemConfig[] = [
    {
      title: 'Theme & Accent Color',
      subtitle: `${theme.displayName || theme.name} theme active`,
      icon: 'color-palette-outline',
      iconColor: theme.primary,
      badgeText: theme.displayName || theme.name,
      badgeColor: theme.primary,
      onPress: () => {
        triggerHaptic();
        setThemeModalVisible(true);
      },
    },
  ];

  const supportItems: SettingItemConfig[] = [
    {
      title: 'Buy Me a Coffee',
      subtitle: 'Support VPLEX development via UPI (GPay / PhonePe)',
      route: '/settings/coffee',
      icon: 'cafe-outline',
      iconColor: '#FF9F0A',
      badgeText: 'Support ❤️',
      badgeColor: '#FF9F0A',
    },
    {
      title: 'About VPLEX',
      subtitle: `v${appVersion} • Open source streaming player`,
      route: '/settings/about',
      icon: 'information-circle-outline',
      iconColor: '#8E8E93',
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar />
      <BlurGradientBackground />
      <ScrollView
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Modern Header Title ──────────────────────────────── */}
        <View style={styles.headerContainer}>
          <View>
            <Text style={styles.headerTitle}>Settings</Text>
            <Text style={styles.headerSubtitle}>Preferences, streaming engine & storage</Text>
          </View>
          <View style={[styles.headerVersionPill, { borderColor: theme.primary + '33' }]}>
            <View style={[styles.headerVersionDot, { backgroundColor: theme.primary }]} />
            <Text style={[styles.headerVersionText, { color: theme.primary }]}>v{appVersion}</Text>
          </View>
        </View>

        {/* ── 2. Quick Stat Tiles (Engine, Data & Theme) ───────────── */}
        <View style={styles.quickStatsRow}>
          {/* Tile 1: Streaming Server */}
          <TouchableOpacity
            style={styles.quickStatTile}
            activeOpacity={0.7}
            onPress={() => navigateTo('/settings/stremioserver')}
          >
            <View style={styles.statTileHeader}>
              <View style={[styles.statTileIcon, { backgroundColor: '#30d1581A' }]}>
                <Ionicons name="server" size={14} color="#30d158" />
              </View>
              <View style={styles.statLiveBadge}>
                <View style={styles.statLiveDot} />
                <Text style={styles.statLiveText}>Online</Text>
              </View>
            </View>
            <Text style={styles.statTileValue}>Port 11470</Text>
            <Text style={styles.statTileLabel}>Streaming Server</Text>
          </TouchableOpacity>

          {/* Tile 2: Today's Data (Zero-lag tap to Storage modal) */}
          <TouchableOpacity
            style={styles.quickStatTile}
            activeOpacity={0.7}
            onPress={() => {
              triggerHaptic();
              setStorageModalVisible(true);
            }}
          >
            <View style={styles.statTileHeader}>
              <View style={[styles.statTileIcon, { backgroundColor: '#bf5af21A' }]}>
                <Ionicons name="cloud-download" size={14} color="#bf5af2" />
              </View>
              <Ionicons name="chevron-forward" size={12} color="#8E8E93" />
            </View>
            <Text style={styles.statTileValue} numberOfLines={1}>
              {dataStats?.todayFormatted || '0 B'}
            </Text>
            <Text style={styles.statTileLabel}>Data Today</Text>
          </TouchableOpacity>

          {/* Tile 3: Active Theme */}
          <TouchableOpacity
            style={styles.quickStatTile}
            activeOpacity={0.7}
            onPress={() => {
              triggerHaptic();
              setThemeModalVisible(true);
            }}
          >
            <View style={styles.statTileHeader}>
              <View style={[styles.statTileIcon, { backgroundColor: theme.primary + '1A' }]}>
                <Ionicons name="color-palette" size={14} color={theme.primary} />
              </View>
              <View style={[styles.themeSwatchSmall, { backgroundColor: theme.primary }]} />
            </View>
            <Text style={[styles.statTileValue, { color: theme.primaryLight || theme.primary }]} numberOfLines={1}>
              {theme.displayName || theme.name}
            </Text>
            <Text style={styles.statTileLabel}>Accent Theme</Text>
          </TouchableOpacity>
        </View>

        {/* ── 3. Streaming & Playback Section ─────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>STREAMING & PLAYBACK</Text>
          <View style={styles.settingsGroup}>
            {streamingItems.map((item, index) => (
              <SettingItem
                key={item.title}
                item={item}
                isFirst={index === 0}
                isLast={index === streamingItems.length - 1}
              />
            ))}
          </View>
        </View>

        {/* ── 4. Storage & Performance (Zero Lag) ──────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>STORAGE & DATA</Text>
          <View style={styles.settingsGroup}>
            {storageItems.map((item, index) => (
              <SettingItem
                key={item.title}
                item={item}
                isFirst={index === 0}
                isLast={index === storageItems.length - 1}
              />
            ))}
          </View>
        </View>

        {/* ── 5. Metadata & Subtitles Section ─────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>METADATA & SUBTITLES</Text>
          <View style={styles.settingsGroup}>
            {metadataItems.map((item, index) => (
              <SettingItem
                key={item.title}
                item={item}
                isFirst={index === 0}
                isLast={index === metadataItems.length - 1}
              />
            ))}
          </View>
        </View>

        {/* ── 6. Appearance & Customization Section ────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>APPEARANCE</Text>
          <View style={styles.settingsGroup}>
            {appearanceItems.map((item, index) => (
              <SettingItem
                key={item.title}
                item={item}
                isFirst={index === 0}
                isLast={index === appearanceItems.length - 1}
              />
            ))}
          </View>
        </View>

        {/* ── 7. Support & About Section ──────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>SUPPORT & ABOUT</Text>
          <View style={styles.settingsGroup}>
            {supportItems.map((item, index) => (
              <SettingItem
                key={item.title}
                item={item}
                isFirst={index === 0}
                isLast={index === supportItems.length - 1}
              />
            ))}
          </View>
        </View>

        {/* ── 8. Watermark Brand Footer ───────────────────────────── */}
        <View style={styles.versionContainer}>
          <Ionicons name="sparkles" size={14} color={theme.primary} style={{ opacity: 0.8 }} />
          <Text style={styles.versionText}>VPLEX Stream • Version {appVersion}</Text>
        </View>

        <BottomSpacing space={60} />
      </ScrollView>

      {/* ── Theme Selection Popup Modal ────────────────────────────── */}
      <Modal
        visible={themeModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setThemeModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismissArea} onPress={() => setThemeModalVisible(false)} />
          <BlurView intensity={50} tint="dark" style={styles.popupSheet}>
            <View style={styles.modalDragHandle} />
            <View style={styles.popupHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[styles.popupIconBox, { backgroundColor: theme.primary + '20' }]}>
                  <Ionicons name="color-palette" size={20} color={theme.primary} />
                </View>
                <View>
                  <Text style={styles.popupTitle}>Theme Selection</Text>
                  <Text style={styles.popupSubtitle}>Personalize accent colors</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setThemeModalVisible(false)}
                style={styles.popupCloseButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.popupScroll}
              contentContainerStyle={styles.popupScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <ThemeSelector showPreviewBar={false} showNavigationLink={true} />
            </ScrollView>
          </BlurView>
        </View>
      </Modal>

      {/* ── Storage & Data Cleanup Popup Modal (Zero-Lag) ──────────── */}
      <Modal
        visible={storageModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setStorageModalVisible(false);
          loadDataStats();
        }}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalDismissArea}
            onPress={() => {
              setStorageModalVisible(false);
              loadDataStats();
            }}
          />
          <BlurView intensity={50} tint="dark" style={styles.popupSheet}>
            <View style={styles.modalDragHandle} />
            <View style={styles.popupHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[styles.popupIconBox, { backgroundColor: '#bf5af220' }]}>
                  <Ionicons name="pie-chart" size={20} color="#bf5af2" />
                </View>
                <View>
                  <Text style={styles.popupTitle}>Storage & Data Cleanup</Text>
                  <Text style={styles.popupSubtitle}>Manage cache, history & downloads</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setStorageModalVisible(false);
                  loadDataStats();
                }}
                style={styles.popupCloseButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.popupScroll}
              contentContainerStyle={styles.popupScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <StorageCleanupCard onStatsChange={loadDataStats} />
            </ScrollView>
          </BlurView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: 40,
    maxWidth: 780,
    width: '100%',
    alignSelf: 'center',
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  headerVersionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    gap: 6,
  },
  headerVersionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerVersionText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Quick Stat Tiles ──────────────────────────────────────────────
  quickStatsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 26,
    gap: 10,
  },
  quickStatTile: {
    flex: 1,
    backgroundColor: 'rgba(25, 25, 28, 0.75)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  statTileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statTileIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(48, 209, 88, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
  },
  statLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#30d158',
  },
  statLiveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#30d158',
  },
  themeSwatchSmall: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  statTileValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  statTileLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#8E8E93',
  },

  // ── Sections & Grouped Rows ───────────────────────────────────────
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#8E8E93',
    marginBottom: 8,
    marginHorizontal: 20,
    letterSpacing: 0.6,
  },
  settingsGroup: {
    marginHorizontal: 16,
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  settingItem: {
    flexDirection: 'row',
    paddingVertical: 13,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 56,
    position: 'relative',
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 14,
  },
  iconContainer: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemTextContainer: {
    flex: 1,
  },
  settingText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  settingSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
    lineHeight: 16,
  },
  rightContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  separator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    left: 64,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  menuBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
  },
  menuBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  menuBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Footer ────────────────────────────────────────────────────────
  versionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 6,
  },
  versionText: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },

  // ── Modals / Bottom Sheets ────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  popupSheet: {
    maxHeight: '88%',
    backgroundColor: 'rgba(18, 18, 22, 0.96)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  modalDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  popupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  popupIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
  popupSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 1,
  },
  popupCloseButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupScroll: {
    flexGrow: 0,
  },
  popupScrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
});
