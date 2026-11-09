import { describe, expect, it } from "vitest";

import { getTranslation, loadTranslations, mergeWithEnglishFallback } from "./server";

describe("mergeWithEnglishFallback", () => {
  it("should merge locale translations with English fallback", () => {
    const localeTranslations = {
      // Override some existing English keys
      hello: "Bonjour",
      goodbye: "Au revoir",
      // Add new locale-specific keys
      locale_only: "French only text",
    };

    const result = mergeWithEnglishFallback(localeTranslations);

    // Check that locale translations override English
    expect(result.hello).toBe("Bonjour");
    expect(result.goodbye).toBe("Au revoir");

    // Check that locale-specific keys are preserved
    expect(result.locale_only).toBe("French only text");

    // Check that English fallback keys are present (using actual keys from the real file)
    expect(result).toHaveProperty("welcome");
    expect(result).toHaveProperty("cancel");

    // Verify the structure - should have both English and locale keys
    expect(Object.keys(result)).toContain("hello"); // overridden
    expect(Object.keys(result)).toContain("locale_only"); // locale-specific
    expect(Object.keys(result).length).toBeGreaterThan(3); // Should have many keys from English
  });

  it("should use English translations as fallback when locale translations are empty", () => {
    const localeTranslations = {};

    const result = mergeWithEnglishFallback(localeTranslations);

    // Should return all English translations
    expect(result).toHaveProperty("welcome");
    expect(result).toHaveProperty("cancel");
    expect(Object.keys(result).length).toBeGreaterThan(100); // English file has many keys
  });

  it("should prioritize locale translations over English when keys overlap", () => {
    const localeTranslations = {
      welcome: "Bienvenido",
      cancel: "Cancelar",
    };

    const result = mergeWithEnglishFallback(localeTranslations);

    // Spanish should override English
    expect(result.welcome).toBe("Bienvenido");
    expect(result.cancel).toBe("Cancelar");

    // Should still have other English keys
    expect(Object.keys(result).length).toBeGreaterThan(100);
  });

  it("should handle locale translations with additional keys not in English", () => {
    const localeTranslations = {
      // Override existing English key
      welcome: "Ciao",
      // Add new keys not in English
      italian_greeting: "Buongiorno",
      italian_phrase: "Come stai?",
    };

    const result = mergeWithEnglishFallback(localeTranslations);

    // Check overridden key
    expect(result.welcome).toBe("Ciao");

    // Check Italian-specific keys
    expect(result.italian_greeting).toBe("Buongiorno");
    expect(result.italian_phrase).toBe("Come stai?");

    // Should have English keys plus the new Italian ones
    expect(Object.keys(result).length).toBeGreaterThan(100);
    expect(Object.keys(result)).toContain("italian_greeting");
    expect(Object.keys(result)).toContain("italian_phrase");
  });
});

describe("loadTranslations", () => {
  it("returns bundled English translations for locale 'en'", async () => {
    const result = await loadTranslations("en", "common");

    expect(result).toHaveProperty("welcome", "Welcome");
    expect(result).toHaveProperty("cancel", "Cancel");
    expect(Object.keys(result).length).toBeGreaterThan(100);
  });

  it("returns French translations merged with English fallback", async () => {
    const result = await loadTranslations("fr", "common");

    expect(result).toHaveProperty("welcome", "Bienvenue");
    expect(result).toHaveProperty("cancel", "Annuler");
    expect(Object.keys(result).length).toBeGreaterThan(100);
  });

  it("aliases 'zh' to 'zh-CN'", async () => {
    const zhResult = await loadTranslations("zh", "common");
    const zhCNResult = await loadTranslations("zh-CN", "common");

    expect(zhResult).toEqual(zhCNResult);
  });

  it("falls back to English for unsupported locales", async () => {
    const result = await loadTranslations("xx-INVALID", "common");

    expect(result).toHaveProperty("welcome", "Welcome");
    expect(result).toHaveProperty("cancel", "Cancel");
  });

  it("falls back to 'common' namespace for unsupported namespaces", async () => {
    const result = await loadTranslations("en", "nonexistent-namespace");

    expect(result).toHaveProperty("welcome", "Welcome");
    expect(Object.keys(result).length).toBeGreaterThan(100);
  });

  it("returns cached result on subsequent calls for the same locale", async () => {
    const first = await loadTranslations("de", "common");
    const second = await loadTranslations("de", "common");

    expect(first).toBe(second);
  });

  it("includes English fallback keys missing from the locale file", async () => {
    const enResult = await loadTranslations("en", "common");
    const frResult = await loadTranslations("fr", "common");

    for (const key of Object.keys(enResult)) {
      expect(frResult).toHaveProperty(key);
    }
  });
});

describe("getTranslation", () => {
  it("returns a function that translates English keys", async () => {
    const t = await getTranslation("en", "common");

    expect(typeof t).toBe("function");
    expect(t("welcome")).toBe("Welcome");
    expect(t("cancel")).toBe("Cancel");
  });

  it("returns a function that translates French keys", async () => {
    const t = await getTranslation("fr", "common");

    expect(t("welcome")).toBe("Bienvenue");
    expect(t("cancel")).toBe("Annuler");
  });

  it("returns the key itself for missing translation keys", async () => {
    const t = await getTranslation("en", "common");

    expect(t("this_key_does_not_exist")).toBe("this_key_does_not_exist");
  });

  it("returns consistent results from cached i18n instance on subsequent calls", async () => {
    const first = await getTranslation("es", "common");
    const second = await getTranslation("es", "common");

    expect(first("welcome")).toBe(second("welcome"));
    expect(first("cancel")).toBe(second("cancel"));
  });

  it("returns different translation functions for different locales", async () => {
    const enT = await getTranslation("en", "common");
    const frT = await getTranslation("fr", "common");

    expect(enT("welcome")).not.toBe(frT("welcome"));
  });

  it("does not HTML-escape interpolated values", async () => {
    const t = await getTranslation("en", "common");

    expect(t("hosted_by", { name: "Conan O'Brien & Co" })).toBe("Hosted by Conan O'Brien & Co");
    expect(t("event_cancelled_subject", { title: `Q&A / "Intro"`, date: "Mon" })).toBe(
      `Canceled: Q&A / "Intro" at Mon`
    );
  });
});
