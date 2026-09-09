import { configurePortalI18n } from "@nocobase/portal-sdk/i18n";

export const portalI18nReady = configurePortalI18n({
  defaultLocale: "en-US",
  locales: [
    { locale: "en-US", label: "English", direction: "ltr" },
    { locale: "zh-CN", label: "简体中文", direction: "ltr" },
    { locale: "ja-JP", label: "日本語", direction: "ltr" },
    { locale: "ko-KR", label: "한국어", direction: "ltr" },
    { locale: "zh-TW", label: "繁體中文", direction: "ltr" },
    { locale: "fr-FR", label: "Français", direction: "ltr" },
    { locale: "de-DE", label: "Deutsch", direction: "ltr" },
    { locale: "es-ES", label: "Español", direction: "ltr" },
    { locale: "pt-BR", label: "Português (Brasil)", direction: "ltr" },
    { locale: "ru-RU", label: "Русский", direction: "ltr" },
    { locale: "it-IT", label: "Italiano", direction: "ltr" },
    { locale: "nl-NL", label: "Nederlands", direction: "ltr" },
    { locale: "tr-TR", label: "Türkçe", direction: "ltr" },
    { locale: "pl-PL", label: "Polski", direction: "ltr" },
    { locale: "vi-VN", label: "Tiếng Việt", direction: "ltr" },
    { locale: "th-TH", label: "ไทย", direction: "ltr" },
    { locale: "id-ID", label: "Bahasa Indonesia", direction: "ltr" },
    { locale: "ar-EG", label: "العربية", direction: "rtl" },
    { locale: "cs-CZ", label: "Čeština", direction: "ltr" },
    { locale: "he-IL", label: "עברית", direction: "rtl" },
    { locale: "hi-IN", label: "हिन्दी", direction: "ltr" },
    { locale: "sv-SE", label: "Svenska", direction: "ltr" },
    { locale: "uk-UA", label: "Українська", direction: "ltr" },
  ],
  initOptions: {
    defaultNS: "starter",
    fallbackNS: "starter",
  },
  onLocaleChanged: () => {
    if (typeof window !== "undefined") window.location.reload();
  },
});
