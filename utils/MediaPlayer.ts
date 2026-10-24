import { getOriginalPlatform } from "./platform";

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
