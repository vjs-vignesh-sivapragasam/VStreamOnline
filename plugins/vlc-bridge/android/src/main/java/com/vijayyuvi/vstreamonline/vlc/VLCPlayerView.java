package com.vijayyuvi.vstreamonline.vlc;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.widget.FrameLayout;

import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.events.RCTEventEmitter;

import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.Media;
import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.util.VLCVideoLayout;

import java.util.ArrayList;

public class VLCPlayerView extends FrameLayout {
    private VLCVideoLayout videoLayout;
    private LibVLC libVLC;
    private MediaPlayer mediaPlayer;
    private String currentUrl;
    private boolean isPaused = false;
    private boolean isMuted = false;
    private float playbackRate = 1.0f;
    private String resizeMode = "contain";
    private boolean hasLoaded = false;
    private long lastProgressDispatchTime = 0;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    public VLCPlayerView(Context context) {
        super(context);
        init(context);
    }

    private void init(Context context) {
        setBackgroundColor(0xFF000000);

        videoLayout = new VLCVideoLayout(context);
        addView(videoLayout, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));

        try {
            ArrayList<String> options = new ArrayList<>();
            options.add("--no-drop-late-frames");
            options.add("--no-skip-frames");
            options.add("--rtsp-tcp");
            options.add("-v");

            libVLC = new LibVLC(context, options);
            mediaPlayer = new MediaPlayer(libVLC);
            mediaPlayer.attachViews(videoLayout, null, true, false);

            setupEventListener();
        } catch (Throwable e) {
            e.printStackTrace();
            emitError("Failed to initialize LibVLC engine: " + e.getMessage());
        }
    }

    private void setupEventListener() {
        if (mediaPlayer == null) return;

        mediaPlayer.setEventListener(event -> {
            switch (event.type) {
                case MediaPlayer.Event.Buffering:
                    float bufferPercent = event.getBuffering();
                    emitBuffer(bufferPercent < 100f);
                    break;

                case MediaPlayer.Event.Playing:
                    emitBuffer(false);
                    emitReadyForDisplay();
                    checkAndEmitLoad();
                    emitAudioAndTextTracks();
                    break;

                case MediaPlayer.Event.Paused:
                    emitBuffer(false);
                    break;

                case MediaPlayer.Event.LengthChanged:
                    checkAndEmitLoad();
                    break;

                case MediaPlayer.Event.TimeChanged:
                    long timeMs = event.getTimeChanged();
                    long now = System.currentTimeMillis();
                    if (now - lastProgressDispatchTime >= 250) {
                        lastProgressDispatchTime = now;
                        emitProgress(timeMs);
                    }
                    break;

                case MediaPlayer.Event.EndReached:
                    emitEnd();
                    break;

                case MediaPlayer.Event.EncounteredError:
                    emitError("LibVLC playback error encountered");
                    break;
            }
        });
    }

    public void setUrl(@Nullable String url) {
        if (url == null || url.trim().isEmpty()) {
            currentUrl = null;
            if (mediaPlayer != null) {
                mediaPlayer.stop();
            }
            return;
        }

        if (url.equals(currentUrl) && mediaPlayer != null && mediaPlayer.isPlaying()) {
            return;
        }

        currentUrl = url.trim();
        hasLoaded = false;
        startPlayback(currentUrl);
    }

    public void setHeaders(@Nullable ReadableMap headers) {
        // Reserved for future custom header injection
    }

    private void startPlayback(String url) {
        if (libVLC == null || mediaPlayer == null) return;

        try {
            mediaPlayer.stop();

            Media media;
            if (url.startsWith("/")) {
                media = new Media(libVLC, url);
            } else {
                media = new Media(libVLC, Uri.parse(url));
            }

            media.setHWDecoderEnabled(true, false);
            mediaPlayer.setMedia(media);
            media.release();

            mediaPlayer.setVolume(isMuted ? 0 : 100);
            mediaPlayer.setRate(playbackRate);
            applyResizeMode();

            if (!isPaused) {
                mediaPlayer.play();
            }
        } catch (Throwable e) {
            e.printStackTrace();
            emitError("Failed to open media stream: " + e.getMessage());
        }
    }

    public void setPaused(boolean paused) {
        this.isPaused = paused;
        if (mediaPlayer == null) return;

        if (paused) {
            if (mediaPlayer.isPlaying()) {
                mediaPlayer.pause();
            }
        } else {
            if (!mediaPlayer.isPlaying()) {
                mediaPlayer.play();
            }
        }
    }

    public void setMuted(boolean muted) {
        this.isMuted = muted;
        if (mediaPlayer != null) {
            mediaPlayer.setVolume(muted ? 0 : 100);
        }
    }

    public void setRate(float rate) {
        this.playbackRate = rate > 0 ? rate : 1.0f;
        if (mediaPlayer != null) {
            mediaPlayer.setRate(this.playbackRate);
        }
    }

    public void setResizeMode(@Nullable String mode) {
        this.resizeMode = mode != null ? mode : "contain";
        applyResizeMode();
    }

    private void applyResizeMode() {
        if (mediaPlayer == null) return;

        if ("cover".equalsIgnoreCase(resizeMode)) {
            mediaPlayer.setAspectRatio("16:9");
            mediaPlayer.setScale(0);
        } else if ("stretch".equalsIgnoreCase(resizeMode)) {
            mediaPlayer.setAspectRatio(null);
            mediaPlayer.setScale(1.0f);
        } else { // "contain" or default
            mediaPlayer.setAspectRatio(null);
            mediaPlayer.setScale(0);
        }
    }

    public void seekTo(double seconds) {
        if (mediaPlayer != null) {
            long targetMs = (long) (seconds * 1000);
            mediaPlayer.setTime(Math.max(0, targetMs));
        }
    }

    public void play() {
        setPaused(false);
    }

    public void pause() {
        setPaused(true);
    }

    public void selectAudioTrack(int trackId) {
        if (mediaPlayer != null) {
            mediaPlayer.setAudioTrack(trackId);
            emitAudioAndTextTracks();
        }
    }

    public void selectTextTrack(int trackId) {
        if (mediaPlayer != null) {
            mediaPlayer.setSpuTrack(trackId);
            emitAudioAndTextTracks();
        }
    }

    public void disableTextTrack() {
        if (mediaPlayer != null) {
            mediaPlayer.setSpuTrack(-1);
            emitAudioAndTextTracks();
        }
    }

    public void setVolume(float volume) {
        if (mediaPlayer != null) {
            int vol = Math.max(0, Math.min(100, (int) (volume * 100)));
            mediaPlayer.setVolume(isMuted ? 0 : vol);
        }
    }

    private void checkAndEmitLoad() {
        if (mediaPlayer == null || hasLoaded) return;

        long lengthMs = mediaPlayer.getLength();
        if (lengthMs > 0) {
            hasLoaded = true;
            double durationSec = lengthMs / 1000.0;
            double currentSec = mediaPlayer.getTime() / 1000.0;

            WritableMap map = Arguments.createMap();
            map.putDouble("duration", durationSec);
            map.putDouble("currentTime", Math.max(0, currentSec));

            WritableMap naturalSize = Arguments.createMap();
            naturalSize.putInt("width", 1920);
            naturalSize.putInt("height", 1080);
            naturalSize.putString("orientation", "landscape");
            map.putMap("naturalSize", naturalSize);

            map.putArray("audioTracks", getAudioTracksArray());
            map.putArray("textTracks", getTextTracksArray());

            dispatchEvent("onLoad", map);
        }
    }

    private void emitProgress(long timeMs) {
        if (mediaPlayer == null) return;

        double curSec = Math.max(0, timeMs / 1000.0);
        long lengthMs = mediaPlayer.getLength();
        double durSec = lengthMs > 0 ? (lengthMs / 1000.0) : 0;

        WritableMap map = Arguments.createMap();
        map.putDouble("currentTime", curSec);
        map.putDouble("duration", durSec);
        map.putDouble("playableDuration", curSec + 30.0);
        map.putDouble("seekableDuration", durSec);

        dispatchEvent("onProgress", map);
    }

    private void emitBuffer(boolean isBuffering) {
        WritableMap map = Arguments.createMap();
        map.putBoolean("isBuffering", isBuffering);
        dispatchEvent("onBuffer", map);
    }

    private void emitReadyForDisplay() {
        WritableMap map = Arguments.createMap();
        dispatchEvent("onReadyForDisplay", map);
    }

    private void emitEnd() {
        WritableMap map = Arguments.createMap();
        dispatchEvent("onEnd", map);
    }

    private void emitError(String message) {
        WritableMap map = Arguments.createMap();
        WritableMap err = Arguments.createMap();
        err.putString("message", message);
        err.putInt("code", -1);
        map.putMap("error", err);
        dispatchEvent("onError", map);
    }

    private void emitAudioAndTextTracks() {
        WritableMap audioMap = Arguments.createMap();
        audioMap.putArray("audioTracks", getAudioTracksArray());
        dispatchEvent("onAudioTracks", audioMap);

        WritableMap textMap = Arguments.createMap();
        textMap.putArray("textTracks", getTextTracksArray());
        dispatchEvent("onTextTracks", textMap);
    }

    private WritableArray getAudioTracksArray() {
        WritableArray arr = Arguments.createArray();
        if (mediaPlayer == null) return arr;

        MediaPlayer.TrackDescription[] tracks = mediaPlayer.getAudioTracks();
        if (tracks != null) {
            int selected = mediaPlayer.getAudioTrack();
            for (MediaPlayer.TrackDescription t : tracks) {
                if (t.id != -1) {
                    WritableMap m = Arguments.createMap();
                    m.putInt("index", t.id);
                    m.putString("title", t.name != null ? t.name : ("Audio Track " + t.id));
                    m.putString("language", "");
                    m.putBoolean("selected", t.id == selected);
                    arr.pushMap(m);
                }
            }
        }
        return arr;
    }

    private WritableArray getTextTracksArray() {
        WritableArray arr = Arguments.createArray();
        if (mediaPlayer == null) return arr;

        MediaPlayer.TrackDescription[] tracks = mediaPlayer.getSpuTracks();
        if (tracks != null) {
            int selected = mediaPlayer.getSpuTrack();
            for (MediaPlayer.TrackDescription t : tracks) {
                if (t.id != -1) {
                    WritableMap m = Arguments.createMap();
                    m.putInt("index", t.id);
                    m.putString("title", t.name != null ? t.name : ("Subtitle " + t.id));
                    m.putString("language", "");
                    m.putBoolean("selected", t.id == selected);
                    arr.pushMap(m);
                }
            }
        }
        return arr;
    }

    private void dispatchEvent(String eventName, WritableMap eventData) {
        mainHandler.post(() -> {
            Context context = getContext();
            if (context instanceof ReactContext) {
                try {
                    ((ReactContext) context)
                            .getJSModule(RCTEventEmitter.class)
                            .receiveEvent(getId(), eventName, eventData);
                } catch (Exception ignored) {
                }
            }
        });
    }

    public void cleanUp() {
        if (mediaPlayer != null) {
            try {
                mediaPlayer.stop();
                mediaPlayer.detachViews();
                mediaPlayer.release();
            } catch (Throwable ignored) {
            }
            mediaPlayer = null;
        }

        if (libVLC != null) {
            try {
                libVLC.release();
            } catch (Throwable ignored) {
            }
            libVLC = null;
        }
    }
}
