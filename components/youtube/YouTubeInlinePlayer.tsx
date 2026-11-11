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
  AppState,
  AppStateStatus,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Video, { VideoRef, ResizeMode } from 'react-native-video';
import Slider from '@react-native-assets/slider';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';
import { useKeepAwake } from 'expo-keep-awake';
import KSPlayerView, { isKSPlayerAvailable, KSPlayerRef } from '@/components/ksplayer/KSPlayerView';
import { isRCTVideoAvailable } from '@/components/nativeplayer';
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { youTubeService } from '@/services/YouTubeService';
import { StorageKeys, storageService } from '@/utils/StorageService';

const { width } = Dimensions.get('window');

export type ScreenFitMode = 'cover' | 'stretch' | 'contain';

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
  onMinimize: () => void;
  onFullScreen: () => void;
  onSeek: (seconds: number) => void;
  onClearSeekTarget: () => void;
  onProgress: (currentTime: number, duration: number) => void;
  setIsBuffering: (buffering: boolean) => void;
  onPlaybackError?: (error: string) => void;
  onRetry?: () => void;
  onSwipeExit?: () => void;
  isFullScreen?: boolean;
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
      // 1. Dark background + immediately hide bottom navigation bars, headers, clutters + full width progress bar styles
      var css = 'html, body { width: 100vw !important; height: 100vh !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: #000000 !important; } ' +
        '#player, .player-container, #player-container-id, .html5-video-player, .html5-video-container { background: #000000 !important; background-color: #000000 !important; width: 100vw !important; height: 100vh !important; position: absolute !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; margin: 0 !important; padding: 0 !important; } ' +
        'video, video.video-stream, video.html5-main-video { width: 100vw !important; height: 100vh !important; max-width: none !important; max-height: none !important; position: absolute !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; object-fit: cover !important; object-position: center center !important; } ' +
        'ytm-reel-shelf-renderer, ytd-reel-shelf-renderer, ytm-shorts-lockup-view-model, ytd-shorts-lockup-view-model, [reel-shelf], .reel-shelf, [class*="shorts-shelf"], [class*="reel-shelf"], ytm-pivot-bar-renderer, ytm-pivot-bar, .pivot-bar, [role="tablist"], ytm-mobile-bottom-bar-renderer, #pivot-bar, .ytm-pivot-bar-renderer, [class*="pivot-bar"], [class*="pivot_bar"], [class*="bottom-nav"], [class*="bottom_bar"], [class*="bottomNavigation"], ytm-navigation-bar, ytm-bottom-sheet-layout, .ytm-bottom-sheet-renderer, ytm-browse[tab-identifier], ytm-mobile-topbar-renderer, ytm-header, header, .mobile-topbar-header, .ghost-header { display: none !important; visibility: hidden !important; height: 0 !important; min-height: 0 !important; max-height: 0 !important; overflow: hidden !important; opacity: 0 !important; pointer-events: none !important; margin: 0 !important; padding: 0 !important; } ' +
        'yt-progress-bar, .watch-page-progress-bar, .ytPlayerProgressBarHost, .ytPlayerProgressBarHostLowerPlayer, .ytPlayerProgressBarHostBottomEdge, .ytPlayerProgressBarHostBottomInset, .ytPlayerProgressBarHostCustom, .ytPlayerProgressBarDragContainer, .ytPlayerProgressBarProgressBar, .ytPlayerProgressBarProgressBarInset, .ytChapteredProgressBarHost, .ytFocusedChapterProgressBarLineHost, .ytProgressBarLineHost, .yt-progress-bar-line, .yt-chaptered-progress-bar-line, .yt-focused-chapter-progress-bar-line, .ytp-chrome-bottom, .ytp-progress-bar-container, .ytp-progress-bar, .ytp-progress-list, .ytp-play-progress, .ytp-load-progress, .ytp-hover-progress, [class*="ytPlayerProgressBarHost"], [class*="ytPlayerProgressBarProgressBar"], [class*="ytPlayerProgressBarDragContainer"], [class*="watch-page-progress-bar"], .ytm-progress-bar, ytm-progress-bar, .thin-scrubber { display: none !important; visibility: hidden !important; height: 0 !important; min-height: 0 !important; max-height: 0 !important; overflow: hidden !important; opacity: 0 !important; pointer-events: none !important; margin: 0 !important; padding: 0 !important; border: none !important; } ' +
        '.video-ads, .ytp-ad-module, .ytp-ad-player-overlay, .ytp-ad-skip-button-container, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-text, .videoAdUiSkipButton, .ytm-ad-skip-button, [class*="ad-skip"], [class*="skip-ad"], button[class*="skip-button"], .ytp-ad-preview-container, .ytp-ad-text { display: flex !important; visibility: visible !important; opacity: 1 !important; pointer-events: auto !important; z-index: 2147483647 !important; }';
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

function getInjectedCleanPlayerJs(topInset?: number, fitMode: ScreenFitMode = 'cover', pipEnabled: boolean = true): string {
  const topOffset = 10;
  const initialFitCss = fitMode === 'contain' ? 'contain' : fitMode === 'stretch' ? 'fill' : 'cover';
  return `
  (function() {
    window.__agyDesiredFitMode = '${fitMode || 'cover'}';
    window.__agyPipEnabled = ${pipEnabled};
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
      .player-control-overlay,
      .player-control-container,
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
      .player-control-overlay,
      .player-control-container,
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
      .player-control-overlay.fadeout,
      .player-control-overlay.fade-out,
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

      /* 9b. Explicitly ensure YouTube Ad elements and Skip Ad buttons are always visible and clickable */
      .video-ads,
      .ytp-ad-module,
      .ytp-ad-player-overlay,
      .ytp-ad-skip-button-container,
      .ytp-ad-skip-button,
      .ytp-ad-skip-button-modern,
      .ytp-skip-ad-button,
      .ytp-ad-skip-button-text,
      .videoAdUiSkipButton,
      .ytm-ad-skip-button,
      [class*="ad-skip"],
      [class*="skip-ad"],
      button[class*="skip-button"],
      .ytp-ad-preview-container,
      .ytp-ad-text {
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
        pointer-events: auto !important;
        z-index: 2147483647 !important;
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
        if (dTime < 550 && dTime > 70) {
          // 1. Vertical swipe up -> Fullscreen (requires at least 55px upward flick and clear vertical dominance)
          if (dY < -55 && absY > absX * 1.5) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'SWIPE_UP_FULLSCREEN'
              }));
            }
            return;
          }

          // 2. Vertical swipe down -> Minimize / exit fullscreen (requires at least 55px downward flick)
          if (dY > 55 && absY > absX * 1.5) {
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

    // Auto Picture-in-Picture trigger when user leaves the app or browser minimizes
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        if (window.__agyPipEnabled === false) return;
        var v = document.querySelector('video');
        if (v && !v.paused) {
          try {
            if (document.pictureInPictureEnabled && !document.pictureInPictureElement) {
              v.requestPictureInPicture().catch(function(){});
            } else if (v.webkitSetPresentationMode) {
              v.webkitSetPresentationMode('picture-in-picture');
            }
          } catch(e) {}
        }
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
          if (v.duration < 120 || v.closest('ytm-reel-video-renderer, ytd-reel-video-renderer, ytm-shorts-player')) {
            v.currentTime = 0;
            v.play().catch(function() {});
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

      // Completely hide and disable all YouTube mobile web control elements
      var webControls = document.querySelectorAll(
        '.player-control-overlay, .player-control-container, .player-controls-content, ' +
        '.player-controls-top, .player-controls-middle, .player-controls-bottom, ' +
        '.player-control-overlay .top-row, .player-control-overlay .middle-row, .player-control-overlay .bottom-row, ' +
        '.ytp-chrome-top, .ytp-chrome-bottom, ytm-custom-control, ytm-custom-control-top, ytm-custom-control-middle, ' +
        '.ytm-time-display, .ytm-fullscreen-button, .player-control-fullscreen-button, ' +
        '.player-control-play-pause-icon, .player-control-seek-button, .player-control-button, ' +
        '.ytp-settings-button, .ytm-settings-button, .ytp-subtitles-button, .ytm-subtitles-button, ' +
        'button[aria-label*="Settings" i], button[aria-label*="Captions" i], button[aria-label*="subtitles" i], ' +
        'button[aria-label*="Full screen" i], button[aria-label*="Fullscreen" i], .ytp-cued-thumbnail-overlay'
      );
      webControls.forEach(function(el) {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('opacity', '0', 'important');
        el.style.setProperty('height', '0px', 'important');
        el.style.setProperty('width', '0px', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
      });

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
        v.loop = true;
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
          if (typeof player.playVideo === 'function' && !window._agyUserPaused) {
            player.playVideo();
          }
        } catch(e) {}
      }

      var unmuteBtn = document.querySelector('.ytp-unmute, .ytp-unmute-inner, [class*="unmute"], button[aria-label*="unmute" i]');
      if (unmuteBtn) {
        try { unmuteBtn.click(); } catch(e) {}
      }

      var playBtn = document.querySelector('.ytp-large-play-button, .player-control-play-pause-icon');
      if (playBtn && document.querySelector('video') && document.querySelector('video').paused && !window._agyUserPaused) {
        try { playBtn.click(); } catch(e) {}
      }

      attachVideoListeners();
      setupBackgroundKeepAlive();
      syncControlsVisibility();
      runAdSkipper();
    }

    function runAdSkipper() {
      var moviePlayer = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
      var isAd = false;
      if (moviePlayer) {
        if (typeof moviePlayer.getProgressState === 'function') {
          try {
            var ps = moviePlayer.getProgressState();
            if (ps && ps.isAd) isAd = true;
          } catch(e) {}
        }
        var cls = moviePlayer.className || '';
        if (cls.indexOf('ad-showing') !== -1 || cls.indexOf('ad-interrupting') !== -1) {
          isAd = true;
        }
      }

      var adSelectors = [
        '.ad-showing',
        '.ad-interrupting',
        '.video-ads',
        '.ytp-ad-player-overlay',
        '.ytp-ad-player-overlay-layout',
        '.ytp-ad-module',
        'ytm-promoted-sparkles-web-renderer',
        'ytm-ad-preview-renderer',
        '.ytm-ad-player-overlay',
        '.ad-container',
        '.ad-display',
        '[class*="ad-interrupting"]',
        '[class*="ad-showing"]',
        '[class*="video-ads"]',
        '[class*="ytp-ad-"]',
        '[class*="ytm-ad-"]'
      ];
      if (!isAd) {
        for (var i = 0; i < adSelectors.length; i++) {
          if (document.querySelector(adSelectors[i])) {
            isAd = true;
            break;
          }
        }
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
        '[aria-label*="Skip" i]'
      ];

      var foundSkip = false;
      for (var s = 0; s < skipSelectors.length; s++) {
        var btns = document.querySelectorAll(skipSelectors[s]);
        for (var b = 0; b < btns.length; b++) {
          var btn = btns[b];
          if (btn) {
            foundSkip = true;
            isAd = true;
            try {
              btn.click();
              btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            } catch(e) {}
          }
        }
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

      if (isAd) {
        var video = document.querySelector('video');
        if (video && !video.paused && video.duration && !isNaN(video.duration)) {
          try {
            video.muted = true;
            video.playbackRate = 16.0;
            if (video.currentTime < video.duration - 0.2) {
              video.currentTime = video.duration - 0.1;
            }
          } catch(e) {}
        }
      } else {
        var v = document.querySelector('video');
        if (v && v.playbackRate > 2.0) {
          v.playbackRate = window.__userDesiredPlaybackRate || 1.0;
        }
      }
    }

    forceFullVideoAndPlay();
    setInterval(runAdSkipper, 250);

    var count = 0;
    var timer = setInterval(function() {
      count++;
      injectStyle();
      forceFullVideoAndPlay();
      if (count > 25) clearInterval(timer);
    }, 200);

    var observer = new MutationObserver(function() {
      injectStyle();
      forceFullVideoAndPlay();
      runAdSkipper();
      
      var unmute = document.querySelector('.ytp-unmute, .ytp-unmute-inner, [class*="unmute"]');
      if (unmute) {
        try { unmute.click(); unmute.remove(); } catch(e) {}
      }
      var secondaryBars = document.querySelectorAll('.ytm-progress-bar, ytm-progress-bar, .player-control-overlay .progress-bar, .thin-scrubber');
      secondaryBars.forEach(function(el) {
        el.style.setProperty('display', 'none', 'important');
      });
      var allWebControls = document.querySelectorAll(
        '.player-control-overlay, .player-control-container, .player-controls-content, ' +
        '.player-controls-top, .player-controls-middle, .player-controls-bottom, ' +
        '.player-control-overlay .top-row, .player-control-overlay .middle-row, .player-control-overlay .bottom-row, ' +
        '.ytp-chrome-top, .ytp-chrome-bottom, ytm-custom-control, .ytm-time-display, ' +
        '.ytm-fullscreen-button, .player-control-fullscreen-button, .player-control-play-pause-icon, ' +
        '.player-control-seek-button, .ytp-settings-button, .ytm-settings-button'
      );
      allWebControls.forEach(function(el) {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('opacity', '0', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
      });
      var navBars = document.querySelectorAll('ytm-pivot-bar-renderer, ytm-pivot-bar, .pivot-bar, [role="tablist"], ytm-mobile-bottom-bar-renderer, #pivot-bar, [class*="pivot-bar"], [class*="bottom-nav"], ytm-navigation-bar');
      navBars.forEach(function(el) {
        el.style.setProperty('display', 'none', 'important');
        try { el.remove(); } catch(e) {}
      });

      attachVideoListeners();
      setupBackgroundKeepAlive();

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
}) => {
  useKeepAwake('YOUTUBE_PLAYER_PLAYBACK');
  const effectiveTopInset = Math.max(topInset || 0, Platform.OS === 'ios' ? 44 : 24);

  const [showControls, setShowControls] = useState(false);
  const [videoResizeMode, setVideoResizeMode] = useState<ScreenFitMode>(screenFitMode || 'cover');
  const [feedbackPill, setFeedbackPill] = useState<FeedbackPillData | null>(null);
  const feedbackTimerRef = useRef<any>(null);
  const isSlidingRef = useRef(false);
  const [isSliding, setIsSliding] = useState(false);
  const [sliderPos, setSliderPos] = useState(0);
  // Default to react-native-video (AVPlayer on iOS, ExoPlayer on Android) for native MP4 streaming
  const [useKSPlayer, setUseKSPlayer] = useState(false);
  const [useWebFallback, setUseWebFallback] = useState(false);
  const [showPosterShield, setShowPosterShield] = useState(true);
  const [isAdPlaying, setIsAdPlaying] = useState<boolean>(false);

  useEffect(() => {
    setShowPosterShield(true);
    setIsAdPlaying(false);
  }, [videoId]);

  const handleManualSkipAd = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const skipJs = `
      (function() {
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
        if (v && v.duration) {
          try {
            v.muted = false;
            v.playbackRate = window.__userDesiredPlaybackRate || 1.0;
            v.currentTime = v.duration;
          } catch(e) {}
        }
      })();
      true;
    `;
    webViewRef.current?.injectJavaScript(skipJs);
    setTimeout(() => {
      setIsAdPlaying(false);
    }, 400);
  }, []);



  useEffect(() => {
    setUseWebFallback(false);
  }, [videoId]);

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

  // Web player state for fallback mode
  const [webCurrentTime, setWebCurrentTime] = useState(0);
  const [webDuration, setWebDuration] = useState(0);
  const [webIsPlaying, setWebIsPlaying] = useState(true);
  const [webQuality, setWebQuality] = useState('Auto');
  const [webSpeed, setWebSpeed] = useState(1.0);
  const [webLoop, setWebLoop] = useState(false);
  const [webResizeMode, setWebResizeMode] = useState<ScreenFitMode>(screenFitMode || 'cover');
  const [modalSliderPos, setModalSliderPos] = useState<number | null>(null);

  const isWebActive = (useWebFallback || (playbackError && !streamUrl)) && !!videoId;

  useEffect(() => {
    if (screenFitMode) {
      setVideoResizeMode(screenFitMode);
      setWebResizeMode(screenFitMode);
      if (isWebActive && webViewRef.current) {
        const fitCss = screenFitMode === 'contain' ? 'contain' : screenFitMode === 'stretch' ? 'fill' : 'cover';
        webViewRef.current.injectJavaScript(`
          (function() {
            var v = document.querySelector('video');
            if (v) v.style.setProperty('object-fit', '${fitCss}', 'important');
          })();
          true;
        `);
      }
    }
  }, [screenFitMode, isWebActive]);
  const effectiveCurrentTime = isWebActive ? (webCurrentTime || currentTime) : currentTime;
  const effectiveDuration = isWebActive ? (webDuration || duration) : duration;
  const effectiveIsPlaying = isWebActive ? webIsPlaying : isPlaying;
  const effectiveQuality = isWebActive ? webQuality : (currentQuality || 'Auto');
  const effectiveSpeed = isWebActive ? webSpeed : (playbackSpeed || 1.0);
  const effectiveLoop = isWebActive ? webLoop : isLooping;
  const effectiveResizeMode = isWebActive ? webResizeMode : videoResizeMode;

  // Auto Picture-in-Picture when app transitions to background / inactive
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (isPipEnabled && effectiveIsPlaying && isWebActive && webViewRef.current) {
          webViewRef.current.injectJavaScript(`
            (function() {
              if (window.__agyPipEnabled === false) return;
              try {
                var v = document.querySelector('video');
                if (v && !v.paused) {
                  if (document.pictureInPictureEnabled && !document.pictureInPictureElement) {
                    v.requestPictureInPicture().catch(function(){});
                  } else if (v.webkitSetPresentationMode) {
                    v.webkitSetPresentationMode('picture-in-picture');
                  }
                }
              } catch(e) {}
            })();
            true;
          `);
        }
      }
    });
    return () => sub.remove();
  }, [effectiveIsPlaying, isWebActive, isPipEnabled]);

  // Modal seek & progress handlers
  const handleSeekFromModal = useCallback((targetSec: number) => {
    if (isWebActive) {
      setWebCurrentTime(targetSec);
      webViewRef.current?.injectJavaScript(`
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
  }, [isWebActive, effectiveDuration, onProgress, onSeek]);

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
      webViewRef.current?.injectJavaScript(`
        (function() {
          var v = document.querySelector('video');
          if (v) {
            window._agyUserPaused = ${!nextPlaying};
            if (${nextPlaying}) {
              v.play().catch(function() {});
            } else {
              v.pause();
            }
          }
        })();
        true;
      `);
    } else {
      onTogglePlay();
    }
  }, [isWebActive, effectiveIsPlaying, onTogglePlay]);

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
        webViewRef.current?.injectJavaScript(`
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
  }, [isWebActive, onChangeQuality]);

  const handleSetSpeedFromModal = useCallback((speed: number) => {
    if (isWebActive) {
      setWebSpeed(speed);
      webViewRef.current?.injectJavaScript(`
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
  }, [isWebActive, onSetPlaybackSpeed]);

  const handleToggleLoopFromModal = useCallback(() => {
    if (isWebActive) {
      setWebLoop((prev) => {
        const next = !prev;
        webViewRef.current?.injectJavaScript(`
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

    if (isWebActive && webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        (function() {
          window.__agyPipEnabled = ${nextVal};
          if (!${nextVal} && document.pictureInPictureElement) {
            document.exitPictureInPicture().catch(function(){});
          }
        })();
        true;
      `);
    }
  }, [isPipEnabled, isWebActive, onTogglePip]);



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
  const videoRef = useRef<VideoRef>(null);
  const ksRef = useRef<KSPlayerRef>(null);
  const webViewRef = useRef<any>(null);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Sync React Native isPlaying state down to the web player
  useEffect(() => {
    if (isWebActive && webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        (function() {
          try {
            var v = document.querySelector('video');
            if (v) {
              if (${isPlaying}) {
                window._agyUserPaused = false;
                if (v.paused) v.play().catch(function() {});
              } else {
                window._agyUserPaused = true;
                if (!v.paused) v.pause();
              }
            }
          } catch(e) {}
        })();
        true;
      `);
    }
  }, [isPlaying, isWebActive]);

  // Sync MediaMetadata to system Lock Screen & Control Center
  useEffect(() => {
    if (isWebActive && webViewRef.current && (title || channel || poster)) {
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
      webViewRef.current.injectJavaScript(metaJs);
    }
  }, [title, channel, poster, isWebActive]);
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
      onScreenFitChange?.(next);

      if (isWebActive) {
        const fitCss = next === 'contain' ? 'contain' : next === 'stretch' ? 'fill' : 'cover';
        webViewRef.current?.injectJavaScript(`
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
  const [isCCOn, setIsCCOn] = useState(false);

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
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      setFeedbackPill({ label: next ? 'Subtitles turned on' : 'Subtitles turned off', icon: 'chatbox-ellipses-outline' });
      feedbackTimerRef.current = setTimeout(() => {
        setFeedbackPill(null);
      }, 1800);
      return next;
    });
    scheduleControlsHide();
  }, [scheduleControlsHide]);

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
    if (isWebActive && webViewRef.current) {
      const currentMode = videoResizeMode || screenFitMode || 'cover';
      const fitCss = currentMode === 'contain' ? 'contain' : currentMode === 'stretch' ? 'fill' : 'cover';
      webViewRef.current.injectJavaScript(`
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
  }, [isFullScreen, videoResizeMode, screenFitMode, isWebActive]);

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
    () => getInjectedCleanPlayerJs(effectiveTopInset, videoResizeMode, isPipEnabled),
    [effectiveTopInset, videoResizeMode, isPipEnabled]
  );

  return (
    <View
      style={isFullScreen ? styles.containerFullScreen : styles.container}
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
          onLoadProgress={({ nativeEvent }) => {
            if (nativeEvent.progress > 0.2) {
              webViewRef.current?.injectJavaScript(cleanPlayerJs);
            }
          }}
          onShouldStartLoadWithRequest={(request) => {
            if (
              request.url.startsWith('vnd.youtube') ||
              request.url.startsWith('intent://') ||
              request.url.startsWith('itms-appss://')
            ) {
              return false;
            }
            return true;
          }}
          onLoadEnd={() => {
            setIsBuffering(false);
            webViewRef.current?.injectJavaScript(cleanPlayerJs);
            setTimeout(() => {
              setShowPosterShield(false);
            }, 800);
          }}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (!data || typeof data !== 'object') return;
              if (data.type === 'GO_BACK') {
                onMinimize();
              } else if (data.type === 'SWIPE_UP_FULLSCREEN' || data.type === 'TOGGLE_FULLSCREEN') {
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
                  if (typeof data.currentTime === 'number') {
                    setWebCurrentTime(data.currentTime);
                    if (data.currentTime > 0) setShowPosterShield(false);
                  }
                  if (typeof data.duration === 'number' && data.duration > 0) setWebDuration(data.duration);
                  onProgress(data.currentTime || 0, data.duration || 0);
                }
              } else if (data.type === 'SWIPE_DOWN_MINIMIZE') {
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
                  setWebIsPlaying(data.isPlaying);
                  if (data.isPlaying) setShowPosterShield(false);
                  if (data.isPlaying !== isPlayingRef.current) {
                    onTogglePlay();
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
                onProgress(e.currentTime, e.duration || duration);
              }
            }}
            onLoad={(e) => {
              console.log('[YouTubeInlinePlayer] ✅ KSPlayer onLoad event fired! Duration:', e.duration, 'currentTime:', e.currentTime);
              setIsBuffering(false);
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
            playInBackground={true}
            playWhenInactive={true}
            enterPictureInPictureOnLeave={isPipEnabled}
            ignoreSilentSwitch="ignore"
            progressUpdateInterval={250}
            onProgress={(e) => {
              if (!isSlidingRef.current) {
                onProgress(e.currentTime, e.seekableDuration || duration);
              }
            }}
            onLoad={(e) => {
              console.log('[YouTubeInlinePlayer] ✅ react-native-video onLoad fired! Duration:', e.duration, 'currentTime:', currentTime);
              setIsBuffering(false);
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
              }
            }}
            onError={(e) => {
              console.error('[YouTubeInlinePlayer] ❌ react-native-video onError fired:', JSON.stringify(e));
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
          {/* Top Bar: Real YouTube Icons (Chevron Down, Autoplay, Cast, CC, Screen Fit, Settings) */}
          <View style={styles.topBar}>
            <View style={{ width: 38, height: 38 }} />

            <View style={styles.topBarRight}>
              {/* Autoplay Toggle Switch */}
              <TouchableOpacity
                style={[styles.autoplayToggleTrack, isAutoplay && styles.autoplayToggleTrackOn]}
                onPress={handleToggleAutoplay}
                activeOpacity={0.8}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              >
                <View style={[styles.autoplayToggleThumb, isAutoplay && styles.autoplayToggleThumbOn]}>
                  <Ionicons
                    name={isAutoplay ? 'play' : 'pause'}
                    size={8}
                    color="#000000"
                    style={isAutoplay ? { marginLeft: 1 } : undefined}
                  />
                </View>
              </TouchableOpacity>

              {/* Cast Icon */}
              <TouchableOpacity
                style={styles.topIconBtn}
                onPress={handleCastPress}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              >
                <Ionicons name="tv-outline" size={20} color="#ffffff" />
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

              {/* Screen Fit / Zoom Toggle Button */}
              <TouchableOpacity
                style={styles.topIconBtn}
                onPress={handleToggleResizeMode}
                activeOpacity={0.7}
                hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
              >
                <Ionicons
                  name={
                    effectiveResizeMode === 'stretch'
                      ? 'scan-outline'
                      : effectiveResizeMode === 'contain'
                      ? 'contract-outline'
                      : 'expand-outline'
                  }
                  size={19}
                  color={effectiveResizeMode === 'stretch' ? '#30d158' : '#ffffff'}
                />
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
          style={styles.centerControls}
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

      {/* Go Back Left Arrow Icon: In front of the inline player at left corner, only when controls are active */}
      {showControls && (
        <TouchableOpacity
          style={[
            styles.floatingBackBtn,
            { top: isFullScreen ? 16 : 12, left: 12 },
          ]}
          onPress={onMinimize}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={22} color="#ffffff" />
        </TouchableOpacity>
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

      {/* Player Settings Bottom Sheet Modal (Active in Both Web and Native Modes) */}
      <Modal
        visible={settingsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSettingsModalVisible(false)}
        supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
        statusBarTranslucent={true}
      >
        <Pressable
          style={styles.settingsBackdrop}
          onPress={() => setSettingsModalVisible(false)}
        >
          <View style={styles.settingsSheet}>
            <View style={styles.sheetHandle} />

            {/* 1. Main Settings Menu */}
            {settingsSubView === 'main' && (
              <View>
                <View style={styles.settingsHeader}>
                  <View style={styles.settingsHeaderLeft}>
                    <Ionicons name="settings-sharp" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                    <Text style={styles.settingsTitle}>Playback Settings</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSettingsModalVisible(false)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.settingsCloseBtn}
                  >
                    <Ionicons name="close" size={20} color="rgba(255, 255, 255, 0.7)" />
                  </TouchableOpacity>
                </View>

                {/* Progress View Card */}
                <View style={styles.settingsProgressCard}>
                  <View style={styles.progressCardHeader}>
                    <View style={styles.progressTimeWrap}>
                      <Text style={styles.progressCurrentTime}>
                        {formatTime(modalSliderPos !== null ? modalSliderPos * effectiveDuration : effectiveCurrentTime)}
                      </Text>
                      <Text style={styles.progressTimeDivider}>/</Text>
                      <Text style={styles.progressTotalDuration}>
                        {formatTime(effectiveDuration)}
                      </Text>
                    </View>
                    {effectiveDuration > 0 ? (
                      <Text style={styles.progressRemainingTime}>
                        {formatRemainingTime(
                          modalSliderPos !== null ? modalSliderPos * effectiveDuration : effectiveCurrentTime,
                          effectiveDuration
                        )}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.sliderWrap}>
                    <Slider
                      style={styles.settingsModalSlider}
                      minimumValue={0}
                      maximumValue={1}
                      value={
                        effectiveDuration > 0
                          ? modalSliderPos !== null
                            ? modalSliderPos
                            : Math.min(1, Math.max(0, effectiveCurrentTime / effectiveDuration))
                          : 0
                      }
                      onValueChange={(val) => {
                        setModalSliderPos(val);
                      }}
                      onSlidingComplete={(val) => {
                        const targetSec = val * (effectiveDuration || 1);
                        setModalSliderPos(null);
                        handleSeekFromModal(targetSec);
                      }}
                      minimumTrackTintColor="#ff0000"
                      maximumTrackTintColor="rgba(255, 255, 255, 0.2)"
                      thumbTintColor="#ff0000"
                      thumbSize={14}
                      trackHeight={4}
                    />
                  </View>

                  <View style={styles.progressActionsRow}>
                    <TouchableOpacity
                      style={styles.progressMiniBtn}
                      onPress={() => handleSkipFromModal(-10)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="play-back" size={16} color="#ffffff" />
                      <Text style={styles.progressMiniBtnText}>-10s</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.progressPlayPauseBtn}
                      onPress={handleTogglePlayFromModal}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={effectiveIsPlaying ? 'pause' : 'play'}
                        size={22}
                        color="#ffffff"
                        style={effectiveIsPlaying ? undefined : { marginLeft: 2 }}
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.progressMiniBtn}
                      onPress={() => handleSkipFromModal(10)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="play-forward" size={16} color="#ffffff" />
                      <Text style={styles.progressMiniBtnText}>+10s</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.settingsDivider} />

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
                  onPress={handleToggleResizeModeFromModal}
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
                    >
                      {effectiveResizeMode === 'cover'
                        ? 'Fit to Screen (Normal)'
                        : effectiveResizeMode === 'stretch'
                        ? 'Stretch to Screen'
                        : 'Original (Fit)'}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setSettingsSubView('screenfit');
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ marginLeft: 6 }}
                    >
                      <Ionicons name="chevron-forward" size={16} color="rgba(255, 255, 255, 0.45)" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>

                {/* Loop Video Option */}
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={handleToggleLoopFromModal}
                  activeOpacity={0.7}
                >
                  <View style={styles.settingsRowLeft}>
                    <Ionicons name="repeat-outline" size={20} color="#ffffff" />
                    <Text style={styles.settingsRowLabel}>Loop video</Text>
                  </View>
                  <View style={styles.settingsRowRight}>
                    <Text style={[styles.settingsRowValue, effectiveLoop && { color: '#535aff', fontWeight: '700' }]}>
                      {effectiveLoop ? 'On' : 'Off'}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Picture-in-Picture (PiP) Option */}
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => handleTogglePipFromModal()}
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
                    <TouchableOpacity
                      onPress={() => {
                        setSettingsSubView('pip');
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ marginLeft: 2 }}
                    >
                      <Ionicons name="chevron-forward" size={16} color="rgba(255, 255, 255, 0.45)" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* 2. Quality Sub-Menu */}
            {settingsSubView === 'quality' && (
              <View>
                <View style={styles.settingsSubHeader}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setSettingsSubView('main')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="arrow-back" size={20} color="#ffffff" />
                  </TouchableOpacity>
                  <View style={styles.subHeaderTitleWrap}>
                    <Text style={styles.settingsTitle}>Quality for current video</Text>
                    <Text style={styles.settingsSubTitle}>Applied immediately to player</Text>
                  </View>
                </View>

                <View style={styles.settingsDivider} />

                <ScrollView style={styles.subOptionsScroll} showsVerticalScrollIndicator={false}>
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

            {/* 4. Screen Fit Sub-Menu */}
            {settingsSubView === 'screenfit' && (
              <View>
                <View style={styles.settingsSubHeader}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setSettingsSubView('main')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="arrow-back" size={20} color="#ffffff" />
                  </TouchableOpacity>
                  <View style={styles.subHeaderTitleWrap}>
                    <Text style={styles.settingsTitle}>Screen fit & Aspect ratio</Text>
                    <Text style={styles.settingsSubTitle}>Customize video framing and aspect ratio</Text>
                  </View>
                </View>

                <View style={styles.settingsDivider} />

                <ScrollView style={styles.subOptionsScroll} showsVerticalScrollIndicator={false}>
                  {[
                    {
                      id: 'cover' as ScreenFitMode,
                      title: 'Fit to Screen (Normal Mode)',
                      desc: 'Standard portrait view below mobile status bar & island',
                      icon: 'expand-outline' as const,
                      color: '#535aff',
                    },
                    {
                      id: 'stretch' as ScreenFitMode,
                      title: 'Stretch to Screen (Stretch)',
                      desc: 'Stretches video to fill complete width and height without crop',
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
            {/* 3. Playback Speed Sub-Menu */}
            {settingsSubView === 'speed' && (
              <View>
                <View style={styles.settingsSubHeader}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setSettingsSubView('main')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="arrow-back" size={20} color="#ffffff" />
                  </TouchableOpacity>
                  <View style={styles.subHeaderTitleWrap}>
                    <Text style={styles.settingsTitle}>Playback speed</Text>
                  </View>
                </View>

                <View style={styles.settingsDivider} />

                <ScrollView style={styles.subOptionsScroll} showsVerticalScrollIndicator={false}>
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
              <View>
                <View style={styles.settingsSubHeader}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setSettingsSubView('main')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="arrow-back" size={20} color="#ffffff" />
                  </TouchableOpacity>
                  <View style={styles.subHeaderTitleWrap}>
                    <Text style={styles.settingsTitle}>Picture-in-Picture (PiP)</Text>
                    <Text style={styles.settingsSubTitle}>Continue watching in a floating mini player</Text>
                  </View>
                </View>

                <View style={styles.settingsDivider} />

                <ScrollView style={styles.subOptionsScroll} showsVerticalScrollIndicator={false}>
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
        </Pressable>
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
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
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
  settingsSheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingBottom: 28,
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
});