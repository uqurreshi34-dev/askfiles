/**
 * Arabic and letter spacing.
 *
 * Several titles use slightly tightened letter spacing. Android cannot
 * tighten joined Arabic letters, but still measures the text as if it had,
 * so Arabic titles wrapped early or sat off-centre. In Arabic, spacing is
 * normal; English and Hindi keep the tightened look.
 *
 * Reads the current language at render time. Every screen re-renders when
 * the language changes (useLanguage), so these stay in step.
 */
import { getLanguage } from '@/modules/appLanguage';

const NO_SPACING = { letterSpacing: 0 } as const;

/** Add to a Text style array: normal spacing in Arabic, nothing otherwise. */
export function arSpacing() {
  return getLanguage() === 'ar' ? NO_SPACING : undefined;
}

/** For inline styles: the given spacing, or 0 in Arabic. */
export function arLs(value: number): number {
  return getLanguage() === 'ar' ? 0 : value;
}
