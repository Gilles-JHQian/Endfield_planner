/** Minimal i18n. One flat dict per locale, simple {placeholder} interpolation,
 *  React context for the active locale.
 *
 *  No i18next / Lingui dependency until the string surface grows beyond the
 *  solver page (per REQUIREMENT.md §12: no abstractions until two use cases).
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import zhCn from './zh-cn.json';
import en from './en.json';

export const LOCALES = ['zh-cn', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'zh-cn';

const DICTS: Record<Locale, Record<string, string>> = {
  'zh-cn': zhCn,
  en,
};

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const v = vars[name];
    return v === undefined ? `{${name}}` : String(v);
  });
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = DICTS[locale];
      const tmpl = dict[key];
      if (tmpl === undefined) return `[${key}]`;
      return interpolate(tmpl, vars);
    },
    [locale],
  );

  const value = useMemo<I18nValue>(() => ({ locale, setLocale, t }), [locale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(I18nContext);
  if (!v) throw new Error('useI18n must be used inside <I18nProvider>');
  return v;
}
