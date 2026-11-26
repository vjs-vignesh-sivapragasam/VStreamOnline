import React, { useEffect, useRef, useId } from 'react';
import {
  View,
  Text,
  Animated,
  Easing,
  StyleSheet,
  Platform,
  StyleProp,
  ViewStyle,
  TextStyle,
  ColorValue,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '@/contexts/ThemeContext';

export interface ThemeSpinnerProps {
  size?: number | 'small' | 'large';
  color?: ColorValue | string;
  strokeWidth?: number;
  text?: string;
  showText?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const ThemeSpinner: React.FC<ThemeSpinnerProps> = ({
  size = 'large',
  color,
  strokeWidth: customStrokeWidth,
  text,
  showText,
  style,
  textStyle,
}) => {
  const { theme } = useTheme();
  const themeColor = (color as string) || theme?.primary || '#535aff';

  // Determine numeric dimensions
  const numericSize =
    typeof size === 'number'
      ? size
      : size === 'small'
      ? 24
      : 56;

  const strokeWidth =
    customStrokeWidth ??
    (numericSize <= 26 ? 2.5 : numericSize <= 40 ? 3.5 : 4.5);

  const radius = Math.max((numericSize - strokeWidth) / 2, 1);
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.72; // ~260 degrees arc
  const center = numericSize / 2;

  // Rotation animation
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
      })
    );
    animation.start();

    return () => {
      animation.stop();
    };
  }, [spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Unique gradient ID for SVG defs
  const reactId = useId();
  const cleanId = reactId.replace(/[^a-zA-Z0-9]/g, '');
  const gradId = `spinnerGrad_${cleanId}_${numericSize}`;

  // Decide whether to show text
  const shouldShowText = showText ?? (text !== undefined && text.trim().length > 0);
  const displayText = text ?? (shouldShowText ? 'LOADING...' : undefined);

  return (
    <View style={[styles.container, style]}>
      <Animated.View
        style={[
          styles.spinnerWrapper,
          {
            width: numericSize,
            height: numericSize,
            transform: [{ rotate: spin }],
            shadowColor: themeColor,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.5,
            shadowRadius: Math.max(strokeWidth * 1.5, 4),
            elevation: 4,
          },
        ]}
      >
        <Svg
          width={numericSize}
          height={numericSize}
          viewBox={`0 0 ${numericSize} ${numericSize}`}
        >
          <Defs>
            <LinearGradient id={gradId} x1="100%" y1="0%" x2="0%" y2="85%">
              <Stop offset="0%" stopColor={themeColor} stopOpacity="1" />
              <Stop offset="35%" stopColor={themeColor} stopOpacity="0.85" />
              <Stop offset="65%" stopColor={themeColor} stopOpacity="0.35" />
              <Stop offset="90%" stopColor={themeColor} stopOpacity="0.08" />
              <Stop offset="100%" stopColor={themeColor} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={`url(#${gradId})`}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            fill="transparent"
            transform={`rotate(-90 ${center} ${center})`}
          />
        </Svg>
      </Animated.View>

      {shouldShowText && displayText ? (
        <Text style={[styles.loadingText, textStyle]}>
          {displayText}
        </Text>
      ) : null}
    </View>
  );
};

export default ThemeSpinner;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.5,
    color: '#ffffff',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});
