import { es } from './es';
import { en } from './en';

const translations: Record<string, Record<string, string>> = { es, en };

let currentLang = localStorage.getItem('homepinas-language') || 'en';

export function setLanguage(lang: string) {
  currentLang = lang;
  localStorage.setItem('homepinas-language', lang);
}

export function getLanguage(): string {
  return currentLang;
}

/**
 * Translate a key. Falls back to English, then to the key itself.
 */
export function t(key: string, fallback?: string): string {
  return translations[currentLang]?.[key]
    ?? translations.en?.[key]
    ?? fallback
    ?? key;
}
