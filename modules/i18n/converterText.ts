/** Image Converter screen. */
import { AppLang } from '../appLanguage';

export type ConverterText = {
  title: string; convertAnImage: string; intro: string; chooseImage: string; chooseDifferent: string;
  convertTo: string; convertToFmt: (fmt: string) => string;
  descJpg: string; descPng: string; descWebp: string;
  couldNotPick: string; converted: string; savedTo: (path: string) => string; open: string;
  failed: string; couldNotConvert: string; saveAs: string; saveToPictures: string; chooseLocation: string;
  pictures: string; defaultSaveLocation: string; saveTitle: string; internalStorage: string;
};

const TEXT: Record<AppLang, ConverterText> = {
  en: {
    title: 'Image Converter', convertAnImage: 'Convert an image',
    intro: 'Change HEIC, WEBP, PNG or JPG into another format. Works fully offline — your image never leaves your device.',
    chooseImage: 'Choose Image', chooseDifferent: 'Choose a different image',
    convertTo: 'Convert to', convertToFmt: fmt => `Convert to ${fmt}`,
    descJpg: 'Smaller size, best for photos', descPng: 'Lossless, supports transparency', descWebp: 'Modern, small and high quality',
    couldNotPick: 'Could not pick image.', converted: 'Converted', savedTo: p => `Saved to ${p}`, open: 'Open',
    failed: 'Conversion failed', couldNotConvert: 'Could not convert this image.',
    saveAs: 'Save as', saveToPictures: 'Save to Pictures', chooseLocation: 'Choose location',
    pictures: 'Pictures', defaultSaveLocation: 'Default save location', saveTitle: 'Save converted image', internalStorage: 'Internal Storage',
  },
  ar: {
    title: 'محوّل الصور', convertAnImage: 'حوّل صورة',
    intro: 'حوّل صور HEIC أو WEBP أو PNG أو JPG إلى صيغة أخرى. يعمل دون اتصال تماماً — صورتك لا تغادر جهازك أبداً.',
    chooseImage: 'اختر صورة', chooseDifferent: 'اختر صورة أخرى',
    convertTo: 'تحويل إلى', convertToFmt: fmt => `تحويل إلى ${fmt}`,
    descJpg: 'حجم أصغر، الأفضل للصور الفوتوغرافية', descPng: 'دون فقدان للجودة، يدعم الشفافية', descWebp: 'حديث وصغير وعالي الجودة',
    couldNotPick: 'تعذّر اختيار الصورة.', converted: 'تم التحويل', savedTo: p => `حُفظت في ${p}`, open: 'فتح',
    failed: 'فشل التحويل', couldNotConvert: 'تعذّر تحويل هذه الصورة.',
    saveAs: 'حفظ باسم', saveToPictures: 'حفظ في الصور', chooseLocation: 'اختر المكان',
    pictures: 'الصور', defaultSaveLocation: 'مكان الحفظ الافتراضي', saveTitle: 'حفظ الصورة المحوّلة', internalStorage: 'التخزين الداخلي',
  },
  hi: {
    title: 'इमेज कन्वर्टर', convertAnImage: 'इमेज कन्वर्ट करें',
    intro: 'HEIC, WEBP, PNG या JPG को दूसरे फ़ॉर्मैट में बदलें। पूरी तरह ऑफ़लाइन चलता है — आपकी इमेज कभी आपके डिवाइस से बाहर नहीं जाती।',
    chooseImage: 'इमेज चुनें', chooseDifferent: 'दूसरी इमेज चुनें',
    convertTo: 'इसमें कन्वर्ट करें', convertToFmt: fmt => `${fmt} में कन्वर्ट करें`,
    descJpg: 'छोटा साइज़, फ़ोटो के लिए सबसे अच्छा', descPng: 'क्वालिटी नहीं घटती, ट्रांसपेरेंसी सपोर्ट करता है', descWebp: 'आधुनिक, छोटा और हाई क्वालिटी',
    couldNotPick: 'इमेज नहीं चुनी जा सकी।', converted: 'कन्वर्ट हो गई', savedTo: p => `${p} में सेव हुई`, open: 'खोलें',
    failed: 'कन्वर्ज़न नहीं हो सका', couldNotConvert: 'यह इमेज कन्वर्ट नहीं हो सकी।',
    saveAs: 'इस रूप में सेव करें', saveToPictures: 'Pictures में सेव करें', chooseLocation: 'जगह चुनें',
    pictures: 'Pictures', defaultSaveLocation: 'डिफ़ॉल्ट सेव लोकेशन', saveTitle: 'कन्वर्ट की गई इमेज सेव करें', internalStorage: 'इंटरनल स्टोरेज',
  },
};

export function converterText(lang: AppLang): ConverterText {
  return TEXT[lang];
}
