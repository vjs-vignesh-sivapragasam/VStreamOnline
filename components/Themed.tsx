/**
 * Learn more about Light and Dark modes:
 * https://docs.expo.io/guides/color-schemes/
 */

import {
  ActivityIndicator as DefaultActivityIndicator,
  TextInput as DefaultTextInput,
  Text as DefaultText,
  View as DefaultView,
  Platform,
  type TextProps as RNTextProps,
  type TextInputProps as RNTextInputProps,
  type ViewProps as RNViewProps,
  type ActivityIndicatorProps as RNActivityIndicatorProps,
} from 'react-native';
import { StatusBar as DefaultStatusBar } from 'expo-status-bar';
import Colors from '@/constants/Colors';
import { useTheme } from '@/contexts/ThemeContext';

export type TextProps = RNTextProps;
export type TextInputProps = RNTextInputProps;
export type ViewProps = RNViewProps;
export type StatusBarProps = React.ComponentProps<typeof DefaultStatusBar>;
export type ActivityIndicatorProps = RNActivityIndicatorProps;

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  try {
    const { theme } = useTheme();
    if (colorName === 'tint' && theme?.primary) {
      return theme.primary;
    }
  } catch {
    // Rendered outside ThemeProvider
  }

  const theme = 'dark';
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}

export function Text(props: TextProps) {
  const { style, ...otherProps } = props;
  const color = '#ffffff';
  const webFontStyle = Platform.OS === 'web' ? { fontFamily: 'SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif' } : {};
  return <DefaultText style={[webFontStyle, { color }, style]} {...otherProps} />;
}

export function TextInput(props: TextInputProps) {
  const { style, ...otherProps } = props;
  const color = '#ffffff';

  return <DefaultTextInput style={[{ color }, style]} {...otherProps} />;
}

export function ActivityIndicator(props: ActivityIndicatorProps) {
  const { style, color, ...otherProps } = props;
  let activeThemeColor: string | undefined;
  try {
    const { theme } = useTheme();
    activeThemeColor = theme?.primary;
  } catch {
    // Fallback
  }

  return (
    <DefaultActivityIndicator style={style} color={color || activeThemeColor} {...otherProps} />
  );
}

export function View(props: ViewProps) {
  const { style, ...otherProps } = props;
  return <DefaultView style={[style]} {...otherProps} />;
}

export function StatusBar(props: StatusBarProps) {
  const { ...otherProps } = props;

  return <DefaultStatusBar {...otherProps} style="light" />;
}

export function Card(props: ViewProps) {
  const { style, ...otherProps } = props;

  return (
    <DefaultView
      style={[
        {
          overflow: 'hidden',
        },
        style,
      ]}
      {...otherProps}
    />
  );
}
