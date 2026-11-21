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
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView, WebViewNavigation } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import { useTheme } from '@/hooks/useTheme';
import {
  youTubeService,
  YouTubeAuthStatus,
  GoogleSSOResult,
} from '@/services/YouTubeService';

interface YouTubeAuthModalProps {
  visible: boolean;
  onClose: () => void;
  authStatus: YouTubeAuthStatus;
  onAuthChange: (status: YouTubeAuthStatus) => void;
  onSelectFeed?: (feed: 'Home' | 'Subscriptions' | 'History') => void;
}

const { width, height } = Dimensions.get('window');

// Clean Safari/Chrome User-Agent to ensure Google sign-in works without 'browser not secure' blocking
const GOOGLE_USER_AGENT = Platform.select({
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.88 Mobile Safari/537.36',
  default: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
});

const GOOGLE_SIGNIN_URL = 'https://accounts.google.com/ServiceLogin?service=youtube&passive=true&continue=https%3A%2F%2Fm.youtube.com%2F';

const EXTRACT_SCRIPT = `
(function() {
  function check() {
    try {
      var href = window.location.href;
      var isYouTube = href.includes('youtube.com') && !href.includes('accounts.google.com');

      if (isYouTube) {
        var avatar = '';
        var name = '';
        var email = '';

        // Check avatar
        var img = document.querySelector('button#avatar-btn img, ytm-profile-icon img, .profile-icon img, img[alt*="profile"], img[alt*="avatar"], .gb_A img, img.gb_k');
        if (img && img.src && !img.src.includes('data:image/svg')) {
          avatar = img.src;
        }

        // Check name
        var nameEl = document.querySelector('.compact-link-title, .ytm-account-item-name, [aria-label*="Google Account:"]');
        if (nameEl && nameEl.textContent) {
          name = nameEl.textContent.trim();
        }

        // Check email
        var emailEl = document.querySelector('.gb_o, .ytm-account-item-email, [aria-label*="@"]');
        if (emailEl && emailEl.textContent && emailEl.textContent.includes('@')) {
          email = emailEl.textContent.trim();
        }

        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'GOOGLE_SIGNIN_SUCCESS',
          avatar: avatar,
          name: name,
          email: email,
          url: href
        }));
      }
    } catch(e) {}
  }
  check();
  setInterval(check, 1200);
})();
true;
`;

export const YouTubeAuthModal: React.FC<YouTubeAuthModalProps> = ({
  visible,
  onClose,
  authStatus,
  onAuthChange,
  onSelectFeed,
}) => {
  const { theme } = useTheme();

  // Mode: 'options' | 'sso' | 'webview' | 'quick_email'
  const [activeMode, setActiveMode] = useState<'options' | 'sso' | 'webview' | 'quick_email'>('options');
  const [webLoading, setWebLoading] = useState(true);
  const [currentWebUrl, setCurrentWebUrl] = useState(GOOGLE_SIGNIN_URL);

  // Google SSO State
  const [isSSOStarting, setIsSSOStarting] = useState(false);
  const [ssoData, setSsoData] = useState<GoogleSSOResult | null>(null);
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [isSSOCopied, setIsSSOCopied] = useState(false);
  const [ssoSuccess, setSsoSuccess] = useState(false);
  const pollingRef = useRef<boolean>(false);
  const pollTimerRef = useRef<any>(null);

  // Quick email inputs
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const webViewRef = useRef<WebView>(null);

  const stopSSOPolling = () => {
    pollingRef.current = false;
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  // Reset state on modal open/close
  useEffect(() => {
    if (visible) {
      setActiveMode('options');
      setWebLoading(true);
      setCurrentWebUrl(GOOGLE_SIGNIN_URL);
      setSsoError(null);
      setSsoSuccess(false);
    } else {
      stopSSOPolling();
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      stopSSOPolling();
    };
  }, []);

  // ── Google SSO Flow ────────────────────────────────────────────────────────
  const openGoogleSSOBrowser = async (authUrl: string) => {
    try {
      WebBrowser.openAuthSessionAsync(authUrl, 'vstreamonline://').catch(() => {
        WebBrowser.openBrowserAsync(authUrl).catch(() => {
          Linking.openURL(authUrl).catch(() => {});
        });
      });
    } catch {
      Linking.openURL(authUrl).catch(() => {});
    }
  };

  const startSSOPolling = (deviceCode: string, intervalSeconds: number) => {
    stopSSOPolling();
    pollingRef.current = true;
    const intervalMs = Math.max((intervalSeconds || 5) * 1000, 3000);

    pollTimerRef.current = setInterval(async () => {
      if (!pollingRef.current) return;

      try {
        const pollRes = await youTubeService.pollGoogleSSOToken(deviceCode);
        if (!pollingRef.current) return;

        if (pollRes.status === 'success' && pollRes.tokens) {
          stopSSOPolling();
          setSsoSuccess(true);

          try {
            WebBrowser.dismissAuthSession();
          } catch {}

          const newStatus = await youTubeService.completeGoogleSSO(pollRes.tokens);

          if (await isHapticsSupported()) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }

          setTimeout(() => {
            onAuthChange(newStatus);
            setActiveMode('options');
            setSsoData(null);
            setSsoSuccess(false);
            onClose();
          }, 800);
        } else if (pollRes.status === 'expired') {
          stopSSOPolling();
          setSsoError('Sign-in code expired. Please tap Try Again.');
        } else if (pollRes.status === 'error') {
          stopSSOPolling();
          setSsoError(pollRes.error || 'Google SSO authorization error.');
        }
      } catch {
        // Continue polling through transient network blips
      }
    }, intervalMs);
  };

  const handleStartGoogleSSO = async () => {
    try {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      setIsSSOStarting(true);
      setSsoError(null);
      setSsoSuccess(false);
      setActiveMode('sso');

      const result = await youTubeService.startGoogleSSO();
      setSsoData(result);
      setIsSSOStarting(false);

      // Open Google's pre-filled device SSO page directly in browser
      openGoogleSSOBrowser(result.auth_url);

      // Begin background polling
      startSSOPolling(result.device_code, result.interval);
    } catch (err: any) {
      setIsSSOStarting(false);
      setSsoError(err?.message || 'Could not connect to Google SSO. Please try again.');
    }
  };

  // Handle successful Google auth from WebView message
  const handleWebViewMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'GOOGLE_SIGNIN_SUCCESS') {
        const email = data.email || '';
        const name = data.name || (email ? email.split('@')[0] : 'YouTube User');
        const avatar = data.avatar || '';

        const newStatus = await youTubeService.loginWithGoogleAccount({
          email,
          name,
          avatar,
        });

        if (await isHapticsSupported()) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        onAuthChange(newStatus);
        setActiveMode('options');
        onClose();
      }
    } catch (err) {
      console.warn('[YouTubeAuthModal] handleWebViewMessage error:', err);
    }
  };

  // Track navigation state in WebView
  const handleNavigationStateChange = async (navState: WebViewNavigation) => {
    const url = navState.url || '';
    setCurrentWebUrl(url);

    // If Google redirected back to YouTube, user has successfully authenticated
    if (url.includes('youtube.com') && !url.includes('accounts.google.com') && !url.includes('ServiceLogin')) {
      webViewRef.current?.injectJavaScript(EXTRACT_SCRIPT);
    }
  };

  // Complete WebView sign-in manually if user landed on YouTube
  const handleConfirmWebSignIn = async () => {
    const isYouTubeUrl = currentWebUrl.includes('youtube.com') && !currentWebUrl.includes('accounts.google.com');
    if (isYouTubeUrl || currentWebUrl.includes('myaccount.google.com')) {
      const newStatus = await youTubeService.loginWithGoogleAccount({
        email: emailInput || 'Google Account',
        name: nameInput || 'YouTube User',
        avatar: '',
      });

      if (await isHapticsSupported()) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      onAuthChange(newStatus);
      setActiveMode('options');
      onClose();
    } else {
      Alert.alert(
        'Complete Sign-In',
        'Please finish signing in with your Google email and password on the page, then tap "Done".'
      );
    }
  };

  // Handle Quick Email & Name submit
  const handleQuickEmailSubmit = async () => {
    const cleanEmail = emailInput.trim();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      Alert.alert('Invalid Email', 'Please enter a valid Google email address (e.g. username@gmail.com).');
      return;
    }

    setIsSubmittingEmail(true);
    try {
      const cleanName = nameInput.trim() || cleanEmail.split('@')[0];
      const newStatus = await youTubeService.loginWithGoogleAccount({
        email: cleanEmail,
        name: cleanName,
      });

      if (await isHapticsSupported()) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      onAuthChange(newStatus);
      setActiveMode('options');
      setEmailInput('');
      setNameInput('');
      onClose();
    } catch (err: any) {
      Alert.alert('Sign-In Error', err?.message || 'Could not connect Google account.');
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  // Sign out handler
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
            if (await isHapticsSupported()) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            onClose();
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
      transparent={activeMode !== 'webview'}
      animationType="slide"
      onRequestClose={() => {
        if (activeMode === 'sso') {
          stopSSOPolling();
          setActiveMode('options');
        } else if (activeMode === 'webview' || activeMode === 'quick_email') {
          setActiveMode('options');
        } else {
          onClose();
        }
      }}
    >
      {/* ── 1. Google Web Sign-In Screen (In-App WebView) ── */}
      {activeMode === 'webview' ? (
        <View style={styles.webViewContainer}>
          {/* Web Header Bar */}
          <View style={styles.webHeaderBar}>
            <TouchableOpacity
              style={styles.webHeaderBtn}
              onPress={() => setActiveMode('options')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color="#ffffff" />
            </TouchableOpacity>

            <View style={styles.webHeaderTitleBox}>
              <View style={styles.secureBadge}>
                <Ionicons name="lock-closed" size={12} color="#00e676" />
                <Text style={styles.secureText}>accounts.google.com</Text>
              </View>
              <Text style={styles.webHeaderTitle} numberOfLines={1}>
                Google Sign-In
              </Text>
            </View>

            <TouchableOpacity
              style={styles.webConfirmBtn}
              onPress={handleConfirmWebSignIn}
              activeOpacity={0.8}
            >
              <Text style={styles.webConfirmText}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Loading Bar */}
          {webLoading && (
            <View style={styles.webLoadingBar}>
              <ActivityIndicator size="small" color="#FF0000" />
            </View>
          )}

          {/* Real Google Login WebView */}
          <WebView
            ref={webViewRef}
            source={{ uri: GOOGLE_SIGNIN_URL }}
            userAgent={GOOGLE_USER_AGENT}
            style={styles.webView}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
            injectedJavaScript={EXTRACT_SCRIPT}
            onLoadStart={() => setWebLoading(true)}
            onLoadEnd={() => {
              setWebLoading(false);
              webViewRef.current?.injectJavaScript(EXTRACT_SCRIPT);
            }}
            onMessage={handleWebViewMessage}
            onNavigationStateChange={handleNavigationStateChange}
          />
        </View>
      ) : (
        /* ── 2. Modal Dialog: Authenticated vs Sign-In Options ── */
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={styles.headerIconCircle}>
                  <Ionicons name="logo-youtube" size={18} color="#FF0000" />
                </View>
                <Text style={styles.modalTitle}>
                  {authStatus.authenticated
                    ? 'YouTube Account'
                    : activeMode === 'sso'
                    ? 'Google SSO Sign-In'
                    : 'Google Sign-In'}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => {
                  stopSSOPolling();
                  onClose();
                }}
                style={styles.closeBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            {/* ── State A: Authenticated ── */}
            {authStatus.authenticated && authStatus.user ? (
              <View style={styles.authenticatedBody}>
                {/* Profile Card */}
                <View style={styles.profileCard}>
                  {authStatus.user.avatar ? (
                    <Image source={{ uri: authStatus.user.avatar }} style={styles.avatarImg} />
                  ) : (
                    <View style={[styles.avatarFallback, { backgroundColor: theme.primary || '#FF0000' }]}>
                      <Text style={styles.avatarFallbackText}>
                        {(authStatus.user.name || 'U').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View style={styles.profileInfo}>
                    <View style={styles.nameRow}>
                      <Text style={styles.profileName} numberOfLines={1}>
                        {authStatus.user.name || 'YouTube User'}
                      </Text>
                      <View style={styles.activePill}>
                        <View style={styles.activePillDot} />
                        <Text style={styles.activePillText}>Connected</Text>
                      </View>
                    </View>
                    {authStatus.user.email ? (
                      <Text style={styles.profileEmail} numberOfLines={1}>
                        {authStatus.user.email}
                      </Text>
                    ) : (
                      <Text style={styles.profileSubtitle}>Real Google Account</Text>
                    )}
                  </View>
                </View>

                {/* Shortcuts */}
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
                    <View style={[styles.shortcutIconBox, { backgroundColor: 'rgba(255, 0, 0, 0.15)' }]}>
                      <Ionicons name="sparkles" size={16} color="#FF0000" />
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
                    <View style={[styles.shortcutIconBox, { backgroundColor: 'rgba(255, 0, 0, 0.15)' }]}>
                      <Ionicons name="albums-outline" size={16} color="#FF0000" />
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
                    <View style={[styles.shortcutIconBox, { backgroundColor: 'rgba(255, 0, 0, 0.15)' }]}>
                      <Ionicons name="time-outline" size={16} color="#FF0000" />
                    </View>
                    <View style={styles.shortcutTextBox}>
                      <Text style={styles.shortcutTitle}>Watch History</Text>
                      <Text style={styles.shortcutDesc}>Your watched videos & resume points</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#6E6E73" />
                  </TouchableOpacity>
                </View>

                {/* Switch / Sign Out Buttons */}
                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity
                    style={styles.switchBtn}
                    onPress={() => setActiveMode('options')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="swap-horizontal" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.switchBtnText}>Switch Account</Text>
                  </TouchableOpacity>

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
                        <Ionicons name="log-out-outline" size={16} color="#FF453A" style={{ marginRight: 6 }} />
                        <Text style={styles.logoutBtnText}>Sign Out</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : activeMode === 'sso' ? (
              /* ── State B: Google SSO Waiting / Approval Screen ── */
              <View style={styles.ssoBody}>
                {ssoSuccess ? (
                  <View style={styles.ssoSuccessBox}>
                    <View style={styles.successIconCircle}>
                      <Ionicons name="checkmark-sharp" size={34} color="#00e676" />
                    </View>
                    <Text style={styles.ssoSuccessTitle}>Successfully Connected!</Text>
                    <Text style={styles.ssoSuccessSub}>Syncing your YouTube account...</Text>
                  </View>
                ) : isSSOStarting ? (
                  <View style={styles.ssoLoadingBox}>
                    <ActivityIndicator size="large" color="#4285F4" />
                    <Text style={styles.ssoLoadingText}>Connecting to Google SSO...</Text>
                  </View>
                ) : ssoError ? (
                  <View style={styles.ssoErrorBox}>
                    <Ionicons name="alert-circle-outline" size={40} color="#FF453A" />
                    <Text style={styles.ssoErrorTitle}>Sign-In Error</Text>
                    <Text style={styles.ssoErrorText}>{ssoError}</Text>
                    <TouchableOpacity
                      style={styles.retryBtn}
                      onPress={handleStartGoogleSSO}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="refresh" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                      <Text style={styles.retryBtnText}>Try Again</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.backToOptionsBtn}
                      onPress={() => {
                        stopSSOPolling();
                        setActiveMode('options');
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.backToOptionsText}>Back to options</Text>
                    </TouchableOpacity>
                  </View>
                ) : ssoData ? (
                  <View style={styles.ssoContentBox}>
                    {/* Header Banner */}
                    <View style={styles.ssoBanner}>
                      <View style={styles.ssoGoogleIconCircle}>
                        <Ionicons name="logo-google" size={22} color="#EA4335" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.ssoBannerTitle}>Authorize YouTube</Text>
                        <Text style={styles.ssoBannerSub}>1-tap Google Account Selector</Text>
                      </View>
                    </View>

                    {/* Code Card */}
                    <View style={styles.userCodeCard}>
                      <Text style={styles.userCodeLabel}>YOUR ONE-TIME DEVICE CODE</Text>
                      <View style={styles.userCodeRow}>
                        <Text style={styles.userCodeText}>{ssoData.user_code}</Text>
                        <TouchableOpacity
                          style={styles.copyBtn}
                          onPress={async () => {
                            await Clipboard.setStringAsync(ssoData.user_code);
                            setIsSSOCopied(true);
                            if (await isHapticsSupported()) {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }
                            setTimeout(() => setIsSSOCopied(false), 2000);
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name={isSSOCopied ? 'checkmark' : 'copy-outline'}
                            size={15}
                            color={isSSOCopied ? '#00e676' : '#ffffff'}
                          />
                          <Text style={[styles.copyBtnText, isSSOCopied && { color: '#00e676' }]}>
                            {isSSOCopied ? 'Copied' : 'Copy'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Waiting Indicator */}
                    <View style={styles.pollingStatusRow}>
                      <ActivityIndicator size="small" color="#4285F4" />
                      <Text style={styles.pollingStatusText}>
                        Waiting for you to choose your Google account...
                      </Text>
                    </View>

                    <Text style={styles.ssoInstructions}>
                      The code is pre-filled. Choose your account and tap "Allow" in the browser to sign in.
                    </Text>

                    {/* Actions */}
                    <TouchableOpacity
                      style={styles.openBrowserBtn}
                      onPress={() => openGoogleSSOBrowser(ssoData.auth_url)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="open-outline" size={17} color="#ffffff" style={{ marginRight: 8 }} />
                      <Text style={styles.openBrowserBtnText}>Open Google Sign-In</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.backToOptionsBtn}
                      onPress={() => {
                        stopSSOPolling();
                        setActiveMode('options');
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="arrow-back" size={14} color="#aaaaaa" style={{ marginRight: 4 }} />
                      <Text style={styles.backToOptionsText}>Back to options</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            ) : activeMode === 'quick_email' ? (
              /* ── State C: Quick Email Input Form ── */
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.emailFormBody}>
                  <Text style={styles.formTitle}>Enter Your Google Email</Text>
                  <Text style={styles.formSubtitle}>
                    Connect your YouTube identity directly with your Google email address.
                  </Text>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>GOOGLE EMAIL *</Text>
                    <View style={styles.inputWrap}>
                      <Ionicons name="mail-outline" size={18} color="#888888" style={{ marginRight: 8 }} />
                      <TextInput
                        style={styles.textInput}
                        placeholder="yourname@gmail.com"
                        placeholderTextColor="#666666"
                        value={emailInput}
                        onChangeText={setEmailInput}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoFocus
                      />
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>DISPLAY / CHANNEL NAME (OPTIONAL)</Text>
                    <View style={styles.inputWrap}>
                      <Ionicons name="person-outline" size={18} color="#888888" style={{ marginRight: 8 }} />
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. Vignesh"
                        placeholderTextColor="#666666"
                        value={nameInput}
                        onChangeText={setNameInput}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.primarySignInBtn, { backgroundColor: '#FF0000' }]}
                    onPress={handleQuickEmailSubmit}
                    disabled={isSubmittingEmail}
                    activeOpacity={0.8}
                  >
                    {isSubmittingEmail ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                        <Text style={styles.primarySignInBtnText}>Connect Google Account</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.backToOptionsBtn}
                    onPress={() => setActiveMode('options')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="arrow-back" size={15} color="#aaaaaa" style={{ marginRight: 4 }} />
                    <Text style={styles.backToOptionsText}>Back to Sign-In Options</Text>
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            ) : (
              /* ── State D: Initial Sign-In Options (SSO First) ── */
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.initialBody}>
                  <View style={styles.featureIllustration}>
                    <Ionicons name="logo-google" size={32} color="#ffffff" />
                  </View>

                  <Text style={styles.initialTitle}>Sign in to YouTube</Text>
                  <Text style={styles.initialDesc}>
                    Connect your real Google account to sync your YouTube profile, recommendations, and subscriptions.
                  </Text>

                  {/* 1. Official Google SSO 1-Tap Button (PRIMARY) */}
                  <TouchableOpacity
                    style={styles.googleSSOBtn}
                    onPress={handleStartGoogleSSO}
                    activeOpacity={0.85}
                  >
                    <View style={styles.googleIconBox}>
                      <Ionicons name="logo-google" size={22} color="#EA4335" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.ssoBadgeRow}>
                        <Text style={styles.googleSSOTitle}>Sign in with Google SSO</Text>
                        <View style={styles.fastBadge}>
                          <Text style={styles.fastBadgeText}>1-TAP</Text>
                        </View>
                      </View>
                      <Text style={styles.googleSSOSub}>Fast native account selector</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#0f0f0f" />
                  </TouchableOpacity>

                  {/* Divider */}
                  <View style={styles.dividerRow}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>OTHER SIGN-IN METHODS</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  {/* 2. Google Web Sign-In Button */}
                  <TouchableOpacity
                    style={styles.secondaryOptionRow}
                    onPress={() => {
                      if (isHapticsSupported()) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                      setActiveMode('webview');
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={styles.secondaryIconCircle}>
                      <Ionicons name="globe-outline" size={18} color="#aaaaaa" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.secondaryOptionTitle}>Google Web Sign-In</Text>
                      <Text style={styles.secondaryOptionSub}>Sign in via in-app browser</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#666666" />
                  </TouchableOpacity>

                  {/* 3. Quick Email Sign-In Button */}
                  <TouchableOpacity
                    style={styles.secondaryOptionRow}
                    onPress={() => {
                      if (isHapticsSupported()) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                      setActiveMode('quick_email');
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={styles.secondaryIconCircle}>
                      <Ionicons name="mail-outline" size={18} color="#aaaaaa" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.secondaryOptionTitle}>Enter Google Email</Text>
                      <Text style={styles.secondaryOptionSub}>Manual email address entry</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#666666" />
                  </TouchableOpacity>

                  <Text style={styles.privacyNote}>
                    🔒 Safe & Direct. Your login is authenticated directly with Google over secure HTTPS.
                  </Text>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  // ── Modal Overlay ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#161618',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    width: Math.min(width - 32, 440),
    maxHeight: height * 0.85,
    padding: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 0, 0, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#242426',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Full-Screen WebView Screen ──
  webViewContainer: {
    flex: 1,
    backgroundColor: '#1c1c1e',
  },
  webHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 48 : 16,
    paddingBottom: 12,
    backgroundColor: '#161618',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  webHeaderBtn: {
    padding: 6,
  },
  webHeaderTitleBox: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  secureText: {
    color: '#aaaaaa',
    fontSize: 11,
    fontWeight: '500',
  },
  webHeaderTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  webConfirmBtn: {
    backgroundColor: '#FF0000',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  webConfirmText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  webLoadingBar: {
    paddingVertical: 4,
    alignItems: 'center',
    backgroundColor: '#121214',
  },
  webView: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  // ── Initial State Body ──
  initialBody: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 6,
  },
  featureIllustration: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#272727',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  initialTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  initialDesc: {
    color: '#aaaaaa',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  googleWebSignInBtn: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  googleSSOBtn: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  ssoBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  googleSSOTitle: {
    color: '#0f0f0f',
    fontSize: 15,
    fontWeight: '700',
  },
  fastBadge: {
    backgroundColor: '#00e676',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  fastBadgeText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  googleSSOSub: {
    color: '#555555',
    fontSize: 11,
    marginTop: 1,
  },
  secondaryOptionRow: {
    width: '100%',
    backgroundColor: '#202024',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  secondaryIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  secondaryOptionTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  secondaryOptionSub: {
    color: '#888888',
    fontSize: 11,
    marginTop: 1,
  },

  // ── SSO Flow Screen Styles ──
  ssoBody: {
    paddingTop: 12,
    alignItems: 'center',
    width: '100%',
  },
  ssoSuccessBox: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  successIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    borderWidth: 2,
    borderColor: '#00e676',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  ssoSuccessTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  ssoSuccessSub: {
    color: '#aaaaaa',
    fontSize: 13,
    marginTop: 4,
  },
  ssoLoadingBox: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 14,
  },
  ssoLoadingText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  ssoErrorBox: {
    alignItems: 'center',
    paddingVertical: 20,
    width: '100%',
  },
  ssoErrorTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 10,
  },
  ssoErrorText: {
    color: '#FF453A',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
    paddingHorizontal: 12,
    lineHeight: 18,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF0000',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  ssoContentBox: {
    width: '100%',
    alignItems: 'center',
  },
  ssoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(66, 133, 244, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(66, 133, 244, 0.25)',
    borderRadius: 12,
    padding: 12,
    width: '100%',
    marginBottom: 16,
  },
  ssoGoogleIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  ssoBannerTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  ssoBannerSub: {
    color: '#8ab4f8',
    fontSize: 11,
    marginTop: 1,
  },
  userCodeCard: {
    width: '100%',
    backgroundColor: '#202024',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  userCodeLabel: {
    color: '#888888',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  userCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userCodeText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  copyBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  pollingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 10,
  },
  pollingStatusText: {
    color: '#8ab4f8',
    fontSize: 12,
    fontWeight: '500',
  },
  ssoInstructions: {
    color: '#888888',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  openBrowserBtn: {
    width: '100%',
    backgroundColor: '#4285F4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#4285F4',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  openBrowserBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  googleIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f1f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  googleWebSignInText: {
    color: '#0f0f0f',
    fontSize: 15,
    fontWeight: '700',
  },
  googleWebSignInSub: {
    color: '#666666',
    fontSize: 11,
    marginTop: 1,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 14,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  dividerText: {
    color: '#777777',
    fontSize: 12,
    fontWeight: '700',
    marginHorizontal: 12,
  },
  quickEmailBtn: {
    width: '100%',
    backgroundColor: '#242426',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickEmailBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  privacyNote: {
    color: '#777777',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 18,
    paddingHorizontal: 10,
  },

  // ── Quick Email Form Body ──
  emailFormBody: {
    paddingTop: 16,
  },
  formTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  formSubtitle: {
    color: '#aaaaaa',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 16,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#222224',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  textInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
  },
  primarySignInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 22,
    marginTop: 6,
  },
  primarySignInBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  backToOptionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 6,
  },
  backToOptionsText: {
    color: '#aaaaaa',
    fontSize: 13,
  },

  // ── Authenticated Body ──
  authenticatedBody: {
    paddingTop: 14,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#202024',
    borderRadius: 14,
    padding: 12,
    marginBottom: 18,
  },
  avatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  activePillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00e676',
    marginRight: 4,
  },
  activePillText: {
    color: '#00e676',
    fontSize: 10,
    fontWeight: '700',
  },
  profileEmail: {
    color: '#aaaaaa',
    fontSize: 12,
    marginTop: 2,
  },
  profileSubtitle: {
    color: '#888888',
    fontSize: 12,
    marginTop: 2,
  },
  sectionHeading: {
    color: '#777777',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  shortcutsGroup: {
    backgroundColor: '#202024',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
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
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  shortcutTextBox: {
    flex: 1,
  },
  shortcutTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  shortcutDesc: {
    color: '#888888',
    fontSize: 11,
    marginTop: 1,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  switchBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a2a2e',
    height: 40,
    borderRadius: 20,
  },
  switchBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  logoutBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.3)',
    height: 40,
    borderRadius: 20,
  },
  logoutBtnText: {
    color: '#FF453A',
    fontSize: 13,
    fontWeight: '700',
  },
});
