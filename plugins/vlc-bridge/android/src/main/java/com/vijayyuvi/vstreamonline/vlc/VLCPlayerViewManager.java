package com.vijayyuvi.vstreamonline.vlc;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

import java.util.Map;

public class VLCPlayerViewManager extends SimpleViewManager<VLCPlayerView> {
    public static final String REACT_CLASS = "VLCPlayerView";

    public static final int COMMAND_SEEK_TO = 1;
    public static final int COMMAND_PLAY = 2;
    public static final int COMMAND_PAUSE = 3;
    public static final int COMMAND_SELECT_AUDIO_TRACK = 4;
    public static final int COMMAND_SELECT_TEXT_TRACK = 5;
    public static final int COMMAND_DISABLE_TEXT_TRACK = 6;
    public static final int COMMAND_SET_VOLUME = 7;
    public static final int COMMAND_ENTER_FULLSCREEN = 8;
    public static final int COMMAND_EXIT_FULLSCREEN = 9;

    @NonNull
    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @NonNull
    @Override
    protected VLCPlayerView createViewInstance(@NonNull ThemedReactContext reactContext) {
        return new VLCPlayerView(reactContext);
    }

    @Override
    public void onDropViewInstance(@NonNull VLCPlayerView view) {
        super.onDropViewInstance(view);
        view.cleanUp();
    }

    @ReactProp(name = "url")
    public void setUrl(VLCPlayerView view, @Nullable String url) {
        view.setUrl(url);
    }

    @ReactProp(name = "headers")
    public void setHeaders(VLCPlayerView view, @Nullable ReadableMap headers) {
        view.setHeaders(headers);
    }

    @ReactProp(name = "paused", defaultBoolean = false)
    public void setPaused(VLCPlayerView view, boolean paused) {
        view.setPaused(paused);
    }

    @ReactProp(name = "muted", defaultBoolean = false)
    public void setMuted(VLCPlayerView view, boolean muted) {
        view.setMuted(muted);
    }

    @ReactProp(name = "rate", defaultFloat = 1.0f)
    public void setRate(VLCPlayerView view, float rate) {
        view.setRate(rate);
    }

    @ReactProp(name = "resizeMode")
    public void setResizeMode(VLCPlayerView view, @Nullable String resizeMode) {
        view.setResizeMode(resizeMode);
    }

    @Nullable
    @Override
    public Map<String, Integer> getCommandsMap() {
        return MapBuilder.<String, Integer>builder()
                .put("seekTo", COMMAND_SEEK_TO)
                .put("play", COMMAND_PLAY)
                .put("pause", COMMAND_PAUSE)
                .put("selectAudioTrack", COMMAND_SELECT_AUDIO_TRACK)
                .put("selectTextTrack", COMMAND_SELECT_TEXT_TRACK)
                .put("disableTextTrack", COMMAND_DISABLE_TEXT_TRACK)
                .put("setVolume", COMMAND_SET_VOLUME)
                .put("enterFullscreen", COMMAND_ENTER_FULLSCREEN)
                .put("exitFullscreen", COMMAND_EXIT_FULLSCREEN)
                .build();
    }

    @Override
    public void receiveCommand(@NonNull VLCPlayerView root, String commandId, @Nullable ReadableArray args) {
        super.receiveCommand(root, commandId, args);
        if (commandId == null) return;
        switch (commandId) {
            case "seekTo":
                if (args != null && args.size() > 0) root.seekTo(args.getDouble(0));
                break;
            case "play":
                root.play();
                break;
            case "pause":
                root.pause();
                break;
            case "selectAudioTrack":
                if (args != null && args.size() > 0) root.selectAudioTrack(args.getInt(0));
                break;
            case "selectTextTrack":
                if (args != null && args.size() > 0) root.selectTextTrack(args.getInt(0));
                break;
            case "disableTextTrack":
                root.disableTextTrack();
                break;
            case "setVolume":
                if (args != null && args.size() > 0) root.setVolume((float) args.getDouble(0));
                break;
            case "enterFullscreen":
            case "exitFullscreen":
                break;
        }
    }

    @Override
    public void receiveCommand(@NonNull VLCPlayerView root, int commandId, @Nullable ReadableArray args) {
        switch (commandId) {
            case COMMAND_SEEK_TO:
                if (args != null && args.size() > 0) root.seekTo(args.getDouble(0));
                break;
            case COMMAND_PLAY:
                root.play();
                break;
            case COMMAND_PAUSE:
                root.pause();
                break;
            case COMMAND_SELECT_AUDIO_TRACK:
                if (args != null && args.size() > 0) root.selectAudioTrack(args.getInt(0));
                break;
            case COMMAND_SELECT_TEXT_TRACK:
                if (args != null && args.size() > 0) root.selectTextTrack(args.getInt(0));
                break;
            case COMMAND_DISABLE_TEXT_TRACK:
                root.disableTextTrack();
                break;
            case COMMAND_SET_VOLUME:
                if (args != null && args.size() > 0) root.setVolume((float) args.getDouble(0));
                break;
        }
    }

    @Nullable
    @Override
    public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
        return MapBuilder.<String, Object>builder()
                .put("onLoad", MapBuilder.of("registrationName", "onLoad"))
                .put("onProgress", MapBuilder.of("registrationName", "onProgress"))
                .put("onBuffer", MapBuilder.of("registrationName", "onBuffer"))
                .put("onError", MapBuilder.of("registrationName", "onError"))
                .put("onEnd", MapBuilder.of("registrationName", "onEnd"))
                .put("onReadyForDisplay", MapBuilder.of("registrationName", "onReadyForDisplay"))
                .put("onAudioTracks", MapBuilder.of("registrationName", "onAudioTracks"))
                .put("onTextTracks", MapBuilder.of("registrationName", "onTextTracks"))
                .build();
    }
}
