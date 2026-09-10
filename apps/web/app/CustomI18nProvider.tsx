"use client";

import { dir } from "i18next";
import { createContext, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";

type CustomI18nContextType = {
  translations: Record<string, string>;
  ns: string;
  locale: string;
};

export const CustomI18nContext = createContext<CustomI18nContextType | null>(null);

export function CustomI18nProvider({
  children,
  translations,
  locale,
  ns,
}: CustomI18nContextType & {
  children: ReactNode;
}) {
  const originalDirRef = useRef<string | null>(null);
  const originalLangRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (originalDirRef.current === null) {
      originalDirRef.current = document.documentElement.dir || "ltr";
    }
    if (originalLangRef.current === null) {
      originalLangRef.current = document.documentElement.lang || "en";
    }

    const direction = dir(locale) ?? "ltr";
    document.documentElement.dir = direction;
    document.documentElement.lang = locale;

    return () => {
      if (originalDirRef.current !== null) {
        document.documentElement.dir = originalDirRef.current;
      }
      if (originalLangRef.current !== null) {
        document.documentElement.lang = originalLangRef.current;
      }
    };
  }, [locale]);

  const value = useMemo(
    () => ({
      translations,
      locale,
      ns,
    }),
    [locale, ns]
  );

  return <CustomI18nContext.Provider value={value}>{children}</CustomI18nContext.Provider>;
}
