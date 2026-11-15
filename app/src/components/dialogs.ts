// Cross-platform dialogs: React Native's Alert is a no-op on web, so the web
// preview falls back to the browser's confirm/prompt.
import { Alert, Platform } from 'react-native';

export function confirm(title: string, message: string, confirmText: string, onConfirm: () => void, destructive = false) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

export function choose(title: string, message: string, options: { text: string; onPress: () => void }[]) {
  if (Platform.OS === 'web') {
    const answer = window.prompt(`${title}\n${message}\n\n${options.map((o, i) => `${i + 1} = ${o.text}`).join('\n')}`);
    const idx = Number(answer) - 1;
    if (options[idx]) options[idx].onPress();
    return;
  }
  Alert.alert(title, message, [...options, { text: 'Cancel', style: 'cancel' as const, onPress: () => {} }]);
}
