import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Pressable, View, ScrollView, Modal, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { StatusBar, Text } from '@/components/Themed';
import { useRouter } from 'expo-router';
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

const SettingsScreen = () => {
  const router = useRouter();
  const appVersion = Constants.expoConfig?.version;
  const { theme } = useTheme();

  // Modals for Theme Selection & Storage Cleanup
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [storageModalVisible, setStorageModalVisible] = useState(false);
  const [dataStats, setDataStats] = useState<DataConsumptionStats | null>(null);

  const loadDataStats = useCallback(async () => {
    try {
      const stats = await dataConsumptionService.getDataConsumptionStats();
      setDataStats(stats);
    } catch (err) {
      console.warn('[Settings] Failed to load data consumption stats:', err);
    }
  }, []);

  useEffect(() => {
    loadDataStats();
  }, [loadDataStats, storageModalVisible]);

  const sourceList: { title: string; route: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { title: 'TamilMV Source', route: '/settings/tamilmv', icon: 'globe-outline' },
  ];

  const integrationList: { title: string; route: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { title: 'TMDB (Movies & Trailers)', route: '/settings/tmdb', icon: 'film-outline' },
    { title: 'Stremio', route: '/settings/stremioserver', icon: 'magnet-outline' },
    { title: 'OpenSubtitles', route: '/settings/opensubtitles', icon: 'chatbox-ellipses-outline' },
  ];

  const generalList: { title: string; route: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { title: 'About Us', route: '/settings/about', icon: 'information-circle-outline' },
  ];

  const SettingItem = ({
    title,
    icon,
    subtitle,
    badgeText,
    badgeColor,
    onPress,
    isFirst = false,
    isLast = false,
  }: {
    title: string;
    icon: keyof typeof Ionicons.glyphMap;
    subtitle?: string;
    badgeText?: string;
    badgeColor?: string;
    onPress: () => void;
    isFirst?: boolean;
    isLast?: boolean;
  }) => {
    const [isPressed, setIsPressed] = useState(false);

    return (
      <Pressable
        style={[
          styles.settingItem,
          {
            backgroundColor: isPressed ? '#1a1a1a' : '#101010',
            borderTopLeftRadius: isFirst ? 12 : 0,
            borderTopRightRadius: isFirst ? 12 : 0,
            borderBottomLeftRadius: isLast ? 12 : 0,
            borderBottomRightRadius: isLast ? 12 : 0,
          },
        ]}
        onPress={onPress}
        onPressIn={() => setIsPressed(true)}
        onPressOut={() => setIsPressed(false)}
      >
        <View style={styles.leftContent}>
          <View style={[styles.iconContainer, { backgroundColor: theme.iconBg }]}>
            <Ionicons name={icon} size={22} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
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
                  backgroundColor: (badgeColor || theme.primary) + '1A',
                  borderColor: (badgeColor || theme.primary) + '44',
                },
              ]}
            >
              <View style={[styles.menuBadgeDot, { backgroundColor: badgeColor || theme.primary }]} />
              <Text style={[styles.menuBadgeText, { color: badgeColor || theme.primary }]}>
                {badgeText}
              </Text>
            </View>
          ) : null}
          <MaterialIcons name="chevron-right" size={22} color="#6E6E73" />
        </View>
        {!isLast && <View style={styles.separator} />}
      </Pressable>
    );
  };

  const onSettingsItemPress = async (item: any) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push({ pathname: item.route });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar />
      <BlurGradientBackground />
      <ScrollView contentContainerStyle={styles.scrollViewContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerContainer}>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        {/* Appearance & Theme Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>APPEARANCE</Text>
          <View style={styles.settingsGroup}>
            <SettingItem
              title="Theme Selection"
              icon="color-palette-outline"
              badgeText={
                theme.id === 'purple'
                  ? 'Purple'
                  : theme.id === 'blue'
                  ? 'Ocean Blue'
                  : theme.id === 'green'
                  ? 'Emerald Green'
                  : theme.id === 'accent'
                  ? 'Apple Music'
                  : theme.name
              }
              badgeColor={theme.primary}
              onPress={async () => {
                if (await isHapticsSupported()) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                setThemeModalVisible(true);
              }}
              isFirst={true}
              isLast={true}
            />
          </View>
        </View>

        {/* Storage & Data Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>STORAGE & DATA</Text>
          <View style={styles.settingsGroup}>
            <SettingItem
              title="Storage & Data"
              icon="pie-chart-outline"
              subtitle={
                dataStats
                  ? `${dataStats.todayFormatted} today • ${dataStats.overallFormatted} total`
                  : 'Manage storage & clear cache'
              }
              badgeText={dataStats ? dataStats.todayFormatted : undefined}
              badgeColor="#30d158"
              onPress={async () => {
                if (await isHapticsSupported()) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                setStorageModalVisible(true);
              }}
              isFirst={true}
              isLast={true}
            />
          </View>
        </View>

        {/* Content Sources Section */}
        {sourceList.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>CONTENT SOURCES</Text>
            <View style={styles.settingsGroup}>
              {sourceList.map((item, index) => (
                <SettingItem
                  key={index}
                  title={item.title}
                  icon={item.icon}
                  onPress={() => onSettingsItemPress(item)}
                  isFirst={index === 0}
                  isLast={index === sourceList.length - 1}
                />
              ))}
            </View>
          </View>
        )}

        {/* Integrations Section */}
        {integrationList.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>INTEGRATIONS</Text>
            <View style={styles.settingsGroup}>
              {integrationList.map((item, index) => (
                <SettingItem
                  key={index}
                  title={item.title}
                  icon={item.icon}
                  onPress={() => onSettingsItemPress(item)}
                  isFirst={index === 0}
                  isLast={index === integrationList.length - 1}
                />
              ))}
            </View>
          </View>
        )}

        {/* General / About Section */}
        {generalList.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>ABOUT & INFO</Text>
            <View style={styles.settingsGroup}>
              {generalList.map((item, index) => (
                <SettingItem
                  key={index}
                  title={item.title}
                  icon={item.icon}
                  onPress={() => onSettingsItemPress(item)}
                  isFirst={index === 0}
                  isLast={index === generalList.length - 1}
                />
              ))}
            </View>
          </View>
        )}

        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>Version {appVersion}</Text>
        </View>
        <BottomSpacing space={50} />
      </ScrollView>

      {/* Theme Selection Popup Modal */}
      <Modal
        visible={themeModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setThemeModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismissArea} onPress={() => setThemeModalVisible(false)} />
          <BlurView intensity={45} tint="dark" style={styles.popupSheet}>
            <View style={styles.modalDragHandle} />
            <View style={styles.popupHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[styles.popupIconBox, { backgroundColor: theme.iconBg }]}>
                  <Ionicons name="color-palette" size={20} color={theme.primary} />
                </View>
                <Text style={styles.popupTitle}>Theme Selection</Text>
              </View>
              <TouchableOpacity
                onPress={() => setThemeModalVisible(false)}
                style={styles.popupCloseButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color="#ffffff" />
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

      {/* Storage & Data Cleanup Popup Modal */}
      <Modal
        visible={storageModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setStorageModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismissArea} onPress={() => setStorageModalVisible(false)} />
          <BlurView intensity={45} tint="dark" style={styles.popupSheet}>
            <View style={styles.modalDragHandle} />
            <View style={styles.popupHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[styles.popupIconBox, { backgroundColor: theme.iconBg }]}>
                  <Ionicons name="server-outline" size={20} color={theme.primary} />
                </View>
                <Text style={styles.popupTitle}>Storage & Data Cleanup</Text>
              </View>
              <TouchableOpacity
                onPress={() => setStorageModalVisible(false)}
                style={styles.popupCloseButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color="#ffffff" />
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
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: 40,
    maxWidth: 780,
    width: '100%',
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    color: '#8E8E93',
    marginBottom: 10,
    marginLeft: 20,
    marginRight: 20,
    letterSpacing: 0.5,
  },
  settingsGroup: {
    marginHorizontal: 16,
    overflow: 'hidden',
    borderRadius: 12,
  },
  settingItem: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 52,
    position: 'relative',
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingText: {
    fontSize: 17,
    fontWeight: '400',
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
  },
  menuBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  menuBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  menuBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  separator: {
    position: 'absolute',
    bottom: 0,
    left: 60,
    right: 16,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2a2a2a',
  },
  versionContainer: {
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  versionText: {
    fontSize: 13,
    color: '#6E6E73',
    fontWeight: '500',
    letterSpacing: 0.2,
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
    backgroundColor: 'rgba(18, 18, 22, 0.96)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    paddingTop: 10,
    paddingBottom: 36,
    maxHeight: '85%',
  },
  modalDragHandle: {
    width: 38,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
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
  popupIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  popupCloseButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
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
