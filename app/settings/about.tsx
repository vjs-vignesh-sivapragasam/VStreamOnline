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

const AboutUsScreen: React.FC = () => {
  const appVersion = Constants.expoConfig?.version || '1.0.0';

  const copyVersion = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await Clipboard.setStringAsync(`NetFlix v${appVersion}`);
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
    const telUrl = 'tel:8122396125';
    const canOpen = await Linking.canOpenURL(telUrl).catch(() => false);
    if (canOpen) {
      await Linking.openURL(telUrl);
    } else {
      await Clipboard.setStringAsync('8122396125');
      showAlert('Copied', 'Mobile number copied to clipboard:\n8122396125');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>About Us</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.iconWrap}>
            <Image
              source={require('@/assets/images/icon.png')}
              style={styles.appIcon}
              resizeMode="cover"
            />
          </View>
          <Text style={styles.appName}>NetFlix</Text>
          <TouchableOpacity
            style={styles.versionBadge}
            onPress={copyVersion}
            activeOpacity={0.7}
          >
            <Text style={styles.versionText}>Version {appVersion}</Text>
          </TouchableOpacity>
          <Text style={styles.appTagline}>
            Your unified streaming and offline media hub
          </Text>
        </View>

        {/* Mission / Overview Card */}
        <View style={styles.card}>
          <Text style={styles.cardHeading}>About NetFlix</Text>
          <Text style={styles.cardBody}>
            NetFlix is a modern, high-performance media hub crafted for seamless discovery and playback. Stream movies, TV series, and multi-audio releases in crisp 4K, 1080p, and 720p resolutions, or save them directly to internal storage for offline viewing without data connection.
          </Text>
        </View>

        {/* Developer Contact Card */}
        <View style={styles.card}>
          <Text style={styles.cardHeading}>Developer Contact</Text>

          {/* Name */}
          <View style={styles.contactRow}>
            <View style={[styles.contactIconWrap, { backgroundColor: '#535aff20' }]}>
              <Ionicons name="person-outline" size={18} color="#535aff" />
            </View>
            <View style={styles.contactTextWrap}>
              <Text style={styles.contactLabel}>Name</Text>
              <Text style={styles.contactValue}>S Vignesh</Text>
            </View>
          </View>

          {/* Email */}
          <TouchableOpacity
            style={styles.contactRow}
            onPress={handleEmailPress}
            activeOpacity={0.7}
          >
            <View style={[styles.contactIconWrap, { backgroundColor: '#00e67620' }]}>
              <Ionicons name="mail-outline" size={18} color="#00e676" />
            </View>
            <View style={styles.contactTextWrap}>
              <Text style={styles.contactLabel}>Email ID</Text>
              <Text style={styles.contactValueInteractive}>
                vigneshsivapragasam28@gmail.com
              </Text>
            </View>
            <Ionicons name="open-outline" size={16} color="#8E8E93" />
          </TouchableOpacity>

          {/* Mobile No */}
          <TouchableOpacity
            style={[styles.contactRow, styles.contactRowLast]}
            onPress={handlePhonePress}
            activeOpacity={0.7}
          >
            <View style={[styles.contactIconWrap, { backgroundColor: '#ff980020' }]}>
              <Ionicons name="call-outline" size={18} color="#ff9800" />
            </View>
            <View style={styles.contactTextWrap}>
              <Text style={styles.contactLabel}>Mobile No</Text>
              <Text style={styles.contactValueInteractive}>8122396125</Text>
            </View>
            <Ionicons name="open-outline" size={16} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        {/* Features Highlights */}
        <View style={styles.card}>
          <Text style={styles.cardHeading}>Key Features</Text>

          <View style={styles.featureRow}>
            <View style={[styles.featureIconWrap, { backgroundColor: '#535aff20' }]}>
              <Ionicons name="film-outline" size={20} color="#535aff" />
            </View>
            <View style={styles.featureTextWrap}>
              <Text style={styles.featureTitle}>TMDB Integration & Trailers</Text>
              <Text style={styles.featureDescription}>
                Rich movie details, release dates, Cast & Crew avatars, official YouTube trailers, and personalized recommendations.
              </Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={[styles.featureIconWrap, { backgroundColor: '#00e67620' }]}>
              <Ionicons name="cloud-download-outline" size={20} color="#00e676" />
            </View>
            <View style={styles.featureTextWrap}>
              <Text style={styles.featureTitle}>Internal Offline Downloads</Text>
              <Text style={styles.featureDescription}>
                Download movies directly into internal device storage with real-time speed, peer counts, and progress tracking.
              </Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={[styles.featureIconWrap, { backgroundColor: '#ff980020' }]}>
              <Ionicons name="open-outline" size={20} color="#ff9800" />
            </View>
            <View style={styles.featureTextWrap}>
              <Text style={styles.featureTitle}>External Players (VLC & MX)</Text>
              <Text style={styles.featureDescription}>
                Play downloaded movies directly in VLC, MX Player, Infuse, or any preferred player on your device.
              </Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={[styles.featureIconWrap, { backgroundColor: '#7b82ff20' }]}>
              <Ionicons name="bookmark-outline" size={20} color="#7b82ff" />
            </View>
            <View style={styles.featureTextWrap}>
              <Text style={styles.featureTitle}>My List</Text>
              <Text style={styles.featureDescription}>
                Bookmark your favorite titles and launch them with 1 tap directly from your Library without searching.
              </Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={[styles.featureIconWrap, { backgroundColor: '#00bcd420' }]}>
              <Ionicons name="globe-outline" size={20} color="#00bcd4" />
            </View>
            <View style={styles.featureTextWrap}>
              <Text style={styles.featureTitle}>Multi-Domain Mirror Resolution</Text>
              <Text style={styles.featureDescription}>
                Continuous health check and auto-switching across active TamilMV mirrors to guarantee uninterrupted access.
              </Text>
            </View>
          </View>
        </View>

        {/* Technical Specs Card */}
        <View style={styles.card}>
          <Text style={styles.cardHeading}>App Information</Text>

          <View style={styles.specRow}>
            <Text style={styles.specLabel}>Developer</Text>
            <Text style={styles.specValue}>S Vignesh</Text>
          </View>

          <View style={styles.specRow}>
            <Text style={styles.specLabel}>Application</Text>
            <Text style={styles.specValue}>NetFlix</Text>
          </View>

          <View style={styles.specRow}>
            <Text style={styles.specLabel}>Version</Text>
            <Text style={styles.specValue}>{appVersion}</Text>
          </View>

          <View style={styles.specRow}>
            <Text style={styles.specLabel}>Platform</Text>
            <Text style={styles.specValue}>
              {Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web'}
            </Text>
          </View>

          <View style={styles.specRow}>
            <Text style={styles.specLabel}>Metadata Source</Text>
            <Text style={styles.specValue}>The Movie Database (TMDB)</Text>
          </View>

          <View style={styles.specRow}>
            <Text style={styles.specLabel}>Feed Provider</Text>
            <Text style={styles.specValue}>1TamilMV Engine</Text>
          </View>
        </View>

        {/* Disclaimer Card */}
        <View style={[styles.card, styles.disclaimerCard]}>
          <View style={styles.disclaimerHeader}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#8E8E93" />
            <Text style={styles.disclaimerTitle}>Disclaimer</Text>
          </View>
          <Text style={styles.disclaimerText}>
            NetFlix is a media indexing tool and media player. It does not host, upload, or own any video files on its servers. All metadata and media streams are resolved from publicly accessible feeds and user-configured torrent streaming engines.
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
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },

  /* Hero */
  heroSection: {
    alignItems: 'center',
    marginBottom: 26,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#1c1c1e',
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#535aff',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  appIcon: {
    width: '100%',
    height: '100%',
  },
  appName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  versionBadge: {
    backgroundColor: 'rgba(83, 90, 255, 0.15)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(83, 90, 255, 0.35)',
    marginBottom: 10,
  },
  versionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7b82ff',
  },
  appTagline: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
  },

  /* Card */
  card: {
    backgroundColor: '#121212',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#222222',
  },
  cardHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  cardBody: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.75)',
    lineHeight: 22,
  },

  /* Contact Rows */
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#242426',
    gap: 12,
  },
  contactRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 4,
  },
  contactIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactTextWrap: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
    marginBottom: 2,
  },
  contactValue: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  contactValueInteractive: {
    fontSize: 14,
    color: '#535aff',
    fontWeight: '600',
  },

  /* Feature Rows */
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 16,
  },
  featureIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  featureTextWrap: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 3,
  },
  featureDescription: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
  },

  /* Specs */
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#242426',
  },
  specLabel: {
    fontSize: 14,
    color: '#8E8E93',
  },
  specValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },

  /* Disclaimer */
  disclaimerCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  disclaimerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  disclaimerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#6e6e73',
    lineHeight: 18,
  },
});

export default AboutUsScreen;
