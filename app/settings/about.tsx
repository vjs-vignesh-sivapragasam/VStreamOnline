import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Platform,
  Linking,
  Animated,
  Easing,
  Modal,
  Pressable,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import BottomSpacing from '@/components/BottomSpacing';
import { useTheme } from '@/contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import BlurGradientBackground from '@/components/BlurGradientBackground';
import { StatusBar } from '@/components/Themed';

const DEVELOPER_PHOTO = require('@/assets/images/developer_profile.jpg');

const AnimatedTouchable: React.FC<{
  onPress: () => void;
  style?: any;
  children: React.ReactNode;
  activeScale?: number;
}> = ({ onPress, style, children, activeScale = 0.96 }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: activeScale,
      useNativeDriver: true,
      friction: 7,
      tension: 100,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 5,
      tension: 80,
    }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.85}
        style={style}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
};

const AboutUsScreen: React.FC = () => {
  const { theme } = useTheme();
  const appVersion = Constants.expoConfig?.version || '1.0.0';

  // Photo viewer modal state
  const [photoModalVisible, setPhotoModalVisible] = useState(false);

  // Staggered Entrance Animations
  const heroAnim = useRef(new Animated.Value(0)).current;
  const actionsAnim = useRef(new Animated.Value(0)).current;
  const missionAnim = useRef(new Animated.Value(0)).current;
  const bentoAnim = useRef(new Animated.Value(0)).current;
  const contactAnim = useRef(new Animated.Value(0)).current;
  const appSpecAnim = useRef(new Animated.Value(0)).current;
  const disclaimerAnim = useRef(new Animated.Value(0)).current;

  // Floating Avatar Halo & Status Breathing Animations
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const statusGlowAnim = useRef(new Animated.Value(0)).current;

  // Floating Copy Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(-24)).current;

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    toastTranslateY.setValue(-24);
    Animated.parallel([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(toastTranslateY, {
        toValue: 0,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(toastOpacity, {
            toValue: 0,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(toastTranslateY, {
            toValue: -24,
            duration: 220,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setToastMessage(null);
        });
      }, 2200);
    });
  };

  useEffect(() => {
    // 1. Staggered entrance sequence
    Animated.stagger(80, [
      Animated.spring(heroAnim, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true }),
      Animated.spring(actionsAnim, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true }),
      Animated.spring(missionAnim, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true }),
      Animated.spring(bentoAnim, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true }),
      Animated.spring(contactAnim, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true }),
      Animated.spring(appSpecAnim, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true }),
      Animated.spring(disclaimerAnim, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true }),
    ]).start();

    // 2. Avatar breathing halo loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // 3. Online status pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(statusGlowAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(statusGlowAnim, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [actionsAnim, appSpecAnim, bentoAnim, contactAnim, disclaimerAnim, heroAnim, missionAnim, pulseAnim, statusGlowAnim]);

  const copyVersion = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await Clipboard.setStringAsync(`VPLEX v${appVersion}`);
    triggerToast(`App version v${appVersion} copied!`);
  };

  const handleEmailPress = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const emailUrl = 'mailto:vigneshsivapragasam28@gmail.com?subject=VPLEX%20Feedback%20%26%20Inquiry';
    const canOpen = await Linking.canOpenURL(emailUrl).catch(() => false);
    if (canOpen) {
      await Linking.openURL(emailUrl);
    } else {
      await Clipboard.setStringAsync('vigneshsivapragasam28@gmail.com');
      triggerToast('Email copied to clipboard!');
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
      triggerToast('Phone number copied!');
    }
  };

  const handleWhatsAppPress = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const waUrl = 'https://wa.me/918122396125?text=Hi%20Vignesh,%20I%20am%20using%20VPLEX!';
    const canOpen = await Linking.canOpenURL(waUrl).catch(() => false);
    if (canOpen) {
      await Linking.openURL(waUrl);
    } else {
      await Clipboard.setStringAsync('+918122396125');
      triggerToast('WhatsApp number copied!');
    }
  };

  const handleShareContact = async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const fullContact =
      'S Vignesh (VIKI)\nCreator & Lead Architect • VPLEX\n' +
      'Email: vigneshsivapragasam28@gmail.com\n' +
      'Phone: +91 8122396125\n' +
      'WhatsApp: https://wa.me/918122396125\n' +
      'Platform: VPLEX Next-Gen Media Streaming';

    try {
      await Share.share({
        message: fullContact,
        title: 'S Vignesh (VIKI) - VPLEX Developer Card',
      });
    } catch {
      await Clipboard.setStringAsync(fullContact);
      triggerToast('Developer contact card copied!');
    }
  };

  // Interpolated animation values
  const haloScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.28],
  });
  const haloOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 0.05],
  });
  const statusScale = statusGlowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.45],
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar />
      <BlurGradientBackground />

      {/* Floating Animated Toast Banner */}
      {toastMessage && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              opacity: toastOpacity,
              transform: [{ translateY: toastTranslateY }],
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.toastBox}>
            <Ionicons name="checkmark-circle" size={17} color="#30d158" style={{ marginRight: 6 }} />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </Animated.View>
      )}

      {/* Navigation Bar */}
      <View style={styles.navBar}>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={22} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>About & Creator</Text>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={handleShareContact}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Ionicons name="share-outline" size={18} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. HERO DEVELOPER PROFILE SHOWCASE ── */}
        <Animated.View
          style={[
            styles.heroCard,
            {
              opacity: heroAnim,
              transform: [
                {
                  translateY: heroAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [30, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={[theme.primary + '18', 'rgba(255, 255, 255, 0.03)', 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.heroGradient}
          />

          {/* Avatar with Breathing Ambient Halo */}
          <View style={styles.avatarContainer}>
            <Animated.View
              style={[
                styles.avatarPulsingHalo,
                {
                  backgroundColor: theme.primary,
                  transform: [{ scale: haloScale }],
                  opacity: haloOpacity,
                },
              ]}
            />

            {/* Tap profile photo to preview in high-res modal */}
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={async () => {
                if (await isHapticsSupported()) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                setPhotoModalVisible(true);
              }}
              style={[styles.avatarFrame, { borderColor: theme.primary }]}
            >
              <Image
                source={DEVELOPER_PHOTO}
                style={styles.avatarImage}
                resizeMode="cover"
              />
              {/* Verified Creator Badge */}
              <View style={[styles.verifiedBadge, { backgroundColor: theme.primary }]}>
                <Ionicons name="checkmark" size={13} color="#ffffff" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Name & Identity */}
          <View style={styles.identityContainer}>
            <View style={styles.nameRow}>
              <Text style={styles.developerName}>S Vignesh</Text>
              <View
                style={[
                  styles.vikiBadge,
                  {
                    backgroundColor: theme.primary + '22',
                    borderColor: theme.primary + '66',
                  },
                ]}
              >
                <Text style={[styles.vikiBadgeText, { color: theme.primaryLight || theme.primary }]}>
                  VIKI
                </Text>
              </View>
            </View>

            <Text style={styles.developerRole}>Lead Mobile & Core Architect</Text>

            {/* Location & Status Chips */}
            <View style={styles.badgeRow}>
              <View style={styles.infoPill}>
                <Ionicons name="location-outline" size={12} color="#8E8E93" style={{ marginRight: 4 }} />
                <Text style={styles.infoPillText}>Tamil Nadu, India</Text>
              </View>

              <View style={styles.statusPill}>
                <View style={styles.statusDotWrap}>
                  <Animated.View
                    style={[
                      styles.statusDotPulse,
                      {
                        transform: [{ scale: statusScale }],
                      },
                    ]}
                  />
                  <View style={styles.statusDot} />
                </View>
                <Text style={styles.statusPillText}>Available</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* ── 2. QUICK ACTIONS ROW ── */}
        <Animated.View
          style={[
            styles.quickActionsGrid,
            {
              opacity: actionsAnim,
              transform: [
                {
                  translateY: actionsAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [25, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {/* WhatsApp Action */}
          <AnimatedTouchable style={styles.actionCard} onPress={handleWhatsAppPress}>
            <LinearGradient
              colors={['rgba(37, 211, 102, 0.16)', 'rgba(37, 211, 102, 0.04)']}
              style={styles.actionCardGradient}
            />
            <View style={[styles.actionIconCircle, { backgroundColor: 'rgba(37, 211, 102, 0.2)' }]}>
              <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
            </View>
            <Text style={styles.actionCardTitle}>WhatsApp</Text>
            <Text style={styles.actionCardSubtitle}>Instant Chat</Text>
          </AnimatedTouchable>

          {/* Email Action */}
          <AnimatedTouchable style={styles.actionCard} onPress={handleEmailPress}>
            <LinearGradient
              colors={['rgba(0, 230, 118, 0.16)', 'rgba(0, 230, 118, 0.04)']}
              style={styles.actionCardGradient}
            />
            <View style={[styles.actionIconCircle, { backgroundColor: 'rgba(0, 230, 118, 0.2)' }]}>
              <Ionicons name="mail" size={19} color="#00e676" />
            </View>
            <Text style={styles.actionCardTitle}>Email</Text>
            <Text style={styles.actionCardSubtitle}>Send Query</Text>
          </AnimatedTouchable>

          {/* Call Action */}
          <AnimatedTouchable style={styles.actionCard} onPress={handlePhonePress}>
            <LinearGradient
              colors={['rgba(41, 121, 255, 0.16)', 'rgba(41, 121, 255, 0.04)']}
              style={styles.actionCardGradient}
            />
            <View style={[styles.actionIconCircle, { backgroundColor: 'rgba(41, 121, 255, 0.2)' }]}>
              <Ionicons name="call" size={19} color="#2979ff" />
            </View>
            <Text style={styles.actionCardTitle}>Call</Text>
            <Text style={styles.actionCardSubtitle}>Direct Line</Text>
          </AnimatedTouchable>

          {/* Share Card Action */}
          <AnimatedTouchable style={styles.actionCard} onPress={handleShareContact}>
            <LinearGradient
              colors={[theme.primary + '22', theme.primary + '08']}
              style={styles.actionCardGradient}
            />
            <View style={[styles.actionIconCircle, { backgroundColor: theme.primary + '33' }]}>
              <Ionicons name="share-social" size={19} color={theme.primaryLight || theme.primary} />
            </View>
            <Text style={styles.actionCardTitle}>Share</Text>
            <Text style={styles.actionCardSubtitle}>Contact Card</Text>
          </AnimatedTouchable>
        </Animated.View>

        {/* ── 3. CREATOR'S VISION & TECH STACK ── */}
        <Animated.View
          style={[
            styles.card,
            {
              opacity: missionAnim,
              transform: [
                {
                  translateY: missionAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <Ionicons name="sparkles" size={16} color={theme.primary} style={{ marginRight: 6 }} />
            <Text style={styles.cardSectionTitle}>THE CREATOR'S PHILOSOPHY</Text>
          </View>
          <Text style={styles.missionQuote}>
            "VPLEX was crafted to eliminate modern streaming clutter: zero intrusive popups, seamless P2P torrent playback, and an uncompromising pursuit of cinematic visual excellence."
          </Text>

          {/* Skill / Architecture Pills */}
          <View style={styles.techPillsWrap}>
            {['React Native', 'TypeScript', 'Stremio Protocol', 'BitTorrent P2P', 'UI/UX Design', 'Performance Tuning'].map(
              (tag, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.techPill,
                    { borderColor: 'rgba(255, 255, 255, 0.12)' },
                  ]}
                >
                  <Text style={styles.techPillText}>{tag}</Text>
                </View>
              )
            )}
          </View>
        </Animated.View>

        {/* ── 4. VPLEX ARCHITECTURAL HIGHLIGHTS (Bento Grid) ── */}
        <Animated.View
          style={[
            styles.bentoSection,
            {
              opacity: bentoAnim,
              transform: [
                {
                  translateY: bentoAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <Ionicons name="hardware-chip-outline" size={16} color={theme.primary} style={{ marginRight: 6 }} />
            <Text style={styles.cardSectionTitle}>PLATFORM CAPABILITIES</Text>
          </View>

          <View style={styles.bentoGrid}>
            <View style={styles.bentoCard}>
              <View style={[styles.bentoIconBox, { backgroundColor: 'rgba(255, 69, 58, 0.15)' }]}>
                <Ionicons name="flash-outline" size={18} color="#ff453a" />
              </View>
              <Text style={styles.bentoTitle}>P2P Stremio Core</Text>
              <Text style={styles.bentoDesc}>Ultra-low latency BitTorrent stream resolution & inline buffering.</Text>
            </View>

            <View style={styles.bentoCard}>
              <View style={[styles.bentoIconBox, { backgroundColor: 'rgba(48, 209, 88, 0.15)' }]}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#30d158" />
              </View>
              <Text style={styles.bentoTitle}>AdBlock Shield</Text>
              <Text style={styles.bentoDesc}>100% popup-free, redirect-neutralized browsing environment.</Text>
            </View>

            <View style={styles.bentoCard}>
              <View style={[styles.bentoIconBox, { backgroundColor: 'rgba(10, 132, 255, 0.15)' }]}>
                <Ionicons name="film-outline" size={18} color="#0a84ff" />
              </View>
              <Text style={styles.bentoTitle}>4K UHD & HDR</Text>
              <Text style={styles.bentoDesc}>Dolby Atmos, multi-language audio selection & crisp subtitle sync.</Text>
            </View>

            <View style={styles.bentoCard}>
              <View style={[styles.bentoIconBox, { backgroundColor: 'rgba(255, 214, 10, 0.15)' }]}>
                <Ionicons name="cloud-download-outline" size={18} color="#ffd60a" />
              </View>
              <Text style={styles.bentoTitle}>Smart Offline</Text>
              <Text style={styles.bentoDesc}>High-speed background downloader with live pause and resume.</Text>
            </View>
          </View>
        </Animated.View>

        {/* ── 5. DIRECT CONTACT DIRECTORY ── */}
        <Animated.View
          style={[
            styles.card,
            {
              opacity: contactAnim,
              transform: [
                {
                  translateY: contactAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <Ionicons name="person-circle-outline" size={16} color={theme.primary} style={{ marginRight: 6 }} />
            <Text style={styles.cardSectionTitle}>DEVELOPER DIRECTORY</Text>
          </View>

          {/* Email Row */}
          <TouchableOpacity
            style={styles.contactRow}
            onPress={handleEmailPress}
            activeOpacity={0.7}
          >
            <View style={styles.contactIconWrap}>
              <Ionicons name="mail-outline" size={17} color="#8E8E93" />
            </View>
            <View style={styles.contactTextContainer}>
              <Text style={styles.contactLabel}>Email Address</Text>
              <Text style={styles.contactValue} numberOfLines={1} ellipsizeMode="middle">
                vigneshsivapragasam28@gmail.com
              </Text>
            </View>
            <TouchableOpacity
              style={styles.copyPill}
              onPress={async () => {
                if (await isHapticsSupported()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                await Clipboard.setStringAsync('vigneshsivapragasam28@gmail.com');
                triggerToast('Email copied!');
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="copy-outline" size={13} color="#8E8E93" style={{ marginRight: 4 }} />
              <Text style={styles.copyPillText}>Copy</Text>
            </TouchableOpacity>
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Phone Row */}
          <TouchableOpacity
            style={styles.contactRow}
            onPress={handlePhonePress}
            activeOpacity={0.7}
          >
            <View style={styles.contactIconWrap}>
              <Ionicons name="call-outline" size={17} color="#8E8E93" />
            </View>
            <View style={styles.contactTextContainer}>
              <Text style={styles.contactLabel}>Mobile & WhatsApp</Text>
              <Text style={styles.contactValue}>+91 8122396125</Text>
            </View>
            <TouchableOpacity
              style={styles.copyPill}
              onPress={async () => {
                if (await isHapticsSupported()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                await Clipboard.setStringAsync('+918122396125');
                triggerToast('Phone number copied!');
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="copy-outline" size={13} color="#8E8E93" style={{ marginRight: 4 }} />
              <Text style={styles.copyPillText}>Copy</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>

        {/* ── 6. APP SPECIFICATIONS CARD ── */}
        <Animated.View
          style={[
            styles.card,
            {
              opacity: appSpecAnim,
              transform: [
                {
                  translateY: appSpecAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.appHeaderRow}>
            <Image
              source={require('@/assets/images/icon.png')}
              style={styles.appIcon}
              resizeMode="cover"
            />
            <View style={styles.appHeaderTextWrap}>
              <View style={styles.appNameRow}>
                <Text style={styles.appName}>VPLEX</Text>
                <TouchableOpacity
                  style={[
                    styles.versionBadge,
                    {
                      backgroundColor: theme.primary + '18',
                      borderColor: theme.primary + '40',
                    },
                  ]}
                  onPress={copyVersion}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.versionText, { color: theme.primaryLight || theme.primary }]}>
                    v{appVersion}
                  </Text>
                  <Ionicons name="copy-outline" size={10} color={theme.primary} style={{ marginLeft: 3 }} />
                </TouchableOpacity>
              </View>
              <Text style={styles.appTagline}>Next-Gen High-Performance Streaming Platform</Text>
            </View>
          </View>

          <View style={styles.specBox}>
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Developer & Maintainer</Text>
              <Text style={styles.specValue}>S Vignesh (VIKI)</Text>
            </View>

            <View style={styles.specDivider} />

            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Architecture</Text>
              <Text style={styles.specValue}>React Native • Stremio Engine</Text>
            </View>

            <View style={styles.specDivider} />

            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Target Platform</Text>
              <Text style={styles.specValue}>
                {Platform.OS === 'ios' ? 'Apple iOS' : Platform.OS === 'android' ? 'Google Android' : 'Web Single Page App'}
              </Text>
            </View>

            <View style={styles.specDivider} />

            <View style={styles.specRow}>
              <Text style={styles.specLabel}>License & Status</Text>
              <Text style={styles.specValue}>Active Production • Free</Text>
            </View>
          </View>
        </Animated.View>

        {/* ── 7. LEGAL & DISCLAIMER NOTE ── */}
        <Animated.View
          style={[
            styles.card,
            styles.disclaimerCard,
            {
              opacity: disclaimerAnim,
              transform: [
                {
                  translateY: disclaimerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [15, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.disclaimerHeader}>
            <Ionicons name="shield-checkmark-outline" size={15} color="#8E8E93" style={{ marginRight: 6 }} />
            <Text style={styles.disclaimerTitle}>PLATFORM DISCLAIMER</Text>
          </View>
          <Text style={styles.disclaimerText}>
            VPLEX is an open-source media player and aggregator designed to index public torrent listings and user-configured feeds. VPLEX does not host, store, or stream copyrighted material on its own servers. All content is fetched directly from decentralized peers and third-party indexers.
          </Text>

          <View style={styles.footerNoteRow}>
            <Text style={styles.footerNoteText}>
              Handcrafted with <Ionicons name="heart" size={11} color="#ff3b30" /> by S Vignesh (VIKI)
            </Text>
          </View>
        </Animated.View>

        <BottomSpacing space={40} />
      </ScrollView>

      {/* ── 8. FULL-SCREEN PROFILE PHOTO MODAL ── */}
      <Modal
        visible={photoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPhotoModalVisible(false)}
        >
          <View style={styles.modalContent}>
            {/* Close Button */}
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setPhotoModalVisible(false)}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={24} color="#ffffff" />
            </TouchableOpacity>

            <View style={[styles.modalImageWrap, { borderColor: theme.primary }]}>
              <Image
                source={DEVELOPER_PHOTO}
                style={styles.modalImage}
                resizeMode="cover"
              />
            </View>

            <View style={styles.modalMetaBox}>
              <Text style={styles.modalName}>S Vignesh (VIKI)</Text>
              <Text style={styles.modalRole}>Lead Mobile Architect & Creator</Text>
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 30,
    maxWidth: 720,
    width: '100%',
    marginHorizontal: 'auto',
  },

  /* Floating Toast */
  toastContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 36,
    left: 0,
    right: 0,
    zIndex: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  toastBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },

  /* Navigation Bar */
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.2,
  },

  /* 1. Hero Showcase */
  heroCard: {
    backgroundColor: '#131317',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 24,
    paddingHorizontal: 18,
    marginBottom: 12,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGradient: {
    ...StyleSheet.absoluteFill,
  },
  avatarContainer: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 14,
  },
  avatarPulsingHalo: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarFrame: {
    width: 106,
    height: 106,
    borderRadius: 53,
    borderWidth: 3,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1a1a1c',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#131317',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  developerName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  vikiBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  vikiBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  developerRole: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  infoPillText: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '600',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(48, 209, 88, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(48, 209, 88, 0.25)',
  },
  statusDotWrap: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
    position: 'relative',
  },
  statusDotPulse: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(48, 209, 88, 0.35)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#30d158',
  },
  statusPillText: {
    fontSize: 11,
    color: '#30d158',
    fontWeight: '700',
  },

  /* 2. Quick Actions Grid */
  quickActionsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#141418',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  actionCardGradient: {
    ...StyleSheet.absoluteFill,
  },
  actionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  actionCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  actionCardSubtitle: {
    fontSize: 9.5,
    color: '#8E8E93',
    marginTop: 2,
    textAlign: 'center',
  },

  /* 3. Common Card Layout */
  card: {
    backgroundColor: '#131317',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8E8E93',
    letterSpacing: 0.6,
  },
  missionQuote: {
    fontSize: 13.5,
    lineHeight: 20,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '400',
    fontStyle: 'italic',
  },
  techPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 14,
  },
  techPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  techPillText: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '600',
  },

  /* 4. Bento Section */
  bentoSection: {
    marginBottom: 12,
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bentoCard: {
    width: '48.8%',
    backgroundColor: '#131317',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 12,
  },
  bentoIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  bentoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 3,
  },
  bentoDesc: {
    fontSize: 11,
    color: '#8E8E93',
    lineHeight: 15,
  },

  /* 5. Directory Contact */
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  contactIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  contactTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  contactLabel: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '500',
  },
  contactValue: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '600',
    marginTop: 1,
  },
  copyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  copyPillText: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginVertical: 4,
  },

  /* 6. App Specifications */
  appHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  appIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  appHeaderTextWrap: {
    flex: 1,
    marginLeft: 12,
  },
  appNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  appName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  versionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
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
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 2,
  },
  specBox: {
    backgroundColor: '#16161b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  specLabel: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
    flex: 1,
  },
  specValue: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
    textAlign: 'right',
  },
  specDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },

  /* 7. Disclaimer Card */
  disclaimerCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  disclaimerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  disclaimerTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.5,
  },
  disclaimerText: {
    fontSize: 11,
    color: '#777777',
    lineHeight: 17,
  },
  footerNoteRow: {
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  footerNoteText: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '500',
  },

  /* 8. Photo Lightbox Modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 360,
    width: '100%',
  },
  modalCloseBtn: {
    alignSelf: 'flex-end',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalImageWrap: {
    width: 280,
    height: 350,
    borderRadius: 20,
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: '#1a1a1c',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  modalMetaBox: {
    alignItems: 'center',
    marginTop: 18,
  },
  modalName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
  },
  modalRole: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
});

export default AboutUsScreen;
