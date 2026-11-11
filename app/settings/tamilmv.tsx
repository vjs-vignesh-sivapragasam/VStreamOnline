import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Alert,
  Linking,
  AppState,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from '@/components/Themed';
import BottomSpacing from '@/components/BottomSpacing';
import { useTheme } from '@/contexts/ThemeContext';
import BlurGradientBackground from '@/components/BlurGradientBackground';
import { isHapticsSupported, showAlert } from '@/utils/platform';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import {
  DEFAULT_TAMILMV_BASE_URL,
  getTamilMVBaseUrlAsync,
  setTamilMVBaseUrl,
  resetTamilMVBaseUrl,
  autoDetectTamilMVDomain,
  pingTamilMV,
  PingResult,
  Language,
} from '@/hooks/useTamilMv';
import { tamilMVNotificationService } from '@/services/TamilMVNotificationService';

const PRESET_DOMAINS = [
  'https://www.1tamilmv.solar',
  'https://www.1tamilmv.cards',
  'https://www.1tamilmv.pizza',
  'https://www.1tamilmv.fi',
  'https://www.1tamilmv.live',
  'https://www.1tamilmv.pm',
  'https://www.1tamilmv.yt',
  'https://www.1tamilmv.mx',
];

const TamilMvSettingsScreen: React.FC = () => {
  const router = useRouter();
  const { theme } = useTheme();
  const [activeUrl, setActiveUrl] = useState<string>(DEFAULT_TAMILMV_BASE_URL);
  const [urlInput, setUrlInput] = useState<string>(DEFAULT_TAMILMV_BASE_URL);
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isAutoDetecting, setIsAutoDetecting] = useState<boolean>(false);
  const [detectProgressText, setDetectProgressText] = useState<string>('');
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const [lastPingedUrl, setLastPingedUrl] = useState<string | null>(null);

  // Push Notification States
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() =>
    tamilMVNotificationService.isNotificationsEnabled()
  );
  const [hasNotificationPermission, setHasNotificationPermission] = useState<boolean>(false);
  const [selectedLanguages, setSelectedLanguages] = useState<Language[]>(() =>
    tamilMVNotificationService.getSelectedLanguages()
  );
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [isCheckingNewMovies, setIsCheckingNewMovies] = useState<boolean>(false);
  const [checkStatusText, setCheckStatusText] = useState<string | null>(null);

  useEffect(() => {
    const checkPerm = async () => {
      const granted = await tamilMVNotificationService.checkPermissions();
      setHasNotificationPermission(granted);
    };

    checkPerm();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkPerm();
      }
    });

    return () => {
      sub.remove();
    };
  }, []);

  const handleToggleNotifications = async (val: boolean) => {
    await triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    if (val && !tamilMVNotificationService.isSupported()) {
      showAlert(
        'Notifications Unavailable',
        'Native notification modules are not included in this build (e.g. Expo Go or stale binary). Please rebuild your native app (npx expo run:android) to enable movie alerts.'
      );
      setNotificationsEnabled(false);
      return;
    }
    if (val && !hasNotificationPermission) {
      const granted = await tamilMVNotificationService.requestPermissions();
      setHasNotificationPermission(granted);
      if (!granted) {
        Alert.alert(
          'Permission Needed',
          'Notification permission is disabled. Would you like to open Settings to enable it?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
        return;
      }
    }
    setNotificationsEnabled(val);
    tamilMVNotificationService.setNotificationsEnabled(val);
  };

  const handleToggleLanguage = async (lang: Language) => {
    await triggerHaptic();
    let updated: Language[];
    if (selectedLanguages.includes(lang)) {
      if (selectedLanguages.length === 1) {
        showAlert('Language Selection', 'Please keep at least one language selected for alerts.');
        return;
      }
      updated = selectedLanguages.filter((l) => l !== lang);
    } else {
      updated = [...selectedLanguages, lang];
    }
    setSelectedLanguages(updated);
    tamilMVNotificationService.setSelectedLanguages(updated);
  };

  const handleSendTestNotification = async () => {
    await triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    if (!tamilMVNotificationService.isSupported()) {
      showAlert(
        'Notifications Unavailable',
        'Native notification modules are not included in this build. Please rebuild your app binary (npx expo run:android) to test notifications.'
      );
      return;
    }
    setIsSendingTest(true);
    try {
      const success = await tamilMVNotificationService.sendTestNotification();
      if (success) {
        setHasNotificationPermission(true);
        showAlert('Notification Sent! 🎬', 'Check your device notification banner to preview the movie alert.');
      } else {
        const hasPerm = await tamilMVNotificationService.checkPermissions();
        setHasNotificationPermission(hasPerm);
        if (!hasPerm) {
          Alert.alert(
            'Permission Denied',
            'Notification permission is disabled on your device. Please open Settings to enable notifications.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() }
            ]
          );
        } else {
          showAlert('Notification Error', 'Could not schedule notification. Please check your notification settings.');
        }
      }
    } catch (err: any) {
      showAlert('Error', err?.message || 'Failed to dispatch test notification.');
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleCheckNow = async () => {
    await triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    setIsCheckingNewMovies(true);
    setCheckStatusText('Checking TamilMV for new releases...');
    try {
      const res = await tamilMVNotificationService.checkForNewMovies(true);
      if (res.newCount > 0) {
        setCheckStatusText(`Dispatched ${res.newCount} new movie alert(s)!`);
        showAlert(
          'New Releases Found! 🎬',
          `Dispatched ${res.newCount} alert(s): ${res.movies.slice(0, 3).join(', ')}`
        );
      } else {
        setCheckStatusText('All caught up! No new releases detected right now.');
      }
    } catch (err: any) {
      setCheckStatusText('Check failed: ' + (err?.message || 'Network error'));
    } finally {
      setIsCheckingNewMovies(false);
    }
  };

  const triggerHaptic = useCallback(async (type: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(type);
    }
  }, []);

  const runPing = useCallback(async (targetUrl: string) => {
    setIsPinging(true);
    setLastPingedUrl(targetUrl);
    try {
      const result = await pingTamilMV(targetUrl);
      setPingResult(result);
      if (result.success && result.rssWorking) {
        triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (e: any) {
      setPingResult({
        success: false,
        latencyMs: 0,
        rssWorking: false,
        message: `Ping failed: ${e?.message || 'Unknown error'}`,
      });
    } finally {
      setIsPinging(false);
    }
  }, [triggerHaptic]);

  useEffect(() => {
    (async () => {
      const current = await getTamilMVBaseUrlAsync();
      setActiveUrl(current);
      setUrlInput(current);
      runPing(current);
    })();
  }, [runPing]);

  const handleTestPing = async () => {
    await triggerHaptic();
    const candidate = urlInput.trim();
    if (!candidate) {
      showAlert('Error', 'Please enter a valid URL to ping.');
      return;
    }
    await runPing(candidate);
  };

  const handleAutoDetectDomain = async () => {
    await triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    setIsAutoDetecting(true);
    setDetectProgressText('Searching for active mirror in background...');
    try {
      const working = await autoDetectTamilMVDomain((status) => {
        setDetectProgressText(status);
      });

      if (working) {
        setActiveUrl(working);
        setUrlInput(working);
        showAlert(
          'Domain Configured',
          `Successfully connected to live domain:\n\n${working}`
        );
        await runPing(working);
      } else {
        showAlert(
          'Auto-Detect Failed',
          'Could not find an active domain automatically. Please check your internet connection or select a mirror preset below.'
        );
      }
    } catch (e: any) {
      showAlert('Auto-Detect Error', e?.message || 'Failed to auto-detect working domain');
    } finally {
      setIsAutoDetecting(false);
      setDetectProgressText('');
    }
  };

  const handleSave = async () => {
    await triggerHaptic();
    const candidate = urlInput.trim().replace(/\/+$/, '');

    try {
      const parsed = new URL(candidate);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        showAlert('Invalid URL', 'The URL must start with http:// or https://');
        return;
      }
    } catch {
      showAlert('Invalid URL', 'Please enter a well-formed website URL.');
      return;
    }

    setIsSaving(true);
    try {
      await setTamilMVBaseUrl(candidate);
      setActiveUrl(candidate);
      showAlert('Success', 'Connection URL updated successfully.');
      await runPing(candidate);
    } catch (e: any) {
      showAlert('Error', `Failed to save URL: ${e?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    await triggerHaptic();
    await resetTamilMVBaseUrl();
    setActiveUrl(DEFAULT_TAMILMV_BASE_URL);
    setUrlInput(DEFAULT_TAMILMV_BASE_URL);
    showAlert('Reset', `Reset connection URL to default:\n${DEFAULT_TAMILMV_BASE_URL}`);
    await runPing(DEFAULT_TAMILMV_BASE_URL);
  };

  const handleSelectPreset = async (preset: string) => {
    await triggerHaptic();
    setUrlInput(preset);
    setActiveUrl(preset);
    // Always persist to AsyncStorage automatically
    try {
      await setTamilMVBaseUrl(preset);
    } catch {}
    await runPing(preset);
  };

  const handleCopyUrl = async () => {
    await triggerHaptic();
    await Clipboard.setStringAsync(activeUrl);
    showAlert('Copied', 'Domain URL copied to clipboard.');
  };

  const getStatusBadge = () => {
    if (isPinging) {
      return (
        <View style={[styles.badge, styles.badgeChecking]}>
          <ActivityIndicator size="small" color="#ffd60a" style={{ marginRight: 6 }} />
          <Text style={[styles.badgeText, { color: '#ffd60a' }]}>Checking...</Text>
        </View>
      );
    }

    if (!pingResult) {
      return (
        <View style={[styles.badge, styles.badgeUnknown]}>
          <Ionicons name="help-circle-outline" size={15} color="#8E8E93" style={{ marginRight: 5 }} />
          <Text style={[styles.badgeText, { color: '#8E8E93' }]}>Not Tested</Text>
        </View>
      );
    }

    if (pingResult.success && pingResult.rssWorking) {
      return (
        <View style={[styles.badge, styles.badgeSuccess]}>
          <Ionicons name="checkmark-circle" size={15} color="#30d158" style={{ marginRight: 5 }} />
          <Text style={[styles.badgeText, { color: '#30d158' }]}>Online ({pingResult.latencyMs}ms)</Text>
        </View>
      );
    }

    if (pingResult.success && !pingResult.rssWorking) {
      return (
        <View style={[styles.badge, styles.badgeWarning]}>
          <Ionicons name="alert-circle" size={15} color="#ffd60a" style={{ marginRight: 5 }} />
          <Text style={[styles.badgeText, { color: '#ffd60a' }]}>Reachable • RSS Issue</Text>
        </View>
      );
    }

    return (
      <View style={[styles.badge, styles.badgeError]}>
        <Ionicons name="close-circle" size={15} color="#ff453a" style={{ marginRight: 5 }} />
        <Text style={[styles.badgeText, { color: '#ff453a' }]}>Offline / Blocked</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container as any}>
      <StatusBar />
      <BlurGradientBackground />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Top Header Navigation */}
        <View style={styles.navBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Connection</Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Title Section */}
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: theme.iconBg }]}>
              <Ionicons name="globe-outline" size={28} color={theme.primary} />
            </View>
            <Text style={styles.title}>Connection</Text>
            <Text style={styles.subtitle}>
              Configure your streaming mirror, test live ping latency, and auto-detect working domains.
            </Text>
          </View>

          {/* 1. Connection Status Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.headerTitleWrap}>
                <Ionicons name="pulse" size={15} color={theme.primary} style={{ marginRight: 6 }} />
                <Text style={styles.cardSectionTitle}>LIVE STATUS</Text>
              </View>
              {getStatusBadge()}
            </View>

            <View style={styles.pingDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Active Domain</Text>
                <TouchableOpacity
                  style={styles.activeDomainRow}
                  onPress={handleCopyUrl}
                  activeOpacity={0.7}
                >
                  <Text style={styles.detailValue} numberOfLines={1}>
                    {lastPingedUrl || activeUrl}
                  </Text>
                  <Ionicons name="copy-outline" size={14} color="#8E8E93" style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              </View>

              <View style={styles.detailDivider} />

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Latency</Text>
                <Text
                  style={[
                    styles.detailValue,
                    {
                      color:
                        pingResult && pingResult.latencyMs > 0
                          ? pingResult.latencyMs < 500
                            ? '#30d158'
                            : pingResult.latencyMs < 1500
                            ? '#ffd60a'
                            : '#ff453a'
                          : '#8E8E93',
                    },
                  ]}
                >
                  {pingResult && pingResult.latencyMs > 0 ? `${pingResult.latencyMs} ms` : 'N/A'}
                </Text>
              </View>

              <View style={styles.detailDivider} />

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>HTTP Status</Text>
                <Text style={styles.detailValue}>
                  {pingResult?.httpStatus !== undefined ? pingResult.httpStatus : '—'}
                </Text>
              </View>

              <View style={styles.detailDivider} />

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Catalog Feed</Text>
                <Text
                  style={[
                    styles.detailValue,
                    { color: pingResult?.rssWorking ? '#30d158' : pingResult ? '#ff9f0a' : '#8E8E93' },
                  ]}
                >
                  {pingResult?.rssWorking ? 'Active & Healthy' : pingResult ? 'Feed Issue' : '—'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.pingButton, isPinging && styles.buttonDisabled]}
              onPress={handleTestPing}
              disabled={isPinging}
              activeOpacity={0.7}
            >
              {isPinging ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="refresh-outline" size={17} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.pingButtonText}>Test Latency & Diagnostics</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* 2. Auto-Detect Domain Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.headerTitleWrap}>
                <Ionicons name="sparkles" size={15} color={theme.primary} style={{ marginRight: 6 }} />
                <Text style={styles.cardSectionTitle}>AUTO-DETECT MIRROR</Text>
              </View>
              <View
                style={[
                  styles.autoDetectBadge,
                  { backgroundColor: theme.primary + '18', borderColor: theme.primary + '40' },
                ]}
              >
                <Text style={[styles.autoDetectBadgeText, { color: theme.primaryLight || theme.primary }]}>
                  Smart Resolver
                </Text>
              </View>
            </View>

            <Text style={styles.cardDescription}>
              If your current domain gets blocked by your ISP, tap below. The app will search online in the background, identify the active live mirror, verify its connectivity, and automatically configure it.
            </Text>

            {isAutoDetecting && (
              <View style={styles.detectingProgressBox}>
                <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 10 }} />
                <Text style={styles.detectingProgressText} numberOfLines={2}>
                  {detectProgressText || 'Detecting working domain...'}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.autoDetectPrimaryBtn,
                { backgroundColor: theme.primary },
                (isAutoDetecting || isPinging) && styles.buttonDisabled,
              ]}
              onPress={handleAutoDetectDomain}
              disabled={isAutoDetecting || isPinging}
              activeOpacity={0.8}
            >
              {isAutoDetecting ? (
                <>
                  <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.autoDetectPrimaryBtnText}>Detecting Working Domain...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="search" size={17} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.autoDetectPrimaryBtnText}>Auto-Detect Working Domain</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* 3. Domain Configuration Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.headerTitleWrap}>
                <Ionicons name="link" size={15} color={theme.primary} style={{ marginRight: 6 }} />
                <Text style={styles.cardSectionTitle}>CUSTOM DOMAIN CONFIGURATION</Text>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Domain URL</Text>
              <View style={styles.textInputWrapper}>
                <Ionicons name="globe-outline" size={18} color="#8E8E93" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.textInput}
                  value={urlInput}
                  onChangeText={setUrlInput}
                  placeholder="https://www.1tamilmv.solar"
                  placeholderTextColor="#666666"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                {urlInput.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setUrlInput('')}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle" size={18} color="#666666" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Presets */}
            <View style={styles.presetsContainer}>
              <Text style={styles.presetsLabel}>Known Mirror Presets (Tap to switch & apply)</Text>
              <View style={styles.presetsList}>
                {PRESET_DOMAINS.map((domain) => {
                  const isSelected = activeUrl.trim().replace(/\/+$/, '') === domain;
                  return (
                    <TouchableOpacity
                      key={domain}
                      style={[
                        styles.presetPill,
                        isSelected && [
                          styles.presetPillActive,
                          { backgroundColor: theme.primary + '22', borderColor: theme.primary },
                        ],
                      ]}
                      onPress={() => handleSelectPreset(domain)}
                      activeOpacity={0.7}
                    >
                      {isSelected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={14}
                          color={theme.primary}
                          style={{ marginRight: 5 }}
                        />
                      )}
                      <Text style={[styles.presetPillText, isSelected && { color: '#ffffff', fontWeight: '700' }]}>
                        {domain.replace('https://', '')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionsContainer}>
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  { backgroundColor: theme.primary },
                  isSaving && styles.buttonDisabled,
                ]}
                onPress={handleSave}
                disabled={isSaving}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.saveButtonText}>Save & Apply</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.resetButton}
                onPress={handleReset}
                activeOpacity={0.7}
              >
                <MaterialIcons name="restore" size={18} color="#ff453a" style={{ marginRight: 6 }} />
                <Text style={styles.resetButtonText}>Reset to Default</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 4. New Movie Push Notifications Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.headerTitleWrap}>
                <Ionicons name="notifications" size={15} color={theme.primary} style={{ marginRight: 6 }} />
                <Text style={styles.cardSectionTitle}>NEW MOVIE PUSH NOTIFICATIONS</Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: notificationsEnabled ? 'rgba(48, 209, 88, 0.15)' : 'rgba(255, 69, 58, 0.15)',
                    borderColor: notificationsEnabled ? 'rgba(48, 209, 88, 0.3)' : 'rgba(255, 69, 58, 0.3)',
                  },
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: notificationsEnabled ? '#30d158' : '#ff453a' },
                  ]}
                />
                <Text
                  style={[
                    styles.statusText,
                    { color: notificationsEnabled ? '#30d158' : '#ff453a' },
                  ]}
                >
                  {notificationsEnabled ? 'Active' : 'Off'}
                </Text>
              </View>
            </View>

            {/* Toggle row */}
            <View style={styles.notifToggleRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.notifToggleTitle}>Push Alerts for New Releases</Text>
                <Text style={styles.notifToggleDesc}>
                  {notificationsEnabled
                    ? 'Periodically scans TamilMV and sends instant alerts when fresh movies or series are added'
                    : 'Turn on to receive instant push alerts when new movies are uploaded'}
                </Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={handleToggleNotifications}
                trackColor={{ false: '#3A3A3C', true: theme.primary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#3A3A3C"
              />
            </View>

            {notificationsEnabled && (
              <>
                <View style={styles.detailDivider} />

                {/* Permission status row */}
                <View style={styles.notifPermissionRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <Ionicons
                      name={hasNotificationPermission ? 'checkmark-circle' : 'warning-outline'}
                      size={16}
                      color={hasNotificationPermission ? '#30d158' : '#ff9500'}
                    />
                    <Text style={styles.notifPermissionText}>
                      {hasNotificationPermission
                        ? 'Device Permission: Granted'
                        : 'Device Permission: Action Required'}
                    </Text>
                  </View>
                  {!hasNotificationPermission && (
                    <TouchableOpacity
                      style={[styles.grantBtn, { backgroundColor: theme.primary }]}
                      onPress={async () => {
                        const granted = await tamilMVNotificationService.requestPermissions();
                        setHasNotificationPermission(granted);
                        if (granted) {
                          showAlert('Permission Granted!', 'You will now receive new movie alerts.');
                        } else {
                          Alert.alert(
                            'Permission Required',
                            'Notification permission is disabled on your device. Would you like to open Settings to enable it?',
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Open Settings', onPress: () => Linking.openSettings() }
                            ]
                          );
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.grantBtnText}>Grant</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Language filters */}
                <Text style={styles.notifSectionTitle}>Alert Languages</Text>
                <View style={styles.notifLangsContainer}>
                  {[
                    { id: 'tamil' as Language, label: 'Tamil' },
                    { id: 'telugu' as Language, label: 'Telugu' },
                    { id: 'hindi' as Language, label: 'Hindi' },
                    { id: 'malayalam' as Language, label: 'Malayalam' },
                    { id: 'kannada' as Language, label: 'Kannada' },
                    { id: 'english' as Language, label: 'English' },
                  ].map((lang) => {
                    const isSelected = selectedLanguages.includes(lang.id);
                    return (
                      <TouchableOpacity
                        key={lang.id}
                        style={[
                          styles.notifLangChip,
                          isSelected && {
                            backgroundColor: theme.primary + '20',
                            borderColor: theme.primary,
                          },
                        ]}
                        onPress={() => handleToggleLanguage(lang.id)}
                        activeOpacity={0.7}
                      >
                        {isSelected && (
                          <Ionicons
                            name="checkmark"
                            size={14}
                            color={theme.primary}
                            style={{ marginRight: 4 }}
                          />
                        )}
                        <Text
                          style={[
                            styles.notifLangChipText,
                            isSelected && { color: theme.primary, fontWeight: '700' },
                          ]}
                        >
                          {lang.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Action buttons */}
                <View style={styles.notifButtonsRow}>
                  <TouchableOpacity
                    style={styles.notifActionBtn}
                    onPress={handleSendTestNotification}
                    disabled={isSendingTest}
                    activeOpacity={0.7}
                  >
                    {isSendingTest ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="paper-plane-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                        <Text style={styles.notifActionBtnText}>Send Test</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.notifActionBtn,
                      { backgroundColor: theme.primary + '18', borderColor: theme.primary + '44' },
                    ]}
                    onPress={handleCheckNow}
                    disabled={isCheckingNewMovies}
                    activeOpacity={0.7}
                  >
                    {isCheckingNewMovies ? (
                      <ActivityIndicator size="small" color={theme.primary} />
                    ) : (
                      <>
                        <Ionicons name="refresh-outline" size={16} color={theme.primary} style={{ marginRight: 6 }} />
                        <Text style={[styles.notifActionBtnText, { color: theme.primary }]}>Check Now</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {checkStatusText ? (
                  <Text style={styles.checkStatusMessage}>{checkStatusText}</Text>
                ) : null}
              </>
            )}
          </View>

          <BottomSpacing space={60} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
    maxWidth: 780,
    width: '100%',
    marginHorizontal: 'auto',
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
    paddingTop: 4,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#121212',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    marginBottom: 16,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardDescription: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
    marginBottom: 14,
  },
  autoDetectBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  autoDetectBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  autoDetectPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
  },
  autoDetectPrimaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  detectingProgressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  detectingProgressText: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '500',
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeSuccess: {
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
    borderColor: 'rgba(48, 209, 88, 0.3)',
  },
  badgeWarning: {
    backgroundColor: 'rgba(255, 214, 10, 0.12)',
    borderColor: 'rgba(255, 214, 10, 0.3)',
  },
  badgeError: {
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    borderColor: 'rgba(255, 69, 58, 0.3)',
  },
  badgeChecking: {
    backgroundColor: 'rgba(255, 214, 10, 0.1)',
    borderColor: 'rgba(255, 214, 10, 0.25)',
  },
  badgeUnknown: {
    backgroundColor: 'rgba(142, 142, 147, 0.12)',
    borderColor: 'rgba(142, 142, 147, 0.25)',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pingDetails: {
    backgroundColor: '#171717',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  detailDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  detailLabel: {
    fontSize: 13,
    color: '#8E8E93',
  },
  activeDomainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '65%',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  pingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 12,
    borderRadius: 12,
  },
  pingButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  inputContainer: {
    marginTop: 4,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  textInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: '#ffffff',
    padding: 0,
  },
  presetsContainer: {
    marginBottom: 16,
  },
  presetsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 10,
  },
  presetsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  presetPillActive: {
    borderWidth: 1,
  },
  presetPillText: {
    fontSize: 12,
    color: '#999999',
    fontWeight: '500',
  },
  actionsContainer: {
    gap: 10,
    marginTop: 4,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 10,
    borderRadius: 12,
  },
  resetButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ff453a',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  notifToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  notifToggleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  notifToggleDesc: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
    lineHeight: 16,
  },
  notifPermissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  notifPermissionText: {
    fontSize: 12,
    color: '#E5E5EA',
    fontWeight: '500',
  },
  grantBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  grantBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000000',
  },
  notifSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
  },
  notifLangsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  notifLangChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  notifLangChipText: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  },
  notifButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  notifActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: '#1a1a1a',
  },
  notifActionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  checkStatusMessage: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
});

export default TamilMvSettingsScreen;
