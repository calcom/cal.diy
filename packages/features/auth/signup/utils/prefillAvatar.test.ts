import { fetchWithSSRFProtection } from "@calcom/lib/ssrfProtection";
import prisma from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prefillAvatar } from "./prefillAvatar";

vi.mock("@calcom/lib/ssrfProtection", () => ({
  fetchWithSSRFProtection: vi.fn(),
}));

vi.mock("@calcom/lib/server/avatar", () => ({
  uploadAvatar: vi.fn(),
}));

vi.mock("@calcom/lib/server/resizeBase64Image", () => ({
  resizeBase64Image: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("avatar prefill SSRF protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AVATARAPI_USERNAME", "test-user");
    vi.stubEnv("AVATARAPI_PASSWORD", "test-password");
  });

  it("does not update the user when the returned image URL is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ Success: true, Image: "https://127.0.0.1/avatar.png" }), {
          headers: { "content-type": "application/json" },
        })
      )
    );
    vi.mocked(fetchWithSSRFProtection).mockRejectedValue(new Error("URL blocked by SSRF protection"));

    await expect(prefillAvatar({ email: "user@example.com" })).resolves.toBeUndefined();

    expect(fetchWithSSRFProtection).toHaveBeenCalledWith("https://127.0.0.1/avatar.png");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
