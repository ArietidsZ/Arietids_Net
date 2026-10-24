import { ui, type UiKey } from './ui';

export const locales = ['zh', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'zh';

export const htmlLang: Record<Locale, string> = { zh: 'zh-CN', en: 'en' };
export const ogLocale: Record<Locale, string> = { zh: 'zh_CN', en: 'en_US' };

/** A string shared by every locale, or a per-locale map (see content.config.ts). */
export type Localized = string | { zh: string; en?: string | undefined };

export function tr(value: Localized | undefined, lang: Locale): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  return value[lang] ?? value.zh;
}

export function t(lang: Locale) {
  return (key: UiKey, vars?: Record<string, string | number>): string => {
    let s: string = ui[lang][key] ?? ui[defaultLocale][key];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

/** `/work/x/` → `/en/work/x/` for non-default locales. Paths always end with a slash. */
export function localePath(lang: Locale, path = '/'): string {
  const clean = ('/' + path.replace(/^\/+/, '')).replace(/\/?$/, '/');
  return lang === defaultLocale ? clean : `/${lang}${clean === '/' ? '/' : clean}`;
}

/** Strip the locale prefix so the same page can be linked in another language. */
export function unlocalizedPath(pathname: string): string {
  for (const l of locales) {
    if (l === defaultLocale) continue;
    if (pathname === `/${l}` || pathname.startsWith(`/${l}/`)) return pathname.slice(l.length + 1) || '/';
  }
  return pathname;
}

export function formatDate(date: Date | string, lang: Locale, style: 'long' | 'short' = 'long'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(htmlLang[lang], {
    year: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}
