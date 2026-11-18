import React, { useRef, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { isHapticsSupported } from '@/utils/platform';

export interface MxPlayerGesturesProps {
  brightness: number; // 0.1 to 1.0
  onBrightnessChange: (brightness: number) => void;
  volume: number; // 0.0 to 1.0
  onVolumeChange: (volume: number) => void;
  isMuted: boolean;
  onMuteChange: (isMuted: boolean) => void;
  containerWidth: number;
  containerHeight: number;
  onTap: () => void;
  onDoubleTapLeft?: () => void;
  onDoubleTapRight?: () => void;
  children?: React.ReactNode;
}

export const MxPlayerGestures: React.FC<MxPlayerGesturesProps> = ({
  brightness,
  onBrightnessChange,
  volume,
  onVolumeChange,
  isMuted,
  onMuteChange,
  containerWidth,
  containerHeight,
  onTap,
  onDoubleTapLeft,
  onDoubleTapRight,
  children,
}) => {
  const [hudType, setHudType] = useState<'brightness' | 'volume' | null>(null);
  const [hudValue, setHudValue] = useState<number>(100);
  const [doubleTapSide, setDoubleTapSide] = useState<'left' | 'right' | null>(null);

  const hudOpacity = useRef(new Animated.Value(0)).current;
  const doubleTapOpacity = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const doubleTapTimerRef = useRef<NodeJS.Timeout | null>(null);

  const brightnessRef = useRef(brightness);
  brightnessRef.current = brightness;

  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  const lastTapTimeRef = useRef<number>(0);
  const lastTapSideRef = useRef<'left' | 'right' | null>(null);
  const singleTapTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showHud = useCallback((type: 'brightness' | 'volume', val: number) => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setHudType(type);
    setHudValue(val);
    Animated.timing(hudOpacity, {
      toValue: 1,
      duration: 100,
      useNativeDriver: true,
    }).start();
  }, [hudOpacity]);

  const hideHudDelayed = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      Animated.timing(hudOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setHudType(null);
      });
    }, 900);
  }, [hudOpacity]);

  const triggerDoubleTapFeedback = useCallback((side: 'left' | 'right') => {
    if (doubleTapTimerRef.current) clearTimeout(doubleTapTimerRef.current);
    setDoubleTapSide(side);
    doubleTapOpacity.setValue(1);
    if (isHapticsSupported()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    doubleTapTimerRef.current = setTimeout(() => {
      Animated.timing(doubleTapOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        setDoubleTapSide(null);
      });
    }, 500);
  }, [doubleTapOpacity]);

  const panResponder = useMemo(() => {
    let activeType: 'brightness' | 'volume' | 'none' = 'none';
    let startVal = 0;
    let isDragging = false;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 8;
      },
      onPanResponderGrant: (evt, _) => {
        const { locationX } = evt.nativeEvent;
        const screenW =
          containerWidth > 0
            ? containerWidth
            : Math.max(Dimensions.get('window').width, Dimensions.get('window').height);
        activeType = locationX < screenW / 2 ? 'brightness' : 'volume';
        startVal = activeType === 'brightness' ? brightnessRef.current : (isMutedRef.current ? 0 : volumeRef.current);
        isDragging = false;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (Math.abs(gestureState.dy) > 8) {
          isDragging = true;
          if (singleTapTimerRef.current) {
            clearTimeout(singleTapTimerRef.current);
            singleTapTimerRef.current = null;
          }

          const screenH =
            containerHeight > 0
              ? containerHeight
              : Math.min(Dimensions.get('window').width, Dimensions.get('window').height);

          // Moving up decreases dy, so -dy is positive
          const delta = -gestureState.dy / (screenH * 0.7);
          const rawVal = startVal + delta;

          if (activeType === 'brightness') {
            const clamped = Math.min(Math.max(rawVal, 0.1), 1.0);
            onBrightnessChange(clamped);
            showHud('brightness', Math.round(clamped * 100));
          } else if (activeType === 'volume') {
            const clamped = Math.min(Math.max(rawVal, 0.0), 1.0);
            if (clamped > 0 && isMutedRef.current) {
              onMuteChange(false);
            } else if (clamped === 0 && !isMutedRef.current) {
              onMuteChange(true);
            }
            onVolumeChange(clamped);
            showHud('volume', Math.round(clamped * 100));
          }
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (!isDragging && Math.abs(gestureState.dx) < 10 && Math.abs(gestureState.dy) < 10) {
          const { locationX } = evt.nativeEvent;
          const screenW =
            containerWidth > 0
              ? containerWidth
              : Math.max(Dimensions.get('window').width, Dimensions.get('window').height);
          const side = locationX < screenW / 2 ? 'left' : 'right';
          const now = Date.now();
          const timeSinceLastTap = now - lastTapTimeRef.current;

          if (timeSinceLastTap < 350 && lastTapSideRef.current === side) {
            // DOUBLE TAP
            if (singleTapTimerRef.current) {
              clearTimeout(singleTapTimerRef.current);
              singleTapTimerRef.current = null;
            }
            lastTapTimeRef.current = 0;
            lastTapSideRef.current = null;
            triggerDoubleTapFeedback(side);
            if (side === 'left' && onDoubleTapLeft) {
              onDoubleTapLeft();
            } else if (side === 'right' && onDoubleTapRight) {
              onDoubleTapRight();
            }
          } else {
            // SINGLE TAP
            lastTapTimeRef.current = now;
            lastTapSideRef.current = side;
            if (singleTapTimerRef.current) {
              clearTimeout(singleTapTimerRef.current);
            }
            singleTapTimerRef.current = setTimeout(() => {
              onTap();
              singleTapTimerRef.current = null;
              lastTapTimeRef.current = 0;
              lastTapSideRef.current = null;
            }, 250);
          }
        } else {
          hideHudDelayed();
        }
        activeType = 'none';
        isDragging = false;
      },
      onPanResponderTerminate: () => {
        hideHudDelayed();
        activeType = 'none';
        isDragging = false;
      },
    });
  }, [
    containerWidth,
    containerHeight,
    onBrightnessChange,
    onVolumeChange,
    onMuteChange,
    showHud,
    hideHudDelayed,
    triggerDoubleTapFeedback,
    onDoubleTapLeft,
    onDoubleTapRight,
    onTap,
  ]);

  const getVolumeIcon = () => {
    if (isMuted || hudValue === 0) return 'volume-mute';
    if (hudValue < 40) return 'volume-low';
    if (hudValue < 80) return 'volume-medium';
    return 'volume-high';
  };

  return (
    <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
      {children}

      {/* Screen Brightness Dimming Layer (Zero permission, 100% reliable) */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: '#000000',
            opacity: 1 - brightness,
            zIndex: 1,
          },
        ]}
      />

      {/* Double Tap Skip Overlays */}
      {doubleTapSide === 'left' && (
        <Animated.View
          pointerEvents="none"
          style={[styles.doubleTapLeft, { opacity: doubleTapOpacity }]}
        >
          <Ionicons name="play-back" size={30} color="#ffffff" />
          <Text style={styles.doubleTapText}>10s</Text>
        </Animated.View>
      )}

      {doubleTapSide === 'right' && (
        <Animated.View
          pointerEvents="none"
          style={[styles.doubleTapRight, { opacity: doubleTapOpacity }]}
        >
          <Ionicons name="play-forward" size={30} color="#ffffff" />
          <Text style={styles.doubleTapText}>10s</Text>
        </Animated.View>
      )}

      {/* MX Player HUD */}
      {hudType !== null && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.hudContainer,
            hudType === 'brightness' ? styles.hudLeft : styles.hudRight,
            { opacity: hudOpacity },
          ]}
        >
          {hudType === 'brightness' ? (
            <Ionicons name="sunny" size={24} color="#FFD700" style={styles.hudIcon} />
          ) : (
            <Ionicons
              name={getVolumeIcon() as any}
              size={24}
              color={isMuted || hudValue === 0 ? '#ff4444' : '#00e5ff'}
              style={styles.hudIcon}
            />
          )}

          <View style={styles.hudBarTrack}>
            <View
              style={[
                styles.hudBarFill,
                {
                  height: `${Math.min(Math.max(hudValue, 0), 100)}%`,
                  backgroundColor:
                    hudType === 'brightness'
                      ? '#FFD700'
                      : isMuted || hudValue === 0
                      ? '#ff4444'
                      : '#00e5ff',
                },
              ]}
            />
          </View>

          <Text style={styles.hudText}>
            {hudType === 'volume' && (isMuted || hudValue === 0) ? 'Mute' : `${hudValue}%`}
          </Text>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  hudContainer: {
    position: 'absolute',
    top: '30%',
    width: 60,
    height: 170,
    backgroundColor: 'rgba(15, 15, 20, 0.92)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  hudLeft: {
    left: 42,
  },
  hudRight: {
    right: 42,
  },
  hudIcon: {
    marginBottom: 4,
  },
  hudBarTrack: {
    width: 6,
    height: 80,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    marginVertical: 4,
  },
  hudBarFill: {
    width: '100%',
    borderRadius: 3,
  },
  hudText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  doubleTapLeft: {
    position: 'absolute',
    left: '12%',
    top: '40%',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 150,
  },
  doubleTapRight: {
    position: 'absolute',
    right: '12%',
    top: '40%',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 150,
  },
  doubleTapText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
});
