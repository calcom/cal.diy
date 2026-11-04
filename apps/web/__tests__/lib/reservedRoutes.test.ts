import { describe, expect, it } from "vitest";

import { isReservedRoute, getReservedRoutes } from "@lib/reservedRoutes";

describe("reservedRoutes", () => {
  describe("getReservedRoutes", () => {
    it("should contain static booking routes", () => {
      const staticBookingRoutes = ["booking-successful"];
      const reservedRoutes = getReservedRoutes();
      staticBookingRoutes.forEach((route) => {
        expect(reservedRoutes).toContain(route);
      });
    });

    it("should contain virtual routes", () => {
      const virtualRoutes = ["forms", "router", "success"];
      const reservedRoutes = getReservedRoutes();
      virtualRoutes.forEach((route) => {
        expect(reservedRoutes).toContain(route);
      });
    });

    it("should contain important booking routes", () => {
      const reservedRoutes = getReservedRoutes();
      // Verify critical routes that must be reserved
      expect(reservedRoutes).toContain("d");
      expect(reservedRoutes).toContain("booking");
      expect(reservedRoutes).toContain("org");
      expect(reservedRoutes).toContain("team");
      expect(reservedRoutes).toContain("forms");
      expect(reservedRoutes).toContain("success");
    });
  });

  describe("isReservedRoute", () => {
    it("should return true for static booking routes", () => {
      expect(isReservedRoute("d")).toBe(true);
      expect(isReservedRoute("booking")).toBe(true);
      expect(isReservedRoute("booking-successful")).toBe(true);
      expect(isReservedRoute("org")).toBe(true);
      expect(isReservedRoute("team")).toBe(true);
    });

    it("should return true for virtual routes", () => {
      expect(isReservedRoute("forms")).toBe(true);
      expect(isReservedRoute("router")).toBe(true);
      expect(isReservedRoute("success")).toBe(true);
    });

    it("should return false for potential usernames", () => {
      expect(isReservedRoute("andriy-anthon")).toBe(false);
      expect(isReservedRoute("john-doe")).toBe(false);
      expect(isReservedRoute("user123")).toBe(false);
      expect(isReservedRoute("mycompany")).toBe(false);
      expect(isReservedRoute("ai")).toBe(false);
    });

    it("should return false for use-page-wrapper routes (they don't conflict with [user])", () => {
      // These routes are in (use-page-wrapper) route group and don't conflict with /[user]
      expect(isReservedRoute("settings")).toBe(false);
      expect(isReservedRoute("event-types")).toBe(false);
      expect(isReservedRoute("workflows")).toBe(false);
      expect(isReservedRoute("insights")).toBe(false);
      expect(isReservedRoute("availability")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isReservedRoute("")).toBe(false);
    });
  });
});
