import prisma from "@calcom/prisma";
import type { CredentialPayload } from "@calcom/types/Credential";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import getAppKeysFromSlug from "../../_utils/getAppKeysFromSlug";
import refreshOAuthTokens from "../../_utils/oauth/refreshOAuthTokens";
import BuildCrmService from "./CrmService";

vi.mock("axios", () => ({
  default: Object.assign(vi.fn(), { post: vi.fn() }),
}));

vi.mock("@calcom/prisma", () => ({
  default: { credential: { update: vi.fn() } },
}));

vi.mock("../../_utils/getAppKeysFromSlug");

vi.mock("../../_utils/oauth/refreshOAuthTokens", () => ({
  default: vi.fn((refreshFn: () => Promise<unknown>) => refreshFn()),
}));

describe("BiginCrmService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    vi.clearAllMocks();

    vi.mocked(getAppKeysFromSlug).mockResolvedValue({
      client_id: "client-id",
      client_secret: "client-secret",
    });
    vi.mocked(axios).mockResolvedValue({ data: { data: [] } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes expired tokens with userId and converts expires_in to ms", async () => {
    const startMs = Date.now();
    vi.mocked(axios.post)
      .mockResolvedValueOnce({
        data: { access_token: "token-1", api_domain: "https://www.zohoapis.com", expires_in: 3600 },
      })
      .mockResolvedValueOnce({
        data: { access_token: "token-2", api_domain: "https://www.zohoapis.com", expires_in: 3600 },
      });

    const credential = {
      id: 99,
      userId: 42,
      key: {
        access_token: "expired",
        expiryDate: startMs - 1000,
        accountServer: "https://accounts.zoho.com",
        refresh_token: "refresh-1",
      },
    } as unknown as CredentialPayload;

    const service = BuildCrmService(credential);
    await service.getContacts({ emails: "test@example.com" });

    expect(refreshOAuthTokens).toHaveBeenCalledWith(expect.any(Function), "zoho-bigin", 42);
    expect(prisma.credential.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: {
        key: expect.objectContaining({
          access_token: "token-1",
          expiryDate: startMs + 3600 * 1000,
        }),
      },
    });

    await vi.advanceTimersByTimeAsync(60 * 1000);
    await service.getContacts({ emails: "test@example.com" });
    expect(axios.post).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3600 * 1000);
    await service.getContacts({ emails: "test@example.com" });
    expect(axios.post).toHaveBeenCalledTimes(2);
  });
});
