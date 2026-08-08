import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import { ar, en } from "./locales";

export type AppLanguage = "en" | "ar";

if (!i18next.isInitialized) {
  void i18next.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export const i18n = i18next;
