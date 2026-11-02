import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import BottomSpacing from '@/components/BottomSpacing';
import BlurGradientBackground from '@/components/BlurGradientBackground';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeSelector } from '@/components/settings/ThemeSelector';
import { AppTheme } from '@/constants/Colors';

const ThemeSettingsScreen: React.FC = () => {
  const { theme, availableThemes, themeId, setThemeId } = useTheme();

  const handleBack = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <BlurGradientBackground />
      {/* Custom Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Appearance</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Main Theme Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>ACCENT COLOR</Text>
          <ThemeSelector showPreviewBar={false} showNavigationLink={false} />
        </View>

        {/* Theme Showcase & Detail Cards */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>AVAILABLE PALETTES</Text>
          <View style={styles.themeListCard}>
            {availableThemes.map((item: AppTheme, index: number) => {
              const isSelected = item.id === themeId;
              const isLast = index === availableThemes.length - 1;

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.themeRow,
                    isSelected && { backgroundColor: item.primary + '14' },
                    !isLast && styles.rowBorder,
                  ]}
                  onPress={() => setThemeId(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.themeRowLeft}>
                    <View
                      style={[
                        styles.themeRowDot,
                        {
                          backgroundColor: item.primary,
                          shadowColor: item.primary,
                          shadowOpacity: isSelected ? 0.6 : 0.2,
                          shadowRadius: 6,
                          elevation: 3,
                        },
                      ]}
                    />
                    <View>
                      <Text style={styles.themeRowTitle}>{item.displayName}{item.id === 'purple' ? ' (Default)' : ''}</Text>
                      <Text style={styles.themeRowSubtitle}>
                        {item.subtitle} • {item.primary}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.themeRowRight}>
                    {isSelected ? (
                      <View
                        style={[
                          styles.checkmarkCircle,
                          { backgroundColor: item.primary },
                        ]}
                      >
                        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      </View>
                    ) : (
                      <View style={styles.unselectedRing} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Interactive UI Mockups */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>COMPONENTS PREVIEW</Text>
          <View style={styles.previewCard}>
            <Text style={styles.previewCardTitle}>Mock Controls</Text>

            {/* Mock Tabs */}
            <View style={styles.mockTabRow}>
              <View
                style={[
                  styles.mockTabPillActive,
                  { backgroundColor: theme.primary, borderColor: theme.primary },
                ]}
              >
                <Ionicons name="grid" size={13} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.mockTabPillActiveText}>Active Tab</Text>
              </View>

              <View style={styles.mockTabPillInactive}>
                <Ionicons name="film-outline" size={13} color="rgba(255, 255, 255, 0.7)" style={{ marginRight: 6 }} />
                <Text style={styles.mockTabPillInactiveText}>Movies</Text>
              </View>

              <View style={styles.mockTabPillInactive}>
                <Ionicons name="cloud-download-outline" size={13} color="rgba(255, 255, 255, 0.7)" style={{ marginRight: 6 }} />
                <Text style={styles.mockTabPillInactiveText}>Downloads</Text>
              </View>
            </View>

            {/* Mock Buttons */}
            <View style={styles.mockRow}>
              <View
                style={[
                  styles.mockFilledButton,
                  { backgroundColor: theme.primary },
                ]}
              >
                <Ionicons name="play" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.mockButtonText}>Play Now</Text>
              </View>

              <View
                style={[
                  styles.mockOutlinedButton,
                  { borderColor: theme.primary, backgroundColor: theme.primary + '15' },
                ]}
              >
                <Ionicons name="bookmark" size={14} color={theme.primary} style={{ marginRight: 6 }} />
                <Text style={[styles.mockOutlinedButtonText, { color: theme.primary }]}>
                  Watchlist
                </Text>
              </View>
            </View>

            {/* Mock Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressLabels}>
                <Text style={styles.progressLabelText}>Progress</Text>
                <Text style={[styles.progressLabelVal, { color: theme.primary }]}>65%</Text>
              </View>
              <View style={styles.progressBarTrack}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: '65%', backgroundColor: theme.primary },
                  ]}
                />
              </View>
            </View>

            {/* Mock Badges */}
            <View style={styles.mockBadgeRow}>
              <View
                style={[
                  styles.tagBadge,
                  { backgroundColor: theme.primary + '20', borderColor: theme.primary + '40' },
                ]}
              >
                <Text style={[styles.tagText, { color: theme.primary }]}>4K ULTRA HD</Text>
              </View>
              <View
                style={[
                  styles.tagBadge,
                  { backgroundColor: theme.primary + '20', borderColor: theme.primary + '40' },
                ]}
              >
                <Text style={[styles.tagText, { color: theme.primary }]}>DOLBY VISION</Text>
              </View>
              <View
                style={[
                  styles.tagBadge,
                  { backgroundColor: theme.primary + '20', borderColor: theme.primary + '40' },
                ]}
              >
                <Text style={[styles.tagText, { color: theme.primary }]}>AUDIO 5.1</Text>
              </View>
            </View>
          </View>
        </View>

        <BottomSpacing space={60} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    maxWidth: 780,
    width: '100%',
    alignSelf: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#8E8E93',
    marginBottom: 10,
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  themeListCard: {
    backgroundColor: '#101010',
    borderRadius: 12,
    overflow: 'hidden',
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222222',
  },
  themeRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  themeRowDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 14,
  },
  themeRowTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  themeRowSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  themeRowRight: {
    marginLeft: 12,
  },
  checkmarkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unselectedRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#333333',
  },
  previewCard: {
    backgroundColor: '#101010',
    borderRadius: 12,
    padding: 16,
  },
  previewCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  mockTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
    alignItems: 'center',
  },
  mockTabPillActive: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  mockTabPillActiveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  mockTabPillInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  mockTabPillInactiveText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  mockRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  mockFilledButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 20,
  },
  mockButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  mockOutlinedButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  mockOutlinedButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  progressContainer: {
    marginBottom: 18,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabelText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  progressLabelVal: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#222222',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  mockBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

export default ThemeSettingsScreen;
