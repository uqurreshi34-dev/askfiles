/**
 * Cloud / Pro screen words. Feature cards are keyed by their English title
 * in app/(tabs)/cloud.tsx, so that list stays the single source of what
 * Pro includes; this file only gives each card its words.
 */
import { AppLang } from '../appLanguage';

type Card = { title: string; desc: string };

export type ProText = {
  onPro: string; allUnlocked: string; title: string; subtitle: string;
  lifetime: (price: string) => string; lifetimeSub: string; restore: string; legal: string;
  card: (englishTitle: string, englishDesc: string) => Card;
  /** usePro reports errors in English; this says them in the app's language. */
  error: (english: string) => string;
};

const AR_CARDS: Record<string, Card> = {
  'Cloud Backup & Settings Sync': { title: 'النسخ الاحتياطي السحابي ومزامنة الإعدادات', desc: 'انسخ ملفات الخزنة احتياطياً وزامن الوسوم والمفضلة والمجلدات المثبتة بين أجهزتك عبر Google Drive أو OneDrive أو Dropbox' },
  'Ask AI Anything': { title: 'اسأل الذكاء الاصطناعي عن أي شيء', desc: 'اسأل عن ملفاتك بكلماتك الخاصة، كتابةً أو صوتاً' },
  'Smart Search': { title: 'البحث الذكي', desc: 'ابحث داخل ملفات PDF وWord وExcel والملفات النصية — اعثر على أي كلمة في كل مستنداتك فوراً' },
  'Secure Vault': { title: 'الخزنة الآمنة', desc: 'احمِ ملفاتك الحساسة خلف البصمة' },
  'Duplicate Finder': { title: 'البحث عن الملفات المكررة', desc: 'اعثر على الملفات المكررة واحذفها لتوفير المساحة' },
  'Similar Image Finder': { title: 'البحث عن الصور المتشابهة', desc: 'اعثر على الصور المتشابهة في مكتبتك كلها — حتى بأسماء أو صيغ مختلفة' },
};
const HI_CARDS: Record<string, Card> = {
  'Cloud Backup & Settings Sync': { title: 'क्लाउड बैकअप और सेटिंग्स सिंक', desc: 'Vault फ़ाइलों का बैकअप लें और Google Drive, OneDrive या Dropbox से अपने टैग, पसंदीदा और पिन किए गए फ़ोल्डर सभी डिवाइस पर सिंक करें' },
  'Ask AI Anything': { title: 'AI से कुछ भी पूछें', desc: 'अपनी फ़ाइलों के बारे में अपने शब्दों में पूछें, लिखकर या बोलकर' },
  'Smart Search': { title: 'स्मार्ट सर्च', desc: 'PDF, Word, Excel और टेक्स्ट फ़ाइलों के अंदर खोजें — अपने सभी डॉक्यूमेंट में कोई भी शब्द तुरंत ढूँढें' },
  'Secure Vault': { title: 'सुरक्षित Vault', desc: 'संवेदनशील फ़ाइलों को बायोमेट्रिक लॉक के पीछे सुरक्षित रखें' },
  'Duplicate Finder': { title: 'डुप्लिकेट फ़ाइंडर', desc: 'जगह खाली करने के लिए डुप्लिकेट फ़ाइलें ढूँढें और हटाएँ' },
  'Similar Image Finder': { title: 'मिलती-जुलती इमेज फ़ाइंडर', desc: 'अपनी पूरी लाइब्रेरी में मिलती-जुलती फ़ोटो ढूँढें — अलग नाम या फ़ॉर्मेट होने पर भी' },
};
const AR_ERR: Record<string, string> = {
  'Purchase failed. Please try again.': 'فشل الشراء. حاول مرة أخرى.',
  'No previous purchase found.': 'لم يُعثر على عملية شراء سابقة.',
  'Restore failed. Please try again.': 'فشلت الاستعادة. حاول مرة أخرى.',
};
const HI_ERR: Record<string, string> = {
  'Purchase failed. Please try again.': 'खरीदारी नहीं हो सकी। फिर से कोशिश करें।',
  'No previous purchase found.': 'कोई पिछली खरीदारी नहीं मिली।',
  'Restore failed. Please try again.': 'रीस्टोर नहीं हो सका। फिर से कोशिश करें।',
};

const TEXT: Record<AppLang, ProText> = {
  en: {
    onPro: "You're on Pro 🎉", allUnlocked: 'All features are unlocked. Thank you for supporting AskFiles!',
    title: 'AskFiles Pro', subtitle: 'Unlock the full power of your file manager',
    lifetime: price => `Lifetime — ${price}`, lifetimeSub: 'One-time payment, yours forever',
    restore: 'Restore purchases', legal: 'One-time payment via Google Play. No subscription, no recurring charges.',
    card: (title, desc) => ({ title, desc }),
    error: e => e,
  },
  ar: {
    onPro: 'أنت مشترك في Pro 🎉', allUnlocked: 'كل الميزات مفتوحة. شكراً لدعمك AskFiles!',
    title: 'AskFiles Pro', subtitle: 'أطلق القوة الكاملة لمدير ملفاتك',
    lifetime: price => `مدى الحياة — ${price}`, lifetimeSub: 'دفعة واحدة، لك للأبد',
    restore: 'استعادة المشتريات', legal: 'دفعة واحدة عبر Google Play. بلا اشتراك ولا رسوم متكررة.',
    card: (title, desc) => AR_CARDS[title] ?? { title, desc },
    error: e => AR_ERR[e] ?? e,
  },
  hi: {
    onPro: 'आप Pro पर हैं 🎉', allUnlocked: 'सभी फ़ीचर अनलॉक हैं। AskFiles का साथ देने के लिए धन्यवाद!',
    title: 'AskFiles Pro', subtitle: 'अपने फ़ाइल मैनेजर की पूरी ताकत अनलॉक करें',
    lifetime: price => `लाइफ़टाइम — ${price}`, lifetimeSub: 'एक बार भुगतान, हमेशा के लिए आपका',
    restore: 'खरीदारी रीस्टोर करें', legal: 'Google Play से एक बार भुगतान। कोई सब्सक्रिप्शन नहीं, कोई बार-बार शुल्क नहीं।',
    card: (title, desc) => HI_CARDS[title] ?? { title, desc },
    error: e => HI_ERR[e] ?? e,
  },
};

export function proText(lang: AppLang): ProText { return TEXT[lang]; }
