/**
 * Backup and restore progress shown in the Android notification bar.
 * Used from hooks (no React), so it reads the current language each call.
 * Service names (Google Drive, OneDrive, Dropbox) stay in English.
 */
import { AppLang, getLanguage } from '../appLanguage';

const TEXT: Record<AppLang, {
  backingUp: (svc: string, done: number, total: number) => string;
  restoring: (svc: string, done: number, total: number) => string;
}> = {
  en: {
    backingUp: (svc, d, t) => `Backing up to ${svc} — ${d}/${t} files`,
    restoring: (svc, d, t) => `Restoring from ${svc} — ${d}/${t} files`,
  },
  ar: {
    backingUp: (svc, d, t) => `جارٍ النسخ الاحتياطي إلى ${svc} — ${d} من ${t}`,
    restoring: (svc, d, t) => `جارٍ الاستعادة من ${svc} — ${d} من ${t}`,
  },
  hi: {
    backingUp: (svc, d, t) => `${svc} पर बैकअप हो रहा है — ${t} में से ${d}`,
    restoring: (svc, d, t) => `${svc} से रीस्टोर हो रहा है — ${t} में से ${d}`,
  },
};

export function serviceText() {
  return TEXT[getLanguage()];
}
