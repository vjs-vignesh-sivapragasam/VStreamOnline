import React, { createContext, useContext, useState, useRef, useCallback, useMemo, ReactNode } from 'react';
import { youTubeService, YouTubeVideoDetails, YouTubeVideoItem } from '@/services/YouTubeService';

export interface ActiveYouTubeVideo {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration?: string;
  views?: string;
  published?: string;
}

export interface YouTubePlayerContextType {
  currentVideo: ActiveYouTubeVideo | null;
  videoDetails: YouTubeVideoDetails | null;
  streamUrl: string | null;
  isPlaying: boolean;
  isBuffering: boolean;
  isMinimized: boolean;
  currentTime: number;
  duration: number;
  seekTarget: number | null;
  playbackError: string | null;
  currentQuality: string;
  playbackSpeed: number;
  isLooping: boolean;
  availableQualities: string[];
  setPlaybackSpeed: (speed: number) => void;
  setIsLooping: (loop: boolean) => void;
  changeQuality: (quality: string) => Promise<void>;
  playVideo: (video: ActiveYouTubeVideo) => Promise<void>;
  pauseVideo: () => void;
  resumeVideo: () => void;
  togglePlay: () => void;
  minimize: () => void;
  expand: () => void;
  close: () => void;
  seekTo: (seconds: number) => void;
  clearSeekTarget: () => void;
  updateProgress: (currentTime: number, duration: number) => void;
  setIsBuffering: (buffering: boolean) => void;
  setPlaybackError: (error: string | null) => void;
  handlePlayerError: (error: string) => void;
  retryStream: () => void;
}

const YouTubePlayerContext = createContext<YouTubePlayerContextType | null>(null);

export const YouTubePlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentVideo, setCurrentVideo] = useState<ActiveYouTubeVideo | null>(null);
  const [videoDetails, setVideoDetails] = useState<YouTubeVideoDetails | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [currentQuality, setCurrentQuality] = useState<string>('Auto');
  const [playbackSpeed, setPlaybackSpeedState] = useState<number>(1.0);
  const [isLooping, setIsLooping] = useState<boolean>(false);

  const activeVideoIdRef = useRef<string | null>(null);
  const fallbackCountRef = useRef<number>(0);

  const playVideo = useCallback(async (video: ActiveYouTubeVideo) => {
    console.log(`[YouTubePlayer] ▶️ playVideo requested for ID: "${video.id}", Title: "${video.title}"`);
    activeVideoIdRef.current = video.id;
    fallbackCountRef.current = 0;
    setCurrentVideo(video);
    setVideoDetails(null);
    setStreamUrl(null);
    setPlaybackError(null);
    setCurrentQuality('Auto');
    setPlaybackSpeedState(1.0);
    setCurrentTime(0);
    setDuration(0);
    setIsBuffering(true);
    setIsPlaying(true);
    setIsMinimized(false);

    try {
      console.log(`[YouTubePlayer] ⏳ Calling youTubeService.getVideoDetails for: ${video.id}`);
      const details = await youTubeService.getVideoDetails(video.id);

      if (activeVideoIdRef.current !== video.id) {
        console.log(`[YouTubePlayer] ⏹️ Active video ID changed (current: ${activeVideoIdRef.current}), discarding result for ${video.id}`);
        return;
      }

      console.log(`[YouTubePlayer] ✅ Received videoDetails for: ${video.id}`);
      console.log(`[YouTubePlayer] 📊 Progressive streams: ${details.formats.progressive.length}, VideoAdaptive: ${details.formats.videoAdaptive.length}, AudioAdaptive: ${details.formats.audioAdaptive.length}`);

      setVideoDetails(details);
      if (details.duration) {
        setDuration(details.duration);
      }

      const chosenFormat =
        details.formats.progressive[0] ||
        details.formats.videoAdaptive.find((f) => f.container === 'mp4') ||
        details.formats.videoAdaptive[0];

      if (!chosenFormat) {
        const errMsg = 'No playable format returned from YouTube engine';
        console.error(`[YouTubePlayer] ❌ ${errMsg}`);
        setPlaybackError(errMsg);
        setIsBuffering(false);
        return;
      }

      console.log(`[YouTubePlayer] 🎬 Chosen format: ${chosenFormat.quality} (${chosenFormat.container}), itag: ${chosenFormat.itag}`);
      console.log(`[YouTubePlayer] 🌐 Direct CDN URL:`, chosenFormat.url ? chosenFormat.url.substring(0, 90) + '...' : 'none');
      console.log(`[YouTubePlayer] 🛡️ Proxy URL:`, chosenFormat.proxyUrl || 'none');

      // Use direct CDN URL directly for stable native AVPlayer / ExoPlayer playback
      const selectedUrl = chosenFormat.url || chosenFormat.proxyUrl || null;
      console.log(`[YouTubePlayer] 🚀 Setting active streamUrl to direct CDN:`, selectedUrl ? selectedUrl.substring(0, 90) + '...' : 'null');

      setStreamUrl(selectedUrl);
    } catch (err: any) {
      console.warn(`[YouTubePlayer] ⚠️ playVideo caught error:`, err?.message || err);
      setPlaybackError(err?.message || 'Could not load video stream');
      setIsBuffering(false);
    }
  }, []);

  const retryStream = useCallback(() => {
    console.log('[YouTubePlayer] 🔄 retryStream triggered');
    if (!videoDetails) {
      if (currentVideo) {
        playVideo(currentVideo);
      }
      return;
    }

    const chosenFormat =
      videoDetails.formats.progressive[0] ||
      videoDetails.formats.videoAdaptive.find((f) => f.container === 'mp4') ||
      videoDetails.formats.videoAdaptive[0];

    if (!chosenFormat) return;

    // Toggle between direct CDN URL and proxy URL
    if (streamUrl === chosenFormat.url && chosenFormat.proxyUrl) {
      console.log('[YouTubePlayer] 🔄 Switching to local engine proxy URL...');
      setStreamUrl(chosenFormat.proxyUrl);
      setPlaybackError(null);
      setIsBuffering(true);
    } else if (chosenFormat.url) {
      console.log('[YouTubePlayer] 🔄 Switching to direct CDN URL...');
      setStreamUrl(chosenFormat.url);
      setPlaybackError(null);
      setIsBuffering(true);
    } else {
      console.log('[YouTubePlayer] 🔄 Reloading stream URL...');
      const cur = streamUrl;
      setStreamUrl(null);
      setTimeout(() => setStreamUrl(cur), 200);
      setPlaybackError(null);
      setIsBuffering(true);
    }
  }, [videoDetails, currentVideo, playVideo, streamUrl]);

  const handlePlayerError = useCallback(
    (errorMsg: string) => {
      console.warn('[YouTubePlayer] ⚠️ handlePlayerError triggered with:', errorMsg);
      if (!videoDetails) {
        setPlaybackError(errorMsg);
        setIsBuffering(false);
        return;
      }

      const chosenFormat =
        videoDetails.formats.progressive[0] ||
        videoDetails.formats.videoAdaptive.find((f) => f.container === 'mp4') ||
        videoDetails.formats.videoAdaptive[0];

      if (!chosenFormat) {
        setPlaybackError(errorMsg);
        setIsBuffering(false);
        return;
      }

      // Auto-fallback: if currently on proxyUrl, switch to direct CDN URL
      if (streamUrl === chosenFormat.proxyUrl && chosenFormat.url && fallbackCountRef.current === 0) {
        console.log('[YouTubePlayer] 🔄 Auto-fallback from proxy to direct CDN URL...');
        fallbackCountRef.current += 1;
        setStreamUrl(chosenFormat.url);
        setPlaybackError(null);
        setIsBuffering(true);
        return;
      }

      // Auto-fallback: if currently on direct CDN URL, switch to proxyUrl
      if (streamUrl === chosenFormat.url && chosenFormat.proxyUrl && fallbackCountRef.current === 0) {
        console.log('[YouTubePlayer] 🔄 Auto-fallback from direct CDN to proxy URL...');
        fallbackCountRef.current += 1;
        setStreamUrl(chosenFormat.proxyUrl);
        setPlaybackError(null);
        setIsBuffering(true);
        return;
      }

      setPlaybackError(errorMsg);
      setIsBuffering(false);
    },
    [videoDetails, streamUrl]
  );

  const pauseVideo = useCallback(() => {
    console.log('[YouTubePlayer] ⏸️ pauseVideo called');
    setIsPlaying(false);
  }, []);

  const resumeVideo = useCallback(() => {
    console.log('[YouTubePlayer] ▶️ resumeVideo called');
    setIsPlaying(true);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      console.log('[YouTubePlayer] ⏯️ togglePlay -> now:', !prev ? 'playing' : 'paused');
      return !prev;
    });
  }, []);

  const minimize = useCallback(() => {
    console.log('[YouTubePlayer] 🔽 minimize to floating mini player bar');
    setIsMinimized(true);
  }, []);

  const expand = useCallback(() => {
    console.log('[YouTubePlayer] 🔼 expand to full watch screen');
    setIsMinimized(false);
  }, []);

  const close = useCallback(() => {
    console.log('[YouTubePlayer] ✖️ close player completely');
    activeVideoIdRef.current = null;
    setCurrentVideo(null);
    setVideoDetails(null);
    setStreamUrl(null);
    setPlaybackError(null);
    setCurrentQuality('Auto');
    setPlaybackSpeedState(1.0);
    setIsLooping(false);
    setIsPlaying(false);
    setIsBuffering(false);
    setIsMinimized(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const availableQualities = useMemo(() => {
    const qualities = new Set<string>();
    qualities.add('Auto');

    const allFormats = [
      ...(videoDetails?.formats?.progressive || []),
      ...(videoDetails?.formats?.videoAdaptive || []),
    ];

    allFormats.forEach((f) => {
      if (f.quality) {
        const match = f.quality.match(/\d+p/);
        if (match) {
          qualities.add(match[0]);
        } else if (f.quality && f.quality !== 'Standard') {
          qualities.add(f.quality);
        }
      }
    });

    // Always include standard YouTube quality choices so the user can freely select
    const standardQualities = ['1080p', '720p', '480p', '360p', '240p', '144p'];
    standardQualities.forEach((q) => qualities.add(q));

    const standardOrder = ['Auto', '2160p', '1440p', '1080p', '720p', '480p', '360p', '240p', '144p'];
    return standardOrder.filter((q) => qualities.has(q));
  }, [videoDetails]);

  const changeQuality = useCallback(
    async (quality: string) => {
      console.log(`[YouTubePlayer] 🎯 changeQuality requested: ${quality}`);
      setCurrentQuality(quality);

      if (!videoDetails?.formats) return;

      // Preserve current playback position accurately
      const resumePosition = currentTime;
      console.log(`[YouTubePlayer] ⏱️ Preserving playback position: ${resumePosition}s`);

      let chosenFormat: any = null;

      const allVideoFormats = [
        ...videoDetails.formats.progressive,
        ...videoDetails.formats.videoAdaptive,
      ];

      if (quality === 'Auto') {
        chosenFormat =
          videoDetails.formats.progressive.find((f) => f.quality.includes('720') || f.quality.includes('1080')) ||
          videoDetails.formats.progressive[0] ||
          videoDetails.formats.videoAdaptive.find((f) => f.container === 'mp4') ||
          videoDetails.formats.videoAdaptive[0];
      } else {
        const cleanQuality = quality.replace(/\D/g, ''); // e.g. "1080"

        // 1. First look for combined progressive format matching quality
        chosenFormat = videoDetails.formats.progressive.find((f) => f.quality.includes(cleanQuality));

        // 2. If not in progressive, look in videoAdaptive (prefer mp4, then webm)
        if (!chosenFormat) {
          chosenFormat =
            videoDetails.formats.videoAdaptive.find((f) => f.quality.includes(cleanQuality) && f.container === 'mp4') ||
            videoDetails.formats.videoAdaptive.find((f) => f.quality.includes(cleanQuality));
        }

        // 3. If exact format not found, gracefully pick closest available format
        if (!chosenFormat && allVideoFormats.length > 0) {
          const targetNum = parseInt(cleanQuality, 10) || 720;
          const sorted = [...allVideoFormats].sort((a, b) => {
            const numA = parseInt((a.quality.match(/\d+/) || ['360'])[0], 10);
            const numB = parseInt((b.quality.match(/\d+/) || ['360'])[0], 10);
            return Math.abs(numA - targetNum) - Math.abs(numB - targetNum);
          });
          chosenFormat = sorted[0];
        }
      }

      if (!chosenFormat) {
        console.warn(`[YouTubePlayer] ⚠️ No format found specifically matching ${quality}`);
        return;
      }

      const targetUrl = chosenFormat.url || chosenFormat.proxyUrl;
      console.log(`[YouTubePlayer] 🔄 New format chosen: ${chosenFormat.quality} (${chosenFormat.container})`);

      if (targetUrl === streamUrl) {
        console.log(`[YouTubePlayer] ℹ️ Already playing this URL, skipping reload`);
        return;
      }

      // Seamlessly switch stream and queue seek to resumePosition
      setSeekTarget(resumePosition);
      setStreamUrl(targetUrl || null);
      setIsBuffering(true);
      setPlaybackError(null);
    },
    [videoDetails, currentTime, streamUrl]
  );

  const setPlaybackSpeed = useCallback((speed: number) => {
    console.log(`[YouTubePlayer] ⚡ setPlaybackSpeed to: ${speed}x`);
    setPlaybackSpeedState(speed);
  }, []);

  const seekTo = useCallback((seconds: number) => {
    console.log('[YouTubePlayer] ⏩ seekTo:', seconds);
    setSeekTarget(seconds);
    setCurrentTime(seconds);
  }, []);

  const clearSeekTarget = useCallback(() => {
    setSeekTarget(null);
  }, []);

  const updateProgress = useCallback((cur: number, dur: number) => {
    setCurrentTime(cur);
    if (dur > 0) {
      setDuration(dur);
    }
  }, []);

  return (
    <YouTubePlayerContext.Provider
      value={{
        currentVideo,
        videoDetails,
        streamUrl,
        isPlaying,
        isBuffering,
        isMinimized,
        currentTime,
        duration,
        seekTarget,
        playbackError,
        currentQuality,
        playbackSpeed,
        isLooping,
        availableQualities,
        setPlaybackSpeed,
        setIsLooping,
        changeQuality,
        playVideo,
        pauseVideo,
        resumeVideo,
        togglePlay,
        minimize,
        expand,
        close,
        seekTo,
        clearSeekTarget,
        updateProgress,
        setIsBuffering,
        setPlaybackError,
        handlePlayerError,
        retryStream,
      }}
    >
      {children}
    </YouTubePlayerContext.Provider>
  );
};

export function useYouTubePlayer(): YouTubePlayerContextType {
  const context = useContext(YouTubePlayerContext);
  if (!context) {
    throw new Error('useYouTubePlayer must be used within a YouTubePlayerProvider');
  }
  return context;
}
