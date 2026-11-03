import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import { useTheme } from '@/hooks/useTheme';
import {
  youTubeService,
  YouTubeAuthStatus,
  YouTubeAuthStartResponse,
} from '@/services/YouTubeService';

interface YouTubeAuthModalProps {
  visible: boolean;
  onClose: () => void;
  authStatus: YouTubeAuthStatus;
  onAuthChange: (status: YouTubeAuthStatus) => void;
  onSelectFeed?: (feed: 'Home' | 'Subscriptions' | 'History') => void;
}

const { width } = Dimensions.get('window');

export const YouTubeAuthModal: React.FC<YouTubeAuthModalProps> = ({
  visible,
  onClose,
  authStatus,
  onAuthChange,
  onSelectFeed,
}) => {
  const { theme } = useTheme();
  const [isStarting, setIsStarting] = useState(false);
  const [deviceCodeData, setDeviceCodeData] = useState<{
    user_code: string;
    verification_url: string;
    expires_in: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync with incoming pending auth if available
  useEffect(() => {
    if (authStatus.pending) {
      setDeviceCodeData(authStatus.pending);
      startPolling();
    }
  }, [authStatus.pending]);

  // Clean up timer on close or unmount
  useEffect(() => {
    if (!visible) {
      stopPolling();
      setCopied(false);
    }
  }, [visible]);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setIsPolling(false);
  };

  const startPolling = () => {
    stopPolling();
    setIsPolling(true);

    pollTimerRef.current = setInterval(async () => {
      try {
        const status = await youTubeService.getAuthStatus(2000);
        if (status.authenticated) {
          stopPolling();
          if (await isHapticsSupported()) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          onAuthChange(status);
        } else if (status.pending) {
          setDeviceCodeData(status.pending);
        }
      } catch {}
    }, 2500);
  };

  const handleStartSignIn = async () => {
    setIsStarting(true);
    setCopied(false);

    try {
      const res: YouTubeAuthStartResponse = await youTubeService.startAuth(12000);

      if (res.status === 'authenticated') {
        const status = await youTubeService.getAuthStatus();
        onAuthChange(status);
        setIsStarting(false);
        return;
      }

      if (res.user_code && res.verification_url) {
        setDeviceCodeData({
          user_code: res.user_code,
          verification_url: res.verification_url,
          expires_in: res.expires_in || 1800,
        });
        startPolling();
      } else {
        // Fallback: poll getAuthStatus for up to 5 seconds to catch delayed code
        let codeFound = false;
        for (let i = 0; i < 5; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          const st = await youTubeService.getAuthStatus(2000);
          if (st.pending?.user_code) {
            setDeviceCodeData(st.pending);
            startPolling();
            codeFound = true;
            break;
          } else if (st.authenticated) {
            onAuthChange(st);
            codeFound = true;
            break;
          }
        }

        if (!codeFound) {
          Alert.alert(
            'Google Sign-In',
            res.error || 'Could not retrieve authorization code from Google. Please verify that the YouTube streaming engine is running and try again.'
          );
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to start Google sign-in.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleCopyCode = async () => {
    if (!deviceCodeData?.user_code) return;
    await Clipboard.setStringAsync(deviceCodeData.user_code);
    setCopied(true);
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setTimeout(() => setCopied(false), 3000);
  };

  const handleOpenGoogle = async () => {
    if (!deviceCodeData?.verification_url) return;
    // Auto-copy the code for the user before opening browser
    if (deviceCodeData.user_code) {
      await Clipboard.setStringAsync(deviceCodeData.user_code);
      setCopied(true);
    }
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    Linking.openURL(deviceCodeData.verification_url);
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out of your YouTube account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setIsLoggingOut(true);
          try {
            await youTubeService.logout();
            onAuthChange({ authenticated: false, user: null, pending: null });
            setDeviceCodeData(null);
            stopPolling();
            if (await isHapticsSupported()) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          } catch (e: any) {
            Alert.alert('Logout Error', e?.message || 'Failed to sign out.');
          } finally {
            setIsLoggingOut(false);
          }
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderLeft}>
              <View style={[styles.headerIconCircle, { backgroundColor: theme.primary + '20' }]}>
                <Ionicons name="logo-youtube" size={18} color="#FF0000" />
              </View>
              <Text style={styles.modalTitle}>
                {authStatus.authenticated ? 'YouTube Account' : 'Google Sign-In'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={20} color="#8E8E93" />
            </TouchableOpacity>
          </View>

          {/* ── Authenticated State ── */}
          {authStatus.authenticated ? (
            <View style={styles.authenticatedBody}>
              {/* Profile Card */}
              <View style={styles.profileCard}>
                {authStatus.user?.avatar ? (
                  <Image source={{ uri: authStatus.user.avatar }} style={styles.avatarImg} />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: theme.primary }]}>
                    <Text style={styles.avatarFallbackText}>
                      {(authStatus.user?.name || 'U').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}

                <View style={styles.profileInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.profileName} numberOfLines={1}>
                      {authStatus.user?.name || 'YouTube User'}
                    </Text>
                    <View style={styles.activePill}>
                      <View style={styles.activePillDot} />
                      <Text style={styles.activePillText}>Connected</Text>
                    </View>
                  </View>
                  {authStatus.user?.email ? (
                    <Text style={styles.profileEmail} numberOfLines={1}>
                      {authStatus.user.email}
                    </Text>
                  ) : (
                    <Text style={styles.profileSubtitle}>Real YouTube Account Active</Text>
                  )}
                </View>
              </View>

              {/* Feed Shortcuts */}
              <Text style={styles.sectionHeading}>PERSONALIZED CONTENT</Text>
              <View style={styles.shortcutsGroup}>
                <TouchableOpacity
                  style={styles.shortcutRow}
                  onPress={() => {
                    onClose();
                    onSelectFeed?.('Home');
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.shortcutIconBox, { backgroundColor: theme.primary + '18' }]}>
                    <Ionicons name="sparkles" size={16} color={theme.primary} />
                  </View>
                  <View style={styles.shortcutTextBox}>
                    <Text style={styles.shortcutTitle}>Personalized Feed</Text>
                    <Text style={styles.shortcutDesc}>Your algorithmic YouTube recommendations</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#6E6E73" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.shortcutRow}
                  onPress={() => {
                    onClose();
                    onSelectFeed?.('Subscriptions');
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.shortcutIconBox, { backgroundColor: theme.primary + '18' }]}>
                    <Ionicons name="albums-outline" size={16} color={theme.primary} />
                  </View>
                  <View style={styles.shortcutTextBox}>
                    <Text style={styles.shortcutTitle}>Subscriptions</Text>
                    <Text style={styles.shortcutDesc}>Latest videos from your subscribed channels</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#6E6E73" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.shortcutRow, { borderBottomWidth: 0 }]}
                  onPress={() => {
                    onClose();
                    onSelectFeed?.('History');
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.shortcutIconBox, { backgroundColor: theme.primary + '18' }]}>
                    <Ionicons name="time-outline" size={16} color={theme.primary} />
                  </View>
                  <View style={styles.shortcutTextBox}>
                    <Text style={styles.shortcutTitle}>Watch History</Text>
                    <Text style={styles.shortcutDesc}>Your real YouTube watched videos</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#6E6E73" />
                </TouchableOpacity>
              </View>

              {/* Sign Out Button */}
              <TouchableOpacity
                style={styles.logoutBtn}
                onPress={handleLogout}
                disabled={isLoggingOut}
                activeOpacity={0.8}
              >
                {isLoggingOut ? (
                  <ActivityIndicator size="small" color="#FF453A" />
                ) : (
                  <>
                    <Ionicons name="log-out-outline" size={18} color="#FF453A" style={{ marginRight: 8 }} />
                    <Text style={styles.logoutBtnText}>Sign Out of YouTube</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : deviceCodeData ? (
            /* ── Pending Device Code State ── */
            <View style={styles.pendingBody}>
              <Text style={styles.instructionHeading}>Authorize on Google Device</Text>
              <Text style={styles.instructionSubtext}>
                Copy the code below, open the Google verification page, and authorize your YouTube account.
              </Text>

              {/* Code Box */}
              <View style={[styles.codeContainer, { borderColor: theme.primary + '66' }]}>
                <Text style={styles.codeLabel}>YOUR DEVICE CODE</Text>
                <Text style={styles.codeText} selectable>
                  {deviceCodeData.user_code}
                </Text>

                <TouchableOpacity
                  style={[styles.copyBtn, copied && { backgroundColor: '#00E676' }]}
                  onPress={handleCopyCode}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={copied ? 'checkmark' : 'copy-outline'}
                    size={14}
                    color="#FFFFFF"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.copyBtnText}>{copied ? 'Copied' : 'Copy Code'}</Text>
                </TouchableOpacity>
              </View>

              {/* Primary Action: Open google.com/device */}
              <TouchableOpacity
                style={[styles.primaryActionBtn, { backgroundColor: theme.primary }]}
                onPress={handleOpenGoogle}
                activeOpacity={0.8}
              >
                <Ionicons name="open-outline" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.primaryActionBtnText}>Open google.com/device</Text>
              </TouchableOpacity>

              {/* Polling Indicator */}
              <View style={styles.pollingRow}>
                <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 8 }} />
                <Text style={styles.pollingText}>Waiting for approval on Google...</Text>
              </View>

              {/* Cancel / Retry Button */}
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  stopPolling();
                  setDeviceCodeData(null);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>Cancel / Generate New Code</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ── Initial Sign-In State ── */
            <View style={styles.initialBody}>
              <View style={[styles.featureIllustration, { backgroundColor: theme.primary + '14' }]}>
                <Ionicons name="shield-checkmark" size={38} color={theme.primary} />
              </View>

              <Text style={styles.initialTitle}>Real YouTube with Your Account</Text>
              <Text style={styles.initialDesc}>
                Sign in with your Google account using Google's official Device Authorization flow.
              </Text>

              <View style={styles.benefitsList}>
                <View style={styles.benefitItem}>
                  <Ionicons name="sparkles" size={16} color={theme.primary} style={styles.benefitIcon} />
                  <Text style={styles.benefitText}>Personalized Home Recommendations</Text>
                </View>
                <View style={styles.benefitItem}>
                  <Ionicons name="albums-outline" size={16} color={theme.primary} style={styles.benefitIcon} />
                  <Text style={styles.benefitText}>Real Channel Subscriptions Feed</Text>
                </View>
                <View style={styles.benefitItem}>
                  <Ionicons name="time-outline" size={16} color={theme.primary} style={styles.benefitIcon} />
                  <Text style={styles.benefitText}>Synced Watch History & Liked Videos</Text>
                </View>
                <View style={styles.benefitItem}>
                  <Ionicons name="download-outline" size={16} color={theme.primary} style={styles.benefitIcon} />
                  <Text style={styles.benefitText}>Ad-Free Streaming, MP3 & MP4 Downloads</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.signInBtn, { backgroundColor: theme.primary }]}
                onPress={handleStartSignIn}
                disabled={isStarting}
                activeOpacity={0.8}
              >
                {isStarting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={18} color="#FFFFFF" style={{ marginRight: 10 }} />
                    <Text style={styles.signInBtnText}>Sign In with Google</Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={styles.privacyNote}>
                🔒 Safe & Private. Your password is never entered in this app. Authentication happens entirely on google.com.
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#161618',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    width: Math.min(width - 32, 440),
    padding: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Initial state styles
  initialBody: {
    alignItems: 'center',
  },
  featureIllustration: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  initialTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 6,
  },
  initialDesc: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  benefitsList: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
    gap: 10,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  benefitIcon: {
    marginRight: 10,
    width: 18,
  },
  benefitText: {
    fontSize: 13,
    color: '#E5E5EA',
    fontWeight: '500',
    flex: 1,
  },
  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 13,
    borderRadius: 12,
    marginBottom: 12,
  },
  signInBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  privacyNote: {
    fontSize: 11,
    color: '#6E6E73',
    textAlign: 'center',
    lineHeight: 15,
    paddingHorizontal: 8,
  },
  // Pending state styles
  pendingBody: {
    alignItems: 'center',
  },
  instructionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    textAlign: 'center',
  },
  instructionSubtext: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 16,
  },
  codeContainer: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  codeText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 12,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  copyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 13,
    borderRadius: 12,
    marginBottom: 12,
  },
  primaryActionBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pollingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  pollingText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  cancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  cancelBtnText: {
    fontSize: 12,
    color: '#6E6E73',
  },
  // Authenticated state styles
  authenticatedBody: {
    width: '100%',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    padding: 14,
    borderRadius: 14,
    marginBottom: 18,
  },
  avatarImg: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginRight: 12,
  },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarFallbackText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  profileName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
    marginRight: 6,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  activePillDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#00E676',
    marginRight: 4,
  },
  activePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#00E676',
  },
  profileEmail: {
    fontSize: 12,
    color: '#8E8E93',
  },
  profileSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  shortcutsGroup: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 18,
  },
  shortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  shortcutIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  shortcutTextBox: {
    flex: 1,
  },
  shortcutTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  shortcutDesc: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.3)',
  },
  logoutBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF453A',
  },
});
