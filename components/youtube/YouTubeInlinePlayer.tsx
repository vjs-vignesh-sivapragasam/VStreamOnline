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

const { width } = Dimensions.get('window');

export type ScreenFitMode = 'cover' | 'hero' | 'stretch' | 'contain';

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
      // 1. Dark background to prevent white flash + full width progress bar styles
      var css = 'html, body, #player, .player-container, #player-container-id, .html5-video-player { background: #000000 !important; background-color: #000000 !important; } ' +
        'yt-progress-bar, .watch-page-progress-bar, .ytPlayerProgressBarHost, .ytPlayerProgressBarHostLowerPlayer, .ytPlayerProgressBarHostBottomEdge, .ytPlayerProgressBarHostBottomInset, .ytPlayerProgressBarHostCustom, .ytPlayerProgressBarDragContainer, .ytPlayerProgressBarProgressBar, .ytPlayerProgressBarProgressBarInset, .ytChapteredProgressBarHost, .ytFocusedChapterProgressBarLineHost, .ytProgressBarLineHost, .yt-progress-bar-line, .yt-chaptered-progress-bar-line, .yt-focused-chapter-progress-bar-line, .ytp-chrome-bottom, .ytp-progress-bar-container, .ytp-progress-bar, .ytp-progress-list, [class*="ytPlayerProgressBarHost"], [class*="ytPlayerProgressBarProgressBar"], [class*="ytPlayerProgressBarDragContainer"], [class*="watch-page-progress-bar"] { left: 0px !important; right: 0px !important; margin-left: 0px !important; margin-right: 0px !important; padding-left: 0px !important; padding-right: 0px !important; width: 100% !important; max-width: 100% !important; min-width: 100% !important; box-sizing: border-box !important; }';
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

const INJECTED_CLEAN_PLAYER_JS = `
  (function() {
    function injectStyle() {
      var existing = document.getElementById('agy-clean-yt-style');
      if (existing) return;
      var style = document.createElement('style');
      style.id = 'agy-clean-yt-style';
      style.textContent = \`
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

        /* 2. Expand player container and player-size to 100% full height */
        .player-container,
        .player-container.sticky-player,
        #player-container-id,
        .player-size,
        #player,
        .player-container .player-size,
        ytm-watch .player-size {
          top: 0 !important;
          bottom: 0 !important;
          left: 0 !important;
          right: 0 !important;
          width: 100% !important;
          height: 100% !important;
          min-height: 100% !important;
          max-height: 100% !important;
          padding-bottom: 0 !important;
          border: none !important;
          border-bottom: none !important;
          box-shadow: none !important;
        }

        /* 3. Force video element to fill the inline player frame completely */
        video,
        video.video-stream,
        video.html5-main-video {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          max-width: 100% !important;
          max-height: 100% !important;
          object-fit: cover !important;
        }

        .html5-video-container,
        .html5-video-player {
          position: absolute !important;
          top: 0 !important;
          bottom: 0 !important;
          left: 0 !important;
          right: 0 !important;
          width: 100% !important;
          height: 100% !important;
          max-height: 100% !important;
        }

        /* 4. Full width progress bar without left/right gaps across all mobile and web YouTube variants */
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
        [class*="watch-page-progress-bar"] {
          left: 0px !important;
          right: 0px !important;
          margin-left: 0px !important;
          margin-right: 0px !important;
          padding-left: 0px !important;
          padding-right: 0px !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 100% !important;
          box-sizing: border-box !important;
        }

        body[faux-fullscreen=true] .watch-page-progress-bar,
        .fullscreen-controls-always-on .watch-page-progress-bar {
          left: 0px !important;
          right: 0px !important;
        }

        div:has(> yt-progress-bar),
        div:has(> .watch-page-progress-bar),
        div:has(> [class*="ytPlayerProgressBar"]) {
          left: 0px !important;
          right: 0px !important;
          margin-left: 0px !important;
          margin-right: 0px !important;
          padding-left: 0px !important;
          padding-right: 0px !important;
          width: 100% !important;
          max-width: 100% !important;
        }

        .ytp-chrome-bottom {
          bottom: 0 !important;
          left: 0 !important;
          right: 0 !important;
          width: 100% !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
        }

        .ytp-progress-bar-container {
          position: absolute !important;
          bottom: 0 !important;
          left: 0 !important;
          right: 0 !important;
          width: 100% !important;
          padding: 0 !important;
          margin: 0 !important;
          height: 4px !important;
        }

        .ytp-progress-bar,
        .ytp-progress-list {
          left: 0 !important;
          right: 0 !important;
          width: 100% !important;
          padding: 0 !important;
          margin: 0 !important;
          border-radius: 0 !important;
        }

        /* 5. Hide duplicate/secondary progress bar and bottom borders */
        .ytm-progress-bar,
        ytm-progress-bar,
        .player-control-overlay .progress-bar,
        .player-control-container > .progress-bar,
        .player-control-overlay > .progress-bar,
        .thin-scrubber,
        .ytp-cued-thumbnail-overlay {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          height: 0 !important;
          pointer-events: none !important;
          border: none !important;
        }

        /* 6. Hide duplicate title & everything below the video */
        ytm-slim-video-metadata-renderer,
        .slim-video-metadata-header,
        .slim-video-information-holder,
        ytm-slim-owner-renderer,
        .watch-below-the-player,
        #related,
        ytm-item-section-renderer,
        ytm-comment-section-renderer,
        ytm-pivot-bar-renderer,
        ytm-engagement-panel-section-list-renderer,
        .ytm-autonav-bar {
          display: none !important;
          visibility: hidden !important;
          height: 0 !important;
          overflow: hidden !important;
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

        /* 10. Clean 16:9 container frame without page scrolling */
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          background-color: #000000 !important;
        }
      \`;
      (document.head || document.documentElement).appendChild(style);
    }

    injectStyle();

    // Check if element or its ancestor matches settings trigger
    function isSettingsTarget(el) {
      if (!el) return false;
      if (el.closest) {
        var found = el.closest(
          '.ytp-settings-button, ' +
          'button[aria-label*="Settings" i], ' +
          'button[aria-label*="settings" i], ' +
          'button[aria-label*="Playback settings" i], ' +
          '[data-action="settings"], ' +
          '.ytm-settings-button'
        );
        if (found) return true;
      }
      var curr = el;
      for (var i = 0; i < 4 && curr; i++) {
        var aria = (curr.getAttribute && curr.getAttribute('aria-label')) || '';
        var title = (curr.getAttribute && curr.getAttribute('title')) || '';
        var cls = curr.className || '';
        if (typeof cls === 'string' && cls.toLowerCase().includes('setting')) return true;
        if (aria.toLowerCase().includes('setting')) return true;
        if (title.toLowerCase().includes('setting')) return true;
        curr = curr.parentElement;
      }
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

    window.addEventListener('click', handleSettingsIntercept, true);
    window.addEventListener('touchend', handleSettingsIntercept, true);
    window.addEventListener('pointerup', handleSettingsIntercept, true);
    document.addEventListener('click', handleSettingsIntercept, true);
    document.addEventListener('touchend', handleSettingsIntercept, true);
    document.addEventListener('pointerup', handleSettingsIntercept, true);

    // Swipe left / right gesture on video to go back to home screen
    var swipeStartX = 0;
    var swipeStartY = 0;
    var swipeStartTime = 0;

    window.addEventListener('touchstart', function(e) {
      if (e.touches && e.touches.length === 1) {
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
        swipeStartTime = Date.now();
      }
    }, { passive: true });

    window.addEventListener('touchend', function(e) {
      if (e.changedTouches && e.changedTouches.length === 1) {
        var dX = e.changedTouches[0].clientX - swipeStartX;
        var dY = e.changedTouches[0].clientY - swipeStartY;
        var dTime = Date.now() - swipeStartTime;
        // 1. Detect deliberate vertical swipe down (dY > 45) to minimize video
        if (dTime < 800 && dY > 45 && dY > Math.abs(dX) * 1.2) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'SWIPE_DOWN_MINIMIZE'
            }));
          }
          return;
        }

        // 2. Detect deliberate horizontal swipe left (dX < -45) or swipe right (dX > 60)
        if (dTime < 800 && Math.abs(dX) > 45 && Math.abs(dX) > Math.abs(dY) * 1.3) {
          if (dX < -45 || dX > 60) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'SWIPE_EXIT',
                direction: dX < 0 ? 'left' : 'right'
              }));
            }
          }
        }
      }
    }, { passive: true });


    
    // Background playback keep-alive watchdog & Lock Screen Media Controls
    function setupBackgroundKeepAlive() {
      var v = document.querySelector('video');
      if (v && !v._hasAgyKeepAlive) {
        v._hasAgyKeepAlive = true;

        // 1. Setup MediaSession for Lock Screen & Control Center play/pause
        if ('mediaSession' in navigator) {
          try {
            navigator.mediaSession.setActionHandler('play', function() {
              window._agyUserPaused = false;
              if (v) v.play().catch(function() {});
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'PLAY_STATE',
                  isPlaying: true
                }));
              }
            });

            navigator.mediaSession.setActionHandler('pause', function() {
              window._agyUserPaused = true;
              if (v) v.pause();
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
            });

            navigator.mediaSession.setActionHandler('seekforward', function(details) {
              var skipTime = (details && details.seekOffset) || 10;
              if (v) v.currentTime = Math.min(v.currentTime + skipTime, v.duration || 0);
            });

            navigator.mediaSession.setActionHandler('stop', function() {
              window._agyUserPaused = true;
              if (v) v.pause();
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'PLAY_STATE',
                  isPlaying: false
                }));
              }
            });
          } catch(err) {}
        }

        // 2. Track user manual play/pause clicks inside web player controls
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
      var v = document.querySelector('video');
      if (v && !v._hasAgyProgressListeners) {
        v._hasAgyProgressListeners = true;
        v.addEventListener('timeupdate', function() {
          if (window.ReactNativeWebView && v.duration) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'PROGRESS',
              currentTime: v.currentTime,
              duration: v.duration
            }));
          }
        });
        v.addEventListener('play', function() {
          window._agyUserPaused = false;
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'PLAY_STATE',
              isPlaying: true
            }));
          }
        });
        v.addEventListener('pause', function() {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'PLAY_STATE',
              isPlaying: false
            }));
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
      }
    }

    function forceFullVideoAndPlay() {
      // 1. Expand all container elements to full 100% height
      var containers = [
        '#player-container-id',
        '.player-container',
        '.player-size',
        '#player',
        '.html5-video-player',
        '.html5-video-container'
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
          el.style.setProperty('border-bottom', 'none', 'important');
        });
      });

      // 2. Expand video element to cover entire 16:9 container
      var v = document.querySelector('video');
      if (v) {
        v.muted = false;
        v.style.setProperty('top', '0px', 'important');
        v.style.setProperty('left', '0px', 'important');
        v.style.setProperty('width', '100%', 'important');
        v.style.setProperty('height', '100%', 'important');
        v.style.setProperty('object-fit', 'cover', 'important');
        if (v.paused) {
          v.play().catch(function() {});
        }
      }

      // 3. Make all mobile & desktop progress bar elements 100% full width (0 left/right gap)
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
        '.ytp-progress-list'
      ];
      pbSelectors.forEach(function(sel) {
        document.querySelectorAll(sel).forEach(function(el) {
          el.style.setProperty('left', '0px', 'important');
          el.style.setProperty('right', '0px', 'important');
          el.style.setProperty('width', '100%', 'important');
          el.style.setProperty('max-width', '100%', 'important');
          el.style.setProperty('min-width', '100%', 'important');
          el.style.setProperty('margin-left', '0px', 'important');
          el.style.setProperty('margin-right', '0px', 'important');
          el.style.setProperty('padding-left', '0px', 'important');
          el.style.setProperty('padding-right', '0px', 'important');
          el.style.setProperty('box-sizing', 'border-box', 'important');
          if (el.parentElement && el.parentElement.tagName === 'DIV' && el.parentElement.offsetWidth < el.offsetWidth) {
            el.parentElement.style.setProperty('left', '0px', 'important');
            el.parentElement.style.setProperty('right', '0px', 'important');
            el.parentElement.style.setProperty('width', '100%', 'important');
            el.parentElement.style.setProperty('margin-left', '0px', 'important');
            el.parentElement.style.setProperty('margin-right', '0px', 'important');
            el.parentElement.style.setProperty('padding-left', '0px', 'important');
            el.parentElement.style.setProperty('padding-right', '0px', 'important');
          }
        });
      });

      // 4. Hide duplicate secondary progress bar
      var secondaryBars = document.querySelectorAll('.ytm-progress-bar, ytm-progress-bar, .player-control-overlay .progress-bar, .thin-scrubber');
      secondaryBars.forEach(function(el) {
        el.style.setProperty('display', 'none', 'important');
      });

      // 5. Sound & quality configuration
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
          if (typeof player.playVideo === 'function') {
            player.playVideo();
          }
        } catch(e) {}
      }

      var unmuteBtn = document.querySelector('.ytp-unmute, .ytp-unmute-inner, [class*="unmute"], button[aria-label*="unmute" i]');
      if (unmuteBtn) {
        try { unmuteBtn.click(); } catch(e) {}
      }

      var playBtn = document.querySelector('.ytp-large-play-button, .player-control-play-pause-icon');
      if (playBtn && document.querySelector('video') && document.querySelector('video').paused) {
        try { playBtn.click(); } catch(e) {}
      }

      attachVideoListeners();
      setupBackgroundKeepAlive();
    }

    forceFullVideoAndPlay();

    var count = 0;
    var timer = setInterval(function() {
      count++;
      injectStyle();
      forceFullVideoAndPlay();
      if (count > 25) clearInterval(timer);
    }, 200);

    var observer = new MutationObserver(function() {
      injectStyle();
      var unmute = document.querySelector('.ytp-unmute, .ytp-unmute-inner, [class*="unmute"]');
      if (unmute) {
        try { unmute.click(); unmute.remove(); } catch(e) {}
      }
      var secondaryBars = document.querySelectorAll('.ytm-progress-bar, ytm-progress-bar, .player-control-overlay .progress-bar, .thin-scrubber');
      secondaryBars.forEach(function(el) {
        el.style.setProperty('display', 'none', 'important');
      });
      var vid = document.querySelector('video');
      if (vid && vid.style.objectFit !== 'cover') {
        vid.style.setProperty('top', '0px', 'important');
        vid.style.setProperty('left', '0px', 'important');
        vid.style.setProperty('width', '100%', 'important');
        vid.style.setProperty('height', '100%', 'important');
        vid.style.setProperty('object-fit', 'cover', 'important');
      }
      pbSelectors.forEach(function(sel) {
        document.querySelectorAll(sel).forEach(function(el) {
          if (el.style.left !== '0px' || el.style.width !== '100%') {
            el.style.setProperty('left', '0px', 'important');
            el.style.setProperty('right', '0px', 'important');
            el.style.setProperty('width', '100%', 'important');
            el.style.setProperty('max-width', '100%', 'important');
            el.style.setProperty('min-width', '100%', 'important');
            el.style.setProperty('margin-left', '0px', 'important');
            el.style.setProperty('margin-right', '0px', 'important');
            el.style.setProperty('padding-left', '0px', 'important');
            el.style.setProperty('padding-right', '0px', 'important');
            el.style.setProperty('box-sizing', 'border-box', 'important');
          }
        });
      });
      attachVideoListeners();
      setupBackgroundKeepAlive();

      // Clean up any web popup/bottom sheet YouTube attempts to render in the background
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
}) => {
  useKeepAwake('YOUTUBE_PLAYER_PLAYBACK');
  useEffect(() => {
    if (screenFitMode) {
      setVideoResizeMode(screenFitMode);
      setWebResizeMode(screenFitMode);
    }
  }, [screenFitMode]);


  const [showControls, setShowControls] = useState(false);
  const [videoResizeMode, setVideoResizeMode] = useState<ScreenFitMode>(screenFitMode || 'cover');
  const [feedbackPill, setFeedbackPill] = useState<FeedbackPillData | null>(null);
  const feedbackTimerRef = useRef<any>(null);
  const [isSliding, setIsSliding] = useState(false);
  const [sliderPos, setSliderPos] = useState(0);
  // Default to react-native-video (AVPlayer on iOS, ExoPlayer on Android) for native MP4 streaming
  const [useKSPlayer, setUseKSPlayer] = useState(false);
  const [useWebFallback, setUseWebFallback] = useState(false);
  const [showPosterShield, setShowPosterShield] = useState(true);

  useEffect(() => {
    setShowPosterShield(true);
  }, [videoId]);



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
  const [settingsSubView, setSettingsSubView] = useState<'main' | 'quality' | 'speed' | 'screenfit'>('main');

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
  const effectiveCurrentTime = isWebActive ? (webCurrentTime || currentTime) : currentTime;
  const effectiveDuration = isWebActive ? (webDuration || duration) : duration;
  const effectiveIsPlaying = isWebActive ? webIsPlaying : isPlaying;
  const effectiveQuality = isWebActive ? webQuality : (currentQuality || 'Auto');
  const effectiveSpeed = isWebActive ? webSpeed : (playbackSpeed || 1.0);
  const effectiveLoop = isWebActive ? webLoop : isLooping;
  const effectiveResizeMode = isWebActive ? webResizeMode : videoResizeMode;

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

  const handleTogglePlayFromModal = useCallback(async () => {
    if (await isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (isWebActive) {
      const nextState = !effectiveIsPlaying;
      setWebIsPlaying(nextState);
      webViewRef.current?.injectJavaScript(`
        (function() {
          var v = document.querySelector('video');
          if (v) {
            window._agyUserPaused = ${!effectiveIsPlaying};
            if (v.paused) v.play().catch(function() {});
            else v.pause();
          }
        })();
        true;
      `);
    } else {
      onTogglePlay();
    }
  }, [isWebActive, effectiveIsPlaying, onTogglePlay]);

  const handleChangeQualityFromModal = useCallback((q: string) => {
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
          var p = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
          if (p) {
            if (typeof p.setPlaybackQualityRange === 'function') {
              p.setPlaybackQualityRange('${targetQ}', '${targetQ}');
            }
            if (typeof p.setPlaybackQuality === 'function') {
              p.setPlaybackQuality('${targetQ}');
            }
          }
        })();
        true;
      `);
      onChangeQuality?.(q);
    } else {
      onChangeQuality?.(q);
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
      setShowControls(false);
    }, 3500);
  }, []);

  const cycleScreenFitMode = useCallback((current: ScreenFitMode): ScreenFitMode => {
    switch (current) {
      case 'cover':
        return 'hero';
      case 'hero':
        return 'contain';
      case 'contain':
        return 'cover';
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
            var v = document.querySelector('video');
            if (v) {
              v.style.setProperty('object-fit', '${fitCss}', 'important');
            }
          })();
          true;
        `);
      }

      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      let label = 'Fit to Screen (Normal)';
      let icon: keyof typeof Ionicons.glyphMap = 'expand-outline';
      if (next === 'hero') {
        label = 'Netflix Hero Banner';
        icon = 'film';
      } else if (next === 'stretch') {
        label = 'Stretch to Screen (Stretch)';
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
    if (isPlaying && showControls && !isSliding) {
      scheduleControlsHide();
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isPlaying, showControls, isSliding, scheduleControlsHide]);

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
      const newTime = Math.max(0, Math.min(duration || 1, currentTime + offsetSec));
      console.log(`[YouTubeInlinePlayer] ⏩ Skip ${offsetSec}s -> new target: ${newTime}s`);
      onSeek(newTime);
      scheduleControlsHide();
    },
    [currentTime, duration, onSeek, scheduleControlsHide]
  );

  const isHero = effectiveResizeMode === 'hero';
  const effectiveTopInset = Math.max(topInset || 0, Platform.OS === 'ios' ? 59 : 28);
  const heroHeight = Math.round(width * (9 / 16)) + effectiveTopInset;
  const heroTopPadding = isHero ? effectiveTopInset + 14 : 10;
  const progressPct = duration > 0 ? (isSliding ? sliderPos : currentTime / duration) : 0;

  return (
    <View style={[styles.container, isHero && { aspectRatio: undefined, height: heroHeight }]}>


      {/* Subtle top gradient in Hero mode for status bar readability */}
      {isHero ? (
        <LinearGradient
          colors={['rgba(0, 0, 0, 0.65)', 'rgba(0, 0, 0, 0.15)', 'transparent']}
          style={[styles.heroTopGradient, { height: effectiveTopInset + 20 }]}
          pointerEvents="none"
        />
      ) : null}

      {isWebActive ? (
        <WebView
          ref={webViewRef}
          key={videoId}
          source={{
            uri: `https://m.youtube.com/watch?v=${videoId}`,
          }}
          style={[StyleSheet.absoluteFill, { backgroundColor: '#000000' }]}
          containerStyle={{ backgroundColor: '#000000' }}
          opaque={false}
          injectedJavaScriptBeforeContentLoaded={INJECTED_BEFORE_CONTENT_JS}
          allowsInlineMediaPlayback={true}
          allowsPictureInPictureMediaPlayback={true}
          allowsAirPlayForMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsFullscreenVideo={true}
          scrollEnabled={false}
          bounces={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          injectedJavaScript={INJECTED_CLEAN_PLAYER_JS}
          userAgent={
            Platform.OS === 'ios'
              ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
              : 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
          }
          onLoadProgress={({ nativeEvent }) => {
            if (nativeEvent.progress > 0.2) {
              webViewRef.current?.injectJavaScript(INJECTED_CLEAN_PLAYER_JS);
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
            webViewRef.current?.injectJavaScript(INJECTED_CLEAN_PLAYER_JS);
            setTimeout(() => {
              setShowPosterShield(false);
            }, 800);
          }}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (!data || typeof data !== 'object') return;
              if (data.type === 'OPEN_SETTINGS') {
                if (typeof data.currentTime === 'number') setWebCurrentTime(data.currentTime);
                if (typeof data.duration === 'number' && data.duration > 0) setWebDuration(data.duration);
                if (typeof data.isPlaying === 'boolean') setWebIsPlaying(data.isPlaying);
                setSettingsSubView('main');
                setSettingsModalVisible(true);
              } else if (data.type === 'PROGRESS') {
                if (typeof data.currentTime === 'number') {
                  setWebCurrentTime(data.currentTime);
                  if (data.currentTime > 0) setShowPosterShield(false);
                }
                if (typeof data.duration === 'number' && data.duration > 0) setWebDuration(data.duration);
                onProgress(data.currentTime || 0, data.duration || 0);
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
              } else if (data.type === 'PLAY_STATE') {
                if (typeof data.isPlaying === 'boolean') {
                  setWebIsPlaying(data.isPlaying);
                  if (data.isPlaying) setShowPosterShield(false);
                  if (data.isPlaying !== isPlaying) {
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
              if (!isSliding) {
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
            ignoreSilentSwitch="ignore"
            progressUpdateInterval={250}
            onProgress={(e) => {
              if (!isSliding) {
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

      {/* Tap Overlay to reveal/hide controls */}
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
        <View
          style={[
            styles.gestureFeedbackPill,
            feedbackPill.mode === 'hero' && styles.heroFeedbackPill,
          ]}
          pointerEvents="none"
        >
          {feedbackPill.mode === 'hero' ? (
            <View style={styles.netflixBadgeN}>
              <Text style={styles.netflixBadgeNText}>N</Text>
            </View>
          ) : (
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
          )}
          <Text
            style={[
              styles.gestureFeedbackText,
              feedbackPill.mode === 'hero' && { color: '#ffffff', fontWeight: '800' },
            ]}
          >
            {feedbackPill.label}
          </Text>
        </View>
      ) : null}

      {/* Controls Overlay (native player only) */}
      {showControls && (
        <View style={styles.controlsOverlay} pointerEvents="box-none">
          {/* Top Bar: Real YouTube Icons (Chevron Down, Autoplay, Cast, CC, Screen Fit, Settings) */}
          <View style={[styles.topBar, { paddingTop: heroTopPadding }]}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={onMinimize}
              activeOpacity={0.7}
              hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
            >
              <Ionicons name="arrow-back" size={24} color="#ffffff" />
            </TouchableOpacity>

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
                {effectiveResizeMode === 'hero' ? (
                  <View style={styles.heroTopIconWrap}>
                    <Ionicons name="film" size={17} color="#E50914" />
                  </View>
                ) : (
                  <Ionicons
                    name={
                      effectiveResizeMode === 'cover'
                        ? 'expand-outline'
                        : effectiveResizeMode === 'stretch'
                        ? 'scan-outline'
                        : 'contract-outline'
                    }
                    size={19}
                    color={effectiveResizeMode === 'stretch' ? '#30d158' : '#ffffff'}
                  />
                )}
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

          {/* Center Playback Controls: Real YouTube Circular Controls */}
          <View style={styles.centerControls} pointerEvents="box-none">
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
                onTogglePlay();
                scheduleControlsHide();
              }}
              activeOpacity={0.8}
            >
              {isBuffering ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={32}
                  color="#ffffff"
                  style={{ marginLeft: isPlaying ? 0 : 3 }}
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

          {/* Bottom Bar: Real YouTube Time Pill, Chapter Pill & Fullscreen Icon */}
          <View style={styles.bottomMetaRow}>
            <View style={styles.bottomLeftPills}>
              {/* Time Pill */}
              <View style={styles.timePill}>
                <Text style={styles.timePillText}>
                  {formatTime(isSliding ? sliderPos * duration : currentTime)} / {formatTime(duration)}
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
                  {currentQuality || '480p'}
                </Text>
                <Ionicons name="chevron-forward" size={11} color="rgba(255, 255, 255, 0.7)" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.fullscreenButton}
              onPress={onFullScreen}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="scan-outline" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ONLY ONE Single Progress Bar at Bottom Position */}
      {duration > 0 && (
        showControls ? (
          <View style={styles.bottomScrubberContainer}>
            <Slider
              style={styles.bottomSlider}
              minimumValue={0}
              maximumValue={1}
              value={progressPct}
              onValueChange={(val) => {
                setIsSliding(true);
                setSliderPos(val);
              }}
              onSlidingComplete={(val) => {
                setIsSliding(false);
                onSeek(val * (duration || 1));
                scheduleControlsHide();
              }}
              minimumTrackTintColor="#ff0000"
              maximumTrackTintColor="rgba(255, 255, 255, 0.35)"
              thumbTintColor="#ff0000"
              thumbSize={12}
              trackHeight={3}
            />
          </View>
        ) : (
          <View style={styles.slimScrubTrack} pointerEvents="none">
            <View
              style={[
                styles.slimScrubFill,
                { width: `${Math.min(100, Math.max(0, (currentTime / duration) * 100))}%` },
              ]}
            />
          </View>
        )
      )}
        </>
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

      {/* Player Settings Bottom Sheet Modal (Active in Both Web and Native Modes) */}
      <Modal
        visible={settingsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSettingsModalVisible(false)}
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
                        effectiveResizeMode === 'hero'
                          ? 'film'
                          : effectiveResizeMode === 'cover'
                          ? 'expand-outline'
                          : effectiveResizeMode === 'stretch'
                          ? 'scan-outline'
                          : 'contract-outline'
                      }
                      size={20}
                      color={
                        effectiveResizeMode === 'hero'
                          ? '#E50914'
                          : effectiveResizeMode === 'stretch'
                          ? '#30d158'
                          : effectiveResizeMode === 'cover'
                          ? '#535aff'
                          : '#ffffff'
                      }
                    />
                    <Text style={styles.settingsRowLabel}>Screen fit</Text>
                  </View>
                  <View style={styles.settingsRowRight}>
                    {effectiveResizeMode === 'hero' ? (
                      <View style={styles.netflixMiniBadge}>
                        <Text style={styles.netflixMiniBadgeN}>N</Text>
                        <Text style={styles.netflixMiniBadgeText}>Netflix Hero Banner</Text>
                      </View>
                    ) : (
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
                    )}
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
                          if (await isHapticsSupported()) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }
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
                    <Text style={styles.settingsSubTitle}>Customize video framing and hero banner</Text>
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
                      id: 'hero' as ScreenFitMode,
                      title: 'Netflix Hero Banner',
                      desc: 'Full top height coverage over Dynamic Island & status bar',
                      icon: 'film' as const,
                      color: '#E50914',
                      badge: 'NETFLIX HERO',
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
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[styles.optionItemText, isSelected && { color: '#ffffff', fontWeight: '700' }]}>
                              {item.title}
                            </Text>
                            {item.badge ? (
                              <View style={styles.netflixBadgePill}>
                                <Text style={styles.netflixBadgePillText}>{item.badge}</Text>
                              </View>
                            ) : null}
                          </View>
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
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};


const styles = StyleSheet.create({
  floatingBackBtn: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  slimScrubTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
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
  heroTopGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  heroBottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 56,
    zIndex: 15,
  },
  heroTopIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(229, 9, 20, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.45)',
  },
  heroFeedbackPill: {
    backgroundColor: 'rgba(18, 18, 20, 0.95)',
    borderColor: '#E50914',
    borderWidth: 1.2,
  },
  netflixHeroFloatingBadge: {
    position: 'absolute',
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.5)',
    gap: 5,
    zIndex: 15,
  },
  netflixBadgeN: {
    width: 14,
    height: 14,
    borderRadius: 2,
    backgroundColor: '#E50914',
    alignItems: 'center',
    justifyContent: 'center',
  },
  netflixBadgeNText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 12,
  },
  netflixBadgeText: {
    color: '#E50914',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  netflixMiniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.4)',
    gap: 5,
  },
  netflixMiniBadgeN: {
    color: '#E50914',
    fontSize: 11,
    fontWeight: '900',
  },
  netflixMiniBadgeText: {
    color: '#E50914',
    fontSize: 12,
    fontWeight: '700',
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
  netflixBadgePill: {
    backgroundColor: '#E50914',
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 4,
  },
  netflixBadgePillText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconButton: {
    padding: 4,
  },
  centerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
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
  },
  bottomMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
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
    padding: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomScrubberContainer: {
    position: 'absolute',
    bottom: -8,
    left: -6,
    right: -6,
    height: 20,
    justifyContent: 'center',
    zIndex: 30,
  },
  bottomSlider: {
    width: '100%',
    height: 20,
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