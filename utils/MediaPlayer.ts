import { Platform, UIManager } from "react-native";
import { getOriginalPlatform } from "./platform";

export const isVLCPlayerSupported = (): boolean => {
    if (Platform.OS !== 'android') return false;
    try {
        if (!UIManager) return false;
        return Boolean(
            UIManager.getViewManagerConfig?.('VLCPlayerView') ||
            (UIManager as any)?.hasViewManagerConfig?.('VLCPlayerView')
        );
    } catch {
        return false;
    }
};

export const isKSPlayerSupported = (): boolean => {
    if (Platform.OS !== 'ios') return false;
    try {
        if (!UIManager) return false;
        return Boolean(
            UIManager.getViewManagerConfig?.('KSPlayerView') ||
            (UIManager as any)?.hasViewManagerConfig?.('KSPlayerView')
        );
    } catch {
        return false;
    }
};

export enum Players {
    Default = 'Default',
    External = 'External',
    VLC = 'VLC',
    MXPlayer = 'MXPlayer',
    Infuse = 'Infuse',
    VidHub = 'VidHub',
    Outplayer = 'Outplayer'
}

export const getPlatformSpecificPlayers = () => {
    if (getOriginalPlatform() === 'android') {
        return [
            { name: Players.Default, scheme: 'STREAMURL', encodeUrl: false },
            { name: Players.VLC, scheme: 'vlc://STREAMURL', encodeUrl: false },
            { name: Players.MXPlayer, scheme: 'intent:STREAMURL#Intent;action=android.intent.action.VIEW;type=video/*;package=com.mxtech.videoplayer.ad;end', encodeUrl: false },
            { name: Players.External, scheme: 'STREAMURL', encodeUrl: false },
        ];
    } else if (getOriginalPlatform() === 'ios') {
        return [
            { name: Players.Default, scheme: 'STREAMURL', encodeUrl: false },
            { name: Players.External, scheme: 'STREAMURL', encodeUrl: false },
            { name: Players.VLC, scheme: 'vlc://STREAMURL', encodeUrl: false },
            { name: Players.Infuse, scheme: 'infuse://x-callback-url/play?url=STREAMURL', encodeUrl: true },
            { name: Players.VidHub, scheme: 'open-vidhub://x-callback-url/open?url=STREAMURL', encodeUrl: true },
            { name: Players.Outplayer, scheme: 'outplayer://STREAMURL', encodeUrl: false },
        ];
    } else if (getOriginalPlatform() === 'web') {
        return [
            { name: Players.Default, scheme: 'STREAMURL', encodeUrl: false },
            { name: Players.External, scheme: 'STREAMURL', encodeUrl: false }
        ];
    } else if (getOriginalPlatform() === 'windows') {
        return [
            { name: Players.Default, scheme: 'STREAMURL', encodeUrl: false },
            { name: Players.External, scheme: 'STREAMURL', encodeUrl: false },
        ];
    } else if (getOriginalPlatform() === 'macos') {
        return [
            { name: Players.Default, scheme: 'STREAMURL', encodeUrl: false },
            { name: Players.External, scheme: 'STREAMURL', encodeUrl: false },
            { name: Players.VLC, scheme: 'vlc://STREAMURL', encodeUrl: false },
            { name: Players.Infuse, scheme: 'infuse://x-callback-url/play?url=STREAMURL', encodeUrl: true },
            { name: Players.VidHub, scheme: 'open-vidhub://x-callback-url/open?url=STREAMURL', encodeUrl: true },
        ];
    }
    return [];
};
