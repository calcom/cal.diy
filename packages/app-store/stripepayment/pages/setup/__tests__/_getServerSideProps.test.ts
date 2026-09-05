import type { GetServerSidePropsContext } from "next";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before imports
vi.mock("@calcom/features/auth/lib/getServerSession", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../../lib/getStripeAppKeys", () => ({
  getStripeAppKeys: vi.fn(),
}));

vi.mock("@calcom/lib/constants", () => ({
  WEBAPP_URL: "https://app.cal.com",
}));

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import prisma from "@calcom/prisma";

import { getStripeAppKeys } from "../../../lib/getStripeAppKeys";
import { getServerSideProps } from "../_getServerSideProps";

const mockGetServerSession = vi.mocked(getServerSession);
const mockPrisma = prisma as unknown as {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};
const mockGetStripeAppKeys = vi.mocked(getStripeAppKeys);

function createMockContext(overrides: Partial<GetServerSidePropsContext> = {}): GetServerSidePropsContext {
  return {
    req: { headers: {} } as GetServerSidePropsContext["req"],
    res: {} as GetServerSidePropsContext["res"],
    params: { slug: "stripe" },
    query: {},
    resolvedUrl: "/apps/stripe/setup",
    ...overrides,
  };
}

describe("Stripe Setup Page getServerSideProps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStripeAppKeys.mockResolvedValue({
      client_id: "ca_test_client_id",
      payment_fee_fixed: 0,
      payment_fee_percentage: 0,
      public_key: "pk_test",
      webhook_secret: "whsec_test",
    });
  });

  describe("Slug validation", () => {
    it("should return notFound when slug is not a string", async () => {
      const ctx = createMockContext({ params: {} });

      const result = await getServerSideProps(ctx);

      expect(result).toEqual({ notFound: true });
    });

    it("should return notFound when params is undefined", async () => {
      const ctx = createMockContext({ params: undefined });

      const result = await getServerSideProps(ctx);

      expect(result).toEqual({ notFound: true });
    });
  });

  describe("Authentication validation", () => {
    it("should redirect to login when user is not authenticated", async () => {
      const ctx = createMockContext();
      mockGetServerSession.mockResolvedValue(null);

      const result = await getServerSideProps(ctx);

      expect(result).toEqual({
        redirect: {
          destination: "/auth/login",
          permanent: false,
        },
      });
    });

    it("should redirect to login when session has no user uuid", async () => {
      const ctx = createMockContext();
      mockGetServerSession.mockResolvedValue({
        user: {},
        hasValidLicense: true,
        upId: "test",
        expires: "2024-12-31",
      } as any);

      const result = await getServerSideProps(ctx);

      expect(result).toEqual({
        redirect: {
          destination: "/auth/login",
          permanent: false,
        },
      });
    });
  });

  describe("User lookup", () => {
    it("should return notFound when user does not exist in database", async () => {
      const ctx = createMockContext();
      const testUuid = "550e8400-e29b-41d4-a716-446655440000";
      mockGetServerSession.mockResolvedValue({
        user: { uuid: testUuid },
        hasValidLicense: true,
        upId: "test",
        expires: "2024-12-31",
      } as any);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await getServerSideProps(ctx);

      expect(result).toEqual({ notFound: true });
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { uuid: testUuid },
        select: { email: true, name: true },
      });
    });
  });

  describe("OAuth redirect construction", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { uuid: "550e8400-e29b-41d4-a716-446655440000" },
        hasValidLicense: true,
        upId: "test",
        expires: "2024-12-31",
      } as any);
      mockPrisma.user.findUnique.mockResolvedValue({
        email: "user@example.com",
        name: "Test User",
      });
    });

    it("should redirect to Stripe OAuth with correct parameters", async () => {
      const ctx = createMockContext();

      const result = await getServerSideProps(ctx);

      expect(result).toHaveProperty("redirect");
      const redirect = (result as { redirect: { destination: string; permanent: boolean } }).redirect;
      expect(redirect.permanent).toBe(false);
      expect(redirect.destination).toContain("https://connect.stripe.com/oauth/authorize");
      expect(redirect.destination).toContain("client_id=ca_test_client_id");
      expect(redirect.destination).toContain("scope=read_write");
      expect(redirect.destination).toContain("response_type=code");
    });

    it("should include user email in stripe_user params", async () => {
      const ctx = createMockContext();

      const result = await getServerSideProps(ctx);

      const redirect = (result as { redirect: { destination: string; permanent: boolean } }).redirect;
      expect(redirect.destination).toContain(encodeURIComponent("user@example.com"));
    });

    it("should include user first name in stripe_user params", async () => {
      const ctx = createMockContext();

      const result = await getServerSideProps(ctx);

      const redirect = (result as { redirect: { destination: string; permanent: boolean } }).redirect;
      expect(redirect.destination).toContain("first_name");
    });

    it("should include correct redirect_uri", async () => {
      const ctx = createMockContext();

      const result = await getServerSideProps(ctx);

      const redirect = (result as { redirect: { destination: string; permanent: boolean } }).redirect;
      expect(redirect.destination).toContain(
        encodeURIComponent("https://app.cal.com/api/integrations/stripepayment/callback")
      );
    });

    it("should include state with default onErrorReturnTo when not provided", async () => {
      const ctx = createMockContext();

      const result = await getServerSideProps(ctx);

      const redirect = (result as { redirect: { destination: string; permanent: boolean } }).redirect;
      // State should contain fromApp: true and default onErrorReturnTo
      const stateMatch = redirect.destination.match(/state=([^&]+)/);
      expect(stateMatch).toBeTruthy();
      const stateStr = decodeURIComponent(stateMatch![1]);
      const state = JSON.parse(stateStr);
      expect(state.fromApp).toBe(true);
      expect(state.onErrorReturnTo).toBe("https://app.cal.com/apps/installed/payment");
      expect(state.returnTo).toBeUndefined();
    });

    it("should include returnTo in state when provided", async () => {
      const ctx = createMockContext({
        query: { returnTo: "/event-types/123" },
      });

      const result = await getServerSideProps(ctx);

      const redirect = (result as { redirect: { destination: string; permanent: boolean } }).redirect;
      const stateMatch = redirect.destination.match(/state=([^&]+)/);
      const stateStr = decodeURIComponent(stateMatch![1]);
      const state = JSON.parse(stateStr);
      expect(state.returnTo).toBe("/event-types/123");
    });

    it("should use custom onErrorReturnTo when provided", async () => {
      const ctx = createMockContext({
        query: { onErrorReturnTo: "/settings/integrations" },
      });

      const result = await getServerSideProps(ctx);

      const redirect = (result as { redirect: { destination: string; permanent: boolean } }).redirect;
      const stateMatch = redirect.destination.match(/state=([^&]+)/);
      const stateStr = decodeURIComponent(stateMatch![1]);
      const state = JSON.parse(stateStr);
      expect(state.onErrorReturnTo).toBe("/settings/integrations");
    });

    it("should handle user with null name", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        email: "user@example.com",
        name: null,
      });
      const ctx = createMockContext();

      const result = await getServerSideProps(ctx);

      expect(result).toHaveProperty("redirect");
      const redirect = (result as { redirect: { destination: string; permanent: boolean } }).redirect;
      expect(redirect.destination).toContain("https://connect.stripe.com/oauth/authorize");
    });
  });

  describe("Error handling", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { uuid: "550e8400-e29b-41d4-a716-446655440000" },
        hasValidLicense: true,
        upId: "test",
        expires: "2024-12-31",
      } as any);
      mockPrisma.user.findUnique.mockResolvedValue({
        email: "user@example.com",
        name: "Test User",
      });
    });

    it("should redirect to error page when getStripeAppKeys fails", async () => {
      mockGetStripeAppKeys.mockRejectedValue(new Error("Failed to get Stripe keys"));
      const ctx = createMockContext();

      const result = await getServerSideProps(ctx);

      expect(result).toEqual({
        redirect: {
          destination: "https://app.cal.com/apps/installed/payment?error=stripe_oauth_failed",
          permanent: false,
        },
      });
    });

    it("should redirect when client_id is not configured in direct API keys mode", async () => {
      mockGetStripeAppKeys.mockResolvedValue({
        client_secret: "sk_test_123",
        public_key: "pk_test_123",
        webhook_secret: "whsec_test_123",
        direct_api_keys: true,
      } as any);
      const ctx = createMockContext();

      const result = await getServerSideProps(ctx);

      expect(result).toEqual({
        redirect: {
          destination: "https://app.cal.com/apps/installed/payment?error=stripe_connect_not_configured",
          permanent: false,
        },
      });
    });
  });

  describe("E2E mode", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { uuid: "550e8400-e29b-41d4-a716-446655440000" },
        hasValidLicense: true,
        upId: "test",
        expires: "2024-12-31",
      } as any);
      mockPrisma.user.findUnique.mockResolvedValue({
        email: "user@example.com",
        name: "Test User",
      });
    });

    it("should include country=US when NEXT_PUBLIC_IS_E2E is set", async () => {
      const originalEnv = process.env.NEXT_PUBLIC_IS_E2E;
      process.env.NEXT_PUBLIC_IS_E2E = "true";

      const ctx = createMockContext();

      const result = await getServerSideProps(ctx);

      const redirect = (result as { redirect: { destination: string; permanent: boolean } }).redirect;
      expect(redirect.destination).toContain("country");

      process.env.NEXT_PUBLIC_IS_E2E = originalEnv;
    });
  });
});
