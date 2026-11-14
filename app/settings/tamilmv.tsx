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
    setDetectProgressText('Searching live mirrors...');
    try {
      const working = await autoDetectTamilMVDomain((status) => {
        setDetectProgressText(status);
      });

      if (working) {
        setActiveUrl(working);
        setUrlInput(working);
        showAlert(
          'Mirror Connected',
          `Successfully connected to live domain:\n\n${working}`
        );
        await runPing(working);
      } else {
        showAlert(
          'Auto-Detect Failed',
          'Could not find an active domain automatically. Please select a mirror preset below or check your network.'
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
      showAlert('Success', 'Mirror domain updated.');
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
    showAlert('Reset', `Reset to default:\n${DEFAULT_TAMILMV_BASE_URL}`);
    await runPing(DEFAULT_TAMILMV_BASE_URL);
  };

  const handleSelectPreset = async (preset: string) => {
    await triggerHaptic();
    setUrlInput(preset);
    setActiveUrl(preset);
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

  const handleToggleNotifications = async (val: boolean) => {
    await triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    const rebuildCmd = Platform.OS === 'ios' ? 'npx expo run:ios' : 'npx expo run:android';
    if (val && !tamilMVNotificationService.isSupported()) {
      showAlert(
        'Notifications Unavailable',
        `Native notification modules are not included in this build. Please rebuild your native app (${rebuildCmd}) to enable movie alerts.`
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
    const rebuildCmd = Platform.OS === 'ios' ? 'npx expo run:ios' : 'npx expo run:android';
    if (!tamilMVNotificationService.isSupported()) {
      showAlert(
        'Notifications Unavailable',
        `Native notification modules are not included in this build. Please rebuild your app (${rebuildCmd}) to test notifications.`
      );
      return;
    }
    setIsSendingTest(true);
    setCheckStatusText('Dispatching test notification...');
    try {
      const success = await tamilMVNotificationService.sendTestNotification();
      if (success) {
        setHasNotificationPermission(true);
        if (await isHapticsSupported()) {
          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {}
        }
        setCheckStatusText('Test notification sent! Check your notification banner.');
        if (Platform.OS !== 'ios') {
          showAlert('Notification Sent! 🎬', 'Check your device notification banner to preview the movie alert.');
        }
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
          showAlert('Notification Error', 'Could not schedule notification. Please check your device settings.');
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
    setCheckStatusText('Checking for new releases...');
    try {
      const res = await tamilMVNotificationService.checkForNewMovies(true);
      if (res.newCount > 0) {
        setCheckStatusText(`Dispatched ${res.newCount} new alert(s)!`);
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

  const getStatusBadge = () => {
    if (isPinging) {
      return (
        <View style={[styles.badge, styles.badgeChecking]}>
          <ActivityIndicator size="small" color="#ffd60a" style={{ marginRight: 5 }} />
          <Text style={[styles.badgeText, { color: '#ffd60a' }]}>Pinging...</Text>
        </View>
      );
    }

    if (!pingResult) {
      return (
        <View style={[styles.badge, styles.badgeUnknown]}>
          <Ionicons name="help-circle-outline" size={13} color="#8E8E93" style={{ marginRight: 4 }} />
          <Text style={[styles.badgeText, { color: '#8E8E93' }]}>Untested</Text>
        </View>
      );
    }

    if (pingResult.success && pingResult.rssWorking) {
      return (
        <View style={[styles.badge, styles.badgeSuccess]}>
          <View style={[styles.statusDot, { backgroundColor: '#30d158' }]} />
          <Text style={[styles.badgeText, { color: '#30d158' }]}>Online ({pingResult.latencyMs}ms)</Text>
        </View>
      );
    }

    if (pingResult.success && !pingResult.rssWorking) {
      return (
        <View style={[styles.badge, styles.badgeWarning]}>
          <View style={[styles.statusDot, { backgroundColor: '#ffd60a' }]} />
          <Text style={[styles.badgeText, { color: '#ffd60a' }]}>Feed Issue</Text>
        </View>
      );
    }

    return (
      <View style={[styles.badge, styles.badgeError]}>
        <View style={[styles.statusDot, { backgroundColor: '#ff453a' }]} />
        <Text style={[styles.badgeText, { color: '#ff453a' }]}>Offline</Text>
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
            <Ionicons name="chevron-back" size={22} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Connection & Alerts</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Title Section */}
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: theme.iconBg }]}>
              <Ionicons name="globe-outline" size={24} color={theme.primary} />
            </View>
            <Text style={styles.title}>Connection & Movie Alerts</Text>
            <Text style={styles.subtitle}>
              Configure live mirrors, test latency diagnostics, and manage new release alerts.
            </Text>
          </View>

          {/* ── CARD 1: MIRROR & DIAGNOSTICS (CONSOLIDATED) ── */}
          <View style={styles.card}>
            {/* Header & Status Badge */}
            <View style={styles.cardHeader}>
              <View style={styles.headerTitleWrap}>
                <Ionicons name="pulse" size={15} color={theme.primary} style={{ marginRight: 6 }} />
                <Text style={styles.cardSectionTitle}>MIRROR & DIAGNOSTICS</Text>
              </View>
              {getStatusBadge()}
            </View>

            {/* Active Domain Preview with Copy Action */}
            <TouchableOpacity
              style={styles.domainPreviewBox}
              onPress={handleCopyUrl}
              activeOpacity={0.7}
            >
              <View style={styles.domainPreviewLeft}>
                <Ionicons name="link-outline" size={16} color={theme.primary} style={{ marginRight: 8 }} />
                <Text style={styles.domainPreviewText} numberOfLines={1}>
                  {lastPingedUrl || activeUrl}
                </Text>
              </View>
              <View style={styles.copyPill}>
                <Ionicons name="copy-outline" size={12} color="#8E8E93" style={{ marginRight: 4 }} />
                <Text style={styles.copyPillText}>Copy</Text>
              </View>
            </TouchableOpacity>

            {/* Diagnostics Quick Metrics Row */}
            <View style={styles.metricsRow}>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Latency</Text>
                <Text
                  style={[
                    styles.metricValue,
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
                  {pingResult && pingResult.latencyMs > 0 ? `${pingResult.latencyMs}ms` : '—'}
                </Text>
              </View>

              <View style={styles.metricDivider} />

              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>HTTP Status</Text>
                <Text style={styles.metricValue}>
                  {pingResult?.httpStatus !== undefined ? `${pingResult.httpStatus}` : '—'}
                </Text>
              </View>

              <View style={styles.metricDivider} />

              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Catalog Feed</Text>
                <Text
                  style={[
                    styles.metricValue,
                    { color: pingResult?.rssWorking ? '#30d158' : pingResult ? '#ffd60a' : '#8E8E93' },
                  ]}
                >
                  {pingResult?.rssWorking ? 'Healthy' : pingResult ? 'Issues' : '—'}
                </Text>
              </View>
            </View>

            {/* Auto-Detect Progress Banner (when active) */}
            {isAutoDetecting && (
              <View style={styles.detectProgressBanner}>
                <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 8 }} />
                <Text style={styles.detectProgressText} numberOfLines={1}>
                  {detectProgressText || 'Testing live mirrors in background...'}
                </Text>
              </View>
            )}

            {/* Consolidated Dual Actions: Test Latency & Auto-Detect Mirror */}
            <View style={styles.consolidatedActionRow}>
              <TouchableOpacity
                style={[styles.actionBtnSecondary, (isPinging || isAutoDetecting) && styles.buttonDisabled]}
                onPress={handleTestPing}
                disabled={isPinging || isAutoDetecting}
                activeOpacity={0.7}
              >
                {isPinging ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="refresh-outline" size={15} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.actionBtnSecondaryText}>Test Latency</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionBtnPrimary,
                  { backgroundColor: theme.primary },
                  (isAutoDetecting || isPinging) && styles.buttonDisabled,
                ]}
                onPress={handleAutoDetectDomain}
                disabled={isAutoDetecting || isPinging}
                activeOpacity={0.8}
              >
                {isAutoDetecting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={14} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.actionBtnPrimaryText}>Auto-Detect Mirror</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.cardDivider} />

            {/* Custom Domain Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Custom Domain URL</Text>
              <View style={styles.inputRow}>
                <View style={styles.textInputWrap}>
                  <TextInput
                    style={styles.textInput}
                    value={urlInput}
                    onChangeText={setUrlInput}
                    placeholder="https://www.1tamilmv.solar"
                    placeholderTextColor="#555555"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                  {urlInput.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setUrlInput('')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ paddingHorizontal: 4 }}
                    >
                      <Ionicons name="close-circle" size={16} color="#666666" />
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: theme.primary }, isSaving && styles.buttonDisabled]}
                  onPress={handleSave}
                  disabled={isSaving}
                  activeOpacity={0.8}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Ionicons name="checkmark" size={18} color="#ffffff" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.resetIconBtn}
                  onPress={handleReset}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="restore" size={20} color="#ff453a" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Mirror Presets (Horizontal Scrollable Chips) */}
            <View style={styles.presetsWrap}>
              <Text style={styles.presetsTitle}>KNOWN MIRROR PRESETS</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetsScroll}
              >
                {PRESET_DOMAINS.map((domain) => {
                  const isSelected = activeUrl.trim().replace(/\/+$/, '') === domain;
                  const shortName = domain.replace('https://www.', '').replace('https://', '');
                  return (
                    <TouchableOpacity
                      key={domain}
                      style={[
                        styles.presetChip,
                        isSelected && {
                          backgroundColor: theme.primary + '22',
                          borderColor: theme.primary,
                        },
                      ]}
                      onPress={() => handleSelectPreset(domain)}
                      activeOpacity={0.7}
                    >
                      {isSelected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={12}
                          color={theme.primary}
                          style={{ marginRight: 4 }}
                        />
                      )}
                      <Text
                        style={[
                          styles.presetChipText,
                          isSelected && { color: theme.primaryLight || '#ffffff', fontWeight: '700' },
                        ]}
                      >
                        {shortName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          {/* ── CARD 2: MOVIE PUSH NOTIFICATIONS ── */}
          <View style={styles.card}>
            {/* Header & Toggle Switch */}
            <View style={styles.notifHeaderRow}>
              <View style={styles.notifHeaderLeft}>
                <View style={[styles.notifIconWrap, { backgroundColor: theme.primary + '18' }]}>
                  <Ionicons name="notifications" size={18} color={theme.primary} />
                </View>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.notifTitle}>New Movie Push Alerts</Text>
                  <Text style={styles.notifSubtitle}>
                    {notificationsEnabled
                      ? 'Instant alerts when new movies or series are released'
                      : 'Enable to receive notifications for new releases'}
                  </Text>
                </View>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={handleToggleNotifications}
                trackColor={{ false: '#2C2C2E', true: theme.primary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#2C2C2E"
              />
            </View>

            {notificationsEnabled && (
              <>
                <View style={styles.cardDivider} />

                {/* Permission status pill */}
                <View style={styles.permissionPillRow}>
                  <View style={styles.permissionIndicator}>
                    <Ionicons
                      name={hasNotificationPermission ? 'checkmark-circle' : 'alert-circle'}
                      size={15}
                      color={hasNotificationPermission ? '#30d158' : '#ffd60a'}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.permissionText}>
                      {hasNotificationPermission ? 'Device Permission: Granted' : 'Permission Action Required'}
                    </Text>
                  </View>
                  {!hasNotificationPermission && (
                    <TouchableOpacity
                      style={[styles.grantPillBtn, { backgroundColor: theme.primary }]}
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
                      <Text style={styles.grantPillText}>Enable</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Language filter pills */}
                <View style={styles.langSection}>
                  <Text style={styles.presetsTitle}>ALERT LANGUAGES</Text>
                  <View style={styles.langChipsRow}>
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
                            styles.langChip,
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
                              size={12}
                              color={theme.primary}
                              style={{ marginRight: 4 }}
                            />
                          )}
                          <Text
                            style={[
                              styles.langChipText,
                              isSelected && { color: theme.primary, fontWeight: '700' },
                            ]}
                          >
                            {lang.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Dual Test & Check Now Actions */}
                <View style={styles.consolidatedActionRow}>
                  <TouchableOpacity
                    style={styles.actionBtnSecondary}
                    onPress={handleSendTestNotification}
                    disabled={isSendingTest}
                    activeOpacity={0.7}
                  >
                    {isSendingTest ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="paper-plane-outline" size={15} color="#ffffff" style={{ marginRight: 6 }} />
                        <Text style={styles.actionBtnSecondaryText}>Send Test</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtnSecondary}
                    onPress={handleCheckNow}
                    disabled={isCheckingNewMovies}
                    activeOpacity={0.7}
                  >
                    {isCheckingNewMovies ? (
                      <ActivityIndicator size="small" color={theme.primary} />
                    ) : (
                      <>
                        <Ionicons name="refresh-outline" size={15} color={theme.primary} style={{ marginRight: 6 }} />
                        <Text style={[styles.actionBtnSecondaryText, { color: theme.primary }]}>Check Now</Text>
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

          <BottomSpacing space={40} />
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 30,
    maxWidth: 720,
    width: '100%',
    marginHorizontal: 'auto',
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
    paddingTop: 2,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 17,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#121212',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
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
    fontSize: 11,
    fontWeight: '600',
  },
  domainPreviewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#181818',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  domainPreviewLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  domainPreviewText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
  },
  copyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  copyPillText: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#161616',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  metricDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  detectProgressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  detectProgressText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '500',
    flex: 1,
  },
  consolidatedActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1c1c1e',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionBtnSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionBtnPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  cardDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 12,
  },
  inputContainer: {
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    color: '#ffffff',
    padding: 0,
  },
  saveBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.25)',
  },
  presetsWrap: {
    marginTop: 4,
  },
  presetsTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  presetsScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  presetChipText: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '500',
  },
  notifHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notifHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  notifIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  notifSubtitle: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 1,
  },
  permissionPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#181818',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 10,
  },
  permissionIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  permissionText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '500',
  },
  grantPillBtn: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  grantPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
  langSection: {
    marginBottom: 10,
  },
  langChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  langChipText: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  checkStatusMessage: {
    fontSize: 11,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

export default TamilMvSettingsScreen;
