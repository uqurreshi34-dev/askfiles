/**
 * Onboarding words in English, Arabic and Hindi.
 *
 * The Play listing is in all three languages, so the first screens a new
 * user sees follow the phone's language. Everything after onboarding is
 * still English. Slides are in the same order as SLIDES in
 * app/onboarding.tsx, which keeps the icons and colours; this file only
 * holds the words, so a fourth language is one more block here.
 *
 * Any other language, or a phone whose language cannot be read, gets English.
 */
import { I18nManager } from 'react-native';

export type OnboardingLang = 'en' | 'ar' | 'hi';

/** Set to 'ar' or 'hi' while testing in development; always null when shipped. */
const FORCE_LANG: OnboardingLang | null = null;

type SlideText = { title: string; body: string };

export type OnboardingText = {
  slides: SlideText[];
  skip: string;
  next: string;
  grantAccess: string;
  requesting: string;
  accessGranted: string;
  getStarted: string;
};

const TEXT: Record<OnboardingLang, OnboardingText> = {
  en: {
    slides: [
      {
        title: 'Welcome to AskFiles',
        body: 'Your personal file manager. Browse, organise, and access everything on your device — simply and fast.',
      },
      {
        title: 'Powerful. Free.',
        body: 'Document scanner with automatic edge detection. Password-protected ZIP. WiFi file transfer — no cables, just a browser. QR file sharing. SD card support. All free, no account needed.',
      },
      {
        title: 'Your Privacy, Protected',
        body: 'No account needed. No ads. Your files never leave your device. Pro AI search sends your question with a short storage summary — file names and sizes, never file contents. Smart Search reads your documents privately on your phone — no internet, no servers, no one else can see your files.',
      },
      {
        title: 'Unlock Pro — Yours Forever',
        body: 'AI-powered file search. Smart Search — find words inside your documents. Secure Vault with biometrics. Cloud backup to Google Drive, OneDrive and Dropbox. Duplicate finder. One payment, no subscription.',
      },
      {
        title: 'Access Your Files',
        body: 'AskFiles needs access to your photos, videos and files to work. Your files never leave your device.',
      },
    ],
    skip: 'Skip',
    next: 'Next',
    grantAccess: 'Grant Access',
    requesting: 'Requesting...',
    accessGranted: 'Access Granted ✓',
    getStarted: 'Get Started',
  },
  ar: {
    slides: [
      {
        title: 'مرحباً بك في AskFiles',
        body: 'مدير ملفاتك الشخصي. تصفّح ونظّم وافتح كل ما على جهازك — ببساطة وسرعة.',
      },
      {
        title: 'قوي. ومجاني.',
        body: 'ماسح مستندات يكتشف الحواف تلقائياً. ملفات ZIP محمية بكلمة مرور. نقل الملفات عبر WiFi — بلا كابلات، فقط متصفح. مشاركة الملفات عبر رمز QR. دعم بطاقة SD. كل ذلك مجاناً ودون الحاجة إلى حساب.',
      },
      {
        title: 'خصوصيتك محمية',
        body: 'لا حاجة إلى حساب. بلا إعلانات. ملفاتك لا تغادر جهازك أبداً. بحث الذكاء الاصطناعي في Pro يرسل سؤالك مع ملخص قصير عن التخزين — أسماء الملفات وأحجامها، وليس محتواها أبداً. البحث الذكي يقرأ مستنداتك بخصوصية على هاتفك — بلا إنترنت ولا خوادم، ولا يستطيع أحد غيرك رؤية ملفاتك.',
      },
      {
        title: 'افتح Pro — لك مدى الحياة',
        body: 'بحث في الملفات بالذكاء الاصطناعي. البحث الذكي — ابحث عن الكلمات داخل مستنداتك. خزنة آمنة بالبصمة. نسخ احتياطي سحابي إلى Google Drive وOneDrive وDropbox. البحث عن الملفات المكررة. دفعة واحدة، بلا اشتراك.',
      },
      {
        title: 'الوصول إلى ملفاتك',
        body: 'يحتاج AskFiles إلى الوصول إلى صورك ومقاطع الفيديو وملفاتك ليعمل. ملفاتك لا تغادر جهازك أبداً.',
      },
    ],
    skip: 'تخطي',
    next: 'التالي',
    grantAccess: 'منح الإذن',
    requesting: 'جارٍ الطلب...',
    accessGranted: 'تم منح الإذن ✓',
    getStarted: 'ابدأ',
  },
  hi: {
    slides: [
      {
        title: 'AskFiles में आपका स्वागत है',
        body: 'आपका निजी फ़ाइल मैनेजर। अपने डिवाइस की हर चीज़ को ब्राउज़ करें, व्यवस्थित करें और खोलें — आसानी से और तेज़ी से।',
      },
      {
        title: 'दमदार। मुफ़्त।',
        body: 'अपने-आप किनारे पहचानने वाला डॉक्यूमेंट स्कैनर। पासवर्ड से सुरक्षित ZIP। WiFi से फ़ाइल ट्रांसफ़र — बिना केबल, बस एक ब्राउज़र। QR से फ़ाइल शेयरिंग। SD कार्ड सपोर्ट। सब कुछ मुफ़्त, किसी अकाउंट की ज़रूरत नहीं।',
      },
      {
        title: 'आपकी प्राइवेसी सुरक्षित',
        body: 'किसी अकाउंट की ज़रूरत नहीं। कोई विज्ञापन नहीं। आपकी फ़ाइलें कभी आपके डिवाइस से बाहर नहीं जातीं। Pro AI सर्च आपके सवाल के साथ स्टोरेज का छोटा सारांश भेजता है — फ़ाइलों के नाम और साइज़, उनकी सामग्री कभी नहीं। स्मार्ट सर्च आपके दस्तावेज़ आपके फ़ोन पर ही निजी रूप से पढ़ता है — बिना इंटरनेट, बिना सर्वर, कोई और आपकी फ़ाइलें नहीं देख सकता।',
      },
      {
        title: 'Pro अनलॉक करें — हमेशा के लिए आपका',
        body: 'AI से फ़ाइल सर्च। स्मार्ट सर्च — अपने दस्तावेज़ों के अंदर शब्द खोजें। बायोमेट्रिक सुरक्षा वाला Secure Vault। Google Drive, OneDrive और Dropbox पर क्लाउड बैकअप। डुप्लिकेट फ़ाइंडर। एक बार भुगतान, कोई सब्सक्रिप्शन नहीं।',
      },
      {
        title: 'अपनी फ़ाइलों तक पहुँच',
        body: 'AskFiles को काम करने के लिए आपकी फ़ोटो, वीडियो और फ़ाइलों तक पहुँच चाहिए। आपकी फ़ाइलें कभी आपके डिवाइस से बाहर नहीं जातीं।',
      },
    ],
    skip: 'छोड़ें',
    next: 'आगे',
    grantAccess: 'अनुमति दें',
    requesting: 'अनुरोध हो रहा है...',
    accessGranted: 'अनुमति मिल गई ✓',
    getStarted: 'शुरू करें',
  },
};

/** The phone's language as 'ar', 'hi' or 'en' (anything else). */
export function deviceLanguage(): OnboardingLang {
  if (FORCE_LANG) return FORCE_LANG;
  let tag = '';
  try {
    // Android gives e.g. 'ar_EG' or 'hi_IN'.
    tag = (I18nManager as any).getConstants?.().localeIdentifier ?? '';
  } catch {}
  if (!tag) {
    try { tag = Intl.DateTimeFormat().resolvedOptions().locale ?? ''; } catch {}
  }
  const base = tag.toLowerCase().split(/[-_]/)[0];
  return base === 'ar' || base === 'hi' ? base : 'en';
}

export function onboardingText(): OnboardingText {
  return TEXT[deviceLanguage()];
}
