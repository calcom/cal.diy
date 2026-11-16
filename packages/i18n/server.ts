import { createInstance } from "i18next";
import type { i18n as I18nInstance } from "i18next";

const { i18n } = require("@calcom/i18n/next-i18next.config");

const englishTranslations: Record<string, string> = require("@calcom/i18n/locales/en/common.json");

const translationCache = new Map<string, Record<string, string>>();
const i18nInstanceCache = new Map<string, I18nInstance>();
const SUPPORTED_NAMESPACES = ["common"];

export function mergeWithEnglishFallback(localeTranslations: Record<string, string>): Record<string, string> {
  return {
    // IMPORTANT: Spread English translations first to provide fallback for missing keys
    ...englishTranslations,
    // Then spread locale translations to override English when keys exist in both
    ...localeTranslations,
  };
}

/**
 * Loads translations for a specific locale and namespace with optimized caching
 * Server-side only function that loads translations directly from file system for best performance
 * Uses @calcom/config package alias for reliable access across all packages in the monorepo
 * @param {string} _locale - The locale code (e.g., 'en', 'fr', 'zh')
 * @param {string} ns - The namespace for the translations
 * @returns {Promise<Record<string, string>>} Translations object or fallback translations on failure
 */
export async function loadTranslations(_locale: string, _ns: string) {
  let locale = _locale === "zh" ? "zh-CN" : _locale;
  locale = i18n.locales.includes(locale) ? locale : "en";
  const ns = SUPPORTED_NAMESPACES.includes(_ns) ? _ns : "common";
  const cacheKey = `${locale}-${ns}`;

  const cached = translationCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  if (locale === "en") {
    translationCache.set(cacheKey, englishTranslations);
    return englishTranslations;
  }

  const { default: localeTranslations } = await import(`./locales/${locale}/${ns}.json`);

  const mergedTranslations = mergeWithEnglishFallback(localeTranslations);
  translationCache.set(cacheKey, mergedTranslations);
  return mergedTranslations;
}

/**
 * Creates or retrieves a cached i18next translation function for the specified locale and namespace
 * @param {string} locale - The locale code (e.g., 'en', 'fr')
 * @param {string} ns - The namespace for the translations
 * @returns {Promise<Function>} A translation function bound to the specified locale and namespace
 */
export const getTranslation = async (locale: string, ns: string) => {
  const cacheKey = `${locale}-${ns}`;
  const cachedInstance = i18nInstanceCache.get(cacheKey);
  if (cachedInstance) {
    return cachedInstance.getFixedT(locale, ns);
  }

  const resources = await loadTranslations(locale, ns);

  const _i18n = createInstance();
  _i18n.init({
    lng: locale,
    resources: {
      [locale]: {
        [ns]: resources,
      },
    },
    fallbackLng: "en",
    // Output is rendered by React (which escapes text) or used as plain text (email subjects, SMS),
    // so HTML-escaping interpolated values would garble names like O'Brien into O&#39;Brien.
    interpolation: { escapeValue: false },
  });

  // Cache the i18n instance
  i18nInstanceCache.set(cacheKey, _i18n);
  return _i18n.getFixedT(locale, ns);
};
