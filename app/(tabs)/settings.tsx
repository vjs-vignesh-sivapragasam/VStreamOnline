import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Pressable,
  View,
  ScrollView,
  Modal,
  TouchableOpacity,
  Platform,
} from 'react-native';
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
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeSelector } from '@/components/settings/ThemeSelector';
import { StorageCleanupCard } from '@/components/settings/StorageCleanupCard';
import { dataConsumptionService, DataConsumptionStats } from '@/services/DataConsumptionService';
import { tamilMVNotificationService } from '@/services/TamilMVNotificationService';
import {
  isScreenKeepAwakeEnabled,
  isBackgroundAudioKeepAliveEnabled,
} from '@/utils/StremioKeepAliveManager';
import { addonService } from '@/services/AddonService';

const PopupSheet: React.FC<{ children: React.ReactNode; style: any }> = ({ children, style }) => {
  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={45} tint="dark" style={style}>
        {children}
      </BlurView>
    );
  }
  return <View style={style}>{children}</View>;
};

interface SettingItemProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  subtitle?: string;
  badgeText?: string;
  badgeColor?: string;
  onPress: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}

const SettingItem: React.FC<SettingItemProps> = ({
  title,
  icon,
  iconColor,
  subtitle,
  badgeText,
  badgeColor,
  onPress,
  isFirst = false,
  isLast = false,
}) => {
  const { theme } = useTheme();
  const [isPressed, setIsPressed] = useState(false);

  return (
    <Pressable
      style={[
        styles.settingItem,
        {
          backgroundColor: isPressed ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
          borderTopLeftRadius: isFirst ? 18 : 0,
          borderTopRightRadius: isFirst ? 18 : 0,
          borderBottomLeftRadius: isLast ? 18 : 0,
          borderBottomRightRadius: isLast ? 18 : 0,
        },
      ]}
      onPress={onPress}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
    >
      <View style={styles.leftContent}>
        <View style={[styles.iconContainer, { backgroundColor: theme.iconBg || 'rgba(255,255,255,0.08)' }]}>
          <Ionicons name={icon} size={20} color={iconColor || theme.primary} />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.settingText}>{title}</Text>
          {subtitle ? <Text style={styles.settingSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.rightContent}>
        {badgeText ? (
          <View
            style={[
              styles.menuBadge,
              {
                backgroundColor: (badgeColor || theme.primary) + '18',
                borderColor: (badgeColor || theme.primary) + '40',
              },
            ]}
          >
            <View style={[styles.menuBadgeDot, { backgroundColor: badgeColor || theme.primary }]} />
            <Text style={[styles.menuBadgeText, { color: badgeColor || theme.primary }]}>
              {badgeText}
            </Text>
          </View>
        ) : null}
        <MaterialIcons name="chevron-right" size={22} color="rgba(255, 255, 255, 0.3)" />
      </View>
      {!isLast && <View style={styles.separator} />}
    </Pressable>
  );
};

const SettingsScreen = () => {
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

  const loadDataStats = useCallback(async (force = false) => {
    try {
      const stats = await dataConsumptionService.getDataConsumptionStats(force);
      setDataStats(stats);
    } catch (err) {
      console.warn('[Settings] Failed to load data consumption stats:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // 1. Fast synchronous updates (immediate UI response)
      setNotifEnabled(tamilMVNotificationService.isNotificationsEnabled());
      setScreenKeepAwake(isScreenKeepAwakeEnabled());
      setBgAudioKeepAlive(isBackgroundAudioKeepAliveEnabled());
      setAddonsCount(addonService.getEnabledAddons().length);

      // 2. Defer heavy I/O calculation until after tab transition completes
      const timer = setTimeout(() => {
        loadDataStats();
      }, 100);

      return () => clearTimeout(timer);
    }, [loadDataStats])
  );

  const triggerHaptic = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const onSettingsItemPress = async (route: string) => {
    await triggerHaptic();
    router.push({ pathname: route as any });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar />
      <BlurGradientBackground />
      <ScrollView
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header */}
        <View style={styles.headerContainer}>
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSubtitle}>Preferences, streaming engine & system</Text>
        </View>

        {/* Hero Branding & Live Status Card */}
        <View style={styles.heroCardWrapper}>
          <LinearGradient
            colors={['rgba(35, 35, 45, 0.75)', 'rgba(18, 18, 24, 0.95)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroTopRow}>
              <View
                style={[
                  styles.heroAppBadge,
                  {
                    backgroundColor: theme.primary + '18',
                    borderColor: theme.primary + '40',
                  },
                ]}
              >
                <Ionicons name="film" size={24} color={theme.primary} />
              </View>
              <View style={styles.heroInfo}>
                <View style={styles.heroTitleRow}>
                  <Text style={styles.heroTitle}>VStream Online</Text>
                  <View style={[styles.heroPill, { backgroundColor: theme.primary + '22' }]}>
                    <Text style={[styles.heroPillText, { color: theme.primary }]}>PRO</Text>
                  </View>
                </View>
                <Text style={styles.heroVersionText}>
                  v{appVersion} • Hybrid Streaming Client
                </Text>
              </View>
            </View>

            {/* Quick Status Chips */}
            <View style={styles.heroDivider} />
            <View style={styles.heroChipsRow}>
              <View style={styles.statusChip}>
                <View style={[styles.statusDot, { backgroundColor: '#30d158' }]} />
                <Text style={styles.statusChipText}>Engine Online</Text>
              </View>
              <View style={styles.statusChip}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: notifEnabled ? '#30d158' : '#8E8E93' },
                  ]}
                />
                <Text style={styles.statusChipText}>
                  {notifEnabled ? 'Alerts On' : 'Alerts Off'}
                </Text>
              </View>
              <View style={styles.statusChip}>
                <View style={[styles.statusDot, { backgroundColor: theme.primary }]} />
                <Text style={styles.statusChipText} numberOfLines={1}>
                  {theme.displayName || theme.name}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Section 1: Appearance & Theme */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>APPEARANCE & DISPLAY</Text>
          <View style={styles.settingsGroup}>
            <SettingItem
              title="Theme Selection"
              icon="color-palette-outline"
              subtitle="Personalize accent colors & dark theme"
              badgeText={theme.displayName || theme.name}
              badgeColor={theme.primary}
              onPress={async () => {
                await triggerHaptic();
                setThemeModalVisible(true);
              }}
              isFirst={true}
              isLast={true}
            />
          </View>
        </View>

        {/* Section 2: Storage & Data Saver */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>STORAGE & DATA SAVER</Text>
          <View style={styles.settingsGroup}>
            <SettingItem
              title="Storage & Data Saver"
              icon="pie-chart-outline"
              subtitle={
                dataStats
                  ? `${dataStats.todayFormatted} today • ${dataStats.overallFormatted} total`
                  : 'Manage cache, offline media & disk usage'
              }
              badgeText={dataStats ? dataStats.todayFormatted : undefined}
              badgeColor="#30d158"
              onPress={async () => {
                await triggerHaptic();
                setStorageModalVisible(true);
              }}
              isFirst={true}
              isLast={true}
            />
          </View>
        </View>

        {/* Section 3: Connection & Alerts */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>SERVICES & NOTIFICATIONS</Text>
          <View style={styles.settingsGroup}>
            <SettingItem
              title="Connection & Movie Alerts"
              icon="globe-outline"
              subtitle="Mirror domain, background sync & push notifications"
              badgeText={notifEnabled ? 'Alerts On' : undefined}
              badgeColor="#30d158"
              onPress={() => onSettingsItemPress('/settings/tamilmv')}
              isFirst={true}
              isLast={true}
            />
          </View>
        </View>

        {/* Section 4: Streaming & Integrations */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>STREAMING ENGINE & INTEGRATIONS</Text>
          <View style={styles.settingsGroup}>
            <SettingItem
              title="Streaming Server"
              icon="server-outline"
              subtitle={
                screenKeepAwake
                  ? 'Keep-awake active • Local streaming engine'
                  : 'Streaming engine configuration'
              }
              badgeText={screenKeepAwake ? 'Keep Awake On' : undefined}
              badgeColor="#30d158"
              onPress={() => onSettingsItemPress('/settings/stremioserver')}
              isFirst={true}
              isLast={false}
            />
            <SettingItem
              title="Stremio Addons"
              icon="extension-puzzle-outline"
              iconColor="#ff2d55"
              subtitle={
                addonsCount > 0
                  ? `${addonsCount} active • Catalogs, torrent streams & community plugins`
                  : 'Install Cinemeta, Torrentio & community plugins'
              }
              badgeText={addonsCount > 0 ? `${addonsCount} Active` : undefined}
              badgeColor="#ff2d55"
              onPress={() => onSettingsItemPress('/settings/addons')}
              isFirst={false}
              isLast={false}
            />
            <SettingItem
              title="OpenSubtitles"
              icon="chatbox-ellipses-outline"
              subtitle="Multilingual subtitle credentials & auto-load"
              onPress={() => onSettingsItemPress('/settings/opensubtitles')}
              isFirst={false}
              isLast={false}
            />
            <SettingItem
              title="TMDB Metadata"
              icon="film-outline"
              subtitle="Movie posters, backdrops & metadata credentials"
              onPress={() => onSettingsItemPress('/settings/tmdb')}
              isFirst={false}
              isLast={true}
            />
          </View>
        </View>

        {/* Section 5: Support & Donation */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>SUPPORT & DONATION</Text>
          <View style={styles.settingsGroup}>
            <SettingItem
              title="Buy Me a Coffee"
              icon="cafe-outline"
              subtitle="Support VPLEX development via UPI (GPay / PhonePe)"
              badgeText="Support ❤️"
              badgeColor="#FF9F0A"
              onPress={() => onSettingsItemPress('/settings/coffee')}
              isFirst={true}
              isLast={true}
            />
          </View>
        </View>

        {/* Section 6: About & System */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>SYSTEM & ABOUT</Text>
          <View style={styles.settingsGroup}>
            <SettingItem
              title="About Us"
              icon="information-circle-outline"
              subtitle="Version, licenses & open source acknowledgments"
              onPress={() => onSettingsItemPress('/settings/about')}
              isFirst={true}
              isLast={true}
            />
          </View>
        </View>

        {/* Footer info */}
        <View style={styles.footerContainer}>
          <View style={styles.footerBadge}>
            <Ionicons name="sparkles" size={14} color={theme.primary} />
            <Text style={styles.footerText}>VStream Online v{appVersion}</Text>
          </View>
          <Text style={styles.footerSubText}>Designed for high-performance streaming</Text>
        </View>

        <BottomSpacing space={50} />
      </ScrollView>

      {/* Theme Selection Modal (Lazy Mounted) */}
      <Modal
        visible={themeModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setThemeModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismissArea} onPress={() => setThemeModalVisible(false)} />
          <PopupSheet style={styles.popupSheet}>
            <View style={styles.modalDragHandle} />
            <View style={styles.popupHeader}>
              <View style={styles.popupHeaderTitleGroup}>
                <View style={[styles.popupIconBox, { backgroundColor: theme.iconBg }]}>
                  <Ionicons name="color-palette" size={18} color={theme.primary} />
                </View>
                <Text style={styles.popupTitle}>Theme Selection</Text>
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
              {themeModalVisible && (
                <ThemeSelector showPreviewBar={false} showNavigationLink={true} />
              )}
            </ScrollView>
          </PopupSheet>
        </View>
      </Modal>

      {/* Storage & Data Cleanup Modal (Lazy Mounted) */}
      <Modal
        visible={storageModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setStorageModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismissArea} onPress={() => setStorageModalVisible(false)} />
          <PopupSheet style={styles.popupSheet}>
            <View style={styles.modalDragHandle} />
            <View style={styles.popupHeader}>
              <View style={styles.popupHeaderTitleGroup}>
                <View style={[styles.popupIconBox, { backgroundColor: theme.iconBg }]}>
                  <Ionicons name="server-outline" size={18} color={theme.primary} />
                </View>
                <Text style={styles.popupTitle}>Storage & Data Cleanup</Text>
              </View>
              <TouchableOpacity
                onPress={() => setStorageModalVisible(false)}
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
              {storageModalVisible && (
                <StorageCleanupCard onStatsChange={() => loadDataStats(true)} />
              )}
            </ScrollView>
          </PopupSheet>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

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
    paddingTop: 12,
    paddingBottom: 16,
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
    letterSpacing: -0.1,
  },

  /* Hero Card */
  heroCardWrapper: {
    marginHorizontal: 16,
    marginBottom: 26,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  heroCard: {
    padding: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroAppBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  heroInfo: {
    flex: 1,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  heroPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  heroPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroVersionText: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 3,
  },
  heroDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 14,
  },
  heroChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#A0A0A5',
  },

  /* Sections & Groups */
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#8E8E93',
    marginBottom: 8,
    marginLeft: 20,
    marginRight: 20,
    letterSpacing: 0.8,
  },
  settingsGroup: {
    marginHorizontal: 16,
    backgroundColor: '#13131A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    paddingVertical: 13,
    paddingHorizontal: 14,
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 56,
    position: 'relative',
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  settingText: {
    fontSize: 15.5,
    fontWeight: '500',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  settingSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
    letterSpacing: -0.1,
  },
  rightContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 10,
  },
  menuBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 12,
    borderWidth: 1,
  },
  menuBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  menuBadgeText: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  separator: {
    position: 'absolute',
    bottom: 0,
    left: 62,
    right: 14,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },

  /* Footer */
  footerContainer: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  footerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  footerText: {
    fontSize: 12.5,
    color: '#8E8E93',
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  footerSubText: {
    fontSize: 11,
    color: '#55555C',
    fontWeight: '400',
  },

  /* Bottom sheet popup styles */
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  modalDismissArea: {
    flex: 1,
  },
  popupSheet: {
    backgroundColor: 'rgba(18, 18, 24, 0.96)',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    paddingTop: 10,
    paddingBottom: 36,
    maxHeight: '85%',
  },
  modalDragHandle: {
    width: 38,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  popupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  popupHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  popupIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  popupCloseButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupScroll: {
    paddingHorizontal: 16,
  },
  popupScrollContent: {
    paddingBottom: 24,
  },
});

export default SettingsScreen;
