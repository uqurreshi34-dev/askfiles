/** Lock screen and Set PIN screen words. Shared PIN words are in common.ts. */
import { AppLang } from '../appLanguage';

export type PinText = {
  locked: string; enterToContinue: string;
  unlockTitle: string; unlockSub: string;
  setPin: string; confirmPin: string; enterNew: string;
  confirmSub: string; newSub: string; mismatch: string;
  pinSetTitle: string; pinSetMsg: string;
};

const TEXT: Record<AppLang, PinText> = {
  en: {
    locked: 'AskFiles is locked', enterToContinue: 'Enter your PIN to continue',
    unlockTitle: 'Unlock AskFiles', unlockSub: 'Use your fingerprint or face to unlock',
    setPin: 'Set PIN', confirmPin: 'Confirm your PIN', enterNew: 'Enter a 4-digit PIN',
    confirmSub: 'Enter the same PIN again to confirm', newSub: 'This PIN will unlock the app and vault',
    mismatch: "PINs don't match. Try again.",
    pinSetTitle: 'PIN Set', pinSetMsg: 'Your PIN has been set. App lock is now enabled.',
  },
  ar: {
    locked: 'AskFiles مقفل', enterToContinue: 'أدخل رمز PIN للمتابعة',
    unlockTitle: 'فتح AskFiles', unlockSub: 'استخدم بصمتك أو وجهك لفتح القفل',
    setPin: 'تعيين رمز PIN', confirmPin: 'أكّد رمز PIN', enterNew: 'أدخل رمز PIN من 4 أرقام',
    confirmSub: 'أدخل الرمز نفسه مرة أخرى للتأكيد', newSub: 'هذا الرمز يفتح التطبيق والخزنة',
    mismatch: 'الرمزان غير متطابقين. حاول مرة أخرى.',
    pinSetTitle: 'تم تعيين الرمز', pinSetMsg: 'تم تعيين رمز PIN. قفل التطبيق مفعّل الآن.',
  },
  hi: {
    locked: 'AskFiles लॉक है', enterToContinue: 'आगे बढ़ने के लिए अपना PIN डालें',
    unlockTitle: 'AskFiles अनलॉक करें', unlockSub: 'अनलॉक करने के लिए फ़िंगरप्रिंट या चेहरा इस्तेमाल करें',
    setPin: 'PIN सेट करें', confirmPin: 'अपना PIN कन्फ़र्म करें', enterNew: '4 अंकों का PIN डालें',
    confirmSub: 'कन्फ़र्म करने के लिए वही PIN दोबारा डालें', newSub: 'यह PIN ऐप और Vault को अनलॉक करेगा',
    mismatch: 'PIN मेल नहीं खाते। फिर से कोशिश करें।',
    pinSetTitle: 'PIN सेट हो गया', pinSetMsg: 'आपका PIN सेट हो गया है। ऐप लॉक अब चालू है।',
  },
};

export function pinText(lang: AppLang): PinText { return TEXT[lang]; }
