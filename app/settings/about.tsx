import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported, showAlert } from '@/utils/platform';
import BottomSpacing from '@/components/BottomSpacing';
import { useTheme } from '@/contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';

const AboutUsScreen: React.FC = () => {
  const { theme } = useTheme();
  const appVersion = Constants.expoConfig?.version || '1.0.0';

  const copyVersion = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await Clipboard.setStringAsync(`VPLEX v${appVersion}`);
    showAlert('Copied', `App version v${appVersion} copied to clipboard.`);
  };

  const handleEmailPress = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const emailUrl = 'mailto:vigneshsivapragasam28@gmail.com';
    const canOpen = await Linking.canOpenURL(emailUrl).catch(() => false);
    if (canOpen) {
      await Linking.openURL(emailUrl);
    } else {
      await Clipboard.setStringAsync('vigneshsivapragasam28@gmail.com');
      showAlert('Copied', 'Email address copied to clipboard:\nvigneshsivapragasam28@gmail.com');
    }
  };

  const handlePhonePress = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const telUrl = 'tel:+918122396125';
    const canOpen = await Linking.canOpenURL(telUrl).catch(() => false);
    if (canOpen) {
      await Linking.openURL(telUrl);
    } else {
      await Clipboard.setStringAsync('+918122396125');
      showAlert('Copied', 'Mobile number copied to clipboard:\n+91 8122396125');
    }
  };

  const handleWhatsAppPress = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const waUrl = 'https://wa.me/918122396125';
    const canOpen = await Linking.canOpenURL(waUrl).catch(() => false);
    if (canOpen) {
      await Linking.openURL(waUrl);
    } else {
      await Clipboard.setStringAsync('+918122396125');
      showAlert('Copied', 'WhatsApp number copied to clipboard:\n+91 8122396125');
    }
  };

  const handleCopyAllContact = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const fullContact = 'Developer: S Vignesh (VIKI)\nEmail: vigneshsivapragasam28@gmail.com\nPhone: +91 8122396125\nApplication: VPLEX Media Platform';
    await Clipboard.setStringAsync(fullContact);
    showAlert('Contact Copied', 'Developer contact card copied to clipboard.');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Navigation Bar */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="arrow-back" size={22} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Developer & About</Text>
          <TouchableOpacity
            style={styles.shareContactBtn}
            onPress={handleCopyAllContact}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Ionicons name="share-outline" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* 1. HERO DEVELOPER PROFILE CARD */}
        <View style={styles.developerHeroCard}>
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.02)']}
            style={styles.heroGradient}
          />
          <View style={styles.developerProfileHeader}>
            <View style={styles.avatarWrap}>
              <View style={[styles.avatarGlow, { backgroundColor: theme.primary }]} />
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitials}>SV</Text>
              </View>
            </View>

            <View style={styles.developerIdentity}>
              <View style={styles.nameRow}>
                <Text style={styles.developerName}>S Vignesh</Text>
                <View style={[styles.vikiBadge, { backgroundColor: '#e5a83225', borderColor: '#e5a83260' }]}>
                  <Text style={styles.vikiBadgeText}>VIKI</Text>
                </View>
              </View>
              <Text style={styles.developerRole}>Lead Mobile & Core Architect</Text>
              <View style={styles.availabilityRow}>
                <View style={styles.statusDot} />
                <Text style={styles.availabilityText}>Creator of VPLEX • Open for Feedback</Text>
              </View>
            </View>
          </View>

          {/* Quick Action Touch Buttons */}
          <View style={styles.quickActionsGrid}>
            <TouchableOpacity
              style={styles.actionPill}
              onPress={handleEmailPress}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconBox, { backgroundColor: '#00e67618' }]}>
                <Ionicons name="mail" size={18} color="#00e676" />
              </View>
              <Text style={styles.actionPillLabel}>Send Email</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionPill}
              onPress={handlePhonePress}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconBox, { backgroundColor: '#2979ff18' }]}>
                <Ionicons name="call" size={18} color="#2979ff" />
              </View>
              <Text style={styles.actionPillLabel}>Call Directly</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionPill}
              onPress={handleWhatsAppPress}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconBox, { backgroundColor: '#25D36620' }]}>
                <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
              </View>
              <Text style={styles.actionPillLabel}>WhatsApp</Text>
            </TouchableOpacity>
          </View>

          {/* Detailed Contact List Rows */}
          <View style={styles.contactDetailsBox}>
            {/* Email Row */}
            <TouchableOpacity
              style={styles.contactItemRow}
              onPress={handleEmailPress}
              activeOpacity={0.7}
            >
              <View style={styles.contactItemLeft}>
                <Ionicons name="mail-outline" size={18} color="#8E8E93" style={{ marginRight: 10 }} />
                <View>
                  <Text style={styles.contactItemLabel}>Email</Text>
                  <Text style={styles.contactItemValue}>vigneshsivapragasam28@gmail.com</Text>
                </View>
              </View>
              <Ionicons name="copy-outline" size={16} color="#666666" />
            </TouchableOpacity>

            <View style={styles.contactDivider} />

            {/* Phone Row */}
            <TouchableOpacity
              style={styles.contactItemRow}
              onPress={handlePhonePress}
              activeOpacity={0.7}
            >
              <View style={styles.contactItemLeft}>
                <Ionicons name="call-outline" size={18} color="#8E8E93" style={{ marginRight: 10 }} />
                <View>
                  <Text style={styles.contactItemLabel}>Mobile Phone</Text>
                  <Text style={styles.contactItemValue}>+91 8122396125</Text>
                </View>
              </View>
              <Ionicons name="copy-outline" size={16} color="#666666" />
            </TouchableOpacity>

            <View style={styles.contactDivider} />

            {/* WhatsApp Row */}
            <TouchableOpacity
              style={styles.contactItemRow}
              onPress={handleWhatsAppPress}
              activeOpacity={0.7}
            >
              <View style={styles.contactItemLeft}>
                <Ionicons name="logo-whatsapp" size={18} color="#25D366" style={{ marginRight: 10 }} />
                <View>
                  <Text style={styles.contactItemLabel}>Instant Message</Text>
                  <Text style={styles.contactItemValue}>Chat on WhatsApp (+91 8122396125)</Text>
                </View>
              </View>
              <Ionicons name="open-outline" size={16} color="#666666" />
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. APP SPECIFICATION CARD */}
        <View style={styles.card}>
          <View style={styles.appHeaderRow}>
            <Image
              source={require('@/assets/images/icon.png')}
              style={styles.appIconSmall}
              resizeMode="cover"
            />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.appName}>VPLEX</Text>
                <TouchableOpacity
                  style={[
                    styles.versionBadge,
                    { backgroundColor: theme.primary + '18', borderColor: theme.primary + '40' },
                  ]}
                  onPress={copyVersion}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.versionText, { color: theme.primaryLight || theme.primary }]}>
                    v{appVersion}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.appTagline}>Next-Gen High-Performance Streaming Platform</Text>
            </View>
          </View>

          <View style={styles.specRowsContainer}>
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Developer & Maintainer</Text>
              <Text style={styles.specValue}>S Vignesh (VIKI)</Text>
            </View>
            <View style={styles.specDivider} />
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Architecture</Text>
              <Text style={styles.specValue}>React Native & Embedded Engine</Text>
            </View>
            <View style={styles.specDivider} />
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Platform</Text>
              <Text style={styles.specValue}>
                {Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web'}
              </Text>
            </View>
            <View style={styles.specDivider} />
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Stream Quality</Text>
              <Text style={styles.specValue}>4K Ultra HD • 1080p • 720p</Text>
            </View>
          </View>
        </View>

        {/* 3. LEGAL & DISCLAIMER */}
        <View style={[styles.card, styles.disclaimerCard]}>
          <View style={styles.disclaimerHeader}>
            <Ionicons name="shield-checkmark-outline" size={17} color="#8E8E93" />
            <Text style={styles.disclaimerTitle}>Platform Disclaimer</Text>
          </View>
          <Text style={styles.disclaimerText}>
            VPLEX is an open media indexer and player designed to organize media streams and offline downloads. It does not host, upload, or broadcast any video files. All content is fetched from user-connected feeds and public catalog mirrors.
          </Text>
        </View>

        <BottomSpacing space={60} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    maxWidth: 780,
    width: '100%',
    marginHorizontal: 'auto',
  },

  /* Navigation Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    marginBottom: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  shareContactBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Developer Hero Card */
  developerHeroCard: {
    backgroundColor: '#121212',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 16,
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  heroGradient: {
    ...StyleSheet.absoluteFill,
  },
  developerProfileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarWrap: {
    width: 58,
    height: 58,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGlow: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    opacity: 0.25,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1c1c1e',
    borderWidth: 2,
    borderColor: '#e5a832',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 19,
    fontWeight: '900',
    color: '#e5a832',
    letterSpacing: 0.5,
  },
  developerIdentity: {
    flex: 1,
    marginLeft: 14,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  developerName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  vikiBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  vikiBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#e5a832',
    letterSpacing: 0.8,
  },
  developerRole: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '500',
    marginTop: 2,
  },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#30d158',
    marginRight: 6,
  },
  availabilityText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '500',
  },

  /* Quick Actions Grid */
  quickActionsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  actionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1c',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 6,
  },
  actionIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPillLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },

  /* Contact Details Box */
  contactDetailsBox: {
    backgroundColor: '#171717',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  contactItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  contactItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  contactItemLabel: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '500',
  },
  contactItemValue: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '600',
    marginTop: 2,
  },
  contactDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },

  /* Standard Card */
  card: {
    backgroundColor: '#121212',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    marginBottom: 16,
  },
  appHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  appIconSmall: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  appName: {
    fontSize: 19,
    fontWeight: '800',
    color: '#ffffff',
  },
  versionBadge: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: 1,
  },
  versionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  appTagline: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 2,
  },

  specRowsContainer: {
    backgroundColor: '#171717',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  specDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  specLabel: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  specValue: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
  },

  /* Disclaimer Card */
  disclaimerCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  disclaimerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  disclaimerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E8E93',
    marginLeft: 6,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#777777',
    lineHeight: 18,
  },
});

export default AboutUsScreen;
