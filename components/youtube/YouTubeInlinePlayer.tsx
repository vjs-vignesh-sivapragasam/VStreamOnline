import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Linking,
  Dimensions,
  useWindowDimensions,
  AppState,
  AppStateStatus,
  Switch,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Video, { VideoRef, ResizeMode, SelectedTrackType } from 'react-native-video';
import Slider from '@react-native-assets/slider';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import KSPlayerView, { isKSPlayerAvailable, KSPlayerRef } from '@/components/ksplayer/KSPlayerView';
import { isRCTVideoAvailable } from '@/components/nativeplayer';
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { youTubeService, SponsorSegment, YouTubeCaptionTrack } from '@/services/YouTubeService';
import { StorageKeys, storageService } from '@/utils/StorageService';

const { width } = Dimensions.get('window');

export type ScreenFitMode = 'cover' | 'stretch' | 'contain' | 'hero';

export interface FeedbackPillData {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  mode?: ScreenFitMode;
}

export interface YouTubeInlinePlayerProps {
  screenFitMode?: ScreenFitMode;
  onScreenFitChange?: (mode: ScreenFitMode) => void;
  topInset?: number;
  videoId?: string;
  title?: string;
  channel?: string;
  streamUrl: string | null;
  poster: string;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  seekTarget: number | null;
  playbackError?: string | null;
  currentQuality?: string;
  playbackSpeed?: number;
  isLooping?: boolean;
  availableQualities?: string[];
  onChangeQuality?: (quality: string) => void;
  onSetPlaybackSpeed?: (speed: number) => void;
  onToggleLoop?: () => void;
  isPipEnabled?: boolean;
  onTogglePip?: (enabled: boolean) => void;
  onTogglePlay: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onMinimize: () => void;
  onFullScreen: (forced?: boolean) => void;
  onSeek: (seconds: number) => void;
  onClearSeekTarget: () => void;
  onProgress: (currentTime: number, duration: number) => void;
  setIsBuffering: (buffering: boolean) => void;
  onPlaybackError?: (error: string) => void;
  onRetry?: () => void;
  onSwipeExit?: () => void;
  isFullScreen?: boolean;
  captionTracks?: YouTubeCaptionTrack[];
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs > 0) {
    return `${hrs}:${remMins < 10 ? '0' : ''}${remMins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function formatRemainingTime(currentSec: number, durationSec: number): string {
  if (isNaN(durationSec) || durationSec <= 0) return '';
  const rem = Math.max(0, durationSec - currentSec);
  return `-${formatTime(rem)}`;
}




const INJECTED_BEFORE_CONTENT_JS = `
  (function() {
    try {
      // 0. SCRIPT-LEVEL AD STRIPPER & INTERCEPTOR
      // Deletes ad breaks, pre-rolls, mid-rolls and tracking from player responses before player initialization
      function sanitizePlayerResponse(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        try {
          if (obj.adPlacements) delete obj.adPlacements;
          if (obj.adSlots) delete obj.adSlots;
          if (obj.playerAds) delete obj.playerAds;
          if (obj.adBreakHeartbeatParams) delete obj.adBreakHeartbeatParams;
          if (obj.playbackTracking) {
            delete obj.playbackTracking.videostatsPlaybackUrl;
            delete obj.playbackTracking.videostatsDelayplayUrl;
            delete obj.playbackTracking.videostatsWatchtimeUrl;
          }
        } catch(e) {}
        return obj;
      }

      // 0a. Intercept inline ytInitialPlayerResponse
      var _rawYtInitialPlayerResponse = window.ytInitialPlayerResponse;
      Object.defineProperty(window, 'ytInitialPlayerResponse', {
        get: function() { return _rawYtInitialPlayerResponse; },
        set: function(val) {
          _rawYtInitialPlayerResponse = sanitizePlayerResponse(val);
        },
        configurable: true
      });
      if (_rawYtInitialPlayerResponse) {
        _rawYtInitialPlayerResponse = sanitizePlayerResponse(_rawYtInitialPlayerResponse);
      }

      // 0b. Intercept window.fetch for /youtubei/v1/player and Google Ad endpoints
      if (window.fetch) {
        var _origFetch = window.fetch;
        window.fetch = function() {
          var urlArg = arguments[0];
          var urlStr = (typeof urlArg === 'string') ? urlArg : (urlArg && urlArg.url ? urlArg.url : '');
          if (
            urlStr.indexOf('/youtubei/v1/player/ad_break') !== -1 ||
            urlStr.indexOf('/api/stats/ads') !== -1 ||
            urlStr.indexOf('/pagead/') !== -1 ||
            urlStr.indexOf('doubleclick.net') !== -1 ||
            urlStr.indexOf('googleads.g.doubleclick.net') !== -1 ||
            urlStr.indexOf('googlesyndication.com') !== -1
          ) {
            return Promise.resolve(new Response(JSON.stringify({}), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }));
          }

          var fetchPromise = _origFetch.apply(this, arguments);

          if (urlStr.indexOf('/youtubei/v1/player') !== -1) {
            return fetchPromise.then(function(res) {
              try {
                var clone = res.clone();
                return clone.json().then(function(data) {
                  data = sanitizePlayerResponse(data);
                  return new Response(JSON.stringify(data), {
                    status: res.status,
                    statusText: res.statusText,
                    headers: res.headers
                  });
                }).catch(function() {
                  return res;
                });
              } catch(e) {
                return res;
              }
            });
          }

          return fetchPromise;
        };
      }

      // 0c. Intercept XMLHttpRequest for ad endpoints
      if (window.XMLHttpRequest) {
        var _origOpen = window.XMLHttpRequest.prototype.open;
        var _origSend = window.XMLHttpRequest.prototype.send;
        window.XMLHttpRequest.prototype.open = function(method, url) {
          this._agyReqUrl = (typeof url === 'string') ? url : '';
          return _origOpen.apply(this, arguments);
        };
        window.XMLHttpRequest.prototype.send = function() {
          var reqUrl = this._agyReqUrl || '';
          if (
            reqUrl.indexOf('/youtubei/v1/player/ad_break') !== -1 ||
            reqUrl.indexOf('/api/stats/ads') !== -1 ||
            reqUrl.indexOf('/pagead/') !== -1 ||
            reqUrl.indexOf('doubleclick.net') !== -1 ||
            reqUrl.indexOf('googleads.g.doubleclick.net') !== -1 ||
            reqUrl.indexOf('googlesyndication.com') !== -1
          ) {
            Object.defineProperty(this, 'readyState', { value: 4, writable: true });
            Object.defineProperty(this, 'status', { value: 200, writable: true });
            Object.defineProperty(this, 'responseText', { value: '{}', writable: true });
            if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
            if (typeof this.onload === 'function') this.onload();
            return;
          }
          return _origSend.apply(this, arguments);
        };
      }

      // 1. Dark background + immediately hide bottom navigation bars, headers, clutters + full width progress bar styles
      var css = 'html, body { width: 100vw !important; height: 100vh !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: #000000 !important; } ' +
        '#player, .player-container, #player-container-id, .html5-video-player, .html5-video-container { background: #000000 !important; background-color: #000000 !important; width: 100vw !important; height: 100vh !important; position: absolute !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; margin: 0 !important; padding: 0 !important; } ' +
        'video, video.video-stream, video.html5-main-video { width: 100vw !important; height: 100vh !important; max-width: none !important; max-height: none !important; position: absolute !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; object-fit: cover !important; object-position: center center !important; } ' +
        'ytm-reel-shelf-renderer, ytd-reel-shelf-renderer, ytm-shorts-lockup-view-model, ytd-shorts-lockup-view-model, [reel-shelf], .reel-shelf, [class*="shorts-shelf"], [class*="reel-shelf"], ytm-pivot-bar-renderer, ytm-pivot-bar, .pivot-bar, [role="tablist"], ytm-mobile-bottom-bar-renderer, #pivot-bar, .ytm-pivot-bar-renderer, [class*="pivot-bar"], [class*="pivot_bar"], [class*="bottom-nav"], [class*="bottom_bar"], [class*="bottomNavigation"], ytm-navigation-bar, ytm-bottom-sheet-layout, .ytm-bottom-sheet-renderer, ytm-browse[tab-identifier], ytm-mobile-topbar-renderer, ytm-header, header, .mobile-topbar-header, .ghost-header { display: none !important; visibility: hidden !important; height: 0 !important; min-height: 0 !important; max-height: 0 !important; overflow: hidden !important; opacity: 0 !important; pointer-events: none !important; margin: 0 !important; padding: 0 !important; } ' +
        'yt-progress-bar, .watch-page-progress-bar, .ytPlayerProgressBarHost, .ytPlayerProgressBarHostLowerPlayer, .ytPlayerProgressBarHostBottomEdge, .ytPlayerProgressBarHostBottomInset, .ytPlayerProgressBarHostCustom, .ytPlayerProgressBarDragContainer, .ytPlayerProgressBarProgressBar, .ytPlayerProgressBarProgressBarInset, .ytChapteredProgressBarHost, .ytFocusedChapterProgressBarLineHost, .ytProgressBarLineHost, .yt-progress-bar-line, .yt-chaptered-progress-bar-line, .yt-focused-chapter-progress-bar-line, .ytp-chrome-bottom, .ytp-progress-bar-container, .ytp-progress-bar, .ytp-progress-list, .ytp-play-progress, .ytp-load-progress, .ytp-hover-progress, [class*="ytPlayerProgressBarHost"], [class*="ytPlayerProgressBarProgressBar"], [class*="ytPlayerProgressBarDragContainer"], [class*="watch-page-progress-bar"], .ytm-progress-bar, ytm-progress-bar, .thin-scrubber { display: none !important; visibility: hidden !important; height: 0 !important; min-height: 0 !important; max-height: 0 !important; overflow: hidden !important; opacity: 0 !important; pointer-events: none !important; margin: 0 !important; padding: 0 !important; border: none !important; } ' +
        '.ytp-ad-overlay-container, .ytp-ad-message-container, .ytp-ad-action-interstitial, .ytp-ad-progress-list, ytm-promoted-sparkles-web-renderer, ytm-promoted-video-renderer, ytm-ad-preview-renderer, ytm-companion-ad-renderer, .ad-container, .ad-div, .ytp-ad-overlay-slot, .ytp-ad-image-overlay, .ytp-ad-player-overlay-flyout-cta, [class*="companion-ad"], [class*="ad-overlay"], .ytp-suggested-action, .ytp-ad-preview-container, .ytp-ad-text { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; height: 0 !important; width: 0 !important; overflow: hidden !important; }';
      var style = document.createElement('style');
      style.type = 'text/css';
      style.appendChild(document.createTextNode(css));
      (document.head || document.documentElement).appendChild(style);
      if (document.documentElement) {
        document.documentElement.style.background = '#000000';
        document.documentElement.style.backgroundColor = '#000000';
      }
      if (document.body) {
        document.body.style.background = '#000000';
        document.body.style.backgroundColor = '#000000';
      }

      // 2. Background audio & Lock Screen playback spoofing:
      // Prevents YouTube from detecting lock screen / background state and pausing audio
      try {
        Object.defineProperty(document, 'hidden', {
          get: function() { return false; },
          configurable: true
        });
        Object.defineProperty(document, 'visibilityState', {
          get: function() { return 'visible'; },
          configurable: true
        });
        Object.defineProperty(document, 'webkitVisibilityState', {
          get: function() { return 'visible'; },
          configurable: true
        });
      } catch(e) {}

      // Block all visibility change and freeze events so YouTube never pauses when screen locks
      var blockVisibility = function(e) {
        if (e && e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (e && e.stopPropagation) e.stopPropagation();
      };

      window.addEventListener('visibilitychange', blockVisibility, true);
      document.addEventListener('visibilitychange', blockVisibility, true);
      window.addEventListener('webkitvisibilitychange', blockVisibility, true);
      document.addEventListener('webkitvisibilitychange', blockVisibility, true);
      window.addEventListener('pagehide', blockVisibility, true);
    } catch(e) {}
  })();
  true;
`;

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

function parseVttToCues(vttText: string): SubtitleCue[] {
  const lines = vttText.replace(/\r\n/g, '\n').split('\n');
  const cues: SubtitleCue[] = [];
  let currentStart: number | null = null;
  let currentEnd: number | null = null;
  let currentTextLines: string[] = [];

  const timeRegex = /(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})/;

  function parseTime(h: string | undefined, m: string, s: string, ms: string): number {
    const hours = h ? parseInt(h, 10) : 0;
    const mins = parseInt(m, 10);
    const secs = parseInt(s, 10);
    const millis = parseInt(ms, 10);
    return hours * 3600 + mins * 60 + secs + millis / 1000;
  }

  for (const line of lines) {
    const match = line.match(timeRegex);
    if (match) {
      if (currentStart !== null && currentEnd !== null && currentTextLines.length > 0) {
        cues.push({
          start: currentStart,
          end: currentEnd,
          text: currentTextLines.join(' ').replace(/<[^>]+>/g, '').trim(),
        });
      }
      currentStart = parseTime(match[1], match[2], match[3], match[4]);
      currentEnd = parseTime(match[5], match[6], match[7], match[8]);
      currentTextLines = [];
    } else if (currentStart !== null && line.trim()) {
      if (!line.includes('-->') && !line.startsWith('NOTE') && !line.startsWith('WEBVTT') && !line.startsWith('STYLE')) {
        currentTextLines.push(line.trim());
      }
    }
  }

  if (currentStart !== null && currentEnd !== null && currentTextLines.length > 0) {
    cues.push({
      start: currentStart,
      end: currentEnd,
      text: currentTextLines.join(' ').replace(/<[^>]+>/g, '').trim(),
    });
  }

  return cues;
}

function getInjectedCleanPlayerJs(topInset?: number, fitMode: ScreenFitMode = 'hero', pipEnabled: boolean = true, isLooping: boolean = false, initialCCOn: boolean = false): string {
  const topOffset = 10;
  const initialFitCss = fitMode === 'contain' ? 'contain' : fitMode === 'stretch' ? 'fill' : 'cover';
  return `
  (function() {
    window.__agyDesiredFitMode = '${fitMode || 'cover'}';
    window.__agyPipEnabled = ${pipEnabled};
    window.__agyLoopEnabled = ${isLooping};

    if (window.__agyCleanPlayerInitialized) {
      if (typeof injectStyle === 'function') injectStyle();
      return;
    }
    window.__agyCleanPlayerInitialized = true;
    var cleanCss = \`
      /* 1. Hide entire YouTube mobile top header (logo, search, 3 dots, open app) */
      ytm-mobile-topbar-renderer,
      ytm-header,
      ytm-header-bar,
      #header,
      header,
      .mobile-topbar-header,
      .ghost-header {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      /* 1a. Ensure HTML and body fill complete window without boundaries */
      html, body {
        width: 100% !important;
        width: 100vw !important;
        max-width: 100vw !important;
        min-width: 100% !important;
        height: 100% !important;
        height: 100vh !important;
        max-height: 100vh !important;
        min-height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        background: #000000 !important;
      }

      /* 1b. Completely hide ALL YouTube mobile web controls (React Native custom overlay handles all UI) */
      .ytp-chrome-top,
      .player-control-overlay .top-row,
      .ytm-custom-control-top,
      .player-controls-top,
      .player-controls-content {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        height: 0 !important;
        width: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        overflow: hidden !important;
        pointer-events: none !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      /* 2. Lock player container and player-size strictly to 100% viewport width and frame height */
      .player-container,
      .player-container.sticky-player,
      #player-container-id,
      .player-size,
      #player,
      .player-container .player-size,
      ytm-watch .player-size,
      .html5-video-container,
      .html5-video-player,
      .player-controls-content,
      ytm-custom-control {
        position: absolute !important;
        top: 0 !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        width: 100% !important;
        width: 100vw !important;
        max-width: none !important;
        min-width: 100% !important;
        height: 100% !important;
        height: 100vh !important;
        min-height: 100% !important;
        max-height: none !important;
        padding: 0 !important;
        margin: 0 !important;
        border: none !important;
        border-bottom: none !important;
        box-shadow: none !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
      }

      /* 2a. Player control overlays must be non-blocking and transparent so video and captions render cleanly */
      .player-control-overlay,
      .player-control-container {
        position: absolute !important;
        top: 0 !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background: transparent !important;
        background-color: transparent !important;
        pointer-events: none !important;
      }

      /* 2b. YouTube Shorts container support & fit */
      ytm-reel-video-renderer,
      ytd-reel-video-renderer,
      ytm-shorts-player,
      ytd-shorts,
      .reel-video-in-sequence,
      .shorts-video-cell,
      ytm-reel-shelf-renderer {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100% !important;
        width: 100vw !important;
        height: 100% !important;
        height: 100vh !important;
        max-width: none !important;
        max-height: none !important;
        overflow: hidden !important;
      }

      /* 3. Force video element to fill the inline player frame cleanly edge-to-edge */
      video,
      video.video-stream,
      video.html5-main-video {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100% !important;
        width: 100vw !important;
        height: 100% !important;
        height: 100vh !important;
        max-width: none !important;
        max-height: none !important;
        object-fit: ${initialFitCss} !important;
        object-position: center center !important;
      }

      /* 3b. Completely hide ALL YouTube mobile web controls (center row, bottom row, progress bars, settings) */
      .player-control-overlay .middle-row,
      .player-control-overlay .player-controls-middle,
      .middle-row,
      .player-controls-middle,
      ytm-custom-control-middle,
      .player-controls-middle-inner,
      [class*="controls-middle"],
      .player-control-seek-button,
      .player-control-play-pause-icon,
      .middle-row button,
      .player-controls-middle button,
      .ytm-play-pause-button,
      .player-control-button,
      .ytp-chrome-bottom,
      .player-control-overlay .bottom-row,
      .player-controls-bottom,
      .ytm-time-display,
      .ytm-fullscreen-button,
      .player-control-fullscreen-button,
      .fullscreen-icon,
      .ytp-play-pause-button,
      .ytp-settings-button,
      .ytm-settings-button,
      .ytp-subtitles-button,
      .ytm-subtitles-button,
      button[aria-label*="Settings" i],
      button[aria-label*="Captions" i],
      button[aria-label*="subtitles" i],
      button[aria-label*="Full screen" i],
      button[aria-label*="Fullscreen" i],
      .ytp-cued-thumbnail-overlay,
      .fadeout .middle-row,
      .fadeout .player-controls-middle,
      .fadeout .top-row,
      .fadeout .bottom-row,
      .fadeout button,
      [aria-hidden="true"] .middle-row,
      [aria-hidden="true"] button,
      .ytp-autohide .ytp-chrome-top,
      .ytp-autohide .ytp-chrome-bottom {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        height: 0 !important;
        width: 0 !important;
        pointer-events: none !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
      }

      /* 4 & 5. Completely hide ALL YouTube web progress bars (React Native renders the single clean progress bar) */
      yt-progress-bar,
      .watch-page-progress-bar,
      .ytPlayerProgressBarHost,
      .ytPlayerProgressBarHostLowerPlayer,
      .ytPlayerProgressBarHostBottomEdge,
      .ytPlayerProgressBarHostBottomInset,
      .ytPlayerProgressBarHostCustom,
      .ytPlayerProgressBarDragContainer,
      .ytPlayerProgressBarProgressBar,
      .ytPlayerProgressBarProgressBarInset,
      .ytChapteredProgressBarHost,
      .ytFocusedChapterProgressBarLineHost,
      .ytProgressBarLineHost,
      .yt-progress-bar-line,
      .yt-chaptered-progress-bar-line,
      .yt-focused-chapter-progress-bar-line,
      .ytp-chrome-bottom,
      .ytp-progress-bar-container,
      .ytp-progress-bar,
      .ytp-progress-list,
      .ytp-play-progress,
      .ytp-load-progress,
      .ytp-hover-progress,
      [class*="ytPlayerProgressBarHost"],
      [class*="ytPlayerProgressBarProgressBar"],
      [class*="ytPlayerProgressBarDragContainer"],
      [class*="watch-page-progress-bar"],
      body[faux-fullscreen=true] .watch-page-progress-bar,
      .fullscreen-controls-always-on .watch-page-progress-bar,
      div:has(> yt-progress-bar),
      div:has(> .watch-page-progress-bar),
      div:has(> [class*="ytPlayerProgressBar"]),
      .ytm-progress-bar,
      ytm-progress-bar,
      .player-control-overlay .progress-bar,
      .player-control-container > .progress-bar,
      .player-control-overlay > .progress-bar,
      .thin-scrubber,
      .ytp-cued-thumbnail-overlay,
      .ytp-speedmaster-overlay,
      .ytp-speedmaster,
      .ytp-speedmaster-indicator,
      [class*="speedmaster"],
      .ytp-doubletap-ui-legacy[data-speed],
      .ytp-bezel[role="status"],
      .ytp-bezel-text {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        overflow: hidden !important;
        pointer-events: none !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
      }

      /* 6. Hide bottom navigation bar, duplicate title & everything below the video */
      ytm-pivot-bar-renderer,
      ytm-pivot-bar,
      .pivot-bar,
      [role="tablist"],
      ytm-mobile-bottom-bar-renderer,
      #pivot-bar,
      .ytm-pivot-bar-renderer,
      [class*="pivot-bar"],
      [class*="pivot_bar"],
      [class*="bottom-nav"],
      [class*="bottom_bar"],
      [class*="bottomNavigation"],
      ytm-navigation-bar,
      ytm-bottom-sheet-layout,
      .ytm-bottom-sheet-renderer,
      ytm-browse[tab-identifier],
      ytm-slim-video-metadata-renderer,
      .slim-video-metadata-header,
      .slim-video-information-holder,
      ytm-slim-owner-renderer,
      .watch-below-the-player,
      #related,
      ytm-item-section-renderer,
      ytm-comment-section-renderer,
      ytm-engagement-panel-section-list-renderer,
      .ytm-autonav-bar {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        overflow: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      /* 6b. Hide shorts overlays & buttons */
      ytm-reel-player-overlay-renderer,
      .ytm-reel-player-overlay-renderer,
      .reel-player-overlay-actions,
      .ytm-reel-player-header-renderer,
      .ytm-shorts-sound-metadata-renderer,
      .shorts-overlay-button,
      [class*="reel-player-overlay"],
      .reel-player-overlay-main-content {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }

      /* 6c. Hide shorts shelves and recommendation units */
      ytm-reel-shelf-renderer,
      ytd-reel-shelf-renderer,
      ytm-shorts-lockup-view-model,
      ytd-shorts-lockup-view-model,
      ytm-rich-section-renderer:has(ytm-reel-shelf-renderer),
      [reel-shelf],
      .reel-shelf,
      [class*="shorts-shelf"],
      [class*="reel-shelf"] {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        overflow: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }

      /* 7. Hide Tap to unmute & sound icons */
      .ytp-unmute,
      .ytp-unmute-inner,
      .ytp-unmute-box,
      .ytp-unmute-icon,
      [class*="unmute"],
      .player-control-overlay .unmute-button,
      .ytm-unmute-button,
      button[aria-label*="unmute" i],
      button[aria-label*="sound" i] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }

      /* 8. Hide Open App buttons, dialogs, promos */
      ytm-open-app-button,
      .open-in-app-dialog,
      .upsell-dialog,
      ytm-upsell-dialog-renderer,
      ytm-promoted-sparkles-web-renderer,
      .yt-spec-button-shape-next--call-to-action {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        overflow: hidden !important;
      }

      /* 9. Hide YouTube web settings popup / menu so it never clips inside 16:9 box */
      .ytp-popup,
      .ytp-settings-menu,
      .ytp-panel,
      .ytp-panel-menu,
      ytm-bottom-sheet-renderer,
      ytm-menu-item-section-renderer,
      ytm-menu-popup-renderer,
      ytm-menu-renderer,
      .ytm-menu,
      .ytm-settings-panel,
      .ytp-popup.ytp-settings-menu {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        height: 0 !important;
        width: 0 !important;
        overflow: hidden !important;
      }

      /* 9b. Hide all YouTube Ad banners, companion cards, interstitials, and promoted items */
      .ytp-ad-overlay-container,
      .ytp-ad-message-container,
      .ytp-ad-action-interstitial,
      .ytp-ad-progress-list,
      ytm-promoted-sparkles-web-renderer,
      ytm-promoted-video-renderer,
      ytm-ad-preview-renderer,
      ytm-companion-ad-renderer,
      .ad-container,
      .ad-div,
      .ytp-ad-overlay-slot,
      .ytp-ad-image-overlay,
      .ytp-ad-player-overlay-flyout-cta,
      [class*="companion-ad"],
      [class*="ad-overlay"],
      .ytp-suggested-action,
      .ytp-ad-preview-container,
      .ytp-ad-text {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        height: 0 !important;
        width: 0 !important;
        overflow: hidden !important;
      }

      /* 10. Clean container frame without page scrolling */
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        background-color: #000000 !important;
      }
    \`;

    function injectStyle() {
      var existing = document.getElementById('agy-clean-yt-style');
      if (existing) {
        existing.textContent = cleanCss;
        return;
      }
      var style = document.createElement('style');
      style.id = 'agy-clean-yt-style';
      style.textContent = cleanCss;
      (document.head || document.documentElement).appendChild(style);
    }

    injectStyle();

    // Strict settings button target detector: only matches actual button elements
    function isSettingsTarget(el) {
      if (!el) return false;
      var btn = null;
      if (el.closest) {
        btn = el.closest(
          '.ytp-settings-button, ' +
          'button[aria-label*="Settings" i], ' +
          'button[aria-label*="settings" i], ' +
          'button[aria-label*="Playback settings" i], ' +
          '[data-action="settings"], ' +
          '.ytm-settings-button'
        );
      }
      if (!btn) {
        var tag = (el.tagName || '').toLowerCase();
        if (tag === 'button' || (el.getAttribute && el.getAttribute('role') === 'button')) {
          btn = el;
        } else if (el.parentElement) {
          var pTag = (el.parentElement.tagName || '').toLowerCase();
          if (pTag === 'button' || (el.parentElement.getAttribute && el.parentElement.getAttribute('role') === 'button')) {
            btn = el.parentElement;
          }
        }
      }
      if (!btn) return false;

      var btnCls = (typeof btn.className === 'string') ? btn.className.toLowerCase() : '';
      if (btnCls.includes('player-container') || btnCls.includes('html5-video-player')) {
        return false;
      }

      if (btnCls.includes('ytp-settings-button') || btnCls.includes('ytm-settings-button')) {
        return true;
      }

      var aria = ((btn.getAttribute && btn.getAttribute('aria-label')) || '').toLowerCase();
      var title = ((btn.getAttribute && btn.getAttribute('title')) || '').toLowerCase();
      if (aria.includes('setting') || title.includes('setting')) {
        return true;
      }

      var action = ((btn.getAttribute && btn.getAttribute('data-action')) || '').toLowerCase();
      if (action.includes('setting')) return true;

      return false;
    }

    function handleSettingsIntercept(e) {
      if (isSettingsTarget(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();

        // Immediately hide/remove any web popup YouTube attempted to spawn
        var popups = document.querySelectorAll(
          '.ytp-popup, .ytp-settings-menu, ytm-bottom-sheet-renderer, ' +
          '.ytm-menu-item-section-renderer, ytm-menu-popup-renderer, .ytp-panel-menu, ytm-menu-renderer'
        );
        popups.forEach(function(p) {
          p.style.setProperty('display', 'none', 'important');
          try { p.remove(); } catch(err) {}
        });

        var vid = document.querySelector('video');
        var cur = vid ? vid.currentTime : 0;
        var dur = vid ? vid.duration : 0;
        var paused = vid ? vid.paused : false;

        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'OPEN_SETTINGS',
            currentTime: cur,
            duration: dur,
            isPlaying: !paused
          }));
        }
        return false;
      }
    }

    // Strict fullscreen button target detector: ONLY matches dedicated fullscreen buttons
    // NEVER matches video element, player containers, or control overlays!
    function isFullscreenTarget(el) {
      if (!el) return false;
      var btn = null;
      if (el.closest) {
        btn = el.closest(
          '.ytp-fullscreen-button, ' +
          'button[aria-label*="Full screen" i], ' +
          'button[aria-label*="Fullscreen" i], ' +
          'button[aria-label*="fullscreen" i], ' +
          '.fullscreen-icon, ' +
          '.player-control-fullscreen-button, ' +
          '.ytm-fullscreen-button'
        );
      }
      if (!btn) {
        var tag = (el.tagName || '').toLowerCase();
        if (tag === 'button' || (el.getAttribute && el.getAttribute('role') === 'button')) {
          btn = el;
        } else if (el.parentElement) {
          var pTag = (el.parentElement.tagName || '').toLowerCase();
          if (pTag === 'button' || (el.parentElement.getAttribute && el.parentElement.getAttribute('role') === 'button')) {
            btn = el.parentElement;
          }
        }
      }
      if (!btn) return false;

      // Ensure button is NOT an ancestor video container
      var btnTag = (btn.tagName || '').toLowerCase();
      var btnCls = (typeof btn.className === 'string') ? btn.className.toLowerCase() : '';
      if (
        btnCls.includes('player-container') ||
        btnCls.includes('html5-video-player') ||
        btnCls.includes('player-control-overlay') ||
        btnCls.includes('middle-row') ||
        btnTag === 'video'
      ) {
        return false;
      }

      // Check explicit fullscreen button classes
      if (
        btnCls.includes('ytp-fullscreen-button') ||
        btnCls.includes('player-control-fullscreen-button') ||
        btnCls.includes('fullscreen-icon') ||
        btnCls.includes('ytm-fullscreen-button')
      ) {
        return true;
      }

      // Check aria-label / title strictly on the button itself
      var aria = ((btn.getAttribute && btn.getAttribute('aria-label')) || '').toLowerCase().trim();
      var title = ((btn.getAttribute && btn.getAttribute('title')) || '').toLowerCase().trim();
      if (
        aria === 'full screen' ||
        aria === 'fullscreen' ||
        aria === 'enter full screen' ||
        aria === 'exit full screen' ||
        title === 'full screen' ||
        title === 'fullscreen'
      ) {
        return true;
      }

      var action = ((btn.getAttribute && btn.getAttribute('data-action')) || '').toLowerCase();
      if (action === 'fullscreen') return true;

      return false;
    }

    function handleFullscreenIntercept(e) {
      if (isFullscreenTarget(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'TOGGLE_FULLSCREEN'
          }));
        }
        return false;
      }
    }

    var lastInterceptTime = 0;
    function handleGlobalTap(e) {
      var now = Date.now();
      if (isSettingsTarget(e.target)) {
        if (now - lastInterceptTime < 350) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        lastInterceptTime = now;
        return handleSettingsIntercept(e);
      } else if (isFullscreenTarget(e.target)) {
        if (now - lastInterceptTime < 350) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        lastInterceptTime = now;
        return handleFullscreenIntercept(e);
      }
      // Any other tap (screen click to show controls, center play/pause, rewind, forward, autoplay)
      // passes through cleanly to YouTube mobile web player so controls appear smoothly!
    }

    document.addEventListener('click', handleGlobalTap, true);
    document.addEventListener('touchend', handleGlobalTap, true);

    // Web controls visibility sync is disabled; React Native controls overlay handles 100% of the UI
    function syncControlsVisibility() {}

    // ------------------------------------------------------------------
    // CLOSED CAPTIONS (CC) ENGINE CONTROLLER
    // ------------------------------------------------------------------
    window.__agyCaptionsEnabled = ${initialCCOn};

    window.__agySetCaptionsEnabled = function(enabled) {
      window.__agyCaptionsEnabled = !!enabled;

      // 1. Maintain dynamic style element that controls caption element display
      var styleEl = document.getElementById('agy-cc-style');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'agy-cc-style';
        (document.head || document.documentElement).appendChild(styleEl);
      }

      if (enabled) {
        styleEl.textContent =
          '.caption-window, .ytp-caption-window-container, .ytm-caption-window-container, ' +
          'ytm-caption-track-view, .captions-text, .caption-visual-line { ' +
          '  display: block !important; ' +
          '  visibility: visible !important; ' +
          '  opacity: 1 !important; ' +
          '  z-index: 2147483640 !important; ' +
          '  pointer-events: none !important; ' +
          '} ' +
          '.caption-visual-line, .captions-text { ' +
          '  display: inline-block !important; ' +
          '} ' +
          '.caption-window, ytm-caption-track-view { ' +
          '  bottom: 40px !important; ' +
          '}';
      } else {
        styleEl.textContent =
          '.caption-window, .ytp-caption-window-container, .ytm-caption-window-container, ' +
          'ytm-caption-track-view, .captions-text, .caption-visual-line, [class*="caption-window"] { ' +
          '  display: none !important; ' +
          '  visibility: hidden !important; ' +
          '  opacity: 0 !important; ' +
          '  height: 0px !important; ' +
          '  width: 0px !important; ' +
          '  pointer-events: none !important; ' +
          '}';
      }

      // 2. Control YouTube HTML5 Player API
      var p = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
      if (p) {
        try {
          if (typeof p.loadModule === 'function') {
            p.loadModule('captions');
          }
          if (enabled) {
            if (typeof p.toggleSubtitlesOn === 'function') {
              p.toggleSubtitlesOn();
            }
            if (typeof p.setOption === 'function') {
              var tracks = (typeof p.getOption === 'function' ? p.getOption('captions', 'tracklist') : []) || [];
              var track = tracks.find(function(t) { return t.languageCode === 'en' || (t.vssId && t.vssId.indexOf('en') !== -1); }) || tracks[0] || { languageCode: 'en' };
              p.setOption('captions', 'track', track);
              p.setOption('captions', 'reload', true);
            }
          } else {
            if (typeof p.setOption === 'function') {
              p.setOption('captions', 'track', {});
            }
            if (typeof p.toggleSubtitles === 'function') {
              var curTrack = (typeof p.getOption === 'function' ? p.getOption('captions', 'track') : null);
              if (curTrack && (curTrack.languageCode || curTrack.vssId)) {
                p.toggleSubtitles();
              }
            }
          }
        } catch(e) {}
      }

      // 3. Control HTML5 <video> textTracks
      var v = document.querySelector('video');
      if (v && v.textTracks) {
        try {
          for (var i = 0; i < v.textTracks.length; i++) {
            var trk = v.textTracks[i];
            if (trk.kind === 'subtitles' || trk.kind === 'captions') {
              trk.mode = enabled ? 'showing' : 'hidden';
            }
          }
        } catch(e) {}
      }

      // 4. Check DOM buttons
      try {
        var ccBtns = document.querySelectorAll(
          '.ytp-subtitles-button, .ytm-subtitles-button, ' +
          'button[aria-label*="Captions" i], button[aria-label*="subtitles" i], ' +
          'button[aria-label*="closed captions" i], [aria-label*="Captions" i]'
        );
        for (var j = 0; j < ccBtns.length; j++) {
          var btn = ccBtns[j];
          var isPressed = btn.getAttribute('aria-pressed') === 'true' ||
                          btn.classList.contains('ytp-subtitles-button-active') ||
                          btn.classList.contains('active');
          if (isPressed !== enabled) {
            btn.click();
          }
        }
      } catch(e) {}
    };

    window.__agySetCaptionsEnabled(${initialCCOn});

    // ------------------------------------------------------------------
    // 1. PREVENT YOUTUBE AUTO 2X SPEED ON SCREEN TOUCH / HOLD
    // ------------------------------------------------------------------
    window.__userDesiredPlaybackRate = 1.0;

    function blockAuto2xSpeed() {
      var v = document.querySelector('video');
      if (!v) return;

      if (!v.__rateGuardAttached) {
        v.__rateGuardAttached = true;
        v.addEventListener('ratechange', function() {
          var desired = window.__userDesiredPlaybackRate || 1.0;
          // If YouTube mobile web auto-accelerates to 2.0x due to touch/press-and-hold:
          if (v.playbackRate === 2.0 && desired !== 2.0) {
            v.playbackRate = desired;
          }
        });
      }
    }
    setInterval(blockAuto2xSpeed, 250);

    // ------------------------------------------------------------------
    // 2. CALIBRATED SWIPE GESTURES (NO FALSE FULLSCREEN ON TAPS)
    // ------------------------------------------------------------------
    var swipeStartX = 0;
    var swipeStartY = 0;
    var swipeStartTime = 0;
    var isSwiping = false;

    function onTouchStartCapture(e) {
      if (e.touches && e.touches.length === 1) {
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
        swipeStartTime = Date.now();
        isSwiping = true;
      }
    }

    function onTouchEndCapture(e) {
      if (!isSwiping) return;
      isSwiping = false;

      if (e.changedTouches && e.changedTouches.length === 1) {
        var dX = e.changedTouches[0].clientX - swipeStartX;
        var dY = e.changedTouches[0].clientY - swipeStartY;
        var dTime = Date.now() - swipeStartTime;
        var absX = Math.abs(dX);
        var absY = Math.abs(dY);

        // DELIBERATE SWIPE ONLY (70ms to 550ms flick duration)
        // Normal taps (movement < 20px) or slow drags will NEVER trigger fullscreen!
        if (dTime < 750 && dTime > 40) {
          // 1. Vertical swipe up -> Fullscreen (requires at least 55px upward flick and clear vertical dominance)
          if (dY < -35 && absY > absX * 1.2) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'SWIPE_UP_FULLSCREEN'
              }));
            }
            return;
          }

          // 2. Vertical swipe down -> Minimize / exit fullscreen (requires at least 55px downward flick)
          if (dY > 35 && absY > absX * 1.2) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'SWIPE_DOWN_MINIMIZE'
              }));
            }
            return;
          }

          // 3. Horizontal swipe left -> Go back / minimize
          if (dX < -60 && absX > absY * 1.6) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'SWIPE_EXIT',
                direction: 'left'
              }));
            }
            return;
          }
        }
      }
    }

    window.addEventListener('touchstart', onTouchStartCapture, { capture: true, passive: true });
    window.addEventListener('touchend', onTouchEndCapture, { capture: true, passive: true });

    // Handle visibility changes safely without invoking illegal PiP during screen lock
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        // Device locked or app moved to background: keep session alive, do not force presentation mode
      } else {
        // Device unlocked or foregrounded: safely resume video if it was playing and not user-paused
        try {
          var v = document.querySelector('video');
          if (v && v.paused && !window._agyUserPaused) {
            var player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
            if (player && typeof player.playVideo === 'function') {
              try { player.playVideo(); } catch(e) {}
            } else {
              v.play().catch(function(){});
            }
          }
        } catch(e) {}
      }
    });

    // Background playback keep-alive watchdog & Lock Screen Media Controls
    function setupBackgroundKeepAlive() {
      var v = document.querySelector('video');
      if (v && !v._hasAgyKeepAlive) {
        v._hasAgyKeepAlive = true;

        if ('mediaSession' in navigator) {
          try {
            navigator.mediaSession.playbackState = v.paused ? 'paused' : 'playing';

            navigator.mediaSession.setActionHandler('play', function() {
              window._agyUserPaused = false;
              var player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
              if (player && typeof player.playVideo === 'function') {
                try { player.playVideo(); } catch(e) {}
              }
              var allVids = document.querySelectorAll('video');
              allVids.forEach(function(vid) {
                vid.play().catch(function() {});
              });
              navigator.mediaSession.playbackState = 'playing';
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'PLAY_STATE',
                  isPlaying: true
                }));
              }
            });

            navigator.mediaSession.setActionHandler('pause', function() {
              window._agyUserPaused = true;
              var player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
              if (player && typeof player.pauseVideo === 'function') {
                try { player.pauseVideo(); } catch(e) {}
              }
              var allVids = document.querySelectorAll('video');
              allVids.forEach(function(vid) {
                vid.pause();
              });
              navigator.mediaSession.playbackState = 'paused';
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'PLAY_STATE',
                  isPlaying: false
                }));
              }
            });

            navigator.mediaSession.setActionHandler('seekbackward', function(details) {
              var skipTime = (details && details.seekOffset) || 10;
              if (v) v.currentTime = Math.max(v.currentTime - skipTime, 0);
              updatePositionState();
            });

            navigator.mediaSession.setActionHandler('seekforward', function(details) {
              var skipTime = (details && details.seekOffset) || 10;
              if (v) v.currentTime = Math.min(v.currentTime + skipTime, v.duration || 0);
              updatePositionState();
            });

            navigator.mediaSession.setActionHandler('stop', function() {
              window._agyUserPaused = true;
              if (v) v.pause();
              navigator.mediaSession.playbackState = 'paused';
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'PLAY_STATE',
                  isPlaying: false
                }));
              }
            });

            if (!navigator.mediaSession._agyProtected) {
              navigator.mediaSession._agyProtected = true;
              var origSetHandler = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
              navigator.mediaSession.setActionHandler = function(action, handler) {
                if (action === 'play' || action === 'pause' || action === 'stop') {
                  return;
                }
                return origSetHandler(action, handler);
              };
            }
          } catch(err) {}
        }

        document.addEventListener('click', function(e) {
          var target = e.target;
          if (!target) return;
          var btn = target.closest && target.closest('.ytp-play-button, .player-control-play-pause-icon, button[aria-label*="Play" i], button[aria-label*="Pause" i]');
          if (btn) {
            setTimeout(function() {
              if (v) window._agyUserPaused = v.paused;
            }, 60);
          }
        }, true);
      }
    }

    function attachVideoListeners() {
      var allVids = document.querySelectorAll('video');
      allVids.forEach(function(v) {
        if (v._hasAgyProgressListeners) return;
        v._hasAgyProgressListeners = true;

        function updatePositionState() {
          if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && v && v.duration && !isNaN(v.duration)) {
            try {
              navigator.mediaSession.setPositionState({
                duration: v.duration,
                playbackRate: v.playbackRate || 1,
                position: Math.min(v.currentTime || 0, v.duration)
              });
            } catch(e) {}
          }
        }

        v.addEventListener('timeupdate', function() {
          if (isAdActive()) {
            runAdSkipper();
            return;
          }
          updatePositionState();
          if (window.ReactNativeWebView && typeof v.currentTime === 'number') {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'PROGRESS',
              currentTime: v.currentTime,
              duration: v.duration || 0
            }));
          }
        });

        v.addEventListener('play', function() {
          window._agyUserPaused = false;
          window._agyInitialPlayDone = true;
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
          }
          updatePositionState();
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'PLAY_STATE',
              isPlaying: true
            }));
          }
        });

        v.addEventListener('pause', function() {
          window._agyUserPaused = true;
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
          }
          updatePositionState();
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'PLAY_STATE',
              isPlaying: false
            }));
          }
        });

        v.addEventListener('ended', function() {
          if (v.loop || window.__agyLoopEnabled || v.closest('ytm-reel-video-renderer, ytd-reel-video-renderer, ytm-shorts-player')) {
            v.currentTime = 0;
            v.play().catch(function() {});
          } else {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'PLAY_STATE',
                isPlaying: false
              }));
            }
          }
        });

        function reportStreamReady() {
          var s = v.currentSrc || v.src;
          if (s && window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'STREAM_SOURCE_READY',
              streamUrl: s,
              duration: v.duration || 0
            }));
          }
        }
        v.addEventListener('loadedmetadata', reportStreamReady);
        v.addEventListener('canplay', reportStreamReady);
        v.addEventListener('playing', reportStreamReady);
        reportStreamReady();
      });
    }

    function forceFullVideoAndPlay() {
      var containers = [
        '#player-container-id',
        '.player-container',
        '.player-size',
        '#player',
        '.html5-video-player',
        '.html5-video-container',
        'ytm-reel-video-renderer',
        'ytd-reel-video-renderer',
        'ytm-shorts-player',
        'ytd-shorts',
        '.reel-video-in-sequence',
        '.shorts-video-cell',
        'ytm-reel-shelf-renderer'
      ];
      containers.forEach(function(sel) {
        document.querySelectorAll(sel).forEach(function(el) {
          el.style.setProperty('height', '100%', 'important');
          el.style.setProperty('min-height', '100%', 'important');
          el.style.setProperty('max-height', '100%', 'important');
          el.style.setProperty('padding-bottom', '0px', 'important');
          el.style.setProperty('top', '0px', 'important');
          el.style.setProperty('bottom', '0px', 'important');
          el.style.setProperty('width', '100%', 'important');
          el.style.setProperty('max-width', 'none', 'important');
          el.style.setProperty('min-width', '100%', 'important');
          el.style.setProperty('left', '0px', 'important');
          el.style.setProperty('right', '0px', 'important');
          el.style.setProperty('bottom', '0px', 'important');
          el.style.setProperty('margin-left', '0px', 'important');
          el.style.setProperty('margin-right', '0px', 'important');
          el.style.setProperty('border-bottom', 'none', 'important');
        });
      });

      // Completely hide and disable all YouTube mobile web control elements (excluding subtitles/captions)
      var webControls = document.querySelectorAll(
        '.player-controls-content, ' +
        '.player-controls-top, .player-controls-middle, .player-controls-bottom, ' +
        '.player-control-overlay .top-row, .player-control-overlay .middle-row, .player-control-overlay .bottom-row, ' +
        '.ytp-chrome-top, .ytp-chrome-bottom, ytm-custom-control-top, ytm-custom-control-middle, ' +
        '.ytm-time-display, .ytm-fullscreen-button, .player-control-fullscreen-button, ' +
        '.player-control-play-pause-icon, .player-control-seek-button, .player-control-button, ' +
        '.ytp-settings-button, .ytm-settings-button, .ytp-subtitles-button, .ytm-subtitles-button, ' +
        'button[aria-label*="Settings" i], button[aria-label*="Captions" i], button[aria-label*="subtitles" i], ' +
        'button[aria-label*="Full screen" i], button[aria-label*="Fullscreen" i], .ytp-cued-thumbnail-overlay'
      );
      webControls.forEach(function(el) {
        if (
          (el.closest && el.closest('ytm-caption-track-view, .caption-window, .ytp-caption-window-container, .ytm-caption-window-container')) ||
          (el.matches && el.matches('ytm-caption-track-view, .caption-window, .ytp-caption-window-container, .ytm-caption-window-container, .captions-text, .caption-visual-line'))
        ) {
          return;
        }
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('opacity', '0', 'important');
        el.style.setProperty('height', '0px', 'important');
        el.style.setProperty('width', '0px', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
      });

      var overlays = document.querySelectorAll('.player-control-overlay, .player-control-container');
      overlays.forEach(function(el) {
        el.style.setProperty('background', 'transparent', 'important');
        el.style.setProperty('background-color', 'transparent', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
      });

      if (typeof window.__agySetCaptionsEnabled === 'function') {
        window.__agySetCaptionsEnabled(window.__agyCaptionsEnabled);
      }

      // Remove bottom navigation bars & clutter
      var navBars = document.querySelectorAll('ytm-pivot-bar-renderer, ytm-pivot-bar, .pivot-bar, [role="tablist"], ytm-mobile-bottom-bar-renderer, #pivot-bar, [class*="pivot-bar"], [class*="bottom-nav"], ytm-navigation-bar');
      navBars.forEach(function(el) {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('height', '0px', 'important');
        try { el.remove(); } catch(e) {}
      });

      var currentDesiredMode = window.__agyDesiredFitMode || 'cover';
      var currentFitCss = currentDesiredMode === 'contain' ? 'contain' : currentDesiredMode === 'stretch' ? 'fill' : 'cover';

      var allVids = document.querySelectorAll('video');
      allVids.forEach(function(v) {
        v.muted = false;
        v.loop = window.__agyLoopEnabled || false;
        v.style.setProperty('position', 'absolute', 'important');
        v.style.setProperty('top', '0px', 'important');
        v.style.setProperty('left', '0px', 'important');
        v.style.setProperty('right', '0px', 'important');
        v.style.setProperty('bottom', '0px', 'important');
        v.style.setProperty('width', '100%', 'important');
        v.style.setProperty('height', '100%', 'important');
        v.style.setProperty('max-width', 'none', 'important');
        v.style.setProperty('max-height', 'none', 'important');
        v.style.setProperty('object-fit', currentFitCss, 'important');
        v.style.setProperty('object-position', 'center center', 'important');
        if (v.paused && !window._agyUserPaused && !window._agyInitialPlayDone) {
          window._agyInitialPlayDone = true;
          v.play().catch(function() {});
        }
      });

      var pbSelectors = [
        'yt-progress-bar',
        '.watch-page-progress-bar',
        '.ytPlayerProgressBarHost',
        '.ytPlayerProgressBarHostLowerPlayer',
        '.ytPlayerProgressBarHostBottomEdge',
        '.ytPlayerProgressBarHostBottomInset',
        '.ytPlayerProgressBarHostCustom',
        '.ytPlayerProgressBarDragContainer',
        '.ytPlayerProgressBarProgressBar',
        '.ytPlayerProgressBarProgressBarInset',
        '.ytChapteredProgressBarHost',
        '.ytFocusedChapterProgressBarLineHost',
        '.ytProgressBarLineHost',
        '.yt-progress-bar-line',
        '.yt-chaptered-progress-bar-line',
        '.yt-focused-chapter-progress-bar-line',
        '.ytp-chrome-bottom',
        '.ytp-progress-bar-container',
        '.ytp-progress-bar',
        '.ytp-progress-list',
        '.ytp-play-progress',
        '.ytp-load-progress',
        '.ytp-hover-progress',
        '.ytm-progress-bar',
        'ytm-progress-bar',
        '.thin-scrubber'
      ];
      pbSelectors.forEach(function(sel) {
        document.querySelectorAll(sel).forEach(function(el) {
          el.style.setProperty('display', 'none', 'important');
          el.style.setProperty('visibility', 'hidden', 'important');
          el.style.setProperty('height', '0px', 'important');
          el.style.setProperty('opacity', '0', 'important');
          try { el.remove(); } catch(e) {}
        });
      });

      var player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
      if (player) {
        try {
          if (typeof player.unMute === 'function') player.unMute();
          if (typeof player.setVolume === 'function') player.setVolume(100);
          if (typeof player.setPlaybackQualityRange === 'function') {
            player.setPlaybackQualityRange('large', 'hd720');
          }
          if (typeof player.setPlaybackQuality === 'function') {
            player.setPlaybackQuality('large');
          }
          if (typeof player.playVideo === 'function' && !window._agyUserPaused && !window._agyInitialPlayDone) {
            window._agyInitialPlayDone = true;
            player.playVideo();
          }
        } catch(e) {}
      }

      var unmuteBtn = document.querySelector('.ytp-unmute, .ytp-unmute-inner, [class*="unmute"], button[aria-label*="unmute" i]');
      if (unmuteBtn) {
        try { unmuteBtn.click(); } catch(e) {}
      }

      var playBtn = document.querySelector('.ytp-large-play-button, .player-control-play-pause-icon');
      if (playBtn && document.querySelector('video') && document.querySelector('video').paused && !window._agyUserPaused && !window._agyInitialPlayDone) {
        window._agyInitialPlayDone = true;
        try { playBtn.click(); } catch(e) {}
      }

      attachVideoListeners();
      setupBackgroundKeepAlive();
      syncControlsVisibility();
      runAdSkipper();
    }

    function isAdActive() {
      var moviePlayer = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
      if (moviePlayer) {
        var cls = (typeof moviePlayer.className === 'string') ? moviePlayer.className : '';
        if (cls.indexOf('ad-showing') !== -1 || cls.indexOf('ad-interrupting') !== -1) {
          return true;
        }
        if (typeof moviePlayer.getProgressState === 'function') {
          try {
            var ps = moviePlayer.getProgressState();
            if (ps && ps.isAd) return true;
          } catch(e) {}
        }
      }
      var activeAd = document.querySelector('.ad-showing, .ad-interrupting, .ytp-ad-player-overlay, ytm-ad-preview-renderer');
      return !!activeAd;
    }

    function runAdSkipper() {
      var isAd = isAdActive();

      var skipSelectors = [
        '.ytp-ad-skip-button',
        '.ytp-ad-skip-button-modern',
        '.ytp-skip-ad-button',
        '.ytp-ad-skip-button-text',
        '.videoAdUiSkipButton',
        '.ytm-ad-skip-button',
        'button.ytp-ad-skip-button',
        'button[class*="skip-button"]',
        '[class*="ad-skip"] button',
        '[class*="skip-ad"]',
        '.ytp-ad-skip-button-slot',
        'button[id*="skip"]',
        '.ytp-ad-text[class*="skip"]',
        '[aria-label*="Skip ad" i]',
        '[aria-label*="Skip" i]'
      ];

      var foundSkip = false;
      for (var s = 0; s < skipSelectors.length; s++) {
        var btns = document.querySelectorAll(skipSelectors[s]);
        for (var b = 0; b < btns.length; b++) {
          var btn = btns[b];
          if (btn && (btn.offsetWidth > 0 || btn.offsetHeight > 0 || (btn.getClientRects && btn.getClientRects().length > 0))) {
            foundSkip = true;
            try {
              btn.click();
              btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            } catch(e) {}
          }
        }
      }

      if (!isAd && foundSkip) {
        isAd = true;
      }

      var moviePlayer = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
      if (isAd && moviePlayer && typeof moviePlayer.skipAd === 'function') {
        try { moviePlayer.skipAd(); } catch(e) {}
      }

      if (window._agyLastAdState !== isAd) {
        window._agyLastAdState = isAd;
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'AD_STATE',
            isAd: isAd,
            canSkip: foundSkip
          }));
        }
      }

      var video = document.querySelector('video');
      if (video) {
        if (isAd) {
          try {
            video.muted = true;
            try { video.playbackRate = 16.0; } catch(err) {
              try { video.playbackRate = 2.0; } catch(err2) {}
            }
            if (!isNaN(video.duration) && isFinite(video.duration) && video.duration > 0) {
              video.currentTime = video.duration;
            }
          } catch(e) {}
        } else {
          if (video.playbackRate > 2.0) {
            video.playbackRate = window.__userDesiredPlaybackRate || 1.0;
          }
          if (video.muted && !window._agyUserMuted) {
            video.muted = false;
          }
        }
      }
    }

    forceFullVideoAndPlay();
    setInterval(runAdSkipper, 150);

    var count = 0;
    var initTimer = setInterval(function() {
      count++;
      forceFullVideoAndPlay();
      if (count > 8) clearInterval(initTimer);
    }, 300);

    var mutationTimer = null;
    var observer = new MutationObserver(function() {
      if (mutationTimer) return;
      mutationTimer = setTimeout(function() {
        mutationTimer = null;
        injectStyle();
        runAdSkipper();
        attachVideoListeners();
        setupBackgroundKeepAlive();

        var unmute = document.querySelector('.ytp-unmute, .ytp-unmute-inner, [class*="unmute"]');
        if (unmute) {
          try { unmute.click(); unmute.remove(); } catch(e) {}
        }
        var secondaryBars = document.querySelectorAll('.ytm-progress-bar, ytm-progress-bar, .player-control-overlay .progress-bar, .thin-scrubber');
        secondaryBars.forEach(function(el) {
          el.style.setProperty('display', 'none', 'important');
        });
        var popups = document.querySelectorAll(
          '.ytp-popup, .ytp-settings-menu, ytm-bottom-sheet-renderer, ' +
          '.ytm-menu-item-section-renderer, ytm-menu-popup-renderer, .ytp-panel-menu, ytm-menu-renderer'
        );
        if (popups.length > 0) {
          popups.forEach(function(p) {
            p.style.setProperty('display', 'none', 'important');
            try { p.remove(); } catch(err) {}
          });
        }
      }, 400);
    });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  })();
  true;
  `;
}

export const INJECTED_CLEAN_PLAYER_JS = getInjectedCleanPlayerJs(0);

export const YouTubeInlinePlayer: React.FC<YouTubeInlinePlayerProps> = ({

  videoId,
  title,
  channel,
  streamUrl,
  poster,
  isPlaying,
  isBuffering,
  currentTime,
  duration,
  seekTarget,
  playbackError,
  currentQuality = '480p',
  playbackSpeed = 1.0,
  isLooping = false,
  availableQualities = ['Auto', '1080p', '720p', '480p', '360p'],
  onChangeQuality,
  onSetPlaybackSpeed,
  onToggleLoop,
  isPipEnabled: propPipEnabled,
  onTogglePip,
  onTogglePlay,
  onPlay,
  onPause,
  onMinimize,
  onFullScreen,
  onSeek,
  onClearSeekTarget,
  onProgress,
  setIsBuffering,
  onPlaybackError,
  onRetry,
  onSwipeExit,
  screenFitMode,
  onScreenFitChange,
  topInset,
  isFullScreen = false,
  captionTracks,
}) => {
  const effectiveTopInset = Math.max(topInset || 0, Platform.OS === 'ios' ? 44 : 24);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [deviceOrientation, setDeviceOrientation] = useState<'portrait' | 'landscape'>(() => {
    const dim = Dimensions.get('window');
    return isFullScreen || dim.width > dim.height ? 'landscape' : 'portrait';
  });

  useEffect(() => {
    const updateOrientation = () => {
      const dim = Dimensions.get('window');
      const screenDim = Dimensions.get('screen');
      const isL = isFullScreen || dim.width > dim.height || screenDim.width > screenDim.height;
      setDeviceOrientation(isL ? 'landscape' : 'portrait');
    };
    updateOrientation();
    const sub = Dimensions.addEventListener('change', updateOrientation);
    return () => sub?.remove();
  }, [isFullScreen]);

  const isLandscapeLayout = Boolean(
    isFullScreen ||
    windowWidth > windowHeight ||
    deviceOrientation === 'landscape' ||
    Dimensions.get('window').width > Dimensions.get('window').height ||
    Dimensions.get('screen').width > Dimensions.get('screen').height
  );

  const [showControls, setShowControls] = useState(false);
  const [videoResizeMode, setVideoResizeMode] = useState<ScreenFitMode>(screenFitMode || 'hero');
  const [feedbackPill, setFeedbackPill] = useState<FeedbackPillData | null>(null);
  const feedbackTimerRef = useRef<any>(null);
  const isFullScreenRef = useRef(isFullScreen);

  const videoRef = useRef<VideoRef>(null);
  const ksRef = useRef<KSPlayerRef>(null);
  const webViewRef = useRef<any>(null);

  // Safe helper to inject JavaScript into WebView with defensive null checks and error handling
  const safeInjectJS = useCallback((js: string) => {
    try {
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(js);
      }
    } catch (err) {
      console.warn('[YouTubeInlinePlayer] safeInjectJS error:', err);
    }
  }, []);
  useEffect(() => {
    isFullScreenRef.current = isFullScreen;
  }, [isFullScreen]);

  const triggerFeedbackPill = useCallback((label: string, icon: keyof typeof Ionicons.glyphMap) => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setFeedbackPill({ label, icon });
    feedbackTimerRef.current = setTimeout(() => {
      setFeedbackPill(null);
    }, 1500);
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (isSlidingRef.current) return false;
          const { dx, dy } = gestureState;
          return Math.abs(dy) > 20 && Math.abs(dy) > Math.abs(dx) * 1.3;
        },
        onMoveShouldSetPanResponderCapture: (_, gestureState) => {
          if (isSlidingRef.current) return false;
          const { dx, dy } = gestureState;
          return Math.abs(dy) > 20 && Math.abs(dy) > Math.abs(dx) * 1.3;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (isSlidingRef.current) return;
          const { dx, dy } = gestureState;
          const absX = Math.abs(dx);
          const absY = Math.abs(dy);

          // Calibrated vertical swipe gesture (at least 35px vertical travel)
          if (absY > 35 && absY > absX * 1.2) {
            if (dy < 0) {
              // ⬆️ Swipe Up: Enter Fullscreen
              if (!isFullScreenRef.current) {
                if (isHapticsSupported()) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }
                triggerFeedbackPill('Full screen', 'scan-outline');
                onFullScreen(true);
              }
            } else {
              // ⬇️ Swipe Down: Exit Fullscreen back to normal mode
              if (isFullScreenRef.current) {
                if (isHapticsSupported()) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }
                triggerFeedbackPill('Exit full screen', 'contract-outline');
                onFullScreen(false);
              } else {
                // In normal inline mode, swipe down minimizes the player
                if (isHapticsSupported()) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                onMinimize();
              }
            }
          }
        },
      }),
    [onFullScreen, onMinimize, triggerFeedbackPill]
  );
  const isSlidingRef = useRef(false);
  const [isSliding, setIsSliding] = useState(false);
  const [sliderPos, setSliderPos] = useState(0);
  // Default to react-native-video (AVPlayer on iOS, ExoPlayer on Android) for native MP4 streaming
  const [useKSPlayer, setUseKSPlayer] = useState(false);
  const [useWebFallback, setUseWebFallback] = useState(false);
  const [showPosterShield, setShowPosterShield] = useState(true);
  const [isAdPlaying, setIsAdPlaying] = useState<boolean>(false);

  const lastWebCommandPlayingRef = useRef<boolean | null>(null);

  useEffect(() => {
    setShowPosterShield(true);
    setIsAdPlaying(false);
    setUseWebFallback(false);
    setWebCurrentTime(0);
    setWebDuration(0);
    setWebIsPlaying(true);
    lastWebCommandPlayingRef.current = null;
    setSliderPos(0);
    setIsSliding(false);
    isSlidingRef.current = false;
  }, [videoId]);

  const handleManualSkipAd = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const skipJs = `
      (function() {
        var moviePlayer = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
        if (moviePlayer && typeof moviePlayer.skipAd === 'function') {
          try { moviePlayer.skipAd(); } catch(e) {}
        }
        var skipSelectors = [
          '.ytp-ad-skip-button',
          '.ytp-ad-skip-button-modern',
          '.ytp-skip-ad-button',
          '.ytp-ad-skip-button-text',
          '.videoAdUiSkipButton',
          '.ytm-ad-skip-button',
          'button.ytp-ad-skip-button',
          'button[class*="skip-button"]',
          '[class*="ad-skip"] button',
          '[class*="skip-ad"]',
          '.ytp-ad-skip-button-slot',
          'button[id*="skip"]',
          '.ytp-ad-text[class*="skip"]',
          '[aria-label*="Skip ad" i]',
          '[aria-label*="Skip" i]',
          '[title*="Skip ad" i]',
          '[title*="Skip" i]'
        ];
        for (var i = 0; i < skipSelectors.length; i++) {
          var btns = document.querySelectorAll(skipSelectors[i]);
          for (var j = 0; j < btns.length; j++) {
            try {
              btns[j].click();
              btns[j].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            } catch(e) {}
          }
        }
        var v = document.querySelector('video');
        if (v) {
          try {
            if (!isNaN(v.duration) && isFinite(v.duration) && v.duration > 0) {
              v.currentTime = v.duration;
            }
            v.muted = false;
            v.playbackRate = window.__userDesiredPlaybackRate || 1.0;
          } catch(e) {}
        }
      })();
      true;
    `;
    safeInjectJS(skipJs);
    setTimeout(() => {
      setIsAdPlaying(false);
    }, 400);
  }, [safeInjectJS]);

  // Seamless auto-fallback: if direct stream fails (e.g. 403 or engine starting), immediately play via web player
  
  useEffect(() => {
    if (!streamUrl && videoId && !useWebFallback) {
      const timer = setTimeout(() => {
        console.log('[YouTubeInlinePlayer] ⏱️ Engine stream pending, seamlessly playing via clean Web Player');
        setUseWebFallback(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [streamUrl, videoId, useWebFallback]);

  useEffect(() => {
    if (playbackError && videoId) {
      console.log('[YouTubeInlinePlayer] 🔄 Error encountered, seamlessly auto-playing via Web Player:', playbackError);
      setUseWebFallback(true);
    }
  }, [playbackError, videoId]);

  const handleOpenYouTubeApp = useCallback(async () => {
    if (!videoId) return;
    const appUrl = `vnd.youtube://${videoId}`;
    const webUrl = `https://www.youtube.com/watch?v=${videoId}`;
    try {
      const canOpen = await Linking.canOpenURL(appUrl);
      if (canOpen) {
        await Linking.openURL(appUrl);
      } else {
        await Linking.openURL(webUrl);
      }
    } catch {
      await Linking.openURL(webUrl);
    }
  }, [videoId]);

  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [settingsSubView, setSettingsSubView] = useState<'main' | 'quality' | 'speed' | 'screenfit' | 'pip'>('main');

  // PiP state (persisted in StorageService, defaults to enabled)
  const [internalPipEnabled, setInternalPipEnabled] = useState<boolean>(() => {
    try {
      const saved = storageService.getItem(StorageKeys.YOUTUBE_PIP_ENABLED_KEY);
      return saved !== undefined ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const isPipEnabled = propPipEnabled !== undefined ? propPipEnabled : internalPipEnabled;
  const [isPipActive, setIsPipActive] = useState<boolean>(false);

  // Web player state for fallback mode
  const [webCurrentTime, setWebCurrentTime] = useState(0);
  const [webDuration, setWebDuration] = useState(0);
  const [webIsPlaying, setWebIsPlaying] = useState(true);
  const [webQuality, setWebQuality] = useState('Auto');
  const [webSpeed, setWebSpeed] = useState(1.0);
  const [webLoop, setWebLoop] = useState(false);
  const [webResizeMode, setWebResizeMode] = useState<ScreenFitMode>(screenFitMode || 'hero');
  const [modalSliderPos, setModalSliderPos] = useState<number | null>(null);

  const isWebActive = (useWebFallback || (playbackError && !streamUrl)) && !!videoId;

  useEffect(() => {
    if (screenFitMode) {
      setVideoResizeMode(screenFitMode);
      setWebResizeMode(screenFitMode);
      if (isWebActive) {
        const fitCss = screenFitMode === 'contain' ? 'contain' : screenFitMode === 'stretch' ? 'fill' : 'cover';
        safeInjectJS(`
          (function() {
            var v = document.querySelector('video');
            if (v) v.style.setProperty('object-fit', '${fitCss}', 'important');
          })();
          true;
        `);
      }
    }
  }, [screenFitMode, isWebActive, safeInjectJS]);
  const effectiveCurrentTime = isWebActive ? (webCurrentTime || currentTime) : currentTime;
  const effectiveDuration = isWebActive ? (webDuration || duration) : duration;
  const effectiveIsPlaying = isWebActive ? webIsPlaying : isPlaying;
  const effectiveQuality = isWebActive ? webQuality : (currentQuality || 'Auto');
  const effectiveSpeed = isWebActive ? webSpeed : (playbackSpeed || 1.0);
  const effectiveLoop = isWebActive ? webLoop : isLooping;
  const effectiveResizeMode = isWebActive ? webResizeMode : videoResizeMode;

  // Track app active state to manage keep-awake and prevent screen lock freezes
  const isAppActiveRef = useRef<boolean>(AppState.currentState === 'active');
  const wasPlayingBeforeLockRef = useRef<boolean>(effectiveIsPlaying);

  // Dynamically manage keep-awake: only keep screen awake while actively playing in foreground
  useEffect(() => {
    if (effectiveIsPlaying && isAppActiveRef.current) {
      activateKeepAwakeAsync('YOUTUBE_PLAYER_PLAYBACK').catch(() => {});
    } else {
      deactivateKeepAwake('YOUTUBE_PLAYER_PLAYBACK').catch(() => {});
    }
    return () => {
      deactivateKeepAwake('YOUTUBE_PLAYER_PLAYBACK').catch(() => {});
    };
  }, [effectiveIsPlaying]);

  // Clean lifecycle handling for screen lock / unlock without deadlocks or crashes
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const isNowActive = nextState === 'active';
      const prevActive = isAppActiveRef.current;
      isAppActiveRef.current = isNowActive;

      if (!isNowActive && prevActive) {
        // Device locked or app backgrounded
        console.log(`[YouTubeInlinePlayer] 📱 App transitioned to ${nextState} (screen lock or background)`);
        wasPlayingBeforeLockRef.current = effectiveIsPlaying;
        deactivateKeepAwake('YOUTUBE_PLAYER_PLAYBACK').catch(() => {});

        // NOTE: We deliberately do NOT trigger PiP presentation here during screen lock!
        // Calling webkitSetPresentationMode or enterPictureInPicture while device is locking causes
        // WKWebView and AVKit to deadlock or crash the render process.
      } else if (isNowActive && !prevActive) {
        // Device unlocked or app foregrounded
        console.log('[YouTubeInlinePlayer] 📱 App returned to active (screen unlocked)');
        if (effectiveIsPlaying) {
          activateKeepAwakeAsync('YOUTUBE_PLAYER_PLAYBACK').catch(() => {});
        }

        // Restore playback smoothly if it was playing before lock
        if (wasPlayingBeforeLockRef.current) {
          if (isWebActive) {
            safeInjectJS(`
              (function() {
                try {
                  var v = document.querySelector('video');
                  if (v && v.paused && !window._agyUserPaused) {
                    var p = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
                    if (p && typeof p.playVideo === 'function') {
                      p.playVideo();
                    } else {
                      v.play().catch(function() {});
                    }
                  }
                } catch(e) {}
              })();
              true;
            `);
          } else if (videoRef.current) {
            if (!isPlaying && onPlay) {
              onPlay();
            }
          }
        }
      }
    });

    return () => sub.remove();
  }, [effectiveIsPlaying, isWebActive, isPlaying, onPlay, safeInjectJS]);

  // Modal seek & progress handlers
  const handleSeekFromModal = useCallback((targetSec: number) => {
    if (isWebActive) {
      setWebCurrentTime(targetSec);
      safeInjectJS(`
        (function() {
          var p = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
          var v = document.querySelector('video');
          if (p && typeof p.seekTo === 'function') {
            p.seekTo(${targetSec}, true);
          } else if (v) {
            v.currentTime = ${targetSec};
          }
        })();
        true;
      `);
      onProgress(targetSec, effectiveDuration);
    } else {
      onSeek(targetSec);
    }
  }, [isWebActive, effectiveDuration, onProgress, onSeek, safeInjectJS]);

  // SponsorBlock integration: automatically skip creator-embedded sponsor shoutouts
  const [sponsorSegments, setSponsorSegments] = useState<SponsorSegment[]>([]);
  const lastSkippedSponsorEndRef = useRef<number>(-1);

  useEffect(() => {
    lastSkippedSponsorEndRef.current = -1;
    if (!videoId) {
      setSponsorSegments([]);
      return;
    }
    let isSubscribed = true;
    youTubeService
      .getSponsorSegments(videoId)
      .then((segs) => {
        if (isSubscribed && Array.isArray(segs) && segs.length > 0) {
          console.log(`[YouTubeInlinePlayer] 🛡️ Loaded ${segs.length} sponsor segment(s) for ${videoId}`);
          setSponsorSegments(segs);
        }
      })
      .catch(() => {});
    return () => {
      isSubscribed = false;
    };
  }, [videoId]);

  const checkSponsorSkip = useCallback(
    (cTime: number) => {
      if (!sponsorSegments || sponsorSegments.length === 0 || isSlidingRef.current) return;
      for (const seg of sponsorSegments) {
        if (seg.category === 'sponsor' || seg.category === 'selfpromo' || seg.category === 'interaction') {
          const [start, end] = seg.segment;
          if (cTime >= start && cTime < end - 0.5) {
            if (lastSkippedSponsorEndRef.current === end) return;
            lastSkippedSponsorEndRef.current = end;
            console.log(`[YouTubeInlinePlayer] ⚡ Auto-skipping sponsor segment: ${start.toFixed(1)}s -> ${end.toFixed(1)}s`);
            if (isWebActive) {
              handleSeekFromModal(end);
            } else {
              onSeek(end);
            }
            setFeedbackPill({ label: '⚡ Skipped Sponsor', icon: 'shield-checkmark-outline' });
            setTimeout(() => setFeedbackPill(null), 2500);
            break;
          }
        }
      }
    },
    [sponsorSegments, isWebActive, handleSeekFromModal, onSeek]
  );

  const handleSkipFromModal = useCallback(async (deltaSec: number) => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const newTime = Math.max(0, Math.min(effectiveDuration || 1, effectiveCurrentTime + deltaSec));
    handleSeekFromModal(newTime);
  }, [effectiveDuration, effectiveCurrentTime, handleSeekFromModal]);

  const handleTogglePlay = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (isWebActive) {
      const nextPlaying = !effectiveIsPlaying;
      setWebIsPlaying(nextPlaying);
      lastWebCommandPlayingRef.current = nextPlaying;
      if (nextPlaying) {
        if (onPlay) onPlay(); else onTogglePlay();
      } else {
        if (onPause) onPause(); else onTogglePlay();
      }
      safeInjectJS(`
        (function() {
          var v = document.querySelector('video');
          var p = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
          window._agyUserPaused = ${!nextPlaying};
          if (${nextPlaying}) {
            if (p && typeof p.playVideo === 'function') {
              try { p.playVideo(); } catch(e) {}
            }
            if (v && v.paused) {
              v.play().catch(function() {});
            }
          } else {
            if (p && typeof p.pauseVideo === 'function') {
              try { p.pauseVideo(); } catch(e) {}
            }
            if (v && !v.paused) {
              v.pause();
            }
          }
        })();
        true;
      `);
    } else {
      if (effectiveIsPlaying) {
        if (onPause) onPause(); else onTogglePlay();
      } else {
        if (onPlay) onPlay(); else onTogglePlay();
      }
    }
  }, [isWebActive, effectiveIsPlaying, onPlay, onPause, onTogglePlay, safeInjectJS]);

  const handleTogglePlayFromModal = handleTogglePlay;

  const handleChangeQualityFromModal = useCallback((q: string) => {
    try {
      if (isWebActive) {
        setWebQuality(q);
        const qMap: Record<string, string> = {
          '1080p': 'hd1080',
          '720p': 'hd720',
          '480p': 'large',
          '360p': 'medium',
          '240p': 'small',
          '144p': 'tiny',
          'Auto': 'auto',
        };
        const targetQ = qMap[q] || 'auto';
        safeInjectJS(`
          (function() {
            try {
              var p = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
              if (p) {
                if (typeof p.setPlaybackQualityRange === 'function') {
                  p.setPlaybackQualityRange('${targetQ}', '${targetQ}');
                }
                if (typeof p.setPlaybackQuality === 'function') {
                  p.setPlaybackQuality('${targetQ}');
                }
              }
            } catch(e) {}
          })();
          true;
        `);
      } else {
        onChangeQuality?.(q);
      }
    } catch (err) {
      console.warn('[YouTubeInlinePlayer] Error changing quality:', err);
    }
  }, [isWebActive, onChangeQuality, safeInjectJS]);

  const handleSetSpeedFromModal = useCallback((speed: number) => {
    if (isWebActive) {
      setWebSpeed(speed);
      safeInjectJS(`
        (function() {
          var p = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
          var v = document.querySelector('video');
          if (p && typeof p.setPlaybackRate === 'function') {
            p.setPlaybackRate(${speed});
          }
          window.__userDesiredPlaybackRate = ${speed};
          if (v) {
            v.playbackRate = ${speed};
          }
        })();
        true;
      `);
      onSetPlaybackSpeed?.(speed);
    } else {
      onSetPlaybackSpeed?.(speed);
    }
  }, [isWebActive, onSetPlaybackSpeed, safeInjectJS]);

  const handleToggleLoopFromModal = useCallback(() => {
    if (isWebActive) {
      setWebLoop((prev) => {
        const next = !prev;
        safeInjectJS(`
          (function() {
            var v = document.querySelector('video');
            if (v) v.loop = ${next};
          })();
          true;
        `);
        return next;
      });
      onToggleLoop?.();
    } else {
      onToggleLoop?.();
    }
  }, [isWebActive, onToggleLoop]);

  const handleTriggerPiP = useCallback(async () => {
    try {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (_) {}

    if (!isPipEnabled) {
      setInternalPipEnabled(true);
      try {
        storageService.setItem(StorageKeys.YOUTUBE_PIP_ENABLED_KEY, 'true');
      } catch (e) {}
      onTogglePip?.(true);
    }

    if (isWebActive) {
      safeInjectJS(`
        (function() {
          try {
            var v = document.querySelector('video');
            if (v) {
              if (v.webkitSetPresentationMode) {
                v.webkitSetPresentationMode('picture-in-picture');
              } else if (document.pictureInPictureEnabled && !document.pictureInPictureElement) {
                v.requestPictureInPicture().catch(function(){});
              }
            }
          } catch(e) {}
        })();
        true;
      `);
    } else if (videoRef.current) {
      try {
        if (isPipActive) {
          videoRef.current.exitPictureInPicture();
        } else {
          videoRef.current.enterPictureInPicture();
        }
      } catch (e) {
        console.warn('[YouTubeInlinePlayer] PiP toggle error:', e);
      }
    }
  }, [isPipEnabled, isWebActive, isPipActive, onTogglePip, safeInjectJS]);

  const handleTogglePipFromModal = useCallback(async (explicitValue?: boolean) => {
    const nextVal = explicitValue !== undefined ? explicitValue : !isPipEnabled;
    try {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (_) {}

    setInternalPipEnabled(nextVal);
    try {
      storageService.setItem(StorageKeys.YOUTUBE_PIP_ENABLED_KEY, String(nextVal));
    } catch (e) {
      console.warn('[YouTubeInlinePlayer] Failed to save PiP state to storage:', e);
    }
    onTogglePip?.(nextVal);

    if (nextVal) {
      if (isWebActive) {
        safeInjectJS(`
          (function() {
            window.__agyPipEnabled = true;
            try {
              var v = document.querySelector('video');
              if (v) {
                if (v.webkitSetPresentationMode) {
                  v.webkitSetPresentationMode('picture-in-picture');
                } else if (document.pictureInPictureEnabled && !document.pictureInPictureElement) {
                  v.requestPictureInPicture().catch(function(){});
                }
              }
            } catch(e) {}
          })();
          true;
        `);
      } else if (videoRef.current) {
        try {
          videoRef.current.enterPictureInPicture();
        } catch (e) {
          console.warn('[YouTubeInlinePlayer] enterPictureInPicture error:', e);
        }
      }
    } else {
      if (isWebActive) {
        safeInjectJS(`
          (function() {
            window.__agyPipEnabled = false;
            try {
              if (document.pictureInPictureElement) {
                document.exitPictureInPicture().catch(function(){});
              } else {
                var v = document.querySelector('video');
                if (v && v.webkitSetPresentationMode) {
                  v.webkitSetPresentationMode('inline');
                }
              }
            } catch(e) {}
          })();
          true;
        `);
      } else if (videoRef.current) {
        try {
          videoRef.current.exitPictureInPicture();
        } catch (e) {}
      }
    }
  }, [isPipEnabled, isWebActive, onTogglePip, safeInjectJS]);



  const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

  const playerHeaders: Record<string, string> = useMemo(() => {
    const headers: Record<string, string> = {};
    if (streamUrl?.includes('googlevideo.com')) {
      headers['User-Agent'] = Platform.OS === 'ios'
        ? 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X; en_US)'
        : 'com.google.android.youtube/19.29.37 (Linux; U; Android 14; en_US)';
      headers['Accept'] = '*/*';
    }
    return headers;
  }, [streamUrl]);

  const hideTimerRef = useRef<any>(null);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Sync React Native isPlaying state down to the web player
  useEffect(() => {
    if (isWebActive) {
      if (lastWebCommandPlayingRef.current === isPlaying) return;
      lastWebCommandPlayingRef.current = isPlaying;
      safeInjectJS(`
        (function() {
          try {
            var v = document.querySelector('video');
            var p = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
            if (${isPlaying}) {
              window._agyUserPaused = false;
              if (p && typeof p.playVideo === 'function') {
                try { p.playVideo(); } catch(e) {}
              }
              if (v && v.paused) v.play().catch(function() {});
            } else {
              window._agyUserPaused = true;
              if (p && typeof p.pauseVideo === 'function') {
                try { p.pauseVideo(); } catch(e) {}
              }
              if (v && !v.paused) v.pause();
            }
          } catch(e) {}
        })();
        true;
      `);
    }
  }, [isPlaying, isWebActive, safeInjectJS]);

  // Sync MediaMetadata to system Lock Screen & Control Center
  useEffect(() => {
    if (isWebActive && (title || channel || poster)) {
      const metaJs = `
        (function() {
          try {
            if ('mediaSession' in navigator && window.MediaMetadata) {
              navigator.mediaSession.metadata = new MediaMetadata({
                title: ${JSON.stringify(title || 'YouTube Video')},
                artist: ${JSON.stringify(channel || 'YouTube')},
                album: 'VStream Online',
                artwork: [
                  { src: ${JSON.stringify(poster || '')}, sizes: '512x512', type: 'image/jpeg' }
                ]
              });
            }
          } catch(e) {}
        })();
        true;
      `;
      safeInjectJS(metaJs);
    }
  }, [title, channel, poster, isWebActive, safeInjectJS]);
  // Initially hide controls when a new video stream loads
  useEffect(() => {
    setShowControls(false);
  }, [streamUrl]);

  useEffect(() => {
    console.log('[YouTubeInlinePlayer] 🎬 streamUrl:', streamUrl ? streamUrl.substring(0, 85) + '...' : 'null');
    console.log('[YouTubeInlinePlayer] 📱 Platform:', Platform.OS, '| Engine:', useKSPlayer ? 'KSPlayer (fallback)' : 'react-native-video (AVPlayer/ExoPlayer)');
    console.log('[YouTubeInlinePlayer] ⏯️ isPlaying:', isPlaying, '| isBuffering:', isBuffering, '| Error:', playbackError || 'none');
  }, [streamUrl, isPlaying, isBuffering, useKSPlayer, playbackError]);

  // Reset auto-hide timer
  const scheduleControlsHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!isSlidingRef.current) {
        setShowControls(false);
      }
    }, 3500);
  }, []);

  const cycleScreenFitMode = useCallback((current: ScreenFitMode): ScreenFitMode => {
    switch (current) {
      case 'cover':
        return 'hero';
      case 'hero':
        return 'contain';
      case 'contain':
        return 'stretch';
      case 'stretch':
      default:
        return 'cover';
    }
  }, []);

  const applyScreenFitMode = useCallback(
    async (next: ScreenFitMode) => {
      if (await isHapticsSupported()) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setVideoResizeMode(next);
      setWebResizeMode(next);
      try {
        storageService.setItem('@youtube_screen_fit_mode', next);
      } catch (_) {}
      onScreenFitChange?.(next);

      if (isWebActive) {
        const fitCss = next === 'contain' ? 'contain' : next === 'stretch' ? 'fill' : 'cover';
        safeInjectJS(`
          (function() {
            try {
              window.__agyDesiredFitMode = '${next}';
              var fit = '${fitCss}';
              var allVids = document.querySelectorAll('video');
              allVids.forEach(function(v) {
                v.style.setProperty('position', 'absolute', 'important');
                v.style.setProperty('top', '0px', 'important');
                v.style.setProperty('left', '0px', 'important');
                v.style.setProperty('right', '0px', 'important');
                v.style.setProperty('bottom', '0px', 'important');
                v.style.setProperty('width', '100%', 'important');
                v.style.setProperty('height', '100%', 'important');
                v.style.setProperty('max-width', 'none', 'important');
                v.style.setProperty('max-height', 'none', 'important');
                v.style.setProperty('object-fit', fit, 'important');
                v.style.setProperty('object-position', 'center center', 'important');
              });
              window.dispatchEvent(new Event('resize'));
              window.dispatchEvent(new Event('orientationchange'));
            } catch(e) {}
          })();
          true;
        `);
      }

      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      let label = 'Fit to Screen (Fill)';
      let icon: keyof typeof Ionicons.glyphMap = 'expand-outline';
      if (next === 'stretch') {
        label = 'Stretch to Screen';
        icon = 'scan-outline';
      } else if (next === 'contain') {
        label = 'Original (Fit)';
        icon = 'contract-outline';
      } else if (next === 'hero') {
        label = 'Hero Banner';
        icon = 'film-outline';
      }
      setFeedbackPill({ label, icon, mode: next });
      feedbackTimerRef.current = setTimeout(() => {
        setFeedbackPill(null);
      }, 1800);

      scheduleControlsHide();
    },
    [isWebActive, onScreenFitChange, scheduleControlsHide]
  );

  const handleToggleResizeMode = useCallback(async () => {
    const next = cycleScreenFitMode(effectiveResizeMode);
    await applyScreenFitMode(next);
  }, [effectiveResizeMode, cycleScreenFitMode, applyScreenFitMode]);

  const handleToggleResizeModeFromModal = useCallback(async () => {
    await handleToggleResizeMode();
  }, [handleToggleResizeMode]);

  const [isAutoplay, setIsAutoplay] = useState(true);
  const [isCCOn, setIsCCOn] = useState<boolean>(() => {
    try {
      return storageService.getItem('@youtube_cc_enabled') === 'true';
    } catch {
      return false;
    }
  });

  const [nativeSubtitleCues, setNativeSubtitleCues] = useState<SubtitleCue[]>([]);

  useEffect(() => {
    if (!captionTracks || captionTracks.length === 0) {
      setNativeSubtitleCues([]);
      return;
    }
    const track =
      captionTracks.find(
        (t) => t.languageCode === 'en' || (t.name && t.name.toLowerCase().includes('english'))
      ) || captionTracks[0];

    if (!track?.baseUrl) {
      setNativeSubtitleCues([]);
      return;
    }

    let cancelled = false;
    const fetchSubtitles = async () => {
      try {
        let url = track.baseUrl;
        if (!url.includes('fmt=')) {
          url += '&fmt=vtt';
        }
        const res = await fetch(url);
        if (res.ok) {
          const text = await res.text();
          if (!cancelled) {
            const parsed = parseVttToCues(text);
            setNativeSubtitleCues(parsed);
          }
        }
      } catch (e) {
        console.warn('[YouTubeInlinePlayer] Could not fetch native subtitle track:', e);
      }
    };
    fetchSubtitles();
    return () => {
      cancelled = true;
    };
  }, [captionTracks, videoId]);

  useEffect(() => {
    if (isWebActive) {
      safeInjectJS(`
        (function() {
          if (typeof window.__agySetCaptionsEnabled === 'function') {
            window.__agySetCaptionsEnabled(${isCCOn});
          }
        })();
        true;
      `);
    }
  }, [isCCOn, isWebActive, videoId, safeInjectJS]);

  const handleToggleAutoplay = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsAutoplay((prev) => {
      const next = !prev;
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      setFeedbackPill({ label: next ? 'Autoplay is on' : 'Autoplay is off', icon: next ? 'play' : 'pause' });
      feedbackTimerRef.current = setTimeout(() => {
        setFeedbackPill(null);
      }, 1800);
      return next;
    });
    scheduleControlsHide();
  }, [scheduleControlsHide]);

  const handleToggleCC = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsCCOn((prev) => {
      const next = !prev;
      try {
        storageService.setItem('@youtube_cc_enabled', next ? 'true' : 'false');
      } catch {}

      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      setFeedbackPill({
        label: next ? 'Subtitles turned on' : 'Subtitles turned off',
        icon: 'chatbox-ellipses-outline',
      });
      feedbackTimerRef.current = setTimeout(() => {
        setFeedbackPill(null);
      }, 1800);

      if (isWebActive) {
        safeInjectJS(`
          (function() {
            if (typeof window.__agySetCaptionsEnabled === 'function') {
              window.__agySetCaptionsEnabled(${next});
            }
          })();
          true;
        `);
      }

      return next;
    });
    scheduleControlsHide();
  }, [isWebActive, scheduleControlsHide, safeInjectJS]);

  const handleToggleCCFromModal = useCallback(async () => {
    await handleToggleCC();
  }, [handleToggleCC]);

  const handleCastPress = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setFeedbackPill({ label: 'Searching for cast devices...', icon: 'tv-outline' });
    feedbackTimerRef.current = setTimeout(() => {
      setFeedbackPill(null);
    }, 1800);
    scheduleControlsHide();
  }, [scheduleControlsHide]);

  const handleToggleControls = useCallback(() => {
    setShowControls((prev) => {
      const next = !prev;
      if (next) scheduleControlsHide();
      return next;
    });
  }, [scheduleControlsHide]);

  useEffect(() => {
    if (effectiveIsPlaying && showControls && !isSliding) {
      scheduleControlsHide();
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [effectiveIsPlaying, showControls, isSliding, scheduleControlsHide]);

  // Handle seek target (native player)
  useEffect(() => {
    if (seekTarget !== null) {
      console.log('[YouTubeInlinePlayer] ⏩ Seeking player to:', seekTarget);
      if (useKSPlayer) {
        ksRef.current?.seek(seekTarget);
      } else {
        videoRef.current?.seek(seekTarget);
      }
      onClearSeekTarget();
    }
  }, [seekTarget, useKSPlayer, onClearSeekTarget]);

  // Seek forward / backward 10s
  const handleSkip = useCallback(
    (offsetSec: number) => {
      const current = isWebActive ? (webCurrentTime || currentTime) : currentTime;
      const total = isWebActive ? (webDuration || duration) : duration;
      const newTime = Math.max(0, Math.min(total || 1, current + offsetSec));
      console.log(`[YouTubeInlinePlayer] ⏩ Skip ${offsetSec}s -> new target: ${newTime}s`);
      if (isWebActive) {
        handleSeekFromModal(newTime);
      } else {
        onSeek(newTime);
      }
      scheduleControlsHide();
    },
    [isWebActive, webCurrentTime, webDuration, currentTime, duration, handleSeekFromModal, onSeek, scheduleControlsHide]
  );


  useEffect(() => {
    if (isWebActive) {
      const currentMode = videoResizeMode || screenFitMode || 'cover';
      const fitCss = currentMode === 'contain' ? 'contain' : currentMode === 'stretch' ? 'fill' : 'cover';
      safeInjectJS(`
        (function() {
          try {
            window.__agyDesiredFitMode = '${currentMode}';
            var fit = '${fitCss}';
            var allVids = document.querySelectorAll('video');
            allVids.forEach(function(v) {
              v.style.setProperty('position', 'absolute', 'important');
              v.style.setProperty('top', '0px', 'important');
              v.style.setProperty('left', '0px', 'important');
              v.style.setProperty('right', '0px', 'important');
              v.style.setProperty('bottom', '0px', 'important');
              v.style.setProperty('width', '100%', 'important');
              v.style.setProperty('height', '100%', 'important');
              v.style.setProperty('max-width', 'none', 'important');
              v.style.setProperty('max-height', 'none', 'important');
              v.style.setProperty('object-fit', fit, 'important');
              v.style.setProperty('object-position', 'center center', 'important');
            });
            window.dispatchEvent(new Event('resize'));
            window.dispatchEvent(new Event('orientationchange'));
          } catch(e) {}
        })();
        true;
      `);
    }
  }, [isFullScreen, videoResizeMode, screenFitMode, isWebActive, safeInjectJS]);

  const actualDuration = duration > 0 ? duration : (effectiveDuration > 0 ? effectiveDuration : 0);
  const actualCurrentTime = isWebActive ? (webCurrentTime || currentTime) : currentTime;
  const progressPct = actualDuration > 0 ? (isSliding ? sliderPos : Math.min(1, Math.max(0, actualCurrentTime / actualDuration))) : 0;

  const handleSlidingStart = useCallback((val: number) => {
    isSlidingRef.current = true;
    setIsSliding(true);
    setSliderPos(val);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  const handleSlidingChange = useCallback((val: number) => {
    isSlidingRef.current = true;
    setIsSliding(true);
    setSliderPos(val);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  const handleSlidingComplete = useCallback(
    (val: number) => {
      isSlidingRef.current = false;
      setIsSliding(false);
      setSliderPos(val);
      const targetSec = Math.max(0, Math.min(actualDuration, val * (actualDuration || 1)));
      if (isWebActive) {
        handleSeekFromModal(targetSec);
      } else {
        onSeek(targetSec);
      }
      scheduleControlsHide();
    },
    [actualDuration, isWebActive, handleSeekFromModal, onSeek, scheduleControlsHide]
  );

  const cleanPlayerJs = useMemo(
    () => getInjectedCleanPlayerJs(effectiveTopInset, videoResizeMode, isPipEnabled, effectiveLoop, isCCOn),
    [effectiveTopInset, videoResizeMode, isPipEnabled, effectiveLoop, isCCOn]
  );

  const isHeroMode = effectiveResizeMode === 'hero' && !isFullScreen;
  const heroHeight = Math.round((width * 9 / 16) + effectiveTopInset);

  return (
    <View
      style={[
        isFullScreen
          ? styles.containerFullScreen
          : isHeroMode
          ? [styles.containerHero, { height: heroHeight, width: '100%', maxWidth: '100%' }]
          : styles.container,
      ]}
      {...panResponder.panHandlers}
    >
      {isWebActive ? (
        <WebView
          ref={webViewRef}
          key={videoId}
          source={{
            uri: `https://m.youtube.com/watch?v=${videoId}`,
          }}
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: '#000000' },
          ]}
          containerStyle={{ backgroundColor: '#000000', width: '100%', height: '100%' }}
          opaque={false}
          injectedJavaScriptBeforeContentLoaded={INJECTED_BEFORE_CONTENT_JS}
          allowsInlineMediaPlayback={true}
          allowsPictureInPictureMediaPlayback={isPipEnabled}
          allowsAirPlayForMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsFullscreenVideo={false}
          scrollEnabled={false}
          bounces={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          injectedJavaScript={cleanPlayerJs}
          userAgent={
            Platform.OS === 'ios'
              ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
              : 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
          }
          onContentProcessDidTerminate={() => {
            console.warn('[YouTubeInlinePlayer] ⚠️ WKWebView WebContent process terminated! Auto-reloading to restore playback...');
            setIsBuffering(false);
            try {
              webViewRef.current?.reload();
            } catch (err) {}
          }}
          onRenderProcessGone={() => {
            console.warn('[YouTubeInlinePlayer] ⚠️ Android WebView render process gone! Auto-reloading...');
            setIsBuffering(false);
            try {
              webViewRef.current?.reload();
            } catch (err) {}
          }}
          onShouldStartLoadWithRequest={(request) => {
            const url = request.url.toLowerCase();
            if (
              url.startsWith('vnd.youtube') ||
              url.startsWith('intent://') ||
              url.startsWith('itms-appss://') ||
              url.includes('doubleclick.net') ||
              url.includes('googleads.g.doubleclick.net') ||
              url.includes('googlesyndication.com') ||
              url.includes('/pagead/')
            ) {
              return false;
            }
            return true;
          }}
          onLoadEnd={() => {
            setIsBuffering(false);
            setTimeout(() => {
              setShowPosterShield(false);
            }, 600);
            safeInjectJS(`
              (function() {
                if (typeof window.__agySetCaptionsEnabled === 'function') {
                  window.__agySetCaptionsEnabled(${isCCOn});
                }
              })();
              true;
            `);
          }}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (!data || typeof data !== 'object') return;
              if (data.type === 'GO_BACK') {
                onMinimize();
              } else if (data.type === 'SWIPE_UP_FULLSCREEN') {
                if (!isFullScreenRef.current) {
                  if (isHapticsSupported()) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }
                  triggerFeedbackPill('Full screen', 'scan-outline');
                  onFullScreen(true);
                }
              } else if (data.type === 'TOGGLE_FULLSCREEN') {
                if (isHapticsSupported()) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                onFullScreen();
              } else if (data.type === 'OPEN_SETTINGS') {
                if (typeof data.currentTime === 'number') setWebCurrentTime(data.currentTime);
                if (typeof data.duration === 'number' && data.duration > 0) setWebDuration(data.duration);
                if (typeof data.isPlaying === 'boolean') setWebIsPlaying(data.isPlaying);
                setSettingsSubView('main');
                setSettingsModalVisible(true);
              } else if (data.type === 'PROGRESS') {
                if (!isSlidingRef.current) {
                  const cTime = typeof data.currentTime === 'number' ? data.currentTime : 0;
                  const dTime = typeof data.duration === 'number' ? data.duration : 0;
                  setWebCurrentTime(cTime);
                  if (cTime > 0) {
                    setShowPosterShield(false);
                    setIsBuffering(false);
                  }
                  if (dTime > 0) {
                    setWebDuration(dTime);
                  }
                  checkSponsorSkip(cTime);
                  onProgress(cTime, dTime > 0 ? dTime : effectiveDuration);
                }
              } else if (data.type === 'SWIPE_DOWN_MINIMIZE') {
                if (isFullScreenRef.current) {
                  if (isHapticsSupported()) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }
                  triggerFeedbackPill('Exit full screen', 'contract-outline');
                  onFullScreen(false);
                  return;
                }
                onMinimize();
              } else if (data.type === 'SWIPE_EXIT') {
                if (onSwipeExit) {
                  onSwipeExit();
                } else {
                  onMinimize();
                }
              } else if (data.type === 'STREAM_SOURCE_READY') {
                if (data.streamUrl && videoId) {
                  youTubeService.setLiveStreamInfo(videoId, data.streamUrl, data.duration);
                }
              } else if (data.type === 'AD_STATE') {
                setIsAdPlaying(!!data.isAd);
              } else if (data.type === 'PLAY_STATE') {
                if (typeof data.isPlaying === 'boolean') {
                  const newIsPlaying = data.isPlaying;
                  setWebIsPlaying(newIsPlaying);
                  lastWebCommandPlayingRef.current = newIsPlaying;
                  if (newIsPlaying) {
                    setShowPosterShield(false);
                    setIsBuffering(false);
                    if (!isPlayingRef.current) {
                      isPlayingRef.current = true;
                      if (onPlay) {
                        onPlay();
                      } else {
                        onTogglePlay();
                      }
                    }
                  } else {
                    if (isPlayingRef.current) {
                      isPlayingRef.current = false;
                      if (onPause) {
                        onPause();
                      } else {
                        onTogglePlay();
                      }
                    }
                  }
                }
              }
            } catch (err) {}
          }}
        />
      ) : (
        <>

      {streamUrl ? (
        useKSPlayer && isKSPlayerAvailable() ? (
          <KSPlayerView
            ref={ksRef}
            url={streamUrl}
            headers={playerHeaders}
            paused={!isPlaying}
            rate={playbackSpeed}
            resizeMode={videoResizeMode === 'contain' ? 'contain' : videoResizeMode === 'stretch' ? 'stretch' : 'cover'}
            style={StyleSheet.absoluteFill}
            onProgress={(e) => {
              if (!isSlidingRef.current) {
                checkSponsorSkip(e.currentTime);
                onProgress(e.currentTime, e.duration || duration);
              }
            }}
            onLoad={(e) => {
              console.log('[YouTubeInlinePlayer] ✅ KSPlayer onLoad event fired! Duration:', e.duration, 'currentTime:', e.currentTime);
              setIsBuffering(false);
              setShowPosterShield(false);
              onProgress(e.currentTime || 0, e.duration || duration);
            }}
            onBuffer={(e) => {
              console.log('[YouTubeInlinePlayer] ⏳ KSPlayer onBuffer:', e.isBuffering);
              setIsBuffering(e.isBuffering);
            }}
            onError={(e) => {
              console.error('[YouTubeInlinePlayer] ❌ KSPlayer onError fired:', JSON.stringify(e));
              setIsBuffering(false);
              setUseKSPlayer(false);
              setUseWebFallback(true);
              onPlaybackError?.(e?.error?.message || 'KSPlayer playback error');
            }}
          />
        ) : (
          <Video
            ref={videoRef}
            source={{
              uri: streamUrl,
              headers: playerHeaders,
            }}
            paused={!isPlaying}
            rate={playbackSpeed}
            resizeMode={videoResizeMode === 'contain' ? 'contain' : videoResizeMode === 'stretch' ? 'stretch' : 'cover'}
            style={StyleSheet.absoluteFill}
            controls={false}
            selectedTextTrack={{ type: SelectedTrackType.DISABLED }}
            playInBackground={true}
            playWhenInactive={true}
            enterPictureInPictureOnLeave={isPipEnabled}
            allowsExternalPlayback={true}
            preventsDisplaySleepDuringVideoPlayback={true}
            onPictureInPictureStatusChanged={(e) => {
              console.log('[YouTubeInlinePlayer] 📺 PiP status changed:', e.isActive);
              setIsPipActive(e.isActive);
            }}
            onRestoreUserInterfaceForPictureInPictureStop={() => {
              console.log('[YouTubeInlinePlayer] 🔄 PiP stop restore requested');
              try {
                videoRef.current?.restoreUserInterfaceForPictureInPictureStopCompleted(true);
              } catch (_) {}
            }}
            ignoreSilentSwitch="ignore"
            progressUpdateInterval={250}
            onProgress={(e) => {
              if (!isSlidingRef.current) {
                checkSponsorSkip(e.currentTime);
                onProgress(e.currentTime, e.seekableDuration || duration);
              }
            }}
            onLoad={(e) => {
              console.log('[YouTubeInlinePlayer] ✅ react-native-video onLoad fired! Duration:', e.duration, 'currentTime:', currentTime);
              setIsBuffering(false);
              setShowPosterShield(false);
              if (seekTarget !== null && seekTarget > 0) {
                videoRef.current?.seek(seekTarget);
              } else if (currentTime > 0) {
                videoRef.current?.seek(currentTime);
              }
              onProgress(currentTime > 0 ? currentTime : 0, e.duration || duration);
            }}
            onBuffer={(e) => {
              console.log('[YouTubeInlinePlayer] ⏳ react-native-video onBuffer:', e.isBuffering);
              setIsBuffering(e.isBuffering);
            }}
            onEnd={() => {
              if (isLooping) {
                videoRef.current?.seek(0);
              } else {
                if (onPause) onPause(); else onTogglePlay();
              }
            }}
            onError={(e) => {
              console.error('[YouTubeInlinePlayer] ❌ react-native-video onError fired:', e?.error?.errorString || e);
              setIsBuffering(false);
              if (isKSPlayerAvailable() && !useKSPlayer) {
                console.log('[YouTubeInlinePlayer] 🔄 Falling back to KSPlayer...');
                setUseKSPlayer(true);
                return;
              }
              const errStr = e?.error?.errorString || 'Video stream could not be opened';
              setUseWebFallback(true);
              onPlaybackError?.(errStr);
            }}
          />
        )
      ) : (
        <View style={StyleSheet.absoluteFill}>
          {poster ? (
            <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#141416' }]} />
          )}
          <View style={[StyleSheet.absoluteFill, styles.loadingBackdrop]}>
            {isBuffering && !playbackError && (
              <ActivityIndicator size="large" color="#ffffff" />
            )}
            {playbackError ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle-outline" size={36} color="#ff4444" />
                <Text style={styles.errorTitle}>Playback Error</Text>
                <Text style={styles.errorText} numberOfLines={3}>
                  {playbackError}
                </Text>
                {videoId ? (
                  <View style={{ width: '100%', alignItems: 'center', marginTop: 10 }}>
                    <TouchableOpacity
                      style={[styles.retryButton, { backgroundColor: '#FF0000', paddingHorizontal: 16 }]}
                      onPress={handleOpenYouTubeApp}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="logo-youtube" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                      <Text style={styles.retryButtonText}>Watch in YouTube App (1-Tap)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.retryButton, { backgroundColor: 'rgba(255, 255, 255, 0.15)', marginTop: 8, paddingHorizontal: 16 }]}
                      onPress={() => setUseWebFallback(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="globe-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                      <Text style={styles.retryButtonText}>Play in Mobile Web Player</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {onRetry && (
                  <TouchableOpacity style={[styles.retryButton, { marginTop: 8, backgroundColor: 'transparent' }]} onPress={onRetry} activeOpacity={0.8}>
                    <Ionicons name="refresh" size={14} color="#8E8E93" style={{ marginRight: 4 }} />
                    <Text style={[styles.retryButtonText, { color: '#8E8E93', fontSize: 12 }]}>Retry Local Engine Connection</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}
          </View>
        </View>
      )}
        </>
      )}

      {/* Native Player Subtitle Overlay (when not in WebView mode) */}
      {!isWebActive && isCCOn && !!(!isWebActive && isCCOn && nativeSubtitleCues.length > 0 && nativeSubtitleCues.find((c) => actualCurrentTime >= c.start && actualCurrentTime <= c.end)?.text) && (
        <View style={styles.nativeSubtitleContainer} pointerEvents="none">
          <View style={styles.nativeSubtitleBox}>
            <Text style={styles.nativeSubtitleText}>
              {nativeSubtitleCues.find((c) => actualCurrentTime >= c.start && actualCurrentTime <= c.end)?.text}
            </Text>
          </View>
        </View>
      )}

      {/* Tap Overlay to reveal/hide controls (active in both Web & Native) */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={handleToggleControls}
      />

      {/* On-Screen Error Overlay (if streamUrl set but playback failed) */}
      {playbackError && streamUrl ? (
        <View style={[StyleSheet.absoluteFill, styles.errorOverlay]} pointerEvents="box-none">
          <Ionicons name="alert-circle-outline" size={40} color="#ff4444" />
          <Text style={styles.errorTitle}>Playback Error</Text>
          <Text style={styles.errorText} numberOfLines={2}>
            {playbackError}
          </Text>
          {onRetry && (
            <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.8}>
              <Ionicons name="refresh" size={15} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.retryButtonText}>Switch / Retry Stream</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}



      {/* Visual Feedback Pill for Aspect Ratio */}
      {feedbackPill ? (
        <View style={styles.gestureFeedbackPill} pointerEvents="none">
          <Ionicons
            name={feedbackPill.icon || 'information-circle'}
            size={15}
            color={
              feedbackPill.mode === 'stretch'
                ? '#30d158'
                : feedbackPill.mode === 'cover'
                ? '#535aff'
                : '#ffffff'
            }
            style={{ marginRight: 6 }}
          />
          <Text style={styles.gestureFeedbackText}>
            {feedbackPill.label}
          </Text>
        </View>
      ) : null}

      {/* Controls Overlay (native player only) */}
      {showControls && (
        <View style={[styles.controlsOverlay, isFullScreen && styles.controlsOverlayFullScreen]} pointerEvents="box-none">
          {/* Top Bar: Back button on left, PiP + CC + Settings on right */}
          <View style={[styles.topBar, isHeroMode && { paddingTop: Platform.OS === 'ios' ? 42 : 24 }]}>
            <TouchableOpacity
              style={styles.topBackBtn}
              onPress={onMinimize}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="arrow-back" size={22} color="#ffffff" />
            </TouchableOpacity>

            <View style={styles.topBarRight}>
              {/* Picture-in-Picture Button */}
              <TouchableOpacity
                style={styles.topIconBtn}
                onPress={handleTriggerPiP}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                accessibilityLabel="Picture in Picture"
              >
                <Ionicons
                  name="copy-outline"
                  size={20}
                  color={isPipActive ? '#535aff' : '#ffffff'}
                />
              </TouchableOpacity>

              {/* Closed Captions (CC) Icon */}
              <TouchableOpacity
                style={styles.topIconBtn}
                onPress={handleToggleCC}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              >
                <View style={[styles.ccIconBadge, isCCOn && styles.ccIconBadgeActive]}>
                  <Text style={[styles.ccIconText, isCCOn && styles.ccIconTextActive]}>CC</Text>
                </View>
              </TouchableOpacity>

              {/* Settings Gear Button */}
              <TouchableOpacity
                style={styles.topIconBtn}
                onPress={() => {
                  setSettingsSubView('main');
                  setSettingsModalVisible(true);
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
              >
                <Ionicons name="settings-sharp" size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Bottom Bar: Real YouTube Time Pill, Chapter Pill & Fullscreen Icon */}
          <View style={[styles.bottomMetaRow, isFullScreen && styles.bottomMetaRowFullScreen]}>
            <View style={styles.bottomLeftPills}>
              {/* Time Pill */}
              <View style={styles.timePill}>
                <Text style={styles.timePillText}>
                  {formatTime(isSliding ? sliderPos * actualDuration : actualCurrentTime)} / {formatTime(actualDuration)}
                </Text>
              </View>

              {/* Chapter / Quality Pill */}
              <TouchableOpacity
                style={styles.chapterPill}
                onPress={() => {
                  setSettingsSubView('quality');
                  setSettingsModalVisible(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.chapterPillText} numberOfLines={1}>
                  {isWebActive ? (webQuality || 'Auto') : (currentQuality || '480p')}
                </Text>
                <Ionicons name="chevron-forward" size={11} color="rgba(255, 255, 255, 0.7)" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.fullscreenButton}
              onPress={async () => {
                if (await isHapticsSupported()) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                onFullScreen();
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name={isFullScreen ? 'contract-outline' : 'scan-outline'} size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Center Playback Controls: Real YouTube Circular Controls - ALWAYS Perfectly Centered */}
      {showControls && (
        <View
          style={[
            styles.centerControls,
            isHeroMode && { paddingTop: effectiveTopInset },
          ]}
          pointerEvents="box-none"
        >
          {/* Previous Track / Skip Backward */}
          <TouchableOpacity
            style={styles.centerSkipBtn}
            onPress={() => handleSkip(-10)}
            activeOpacity={0.7}
          >
            <Ionicons name="play-skip-back" size={22} color="#ffffff" />
          </TouchableOpacity>

          {/* Play / Pause Large Center Circle */}
          <TouchableOpacity
            style={styles.centerPlayPauseBtn}
            onPress={() => {
              handleTogglePlay();
              scheduleControlsHide();
            }}
            activeOpacity={0.8}
          >
            {isBuffering ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons
                name={effectiveIsPlaying ? 'pause' : 'play'}
                size={32}
                color="#ffffff"
                style={{ marginLeft: effectiveIsPlaying ? 0 : 3 }}
              />
            )}
          </TouchableOpacity>

          {/* Next Track / Skip Forward */}
          <TouchableOpacity
            style={styles.centerSkipBtn}
            onPress={() => handleSkip(10)}
            activeOpacity={0.7}
          >
            <Ionicons name="play-skip-forward" size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>
      )}

      {/* ONLY ONE Single Progress Bar at Bottom Position (Active in both Web & Native) */}
      {actualDuration > 0 && (
        showControls ? (
          <View
            style={[styles.bottomScrubberContainer, isFullScreen && styles.bottomScrubberContainerFullScreen]}
            pointerEvents="box-none"
          >
            {/* Real YouTube Floating Scrub Time Tooltip Bubble */}
            {isSliding && (
              <View
                style={[
                  styles.scrubTooltipBubble,
                  {
                    left: `${Math.max(6, Math.min(94, (sliderPos || progressPct) * 100))}%`,
                    bottom: isFullScreen ? 38 : 30,
                  },
                ]}
                pointerEvents="none"
              >
                <Text style={styles.scrubTooltipText}>
                  {formatTime((sliderPos || progressPct) * actualDuration)}
                </Text>
              </View>
            )}
            <Slider
              style={styles.bottomSlider}
              minimumValue={0}
              maximumValue={1}
              value={progressPct}
              slideOnTap={true}
              trackHeight={isFullScreen ? 4 : 3}
              thumbSize={isFullScreen ? 16 : 13}
              thumbTintColor="#ff0000"
              minimumTrackTintColor="#ff0000"
              maximumTrackTintColor="rgba(255, 255, 255, 0.28)"
              hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
              onSlidingStart={handleSlidingStart}
              onValueChange={handleSlidingChange}
              onSlidingComplete={handleSlidingComplete}
            />
          </View>
        ) : (
          <View
            style={[styles.slimScrubTrack, isFullScreen && styles.slimScrubTrackFullScreen]}
            pointerEvents="none"
          >
            <View
              style={[
                styles.slimScrubFill,
                { width: `${Math.min(100, Math.max(0, (actualCurrentTime / actualDuration) * 100))}%` },
              ]}
            />
          </View>
        )
      )}

      {/* Loading Poster Shield: prevents any white screen flash while video or web player loads */}
      {showPosterShield && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000' }]} pointerEvents="none">
          {poster ? (
            <Image
              source={{ uri: poster }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : null}
          <View style={[StyleSheet.absoluteFill, styles.loadingBackdrop]}>
            <ActivityIndicator size="small" color="#ffffff" />
          </View>
        </View>
      )}



      {/* Native Floating "Skip Ad" Button (Active in both Inline & Fullscreen, always topmost) */}
      {isAdPlaying && (
        <TouchableOpacity
          style={[
            styles.nativeSkipAdBtn,
            isFullScreen ? styles.nativeSkipAdBtnFullScreen : styles.nativeSkipAdBtnInline,
          ]}
          onPress={handleManualSkipAd}
          activeOpacity={0.8}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        >
          <Text style={styles.nativeSkipAdText}>Skip Ad</Text>
          <Ionicons name="play-skip-forward" size={15} color="#ffffff" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      )}

      {/* Player Settings Bottom Sheet / Side Drawer Modal (Active in Both Web and Native Modes) */}
      <Modal
        visible={settingsModalVisible}
        animationType={isLandscapeLayout ? 'fade' : 'slide'}
        transparent={true}
        onRequestClose={() => setSettingsModalVisible(false)}
        supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
        onOrientationChange={(evt) => {
          const o = evt.nativeEvent.orientation;
          setDeviceOrientation(o.startsWith('landscape') ? 'landscape' : 'portrait');
        }}
        statusBarTranslucent={true}
      >
        <View
          style={[
            styles.settingsBackdrop,
            isLandscapeLayout && styles.settingsBackdropLandscape,
          ]}
        >
          {/* Backdrop Dismiss touchable */}
          <Pressable
            style={
              isLandscapeLayout
                ? styles.settingsBackdropDismissAreaLandscape
                : styles.settingsBackdropDismissAreaPortrait
            }
            onPress={() => setSettingsModalVisible(false)}
          />

          <View
            style={[
              styles.settingsSheet,
              isLandscapeLayout ? styles.settingsSheetLandscape : styles.settingsSheetPortrait,
              isLandscapeLayout && {
                width: Math.min(Math.max(windowWidth * 0.44, 320), 400),
                paddingTop: Math.max(insets.top, 14),
                paddingBottom: Math.max(insets.bottom, 16),
                paddingRight: Math.max(insets.right, 16),
              },
              !isLandscapeLayout && {
                paddingBottom: Math.max(insets.bottom, 24),
              },
            ]}
          >
            {/* Grab handle for portrait bottom sheet */}
            {!isLandscapeLayout && <View style={styles.sheetHandle} />}

            {/* 1. Main Settings Menu */}
            {settingsSubView === 'main' && (
              <View style={styles.subViewContainer}>
                <View style={styles.settingsHeader}>
                  <View style={styles.settingsHeaderLeft}>
                    <Ionicons name="settings-sharp" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                    <Text style={styles.settingsTitle}>Playback Settings</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSettingsModalVisible(false)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={styles.settingsCloseBtn}
                  >
                    <Ionicons name="close" size={20} color="rgba(255, 255, 255, 0.7)" />
                  </TouchableOpacity>
                </View>

                <View style={styles.settingsDivider} />

                <ScrollView
                  style={styles.settingsScroll}
                  contentContainerStyle={styles.settingsScrollContent}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  {/* Quality Option */}
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => setSettingsSubView('quality')}
                  activeOpacity={0.7}
                >
                  <View style={styles.settingsRowLeft}>
                    <Ionicons name="options-outline" size={20} color="#ffffff" />
                    <Text style={styles.settingsRowLabel}>Quality</Text>
                  </View>
                  <View style={styles.settingsRowRight}>
                    <Text style={styles.settingsRowValue}>
                      {effectiveQuality === 'Auto' ? 'Auto' : effectiveQuality}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="rgba(255, 255, 255, 0.45)" />
                  </View>
                </TouchableOpacity>

                {/* Playback Speed Option */}
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => setSettingsSubView('speed')}
                  activeOpacity={0.7}
                >
                  <View style={styles.settingsRowLeft}>
                    <Ionicons name="speedometer-outline" size={20} color="#ffffff" />
                    <Text style={styles.settingsRowLabel}>Playback speed</Text>
                  </View>
                  <View style={styles.settingsRowRight}>
                    <Text style={styles.settingsRowValue}>
                      {effectiveSpeed === 1.0 ? 'Normal' : `${effectiveSpeed}x`}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="rgba(255, 255, 255, 0.45)" />
                  </View>
                </TouchableOpacity>

                {/* Screen Fit / Aspect Ratio Option */}
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => setSettingsSubView('screenfit')}
                  activeOpacity={0.7}
                >
                  <View style={styles.settingsRowLeft}>
                    <Ionicons
                      name={
                        effectiveResizeMode === 'cover'
                          ? 'expand-outline'
                          : effectiveResizeMode === 'stretch'
                          ? 'scan-outline'
                          : 'contract-outline'
                      }
                      size={20}
                      color={
                        effectiveResizeMode === 'stretch'
                          ? '#30d158'
                          : effectiveResizeMode === 'cover'
                          ? '#535aff'
                          : '#ffffff'
                      }
                    />
                    <Text style={styles.settingsRowLabel}>Screen fit</Text>
                  </View>
                  <View style={styles.settingsRowRight}>
                    <Text
                      style={[
                        styles.settingsRowValue,
                        effectiveResizeMode === 'cover'
                          ? { color: '#535aff', fontWeight: '700' }
                          : effectiveResizeMode === 'stretch'
                          ? { color: '#30d158', fontWeight: '700' }
                          : undefined,
                      ]}
                      numberOfLines={1}
                    >
                      {effectiveResizeMode === 'hero'
                        ? 'Hero Banner'
                        : effectiveResizeMode === 'cover'
                        ? 'Fit to Screen'
                        : effectiveResizeMode === 'stretch'
                        ? 'Stretch'
                        : 'Original (Fit)'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="rgba(255, 255, 255, 0.45)" />
                  </View>
                </TouchableOpacity>

                {/* Closed Captions / Subtitles Option */}
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={handleToggleCCFromModal}
                  activeOpacity={0.7}
                >
                  <View style={styles.settingsRowLeft}>
                    <Ionicons
                      name="chatbox-ellipses-outline"
                      size={20}
                      color={isCCOn ? '#535aff' : '#ffffff'}
                    />
                    <Text style={styles.settingsRowLabel}>Captions</Text>
                  </View>
                  <View style={styles.settingsRowRight}>
                    <Text
                      style={[
                        styles.settingsRowValue,
                        isCCOn && { color: '#535aff', fontWeight: '700' },
                      ]}
                    >
                      {isCCOn ? 'On' : 'Off'}
                    </Text>
                    <Switch
                      value={isCCOn}
                      onValueChange={() => handleToggleCCFromModal()}
                      trackColor={{ false: '#3a3a3c', true: '#535aff' }}
                      thumbColor="#ffffff"
                      ios_backgroundColor="#3a3a3c"
                      style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }], marginLeft: 4 }}
                    />
                  </View>
                </TouchableOpacity>

                {/* Loop Video Option */}
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={handleToggleLoopFromModal}
                  activeOpacity={0.7}
                >
                  <View style={styles.settingsRowLeft}>
                    <Ionicons name="repeat-outline" size={20} color={effectiveLoop ? '#535aff' : '#ffffff'} />
                    <Text style={styles.settingsRowLabel}>Loop video</Text>
                  </View>
                  <View style={styles.settingsRowRight}>
                    <Text style={[styles.settingsRowValue, effectiveLoop && { color: '#535aff', fontWeight: '700' }]}>
                      {effectiveLoop ? 'On' : 'Off'}
                    </Text>
                    <Switch
                      value={effectiveLoop}
                      onValueChange={() => handleToggleLoopFromModal()}
                      trackColor={{ false: '#3a3a3c', true: '#535aff' }}
                      thumbColor="#ffffff"
                      ios_backgroundColor="#3a3a3c"
                      style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }], marginLeft: 4 }}
                    />
                  </View>
                </TouchableOpacity>

                {/* Picture-in-Picture (PiP) Option */}
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => setSettingsSubView('pip')}
                  activeOpacity={0.7}
                >
                  <View style={styles.settingsRowLeft}>
                    <Ionicons
                      name="albums-outline"
                      size={20}
                      color={isPipEnabled ? '#535aff' : '#ffffff'}
                    />
                    <Text style={styles.settingsRowLabel}>Picture-in-Picture</Text>
                  </View>
                  <View style={styles.settingsRowRight}>
                    <Text
                      style={[
                        styles.settingsRowValue,
                        isPipEnabled && { color: '#535aff', fontWeight: '700' },
                      ]}
                    >
                      {isPipEnabled ? 'Enabled' : 'Disabled'}
                    </Text>
                    <Switch
                      value={isPipEnabled}
                      onValueChange={(val) => handleTogglePipFromModal(val)}
                      trackColor={{ false: '#3a3a3c', true: '#535aff' }}
                      thumbColor="#ffffff"
                      ios_backgroundColor="#3a3a3c"
                      style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }], marginLeft: 4 }}
                    />
                    <Ionicons name="chevron-forward" size={16} color="rgba(255, 255, 255, 0.45)" style={{ marginLeft: 2 }} />
                  </View>
                </TouchableOpacity>
              </ScrollView>
            </View>
            )}

            {/* 2. Quality Sub-Menu */}
            {settingsSubView === 'quality' && (
              <View style={styles.subViewContainer}>
                <View style={styles.settingsSubHeader}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setSettingsSubView('main')}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="arrow-back" size={20} color="#ffffff" />
                  </TouchableOpacity>
                  <View style={styles.subHeaderTitleWrap}>
                    <Text style={styles.settingsTitle}>Quality</Text>
                    <Text style={styles.settingsSubTitle}>Applied immediately to player</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSettingsModalVisible(false)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.settingsCloseBtn}
                  >
                    <Ionicons name="close" size={20} color="rgba(255, 255, 255, 0.7)" />
                  </TouchableOpacity>
                </View>

                <View style={styles.settingsDivider} />

                <ScrollView
                  style={[styles.subOptionsScroll, isLandscapeLayout && styles.subOptionsScrollLandscape]}
                  showsVerticalScrollIndicator={false}
                >
                  {availableQualities.map((q) => {
                    const isSelected = effectiveQuality === q;
                    return (
                      <TouchableOpacity
                        key={q}
                        style={styles.optionItemRow}
                        onPress={async () => {
                          try {
                            if (await isHapticsSupported()) {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }
                          } catch (_) {}
                          handleChangeQualityFromModal(q);
                          setSettingsModalVisible(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.optionItemLeft}>
                          <Text style={[styles.optionItemText, isSelected && styles.optionItemTextActive]}>
                            {q === 'Auto' ? 'Auto (Recommended)' : q}
                          </Text>
                          {q === '1080p' || q === '720p' ? (
                            <View style={styles.hdBadgeMini}>
                              <Text style={styles.hdBadgeMiniText}>HD</Text>
                            </View>
                          ) : null}
                        </View>
                        {isSelected && (
                          <Ionicons name="checkmark" size={18} color="#535aff" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* 3. Screen Fit Sub-Menu */}
            {settingsSubView === 'screenfit' && (
              <View style={styles.subViewContainer}>
                <View style={styles.settingsSubHeader}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setSettingsSubView('main')}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="arrow-back" size={20} color="#ffffff" />
                  </TouchableOpacity>
                  <View style={styles.subHeaderTitleWrap}>
                    <Text style={styles.settingsTitle}>Screen fit</Text>
                    <Text style={styles.settingsSubTitle}>Customize video framing and aspect ratio</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSettingsModalVisible(false)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.settingsCloseBtn}
                  >
                    <Ionicons name="close" size={20} color="rgba(255, 255, 255, 0.7)" />
                  </TouchableOpacity>
                </View>

                <View style={styles.settingsDivider} />

                <ScrollView
                  style={[styles.subOptionsScroll, isLandscapeLayout && styles.subOptionsScrollLandscape]}
                  showsVerticalScrollIndicator={false}
                >
                  {[
                    {
                      id: 'hero' as ScreenFitMode,
                      title: 'Hero Banner (Fill Top)',
                      desc: 'Extends video to the very top covering status bar',
                      icon: 'film-outline' as const,
                      color: '#FF0000',
                    },
                    {
                      id: 'cover' as ScreenFitMode,
                      title: 'Fit to Screen (Normal)',
                      desc: 'Standard view below mobile status bar & notch',
                      icon: 'expand-outline' as const,
                      color: '#535aff',
                    },
                    {
                      id: 'stretch' as ScreenFitMode,
                      title: 'Stretch to Screen',
                      desc: 'Stretches video to fill complete width & height',
                      icon: 'scan-outline' as const,
                      color: '#30d158',
                    },
                    {
                      id: 'contain' as ScreenFitMode,
                      title: 'Original (Fit)',
                      desc: '16:9 standard view with black letterbox bars uncropped',
                      icon: 'contract-outline' as const,
                      color: '#ffffff',
                    },
                  ].map((item) => {
                    const isSelected = effectiveResizeMode === item.id;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.screenFitOptionCard,
                          isSelected && {
                            borderColor: item.color,
                            backgroundColor: item.color + '15',
                          },
                        ]}
                        onPress={async () => {
                          await applyScreenFitMode(item.id);
                          setSettingsModalVisible(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.screenFitOptionIconWrap, { backgroundColor: item.color + '22' }]}>
                          <Ionicons name={item.icon} size={20} color={item.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.optionItemText, isSelected && { color: '#ffffff', fontWeight: '700' }]}>
                            {item.title}
                          </Text>
                          <Text style={styles.screenFitOptionDesc}>{item.desc}</Text>
                        </View>
                        {isSelected && <Ionicons name="checkmark-circle" size={20} color={item.color} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* 4. Playback Speed Sub-Menu */}
            {settingsSubView === 'speed' && (
              <View style={styles.subViewContainer}>
                <View style={styles.settingsSubHeader}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setSettingsSubView('main')}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="arrow-back" size={20} color="#ffffff" />
                  </TouchableOpacity>
                  <View style={styles.subHeaderTitleWrap}>
                    <Text style={styles.settingsTitle}>Playback speed</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSettingsModalVisible(false)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.settingsCloseBtn}
                  >
                    <Ionicons name="close" size={20} color="rgba(255, 255, 255, 0.7)" />
                  </TouchableOpacity>
                </View>

                <View style={styles.settingsDivider} />

                <ScrollView
                  style={[styles.subOptionsScroll, isLandscapeLayout && styles.subOptionsScrollLandscape]}
                  showsVerticalScrollIndicator={false}
                >
                  {SPEED_OPTIONS.map((s) => {
                    const isSelected = effectiveSpeed === s;
                    const label = s === 1.0 ? 'Normal (1x)' : `${s}x`;
                    return (
                      <TouchableOpacity
                        key={s}
                        style={styles.optionItemRow}
                        onPress={async () => {
                          if (await isHapticsSupported()) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }
                          handleSetSpeedFromModal(s);
                          setSettingsModalVisible(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.optionItemText, isSelected && styles.optionItemTextActive]}>
                          {label}
                        </Text>
                        {isSelected && (
                          <Ionicons name="checkmark" size={18} color="#535aff" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* 5. Picture-in-Picture Sub-Menu */}
            {settingsSubView === 'pip' && (
              <View style={styles.subViewContainer}>
                <View style={styles.settingsSubHeader}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setSettingsSubView('main')}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="arrow-back" size={20} color="#ffffff" />
                  </TouchableOpacity>
                  <View style={styles.subHeaderTitleWrap}>
                    <Text style={styles.settingsTitle}>Picture-in-Picture (PiP)</Text>
                    <Text style={styles.settingsSubTitle}>Continue watching in a floating mini player</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSettingsModalVisible(false)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.settingsCloseBtn}
                  >
                    <Ionicons name="close" size={20} color="rgba(255, 255, 255, 0.7)" />
                  </TouchableOpacity>
                </View>

                <View style={styles.settingsDivider} />

                <ScrollView
                  style={[styles.subOptionsScroll, isLandscapeLayout && styles.subOptionsScrollLandscape]}
                  showsVerticalScrollIndicator={false}
                >
                  {[
                    {
                      enabled: true,
                      title: 'Enabled',
                      desc: 'Automatically open floating mini player when leaving or switching apps',
                      icon: 'albums-outline' as const,
                      color: '#535aff',
                    },
                    {
                      enabled: false,
                      title: 'Disabled',
                      desc: 'Keep video playback inside the app without opening floating PiP',
                      icon: 'close-circle-outline' as const,
                      color: '#ff453a',
                    },
                  ].map((item) => {
                    const isSelected = isPipEnabled === item.enabled;
                    return (
                      <TouchableOpacity
                        key={item.title}
                        style={[
                          styles.screenFitOptionCard,
                          isSelected && {
                            borderColor: item.color,
                            backgroundColor: item.color + '15',
                          },
                        ]}
                        onPress={async () => {
                          await handleTogglePipFromModal(item.enabled);
                          setSettingsModalVisible(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.screenFitOptionIconWrap, { backgroundColor: item.color + '22' }]}>
                          <Ionicons name={item.icon} size={20} color={item.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.optionItemText, isSelected && { color: '#ffffff', fontWeight: '700' }]}>
                            {item.title}
                          </Text>
                          <Text style={styles.screenFitOptionDesc}>{item.desc}</Text>
                        </View>
                        {isSelected && <Ionicons name="checkmark-circle" size={20} color={item.color} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};


const styles = StyleSheet.create({
  floatingBackBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
    elevation: 99999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  slimScrubTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 1002,
  },
  slimScrubTrackFullScreen: {
    bottom: 8,
    left: 12,
    right: 12,
    height: 3,
  },
  slimScrubFill: {
    height: '100%',
    backgroundColor: '#ff0000',
  },
  container: {
    width: '100%',
    maxWidth: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
  },
  containerHero: {
    width: '100%',
    maxWidth: '100%',
    backgroundColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
  },
  topBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  containerFullScreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
    overflow: 'hidden',
    zIndex: 9999,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topIconBtn: {
    padding: 6,
    minWidth: 38,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenFitOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 8,
    gap: 12,
  },
  screenFitOptionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenFitOptionDesc: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.55)',
    marginTop: 2,
  },
  autoplayToggleTrack: {
    width: 32,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  autoplayToggleTrackOn: {
    backgroundColor: '#ffffff',
  },
  autoplayToggleThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoplayToggleThumbOn: {
    alignSelf: 'flex-end',
    backgroundColor: '#0f0f0f',
  },
  ccIconBadge: {
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  ccIconBadgeActive: {
    borderColor: '#ffffff',
    backgroundColor: '#ffffff',
  },
  ccIconText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 10,
  },
  ccIconTextActive: {
    color: '#000000',
  },
  fitModeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gestureFeedbackPill: {
    position: 'absolute',
    top: '44%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 99,
  },
  gestureFeedbackText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  loadingBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
  errorBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  errorOverlay: {
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 8,
    zIndex: 10,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    maxWidth: 300,
  },
  errorTitle: {
    color: '#ff4444',
    fontSize: 15,
    fontWeight: '700',
  },
  errorText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#535aff',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    marginTop: 6,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 6,
    zIndex: 999,
    elevation: 20,
  },
  controlsOverlayFullScreen: {
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconButton: {
    padding: 4,
  },
  centerControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    maxWidth: '100%',
    height: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  centerSkipBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPlayPauseBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 28,
  },
  bottomMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    zIndex: 1010,
    elevation: 35,
  },
  bottomMetaRowFullScreen: {
    marginBottom: 26,
    paddingHorizontal: 12,
    zIndex: 1010,
    elevation: 35,
  },
  bottomLeftPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timePill: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  timePillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  chapterPill: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 160,
  },
  chapterPillText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    fontWeight: '500',
  },
  fullscreenButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1020,
    elevation: 40,
  },
  bottomScrubberContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 22,
    justifyContent: 'center',
    zIndex: 1000,
  },
  bottomScrubberContainerFullScreen: {
    bottom: 8,
    height: 26,
    paddingHorizontal: 16,
    zIndex: 1000,
  },
  bottomSlider: {
    width: '100%',
    height: 24,
  },
  nativeSkipAdBtn: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18, 18, 18, 0.94)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 100,
    zIndex: 99999,
  },
  nativeSkipAdBtnInline: {
    bottom: 38,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  nativeSkipAdBtnFullScreen: {
    bottom: 64,
    right: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  nativeSkipAdText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  scrubTooltipBubble: {
    position: 'absolute',
    transform: [{ translateX: -24 }],
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1005,
  },
  scrubTooltipText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  settingsBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  settingsBackdropLandscape: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
  settingsBackdropDismissAreaPortrait: {
    flex: 1,
    width: '100%',
  },
  settingsBackdropDismissAreaLandscape: {
    flex: 1,
    height: '100%',
  },
  settingsSheet: {
    backgroundColor: '#1c1c1e',
    overflow: 'hidden',
  },
  settingsSheetPortrait: {
    width: '100%',
    maxHeight: '85%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
  },
  settingsSheetLandscape: {
    height: '100%',
    maxHeight: '100%',
    backgroundColor: '#16161a',
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.1)',
    paddingLeft: 18,
    shadowColor: '#000',
    shadowOffset: { width: -6, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 50,
  },
  settingsScroll: {
    flex: 1,
  },
  settingsScrollContent: {
    paddingBottom: 20,
  },
  subViewContainer: {
    flex: 1,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  settingsSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  subHeaderTitleWrap: {
    flex: 1,
  },
  backButton: {
    padding: 4,
  },
  settingsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  settingsSubTitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 2,
  },
  settingsDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 6,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
  },
  settingsRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsRowLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
  },
  settingsRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  settingsRowValue: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  subOptionsScroll: {
    maxHeight: 280,
  },
  subOptionsScrollLandscape: {
    maxHeight: undefined,
    flex: 1,
  },
  optionItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  optionItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionItemText: {
    fontSize: 14,
    color: '#ffffff',
  },
  optionItemTextActive: {
    color: '#535aff',
    fontWeight: '700',
  },
  hdBadgeMini: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  hdBadgeMiniText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#ffffff',
  },
  webPlayerHeaderPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 99,
  },
  switchPlayerPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    zIndex: 99,
  },
  switchPlayerText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  settingsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsCloseBtn: {
    padding: 4,
  },
  settingsProgressCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  progressCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  progressTimeWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  progressCurrentTime: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  progressTimeDivider: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 14,
    marginHorizontal: 4,
  },
  progressTotalDuration: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 14,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  progressRemainingTime: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  sliderWrap: {
    marginVertical: 4,
  },
  settingsModalSlider: {
    width: '100%',
    height: 24,
  },
  progressActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    marginTop: 6,
  },
  progressMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  progressMiniBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  progressPlayPauseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#535aff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativeSubtitleContainer: {
    position: 'absolute',
    bottom: 54,
    left: 20,
    right: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
    pointerEvents: 'none',
  },
  nativeSubtitleBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    maxWidth: '90%',
  },
  nativeSubtitleText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 19,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});