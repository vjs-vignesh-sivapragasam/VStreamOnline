import { Alert, AlertButton, Platform } from 'react-native';

export const isHapticsSupported = (): boolean => {
  // if (Platform.OS === 'ios' || Platform.OS === 'android') {
  //     return true;
  // }
  // return false;
  return true;
};

export const isOrientationSupported = (): boolean => {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return true;
  }
  return false;
};

export const showAlert = (title: string, message: string, buttons?: AlertButton[]) => {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    Alert.alert(title, message, buttons, { userInterfaceStyle: 'dark', cancelable: true });
  } else {
    window.alert(`${title}\n\n${message}`);
  }
}

export const confirmAction = async (
  title: string,
  message: string,
  confirmText: string
): Promise<boolean> => {
  if (Platform.OS === 'web') {
    return window.confirm(`${title}\n\n${message}`);
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, style: 'default', onPress: () => resolve(true) },
      ],
      {
        cancelable: true,
        userInterfaceStyle: 'dark'
      }
    );
  });
};

export function promptInput(
  title: string,
  message: string,
  onConfirm: (value: string) => void,
  options?: {
    fallback?: string;
    keyboardType?: 'default' | 'number-pad' | 'email-address' | 'phone-pad';
    confirmText?: string;
    cancelText?: string;
  },
): void {
  const {
    fallback = '',
    keyboardType = 'default',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
  } = options ?? {};

  if (Platform.OS === 'ios') {
    Alert.prompt(
      title,
      message,
      [
        { text: cancelText, style: 'cancel', onPress: () => onConfirm(fallback) },
        {
          text: confirmText,
          onPress: (value: any) => onConfirm(value ?? fallback),
        },
      ],
      'plain-text',
      '',
      keyboardType,
    );
  } else {
    Alert.alert(title, message, [
      { text: cancelText, onPress: () => onConfirm(fallback) },
      { text: confirmText, onPress: () => onConfirm(fallback) },
    ]);
  }
}

export const getOriginalPlatform = () => {
  if (Platform.OS !== 'web') {
    return Platform.OS;
  }

  const userAgent = navigator.userAgent || navigator.vendor || '';

  if (/iPad|iPhone|iPod/.test(userAgent)) {
    return 'ios';
  }

  if (/android/i.test(userAgent)) {
    return 'android';
  }

  if (/Macintosh|Mac OS X/.test(userAgent) && !/iPhone|iPad|iPod/.test(userAgent)) {
    return 'macos';
  }

  if (/Windows NT/.test(userAgent)) {
    return 'windows';
  }

  return 'web';
};