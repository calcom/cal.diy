/* eslint-disable @typescript-eslint/no-explicit-any */
import { getToken } from "next-auth/jwt";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@calcom/prisma";

import { getLocale } from "./getLocale";

// Mock prisma
vi.mock("@calcom/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock next-auth/jwt
vi.mock("next-auth/jwt", () => ({
  getToken: vi.fn(),
}));

// Mock i18n config
vi.mock("@calcom/config/next-i18next.config", () => ({
  i18n: {
    locales: ["en", "es", "fr", "de", "pt", "pt-BR", "he", "ar"],
  },
}));

const mockGetToken = getToken as unknown as ReturnType<typeof vi.fn>;
const mockFindFirst = prisma.user.findFirst as unknown as ReturnType<typeof vi.fn>;

describe("getLocale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("with authenticated session", () => {
    it("should return locale from token when user is authenticated", async () => {
      mockGetToken.mockResolvedValue({ locale: "es" });

      const mockReq = {
        headers: new Headers({ "accept-language": "en-US" }),
        cookies: {},
      } as any;

      const result = await getLocale(mockReq);

      expect(result).toBe("es");
      expect(mockGetToken).toHaveBeenCalled();
      expect(mockFindFirst).not.toHaveBeenCalled();
    });

    it("should prioritize page owner's locale over authenticated visitor's token locale", async () => {
      // This is the key behavior: booking pages ALWAYS show the owner's language
      // Even if the visitor is logged in with a different language preference
      mockGetToken.mockResolvedValue({ locale: "fr" }); // Visitor prefers French
      mockFindFirst.mockResolvedValue({ locale: "he" }); // Page owner prefers Hebrew

      const mockReq = {
        headers: new Headers({ "accept-language": "en-US" }),
        cookies: {},
      } as any;

      const result = await getLocale(mockReq as any, "some-username");

      // Should return page OWNER's locale (Hebrew), not visitor's token locale (French)
      expect(result).toBe("he");
      expect(mockFindFirst).toHaveBeenCalled();
      // Token should NOT be checked when page owner locale is found
      expect(mockGetToken).not.toHaveBeenCalled();
    });
  });

  describe("with username parameter (unauthenticated)", () => {
    it("should fetch and return user locale from database when username is provided", async () => {
      mockGetToken.mockResolvedValue(null);
      mockFindFirst.mockResolvedValue({ locale: "he" });

      const mockReq = {
        headers: new Headers({ "accept-language": "en-US" }),
        cookies: {},
      };

      const result = await getLocale(mockReq as any, "andriy-anthon");

      expect(result).toBe("he");
      // Token should NOT be checked when page owner locale is found
      expect(mockGetToken).not.toHaveBeenCalled();
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { username: "andriy-anthon", locked: false },
        select: { locale: true },
      });
    });

    it("should fall back to English when user has no locale set (locale is null)", async () => {
      mockGetToken.mockResolvedValue(null);
      mockFindFirst.mockResolvedValue({ locale: null });

      const mockReq = {
        headers: new Headers({ "accept-language": "fr-FR" }),
        cookies: {},
      };

      const result = await getLocale(mockReq as any, "some-user");

      // When user exists but locale is null, should default to "en", not fall through to Accept-Language
      expect(result).toBe("en");
      expect(mockFindFirst).toHaveBeenCalled();
      // Token should NOT be checked when user is found
      expect(mockGetToken).not.toHaveBeenCalled();
    });

    it("should fall back to Accept-Language when user is not found", async () => {
      mockGetToken.mockResolvedValue(null);
      mockFindFirst.mockResolvedValue(null);

      const mockReq = {
        headers: new Headers({ "accept-language": "de-DE" }),
        cookies: {},
      } as any;

      const result = await getLocale(mockReq as any, "nonexistent-user");

      expect(result).toBe("de");
      expect(mockFindFirst).toHaveBeenCalled();
    });

    it("should handle database errors gracefully and fall back to Accept-Language", async () => {
      mockGetToken.mockResolvedValue(null);
      mockFindFirst.mockRejectedValue(new Error("Database error"));

      const mockReq = {
        headers: new Headers({ "accept-language": "pt-BR" }),
        cookies: {},
      };

      const result = await getLocale(mockReq as any, "some-user");

      // bcp-47-match's lookup() prefers matching by base language code.
      // When pt-BR is requested, it matches to pt (the base language in locales) due to fallback behavior
      expect(result).toBe("pt");
    });
  });

  describe("without authentication or username (fallback to Accept-Language)", () => {
    it("should return locale from Accept-Language header when no token or username", async () => {
      mockGetToken.mockResolvedValue(null);

      const mockReq = {
        headers: new Headers({ "accept-language": "es-ES,es;q=0.9,en;q=0.8" }),
        cookies: {},
      } as any;

      const result = await getLocale(mockReq as any);

      expect(result).toBe("es");
      expect(mockGetToken).toHaveBeenCalled();
      expect(mockFindFirst).not.toHaveBeenCalled();
    });

    it("should default to 'en' when no Accept-Language header is present", async () => {
      mockGetToken.mockResolvedValue(null);

      const mockReq = {
        headers: new Headers({}),
        cookies: {},
      };

      const result = await getLocale(mockReq as any);

      expect(result).toBe("en");
    });

    it("should handle malformed Accept-Language header", async () => {
      mockGetToken.mockResolvedValue(null);

      const mockReq = {
        headers: new Headers({ "accept-language": "invalid-locale-###" }),
        cookies: {},
      } as any;

      const result = await getLocale(mockReq as any);

      // The function extracts the language code portion, so "invalid-locale-###" becomes "invalid-locale"
      expect(result).toBe("invalid-locale");
    });

    it("should skip DB lookup for invalid username format (uppercase) and fall back to Accept-Language", async () => {
      // Usernames in DB are always slugified (lowercase). If URL has uppercase,
      // it will never match the DB, so validation prevents unnecessary query.
      mockGetToken.mockResolvedValue(null);

      const mockReq = {
        headers: new Headers({ "accept-language": "fr-FR" }),
        cookies: {},
      };

      const result = await getLocale(mockReq as any, "JohnDoe");

      expect(result).toBe("fr");
      expect(mockFindFirst).not.toHaveBeenCalled(); // Should skip DB query
    });

    it("should skip DB lookup for invalid username starting with dash and fall back to Accept-Language", async () => {
      // Slugified usernames never start with dash, so validation rejects it
      mockGetToken.mockResolvedValue(null);

      const mockReq = {
        headers: new Headers({ "accept-language": "de-DE" }),
        cookies: {},
      };

      const result = await getLocale(mockReq as any, "-invalid");

      expect(result).toBe("de");
      expect(mockFindFirst).not.toHaveBeenCalled();
    });

    it("should skip DB lookup for invalid username starting with period and fall back to Accept-Language", async () => {
      // Slugified usernames never start with period, so validation rejects it
      mockGetToken.mockResolvedValue(null);

      const mockReq = {
        headers: new Headers({ "accept-language": "en-US" }),
        cookies: {},
      };

      const result = await getLocale(mockReq as any, ".invalid");

      expect(result).toBe("en");
      expect(mockFindFirst).not.toHaveBeenCalled();
    });

    it("should allow valid lowercase single-character username", async () => {
      // Single char usernames like 'a' or 'z' are valid
      mockGetToken.mockResolvedValue(null);
      mockFindFirst.mockResolvedValue(null);

      const mockReq = {
        headers: new Headers({ "accept-language": "en-US" }),
        cookies: {},
      };

      const result = await getLocale(mockReq as any, "a");

      // Should attempt DB lookup for single-char username
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { username: "a", locked: false },
        select: { locale: true },
      });
      // Result falls back to Accept-Language since user not found
      expect(result).toBe("en");
    });

    it("should allow valid lowercase alphanumeric username", async () => {
      // Lowercase alphanumeric usernames are valid
      mockGetToken.mockResolvedValue(null);
      mockFindFirst.mockResolvedValue(null);

      const mockReq = {
        headers: new Headers({ "accept-language": "en-US" }),
        cookies: {},
      };

      await getLocale(mockReq as any, "johndoe123");

      // Should attempt DB lookup
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { username: "johndoe123", locked: false },
        select: { locale: true },
      });
    });

    it("should allow valid username with periods and hyphens in middle", async () => {
      // Usernames like john.doe or john-doe are valid (periods/hyphens not at start/end)
      mockGetToken.mockResolvedValue(null);
      mockFindFirst.mockResolvedValue(null);

      const mockReq = {
        headers: new Headers({ "accept-language": "en-US" }),
        cookies: {},
      };

      await getLocale(mockReq as any, "john.doe-smith");

      // Should attempt DB lookup
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { username: "john.doe-smith", locked: false },
        select: { locale: true },
      });
    });
  });

  describe("RTL languages", () => {
    it("should return 'he' for Hebrew user", async () => {
      mockGetToken.mockResolvedValue(null);
      mockFindFirst.mockResolvedValue({ locale: "he" });

      const mockReq = {
        headers: new Headers({ "accept-language": "en-US" }),
        cookies: {},
      };

      const result = await getLocale(mockReq as any, "hebrew-user");

      expect(result).toBe("he");
    });

    it("should return 'ar' for Arabic user", async () => {
      mockGetToken.mockResolvedValue(null);
      mockFindFirst.mockResolvedValue({ locale: "ar" });

      const mockReq = {
        headers: new Headers({ "accept-language": "en-US" }),
        cookies: {},
      };

      const result = await getLocale(mockReq as any, "arabic-user");

      expect(result).toBe("ar");
    });
  });
});
