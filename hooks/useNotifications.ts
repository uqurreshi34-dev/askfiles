import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const DAILY_NOTIFICATION_ID = 'askfiles-daily-reminder';
const NOTIFICATION_HOUR = 18; // 6pm
const NOTIFICATION_MINUTE = 0;

export async function registerForPushNotifications(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

export async function scheduleDailyReminder(isPro: boolean): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(DAILY_NOTIFICATION_ID).catch(() => {});

    const granted = await registerForPushNotifications();
    if (!granted) return;

    // Pro users get specific duplicate/storage messages
    // Free users get a generic re-engagement message
    const proMessages = [
      { title: '🗂️ AskFiles', body: 'You may have duplicate files taking up space. Tap to find and remove them.' },
      { title: '💾 AskFiles', body: 'Your storage could use some attention. Check your duplicate files.' },
      { title: '🧹 AskFiles', body: 'Time for a clean-up! Find your duplicate files and free up space.' },
    ];

    const freeMessages = [
      { title: '🗂️ AskFiles', body: 'Your storage could use some attention. Tap to check your files.' },
      { title: '💾 AskFiles', body: 'Keep your phone organised. Open AskFiles to manage your storage.' },
      { title: '📱 AskFiles', body: 'A tidy phone is a fast phone. Open AskFiles for a quick clean-up.' },
    ];

    const messages = isPro ? proMessages : freeMessages;
    const msg = messages[Math.floor(Math.random() * messages.length)];

    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_NOTIFICATION_ID,
      content: {
        title: msg.title,
        body: msg.body,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: NOTIFICATION_HOUR,
        minute: NOTIFICATION_MINUTE,
      },
    });
  } catch (e) {
  }
}
