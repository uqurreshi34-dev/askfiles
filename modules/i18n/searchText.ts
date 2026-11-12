/**
 * Search screen words: Search, Ask AI and Smart tabs.
 *
 * Question chips: the English question stays the key that is sent and
 * matched (askFree / askLocal / backend), so translating the label never
 * changes what gets answered. question() only changes what is shown.
 *
 * Counts: Hindi verb changes for 1 versus more; Arabic has forms for
 * 1, 2 (dual, no number), 3-10 and 11+.
 */
import { AppLang } from '../appLanguage';

/** Arabic: 1, 2 (dual, said without the number), 3-10, 11+ */
const ar4 = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`;

export type SearchText = {
  search: string; askAi: string; smart: string;
  searching: string; showHistory: string; recentSearches: string; clear: string;
  historyHidden: string; typeTwoChars: string;
  noFilesFor: (q: string) => string; nResults: (n: number) => string;
  fileOfType: (ext: string) => string;
  askOwnWordsPro: string; micNeeded: string; micVoiceSearch: string;
  thinking: string; askFilesAi: string; askSomethingElse: string; tryThese: string; withPro: string;
  askAboutPlain: string; freeHint: string; stillReading: string;
  searchingContent: string; readingDocs: string; searchInsideDocs: string;
  readyToSearch: (n: number) => string; docTypes: string;
  noDocsContain: (q: string) => string; cantFindDoc: string; nDocsMatch: (n: number) => string;
  folderIsEmpty: string;
  searchFilesPh: string; askAnythingPh: string; searchInsideDocsPh: string;
  filter: Record<string, string>;
  question: (english: string) => string;
  aiBusy: string; aiUnavailable: string; aiNoAnswer: string; aiOffline: string;
};

const Q: Record<'ar' | 'hi', Record<string, string>> = {
  ar: {
    'What images do I have?': 'ما الصور الموجودة لدي؟',
    'Find my downloaded files': 'ابحث عن ملفاتي المنزّلة',
    'What videos are on my phone?': 'ما مقاطع الفيديو على هاتفي؟',
    "What's taking up the most space?": 'ما الذي يشغل أكبر مساحة؟',
    'How much storage do I have left?': 'كم تبقّى لدي من مساحة التخزين؟',
    'Should I free up some space?': 'هل يجب أن أفرّغ بعض المساحة؟',
    "What's my largest image?": 'ما أكبر صورة لدي؟',
    "What's my largest video?": 'ما أكبر مقطع فيديو لدي؟',
    "What's my largest file?": 'ما أكبر ملف لدي؟',
    'How many screenshots do I have?': 'كم لقطة شاشة لدي؟',
  },
  hi: {
    'What images do I have?': 'मेरे पास कौन-सी इमेज हैं?',
    'Find my downloaded files': 'मेरी डाउनलोड की गई फ़ाइलें ढूँढें',
    'What videos are on my phone?': 'मेरे फ़ोन पर कौन-से वीडियो हैं?',
    "What's taking up the most space?": 'सबसे ज़्यादा जगह किसने ली है?',
    'How much storage do I have left?': 'मेरे पास कितना स्टोरेज बचा है?',
    'Should I free up some space?': 'क्या मुझे कुछ जगह खाली करनी चाहिए?',
    "What's my largest image?": 'मेरी सबसे बड़ी इमेज कौन-सी है?',
    "What's my largest video?": 'मेरा सबसे बड़ा वीडियो कौन-सा है?',
    "What's my largest file?": 'मेरी सबसे बड़ी फ़ाइल कौन-सी है?',
    'How many screenshots do I have?': 'मेरे पास कितने स्क्रीनशॉट हैं?',
  },
};

const TEXT: Record<AppLang, SearchText> = {
  en: {
    search: 'Search', askAi: 'Ask AI', smart: 'Smart',
    searching: 'Searching...', showHistory: 'Show history', recentSearches: 'Recent searches', clear: 'Clear',
    historyHidden: 'Search history hidden', typeTwoChars: 'Type 2+ characters',
    noFilesFor: q => `No files found for "${q}"`, nResults: n => `${n} result${n !== 1 ? 's' : ''}`,
    fileOfType: ext => `${ext} file`,
    askOwnWordsPro: 'Ask in your own words with Pro', micNeeded: '🎤 Microphone access needed',
    micVoiceSearch: 'Enable microphone access in Settings to use voice search',
    thinking: 'Thinking...', askFilesAi: 'AskFiles AI', askSomethingElse: 'Ask something else', tryThese: 'Try these', withPro: 'With Pro',
    askAboutPlain: 'Ask about your files in plain English',
    freeHint: 'Free: tap a question for an instant answer, as often as you like',
    stillReading: "I'm still reading your storage. Give me a moment and ask again.",
    searchingContent: 'Searching content...', readingDocs: 'Reading your documents...', searchInsideDocs: 'Search inside your documents',
    readyToSearch: n => `${n} file${n !== 1 ? 's' : ''} ready to search - scans up to 200 files per visit`,
    docTypes: 'PDFs, Word, Excel and text files',
    noDocsContain: q => `No documents contain "${q}"`,
    cantFindDoc: "Can't find your document? Make sure it's saved to Downloads or Documents.",
    nDocsMatch: n => `${n} document${n !== 1 ? 's' : ''} match`,
    folderIsEmpty: 'Folder is empty',
    searchFilesPh: 'Search files...', askAnythingPh: 'Ask anything about your files...', searchInsideDocsPh: 'Search inside documents...',
    filter: { All: 'All', Images: 'Images', Videos: 'Videos', Audio: 'Audio', Docs: 'Docs', Other: 'Other' },
    question: q => q,
    aiBusy: 'AskFiles AI is busy right now. Try again later.', aiUnavailable: 'AI unavailable. Try again.',
    aiNoAnswer: 'No answer received.', aiOffline: 'Could not reach AI. Check your connection and try again.',
  },
  ar: {
    search: 'بحث', askAi: 'اسأل الذكاء الاصطناعي', smart: 'ذكي',
    searching: 'جارٍ البحث...', showHistory: 'إظهار السجل', recentSearches: 'عمليات البحث الأخيرة', clear: 'مسح',
    historyHidden: 'سجل البحث مخفي', typeTwoChars: 'اكتب حرفين أو أكثر',
    noFilesFor: q => `لا توجد ملفات لـ «${q}»`,
    nResults: n => ar4(n, 'نتيجة واحدة', 'نتيجتان', 'نتائج', 'نتيجة'),
    fileOfType: ext => `ملف ${ext}`,
    askOwnWordsPro: 'اسأل بكلماتك الخاصة مع Pro', micNeeded: '🎤 مطلوب الوصول إلى الميكروفون',
    micVoiceSearch: 'فعّل الوصول إلى الميكروفون في الإعدادات لاستخدام البحث الصوتي',
    thinking: 'جارٍ التفكير...', askFilesAi: 'ذكاء AskFiles', askSomethingElse: 'اسأل عن شيء آخر', tryThese: 'جرّب هذه', withPro: 'مع Pro',
    askAboutPlain: 'اسأل عن ملفاتك بلغة بسيطة',
    freeHint: 'مجاناً: اضغط سؤالاً لتحصل على إجابة فورية، متى شئت',
    stillReading: 'ما زلت أقرأ مساحة التخزين لديك. انتظر لحظة واسأل مرة أخرى.',
    searchingContent: 'جارٍ البحث في المحتوى...', readingDocs: 'جارٍ قراءة مستنداتك...', searchInsideDocs: 'ابحث داخل مستنداتك',
    readyToSearch: n => `${ar4(n, 'ملف واحد جاهز', 'ملفان جاهزان', 'ملفات جاهزة', 'ملفاً جاهزاً')} للبحث - يتم فحص 200 ملف كحد أقصى في كل زيارة`,
    docTypes: 'ملفات PDF وWord وExcel والملفات النصية',
    noDocsContain: q => `لا توجد مستندات تحتوي على «${q}»`,
    cantFindDoc: 'لا تجد مستندك؟ تأكد من حفظه في التنزيلات أو المستندات.',
    nDocsMatch: n => ar4(n, 'مستند واحد مطابق', 'مستندان مطابقان', 'مستندات مطابقة', 'مستنداً مطابقاً'),
    folderIsEmpty: 'المجلد فارغ',
    searchFilesPh: 'ابحث في الملفات...', askAnythingPh: 'اسأل عن أي شيء يخص ملفاتك...', searchInsideDocsPh: 'ابحث داخل المستندات...',
    filter: { All: 'الكل', Images: 'الصور', Videos: 'الفيديو', Audio: 'الصوت', Docs: 'المستندات', Other: 'أخرى' },
    question: q => Q.ar[q] ?? q,
    aiBusy: 'ذكاء AskFiles مشغول الآن. حاول لاحقاً.', aiUnavailable: 'الذكاء الاصطناعي غير متاح. حاول مرة أخرى.',
    aiNoAnswer: 'لم تصل أي إجابة.', aiOffline: 'تعذّر الوصول إلى الذكاء الاصطناعي. تحقّق من اتصالك وحاول مرة أخرى.',
  },
  hi: {
    search: 'सर्च', askAi: 'AI से पूछें', smart: 'स्मार्ट',
    searching: 'खोज रहे हैं...', showHistory: 'इतिहास दिखाएँ', recentSearches: 'हाल की खोजें', clear: 'साफ़ करें',
    historyHidden: 'खोज इतिहास छिपा है', typeTwoChars: '2 या ज़्यादा अक्षर लिखें',
    noFilesFor: q => `"${q}" के लिए कोई फ़ाइल नहीं मिली`,
    nResults: n => `${n} ${n === 1 ? 'नतीजा' : 'नतीजे'}`,
    fileOfType: ext => `${ext} फ़ाइल`,
    askOwnWordsPro: 'Pro के साथ अपने शब्दों में पूछें', micNeeded: '🎤 माइक्रोफ़ोन की अनुमति चाहिए',
    micVoiceSearch: 'वॉइस सर्च के लिए Settings में माइक्रोफ़ोन की अनुमति चालू करें',
    thinking: 'सोच रहा है...', askFilesAi: 'AskFiles AI', askSomethingElse: 'कुछ और पूछें', tryThese: 'ये आज़माएँ', withPro: 'Pro के साथ',
    askAboutPlain: 'अपनी फ़ाइलों के बारे में आसान भाषा में पूछें',
    freeHint: 'मुफ़्त: तुरंत जवाब के लिए किसी सवाल पर टैप करें, जितनी बार चाहें',
    stillReading: 'मैं अभी आपका स्टोरेज पढ़ रहा हूँ। एक पल रुकें और फिर से पूछें।',
    searchingContent: 'सामग्री में खोज रहे हैं...', readingDocs: 'आपके डॉक्यूमेंट पढ़े जा रहे हैं...', searchInsideDocs: 'अपने डॉक्यूमेंट के अंदर खोजें',
    readyToSearch: n => `${n} ${n === 1 ? 'फ़ाइल खोजने के लिए तैयार है' : 'फ़ाइलें खोजने के लिए तैयार हैं'} - हर बार अधिकतम 200 फ़ाइलें स्कैन होती हैं`,
    docTypes: 'PDF, Word, Excel और टेक्स्ट फ़ाइलें',
    noDocsContain: q => `किसी डॉक्यूमेंट में "${q}" नहीं है`,
    cantFindDoc: 'आपका डॉक्यूमेंट नहीं मिल रहा? पक्का करें कि वह Downloads या Documents में सेव है।',
    nDocsMatch: n => `${n} डॉक्यूमेंट ${n === 1 ? 'मेल खाता है' : 'मेल खाते हैं'}`,
    folderIsEmpty: 'फ़ोल्डर खाली है',
    searchFilesPh: 'फ़ाइलें खोजें...', askAnythingPh: 'अपनी फ़ाइलों के बारे में कुछ भी पूछें...', searchInsideDocsPh: 'डॉक्यूमेंट के अंदर खोजें...',
    filter: { All: 'सभी', Images: 'इमेज', Videos: 'वीडियो', Audio: 'ऑडियो', Docs: 'डॉक्स', Other: 'अन्य' },
    question: q => Q.hi[q] ?? q,
    aiBusy: 'AskFiles AI अभी व्यस्त है। थोड़ी देर बाद कोशिश करें।', aiUnavailable: 'AI उपलब्ध नहीं है। फिर से कोशिश करें।',
    aiNoAnswer: 'कोई जवाब नहीं मिला।', aiOffline: 'AI तक नहीं पहुँच सके। अपना कनेक्शन जाँचें और फिर से कोशिश करें।',
  },
};

export function searchText(lang: AppLang): SearchText { return TEXT[lang]; }
