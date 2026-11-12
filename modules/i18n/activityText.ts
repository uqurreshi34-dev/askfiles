/**
 * Activity log words, and the sentences that describe each entry.
 *
 * Entries are stored in English (places like "Internal storage/Download",
 * sources like "Vault"), so old entries keep working; they are translated
 * only when shown.
 *
 * Counts: Hindi verb changes for 1 versus more; Arabic has 1, 2 (dual),
 * 3-10 and 11+.
 */
import { AppLang } from '../appLanguage';
import type { ActivityEntry } from '../activityLog';

const ar = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? few : many;

type Words = {
  title: string; nothingYet: string; emptySub: string;
  clearTitle: string; clearMsg: string; cancel: string; clear: string;
  today: string; yesterday: string; locale: string;
  countLine: (n: number, max: number) => string; tapForDetail: string;
  places: Record<string, string>; sources: Record<string, string>;
  describe: (e: ActivityEntry, place: (p?: string) => string) => string;
  item: (name: string, from?: string, to?: string) => string;
  more: (n: number) => string;
};

const EN: Words = {
  title: 'Activity', nothingYet: 'Nothing yet',
  emptySub: 'Files you move, delete or add to the Vault are recorded here, so you can find where something went.',
  clearTitle: 'Clear activity',
  clearMsg: 'Remove the record of what happened to your files? This does not change any files.',
  cancel: 'Cancel', clear: 'Clear', today: 'Today', yesterday: 'Yesterday', locale: 'en-GB',
  countLine: (n, max) => `${n} action${n !== 1 ? 's' : ''} · last ${max} kept on this device`,
  tapForDetail: 'tap for detail',
  places: {}, sources: {},
  describe: (e, place) => {
    const total = e.count && e.count > 1 ? e.count : 0;
    const to = place(e.to), from = place(e.from);
    if (e.action === 'moved' || e.action === 'copied' || e.action === 'restored') {
      const verb = e.action === 'moved' ? 'Moved' : e.action === 'copied' ? 'Copied' : 'Restored';
      const subject = total ? `${verb} ${total} files` : `${verb} ${e.isFolder ? 'folder ' : ''}${e.name}`;
      return to ? `${subject} to ${to}` : subject;
    }
    if (e.action === 'renamed') {
      const subject = total ? `Renamed ${total} files` : `Renamed ${e.name}${e.newName ? ` to ${e.newName}` : ''}`;
      return to ? `${subject}, in ${to}` : subject;
    }
    if (e.action === 'trashed') {
      const subject = total ? `Moved ${total} files to Trash` : `Moved ${e.name} to Trash`;
      return from ? `${subject}, from ${from}` : subject;
    }
    const subject = total ? `Deleted ${total} files permanently` : `Deleted ${e.isFolder ? 'folder ' : ''}${e.name} permanently`;
    return from ? `${subject}, from ${from}` : subject;
  },
  item: (name, from, to) => from && to ? `${name}: ${from} to ${to}` : to ? `${name} to ${to}` : from ? `${name}, from ${from}` : name,
  more: n => `and ${n} more`,
};

const AR: Words = {
  title: 'سجل النشاط', nothingYet: 'لا شيء بعد',
  emptySub: 'تُسجَّل هنا الملفات التي تنقلها أو تحذفها أو تضيفها إلى الخزنة، لتعرف أين ذهب أي ملف.',
  clearTitle: 'مسح سجل النشاط',
  clearMsg: 'إزالة سجل ما حدث لملفاتك؟ لن يتغير أي ملف.',
  cancel: 'إلغاء', clear: 'مسح', today: 'اليوم', yesterday: 'أمس', locale: 'ar-u-nu-latn',
  countLine: (n, max) => `${ar(n, 'إجراء واحد', 'إجراءان', `${n} إجراءات`, `${n} إجراءً`)} · يُحتفظ بآخر ${max} على هذا الجهاز`,
  tapForDetail: 'اضغط للتفاصيل',
  places: { 'Internal storage': 'التخزين الداخلي', 'SD card': 'بطاقة SD', Vault: 'الخزنة', Trash: 'المهملات' },
  sources: {
    Browse: 'التصفح', Categories: 'الفئات', 'Dual pane': 'العرض المزدوج', Duplicates: 'الملفات المكررة',
    Search: 'البحث', 'Similar images': 'الصور المتشابهة', Trash: 'المهملات', Vault: 'الخزنة',
  },
  describe: (e, place) => {
    const total = e.count && e.count > 1 ? e.count : 0;
    const files = ar(total, 'ملف', 'ملفان', `${total} ملفات`, `${total} ملفاً`);
    const one = `${e.isFolder ? 'المجلد ' : ''}${e.name}`;
    const to = place(e.to), from = place(e.from);
    if (e.action === 'moved' || e.action === 'copied' || e.action === 'restored') {
      const verb = e.action === 'moved' ? 'نُقل' : e.action === 'copied' ? 'نُسخ' : 'استُعيد';
      const subject = `${verb} ${total ? files : one}`;
      return to ? `${subject} إلى ${to}` : subject;
    }
    if (e.action === 'renamed') {
      const subject = total ? `أُعيدت تسمية ${ar(total, 'ملف', 'ملفين', `${total} ملفات`, `${total} ملفاً`)}`
        : `أُعيدت تسمية ${e.name}${e.newName ? ` إلى ${e.newName}` : ''}`;
      return to ? `${subject}، في ${to}` : subject;
    }
    if (e.action === 'trashed') {
      const subject = `نُقل ${total ? files : e.name} إلى المهملات`;
      return from ? `${subject}، من ${from}` : subject;
    }
    const subject = `حُذف ${total ? files : one} نهائياً`;
    return from ? `${subject}، من ${from}` : subject;
  },
  item: (name, from, to) => from && to ? `${name}: من ${from} إلى ${to}` : to ? `${name} إلى ${to}` : from ? `${name}، من ${from}` : name,
  more: n => ar(n, 'وملف آخر', 'وملفان آخران', `و${n} ملفات أخرى`, `و${n} ملفاً آخر`),
};

const HI: Words = {
  title: 'एक्टिविटी', nothingYet: 'अभी कुछ नहीं',
  emptySub: 'जो फ़ाइलें आप मूव करते हैं, हटाते हैं या Vault में डालते हैं, वे यहाँ दर्ज होती हैं, ताकि आप जान सकें कि कोई फ़ाइल कहाँ गई।',
  clearTitle: 'एक्टिविटी साफ़ करें',
  clearMsg: 'आपकी फ़ाइलों के साथ क्या हुआ, इसका रिकॉर्ड हटाएँ? इससे कोई फ़ाइल नहीं बदलेगी।',
  cancel: 'रद्द करें', clear: 'साफ़ करें', today: 'आज', yesterday: 'कल', locale: 'hi-IN',
  countLine: (n, max) => `${n} एक्शन · आख़िरी ${max} इस डिवाइस पर रखे जाते हैं`,
  tapForDetail: 'विवरण के लिए टैप करें',
  places: { 'Internal storage': 'इंटरनल स्टोरेज', 'SD card': 'SD कार्ड', Vault: 'Vault', Trash: 'ट्रैश' },
  sources: {
    Browse: 'ब्राउज़', Categories: 'कैटेगरी', 'Dual pane': 'डुअल पेन', Duplicates: 'डुप्लिकेट',
    Search: 'सर्च', 'Similar images': 'मिलती-जुलती इमेज', Trash: 'ट्रैश', Vault: 'Vault',
  },
  describe: (e, place) => {
    // Only bulk entries carry a count, so a count here is always 2 or more (plural verb).
    const total = e.count && e.count > 1 ? e.count : 0;
    const one = `${e.isFolder ? 'फ़ोल्डर ' : ''}${e.name}`;
    const to = place(e.to), from = place(e.from);
    if (e.action === 'moved' || e.action === 'copied' || e.action === 'restored') {
      const verb = e.action === 'moved' ? 'मूव' : e.action === 'copied' ? 'कॉपी' : 'रीस्टोर';
      if (total) return to ? `${total} फ़ाइलें ${to} में ${verb} की गईं` : `${total} फ़ाइलें ${verb} की गईं`;
      return to ? `${one} को ${to} में ${verb} किया गया` : `${one} ${verb} किया गया`;
    }
    if (e.action === 'renamed') {
      const subject = total ? `${total} फ़ाइलों का नाम बदला गया`
        : e.newName ? `${e.name} का नाम बदलकर ${e.newName} किया गया` : `${e.name} का नाम बदला गया`;
      return to ? `${subject}, ${to} में` : subject;
    }
    if (e.action === 'trashed') {
      const subject = total ? `${total} फ़ाइलें ट्रैश में भेजी गईं` : `${e.name} ट्रैश में भेजा गया`;
      return from ? `${subject}, ${from} से` : subject;
    }
    const subject = total ? `${total} फ़ाइलें हमेशा के लिए हटाई गईं` : `${one} हमेशा के लिए हटाया गया`;
    return from ? `${subject}, ${from} से` : subject;
  },
  item: (name, from, to) => from && to ? `${name}: ${from} से ${to}` : to ? `${name}, ${to} में` : from ? `${name}, ${from} से` : name,
  more: n => `और ${n} ${n === 1 ? 'फ़ाइल' : 'फ़ाइलें'}`,
};

const WORDS: Record<AppLang, Words> = { en: EN, ar: AR, hi: HI };

export function activityText(lang: AppLang) {
  const w = WORDS[lang];
  /** "Internal storage/Download" -> translated first part, folder names kept. */
  const place = (p?: string) => {
    if (!p) return '';
    for (const key of Object.keys(w.places)) {
      if (p === key) return w.places[key];
      if (p.startsWith(key + '/')) return w.places[key] + p.slice(key.length);
    }
    return p;
  };
  return {
    ...w,
    place,
    source: (s: string) => w.sources[s] ?? s,
    describeEntry: (e: ActivityEntry) => w.describe(e, place),
    describeItems: (e: ActivityEntry) => {
      const items = e.items || [];
      if (!items.length) return [];
      const lines = items.map(i => w.item(i.name, place(i.from), place(i.to)));
      const total = e.count || items.length;
      if (total > items.length) lines.push(w.more(total - items.length));
      return lines;
    },
  };
}
