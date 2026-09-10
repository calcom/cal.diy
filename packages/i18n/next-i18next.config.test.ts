import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const i18nJson = require("../../i18n.json");
const config = require("./next-i18next.config");

describe("@calcom/i18n/next-i18next.config", () => {
  it("exports i18n with defaultLocale and locales", () => {
    expect(config.i18n).toBeDefined();
    expect(config.i18n.defaultLocale).toBe("en");
    expect(Array.isArray(config.i18n.locales)).toBe(true);
    expect(config.i18n.locales).toContain("en");
  });

  it("includes all target locales from i18n.json plus the source locale", () => {
    const expectedLocales = [...i18nJson.locale.targets, i18nJson.locale.source];
    for (const locale of expectedLocales) {
      expect(config.i18n.locales).toContain(locale);
    }
    expect(config.i18n.locales.length).toBe(expectedLocales.length);
  });

  it("has localePath pointing to existing locales directory", () => {
    expect(config.localePath).toBeDefined();
    expect(typeof config.localePath).toBe("string");
    expect(fs.existsSync(config.localePath)).toBe(true);
  });

  it("has fallbackLng configured", () => {
    expect(config.fallbackLng).toBeDefined();
    expect(config.fallbackLng.default).toEqual(["en"]);
    expect(config.fallbackLng.zh).toEqual(["zh-CN"]);
  });

  it("every locale in config has a corresponding locale directory with common.json", () => {
    const localesDir = config.localePath;
    for (const locale of config.i18n.locales) {
      const localeDir = path.join(localesDir, locale);
      const commonJson = path.join(localeDir, "common.json");
      expect(fs.existsSync(localeDir)).toBe(true);
      expect(fs.existsSync(commonJson)).toBe(true);
    }
  });

  it("english common.json is valid JSON with translation keys", () => {
    const enPath = path.join(config.localePath, "en", "common.json");
    const enTranslations = JSON.parse(fs.readFileSync(enPath, "utf-8"));
    expect(typeof enTranslations).toBe("object");
    expect(Object.keys(enTranslations).length).toBeGreaterThan(0);
  });

  it("Indonesian translations preserve interpolation and rich-text tokens", () => {
    const enTranslations = JSON.parse(
      fs.readFileSync(path.join(config.localePath, "en", "common.json"), "utf-8")
    );
    const idTranslations = JSON.parse(
      fs.readFileSync(path.join(config.localePath, "id", "common.json"), "utf-8")
    );
    const tokenPattern = /\{\{[^}]+\}\}|<\/?\d+>|\$t\([^)]*\)/g;
    const tokens = (value: string): string[] => (value.match(tokenPattern) ?? []).sort();

    for (const [key, translation] of Object.entries(idTranslations)) {
      if (typeof enTranslations[key] !== "string" || typeof translation !== "string") continue;
      expect(tokens(translation), key).toEqual(tokens(enTranslations[key]));
    }
  });
});
