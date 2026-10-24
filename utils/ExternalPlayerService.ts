import { Linking, Platform, ActionSheetIOS, Alert, Share } from 'react-native';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported, showAlert } from '@/utils/platform';

export interface ExternalPlayerOption {
  id: string;
  name: string;
  iconName: string;
  color: string;
  isAvailableOnPlatform: boolean;
  action: (fileUri: string, title?: string) => Promise<boolean | void>;
}

export interface PlayerModalData {
  fileUri: string;
  title: string;
  poster?: string;
  fileLength?: number;
  onPlayInternal: () => void;
}

type ModalListener = (data: PlayerModalData | null) => void;

class ExternalPlayerService {
  private modalListener: ModalListener | null = null;

  registerModalListener(listener: ModalListener) {
    this.modalListener = listener;
    return () => {
      if (this.modalListener === listener) {
        this.modalListener = null;
      }
    };
  }
  /**
   * Opens a video in VLC Media Player
   */
  async openInVLC(fileUri: string, title?: string): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        // 1. Try standard VLC scheme
        const vlcUri = `vlc://${fileUri}`;
        try {
          await Linking.openURL(vlcUri);
          return true;
        } catch {}

        // 2. Try explicit Android Intent for VLC
        const intentUri = `intent:${fileUri}#Intent;action=android.intent.action.VIEW;type=video/*;component=org.videolan.vlc/.gui.video.VideoPlayerActivity;end`;
        try {
          await Linking.openURL(intentUri);
          return true;
        } catch {}

        // 3. Try generic VLC package intent
        const pkgIntent = `intent:${fileUri}#Intent;action=android.intent.action.VIEW;type=video/*;package=org.videolan.vlc;end`;
        try {
          await Linking.openURL(pkgIntent);
          return true;
        } catch {}
      } else if (Platform.OS === 'ios') {
        // 1. Try VLC x-callback URL scheme
        const xCallbackUri = `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(fileUri)}`;
        try {
          const canOpen = await Linking.canOpenURL('vlc-x-callback://');
          if (canOpen) {
            await Linking.openURL(xCallbackUri);
            return true;
          }
        } catch {}

        // 2. Try standard VLC scheme
        const vlcUri = `vlc://${fileUri}`;
        try {
          await Linking.openURL(vlcUri);
          return true;
        } catch {}
      }

      // If VLC cannot be opened directly, use system share sheet (which displays VLC if installed)
      const shared = await this.openWithSystemChooser(fileUri, title);
      return shared;
    } catch (err: any) {
      console.warn('[ExternalPlayerService] Error opening VLC:', err);
      showAlert(
        'VLC Not Found',
        'Could not open VLC directly. Please make sure VLC is installed or choose "Open with..." to select an installed player.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open With...',
            onPress: () => this.openWithSystemChooser(fileUri, title),
          },
        ]
      );
      return false;
    }
  }

  /**
   * Opens a video in MX Player (Android)
   */
  async openInMXPlayer(fileUri: string, title?: string): Promise<boolean> {
    if (Platform.OS !== 'android') {
      showAlert('Notice', 'MX Player is available on Android. Opening system player options...');
      return this.openWithSystemChooser(fileUri, title);
    }

    try {
      // 1. Try MX Player Free Edition
      const mxFreeIntent = `intent:${fileUri}#Intent;action=android.intent.action.VIEW;type=video/*;package=com.mxtech.videoplayer.ad;end`;
      try {
        await Linking.openURL(mxFreeIntent);
        return true;
      } catch {}

      // 2. Try MX Player Pro Edition
      const mxProIntent = `intent:${fileUri}#Intent;action=android.intent.action.VIEW;type=video/*;package=com.mxtech.videoplayer.pro;end`;
      try {
        await Linking.openURL(mxProIntent);
        return true;
      } catch {}

      // 3. Try mxplayer custom scheme
      try {
        await Linking.openURL(`mxplayer://${fileUri}`);
        return true;
      } catch {}

      // Fallback to system chooser
      return this.openWithSystemChooser(fileUri, title);
    } catch (err) {
      console.warn('[ExternalPlayerService] Error opening MX Player:', err);
      showAlert(
        'MX Player Not Found',
        'Could not open MX Player. Make sure MX Player is installed from the Play Store or choose "Open with..." to select another player.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open With...',
            onPress: () => this.openWithSystemChooser(fileUri, title),
          },
        ]
      );
      return false;
    }
  }

  /**
   * Opens a video in Infuse (iOS)
   */
  async openInInfuse(fileUri: string, title?: string): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      return this.openWithSystemChooser(fileUri, title);
    }
    const infuseUri = `infuse://x-callback-url/play?url=${encodeURIComponent(fileUri)}`;
    try {
      await Linking.openURL(infuseUri);
      return true;
    } catch {
      return this.openWithSystemChooser(fileUri, title);
    }
  }

  /**
   * Opens a video with the native system app chooser (Android Chooser / iOS Share Sheet)
   * This gives the user complete freedom to choose VLC, MX Player, Photos, Files, or any player.
   */
  async openWithSystemChooser(fileUri: string, title?: string): Promise<boolean> {
    try {
      const result = await Share.share(
        Platform.OS === 'ios'
          ? { url: fileUri, title: title || 'Movie' }
          : { message: fileUri, title: title || 'Movie' },
        {
          dialogTitle: `Play "${title || 'Movie'}" with...`,
        }
      );
      return result.action === Share.sharedAction;
    } catch {
      // Fallback to direct linking
      try {
        await Linking.openURL(fileUri);
        return true;
      } catch (err: any) {
        console.warn('[ExternalPlayerService] System chooser error:', err);
        showAlert('Notice', 'Unable to open external player. Playing with internal player instead.');
        return false;
      }
    }
  }

  /**
   * Displays an action dialog or custom modal with all available internal & external player choices
   */
  async promptPlayerSelection(params: {
    fileUri: string;
    title: string;
    poster?: string;
    fileLength?: number;
    onPlayInternal: () => void;
  }): Promise<void> {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    // Prefer custom UI modal sheet if listener is registered
    if (this.modalListener) {
      this.modalListener(params);
      return;
    }

    const { fileUri, title, onPlayInternal } = params;

    if (Platform.OS === 'ios') {
      const options = [
        'Cancel',
        '▶ Play in App (Internal)',
        '🟠 Play in VLC',
        '🟣 Play in Infuse',
        '↗ Open With Other App...',
      ];

      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          title: `Play "${title}"`,
          message: 'Choose a video player to watch this downloaded movie',
        },
        async (buttonIndex) => {
          if (buttonIndex === 1) {
            onPlayInternal();
          } else if (buttonIndex === 2) {
            await this.openInVLC(fileUri, title);
          } else if (buttonIndex === 3) {
            await this.openInInfuse(fileUri, title);
          } else if (buttonIndex === 4) {
            await this.openWithSystemChooser(fileUri, title);
          }
        }
      );
    } else {
      // Android / Web Alert Dialog with player choices
      Alert.alert(
        `Play "${title}"`,
        'Choose a player to watch this downloaded movie:',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: '▶ Internal Player',
            onPress: () => onPlayInternal(),
          },
          {
            text: '🟠 VLC Player',
            onPress: () => this.openInVLC(fileUri, title),
          },
          {
            text: '🔵 MX Player',
            onPress: () => this.openInMXPlayer(fileUri, title),
          },
          {
            text: '↗ Open With...',
            onPress: () => this.openWithSystemChooser(fileUri, title),
          },
        ],
        { cancelable: true, userInterfaceStyle: 'dark' }
      );
    }
  }
}

export const externalPlayerService = new ExternalPlayerService();
