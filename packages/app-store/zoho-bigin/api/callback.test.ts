import axios from "axios";
import type { NextApiRequest, NextApiResponse } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import getAppKeysFromSlug from "../../_utils/getAppKeysFromSlug";
import createOAuthAppCredential from "../../_utils/oauth/createOAuthAppCredential";
import handler from "./callback";

vi.mock("axios", () => ({
  default: { post: vi.fn() },
}));

vi.mock("../../_utils/getAppKeysFromSlug");
vi.mock("../../_utils/oauth/createOAuthAppCredential");
vi.mock("../../_utils/oauth/decodeOAuthState");

describe("zoho-bigin callback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    vi.clearAllMocks();

    vi.mocked(getAppKeysFromSlug).mockResolvedValue({
      client_id: "client-id",
      client_secret: "client-secret",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores expiryDate in milliseconds instead of seconds", async () => {
    const now = Date.now();
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { access_token: "token-1", refresh_token: "refresh-1", expires_in: 3600 },
    });

    const req = {
      query: { code: "auth-code", "accounts-server": "https://accounts.zoho.com" },
      session: { user: { id: 42 } },
    } as unknown as NextApiRequest;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      redirect: vi.fn().mockReturnThis(),
    } as unknown as NextApiResponse;

    await handler(req, res);

    expect(createOAuthAppCredential).toHaveBeenCalledWith(
      { appId: "zoho-bigin", type: "zoho-bigin_crm" },
      expect.objectContaining({
        access_token: "token-1",
        expiryDate: now + 3600 * 1000,
        accountServer: "https://accounts.zoho.com",
      }),
      req
    );
    expect(res.redirect).toHaveBeenCalledTimes(1);
  });
});
