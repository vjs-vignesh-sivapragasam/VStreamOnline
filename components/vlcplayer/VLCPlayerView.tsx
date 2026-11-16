import React, { useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import {
  requireNativeComponent,
  UIManager,
  findNodeHandle,
  NativeSyntheticEvent,
  ViewStyle,
  Platform,
} from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VLCAudioTrack {
  index: number;
  title: string;
  language: string;
  selected: boolean;
}

export interface VLCTextTrack {
  index: number;
  title: string;
  language: string;
  selected: boolean;
}

export interface VLCOnLoadData {
  duration: number;
  currentTime: number;
  naturalSize: { width: number; height: number; orientation: string };
  audioTracks: VLCAudioTrack[];
  textTracks: VLCTextTrack[];
}

export interface VLCOnProgressData {
  currentTime: number;
  duration: number;
  playableDuration: number;
  seekableDuration: number;
}

export interface VLCOnBufferData { isBuffering: boolean }
export interface VLCOnErrorData { error: { message: string; code: number } }
export interface VLCOnSubtitleTextData { text: string }

export interface VLCPlayerViewProps {
  url: string;
  headers?: Record<string, string>;
  paused?: boolean;
  muted?: boolean;
  rate?: number;
  resizeMode?: 'contain' | 'cover' | 'stretch';
  pictureInPictureEnabled?: boolean;
  style?: ViewStyle;

  onLoad?: (data: VLCOnLoadData) => void;
  onProgress?: (data: VLCOnProgressData) => void;
  onBuffer?: (data: VLCOnBufferData) => void;
  onError?: (data: VLCOnErrorData) => void;
  onEnd?: () => void;
  onReadyForDisplay?: () => void;
  onAudioTracks?: (data: { audioTracks: VLCAudioTrack[] }) => void;
  onTextTracks?: (data: { textTracks: VLCTextTrack[] }) => void;
  onSubtitleText?: (data: VLCOnSubtitleTextData) => void;
}

export interface VLCPlayerRef {
  seek: (time: number) => void;
  play: () => void;
  pause: () => void;
  selectAudioTrack: (index: number) => void;
  selectTextTrack: (index: number) => void;
  disableTextTrack: () => void;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
  enterPictureInPicture: () => void;
  exitPictureInPicture: () => void;
  setBrightness: (value: number) => void;
  setVolume: (value: number) => void;
}

// ─── Native component (Android only) ──────────────────────────────────────────

export const isVLCPlayerAvailable = (): boolean => {
  if (Platform.OS !== 'android') return false;
  try {
    return Boolean(
      UIManager.getViewManagerConfig?.('VLCPlayerView') ||
      (UIManager as any)?.hasViewManagerConfig?.('VLCPlayerView')
    );
  } catch {
    return false;
  }
};

const VLCPlayerNative = (() => {
  if (Platform.OS === 'android') {
    try {
      if (UIManager.getViewManagerConfig?.('VLCPlayerView') || (UIManager as any)?.hasViewManagerConfig?.('VLCPlayerView')) {
        return requireNativeComponent<any>('VLCPlayerView');
      }
    } catch {
      return null;
    }
  }
  return null;
})();

function dispatchCommand(ref: React.RefObject<any>, command: string, args: any[] = []) {
  if (!VLCPlayerNative) return;
  const node = findNodeHandle(ref.current);
  if (!node) return;
  const commands = (UIManager.getViewManagerConfig('VLCPlayerView') as any)?.Commands;
  if (!commands || commands[command] === undefined) {
    try {
      UIManager.dispatchViewManagerCommand(node, command as any, args);
    } catch {
      console.warn(`[VLCPlayerView] Command "${command}" not found`);
    }
    return;
  }
  UIManager.dispatchViewManagerCommand(node, commands[command], args);
}

// ─── Component ────────────────────────────────────────────────────────────────

export const VLCPlayerView = forwardRef<VLCPlayerRef, VLCPlayerViewProps>((props, ref) => {
  const nativeRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    seek(time) { dispatchCommand(nativeRef, 'seekTo', [time]); },
    play() { dispatchCommand(nativeRef, 'play'); },
    pause() { dispatchCommand(nativeRef, 'pause'); },
    selectAudioTrack(idx) { dispatchCommand(nativeRef, 'selectAudioTrack', [idx]); },
    selectTextTrack(idx) { dispatchCommand(nativeRef, 'selectTextTrack', [idx]); },
    disableTextTrack() { dispatchCommand(nativeRef, 'disableTextTrack'); },
    enterFullscreen() { dispatchCommand(nativeRef, 'enterFullscreen'); },
    exitFullscreen() { dispatchCommand(nativeRef, 'exitFullscreen'); },
    enterPictureInPicture() { dispatchCommand(nativeRef, 'enterPictureInPicture'); },
    exitPictureInPicture() { dispatchCommand(nativeRef, 'exitPictureInPicture'); },
    setBrightness(value) { dispatchCommand(nativeRef, 'setBrightness', [value]); },
    setVolume(value) { dispatchCommand(nativeRef, 'setVolume', [value]); },
  }));

  const handleLoad = useCallback(
    (e: NativeSyntheticEvent<VLCOnLoadData>) => props.onLoad?.(e.nativeEvent),
    [props.onLoad]
  );
  const handleProgress = useCallback(
    (e: NativeSyntheticEvent<VLCOnProgressData>) => props.onProgress?.(e.nativeEvent),
    [props.onProgress]
  );
  const handleBuffer = useCallback(
    (e: NativeSyntheticEvent<VLCOnBufferData>) => props.onBuffer?.(e.nativeEvent),
    [props.onBuffer]
  );
  const handleError = useCallback(
    (e: NativeSyntheticEvent<VLCOnErrorData>) => props.onError?.(e.nativeEvent),
    [props.onError]
  );
  const handleAudioTracks = useCallback(
    (e: NativeSyntheticEvent<{ audioTracks: VLCAudioTrack[] }>) => props.onAudioTracks?.(e.nativeEvent),
    [props.onAudioTracks]
  );
  const handleTextTracks = useCallback(
    (e: NativeSyntheticEvent<{ textTracks: VLCTextTrack[] }>) => props.onTextTracks?.(e.nativeEvent),
    [props.onTextTracks]
  );
  const handleSubtitleText = useCallback(
    (e: NativeSyntheticEvent<VLCOnSubtitleTextData>) => props.onSubtitleText?.(e.nativeEvent),
    [props.onSubtitleText]
  );

  if (!VLCPlayerNative) {
    return null;
  }

  return (
    <VLCPlayerNative
      ref={nativeRef}
      url={props.url}
      headers={props.headers}
      paused={props.paused}
      muted={props.muted}
      rate={props.rate}
      resizeMode={props.resizeMode}
      pictureInPictureEnabled={props.pictureInPictureEnabled}
      style={props.style}
      onLoad={handleLoad}
      onProgress={handleProgress}
      onBuffer={handleBuffer}
      onError={handleError}
      onEnd={props.onEnd}
      onReadyForDisplay={props.onReadyForDisplay}
      onAudioTracks={handleAudioTracks}
      onTextTracks={handleTextTracks}
      onSubtitleText={handleSubtitleText}
    />
  );
});

export default VLCPlayerView;
