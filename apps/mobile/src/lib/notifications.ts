import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Notifications de révision.
 *
 * Les rappels sont **locaux** (programmés par le système Android) : ils
 * fonctionnent sans connexion et n'envoient aucune donnée personnelle à un
 * serveur de notifications. Un rappel distant (push) nécessiterait un compte
 * Firebase/Expo : l'intégration est donc documentée comme non activée.
 */
const REMINDER_ID = 'memo.daily-reminder';

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('revisions', {
    name: 'Révisions',
    importance: Notifications.AndroidImportance.DEFAULT,
    description: 'Rappels de révision et échéances du planning',
    lightColor: '#2145ea',
  });
}

export async function requestPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/**
 * Programme un rappel quotidien à 18 h (heure locale).
 * Renvoie `false` si l'utilisateur a refusé : l'application ne force rien et
 * ne prétend pas avoir programmé un rappel.
 */
export async function scheduleDailyReminder(hour = 18, minute = 0): Promise<boolean> {
  const granted = await requestPermission();
  if (!granted) return false;

  await cancelDailyReminder();
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: 'MÉMO CAMPUS — révisions du jour',
      body: 'Quelques cartes à revoir aujourd’hui pour ne rien oublier.',
      data: { route: '/revision' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: 'revisions',
    },
  });
  return true;
}

export async function cancelDailyReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
  } catch {
    // Aucun rappel programmé : rien à faire.
  }
}

/** Configure l'affichage des notifications lorsque l'application est au premier plan. */
export function configureForegroundHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}
