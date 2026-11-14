import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  Vibration,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { WebView } from 'react-native-webview';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Original aspect ratio: 695 x 271 (~2.564)
const LOGO_ORIGINAL_WIDTH = 695;
const LOGO_ORIGINAL_HEIGHT = 271;
const LOGO_ASPECT_RATIO = LOGO_ORIGINAL_WIDTH / LOGO_ORIGINAL_HEIGHT;

// Responsive sizing based on viewport
const LOGO_WIDTH = Math.min(SCREEN_WIDTH * 0.76, 380);
const LOGO_HEIGHT = LOGO_WIDTH / LOGO_ASPECT_RATIO;
const STREAK_WIDTH = Math.min(SCREEN_WIDTH * 0.85, 420);

interface VplexCinematicSplashProps {
  onAnimationComplete?: () => void;
  enableSound?: boolean;
  enableHaptics?: boolean;
}

const CINEMATIC_SOUND_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="background:transparent;margin:0;padding:0;">
  <script>
    (function() {
      try {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        var ctx = new AudioCtx();

        function resume() {
          if (ctx.state === 'suspended') {
            ctx.resume().catch(function(){});
          }
        }
        document.addEventListener('touchstart', resume, { passive: true });
        document.addEventListener('click', resume, { passive: true });
        resume();

        var masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0.85, ctx.currentTime);
        masterGain.connect(ctx.destination);

        var startT = ctx.currentTime + 0.05;

        // 1. T = 1.0s: Soft futuristic whoosh as golden V appears
        function scheduleWhoosh(t) {
          var osc = ctx.createOscillator();
          var filter = ctx.createBiquadFilter();
          var gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(145, t);
          osc.frequency.exponentialRampToValueAtTime(52, t + 0.65);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(280, t);
          filter.frequency.exponentialRampToValueAtTime(75, t + 0.65);

          gain.gain.setValueAtTime(0.001, t);
          gain.gain.linearRampToValueAtTime(0.32, t + 0.18);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(masterGain);

          osc.start(t);
          osc.stop(t + 0.72);
        }

        // 2. T = 1.35s - 1.95s: Subtle smooth transition notes for P-L-E-X
        function scheduleNote(freq, t) {
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t);

          gain.gain.setValueAtTime(0.001, t);
          gain.gain.linearRampToValueAtTime(0.14, t + 0.035);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

          osc.connect(gain);
          gain.connect(masterGain);

          osc.start(t);
          osc.stop(t + 0.35);
        }

        // 3. T = 2.4s: Signature Chevron shimmer sweep (golden harmonic sweep)
        function scheduleShimmer(t) {
          var freqs = [659.25, 987.77, 1318.51, 1975.53];
          freqs.forEach(function(f, i) {
            var noteT = t + i * 0.045;
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, noteT);

            gain.gain.setValueAtTime(0.001, noteT);
            gain.gain.linearRampToValueAtTime(0.12, noteT + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, noteT + 0.55);

            osc.connect(gain);
            gain.connect(masterGain);

            osc.start(noteT);
            osc.stop(noteT + 0.6);
          });
        }

        // 4. T = 3.2s: Gentle deep cinematic sub-bass impact (warm bass drop)
        function scheduleImpact(t) {
          var osc = ctx.createOscillator();
          var filter = ctx.createBiquadFilter();
          var gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(70, t);
          osc.frequency.exponentialRampToValueAtTime(36, t + 0.95);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(200, t);
          filter.frequency.exponentialRampToValueAtTime(55, t + 0.95);

          gain.gain.setValueAtTime(0.001, t);
          gain.gain.linearRampToValueAtTime(0.38, t + 0.07);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(masterGain);

          osc.start(t);
          osc.stop(t + 1.25);
        }

        // 5. T = 4.2s: Soft master audio fade-out
        function scheduleFadeOut(t) {
          masterGain.gain.setValueAtTime(0.85, t);
          masterGain.gain.linearRampToValueAtTime(0.001, t + 0.5);
        }

        scheduleWhoosh(startT + 1.0);
        scheduleNote(523.25, startT + 1.35); // C5 (P)
        scheduleNote(659.25, startT + 1.55); // E5 (L)
        scheduleNote(783.99, startT + 1.75); // G5 (E)
        scheduleNote(1046.50, startT + 1.95); // C6 (X)
        scheduleShimmer(startT + 2.4);        // Chevron sweep
        scheduleImpact(startT + 3.2);         // Final reveal settle
        scheduleFadeOut(startT + 4.2);        // Smooth fade-out
      } catch (e) {}
    })();
  </script>
</body>
</html>
`;

function playWebCinematicSound() {
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.85, ctx.currentTime);
    masterGain.connect(ctx.destination);
    const startT = ctx.currentTime + 0.05;

    // 1. T = 1.0s: Whoosh
    const whooshOsc = ctx.createOscillator();
    const whooshFilter = ctx.createBiquadFilter();
    const whooshGain = ctx.createGain();
    whooshOsc.type = 'sine';
    whooshOsc.frequency.setValueAtTime(145, startT + 1.0);
    whooshOsc.frequency.exponentialRampToValueAtTime(52, startT + 1.65);
    whooshFilter.type = 'lowpass';
    whooshFilter.frequency.setValueAtTime(280, startT + 1.0);
    whooshFilter.frequency.exponentialRampToValueAtTime(75, startT + 1.65);
    whooshGain.gain.setValueAtTime(0.001, startT + 1.0);
    whooshGain.gain.linearRampToValueAtTime(0.32, startT + 1.18);
    whooshGain.gain.exponentialRampToValueAtTime(0.001, startT + 1.7);
    whooshOsc.connect(whooshFilter);
    whooshFilter.connect(whooshGain);
    whooshGain.connect(masterGain);
    whooshOsc.start(startT + 1.0);
    whooshOsc.stop(startT + 1.72);

    // 2. T = 1.35s - 1.95s: Notes
    [
      { f: 523.25, dt: 1.35 },
      { f: 659.25, dt: 1.55 },
      { f: 783.99, dt: 1.75 },
      { f: 1046.50, dt: 1.95 }
    ].forEach(({ f, dt }) => {
      const t = startT + dt;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.35);
    });

    // 3. T = 2.4s: Shimmer
    [659.25, 987.77, 1318.51, 1975.53].forEach((f, i) => {
      const noteT = startT + 2.4 + i * 0.045;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, noteT);
      gain.gain.setValueAtTime(0.001, noteT);
      gain.gain.linearRampToValueAtTime(0.12, noteT + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, noteT + 0.55);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(noteT);
      osc.stop(noteT + 0.6);
    });

    // 4. T = 3.2s: Bass Impact
    const impOsc = ctx.createOscillator();
    const impFilter = ctx.createBiquadFilter();
    const impGain = ctx.createGain();
    impOsc.type = 'sine';
    impOsc.frequency.setValueAtTime(70, startT + 3.2);
    impOsc.frequency.exponentialRampToValueAtTime(36, startT + 4.15);
    impFilter.type = 'lowpass';
    impFilter.frequency.setValueAtTime(200, startT + 3.2);
    impFilter.frequency.exponentialRampToValueAtTime(55, startT + 4.15);
    impGain.gain.setValueAtTime(0.001, startT + 3.2);
    impGain.gain.linearRampToValueAtTime(0.38, startT + 3.27);
    impGain.gain.exponentialRampToValueAtTime(0.001, startT + 4.4);
    impOsc.connect(impFilter);
    impFilter.connect(impGain);
    impGain.connect(masterGain);
    impOsc.start(startT + 3.2);
    impOsc.stop(startT + 4.45);

    // 5. Fade out
    masterGain.gain.setValueAtTime(0.85, startT + 4.2);
    masterGain.gain.linearRampToValueAtTime(0.001, startT + 4.7);
  } catch {}
}

export const VplexCinematicSplash: React.FC<VplexCinematicSplashProps> = ({
  onAnimationComplete,
  enableSound = true,
  enableHaptics = true,
}) => {
  const hasFinishedRef = useRef(false);
  const onAnimationCompleteRef = useRef(onAnimationComplete);
  onAnimationCompleteRef.current = onAnimationComplete;

  const enableHapticsRef = useRef(enableHaptics);
  enableHapticsRef.current = enableHaptics;

  const enableSoundRef = useRef(enableSound);
  enableSoundRef.current = enableSound;

  // Animation values (all 100% native driver compatible)
  const masterFade = useRef(new Animated.Value(1)).current;

  // 1. Opening Light Streak & Ambient Aura
  const streakScaleX = useRef(new Animated.Value(0)).current;
  const streakOpacity = useRef(new Animated.Value(0)).current;
  const auraScale = useRef(new Animated.Value(0.4)).current;
  const auraOpacity = useRef(new Animated.Value(0.4)).current;
  const flareOpacity = useRef(new Animated.Value(0)).current;

  // 2. Letter 'V'
  const vTranslateX = useRef(new Animated.Value(-65)).current;
  const vScale = useRef(new Animated.Value(0.82)).current;
  const vOpacity = useRef(new Animated.Value(0)).current;

  // 3. Staggered 'plex' letters
  const pTranslateY = useRef(new Animated.Value(14)).current;
  const pOpacity = useRef(new Animated.Value(0)).current;
  const pScale = useRef(new Animated.Value(0.92)).current;

  const lTranslateY = useRef(new Animated.Value(14)).current;
  const lOpacity = useRef(new Animated.Value(0)).current;
  const lScale = useRef(new Animated.Value(0.92)).current;

  const eTranslateY = useRef(new Animated.Value(14)).current;
  const eOpacity = useRef(new Animated.Value(0)).current;
  const eScale = useRef(new Animated.Value(0.92)).current;

  const xTranslateY = useRef(new Animated.Value(14)).current;
  const xOpacity = useRef(new Animated.Value(0)).current;
  const xScale = useRef(new Animated.Value(0.92)).current;

  // 4. Signature Chevron Glow & Light Sweep
  const chevronScale = useRef(new Animated.Value(1)).current;
  const chevronGlowOpacity = useRef(new Animated.Value(0)).current;
  const shimmerTranslateX = useRef(new Animated.Value(-50)).current;
  const shimmerOpacity = useRef(new Animated.Value(0)).current;

  // 5. Final Logo Settle
  const logoSettleScale = useRef(new Animated.Value(1.02)).current;
  const finalGlowOpacity = useRef(new Animated.Value(0)).current;

  // Musical Flow Vibration Trigger
  // Starts smoothly as the logo animates in, peaks at the signature chevron sweep,
  // then slowly reduces/decays in strength like a musical reverb wave.
  const triggerHaptic = useCallback(
    async (intensity: 'start' | 'swell' | 'peak' | 'decay_1' | 'decay_2' | 'decay_3') => {
      if (!enableHapticsRef.current) return;

      try {
        if (Platform.OS === 'android') {
          // Android: Direct physical vibration durations tuned for smooth musical flow
          if (intensity === 'start') {
            Vibration.vibrate(40); // 1. Smooth start as golden V enters
            try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
          } else if (intensity === 'swell') {
            Vibration.vibrate(55); // 2. Swell as plex letters form
            try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
          } else if (intensity === 'peak') {
            Vibration.vibrate(75); // 3. Climax peak at chevron illumination
            try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
          } else if (intensity === 'decay_1') {
            Vibration.vibrate(45); // 4. Decay step 1 (starts reducing smoothly)
            try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
          } else if (intensity === 'decay_2') {
            Vibration.vibrate(25); // 5. Decay step 2 (gentle pulse as logo settles)
            try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
          } else if (intensity === 'decay_3') {
            Vibration.vibrate(15); // 6. Final soft fade-out into silence
            try { await Haptics.selectionAsync(); } catch {}
          }
        } else if (Platform.OS === 'ios') {
          // iOS: Both Taptic Engine feedback and hardware vibration
          if (intensity === 'start') {
            try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
          } else if (intensity === 'swell') {
            try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
          } else if (intensity === 'peak') {
            try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
            try { Vibration.vibrate(); } catch {}
          } else if (intensity === 'decay_1') {
            try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
          } else if (intensity === 'decay_2') {
            try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
          } else if (intensity === 'decay_3') {
            try { await Haptics.selectionAsync(); } catch {}
          }
        } else if (Platform.OS === 'web') {
          try {
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              if (intensity === 'peak') navigator.vibrate(70);
              else if (intensity === 'decay_3') navigator.vibrate(15);
              else navigator.vibrate(40);
            }
          } catch {}
        }
      } catch (err) {
        console.warn('[VplexSplash] Vibration fallback:', err);
      }
    },
    []
  );

  // Complete Splash Transition smoothly into Home
  const finishSplash = useCallback(() => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;

    try {
      Vibration.cancel();
    } catch {}

    Animated.timing(masterFade, {
      toValue: 0,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      onAnimationCompleteRef.current?.();
    });
  }, [masterFade]);

  // Web Audio fallback
  useEffect(() => {
    if (Platform.OS === 'web' && enableSoundRef.current) {
      try {
        const audioAsset = require('@/assets/audio/vplex_cinematic_splash.wav');
        const audio = new Audio(audioAsset);
        audio.volume = 0.7;
        audio.play().catch(() => {});
      } catch {
        // Silently fallback if audio cannot autoplay
      }
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // ------------------------------------------------------------------
    // TIMELINE: 4.6s Cinematic Splash Sequence (Dark Canvas + Music Flow)
    // ------------------------------------------------------------------

    // T = 0.0s - 1.0s: Opening golden light streak & ambient glow
    Animated.parallel([
      Animated.timing(streakScaleX, {
        toValue: 1,
        duration: 900,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(streakOpacity, {
          toValue: 0.95,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(streakOpacity, {
          toValue: 0.35,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(auraScale, {
        toValue: 1.25,
        duration: 1200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(auraOpacity, {
        toValue: 0.5,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(flareOpacity, {
        toValue: 0.6,
        duration: 700,
        useNativeDriver: true,
      }),
    ]).start();

    // 1. T = 1.0s: V Reveal + Vibration Starts Smoothly
    const timerV = setTimeout(() => {
      if (!isMounted) return;
      triggerHaptic('start');

      Animated.parallel([
        Animated.timing(vTranslateX, {
          toValue: 0,
          duration: 650,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        }),
        Animated.timing(vScale, {
          toValue: 1.0,
          duration: 650,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        }),
        Animated.timing(vOpacity, {
          toValue: 1.0,
          duration: 450,
          useNativeDriver: true,
        }),
      ]).start();
    }, 1000);

    // 2. T = 1.35s - 2.1s: Staggered P-L-E-X Reveal
    const timerP = setTimeout(() => {
      if (!isMounted) return;
      Animated.parallel([
        Animated.timing(pTranslateY, {
          toValue: 0,
          duration: 480,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(pScale, {
          toValue: 1.0,
          duration: 480,
          useNativeDriver: true,
        }),
        Animated.timing(pOpacity, {
          toValue: 1.0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }, 1350);

    const timerL = setTimeout(() => {
      if (!isMounted) return;
      Animated.parallel([
        Animated.timing(lTranslateY, {
          toValue: 0,
          duration: 480,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(lScale, {
          toValue: 1.0,
          duration: 480,
          useNativeDriver: true,
        }),
        Animated.timing(lOpacity, {
          toValue: 1.0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }, 1550);

    // Vibration swell as plex letters lock into place
    const timerPlexSwell = setTimeout(() => {
      if (!isMounted) return;
      triggerHaptic('swell');
    }, 1650);

    const timerE = setTimeout(() => {
      if (!isMounted) return;
      Animated.parallel([
        Animated.timing(eTranslateY, {
          toValue: 0,
          duration: 480,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(eScale, {
          toValue: 1.0,
          duration: 480,
          useNativeDriver: true,
        }),
        Animated.timing(eOpacity, {
          toValue: 1.0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }, 1750);

    const timerX = setTimeout(() => {
      if (!isMounted) return;
      Animated.parallel([
        Animated.timing(xTranslateY, {
          toValue: 0,
          duration: 480,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(xScale, {
          toValue: 1.0,
          duration: 480,
          useNativeDriver: true,
        }),
        Animated.timing(xOpacity, {
          toValue: 1.0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }, 1950);

    // 3. T = 2.4s: Signature Chevron Light Sweep Effect + Vibration Climax Peak
    const timerSignature = setTimeout(() => {
      if (!isMounted) return;
      triggerHaptic('peak');

      Animated.parallel([
        // Chevron gentle pulse
        Animated.sequence([
          Animated.timing(chevronScale, {
            toValue: 1.12,
            duration: 350,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            useNativeDriver: true,
          }),
          Animated.timing(chevronScale, {
            toValue: 1.0,
            duration: 400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        // Golden illumination bloom
        Animated.sequence([
          Animated.timing(chevronGlowOpacity, {
            toValue: 1.0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(chevronGlowOpacity, {
            toValue: 0,
            duration: 450,
            useNativeDriver: true,
          }),
        ]),
        // Shimmer light beam sweep
        Animated.sequence([
          Animated.timing(shimmerOpacity, {
            toValue: 1.0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(shimmerOpacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(shimmerTranslateX, {
          toValue: 60,
          duration: 700,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }, 2400);

    // 4. T = 2.8s: Musical Decay Step 1 (Vibration starts reducing smoothly)
    const timerDecay1 = setTimeout(() => {
      if (!isMounted) return;
      triggerHaptic('decay_1');
    }, 2800);

    // 5. T = 3.2s: Final Reveal Settle + Musical Decay Step 2 (Softer pulse as logo settles)
    const timerFinal = setTimeout(() => {
      if (!isMounted) return;
      triggerHaptic('decay_2');

      Animated.parallel([
        Animated.timing(logoSettleScale, {
          toValue: 1.0,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(finalGlowOpacity, {
          toValue: 0.65,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(auraScale, {
          toValue: 1.45,
          duration: 800,
          useNativeDriver: true,
        }),
      ]).start();
    }, 3200);

    // 6. T = 3.7s: Musical Decay Step 3 (Whisper fade-out into silence)
    const timerDecay3 = setTimeout(() => {
      if (!isMounted) return;
      triggerHaptic('decay_3');
    }, 3700);

    // 7. T = 4.4s: Hold finished logo and smoothly transition to home
    const timerEnd = setTimeout(() => {
      if (!isMounted) return;
      finishSplash();
    }, 4400);

    return () => {
      isMounted = false;
      clearTimeout(timerV);
      clearTimeout(timerP);
      clearTimeout(timerL);
      clearTimeout(timerPlexSwell);
      clearTimeout(timerE);
      clearTimeout(timerX);
      clearTimeout(timerSignature);
      clearTimeout(timerDecay1);
      clearTimeout(timerFinal);
      clearTimeout(timerDecay3);
      clearTimeout(timerEnd);
      try {
        Vibration.cancel();
      } catch {}
    };
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: masterFade }]}>
      {/* Tap anywhere to skip straight to home screen with clean subtle touch feedback */}
      <Pressable
        style={styles.pressable}
        onPress={() => {
          try {
            Vibration.cancel();
            if (Platform.OS === 'ios') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } else {
              Vibration.vibrate(30);
            }
          } catch {}
          finishSplash();
        }}
      >
        {/* Hidden, lightweight audio player for smooth synchronized cinematic sound effects */}
        {enableSound && Platform.OS !== 'web' && (
          <View style={styles.hiddenSoundContainer} pointerEvents="none">
            <WebView
              originWhitelist={['*']}
              source={{ html: CINEMATIC_SOUND_HTML }}
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled={true}
              style={styles.hiddenWebView}
              scrollEnabled={false}
            />
          </View>
        )}

        {/* 1. Deep Cinematic Dark Backdrop */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#08080a' }]} />

        {/* 2. Soft Golden Radial Aura behind logo */}
        <Animated.View
          style={[
            styles.radialAuraWrap,
            {
              opacity: auraOpacity,
              transform: [{ scale: auraScale }],
            },
          ]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={[
              'rgba(229, 168, 50, 0.18)',
              'rgba(229, 168, 50, 0.08)',
              'rgba(229, 168, 50, 0.02)',
              'transparent',
            ]}
            style={styles.radialAura}
          />
        </Animated.View>

        {/* 3. Opening Golden-Amber Light Streak */}
        <Animated.View
          style={[
            styles.centerStreakWrap,
            {
              opacity: streakOpacity,
              transform: [{ scaleX: streakScaleX }],
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.streakLine}>
            <LinearGradient
              colors={[
                'transparent',
                'rgba(229, 168, 50, 0.4)',
                '#e5a832',
                'rgba(229, 168, 50, 0.7)',
                'transparent',
              ]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        </Animated.View>

        {/* 4. Horizontal Anamorphic Golden Flare Line */}
        <Animated.View
          style={[
            styles.anamorphicFlare,
            { opacity: flareOpacity },
          ]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={[
              'transparent',
              'rgba(229, 168, 50, 0.25)',
              'rgba(216, 155, 32, 0.6)',
              'rgba(229, 168, 50, 0.25)',
              'transparent',
            ]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {/* 5. Central Logo Stage */}
        <View style={styles.stage} pointerEvents="none">
          <Animated.View
            style={[
              styles.logoBox,
              {
                width: LOGO_WIDTH,
                height: LOGO_HEIGHT,
                transform: [{ scale: logoSettleScale }],
              },
            ]}
          >
            {/* Layer 1: Golden-Yellow V */}
            <Animated.Image
              source={require('@/assets/images/vplex_layer_v.png')}
              style={[
                styles.layerImage,
                {
                  opacity: vOpacity,
                  transform: [
                    { translateX: vTranslateX },
                    { scale: vScale },
                  ],
                },
              ]}
              resizeMode="contain"
            />

            {/* Layer 2: Solid Black P */}
            <Animated.Image
              source={require('@/assets/images/vplex_layer_p_white.png')}
              style={[
                styles.layerImage,
                {
                  opacity: pOpacity,
                  transform: [
                    { translateY: pTranslateY },
                    { scale: pScale },
                  ],
                },
              ]}
              resizeMode="contain"
            />

            {/* Layer 3: Solid Black L */}
            <Animated.Image
              source={require('@/assets/images/vplex_layer_l_white.png')}
              style={[
                styles.layerImage,
                {
                  opacity: lOpacity,
                  transform: [
                    { translateY: lTranslateY },
                    { scale: lScale },
                  ],
                },
              ]}
              resizeMode="contain"
            />

            {/* Layer 4: Solid Black E */}
            <Animated.Image
              source={require('@/assets/images/vplex_layer_e_white.png')}
              style={[
                styles.layerImage,
                {
                  opacity: eOpacity,
                  transform: [
                    { translateY: eTranslateY },
                    { scale: eScale },
                  ],
                },
              ]}
              resizeMode="contain"
            />

            {/* Layer 5: Solid Black left wing of X */}
            <Animated.Image
              source={require('@/assets/images/vplex_layer_x_white.png')}
              style={[
                styles.layerImage,
                {
                  opacity: xOpacity,
                  transform: [
                    { translateY: xTranslateY },
                    { scale: xScale },
                  ],
                },
              ]}
              resizeMode="contain"
            />

            {/* Layer 6: Golden-Yellow Chevron of X with signature pulse */}
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  opacity: xOpacity,
                  transform: [
                    { translateY: xTranslateY },
                    { scale: xScale },
                  ],
                },
              ]}
            >
              <Animated.Image
                source={require('@/assets/images/vplex_layer_x_yellow.png')}
                style={[
                  styles.layerImage,
                  {
                    transform: [{ scale: chevronScale }],
                  },
                ]}
                resizeMode="contain"
              />
            </Animated.View>

            {/* Signature Effect: Golden-White Shimmer Light Beam sweep across the Chevron */}
            <Animated.View
              style={[
                styles.shimmerWrap,
                {
                  opacity: shimmerOpacity,
                  transform: [{ translateX: shimmerTranslateX }],
                },
              ]}
              pointerEvents="none"
            >
              <LinearGradient
                colors={[
                  'transparent',
                  'rgba(255, 255, 255, 0.7)',
                  '#ffffff',
                  'rgba(229, 168, 50, 0.7)',
                  'transparent',
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.shimmerBeam}
              />
            </Animated.View>

            {/* Final Warm Golden Halo Settle */}
            <Animated.View
              style={[
                styles.finalGlow,
                { opacity: finalGlowOpacity },
              ]}
              pointerEvents="none"
            />
          </Animated.View>
        </View>

        {/* Bottom "By VIKI" Branding */}
        <Animated.View
          style={[
            styles.bottomBranding,
            { opacity: xOpacity },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.byVikiText}>By VIKI</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#08080a',
    zIndex: 999999,
    elevation: 999999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressable: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stage: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoBox: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  layerImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  radialAuraWrap: {
    position: 'absolute',
    width: 380,
    height: 380,
    borderRadius: 190,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radialAura: {
    width: '100%',
    height: '100%',
    borderRadius: 190,
  },
  centerStreakWrap: {
    position: 'absolute',
    width: STREAK_WIDTH,
    height: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  streakLine: {
    width: '100%',
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  anamorphicFlare: {
    position: 'absolute',
    width: '100%',
    height: 1.5,
  },
  shimmerWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: '12%',
    width: 45,
    overflow: 'hidden',
  },
  shimmerBeam: {
    width: 35,
    height: '100%',
    transform: [{ rotate: '20deg' }],
  },
  finalGlow: {
    ...StyleSheet.absoluteFill,
    borderRadius: 8,
    shadowColor: '#d89b20',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 22,
  },
  bottomBranding: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  byVikiText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2.5,
    color: '#8E8E93',
    textTransform: 'uppercase',
  },

  hiddenSoundContainer: {
    width: 1,
    height: 1,
    opacity: 0,
    position: 'absolute',
    top: -100,
    left: -100,
  },
  hiddenWebView: {
    width: 1,
    height: 1,
    opacity: 0,
    backgroundColor: 'transparent',
  },
});

export default VplexCinematicSplash;
