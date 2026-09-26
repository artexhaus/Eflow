import { useSyncExternalStore } from 'react';
import { es } from './i18n.es';

// English / Spanish. English text is the message key; es maps each key to its
// Spanish translation. t() only accepts keys that exist in es, so a string
// that isn't translated yet fails the typecheck instead of shipping in English.
export type Lang = 'en' | 'es';
export type MessageKey = keyof typeof es;
type Vars = Record<string, string | number>;

const STORAGE_KEY = 'eflow:lang';

function initialLanguage(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'es') return stored;
  } catch {
    // Storage unavailable (private mode etc.) - fall back to the browser language.
  }
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

let current: Lang = initialLanguage();
document.documentElement.lang = current;
const listeners = new Set<() => void>();

export function getLanguage(): Lang {
  return current;
}

export function setLanguage(lang: Lang) {
  if (lang === current) return;
  current = lang;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // The switch still works for this visit.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// es-US: Spanish wording with US number and currency conventions (prices are
// in US dollars).
export const locale = () => (current === 'es' ? 'es-US' : 'en-US');

export const formatNumber = (n: number) => n.toLocaleString(locale());

export function formatDate(date: string | Date, options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' }) {
  return new Date(date).toLocaleDateString(locale(), options);
}

function fill(template: string, vars?: Vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    if (value === undefined) return match;
    return typeof value === 'number' ? formatNumber(value) : value;
  });
}

// Translates a message. {name} placeholders are filled from vars; numbers are
// formatted for the current language.
export function t(key: MessageKey, vars?: Vars): string {
  return fill(current === 'es' ? es[key] : key, vars);
}

// Picks the singular or plural message for n and passes n in as {n}.
export function plural(n: number, one: MessageKey, other: MessageKey, vars?: Vars): string {
  return t(n === 1 ? one : other, { n, ...vars });
}

// Text that arrives from the server or the database in English (error
// messages, category labels): translated when it is a known message, shown
// as-is otherwise.
export function tKnown(text: string): string {
  if (current === 'es' && Object.prototype.hasOwnProperty.call(es, text)) return es[text as MessageKey];
  return text;
}

// "3 days ago" etc.
export function timeAgo(timestamp: string, { dayPrecision = false } = {}): string {
  const diffHours = Math.floor((Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  if (dayPrecision && diffDays < 1) return t('Today');
  if (diffHours < 1) return t('Just now');
  if (diffHours < 24) return t('{n}h ago', { n: diffHours });
  if (diffDays === 1) return t('Yesterday');
  if (diffDays < 30) return t('{n} days ago', { n: diffDays });
  if (diffDays < 365) return plural(Math.floor(diffDays / 30), '{n} month ago', '{n} months ago');
  return plural(Math.floor(diffDays / 365), '{n} year ago', '{n} years ago');
}

// Re-renders the calling component when the language changes.
export function useI18n() {
  const lang = useSyncExternalStore(subscribe, getLanguage);
  return { lang, t, plural, tKnown, formatNumber, formatDate, timeAgo, setLanguage };
}
