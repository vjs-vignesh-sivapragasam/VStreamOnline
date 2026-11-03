import React from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeId, AppTheme } from '@/constants/Colors';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';

interface ThemeSelectorProps {
  showPreviewBar?: boolean;
  showNavigationLink?: boolean;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  showPreviewBar = true,
  showNavigationLink = true,
}) => {
  const { themeId, theme, setThemeId, availableThemes } = useTheme();
  const router = useRouter();

  const handleOpenDetails = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push({ pathname: '/settings/theme' });
  };

  return (
    <View style={styles.container}>
      {/* Top Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIconBox, { backgroundColor: theme.iconBg }]}>
            <Ionicons name="color-palette" size={20} color={theme.primary} />
          </View>
          <View style={styles.headerTextGroup}>
            <Text style={styles.headerTitle}>Accent Theme</Text>
            <Text style={styles.headerSubtitle}>Tabs, badges, icons & playback tints</Text>
          </View>
        </View>

        {/* Current Active Badge */}
        <View
          style={[
            styles.activeBadge,
            {
              backgroundColor: theme.primary + '18',
              borderColor: theme.primary + '4D',
            },
          ]}
        >
          <View style={[styles.activeDot, { backgroundColor: theme.primary }]} />
          <Text style={[styles.activeBadgeText, { color: theme.primaryLight || theme.primary }]}>
            {theme.id === 'purple'
              ? 'Purple'
              : theme.id === 'accent'
              ? 'Apple Music'
              : theme.name}
          </Text>
        </View>
      </View>

      {/* Swatches Grid */}
      <View style={styles.swatchesContainer}>
        {availableThemes.map((t: AppTheme) => {
          const isSelected = t.id === themeId;
          const isDefault = t.id === 'purple';

          return (
            <Pressable
              key={t.id}
              style={({ pressed }) => [
                styles.swatchCard,
                {
                  backgroundColor: isSelected ? t.primary + '1A' : '#141416',
                  borderColor: isSelected ? t.primary : 'rgba(255, 255, 255, 0.08)',
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                },
              ]}
              onPress={() => setThemeId(t.id as ThemeId)}
              accessibilityRole="button"
              accessibilityLabel={`${t.displayName} theme${isDefault ? ' (Default)' : ''}`}
              accessibilityState={{ selected: isSelected }}
            >
              {/* Concentric Ring Swatch Circle */}
              <View
                style={[
                  styles.swatchOuterRing,
                  {
                    borderColor: isSelected ? t.primary : 'transparent',
                    borderWidth: isSelected ? 2 : 0,
                  },
                ]}
              >
                <View
                  style={[
                    styles.swatchInnerCircle,
                    {
                      backgroundColor: t.primary,
                      shadowColor: isSelected ? t.primary : '#000',
                      shadowOpacity: isSelected ? 0.5 : 0.2,
                      shadowRadius: isSelected ? 8 : 2,
                      elevation: isSelected ? 5 : 2,
                    },
                  ]}
                >
                  {isSelected && (
                    <Ionicons name="checkmark" size={17} color="#FFFFFF" />
                  )}
                </View>
              </View>

              {/* Theme Label */}
              <Text
                style={[
                  styles.swatchTitle,
                  {
                    color: isSelected ? '#FFFFFF' : '#A0A0A5',
                    fontWeight: isSelected ? '700' : '500',
                  },
                ]}
                numberOfLines={1}
              >
                {t.name}
              </Text>

              {/* Tag / Subtitle */}
              <View
                style={[
                  styles.tagPill,
                  isDefault && {
                    backgroundColor: isSelected ? t.primary + '28' : 'rgba(255, 255, 255, 0.08)',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.swatchSubtitle,
                    {
                      color: isSelected
                        ? t.primaryLight || t.primary
                        : isDefault
                        ? '#A0A0A5'
                        : '#6E6E73',
                      fontWeight: isDefault || isSelected ? '700' : '500',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {isDefault ? 'Default' : t.id === 'accent' ? 'Apple Pink' : t.subtitle.split(' ')[0]}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Navigation Link to Detailed Theme Screen */}
      {showNavigationLink && (
        <TouchableOpacity
          onPress={handleOpenDetails}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.moreDetailsRow}
          activeOpacity={0.7}
        >
          <Text style={[styles.moreDetailsText, { color: theme.primaryLight || theme.primary }]}>
            More palette details & options
          </Text>
          <Ionicons
            name="chevron-forward"
            size={13}
            color={theme.primaryLight || theme.primary}
            style={{ marginLeft: 3 }}
          />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#101012',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTextGroup: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    marginLeft: 8,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  swatchesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  swatchCard: {
    flex: 1,
    borderRadius: 13,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 104,
  },
  swatchOuterRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  swatchInnerCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
  },
  swatchTitle: {
    fontSize: 13,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  tagPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  swatchSubtitle: {
    fontSize: 10,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  moreDetailsRow: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#242426',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreDetailsText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
