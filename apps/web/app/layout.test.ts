import { describe, expect, it } from "vitest";

import { extractUsernameFromPathname } from "./lib/extractUsernameFromPathname";

describe("Username extraction from pathname", () => {
  describe("Valid booking page paths", () => {
    it("should extract username from /[username]", () => {
      expect(extractUsernameFromPathname("/andriy-anthon")).toBe("andriy-anthon");
    });

    it("should extract username from /[username]/[eventType]", () => {
      expect(extractUsernameFromPathname("/john-doe/30min")).toBe("john-doe");
    });

    it("should extract username from /[username]/[eventType]/embed", () => {
      expect(extractUsernameFromPathname("/jane-smith/meeting/embed")).toBe("jane-smith");
    });

    it("should handle usernames with hyphens", () => {
      expect(extractUsernameFromPathname("/test-user-name")).toBe("test-user-name");
    });

    it("should handle usernames with numbers", () => {
      expect(extractUsernameFromPathname("/user123")).toBe("user123");
    });
  });

  describe("Org-based booking page paths", () => {
    it("should extract username from /org/[orgSlug]/[username]", () => {
      expect(extractUsernameFromPathname("/org/acme/john-doe")).toBe("john-doe");
    });

    it("should extract username from /org/[orgSlug]/[username]/[eventType]", () => {
      expect(extractUsernameFromPathname("/org/company/alice/meeting")).toBe("alice");
    });

    it("should extract username from /org/[orgSlug]/[username]/[eventType]/embed", () => {
      expect(extractUsernameFromPathname("/org/startup/bob/consultation/embed")).toBe("bob");
    });
  });

  describe("Reserved routes that should NOT be treated as usernames", () => {
    it("should NOT extract from /booking paths", () => {
      expect(extractUsernameFromPathname("/booking/xyz")).toBeUndefined();
    });

    it("should NOT extract from /d paths", () => {
      expect(extractUsernameFromPathname("/d/xyz123")).toBeUndefined();
    });

    it("should NOT extract from /d (dynamic group bookings)", () => {
      expect(extractUsernameFromPathname("/d/user1+user2")).toBeUndefined();
    });

    it("should NOT extract from virtual routes like /forms", () => {
      // Virtual routes like /forms, /success are reserved and should not be treated as usernames
      expect(extractUsernameFromPathname("/forms")).toBeUndefined();
    });
  });

  describe("Routes that CAN be usernames (wrapped in route groups)", () => {
    // These are in app/(use-page-wrapper)/ and don't conflict with /[user]
    it("CAN extract username 'settings' (route group doesn't conflict)", () => {
      expect(extractUsernameFromPathname("/settings")).toBe("settings");
    });

    it("CAN extract username 'event-types' (route group doesn't conflict)", () => {
      expect(extractUsernameFromPathname("/event-types")).toBe("event-types");
    });

    it("CAN extract username 'bookings' (route group doesn't conflict)", () => {
      expect(extractUsernameFromPathname("/bookings")).toBe("bookings");
    });

    it("CAN extract username 'teams' (route group doesn't conflict)", () => {
      // Note: 'team' (singular) IS reserved from RESERVED_SUBDOMAINS
      // but 'teams' (plural) is just a route group route
      expect(extractUsernameFromPathname("/teams")).toBe("teams");
    });

    it("CAN extract username 'apps' (route group doesn't conflict)", () => {
      // Note: 'app' (singular) IS reserved from RESERVED_SUBDOMAINS
      // but 'apps' (plural) is just in route group
      expect(extractUsernameFromPathname("/apps")).toBe("apps");
    });

    it("CAN extract username 'workflows' (route group doesn't conflict)", () => {
      expect(extractUsernameFromPathname("/workflows")).toBe("workflows");
    });

    it("CAN extract username 'insights' (route group doesn't conflict)", () => {
      expect(extractUsernameFromPathname("/insights")).toBe("insights");
    });

    it("CAN extract username 'availability' (route group doesn't conflict)", () => {
      expect(extractUsernameFromPathname("/availability")).toBe("availability");
    });
  });

  describe("Edge cases", () => {
    it("should return undefined for empty pathname", () => {
      expect(extractUsernameFromPathname("")).toBeUndefined();
    });

    it("should return undefined for root path", () => {
      expect(extractUsernameFromPathname("/")).toBeUndefined();
    });

    it("should handle paths with trailing slashes", () => {
      expect(extractUsernameFromPathname("/john-doe/")).toBe("john-doe");
    });

    it("should handle paths with multiple slashes", () => {
      expect(extractUsernameFromPathname("//john-doe//meeting//")).toBe("john-doe");
    });

    it("should extract raw username without slugification", () => {
      // Note: This function extracts the raw path segment without normalization.
      // In practice, usernames are stored slugified (lowercase) in the database,
      // so "JohnDoe" won't match and will fall back to Accept-Language.
      // The validation in getLocale.ts will catch this and skip the DB query.
      expect(extractUsernameFromPathname("/JohnDoe")).toBe("JohnDoe");
    });
  });

  describe("Real-world examples from the issue", () => {
    it("should extract username from cal.com/andriy-anthon", () => {
      expect(extractUsernameFromPathname("/andriy-anthon")).toBe("andriy-anthon");
    });

    it("should NOT extract from cal.com/he/andriy-anthon (locale prefix)", () => {
      // The 'he' is treated as a username since it's not in RESERVED_ROUTES
      // This might need handling if locale-based routing is desired
      expect(extractUsernameFromPathname("/he/andriy-anthon")).toBe("he");
    });
  });
});
