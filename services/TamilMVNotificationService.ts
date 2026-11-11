import { Platform, AppState, AppStateStatus } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { StorageKeys, storageService } from '@/utils/StorageService';
import {
  fetchTamilMVRecentlyAdded,
  GroupedItem,
  Language,
} from '@/hooks/useTamilMv';

let _notificationsCache: any = undefined;
function getNotifications(): any {
  if (_notificationsCache !== undefined) {
    return _notificationsCache;
  }
  if (Platform.OS === 'web') {
    _notificationsCache = null;
    return null;
  }
  try {
    // Check if any native notification module is available before requiring.
    // On iOS, local notification modules are ExpoNotificationScheduler, ExpoNotificationPresenter,
    // ExpoNotificationsHandlerModule, and ExpoNotificationPermissionsModule.
    // On Android, ExpoPushTokenManager or ExpoNotificationScheduler are used.
    let nativeAvailable = false;
    try {
      nativeAvailable = !!(
        requireOptionalNativeModule('ExpoNotificationScheduler') ||
        requireOptionalNativeModule('ExpoNotificationPresenter') ||
        requireOptionalNativeModule('ExpoNotificationsHandlerModule') ||
        requireOptionalNativeModule('ExpoNotificationPermissionsModule') ||
        requireOptionalNativeModule('ExpoPushTokenManager')
      );
    } catch {
      nativeAvailable = false;
    }

    if (!nativeAvailable) {
      // In certain bundle environments, requireOptionalNativeModule can return null
      // even when the modules are statically linked. Fallback to a safe direct require.
      try {
        const directMod = require('expo-notifications');
        if (directMod && typeof directMod.scheduleNotificationAsync === 'function') {
          _notificationsCache = directMod;
          return _notificationsCache;
        }
      } catch {
        // Native module truly missing
      }
      _notificationsCache = null;
      return null;
    }

    _notificationsCache = require('expo-notifications');
  } catch (err: any) {
    console.log(
      '[TamilMVNotificationService] Could not load expo-notifications:',
      err?.message || String(err)
    );
    _notificationsCache = null;
  }
  return _notificationsCache;
}

// Global eager registration of foreground notification presentation handler.
// Apple requires setNotificationHandler to be configured to show banners while app is foregrounded.
try {
  const earlyNotif = getNotifications();
  if (earlyNotif && typeof earlyNotif.setNotificationHandler === 'function') {
    earlyNotif.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        priority: earlyNotif.AndroidNotificationPriority?.HIGH,
      }),
    });
  }
} catch {
  // Safe evaluation
}

// Base notification channel and polling constants
const NOTIFICATION_CHANNEL_ID = 'tamilmv-new-movies';
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // Check every 15 minutes
const MAX_STORED_SEEN_IDS = 300;
const MAX_NOTIFICATIONS_PER_BATCH = 3; // Prevent spamming if many movies added at once

const ALL_LANGUAGES: Language[] = ['tamil', 'telugu', 'hindi', 'malayalam', 'kannada', 'english'];

class TamilMVNotificationService {
  private isInitialized = false;
  private intervalTimer: any = null;
  private appStateSubscription: any = null;
  private notificationResponseSubscription: any = null;

  /**
   * Returns whether the native notification module is available in this binary.
   */
  isSupported(): boolean {
    return Platform.OS !== 'web' && !!getNotifications();
  }

  /**
   * Evaluates permission result across Android & iOS.
   */
  private isAuthGranted(res: any): boolean {
    if (!res) return false;
    if (res.granted === true || res.status === 'granted') {
      return true;
    }
    // iOS specific authorization checks
    if (Platform.OS === 'ios' && res.ios) {
      const iosStatus = res.ios.status;
      // UNAuthorizationStatus: 2 = authorized, 3 = provisional, 4 = ephemeral
      if (iosStatus === 2 || iosStatus === 3 || iosStatus === 4) {
        return true;
      }
      if (
        res.ios.allowsAlert ||
        res.ios.allowsBadge ||
        res.ios.allowsSound ||
        res.ios.allowsDisplayInNotificationCenter ||
        res.ios.allowsDisplayOnLockScreen
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Initializes notification channels, permissions, and background lifecycle listeners.
   */
  async initialize(): Promise<void> {
    const Notifications = getNotifications();
    if (!Notifications) {
      console.log('[TamilMVNotificationService] Native expo-notifications module not present in current binary; alerts inactive.');
      return;
    }

    // 0. Configure foreground notification handler safely (always re-assert)
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          priority: Notifications.AndroidNotificationPriority?.HIGH,
        }),
      });
    } catch (e: any) {
      console.warn('[TamilMVNotificationService] Could not set foreground notification handler:', e?.message || e);
    }

    if (this.isInitialized) return;
    this.isInitialized = true;

    // 1. Setup Android high-priority notification channel
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
          name: 'TamilMV New Movies',
          description: 'Notifies when new movies or series are uploaded on TamilMV',
          importance: Notifications.AndroidImportance?.HIGH ?? 4,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FFB800',
          sound: 'default',
          enableVibrate: true,
          showBadge: true,
        });
      } catch (err: any) {
        console.warn('[TamilMVNotificationService] Failed to set Android notification channel:', err?.message || err);
      }
    }

    // 2. Start periodic background polling & app resume triggers
    this.startLifecycleChecker();

    // 3. Initial check shortly after app boot (delayed 5s to not block initial render)
    setTimeout(() => {
      this.checkForNewMovies(false).catch((err: any) => {
        console.warn('[TamilMVNotificationService] Initial movie check error:', err?.message || err);
      });
    }, 5000);
  }

  /**
   * Checks current permission status without prompting.
   */
  async checkPermissions(): Promise<boolean> {
    const Notifications = getNotifications();
    if (!Notifications) return false;
    try {
      const settings = await Notifications.getPermissionsAsync();
      return this.isAuthGranted(settings);
    } catch {
      return false;
    }
  }

  /**
   * Requests push notification permissions from the user.
   */
  async requestPermissions(): Promise<boolean> {
    const Notifications = getNotifications();
    if (!Notifications) return false;
    try {
      await this.initialize();
      const res = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowDisplayInCarPlay: false,
          allowCriticalAlerts: false,
          provideAppNotificationSettings: false,
          allowProvisional: false,
        },
        android: {},
      });
      return this.isAuthGranted(res);
    } catch (err: any) {
      console.warn('[TamilMVNotificationService] Failed to request notification permissions:', err?.message || err);
      return false;
    }
  }

  /**
   * Checks whether new movie notifications are enabled in settings (defaults to true).
   */
  isNotificationsEnabled(): boolean {
    try {
      const val = storageService.getItem(StorageKeys.TAMILMV_NOTIFICATIONS_ENABLED_KEY);
      if (val === undefined || val === null) {
        return true; // Default enabled
      }
      return val === 'true';
    } catch {
      return true;
    }
  }

  /**
   * Toggles new movie notifications on or off.
   */
  setNotificationsEnabled(enabled: boolean): void {
    try {
      storageService.setItem(StorageKeys.TAMILMV_NOTIFICATIONS_ENABLED_KEY, String(enabled));
    } catch (err) {
      console.warn('[TamilMVNotificationService] Failed to save notifications enabled flag:', err);
    }
  }

  /**
   * Gets preferred languages for notifications (defaults to all languages).
   */
  getSelectedLanguages(): Language[] {
    try {
      const raw = storageService.getItem(StorageKeys.TAMILMV_NOTIFICATION_LANGUAGES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return ALL_LANGUAGES;
  }

  /**
   * Saves preferred languages for notifications.
   */
  setSelectedLanguages(languages: Language[]): void {
    try {
      storageService.setItem(
        StorageKeys.TAMILMV_NOTIFICATION_LANGUAGES_KEY,
        JSON.stringify(languages)
      );
    } catch (err) {
      console.warn('[TamilMVNotificationService] Failed to save notification languages:', err);
    }
  }

  /**
   * Gets the timestamp of the last successful check.
   */
  getLastCheckTime(): number {
    try {
      const val = storageService.getItem(StorageKeys.TAMILMV_LAST_NOTIFICATION_CHECK_KEY);
      return val ? parseInt(val, 10) || 0 : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Returns the list of previously notified/seen movie identifiers.
   */
  private getSeenMovieIds(): Set<string> {
    try {
      const raw = storageService.getItem(StorageKeys.TAMILMV_SEEN_MOVIE_IDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch {}
    return new Set<string>();
  }

  /**
   * Saves the list of seen movie identifiers, capped at MAX_STORED_SEEN_IDS.
   */
  private saveSeenMovieIds(seenSet: Set<string>): void {
    try {
      const arr = Array.from(seenSet).slice(-MAX_STORED_SEEN_IDS);
      storageService.setItem(StorageKeys.TAMILMV_SEEN_MOVIE_IDS_KEY, JSON.stringify(arr));
    } catch (err) {
      console.warn('[TamilMVNotificationService] Failed to save seen movie IDs:', err);
    }
  }

  /**
   * Creates a normalized unique identifier for a movie group.
   */
  private getMovieKey(group: GroupedItem): string {
    const namePart = (group.name || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    const yearPart = group.year || '';
    const firstGuid = group.items?.[0]?.guid || '';
    return `${namePart}_${yearPart}_${firstGuid}`;
  }

  /**
   * Core checker: fetches latest movies from TamilMV and triggers push notifications
   * for any newly detected releases.
   */
  async checkForNewMovies(force: boolean = false): Promise<{ newCount: number; movies: string[] }> {
    if (!force && !this.isNotificationsEnabled()) {
      return { newCount: 0, movies: [] };
    }

    try {
      // 1. Fetch recently uploaded movies from TamilMV
      const recentGroups = await fetchTamilMVRecentlyAdded(true);
      if (!recentGroups || recentGroups.length === 0) {
        return { newCount: 0, movies: [] };
      }

      const seenSet = this.getSeenMovieIds();
      const isFirstRun = seenSet.size === 0;

      // Filter by user's chosen languages
      const preferredLangs = new Set<string>(this.getSelectedLanguages());
      const filteredGroups = recentGroups.filter((g) => {
        if (!g.name) return false;
        const itemLang = (g.items?.[0]?.language || '').toLowerCase().trim();
        if (!itemLang) return true; // Include if language not explicitly parsed
        return preferredLangs.has(itemLang);
      });

      // On very first run, populate seen list with existing movies so we don't spam notifications
      if (isFirstRun) {
        for (const g of recentGroups) {
          seenSet.add(this.getMovieKey(g));
        }
        this.saveSeenMovieIds(seenSet);
        storageService.setItem(
          StorageKeys.TAMILMV_LAST_NOTIFICATION_CHECK_KEY,
          String(Date.now())
        );
        return { newCount: 0, movies: [] };
      }

      // Find brand-new movies that haven't been seen yet
      const brandNewGroups: GroupedItem[] = [];
      for (const g of filteredGroups) {
        const key = this.getMovieKey(g);
        if (!seenSet.has(key)) {
          brandNewGroups.push(g);
          seenSet.add(key);
        }
      }

      // Record check timestamp
      storageService.setItem(
        StorageKeys.TAMILMV_LAST_NOTIFICATION_CHECK_KEY,
        String(Date.now())
      );
      this.saveSeenMovieIds(seenSet);

      if (brandNewGroups.length === 0) {
        return { newCount: 0, movies: [] };
      }

      // Has permissions?
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) {
        console.log('[TamilMVNotificationService] New movies found, but notifications permission is not granted.');
        const foundNames = brandNewGroups
          .map((g) => g.name)
          .filter((n): n is string => Boolean(n));
        return { newCount: brandNewGroups.length, movies: foundNames };
      }

      // Send local push notification for new movies (up to MAX_NOTIFICATIONS_PER_BATCH)
      const toNotify = brandNewGroups.slice(0, MAX_NOTIFICATIONS_PER_BATCH);
      const notifiedNames: string[] = [];
      const Notifications = getNotifications();

      if (Notifications) {
        for (const group of toNotify) {
          const primaryItem = group.items?.find((i) => i.magnetUrl) || group.items?.[0];
          const movieName = group.name || 'New Movie';
          const yearStr = group.year ? ` (${group.year})` : '';
          const langStr = primaryItem?.language ? ` [${primaryItem.language.toUpperCase()}]` : '';

          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: `🎬 New on TamilMV: ${movieName}${yearStr}`,
                body: `${movieName}${yearStr}${langStr} is now available! Tap to stream or download.`,
                sound: 'default',
                data: {
                  type: 'tamilmv_new_movie',
                  pathname: '/torrent/details',
                  guid: primaryItem?.guid || '',
                  groupid: primaryItem?.groupid || '',
                  title: primaryItem?.title || movieName,
                  magnetUrl: primaryItem?.magnetUrl || '',
                  infoHash: primaryItem?.infoHash || '',
                  poster: primaryItem?.poster || '',
                  publishDate: primaryItem?.publishDate || '',
                  allItems: JSON.stringify(group.items || []),
                },
                badge: 1,
              },
              trigger: Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNEL_ID } : null,
            });
            notifiedNames.push(movieName);
          } catch (notifErr: any) {
            console.warn('[TamilMVNotificationService] Could not schedule notification:', notifErr?.message || notifErr);
          }
        }
      }

      console.log(`[TamilMVNotificationService] ✅ Dispatched notifications for: ${notifiedNames.join(', ')}`);
      return { newCount: brandNewGroups.length, movies: notifiedNames };
    } catch (err: any) {
      console.warn('[TamilMVNotificationService] Failed to check for new movies:', err?.message || err);
      return { newCount: 0, movies: [] };
    }
  }

  /**
   * Sends an immediate test notification to verify push notifications and sound/banner.
   */
  async sendTestNotification(): Promise<boolean> {
    const Notifications = getNotifications();
    if (!Notifications) {
      console.warn('[TamilMVNotificationService] Cannot send test notification: native module not linked.');
      return false;
    }

    await this.initialize();

    // Re-assert foreground notification presentation handler before sending test notification
    // to guarantee iOS displays the banner drop-down while the app is in the foreground
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          priority: Notifications.AndroidNotificationPriority?.HIGH,
        }),
      });
    } catch {}

    let hasPermission = await this.checkPermissions();
    if (!hasPermission) {
      hasPermission = await this.requestPermissions();
      if (!hasPermission) return false;
    }

    try {
      const trigger = Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNEL_ID } : null;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🎬 TamilMV Movie Alerts Active',
          body: 'Push notifications are enabled! You will be alerted instantly when new movies or series are uploaded.',
          sound: 'default',
          data: {
            type: 'tamilmv_test_notification',
            timestamp: Date.now(),
          },
          badge: 1,
        },
        trigger,
      });
      return true;
    } catch (err: any) {
      console.warn('[TamilMVNotificationService] Failed to send test notification:', err?.message || err);
      return false;
    }
  }

  /**
   * Sets up a listener for notification taps/clicks to navigate to the movie details screen.
   */
  setupResponseListener(router: any): () => void {
    if (this.notificationResponseSubscription) {
      this.notificationResponseSubscription.remove();
      this.notificationResponseSubscription = null;
    }

    const Notifications = getNotifications();
    if (!Notifications || typeof Notifications.addNotificationResponseReceivedListener !== 'function') {
      return () => {};
    }

    try {
      this.notificationResponseSubscription = Notifications.addNotificationResponseReceivedListener(
        (response: any) => {
          try {
            const data = response?.notification?.request?.content?.data;
            if (data && data.type === 'tamilmv_new_movie' && data.guid) {
              console.log('[TamilMVNotificationService] Notification tapped, opening movie:', data.title);
              router.push({
                pathname: '/torrent/details',
                params: {
                  guid: data.guid,
                  groupid: data.groupid,
                  title: data.title,
                  magnetUrl: data.magnetUrl,
                  infoHash: data.infoHash,
                  poster: data.poster,
                  publishDate: data.publishDate,
                  allItems: data.allItems,
                },
              });
            }
          } catch (err: any) {
            console.warn('[TamilMVNotificationService] Error handling notification tap:', err?.message || err);
          }
        }
      );
    } catch (e: any) {
      console.warn('[TamilMVNotificationService] Could not add notification response listener:', e?.message || e);
      return () => {};
    }

    return () => {
      if (this.notificationResponseSubscription) {
        this.notificationResponseSubscription.remove();
        this.notificationResponseSubscription = null;
      }
    };
  }

  /**
   * Sets up background AppState listener and periodic interval timer.
   */
  private startLifecycleChecker(): void {
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    if (this.appStateSubscription) this.appStateSubscription.remove();

    // 1. Periodic interval while app is alive
    this.intervalTimer = setInterval(() => {
      this.checkForNewMovies(false).catch(() => {});
    }, CHECK_INTERVAL_MS);

    // 2. Resume listener when user returns to app
    let lastState = AppState.currentState;
    this.appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (
        (lastState === 'background' || lastState === 'inactive') &&
        nextState === 'active'
      ) {
        const lastCheck = this.getLastCheckTime();
        if (Date.now() - lastCheck > CHECK_INTERVAL_MS) {
          this.checkForNewMovies(false).catch(() => {});
        }
      }
      lastState = nextState;
    });
  }

  /**
   * Cleanup lifecycle listeners.
   */
  destroy(): void {
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    if (this.appStateSubscription) this.appStateSubscription.remove();
    if (this.notificationResponseSubscription) this.notificationResponseSubscription.remove();
    this.isInitialized = false;
  }
}

export const tamilMVNotificationService = new TamilMVNotificationService();
