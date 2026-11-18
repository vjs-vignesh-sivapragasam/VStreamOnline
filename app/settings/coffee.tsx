import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Linking,
  Animated,
  Platform,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import BottomSpacing from '@/components/BottomSpacing';
import { useTheme } from '@/contexts/ThemeContext';
import BlurGradientBackground from '@/components/BlurGradientBackground';
import { StatusBar } from '@/components/Themed';
import { SvgXml } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

// ─── Real Brand Vector SVGs ─────────────────────────────────────────────────

const GPAY_LOGO_XML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="100%" height="100%">
  <circle cx="24" cy="24" r="23" fill="#ffffff"/>
  <path fill="#4285F4" d="M34.8 24.3c0-.8-.1-1.6-.2-2.3H24v4.5h6.1c-.3 1.5-1.1 2.8-2.4 3.7v3h3.8c2.2-2.1 3.5-5.1 3.5-8.9z"/>
  <path fill="#34A853" d="M24 35.5c3.2 0 6-1.1 7.9-3l-3.8-3c-1.1.7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H13.4v3.1c2 3.9 6 6.7 10.6 6.7z"/>
  <path fill="#FBBC05" d="M17.3 25.7c-.2-.7-.4-1.4-.4-2.2 0-.8.2-1.5.4-2.2v-3.1h-3.9C12.6 19.8 12 21.8 12 24s.6 4.2 1.4 5.8l3.9-3.1z"/>
  <path fill="#EA4335" d="M24 16.2c1.8 0 3.3.6 4.6 1.8l3.4-3.4C29.9 12.7 27.2 11.8 24 11.8c-4.6 0-8.6 2.8-10.6 6.7l3.9 3.1c.9-2.9 3.6-5.4 6.7-5.4z"/>
</svg>`;

const PHONEPE_LOGO_XML = `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="11" fill="#ffffff" />
  <path fill="#5F259F" d="M10.206 9.941h2.949v4.692c-.402.201-.938.268-1.34.268-1.072 0-1.609-.536-1.609-1.743V9.941zm13.47 4.816c-1.523 6.449-7.985 10.442-14.433 8.919C2.794 22.154-1.199 15.691.324 9.243 1.847 2.794 8.309-1.199 14.757.324c6.449 1.523 10.442 7.985 8.919 14.433m-6.231-5.888a.887.887 0 0 0-.871-.871h-1.609l-3.686-4.222c-.335-.402-.871-.536-1.407-.402l-1.274.401c-.201.067-.268.335-.134.469l4.021 3.82H6.386c-.201 0-.335.134-.335.335v.67c0 .469.402.871.871.871h.938v3.217c0 2.413 1.273 3.82 3.418 3.82.67 0 1.206-.067 1.877-.335v2.145c0 .603.469 1.072 1.072 1.072h.938a.432.432 0 0 0 .402-.402V9.874h1.542c.201 0 .335-.134.335-.335v-.67z"/>
</svg>`;

const UPI_LOGO_XML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 432 180" width="100%" height="100%">
  <g>
    <!-- Letters U, P, I -->
    <path d="M156.12,133.46c-1.07,3.83-4.56,6.49-8.54,6.49H48.09c-2.71,0-4.73-.92-6.05-2.77-1.32-1.85-1.61-4.13-.85-6.86l24.28-87.39h19.3l-21.68,78.05h77.21l21.68-78.05h19.3l-25.15,90.53Z" fill="#ffffff"/>
    <path d="M306.45,45.71c-1.34-1.84-3.4-2.77-6.2-2.77h-106.04l-5.25,18.97h19.29s77.17-.01,77.17-.01l-5.61,20.27h-77.17v-.04s-19.28,0-19.28,0l-16.01,57.79h19.3l10.74-38.79h86.75c2.71,0,5.26-.92,7.66-2.77,2.39-1.85,3.97-4.13,4.72-6.86l10.74-38.79c.78-2.82.51-5.15-.81-7Z" fill="#ffffff"/>
    <path d="M316.46,139.51h-19.28l26.82-96.86h19.28l-26.82,96.86Z" fill="#ffffff"/>
    <!-- Chevrons / Triangles -->
    <polygon points="376.59 42.83 401 91.38 349.68 139.92 376.59 42.83" fill="#0f8041"/>
    <polygon points="359.47 42.83 383.87 91.38 332.52 139.92 359.47 42.83" fill="#e97726"/>
  </g>
</svg>`;

const DEVELOPER_NAME = 'S Vignesh';
const GPAY_UPI_ID = 'vigneshsivapragasam28-1@okaxis';
const PHONEPE_UPI_ID = '8122396125-2@ybl';
const PHONEPE_QR_IMAGE = require('@/assets/images/phonepe_qr.png');

interface DonationPreset {
  amount: number;
  label: string;
  emoji: string;
  popular?: boolean;
}

const PRESET_AMOUNTS: DonationPreset[] = [
  { amount: 50, label: '1 Coffee', emoji: '☕' },
  { amount: 100, label: '2 Coffees', emoji: '☕☕', popular: true },
  { amount: 200, label: '3 Coffees', emoji: '☕☕☕' },
  { amount: 500, label: 'Super Fan', emoji: '🚀' },
  { amount: 1000, label: 'VIP Patron', emoji: '👑' },
];

export default function BuyMeACoffeeScreen() {
  const { theme } = useTheme();

  // State
  const [selectedAmount, setSelectedAmount] = useState<number>(100);
  const [customAmountText, setCustomAmountText] = useState<string>('');
  const [selectedApp, setSelectedApp] = useState<'gpay' | 'phonepe' | 'any'>('gpay');
  const [showQrCode, setShowQrCode] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Toast Notification
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
      }, 2500);
    });
  };

  const triggerHaptic = async (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(style);
    }
  };

  const activeAmount = customAmountText.trim()
    ? Math.max(1, parseInt(customAmountText, 10) || selectedAmount)
    : selectedAmount;

  const handleSelectPreset = async (amt: number) => {
    await triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAmount(amt);
    setCustomAmountText('');
  };

  const handleCustomAmountChange = (text: string) => {
    // Only numbers
    const clean = text.replace(/[^0-9]/g, '');
    setCustomAmountText(clean);
  };

  const copyToClipboard = async (text: string, label: string) => {
    await triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    await Clipboard.setStringAsync(text);
    triggerToast(`${label} copied to clipboard!`);
  };

  const handlePayRedirect = async (appOverride?: 'gpay' | 'phonepe' | 'any') => {
    const appToUse = appOverride || selectedApp;
    await triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    setIsProcessing(true);

    const amountStr = activeAmount.toFixed(2);
    const payeeName = DEVELOPER_NAME;
    const note = 'Buy Me A Coffee - VPLEX';

    // Target UPI ID
    const upiId = appToUse === 'phonepe' ? PHONEPE_UPI_ID : GPAY_UPI_ID;

    // Standard NPCI UPI URI
    const genericUpiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${amountStr}&cu=INR&tn=${encodeURIComponent(note)}`;

    // App-specific URI schemes
    let appSpecificUrl = genericUpiUrl;
    if (appToUse === 'gpay') {
      appSpecificUrl = `tez://upi/pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${amountStr}&cu=INR&tn=${encodeURIComponent(note)}`;
    } else if (appToUse === 'phonepe') {
      appSpecificUrl = `phonepe://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${amountStr}&cu=INR&tn=${encodeURIComponent(note)}`;
    }

    try {
      if (appToUse === 'gpay' || appToUse === 'phonepe') {
        try {
          await Linking.openURL(appSpecificUrl);
          setIsProcessing(false);
          return;
        } catch {
          // If app-specific scheme failed to launch (e.g. not installed), fallback to standard generic UPI intent
          await Linking.openURL(genericUpiUrl);
          setIsProcessing(false);
          return;
        }
      }

      // Any UPI app / standard intent
      await Linking.openURL(genericUpiUrl);
      setIsProcessing(false);
    } catch {
      // If payment app didn't open (e.g. desktop/emulator or no UPI app), copy UPI to clipboard & show QR code
      await Clipboard.setStringAsync(upiId);
      setShowQrCode(true);
      triggerToast(`UPI ID (${upiId}) copied! Scan QR or paste in your app.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSharePaymentDetails = async () => {
    await triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
    const message =
      `Support VPLEX Developer (${DEVELOPER_NAME}):\n` +
      `• Google Pay (GPay): ${GPAY_UPI_ID}\n` +
      `• PhonePe: ${PHONEPE_UPI_ID}\n` +
      `• Suggested Amount: ₹${activeAmount}\n` +
      `Thank you for keeping VPLEX alive and free!`;

    try {
      await Share.share({
        message,
        title: 'Support VPLEX Developer via UPI',
      });
    } catch {
      await Clipboard.setStringAsync(GPAY_UPI_ID);
      triggerToast('GPay UPI copied to clipboard!');
    }
  };

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

      {/* Top Navigation Bar */}
      <View style={styles.navBar}>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={22} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Buy Me a Coffee</Text>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={handleSharePaymentDetails}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="share-outline" size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero Banner */}
        <View style={styles.heroCard}>
          <View style={styles.heroIconBadge}>
            <Ionicons name="cafe" size={32} color="#FF9F0A" />
          </View>
          <Text style={styles.heroTitle}>Enjoying VPLEX?</Text>
          <Text style={styles.heroSubtitle}>
            VPLEX is completely free, ad-free, and community powered. Your contribution directly covers
            server hosting, mirrors & continuous development!
          </Text>
          <View style={styles.developerTag}>
            <Ionicons name="heart" size={13} color="#FF3B30" style={{ marginRight: 5 }} />
            <Text style={styles.developerTagText}>Created with passion by {DEVELOPER_NAME}</Text>
          </View>
        </View>

        {/* Amount Selection Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>SELECT AMOUNT</Text>
            <Text style={styles.amountDisplay}>₹{activeAmount}</Text>
          </View>

          {/* Preset Buttons Grid */}
          <View style={styles.presetsGrid}>
            {PRESET_AMOUNTS.map((p) => {
              const isSelected = selectedAmount === p.amount && !customAmountText;
              return (
                <TouchableOpacity
                  key={`preset-${p.amount}`}
                  style={[
                    styles.presetButton,
                    isSelected && [
                      styles.presetButtonSelected,
                      { borderColor: theme.primary, backgroundColor: `${theme.primary}22` },
                    ],
                  ]}
                  onPress={() => handleSelectPreset(p.amount)}
                  activeOpacity={0.7}
                >
                  {p.popular && (
                    <View style={[styles.popularBadge, { backgroundColor: theme.primary }]}>
                      <Text style={styles.popularBadgeText}>POPULAR</Text>
                    </View>
                  )}
                  <Text style={styles.presetEmoji}>{p.emoji}</Text>
                  <Text
                    style={[
                      styles.presetAmount,
                      isSelected && { color: theme.primaryLight || theme.primary },
                    ]}
                  >
                    ₹{p.amount}
                  </Text>
                  <Text style={styles.presetLabel}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Custom Amount Input Box */}
          <View style={styles.customAmountWrap}>
            <View style={styles.customAmountIconBox}>
              <Text style={styles.rupeeSign}>₹</Text>
            </View>
            <TextInput
              style={styles.customAmountInput}
              placeholder="Or enter custom amount (e.g. 150, 300)"
              placeholderTextColor="#6e6e73"
              keyboardType="number-pad"
              value={customAmountText}
              onChangeText={handleCustomAmountChange}
              maxLength={6}
            />
            {customAmountText.length > 0 && (
              <TouchableOpacity
                onPress={() => setCustomAmountText('')}
                hitSlop={8}
                style={{ padding: 4 }}
              >
                <Ionicons name="close-circle" size={18} color="#8e8e93" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Payment Method Selector */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>CHOOSE PAYMENT METHOD</Text>
            <View style={styles.secureHeaderBadge}>
              <Ionicons name="shield-checkmark" size={11} color="#30d158" style={{ marginRight: 4 }} />
              <Text style={styles.secureHeaderBadgeText}>Instant & Direct</Text>
            </View>
          </View>

          {/* 1. Google Pay (GPay) Card */}
          <TouchableOpacity
            style={[
              styles.paymentMethodCard,
              selectedApp === 'gpay' && styles.paymentMethodCardActiveGpay,
            ]}
            onPress={async () => {
              await triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
              setSelectedApp('gpay');
            }}
            activeOpacity={0.8}
          >
            {selectedApp === 'gpay' && (
              <LinearGradient
                colors={['rgba(66, 133, 244, 0.14)', 'rgba(66, 133, 244, 0.03)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardGradientBg}
              />
            )}
            <View style={styles.paymentMethodLeft}>
              <View style={[styles.paymentAppBadge, styles.paymentAppBadgeGpay]}>
                <SvgXml xml={GPAY_LOGO_XML} width={34} height={34} />
              </View>
              <View style={styles.paymentMethodInfo}>
                <View style={styles.methodTitleRow}>
                  <Text style={styles.paymentMethodTitle}>Google Pay</Text>
                  <View style={[styles.methodTag, { backgroundColor: 'rgba(66, 133, 244, 0.16)' }]}>
                    <Text style={[styles.methodTagText, { color: '#4285F4' }]}>GPay • Instant</Text>
                  </View>
                </View>
                <View style={styles.upiIdRow}>
                  <Text style={styles.upiIdText} numberOfLines={1}>{GPAY_UPI_ID}</Text>
                  <TouchableOpacity
                    style={styles.copyPillBtn}
                    onPress={() => copyToClipboard(GPAY_UPI_ID, 'GPay UPI ID')}
                    hitSlop={8}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="copy-outline" size={12} color="#4285F4" style={{ marginRight: 4 }} />
                    <Text style={[styles.copyPillBtnText, { color: '#4285F4' }]}>Copy</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            <View style={styles.paymentMethodRight}>
              <View
                style={[
                  styles.radioDot,
                  selectedApp === 'gpay' && styles.radioDotActiveGpay,
                ]}
              >
                {selectedApp === 'gpay' && (
                  <View style={[styles.radioInner, { backgroundColor: '#4285F4' }]} />
                )}
              </View>
            </View>
          </TouchableOpacity>

          {/* 2. PhonePe Card */}
          <TouchableOpacity
            style={[
              styles.paymentMethodCard,
              selectedApp === 'phonepe' && styles.paymentMethodCardActivePhonePe,
            ]}
            onPress={async () => {
              await triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
              setSelectedApp('phonepe');
            }}
            activeOpacity={0.8}
          >
            {selectedApp === 'phonepe' && (
              <LinearGradient
                colors={['rgba(123, 31, 162, 0.18)', 'rgba(123, 31, 162, 0.04)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardGradientBg}
              />
            )}
            <View style={styles.paymentMethodLeft}>
              <View style={[styles.paymentAppBadge, styles.paymentAppBadgePhonePe]}>
                <SvgXml xml={PHONEPE_LOGO_XML} width={34} height={34} />
              </View>
              <View style={styles.paymentMethodInfo}>
                <View style={styles.methodTitleRow}>
                  <Text style={styles.paymentMethodTitle}>PhonePe</Text>
                  <View style={[styles.methodTag, { backgroundColor: 'rgba(156, 39, 176, 0.18)' }]}>
                    <Text style={[styles.methodTagText, { color: '#BA68C8' }]}>QR Verified</Text>
                  </View>
                </View>
                <View style={styles.upiIdRow}>
                  <Text style={styles.upiIdText} numberOfLines={1}>{PHONEPE_UPI_ID}</Text>
                  <TouchableOpacity
                    style={styles.copyPillBtn}
                    onPress={() => copyToClipboard(PHONEPE_UPI_ID, 'PhonePe UPI ID')}
                    hitSlop={8}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="copy-outline" size={12} color="#BA68C8" style={{ marginRight: 4 }} />
                    <Text style={[styles.copyPillBtnText, { color: '#BA68C8' }]}>Copy</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            <View style={styles.paymentMethodRight}>
              <View
                style={[
                  styles.radioDot,
                  selectedApp === 'phonepe' && styles.radioDotActivePhonePe,
                ]}
              >
                {selectedApp === 'phonepe' && (
                  <View style={[styles.radioInner, { backgroundColor: '#BA68C8' }]} />
                )}
              </View>
            </View>
          </TouchableOpacity>

          {/* 3. Other UPI Apps Card */}
          <TouchableOpacity
            style={[
              styles.paymentMethodCard,
              selectedApp === 'any' && [
                styles.paymentMethodCardActiveUpi,
                { borderColor: theme.primary },
              ],
            ]}
            onPress={async () => {
              await triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
              setSelectedApp('any');
            }}
            activeOpacity={0.8}
          >
            {selectedApp === 'any' && (
              <LinearGradient
                colors={[`${theme.primary}1C`, `${theme.primary}05`, 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardGradientBg}
              />
            )}
            <View style={styles.paymentMethodLeft}>
              <View style={[styles.paymentAppBadge, styles.paymentAppBadgeUpi]}>
                <SvgXml xml={UPI_LOGO_XML} width={38} height={20} />
              </View>
              <View style={styles.paymentMethodInfo}>
                <View style={styles.methodTitleRow}>
                  <Text style={styles.paymentMethodTitle}>Other UPI Apps</Text>
                  <View style={[styles.methodTag, { backgroundColor: 'rgba(255, 255, 255, 0.08)' }]}>
                    <Text style={[styles.methodTagText, { color: '#e4e4e7' }]}>Paytm • CRED • BHIM</Text>
                  </View>
                </View>
                <Text style={styles.upiSubText}>
                  Launch any installed payment app or banking UPI
                </Text>
              </View>
            </View>
            <View style={styles.paymentMethodRight}>
              <View
                style={[
                  styles.radioDot,
                  selectedApp === 'any' && [styles.radioDotActiveUpi, { borderColor: theme.primary }],
                ]}
              >
                {selectedApp === 'any' && (
                  <View style={[styles.radioInner, { backgroundColor: theme.primary }]} />
                )}
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Main Action: Pay Button */}
        <TouchableOpacity
          style={[styles.payButtonWrapper, isProcessing && { opacity: 0.8 }]}
          onPress={() => handlePayRedirect()}
          activeOpacity={0.88}
          disabled={isProcessing}
        >
          <LinearGradient
            colors={
              selectedApp === 'phonepe'
                ? ['#6739B7', '#4A148C']
                : selectedApp === 'gpay'
                ? ['#1A73E8', '#0D47A1']
                : [theme.primary, theme.primaryDark || theme.primary]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.payButtonGradient}
          >
            <View style={styles.payBtnIconBadge}>
              {selectedApp === 'gpay' ? (
                <SvgXml xml={GPAY_LOGO_XML} width={20} height={20} />
              ) : selectedApp === 'phonepe' ? (
                <SvgXml xml={PHONEPE_LOGO_XML} width={20} height={20} />
              ) : (
                <SvgXml xml={UPI_LOGO_XML} width={24} height={12} />
              )}
            </View>
            <Text style={styles.payButtonText}>
              {selectedApp === 'gpay'
                ? `Proceed to Google Pay • ₹${activeAmount}`
                : selectedApp === 'phonepe'
                ? `Proceed to PhonePe • ₹${activeAmount}`
                : `Pay via Any UPI App • ₹${activeAmount}`}
            </Text>
            <Ionicons name="arrow-forward" size={17} color="#ffffff" style={{ marginLeft: 6 }} />
          </LinearGradient>
        </TouchableOpacity>

        {/* Security & Direct Transfer Trust Badge */}
        <View style={styles.trustBadgeRow}>
          <Ionicons name="shield-checkmark" size={13} color="#30d158" style={{ marginRight: 5 }} />
          <Text style={styles.trustBadgeText}>
            100% Direct UPI Transfer • Zero Intermediary Fees
          </Text>
        </View>

        {/* Scan PhonePe QR Code Expandable Card */}
        <View style={styles.qrCard}>
          <TouchableOpacity
            style={styles.qrCardHeader}
            onPress={async () => {
              await triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
              setShowQrCode(!showQrCode);
            }}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={[styles.qrIconBadge, { backgroundColor: '#5F259F' }]}>
                <SvgXml xml={PHONEPE_LOGO_XML} width={22} height={22} />
              </View>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.qrCardTitle}>PhonePe Verified QR Code</Text>
                <Text style={styles.qrCardSub}>Tap to expand QR code for scanning from another phone</Text>
              </View>
            </View>
            <Ionicons
              name={showQrCode ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="#8E8E93"
            />
          </TouchableOpacity>

          {showQrCode && (
            <View style={styles.qrExpandedContent}>
              <View style={styles.qrImageFrame}>
                <Image
                  source={PHONEPE_QR_IMAGE}
                  style={styles.qrImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.qrPayeeName}>{DEVELOPER_NAME}</Text>
              <Text style={styles.qrInstructions}>
                Open PhonePe, Google Pay, or Paytm camera to scan this QR directly.
              </Text>
              <View style={styles.qrActionButtonsRow}>
                <TouchableOpacity
                  style={styles.qrActionBtn}
                  onPress={() => copyToClipboard(PHONEPE_UPI_ID, 'PhonePe UPI ID')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="copy-outline" size={15} color="#BA68C8" style={{ marginRight: 5 }} />
                  <Text style={styles.qrActionBtnText}>Copy PhonePe UPI</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.qrActionBtn}
                  onPress={() => copyToClipboard(GPAY_UPI_ID, 'GPay UPI ID')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="copy-outline" size={15} color="#4285F4" style={{ marginRight: 5 }} />
                  <Text style={styles.qrActionBtnText}>Copy GPay UPI</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Transparency & Note */}
        <View style={styles.noteCard}>
          <Ionicons name="shield-checkmark-outline" size={20} color="#30d158" style={{ marginRight: 10, marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.noteTitle}>100% Direct to Developer</Text>
            <Text style={styles.noteText}>
              All transactions are direct UPI transfers to the developer with 0% platform cuts or third-party fees.
              Every rupee directly supports server maintenance & keeping the platform free!
            </Text>
          </View>
        </View>

        <BottomSpacing space={60} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  // Floating Toast
  toastContainer: {
    position: 'absolute',
    top: 54,
    left: 20,
    right: 20,
    zIndex: 9999,
    alignItems: 'center',
  },
  toastBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(28, 28, 30, 0.96)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  toastText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },

  // Navigation Bar
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
  },

  // Hero Banner Card
  heroCard: {
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: '#262629',
    marginTop: 8,
    marginBottom: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  heroIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 159, 10, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 159, 10, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 13.5,
    color: '#a1a1aa',
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 320,
    marginBottom: 16,
  },
  developerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  developerTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#e4e4e7',
  },

  // Section Layout
  section: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#71717a',
    letterSpacing: 0.6,
  },
  amountDisplay: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },

  // Presets Grid
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  presetButton: {
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: '#18181b',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#262629',
    position: 'relative',
  },
  presetButtonSelected: {
    borderWidth: 2,
  },
  popularBadge: {
    position: 'absolute',
    top: -7,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  popularBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.4,
  },
  presetEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  presetAmount: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 2,
  },
  presetLabel: {
    fontSize: 11,
    color: '#a1a1aa',
    fontWeight: '500',
  },

  // Custom Amount Input
  customAmountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#262629',
    paddingHorizontal: 14,
    height: 48,
  },
  customAmountIconBox: {
    marginRight: 8,
  },
  rupeeSign: {
    fontSize: 18,
    fontWeight: '700',
    color: '#a1a1aa',
  },
  customAmountInput: {
    flex: 1,
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '500',
  },

  // Section Header Badge
  secureHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(48, 209, 88, 0.25)',
  },
  secureHeaderBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#30d158',
    letterSpacing: 0.2,
  },

  // Payment Method Cards
  paymentMethodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(24, 24, 27, 0.85)',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  cardGradientBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  paymentMethodCardActiveGpay: {
    borderColor: '#4285F4',
    borderWidth: 2,
    shadowColor: '#4285F4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },
  paymentMethodCardActivePhonePe: {
    borderColor: '#BA68C8',
    borderWidth: 2,
    shadowColor: '#9C27B0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  paymentMethodCardActiveUpi: {
    borderWidth: 2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  paymentMethodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  paymentAppBadge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 13,
  },
  paymentAppBadgeGpay: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(66, 133, 244, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  paymentAppBadgePhonePe: {
    backgroundColor: '#5F259F',
    borderWidth: 1,
    borderColor: 'rgba(186, 104, 200, 0.35)',
    shadowColor: '#5F259F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  paymentAppBadgeUpi: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  paymentMethodInfo: {
    flex: 1,
  },
  methodTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  paymentMethodTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  methodTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  methodTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  upiIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  upiIdText: {
    fontSize: 12,
    color: '#a1a1aa',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: -0.2,
    maxWidth: 165,
  },
  upiSubText: {
    fontSize: 11.5,
    color: '#71717a',
    marginTop: 2,
  },
  copyPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  copyPillBtnText: {
    fontSize: 10,
    fontWeight: '700',
  },
  paymentMethodRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
  },
  radioDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioDotActiveGpay: {
    borderColor: '#4285F4',
  },
  radioDotActivePhonePe: {
    borderColor: '#BA68C8',
  },
  radioDotActiveUpi: {
    borderWidth: 2,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  // Main Pay Button
  payButtonWrapper: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  payButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    paddingHorizontal: 20,
  },
  payBtnIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  payButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  trustBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  trustBadgeText: {
    fontSize: 11.5,
    color: '#71717a',
    fontWeight: '500',
  },

  // QR Code Card
  qrCard: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#262629',
    overflow: 'hidden',
    marginBottom: 16,
  },
  qrCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  qrIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(186, 104, 200, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  qrCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 2,
  },
  qrCardSub: {
    fontSize: 11,
    color: '#a1a1aa',
    maxWidth: 240,
  },
  qrExpandedContent: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#262629',
  },
  qrImageFrame: {
    width: 240,
    height: 360,
    backgroundColor: '#000000',
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  qrImage: {
    width: '100%',
    height: '100%',
  },
  qrPayeeName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  qrInstructions: {
    fontSize: 12,
    color: '#a1a1aa',
    textAlign: 'center',
    maxWidth: 280,
    marginBottom: 14,
    lineHeight: 16,
  },
  qrActionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  qrActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  qrActionBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#e4e4e7',
  },

  // Note Card
  noteCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(48, 209, 88, 0.06)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(48, 209, 88, 0.2)',
  },
  noteTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#30d158',
    marginBottom: 3,
  },
  noteText: {
    fontSize: 11.5,
    color: '#a1a1aa',
    lineHeight: 16,
  },
});
