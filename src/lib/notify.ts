import { Alert, Platform } from 'react-native';

/**
 * Cross-platform message box. react-native-web's Alert.alert is an empty
 * function, so on web this falls back to the browser's own dialog.
 */
export function showAlert(title: string, message?: string) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
