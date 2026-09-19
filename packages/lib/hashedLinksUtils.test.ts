import { describe, expect, it } from "vitest";

import { isLinkExpired, isUsageBasedExpired } from "./hashedLinksUtils";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const inFuture = () => new Date(Date.now() + DAY_IN_MS);
const inPast = () => new Date(Date.now() - DAY_IN_MS);

describe("hashedLinksUtils", () => {
  describe("fn: isUsageBasedExpired", () => {
    it("is not expired when there is no usage limit", () => {
      expect(isUsageBasedExpired(100, null)).toBe(false);
      expect(isUsageBasedExpired(100, 0)).toBe(false);
    });

    it("is expired once the usage count reaches the limit", () => {
      expect(isUsageBasedExpired(0, 1)).toBe(false);
      expect(isUsageBasedExpired(1, 1)).toBe(true);
      expect(isUsageBasedExpired(3, 2)).toBe(true);
    });
  });

  describe("fn: isLinkExpired", () => {
    it("is expired when the expiry date has passed", () => {
      expect(isLinkExpired({ expiresAt: inPast(), maxUsageCount: 5, usageCount: 0 })).toBe(true);
    });

    it("is not expired when the expiry date is in the future and usage remains", () => {
      expect(isLinkExpired({ expiresAt: inFuture(), maxUsageCount: 5, usageCount: 2 })).toBe(false);
    });

    it("is expired by usage even when it has no expiry date", () => {
      expect(isLinkExpired({ expiresAt: null, maxUsageCount: 1, usageCount: 1 })).toBe(true);
      expect(isLinkExpired({ expiresAt: null, maxUsageCount: 3, usageCount: 1 })).toBe(false);
    });

    // Regression: a link constrained by BOTH a future date and a usage limit
    // must still expire once the usage limit is reached. Previously isLinkExpired
    // returned early on expiresAt and never checked the usage count.
    it("is expired by usage even when the expiry date is still in the future", () => {
      expect(isLinkExpired({ expiresAt: inFuture(), maxUsageCount: 1, usageCount: 1 })).toBe(true);
    });
  });
});
