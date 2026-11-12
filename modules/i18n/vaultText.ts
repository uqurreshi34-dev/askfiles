/** Secure Vault screen words. Shared words (Cancel, Delete, file info...) are in common.ts. */
import { AppLang } from '../appLanguage';
import { arCount } from './common';

export type VaultText = {
  secureVault: string; vault: string; protectedSub: string;
  unlockBiometrics: string; usePinInstead: string; setUpPin: string; enterPin: string;
  unlockVault: string; usePin: string; proSub: string;
  moveOut: string; moveOutOfVault: string; empty: string; emptySub: string;
  secured: (n: number) => string;
  existsInFolder: (name: string) => string;
  existsHere: (name: string) => string;
  nExist: (n: number) => string;
  movedOne: (name: string) => string;
  movedN: (n: number) => string;
  partial: (moved: number, failed: number) => string;
  couldNotMove: string;
  deleteN: (n: number) => string;
  deleteOne: (name: string) => string;
};

const TEXT: Record<AppLang, VaultText> = {
  en: {
    secureVault: 'Secure Vault', vault: 'Vault',
    protectedSub: 'Your files are protected. Authenticate to access your vault.',
    unlockBiometrics: 'Unlock with Biometrics', usePinInstead: 'Use PIN instead', setUpPin: 'Set up a PIN', enterPin: 'Enter PIN',
    unlockVault: 'Unlock Vault', usePin: 'Use PIN',
    proSub: 'Secure Vault is part of AskFiles Pro. Upgrade once, use forever.',
    moveOut: 'Move out', moveOutOfVault: 'Move out of Vault',
    empty: 'Vault is empty', emptySub: 'Long press any file — or tap ⋮ — and select "Move to Vault"',
    secured: n => `${n} file${n !== 1 ? 's' : ''} secured`,
    existsInFolder: name => `"${name}" already exists in this folder.`,
    existsHere: name => `"${name}" already exists in this location.`,
    nExist: n => `${n} file${n !== 1 ? 's' : ''} already exist at this location and could not be moved.`,
    movedOne: name => `"${name}" moved out of Vault successfully.`,
    movedN: n => `${n} file${n !== 1 ? 's' : ''} moved out of Vault.`,
    partial: (m, f) => `${m} file${m !== 1 ? 's' : ''} moved. ${f} could not be moved — ${f === 1 ? 'it' : 'they'} already exist${f === 1 ? 's' : ''} at this location.`,
    couldNotMove: 'Could not move file out of Vault.',
    deleteN: n => `Delete ${n} file${n !== 1 ? 's' : ''} from Vault? This cannot be undone.`,
    deleteOne: name => `Delete "${name}" forever? This cannot be undone.`,
  },
  ar: {
    secureVault: 'الخزنة الآمنة', vault: 'الخزنة',
    protectedSub: 'ملفاتك محمية. تحقّق من هويتك للدخول إلى خزنتك.',
    unlockBiometrics: 'افتح بالبصمة', usePinInstead: 'استخدم رمز PIN بدلاً من ذلك', setUpPin: 'عيّن رمز PIN', enterPin: 'أدخل رمز PIN',
    unlockVault: 'فتح الخزنة', usePin: 'استخدم رمز PIN',
    proSub: 'الخزنة الآمنة جزء من AskFiles Pro. ادفع مرة واحدة واستخدمها للأبد.',
    moveOut: 'إخراج', moveOutOfVault: 'إخراج من الخزنة',
    empty: 'الخزنة فارغة', emptySub: 'اضغط مطوّلاً على أي ملف — أو اضغط ⋮ — واختر «نقل إلى الخزنة»',
    secured: n => `${n} ${arCount(n, 'ملف محمي', 'ملفات محمية')}`,
    existsInFolder: name => `«${name}» موجود بالفعل في هذا المجلد.`,
    existsHere: name => `«${name}» موجود بالفعل في هذا المكان.`,
    nExist: n => `${n} ${arCount(n, 'ملف', 'ملفات')} موجودة بالفعل في هذا المكان ولم يمكن نقلها.`,
    movedOne: name => `تم إخراج «${name}» من الخزنة بنجاح.`,
    movedN: n => `تم إخراج ${n} ${arCount(n, 'ملف', 'ملفات')} من الخزنة.`,
    partial: (m, f) => `تم نقل ${m} ${arCount(m, 'ملف', 'ملفات')}. تعذّر نقل ${f} لأنها موجودة بالفعل في هذا المكان.`,
    couldNotMove: 'تعذّر إخراج الملف من الخزنة.',
    deleteN: n => `حذف ${n} ${arCount(n, 'ملف', 'ملفات')} من الخزنة؟ لا يمكن التراجع عن ذلك.`,
    deleteOne: name => `حذف «${name}» نهائياً؟ لا يمكن التراجع عن ذلك.`,
  },
  hi: {
    secureVault: 'सुरक्षित Vault', vault: 'Vault',
    protectedSub: 'आपकी फ़ाइलें सुरक्षित हैं। Vault खोलने के लिए अपनी पहचान सत्यापित करें।',
    unlockBiometrics: 'बायोमेट्रिक से अनलॉक करें', usePinInstead: 'इसके बजाय PIN इस्तेमाल करें', setUpPin: 'PIN सेट करें', enterPin: 'PIN डालें',
    unlockVault: 'Vault अनलॉक करें', usePin: 'PIN इस्तेमाल करें',
    proSub: 'सुरक्षित Vault, AskFiles Pro का हिस्सा है। एक बार अपग्रेड करें, हमेशा इस्तेमाल करें।',
    moveOut: 'बाहर निकालें', moveOutOfVault: 'Vault से बाहर निकालें',
    empty: 'Vault खाली है', emptySub: 'किसी भी फ़ाइल को देर तक दबाएँ — या ⋮ दबाएँ — और "Vault में मूव करें" चुनें',
    secured: n => `${n} ${n !== 1 ? 'फ़ाइलें' : 'फ़ाइल'} सुरक्षित`,
    existsInFolder: name => `"${name}" इस फ़ोल्डर में पहले से मौजूद है।`,
    existsHere: name => `"${name}" इस जगह पर पहले से मौजूद है।`,
    nExist: n => `${n} ${n !== 1 ? 'फ़ाइलें' : 'फ़ाइल'} इस जगह पर पहले से मौजूद हैं और मूव नहीं हो सकीं।`,
    movedOne: name => `"${name}" Vault से बाहर निकाल दी गई।`,
    movedN: n => `${n} ${n !== 1 ? 'फ़ाइलें' : 'फ़ाइल'} Vault से बाहर निकाली गईं।`,
    partial: (m, f) => `${m} ${m !== 1 ? 'फ़ाइलें' : 'फ़ाइल'} मूव हुईं। ${f} मूव नहीं हो सकीं — वे इस जगह पर पहले से मौजूद हैं।`,
    couldNotMove: 'फ़ाइल को Vault से बाहर नहीं निकाला जा सका।',
    deleteN: n => `Vault से ${n} ${n !== 1 ? 'फ़ाइलें' : 'फ़ाइल'} हटाएँ? इसे वापस नहीं किया जा सकता।`,
    deleteOne: name => `"${name}" को हमेशा के लिए हटाएँ? इसे वापस नहीं किया जा सकता।`,
  },
};

export function vaultText(lang: AppLang): VaultText { return TEXT[lang]; }
