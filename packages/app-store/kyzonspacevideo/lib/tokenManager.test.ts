import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";

import { expect, test, vi, describe, beforeEach } from "vitest";

import type { KyzonCredentialKey } from "./KyzonCredentialKey";
import { getKyzonCredentialKey } from "./KyzonCredentialKey";
// Import mocked functions after they're mocked
import { kyzonAxiosInstance } from "./axios";
import { getKyzonAppKeys } from "./getKyzonAppKeys";
import { refreshKyzonToken, isTokenExpired } from "./tokenManager";

// Mock axios
vi.mock("./axios", () => ({
  kyzonAxiosInstance: {
    post: vi.fn(),
  },
}));

// Mock getKyzonAppKeys
vi.mock("./getKyzonAppKeys", () => ({
  getKyzonAppKeys: vi.fn(),
}));

// Mock getKyzonCredentialKey
vi.mock("./KyzonCredentialKey", () => ({
  kyzonCredentialKeySchema: {
    parse: vi.fn((data) => data),
  },
  getKyzonCredentialKey: vi.fn(),
}));

const mockPost = vi.mocked(kyzonAxiosInstance.post);
const mockGetKyzonAppKeys = vi.mocked(getKyzonAppKeys);
const mockGetKyzonCredentialKey = vi.mocked(getKyzonCredentialKey);

const mockCredentialKey: KyzonCredentialKey = {
  access_token: "mock_access_token",
  refresh_token: "mock_refresh_token",
  token_type: "Bearer",
  scope: "meetings:write calendar:write profile:read",
  expiry_date: Date.now() + 3600000,
  user_id: "mock_user_id",
  team_id: "mock_team_id",
};

const mockAppKeys = {
  client_id: "mock_client_id",
  client_secret: "mock_client_secret",
  api_key: "mock_api_key",
};

describe("tokenManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetKyzonAppKeys.mockResolvedValue(mockAppKeys);
  });

  describe("isTokenExpired", () => {
    test("returns true for expired token", () => {
      const expiredToken: KyzonCredentialKey = {
        ...mockCredentialKey,
        expiry_date: Date.now() - 1000, // 1 second ago
      };

      expect(isTokenExpired(expiredToken)).toBe(true);
    });

    test("returns false for valid token", () => {
      const validToken: KyzonCredentialKey = {
        ...mockCredentialKey,
        expiry_date: Date.now() + 3600000, // 1 hour from now
      };

      expect(isTokenExpired(validToken)).toBe(false);
    });

    test("returns true for token without expiry_date", () => {
      const tokenWithoutExpiry = {
        ...mockCredentialKey,
        expiry_date: undefined as unknown as number,
      };

      expect(isTokenExpired(tokenWithoutExpiry)).toBe(true);
    });

    test("returns true for token with invalid expiry_date", () => {
      const tokenWithInvalidExpiry = {
        ...mockCredentialKey,
        expiry_date: "invalid" as unknown as number,
      };

      expect(isTokenExpired(tokenWithInvalidExpiry)).toBe(true);
    });

    test("returns true for token with NaN expiry_date", () => {
      const tokenWithNaNExpiry = {
        ...mockCredentialKey,
        expiry_date: NaN,
      };

      expect(isTokenExpired(tokenWithNaNExpiry)).toBe(true);
    });
  });

  describe("refreshKyzonToken", () => {
    test("successfully refreshes token", async () => {
      const credentialId = 123;
      const newTokens = {
        access_token: "new_access_token",
        refresh_token: "new_refresh_token",
        token_type: "Bearer" as const,
        expires_in: 3600,
        scope: "meetings:write calendar:write profile:read",
      };

      const updatedCredentialKey: KyzonCredentialKey = {
        ...mockCredentialKey,
        ...newTokens,
      };

      // Mock database responses
      prismaMock.credential.findUnique.mockResolvedValue({
        id: credentialId,
        key: mockCredentialKey as any,
        userId: 1,
        teamId: null,
        type: "kyzonspacevideo_video",
        subscriptionId: null,
        paymentStatus: null,
        billingCycleStart: null,
        invalid: false,
        appId: "kyzonspacevideo",
        delegationCredentialId: null,
      });

      prismaMock.credential.update.mockResolvedValue({
        id: credentialId,
        key: updatedCredentialKey as any,
        userId: 1,
        teamId: null,
        type: "kyzonspacevideo_video",
        subscriptionId: null,
        paymentStatus: null,
        billingCycleStart: null,
        invalid: false,
        appId: "kyzonspacevideo",
        delegationCredentialId: null,
      });

      // Mock API response
      mockPost.mockResolvedValue({ data: newTokens });
      mockGetKyzonCredentialKey.mockReturnValue(updatedCredentialKey);

      const result = await refreshKyzonToken(credentialId);

      expect(prismaMock.credential.findUnique).toHaveBeenCalledWith({
        where: { id: credentialId },
        select: { key: true },
      });

      expect(mockPost).toHaveBeenCalledWith(
        "/oauth/token",
        {
          grant_type: "refresh_token",
          refresh_token: mockCredentialKey.refresh_token,
          client_id: mockAppKeys.client_id,
          client_secret: mockAppKeys.client_secret,
        },
        {
          headers: {
            "X-API-Key": mockAppKeys.api_key,
          },
        }
      );

      expect(prismaMock.credential.update).toHaveBeenCalledWith({
        where: { id: credentialId },
        data: { key: updatedCredentialKey },
      });

      expect(result).toEqual(updatedCredentialKey);
    });

    test("returns null when credential not found", async () => {
      const credentialId = 123;

      prismaMock.credential.findUnique.mockResolvedValue(null);

      const result = await refreshKyzonToken(credentialId);

      expect(result).toBeNull();
      expect(mockPost).not.toHaveBeenCalled();
      expect(prismaMock.credential.update).not.toHaveBeenCalled();
    });

    test("returns null when credential has no key", async () => {
      const credentialId = 123;

      prismaMock.credential.findUnique.mockResolvedValue({
        id: credentialId,
        key: null,
      });

      const result = await refreshKyzonToken(credentialId);

      expect(result).toBeNull();
      expect(mockPost).not.toHaveBeenCalled();
      expect(prismaMock.credential.update).not.toHaveBeenCalled();
    });

    test("returns null and logs warning when no refresh token", async () => {
      const credentialId = 123;
      const credentialWithoutRefresh = {
        ...mockCredentialKey,
        refresh_token: undefined,
      };

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      prismaMock.credential.findUnique.mockResolvedValue({
        id: credentialId,
        key: credentialWithoutRefresh,
      });

      const result = await refreshKyzonToken(credentialId);

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        `KYZON token refresh failed: No refresh token available for credential ${credentialId}. User may need to reconnect to KYZON Space.`
      );
      expect(mockPost).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    test("handles API error and logs it", async () => {
      const credentialId = 123;
      const apiError = new Error("Refresh token expired");

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      prismaMock.credential.findUnique.mockResolvedValue({
        id: credentialId,
        key: mockCredentialKey,
      });

      mockPost.mockRejectedValue(apiError);

      const result = await refreshKyzonToken(credentialId);

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to refresh KYZON token",
        expect.objectContaining({
          message: "Refresh token expired",
        })
      );
      expect(prismaMock.credential.update).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    test("handles database error during update", async () => {
      const credentialId = 123;
      const newTokens = {
        access_token: "new_access_token",
        refresh_token: "new_refresh_token",
        token_type: "Bearer" as const,
        expires_in: 3600,
        scope: "meetings:write calendar:write profile:read",
      };

      const dbError = new Error("Database connection failed");
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      prismaMock.credential.findUnique.mockResolvedValue({
        id: credentialId,
        key: mockCredentialKey,
      });

      mockPost.mockResolvedValue({ data: newTokens });
      mockGetKyzonCredentialKey.mockReturnValue({
        ...mockCredentialKey,
        ...newTokens,
      });

      prismaMock.credential.update.mockRejectedValue(dbError);

      const result = await refreshKyzonToken(credentialId);

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to refresh KYZON token",
        expect.objectContaining({
          message: "Database connection failed",
        })
      );

      consoleSpy.mockRestore();
    });

    test("prevents concurrent refresh requests for same credential", async () => {
      const credentialId = 123;
      const newTokens = {
        access_token: "new_access_token",
        refresh_token: "new_refresh_token",
        token_type: "Bearer" as const,
        expires_in: 3600,
        scope: "meetings:write calendar:write profile:read",
      };

      const updatedCredentialKey: KyzonCredentialKey = {
        ...mockCredentialKey,
        ...newTokens,
      };

      prismaMock.credential.findUnique.mockResolvedValue({
        id: credentialId,
        key: mockCredentialKey as any,
        userId: 1,
        teamId: null,
        type: "kyzonspacevideo_video",
        subscriptionId: null,
        paymentStatus: null,
        billingCycleStart: null,
        invalid: false,
        appId: "kyzonspacevideo",
        delegationCredentialId: null,
      });

      mockPost.mockResolvedValue({ data: newTokens });
      mockGetKyzonCredentialKey.mockReturnValue(updatedCredentialKey);

      prismaMock.credential.update.mockResolvedValue({
        id: credentialId,
        key: updatedCredentialKey as any,
        userId: 1,
        teamId: null,
        type: "kyzonspacevideo_video",
        subscriptionId: null,
        paymentStatus: null,
        billingCycleStart: null,
        invalid: false,
        appId: "kyzonspacevideo",
        delegationCredentialId: null,
      });

      // Start multiple refresh requests concurrently
      const promise1 = refreshKyzonToken(credentialId);
      const promise2 = refreshKyzonToken(credentialId);
      const promise3 = refreshKyzonToken(credentialId);

      const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

      // All should return the same result
      expect(result1).toEqual(updatedCredentialKey);
      expect(result2).toEqual(updatedCredentialKey);
      expect(result3).toEqual(updatedCredentialKey);

      // But the actual refresh should only happen once
      expect(prismaMock.credential.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(prismaMock.credential.update).toHaveBeenCalledTimes(1);
    });

    test("handles axios error with response details", async () => {
      const credentialId = 123;
      const axiosError = {
        message: "Request failed",
        response: {
          status: 400,
          data: { error: "invalid_grant" },
        },
        code: "BAD_REQUEST",
      };

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      prismaMock.credential.findUnique.mockResolvedValue({
        id: credentialId,
        key: mockCredentialKey,
      });

      mockPost.mockRejectedValue(axiosError);

      const result = await refreshKyzonToken(credentialId);

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        "KYZON refresh token is invalid or expired. User needs to reconnect.",
        expect.objectContaining({
          credentialId: 123,
          status: 400,
          message: "Request failed",
          code: "BAD_REQUEST",
        })
      );

      consoleSpy.mockRestore();
    });
  });
});
