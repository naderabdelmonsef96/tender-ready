import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";

import { i18n, type AppLanguage } from "@/lib/i18n";

const STORAGE_KEY = "tenderready.language";

type LanguageContextValue = {
  language: AppLanguage;
  direction: "ltr" | "rtl";
  setLanguage: (language: AppLanguage) => void;
  toggleLanguage: () => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function applyDocumentLanguage(language: AppLanguage) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.lang = language;
  html.dir = language === "ar" ? "rtl" : "ltr";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>("en");

  // Read the stored preference after hydration so server and client markup match.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial: AppLanguage = stored === "ar" ? "ar" : "en";
    setLanguageState(initial);
    void i18n.changeLanguage(initial);
    applyDocumentLanguage(initial);
  }, []);

  const setLanguage = useCallback((next: AppLanguage) => {
    setLanguageState(next);
    void i18n.changeLanguage(next);
    applyDocumentLanguage(next);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      direction: language === "ar" ? "rtl" : "ltr",
      setLanguage,
      toggleLanguage: () => setLanguage(language === "ar" ? "en" : "ar"),
    }),
    [language, setLanguage],
  );

  return (
    <I18nextProvider i18n={i18n}>
      <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
    </I18nextProvider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}

/** Convenience wrapper so screens get `t` and the active direction together. */
export function useAppTranslation() {
  const { t } = useTranslation();
  const { language, direction } = useLanguage();
  return { t, language, direction, isRtl: direction === "rtl" };
}
