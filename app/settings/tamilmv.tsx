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
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from '@/components/Themed';
import BottomSpacing from '@/components/BottomSpacing';
import BlurGradientBackground from '@/components/BlurGradientBackground';
import { isHapticsSupported, showAlert } from '@/utils/platform';
import * as Haptics from 'expo-haptics';
import {
  DEFAULT_TAMILMV_BASE_URL,
  getTamilMVBaseUrl,
  setTamilMVBaseUrl,
  resetTamilMVBaseUrl,
  pingTamilMV,
  PingResult,
} from '@/hooks/useTamilMv';

const PRESET_DOMAINS = [
  'https://www.1tamilmv.com',
  'https://www.1tamilmv.pm',
  'https://www.1tamilmv.yt',
  'https://www.1tamilmv.tf',
  'https://www.1tamilmv.mx',
];

const TamilMvSettingsScreen: React.FC = () => {
  const [activeUrl, setActiveUrl] = useState<string>(DEFAULT_TAMILMV_BASE_URL);
  const [urlInput, setUrlInput] = useState<string>(DEFAULT_TAMILMV_BASE_URL);
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const [lastPingedUrl, setLastPingedUrl] = useState<string | null>(null);

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
    const current = getTamilMVBaseUrl();
    setActiveUrl(current);
    setUrlInput(current);
    runPing(current);
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
      setTamilMVBaseUrl(candidate);
      setActiveUrl(candidate);
      showAlert('Success', 'TamilMV base URL updated. RSS cache has been cleared.');
      await runPing(candidate);
    } catch (e: any) {
      showAlert('Error', `Failed to save URL: ${e?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    await triggerHaptic();
    resetTamilMVBaseUrl();
    setActiveUrl(DEFAULT_TAMILMV_BASE_URL);
    setUrlInput(DEFAULT_TAMILMV_BASE_URL);
    showAlert('Reset', `Reset base URL to default: ${DEFAULT_TAMILMV_BASE_URL}`);
    await runPing(DEFAULT_TAMILMV_BASE_URL);
  };

  const handleSelectPreset = async (preset: string) => {
    await triggerHaptic();
    setUrlInput(preset);
    await runPing(preset);
  };

  const getStatusBadge = () => {
    if (isPinging) {
      return (
        <View style={[styles.badge, styles.badgeChecking]}>
          <ActivityIndicator size="small" color="#ffd60a" style={{ marginRight: 6 }} />
          <Text style={[styles.badgeText, { color: '#ffd60a' }]}>Checking Ping...</Text>
        </View>
      );
    }

    if (!pingResult) {
      return (
        <View style={[styles.badge, styles.badgeUnknown]}>
          <Ionicons name="help-circle-outline" size={16} color="#8E8E93" style={{ marginRight: 6 }} />
          <Text style={[styles.badgeText, { color: '#8E8E93' }]}>Not Tested</Text>
        </View>
      );
    }

    if (pingResult.success && pingResult.rssWorking) {
      return (
        <View style={[styles.badge, styles.badgeSuccess]}>
          <Ionicons name="checkmark-circle" size={16} color="#30d158" style={{ marginRight: 6 }} />
          <Text style={[styles.badgeText, { color: '#30d158' }]}>Online ({pingResult.latencyMs}ms)</Text>
        </View>
      );
    }

    if (pingResult.success && !pingResult.rssWorking) {
      return (
        <View style={[styles.badge, styles.badgeWarning]}>
          <Ionicons name="alert-circle" size={16} color="#ffd60a" style={{ marginRight: 6 }} />
          <Text style={[styles.badgeText, { color: '#ffd60a' }]}>Reachable • RSS Issue</Text>
        </View>
      );
    }

    return (
      <View style={[styles.badge, styles.badgeError]}>
        <Ionicons name="close-circle" size={16} color="#ff453a" style={{ marginRight: 6 }} />
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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="globe-outline" size={28} color="#535aff" />
            </View>
            <Text style={styles.title}>TamilMV Source</Text>
            <Text style={styles.subtitle}>
              Configure the base URL and test live connection status & feed latency.
            </Text>
          </View>

          {/* Connection Status Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardSectionTitle}>CONNECTION STATUS</Text>
              {getStatusBadge()}
            </View>

            {pingResult && (
              <View style={styles.pingDetails}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Target URL</Text>
                  <Text style={styles.detailValue} numberOfLines={1}>
                    {lastPingedUrl || activeUrl}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Latency</Text>
                  <Text style={[
                    styles.detailValue,
                    {
                      color: pingResult.latencyMs < 500
                        ? '#30d158'
                        : pingResult.latencyMs < 1500
                        ? '#ffd60a'
                        : '#ff453a',
                    },
                  ]}>
                    {pingResult.latencyMs > 0 ? `${pingResult.latencyMs} ms` : 'N/A'}
                  </Text>
                </View>

                {pingResult.httpStatus !== undefined && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>HTTP Status</Text>
                    <Text style={styles.detailValue}>{pingResult.httpStatus}</Text>
                  </View>
                )}

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Feed Diagnostic</Text>
                  <Text style={[
                    styles.detailValue,
                    { color: pingResult.rssWorking ? '#30d158' : '#ff9f0a' },
                  ]}>
                    {pingResult.rssWorking ? 'Active & Parsing OK' : 'No Valid RSS'}
                  </Text>
                </View>

                <View style={styles.messageBox}>
                  <Ionicons
                    name={pingResult.success ? 'information-circle-outline' : 'warning-outline'}
                    size={16}
                    color={pingResult.success ? '#8E8E93' : '#ff453a'}
                    style={{ marginRight: 6, marginTop: 1 }}
                  />
                  <Text style={styles.messageText}>{pingResult.message}</Text>
                </View>
              </View>
            )}

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
                  <Ionicons name="pulse-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.pingButtonText}>Check Ping Now</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Configuration Card */}
          <View style={styles.card}>
            <Text style={styles.cardSectionTitle}>BASE URL SETTINGS</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Current Base URL</Text>
              <View style={styles.textInputWrapper}>
                <Ionicons name="link-outline" size={18} color="#8E8E93" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.textInput}
                  value={urlInput}
                  onChangeText={setUrlInput}
                  placeholder="https://www.1tamilmv.com"
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
              <Text style={styles.presetsLabel}>Known Mirror Presets</Text>
              <View style={styles.presetsList}>
                {PRESET_DOMAINS.map(domain => {
                  const isSelected = urlInput.trim().replace(/\/+$/, '') === domain;
                  return (
                    <TouchableOpacity
                      key={domain}
                      style={[styles.presetPill, isSelected && styles.presetPillActive]}
                      onPress={() => handleSelectPreset(domain)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.presetPillText, isSelected && styles.presetPillTextActive]}>
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
                style={[styles.saveButton, isSaving && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={isSaving}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
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

          {/* Info Card */}
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={20} color="#535aff" style={{ marginRight: 10 }} />
            <Text style={styles.infoText}>
              TamilMV frequently rotates domains or gets blocked by ISPs. If content fails to load on the Home screen, enter an active mirror or proxy URL above and tap "Save & Apply".
            </Text>
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    maxWidth: 780,
    width: '100%',
    marginHorizontal: 'auto',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    paddingTop: 8,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(83, 90, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(83, 90, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#121212',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#242424',
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    letterSpacing: 0.5,
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
    backgroundColor: '#181818',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#222222',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  detailLabel: {
    fontSize: 13,
    color: '#8E8E93',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#ffffff',
    maxWidth: '65%',
  },
  messageBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#101010',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  messageText: {
    fontSize: 12,
    color: '#bbbbbb',
    flex: 1,
    lineHeight: 16,
  },
  pingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: '#383838',
    paddingVertical: 12,
    borderRadius: 10,
  },
  pingButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  inputContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#ffffff',
    marginBottom: 8,
  },
  textInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2c2c2c',
    borderRadius: 10,
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
    fontWeight: '500',
    color: '#8E8E93',
    marginBottom: 8,
  },
  presetsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2c2c2c',
  },
  presetPillActive: {
    backgroundColor: 'rgba(83, 90, 255, 0.15)',
    borderColor: '#535aff',
  },
  presetPillText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  presetPillTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  actionsContainer: {
    gap: 10,
    marginTop: 4,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#535aff',
    paddingVertical: 13,
    borderRadius: 10,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 10,
    borderRadius: 10,
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ff453a',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(83, 90, 255, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(83, 90, 255, 0.18)',
    padding: 14,
  },
  infoText: {
    fontSize: 13,
    color: '#a0a0ff',
    flex: 1,
    lineHeight: 18,
  },
});

export default TamilMvSettingsScreen;
