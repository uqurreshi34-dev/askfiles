import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { AppLang, getLanguage } from '@/modules/appLanguage';

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

// Pro users get specific duplicate/storage messages
// Free users get a generic re-engagement message
// Written in the app's language when scheduled; refreshDailyReminder
// reschedules it when the language changes.
const TITLES = ['🗂️ AskFiles', '💾 AskFiles', '🧹 AskFiles'];
const FREE_TITLES = ['🗂️ AskFiles', '💾 AskFiles', '📱 AskFiles'];

const PRO_BODIES: Record<AppLang, string[]> = {
  en: [
    'You may have duplicate files taking up space. Tap to find and remove them.',
    'Your storage could use some attention. Check your duplicate files.',
    'Time for a clean-up! Find your duplicate files and free up space.',
  ],
  ar: [
    'قد تكون لديك ملفات مكررة تشغل مساحة. اضغط للعثور عليها وإزالتها.',
    'مساحة التخزين لديك تحتاج إلى بعض الاهتمام. تحقّق من ملفاتك المكررة.',
    'حان وقت الترتيب! ابحث عن ملفاتك المكررة وأفرغ بعض المساحة.',
  ],
  hi: [
    'हो सकता है डुप्लिकेट फ़ाइलें जगह घेर रही हों। उन्हें ढूँढकर हटाने के लिए टैप करें।',
    'आपके स्टोरेज पर थोड़ा ध्यान देने की ज़रूरत है। अपनी डुप्लिकेट फ़ाइलें देखें।',
    'सफ़ाई का समय! अपनी डुप्लिकेट फ़ाइलें ढूँढें और जगह खाली करें।',
  ],
};

const FREE_BODIES: Record<AppLang, string[]> = {
  en: [
    'Your storage could use some attention. Tap to check your files.',
    'Keep your phone organised. Open AskFiles to manage your storage.',
    'A tidy phone is a fast phone. Open AskFiles for a quick clean-up.',
  ],
  ar: [
    'مساحة التخزين لديك تحتاج إلى بعض الاهتمام. اضغط لتفقّد ملفاتك.',
    'حافظ على ترتيب هاتفك. افتح AskFiles لإدارة مساحة التخزين.',
    'الهاتف المرتب هاتف سريع. افتح AskFiles لترتيب سريع.',
  ],
  hi: [
    'आपके स्टोरेज पर थोड़ा ध्यान देने की ज़रूरत है। अपनी फ़ाइलें देखने के लिए टैप करें।',
    'अपना फ़ोन व्यवस्थित रखें। स्टोरेज मैनेज करने के लिए AskFiles खोलें।',
    'साफ़-सुथरा फ़ोन, तेज़ फ़ोन। जल्दी सफ़ाई के लिए AskFiles खोलें।',
  ],
};

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

    const bodies = (isPro ? PRO_BODIES : FREE_BODIES)[getLanguage()];
    const i = Math.floor(Math.random() * bodies.length);
    const msg = { title: (isPro ? TITLES : FREE_TITLES)[i], body: bodies[i] };

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

/**
 * Rewrites an already-scheduled daily reminder, e.g. after the language
 * changes. Never asks for permission and never schedules one the user has
 * not already got.
 */
export async function refreshDailyReminder(isPro: boolean): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    if (!scheduled.some(n => n.identifier === DAILY_NOTIFICATION_ID)) return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    await scheduleDailyReminder(isPro);
  } catch {}
}
