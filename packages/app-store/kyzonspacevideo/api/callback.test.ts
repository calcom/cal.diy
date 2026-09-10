import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";

import type { NextApiRequest, NextApiResponse } from "next";
import { expect, test, vi, describe, beforeEach } from "vitest";

import { getSafeRedirectUrl } from "@calcom/lib/getSafeRedirectUrl";

import createOAuthAppCredential from "../../_utils/oauth/createOAuthAppCredential";
// Import mocked functions and the callback handler
import { decodeOAuthState } from "../../_utils/oauth/decodeOAuthState";
import setDefaultConferencingApp from "../../_utils/setDefaultConferencingApp";
// Import mocked axios functions
import { kyzonAxiosInstance } from "../lib/axios";
import callbackHandler from "./callback";

// Mock external dependencies
vi.mock("@calcom/lib/constants", () => ({
  WEBAPP_URL: "https://app.cal.com",
}));

vi.mock("@calcom/lib/getSafeRedirectUrl", () => ({
  getSafeRedirectUrl: vi.fn((url: string) => url),
}));

vi.mock("../../_utils/getInstalledAppPath", () => ({
  default: vi.fn(() => "/apps/kyzonspacevideo"),
}));

vi.mock("../../_utils/oauth/createOAuthAppCredential", () => ({
  default: vi.fn(),
}));

vi.mock("../../_utils/oauth/decodeOAuthState", () => ({
  decodeOAuthState: vi.fn(),
}));

vi.mock("../../_utils/setDefaultConferencingApp", () => ({
  default: vi.fn(),
}));

// Mock axios
vi.mock("../lib/axios", () => ({
  kyzonAxiosInstance: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

const mockPost = vi.mocked(kyzonAxiosInstance.post);
const mockGet = vi.mocked(kyzonAxiosInstance.get);

// Mock app keys
vi.mock("../lib/getKyzonAppKeys", () => ({
  getKyzonAppKeys: vi.fn(() => ({
    client_id: "mock_client_id",
    client_secret: "mock_client_secret",
    api_key: "mock_api_key",
  })),
}));

// Mock credential key
vi.mock("../lib/KyzonCredentialKey", () => ({
  getKyzonCredentialKey: vi.fn((data) => ({
    ...data,
    expiry_date: Date.now() + 3600000,
  })),
}));

const createMockRequest = (overrides: Partial<NextApiRequest> = {}): NextApiRequest =>
  ({
    method: "GET",
    url: "/api/integrations/kyzonspacevideo/callback",
    headers: {},
    body: {},
    cookies: {},
    query: {},
    session: { user: { id: 1 } },
    ...overrides,
  } as NextApiRequest);

const createMockResponse = (): NextApiResponse => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  } as unknown as NextApiResponse;
  return res;
};

describe("OAuth Callback Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(decodeOAuthState).mockReturnValue({
      onErrorReturnTo: "/error",
      fromApp: false,
    });
    vi.mocked(getSafeRedirectUrl).mockImplementation((url?: string) => url || null);
  });

  describe("successful authorization flow", () => {
    test("successfully processes authorization code", async () => {
      const req = createMockRequest({
        query: { code: "auth_code_123" },
      });
      const res = createMockResponse();

      const mockTokenResponse = {
        access_token: "access_token_123",
        refresh_token: "refresh_token_123",
        token_type: "Bearer" as const,
        expires_in: 3600,
        scope: "meetings:write calendar:write profile:read",
      };

      const mockProfileResponse = {
        id: "user_123",
        email: "user@example.com",
        firstName: "John",
        lastName: "Doe",
        teamId: "team_123",
      };

      mockPost.mockResolvedValueOnce({ data: mockTokenResponse });
      mockGet.mockResolvedValueOnce({ data: mockProfileResponse });

      await callbackHandler(req, res);

      expect(mockPost).toHaveBeenCalledWith(
        "/oauth/token",
        {
          grant_type: "authorization_code",
          code: "auth_code_123",
          client_id: "mock_client_id",
          client_secret: "mock_client_secret",
          redirect_uri: "https://app.cal.com/api/integrations/kyzonspacevideo/callback",
        },
        {
          headers: {
            "X-API-Key": "mock_api_key",
          },
        }
      );

      expect(mockGet).toHaveBeenCalledWith("/v1/oauth/me", {
        headers: {
          Authorization: "Bearer access_token_123",
        },
      });

      expect(prismaMock.credential.deleteMany).toHaveBeenCalledWith({
        where: {
          type: "kyzonspacevideo_video",
          userId: 1,
          appId: "kyzonspacevideo",
        },
      });

      expect(createOAuthAppCredential).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith("/apps/kyzonspacevideo");
    });

    test("sets default conferencing app when defaultInstall is true", async () => {
      const req = createMockRequest({
        query: { code: "auth_code_123" },
      });
      const res = createMockResponse();

      vi.mocked(decodeOAuthState).mockReturnValue({
        onErrorReturnTo: "/error",
        fromApp: false,
        defaultInstall: true,
      });

      const mockTokenResponse = {
        access_token: "access_token_123",
        refresh_token: "refresh_token_123",
        token_type: "Bearer" as const,
        expires_in: 3600,
        scope: "meetings:write calendar:write profile:read",
      };

      const mockProfileResponse = {
        id: "user_123",
        email: "user@example.com",
        firstName: "John",
        lastName: "Doe",
        teamId: "team_123",
      };

      mockPost.mockResolvedValueOnce({ data: mockTokenResponse });
      mockGet.mockResolvedValueOnce({ data: mockProfileResponse });

      await callbackHandler(req, res);

      expect(setDefaultConferencingApp).toHaveBeenCalledWith(1, "kyzonspacevideo");
      expect(res.redirect).toHaveBeenCalledWith("/apps/kyzonspacevideo");
    });

    test("redirects to custom returnTo URL from state", async () => {
      const req = createMockRequest({
        query: { code: "auth_code_123" },
      });
      const res = createMockResponse();

      vi.mocked(decodeOAuthState).mockReturnValue({
        onErrorReturnTo: "/error",
        fromApp: false,
        returnTo: "https://app.cal.com/custom-redirect",
      });

      const mockTokenResponse = {
        access_token: "access_token_123",
        refresh_token: "refresh_token_123",
        token_type: "Bearer" as const,
        expires_in: 3600,
        scope: "meetings:write calendar:write profile:read",
      };

      const mockProfileResponse = {
        id: "user_123",
        email: "user@example.com",
        firstName: "John",
        lastName: "Doe",
        teamId: "team_123",
      };

      mockPost.mockResolvedValueOnce({ data: mockTokenResponse });
      mockGet.mockResolvedValueOnce({ data: mockProfileResponse });

      await callbackHandler(req, res);

      expect(res.redirect).toHaveBeenCalledWith("https://app.cal.com/custom-redirect");
    });
  });

  describe("error handling", () => {
    test("handles missing user session", async () => {
      const req = createMockRequest({
        session: null,
        query: { code: "auth_code_123" },
      });
      const res = createMockResponse();

      await callbackHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "No user found" });
    });

    test("handles OAuth error from query parameters", async () => {
      const req = createMockRequest({
        query: {
          error: "access_denied",
          error_description: "User denied access",
        },
      });
      const res = createMockResponse();

      // Mock state to return no redirect URLs, so it uses JSON response
      vi.mocked(decodeOAuthState).mockReturnValue({
        onErrorReturnTo: undefined as unknown as string,
        fromApp: false,
        returnTo: undefined,
      });

      await callbackHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "User denied access" });
    });

    test("redirects on error when returnTo state is provided", async () => {
      const req = createMockRequest({
        query: {
          error: "access_denied",
          error_description: "User denied access",
        },
      });
      const res = createMockResponse();

      vi.mocked(decodeOAuthState).mockReturnValue({
        onErrorReturnTo: "/error",
        fromApp: false,
        returnTo: "https://app.cal.com/error-redirect",
      });

      // Mock getSafeRedirectUrl to return the onErrorReturnTo first
      vi.mocked(getSafeRedirectUrl).mockImplementation((url?: string) => {
        if (url === "/error") return "/error";
        if (url === "https://app.cal.com/error-redirect") return "https://app.cal.com/error-redirect";
        return null;
      });

      await callbackHandler(req, res);

      expect(res.redirect).toHaveBeenCalledWith("/error");
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    test("redirects on error when onErrorReturnTo state is provided", async () => {
      const req = createMockRequest({
        query: {
          error: "access_denied",
        },
      });
      const res = createMockResponse();

      vi.mocked(decodeOAuthState).mockReturnValue({
        onErrorReturnTo: "https://app.cal.com/error-specific-redirect",
        fromApp: false,
        returnTo: "https://app.cal.com/normal-redirect",
      });

      await callbackHandler(req, res);

      expect(res.redirect).toHaveBeenCalledWith("https://app.cal.com/error-specific-redirect");
    });

    test("handles missing authorization code", async () => {
      const req = createMockRequest({
        query: {}, // No code
      });
      const res = createMockResponse();

      // Mock state to return no redirect URLs, so it uses JSON response
      vi.mocked(decodeOAuthState).mockReturnValue({
        onErrorReturnTo: undefined as unknown as string,
        fromApp: false,
        returnTo: undefined,
      });

      await callbackHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "No authorization code was received from KYZON Space. Please try connecting again.",
      });
    });

    test("handles non-string authorization code", async () => {
      const req = createMockRequest({
        query: { code: ["array_code"] }, // Non-string code
      });
      const res = createMockResponse();

      // Mock state to return no redirect URLs, so it uses JSON response
      vi.mocked(decodeOAuthState).mockReturnValue({
        onErrorReturnTo: undefined as unknown as string,
        fromApp: false,
        returnTo: undefined,
      });

      await callbackHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "No authorization code was received from KYZON Space. Please try connecting again.",
      });
    });

    test("handles token exchange API error", async () => {
      const req = createMockRequest({
        query: { code: "auth_code_123" },
      });
      const res = createMockResponse();

      // Mock state to return no redirect URLs, so it uses JSON response
      vi.mocked(decodeOAuthState).mockReturnValue({
        onErrorReturnTo: undefined as unknown as string,
        fromApp: false,
        returnTo: undefined,
      });

      const apiError = {
        isAxiosError: true,
        response: {
          data: {
            error: "invalid_grant",
            error_description: "The authorization code is invalid",
          },
        },
      };

      mockPost.mockRejectedValueOnce(apiError);

      await callbackHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "The authorization code is invalid",
      });
    });

    test("handles token exchange API error without description", async () => {
      const req = createMockRequest({
        query: { code: "auth_code_123" },
      });
      const res = createMockResponse();

      // Mock state to return no redirect URLs, so it uses JSON response
      vi.mocked(decodeOAuthState).mockReturnValue({
        onErrorReturnTo: undefined as unknown as string,
        fromApp: false,
        returnTo: undefined,
      });

      const apiError = {
        isAxiosError: true,
        response: {
          data: {
            error: "server_error",
          },
        },
      };

      mockPost.mockRejectedValueOnce(apiError);

      await callbackHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "KYZON Space is temporarily unavailable. Please try again in a few minutes.",
      });
    });

    test("handles generic network error during token exchange", async () => {
      const req = createMockRequest({
        query: { code: "auth_code_123" },
      });
      const res = createMockResponse();

      // Mock state to return no redirect URLs, so it uses JSON response
      vi.mocked(decodeOAuthState).mockReturnValue({
        onErrorReturnTo: undefined as unknown as string,
        fromApp: false,
        returnTo: undefined,
      });

      const networkError = new Error("Network error");
      mockPost.mockRejectedValueOnce(networkError);

      await callbackHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Unable to connect to KYZON Space. Please try again.",
      });
    });

    test("handles error response from token endpoint", async () => {
      const req = createMockRequest({
        query: { code: "auth_code_123" },
      });
      const res = createMockResponse();

      vi.mocked(decodeOAuthState).mockReturnValue({
        onErrorReturnTo: undefined as unknown as string,
        fromApp: false,
        returnTo: undefined,
      });

      const mockErrorResponse = {
        error: "invalid_client",
        error_description: "Client authentication failed",
      };

      mockPost.mockResolvedValueOnce({ data: mockErrorResponse });

      await callbackHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Client authentication failed",
      });
    });

    test("handles error response without description from token endpoint", async () => {
      const req = createMockRequest({
        query: { code: "auth_code_123" },
      });
      const res = createMockResponse();

      vi.mocked(decodeOAuthState).mockReturnValue({
        onErrorReturnTo: undefined as unknown as string,
        fromApp: false,
        returnTo: undefined,
      });

      const mockErrorResponse = {
        error: "invalid_client",
      };

      mockPost.mockResolvedValueOnce({ data: mockErrorResponse });

      await callbackHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "invalid_client",
      });
    });

    test("handles profile fetch error", async () => {
      const req = createMockRequest({
        query: { code: "auth_code_123" },
      });
      const res = createMockResponse();

      // Mock state to return no redirect URLs, so it uses JSON response
      vi.mocked(decodeOAuthState).mockReturnValue({
        onErrorReturnTo: undefined as unknown as string,
        fromApp: false,
        returnTo: undefined,
      });

      const mockTokenResponse = {
        access_token: "access_token_123",
        refresh_token: "refresh_token_123",
        token_type: "Bearer" as const,
        expires_in: 3600,
        scope: "meetings:write calendar:write profile:read",
      };

      const profileError = new Error("Profile fetch failed");

      mockPost.mockResolvedValueOnce({ data: mockTokenResponse });
      mockGet.mockRejectedValueOnce(profileError);

      await callbackHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Unable to connect to KYZON Space. Please try again.",
      });
    });
  });

  describe("database operations", () => {
    test("deletes existing credentials before creating new ones", async () => {
      const req = createMockRequest({
        query: { code: "auth_code_123" },
      });
      const res = createMockResponse();

      const mockTokenResponse = {
        access_token: "access_token_123",
        refresh_token: "refresh_token_123",
        token_type: "Bearer" as const,
        expires_in: 3600,
        scope: "meetings:write calendar:write profile:read",
      };

      const mockProfileResponse = {
        id: "user_123",
        email: "user@example.com",
        firstName: "John",
        lastName: "Doe",
        teamId: "team_123",
      };

      mockPost.mockResolvedValueOnce({ data: mockTokenResponse });
      mockGet.mockResolvedValueOnce({ data: mockProfileResponse });

      await callbackHandler(req, res);

      expect(prismaMock.credential.deleteMany).toHaveBeenCalledWith({
        where: {
          type: "kyzonspacevideo_video",
          userId: 1,
          appId: "kyzonspacevideo",
        },
      });

      expect(createOAuthAppCredential).toHaveBeenCalledWith(
        { appId: "kyzonspacevideo", type: "kyzonspacevideo_video" },
        expect.objectContaining({
          access_token: "access_token_123",
          user_id: "user_123",
          team_id: "team_123",
        }),
        req
      );
    });
  });
});
