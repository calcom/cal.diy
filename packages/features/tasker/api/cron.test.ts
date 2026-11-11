import type { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../task-processor", () => ({
  TaskProcessor: vi.fn().mockImplementation(() => ({
    processQueue: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("..", () => ({
  default: {
    cleanup: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("tasker cron routes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("rejects Bearer undefined when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", undefined);

    const { GET } = await import("./cron");
    const request = {
      headers: {
        get: () => "Bearer undefined",
      },
    } as NextRequest;

    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("runs cleanup when bearer token matches", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");

    const tasker = (await import("..")).default;
    const { GET } = await import("./cleanup");
    const request = {
      headers: {
        get: () => "Bearer test-secret",
      },
    } as NextRequest;

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(tasker.cleanup).toHaveBeenCalled();
  });
});
