import { isBookingPagePath } from "@lib/hooks/useIsBookingPage";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { describe, expect, it } from "vitest";

describe("isBookingPagePath", () => {
  it("returns true for a dynamic public booking page root path", () => {
    expect(isBookingPagePath("/rick", null)).toBe(true);
    expect(isBookingPagePath("/john+jane", null)).toBe(true);
    expect(isBookingPagePath("/john%2Bjane/anything", null)).toBe(true);
  });

  it("returns false for reserved root paths that are not booking pages", () => {
    expect(isBookingPagePath("/apps", null)).toBe(false);
    expect(isBookingPagePath("/auth/login", null)).toBe(false);
    expect(isBookingPagePath("/event-types", null)).toBe(false);
    expect(isBookingPagePath("/getting-started", null)).toBe(false);
  });

  it("returns true for known booking page prefixes", () => {
    expect(isBookingPagePath("/team/sales", null)).toBe(true);
    expect(isBookingPagePath("/d/private", null)).toBe(true);
    expect(isBookingPagePath("/booking", null)).toBe(true);
    expect(isBookingPagePath("/reschedule/abc", null)).toBe(true);
  });

  it("returns false for booking list pages even when prefix matches", () => {
    expect(isBookingPagePath("/upcoming", null)).toBe(false);
    expect(isBookingPagePath("/past", null)).toBe(false);
  });

  it("returns true when user parameters indicate a booking page", () => {
    const searchParams = {
      get: (name: string) => {
        if (name === "type") {
          return "30min";
        }

        if (name === "user") {
          return "123";
        }

        return null;
      },
    } as unknown as ReadonlyURLSearchParams;

    expect(isBookingPagePath("/some/page", searchParams)).toBe(true);
    expect(isBookingPagePath("/some/page", searchParams)).toBe(true);
  });
});
