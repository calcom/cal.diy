import { describe, expect, it } from "vitest";

import {
  isLinkExpired,
  isTimeBasedExpired,
  isUsageBasedExpired,
  filterActiveLinks,
  validateHashedLinkData,
} from "./hashedLinksUtils";

describe("hashedLinksUtils", () => {
  describe("isUsageBasedExpired", () => {
    it("returns false if maxUsageCount is null, undefined, or <= 0", () => {
      expect(isUsageBasedExpired(5, null)).toBe(false);
      expect(isUsageBasedExpired(5, undefined)).toBe(false);
      expect(isUsageBasedExpired(5, 0)).toBe(false);
    });

    it("returns true if usageCount >= maxUsageCount", () => {
      expect(isUsageBasedExpired(1, 1)).toBe(true);
      expect(isUsageBasedExpired(2, 1)).toBe(true);
      expect(isUsageBasedExpired(0, 1)).toBe(false);
    });
  });

  describe("isLinkExpired", () => {
    it("returns true if time-based expiration has passed", () => {
      const pastDate = new Date(Date.now() - 10000);
      expect(isLinkExpired({ expiresAt: pastDate })).toBe(true);
    });

    it("returns false if time-based expiration has not passed", () => {
      const futureDate = new Date(Date.now() + 100000);
      expect(isLinkExpired({ expiresAt: futureDate })).toBe(false);
    });

    it("returns true if usage limit is reached when no expiresAt date is set", () => {
      expect(isLinkExpired({ maxUsageCount: 1, usageCount: 1 })).toBe(true);
      expect(isLinkExpired({ maxUsageCount: 1, usageCount: 0 })).toBe(false);
    });

    it("returns true if usage limit is reached even when expiresAt date is in the future (#29815)", () => {
      const futureDate = new Date(Date.now() + 1000000);
      // Single-use link with future expiration date that has already been used once
      expect(
        isLinkExpired({
          expiresAt: futureDate,
          maxUsageCount: 1,
          usageCount: 1,
        })
      ).toBe(true);
    });

    it("returns false if neither time-based nor usage-based expiration triggered", () => {
      const futureDate = new Date(Date.now() + 1000000);
      expect(
        isLinkExpired({
          expiresAt: futureDate,
          maxUsageCount: 2,
          usageCount: 1,
        })
      ).toBe(false);
    });
  });

  describe("filterActiveLinks", () => {
    it("filters out links that are expired by time or usage", () => {
      const futureDate = new Date(Date.now() + 1000000);
      const pastDate = new Date(Date.now() - 1000000);

      const links = [
        { id: 1, expiresAt: futureDate, maxUsageCount: 1, usageCount: 0 }, // active
        { id: 2, expiresAt: futureDate, maxUsageCount: 1, usageCount: 1 }, // expired by usage
        { id: 3, expiresAt: pastDate, maxUsageCount: 5, usageCount: 0 }, // expired by time
      ];

      const active = filterActiveLinks(links);
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(1);
    });
  });
});
