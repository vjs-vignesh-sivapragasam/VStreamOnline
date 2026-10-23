import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { TouchableOpacity, Animated, Platform } from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { MenuComponentRef, MenuView } from '@react-native-menu/menu';
import { WebMenu } from "@/components/WebMenuView";
import { styles } from "../coreplayer/styles";
import {
    usePlayerState,
    useUIState,
    useEnhancedPlayerSettings,
    useTimers,
    usePlayerAnimations,
    hideControls,
    CONSTANTS,
    calculateProgress,
    performSeek,
    buildSettingsActions,
    buildSubtitleActions,
    buildAudioActions,
    buildStreamActions,
    calculateSliderValues,
    ArtworkBackground,
    WaitingLobby,
    CenterControls,
    ProgressBar,
    ContentFitLabel,
    SubtitleDisplay,       // ← was already exported, just never used here
    SubtitlePosition,
    ErrorDisplay,
    ExtendedMediaPlayerProps
} from "../coreplayer";
import { View, Text } from "../Themed";
import { GlassView } from 'expo-glass-effect';

const { KSPlayerView: VideoComponent } = require('@/components/ksplayer/KSPlayerView');

const RNResizeMode = { COVER: 'cover', CONTAIN: 'contain', STRETCH: 'stretch' };

const MenuWrapper: React.FC<any> = (props) => {
    if (Platform.OS === 'web') return <WebMenu {...props} />;
    return <MenuView {...props} />;
};

export const MediaPlayer: React.FC<ExtendedMediaPlayerProps> = ({
    videoUrl,
    title,
    back: onBack,
    progress,
    artwork,
    updateProgress,
    onPlaybackError,
    streams = [],
    currentStreamIndex = 0,
    onStreamChange
}) => {
    const videoRef = useRef<any>(null);
    const shouldAutoHideControls = useRef(true);
    const isSeeking = useRef(false);
    const isHideControlsScheduled = useRef(false);
    const wasPlayingBeforeSeek = useRef(false);
    const lastKnownTimeRef = useRef<number>(0);
    const hasReportedErrorRef = useRef(false);
    const seekTimeoutRef = useRef<any>(null);
    const progressUpdateTimerRef = useRef<any>(null);

    const playerState = usePlayerState();
    const uiState = useUIState();
    const settings = useEnhancedPlayerSettings();
    const timers = useTimers();
    const animations = usePlayerAnimations();

    const setShowControls = uiState.setShowControls;
    const controlsOpacity = animations.controlsOpacity;
    const bufferOpacity = animations.bufferOpacity;
    const contentFitLabelOpacity = animations.contentFitLabelOpacity;
    const clearTimer = timers.clearTimer;
    const setTimer = timers.setTimer;
    const clearAllTimers = timers.clearAllTimers;

    const audioMenuRef = useRef<MenuComponentRef>(null);
    const subtitleMenuRef = useRef<MenuComponentRef>(null);
    const settingsMenuRef = useRef<MenuComponentRef>(null);
    const streamMenuRef = useRef<MenuComponentRef>(null);

    const [contentFit, setContentFit] = useState<string>(RNResizeMode.COVER);
    const [showContentFitLabel, setShowContentFitLabel] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [videoError, setVideoError] = useState<string | null>(null);
    const [availableAudioTracks, setAvailableAudioTracks] = useState<any[]>([]);
    const [availableTextTracks, setAvailableTextTracks] = useState<any[]>([]);
    const [selectedAudioTrack, setSelectedAudioTrack] = useState<number>(-1);
    const [selectedTextTrack, setSelectedTextTrack] = useState<number>(-1);
    // NEW: current subtitle line text from the native player
    const [currentSubtitleText, setCurrentSubtitleText] = useState<string>('');

    // ─── Restore progress ─────────────────────────────────────────────────────
    useEffect(() => {
        if (playerState.isReady && progress && progress > 0 && playerState.duration > 0) {
            const currentTime = (progress / 100) * playerState.duration;
            isSeeking.current = true;
            wasPlayingBeforeSeek.current = false;
            videoRef.current?.seek(currentTime);
            playerState.setCurrentTime(currentTime);
            const id = setTimeout(() => { isSeeking.current = false; }, 300);
            return () => clearTimeout(id);
        }
    }, [playerState.isReady, playerState.duration, progress]);

    const showControlsTemporarily = useCallback(() => {
        setShowControls(true);
        Animated.timing(controlsOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
        clearTimer('hideControls');
        isHideControlsScheduled.current = false;

        if (shouldAutoHideControls.current) {
            isHideControlsScheduled.current = true;
            setTimer('hideControls', () => {
                hideControls(setShowControls, controlsOpacity);
                isHideControlsScheduled.current = false;
            }, CONSTANTS.CONTROLS_AUTO_HIDE_DELAY);
        }
    }, [controlsOpacity, clearTimer, setTimer, setShowControls]);

    useEffect(() => {
        lastKnownTimeRef.current = playerState.currentTime;
    }, [playerState.currentTime]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (updateProgress) {
                updateProgress({ progress: calculateProgress(lastKnownTimeRef.current, playerState.duration) });
            }
            clearAllTimers();
            if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
            if (progressUpdateTimerRef.current) clearInterval(progressUpdateTimerRef.current);
        };
    }, [clearAllTimers, updateProgress, playerState.duration]);

    // Progress save interval
    useEffect(() => {
        if (!updateProgress || !playerState.isReady || playerState.duration <= 0) return;
        progressUpdateTimerRef.current = setInterval(() => {
            if (playerState.currentTime !== undefined && playerState.duration > 0) {
                updateProgress({ progress: calculateProgress(playerState.currentTime, playerState.duration) });
            }
        }, 60 * 1000);
        return () => { if (progressUpdateTimerRef.current) clearInterval(progressUpdateTimerRef.current); };
    }, [playerState.isReady, playerState.duration, updateProgress]);

    // Auto-hide controls
    useEffect(() => {
        if (!isPaused && uiState.showControls && shouldAutoHideControls.current && !isHideControlsScheduled.current) {
            showControlsTemporarily();
        }
    }, [isPaused, uiState.showControls, showControlsTemporarily]);

    const showContentFitLabelTemporarily = useCallback(() => {
        setShowContentFitLabel(true);
        Animated.timing(contentFitLabelOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
        clearTimer('contentFitLabel');
        setTimer('contentFitLabel', () => {
            Animated.timing(contentFitLabelOpacity, { toValue: 0, duration: 300, useNativeDriver: true })
                .start(() => setShowContentFitLabel(false));
        }, CONSTANTS.CONTENT_FIT_LABEL_DELAY);
    }, [contentFitLabelOpacity, clearTimer, setTimer]);

    // ─── Video event handlers ─────────────────────────────────────────────────

    const handleLoad = useCallback((data: any) => {
        playerState.setIsReady(true);
        playerState.setDuration(data.duration);
        playerState.setIsBuffering(false);
        setVideoError(null);
        hasReportedErrorRef.current = false;

        Animated.timing(bufferOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();

        if (data.audioTracks?.length > 0) {
            setAvailableAudioTracks(data.audioTracks);
            if (selectedAudioTrack === -1) {
                setSelectedAudioTrack(0);
                settings.setSelectedAudioTrack(0);
            }
        }

        if (data.textTracks?.length > 0) {
            setAvailableTextTracks(data.textTracks);
        }

        // Clear any subtitle text from previous video
        setCurrentSubtitleText('');
    }, [bufferOpacity, playerState, selectedAudioTrack, settings]);

    const handleAudioTracks = useCallback((data: { audioTracks: any[] }) => {
        if (data.audioTracks?.length > 0) {
            setAvailableAudioTracks(data.audioTracks);
            if (selectedAudioTrack === -1) {
                setSelectedAudioTrack(0);
                settings.setSelectedAudioTrack(0);
            }
        }
    }, [selectedAudioTrack, settings]);

    const handleTextTracks = useCallback((data: { textTracks: any[] }) => {
        if (data.textTracks?.length > 0) {
            setAvailableTextTracks(data.textTracks);
        }
    }, []);

    // NEW: receive per-frame subtitle text from native and update state
    const handleSubtitleText = useCallback((data: { text: string }) => {
        setCurrentSubtitleText(data.text ?? '');
    }, []);

    const handleProgress = useCallback((data: any) => {
        if (!playerState.isDragging && !isSeeking.current) {
            playerState.setCurrentTime(data.currentTime);
        }
    }, [playerState]);

    const handleBuffer = useCallback((data: any) => {
        if (!isSeeking.current && !playerState.isDragging) {
            playerState.setIsBuffering(data.isBuffering);
            Animated.timing(bufferOpacity, {
                toValue: data.isBuffering ? 1 : 0,
                duration: 200,
                useNativeDriver: true
            }).start();
        }
    }, [bufferOpacity, playerState]);

    const handleError = useCallback((error: any) => {
        playerState.setIsBuffering(false);
        playerState.setIsReady(false);

        if (onPlaybackError && !hasReportedErrorRef.current) {
            hasReportedErrorRef.current = true;
            const msg = error?.error?.message || error?.message || 'Unable to load video';
            onPlaybackError({ error: msg });
            setIsPaused(true);
        } else if (!onPlaybackError) {
            const msg = error?.error?.message || error?.message || 'Unable to load video.';
            setVideoError(msg);
            setIsPaused(true);
        }
    }, [onPlaybackError, playerState]);

    const handleEnd = useCallback(() => {
        setIsPaused(true);
        playerState.setIsPlaying(false);
    }, [playerState]);

    // ─── Controls ─────────────────────────────────────────────────────────────

    const togglePlayPause = useCallback(() => {
        if (!playerState.isReady) return;
        setIsPaused(!isPaused);
        playerState.setIsPlaying(isPaused);
        showControlsTemporarily();
    }, [isPaused, playerState, showControlsTemporarily]);

    const seekTo = useCallback((seconds: number) => {
        if (!playerState.isReady || playerState.duration <= 0 || !videoRef.current) return;
        if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);

        const clampedTime = performSeek(seconds, playerState.duration);
        wasPlayingBeforeSeek.current = !isPaused;
        if (!isPaused) setIsPaused(true);

        playerState.setIsBuffering(true);
        Animated.timing(bufferOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
        isSeeking.current = true;

        videoRef.current.seek(clampedTime);
        playerState.setCurrentTime(clampedTime);

        seekTimeoutRef.current = setTimeout(() => {
            isSeeking.current = false;
            playerState.setIsBuffering(false);
            Animated.timing(bufferOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
            if (wasPlayingBeforeSeek.current) setIsPaused(false);
        }, 300);

        showControlsTemporarily();
    }, [playerState, isPaused, showControlsTemporarily, bufferOpacity]);

    const skipTime = useCallback((seconds: number) => {
        if (!playerState.isReady) return;
        seekTo(playerState.currentTime + seconds);
    }, [playerState.currentTime, seekTo, playerState.isReady]);

    const cycleContentFit = useCallback(() => {
        const opts = [RNResizeMode.COVER, RNResizeMode.CONTAIN, RNResizeMode.STRETCH];
        const next = opts[(opts.indexOf(contentFit) + 1) % opts.length];
        setContentFit(next);
        showContentFitLabelTemporarily();
        showControlsTemporarily();
    }, [contentFit, showControlsTemporarily, showContentFitLabelTemporarily]);

    const handleOverlayPress = useCallback(() => {
        if (uiState.showControls) {
            hideControls(setShowControls, controlsOpacity);
        } else {
            showControlsTemporarily();
        }
    }, [uiState.showControls, showControlsTemporarily, controlsOpacity, setShowControls]);

    const handleSliderChange = useCallback((value: number) => {
        if (!playerState.isReady || playerState.duration <= 0) return;
        playerState.setIsDragging(true);
        playerState.setDragPosition(value);
    }, [playerState]);

    const handleSliderComplete = useCallback((value: number) => {
        if (playerState.isReady && playerState.duration > 0 && videoRef.current) {
            if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);

            const newTime = value * playerState.duration;
            wasPlayingBeforeSeek.current = !isPaused;
            if (!isPaused) setIsPaused(true);

            playerState.setIsBuffering(true);
            Animated.timing(bufferOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
            isSeeking.current = true;

            videoRef.current.seek(newTime);
            playerState.setCurrentTime(newTime);

            seekTimeoutRef.current = setTimeout(() => {
                isSeeking.current = false;
                if (wasPlayingBeforeSeek.current) {
                    setIsPaused(false);
                } else {
                    playerState.setIsBuffering(false);
                    Animated.timing(bufferOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
                }
            }, 150);
        }
        playerState.setIsDragging(false);
    }, [playerState, isPaused, bufferOpacity]);

    // ─── Track selection ──────────────────────────────────────────────────────

    const handleAudioSelect = useCallback((index: number) => {
        settings.setSelectedAudioTrack(index);
        setSelectedAudioTrack(index);
        videoRef.current?.selectAudioTrack(index);
        videoRef.current?.seek(lastKnownTimeRef.current);
    }, [settings]);

    const handleTextTrackSelect = useCallback((index: number) => {
        setSelectedTextTrack(index);
        if (index === -1) {
            videoRef.current?.disableTextTrack();
            setCurrentSubtitleText('');   // clear immediately on "Off"
        } else {
            videoRef.current?.selectTextTrack(index);
        }
    }, []);

    const handleSubtitlePositionSelect = useCallback((position: SubtitlePosition) => {
        settings.setSubtitlePosition(position);
        showControlsTemporarily();
    }, [settings, showControlsTemporarily]);

    const handleSubtitleDelaySelect = useCallback((delayMs: number) => {
        settings.setSubtitleDelay(delayMs);
        showControlsTemporarily();
    }, [settings, showControlsTemporarily]);

    const handleStreamSelect = useCallback((index: number) => {
        if (onStreamChange) onStreamChange(index);
        showControlsTemporarily();
    }, [onStreamChange, showControlsTemporarily]);

    const handlePlaybackSpeedSelect = useCallback((speed: number) => {
        settings.setPlaybackSpeed(speed);
        showControlsTemporarily();
    }, [showControlsTemporarily, settings]);

    const handleMuteToggle = useCallback(() => {
        settings.setIsMuted(!settings.isMuted);
        showControlsTemporarily();
    }, [settings, showControlsTemporarily]);

    const handleSliderStart = useCallback(() => {
        playerState.setIsDragging(true);
        showControlsTemporarily();
    }, [showControlsTemporarily, playerState]);

    const handleSkipBackward = useCallback(() => skipTime(-10), [skipTime]);
    const handleSkipForward = useCallback(() => skipTime(30), [skipTime]);

    const getContentFitIcon = useCallback((): "fit-screen" | "crop" | "fullscreen" => {
        switch (contentFit) {
            case RNResizeMode.CONTAIN: return 'fit-screen';
            case RNResizeMode.COVER: return 'crop';
            case RNResizeMode.STRETCH: return 'fullscreen';
            default: return 'crop';
        }
    }, [contentFit]);

    const adaptTracks = useCallback((tracks: any[]): any[] =>
        tracks.map((track, index) => ({
            id: track.index ?? index,
            label: track.title || track.language || `Track ${index + 1}`,
            language: track.language,
            name: track.title || track.language || `Track ${index + 1}`
        }))
        , []);

    // ─── Menu actions ─────────────────────────────────────────────────────────

    const settingsActions = useMemo(() => buildSettingsActions(settings.playbackSpeed), [settings.playbackSpeed]);

    const subtitleActions = useMemo(() => {
        const adaptedTracks = adaptTracks(availableTextTracks);
        return buildSubtitleActions(
            [],
            selectedTextTrack >= 0 ? selectedTextTrack : -1,
            false,
            adaptedTracks,
            settings.subtitlePosition,
            settings.subtitleDelay,
            selectedTextTrack
        );
    }, [availableTextTracks, selectedTextTrack, settings.subtitlePosition, settings.subtitleDelay, adaptTracks]);

    const audioActions = useMemo(() =>
        buildAudioActions(adaptTracks(availableAudioTracks), selectedAudioTrack),
        [availableAudioTracks, selectedAudioTrack, adaptTracks]
    );

    const streamActions = useMemo(() =>
        buildStreamActions(streams, currentStreamIndex),
        [streams, currentStreamIndex]
    );

    const { displayTime, sliderValue } = useMemo(() => calculateSliderValues(
        playerState.isDragging, playerState.dragPosition,
        playerState.currentTime, playerState.duration
    ), [playerState.isDragging, playerState.dragPosition, playerState.currentTime, playerState.duration]);

    // ─── Unified menu action handler ──────────────────────────────────────────

    const handleMenuAction = useCallback((id: string) => {
        if (id.startsWith('speed-')) {
            const speed = parseFloat(id.split('-')[1]);
            if (!isNaN(speed)) handlePlaybackSpeedSelect(speed);
        } else if (id === 'subtitle-track-off') {
            handleTextTrackSelect(-1);
        } else if (id.startsWith('subtitle-track-')) {
            const index = parseInt(id.split('subtitle-track-')[1]);
            if (!isNaN(index)) handleTextTrackSelect(index);
        } else if (id.startsWith('position-')) {
            const position = parseInt(id.split('-')[1]);
            if (!isNaN(position)) handleSubtitlePositionSelect(position);
        } else if (id.startsWith('delay_')) {
            const delayMs = parseInt(id.replace('delay_', ''));
            if (!isNaN(delayMs)) handleSubtitleDelaySelect(delayMs);
        } else if (id.startsWith('audio-')) {
            const index = parseInt(id.split('-')[1]);
            if (!isNaN(index)) handleAudioSelect(index);
        } else if (id.startsWith('stream-')) {
            const index = parseInt(id.split('-')[1]);
            if (!isNaN(index)) handleStreamSelect(index);
        }
    }, [handlePlaybackSpeedSelect, handleTextTrackSelect, handleSubtitlePositionSelect,
        handleSubtitleDelaySelect, handleAudioSelect, handleStreamSelect]);

    const handleWebAction = useCallback((id: string) => handleMenuAction(id), [handleMenuAction]);
    const handleNativeAction = useCallback(({ nativeEvent }: any) => handleMenuAction(nativeEvent.event), [handleMenuAction]);

    const handleMenuOpen = useCallback(() => {
        shouldAutoHideControls.current = false;
        clearTimer('hideControls');
    }, [clearTimer]);

    const handleMenuClose = useCallback(() => {
        shouldAutoHideControls.current = true;
        showControlsTemporarily();
    }, [showControlsTemporarily]);

    const handleBack = useCallback(() => {
        onBack({ message: '', progress: calculateProgress(lastKnownTimeRef.current, playerState.duration), player: "native" });
    }, [playerState.duration, onBack]);

    const handleRetry = useCallback(() => {
        setVideoError(null);
        hasReportedErrorRef.current = false;
        playerState.setIsReady(false);
        playerState.setIsBuffering(true);
        videoRef.current?.seek(0);
        setIsPaused(false);
    }, [playerState]);

    if (videoError) {
        return <ErrorDisplay error={videoError} onBack={handleBack} onRetry={handleRetry} />;
    }

    return (
        <View style={styles.container}>
            <VideoComponent
                ref={videoRef}
                url={videoUrl}
                headers={{}}
                paused={isPaused}
                muted={settings.isMuted}
                rate={settings.playbackSpeed}
                resizeMode={contentFit}
                style={styles.video}
                onLoad={handleLoad}
                onProgress={handleProgress}
                onBuffer={handleBuffer}
                onError={handleError}
                onEnd={handleEnd}
                onAudioTracks={handleAudioTracks}
                onTextTracks={handleTextTracks}
                onSubtitleText={handleSubtitleText}   // NEW
            />

            <ArtworkBackground
                artwork={artwork}
                isBuffering={playerState.isBuffering}
                hasStartedPlaying={playerState.isReady}
            />

            <WaitingLobby hasStartedPlaying={playerState.isReady} opacity={bufferOpacity} />

            {/* SUBTITLE DISPLAY – rendered over video, below controls */}
            <SubtitleDisplay
                subtitle={currentSubtitleText}
                position={settings.subtitlePosition}
            />

            <TouchableOpacity style={styles.touchArea} activeOpacity={1} onPress={handleOverlayPress} />

            {uiState.showControls && (
                <Animated.View style={[styles.controlsOverlay, { opacity: controlsOpacity }]} pointerEvents="box-none">
                    <View style={styles.topControls}>
                        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                            <Ionicons name="chevron-back" size={28} color="white" />
                        </TouchableOpacity>

                        <View style={styles.titleContainer}>
                            <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
                        </View>

                        <GlassView glassEffectStyle="clear" style={styles.topRightControls}>
                            {streams.length > 1 && (
                                <MenuWrapper
                                    style={{ zIndex: 1000 }}
                                    ref={streamMenuRef}
                                    title="Select Stream"
                                    onPressAction={Platform.OS === 'web' ? handleWebAction : handleNativeAction}
                                    actions={streamActions}
                                    shouldOpenOnLongPress={false}
                                    themeVariant="dark"
                                    onOpenMenu={handleMenuOpen}
                                    onCloseMenu={handleMenuClose}
                                >
                                    <TouchableOpacity style={styles.controlButton} onPress={() => {
                                        if (Platform.OS === 'android') streamMenuRef.current?.show();
                                    }}>
                                        <MaterialIcons name="ondemand-video" size={24} color="white" />
                                    </TouchableOpacity>
                                </MenuWrapper>
                            )}

                            <TouchableOpacity style={styles.controlButton} onPress={handleMuteToggle}>
                                <Ionicons name={settings.isMuted ? "volume-mute" : "volume-high"} size={24} color="white" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.controlButton} onPress={cycleContentFit}>
                                <MaterialIcons name={getContentFitIcon()} size={24} color="white" />
                            </TouchableOpacity>

                            {availableAudioTracks.length > 0 && (
                                <MenuWrapper
                                    style={{ zIndex: 1000 }}
                                    title="Audio Track"
                                    ref={audioMenuRef}
                                    onPressAction={Platform.OS === 'web' ? handleWebAction : handleNativeAction}
                                    actions={audioActions}
                                    shouldOpenOnLongPress={false}
                                    themeVariant="dark"
                                    onOpenMenu={handleMenuOpen}
                                    onCloseMenu={handleMenuClose}
                                >
                                    <TouchableOpacity style={styles.controlButton} onPress={() => {
                                        if (Platform.OS === 'android') audioMenuRef.current?.show();
                                    }}>
                                        <MaterialIcons name="multitrack-audio" size={24} color="white" />
                                    </TouchableOpacity>
                                </MenuWrapper>
                            )}

                            {availableTextTracks.length > 0 && (
                                <MenuWrapper
                                    style={{ zIndex: 1000 }}
                                    title="Subtitles"
                                    ref={subtitleMenuRef}
                                    onPressAction={Platform.OS === 'web' ? handleWebAction : handleNativeAction}
                                    actions={subtitleActions}
                                    shouldOpenOnLongPress={false}
                                    themeVariant="dark"
                                    onOpenMenu={handleMenuOpen}
                                    onCloseMenu={handleMenuClose}
                                >
                                    <TouchableOpacity style={styles.controlButton} onPress={() => {
                                        if (Platform.OS === 'android') subtitleMenuRef.current?.show();
                                    }}>
                                        <MaterialIcons name="closed-caption" size={24} color="white" />
                                    </TouchableOpacity>
                                </MenuWrapper>
                            )}

                            <MenuWrapper
                                style={{ zIndex: 1000 }}
                                title="Settings"
                                ref={settingsMenuRef}
                                onPressAction={Platform.OS === 'web' ? handleWebAction : handleNativeAction}
                                actions={settingsActions}
                                shouldOpenOnLongPress={false}
                                themeVariant="dark"
                                onOpenMenu={handleMenuOpen}
                                onCloseMenu={handleMenuClose}
                            >
                                <TouchableOpacity style={styles.controlButton} onPress={() => {
                                    if (Platform.OS === 'android') settingsMenuRef.current?.show();
                                }}>
                                    <MaterialIcons name="settings" size={24} color="white" />
                                </TouchableOpacity>
                            </MenuWrapper>
                        </GlassView>
                    </View>

                    <CenterControls
                        isPlaying={!isPaused}
                        isReady={playerState.isReady}
                        isBuffering={playerState.isBuffering}
                        onPlayPause={togglePlayPause}
                        onSkipBackward={handleSkipBackward}
                        onSkipForward={handleSkipForward}
                    />

                    <View style={styles.bottomControls}>
                        <ProgressBar
                            currentTime={displayTime}
                            duration={playerState.duration}
                            sliderValue={sliderValue}
                            isReady={playerState.isReady}
                            onValueChange={handleSliderChange}
                            onSlidingStart={handleSliderStart}
                            onSlidingComplete={handleSliderComplete}
                            showSpeed={settings.playbackSpeed !== 1.0}
                            playbackSpeed={settings.playbackSpeed}
                        />
                    </View>
                </Animated.View>
            )}

            <ContentFitLabel
                show={showContentFitLabel}
                contentFit={contentFit}
                opacity={contentFitLabelOpacity}
            />
        </View>
    );
};