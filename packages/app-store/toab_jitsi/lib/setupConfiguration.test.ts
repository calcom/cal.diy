import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const fetchMock: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());

const setupResponse: {
  userId: number;
  servers: Array<{ id: number; name: string; serverUrl: string; serverType: "CUSTOM" | "DEFAULT" }>;
} = {
  userId: 42,
  servers: [{ id: 7, name: "Preferred", serverUrl: "https://meet.example.com", serverType: "CUSTOM" }],
};

function jsonResponse(body: unknown, ok: boolean = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

describe("TOAB Jitsi setup configuration loaders", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("deduplicates concurrent setup requests and caches the result", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      })
    );
    const { loadSetupConfiguration } = await import("./setupConfiguration");

    const firstRequest = loadSetupConfiguration(201);
    const secondRequest = loadSetupConfiguration(201);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/integrations/toab_jitsi/config?eventTypeId=201");

    resolveResponse?.(jsonResponse(setupResponse));
    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([setupResponse, setupResponse]);
    await expect(loadSetupConfiguration(201)).resolves.toEqual(setupResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("refreshes setup data after the five-minute cache expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    fetchMock
      .mockResolvedValueOnce(jsonResponse(setupResponse))
      .mockResolvedValueOnce(
        jsonResponse({ ...setupResponse, servers: [{ ...setupResponse.servers[0], name: "Updated" }] })
      );
    const { loadSetupConfiguration } = await import("./setupConfiguration");

    await loadSetupConfiguration(202);
    vi.setSystemTime(new Date("2026-01-01T00:05:00.001Z"));
    const refreshed = await loadSetupConfiguration(202);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshed.servers[0].name).toBe("Updated");
  });

  test("does not cache failed setup requests", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, false))
      .mockResolvedValueOnce(jsonResponse(setupResponse));
    const { loadSetupConfiguration } = await import("./setupConfiguration");

    await expect(loadSetupConfiguration(203)).rejects.toThrow("Could not load TOAB Jitsi configuration");
    await expect(loadSetupConfiguration(203)).resolves.toEqual(setupResponse);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("loads the saved location on every call instead of caching it", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ moderatorLocationEnabled: false }))
      .mockResolvedValueOnce(jsonResponse({ moderatorLocationEnabled: true }));
    const { loadLocationConfiguration } = await import("./setupConfiguration");

    await expect(loadLocationConfiguration(204)).resolves.toEqual({ moderatorLocationEnabled: false });
    await expect(loadLocationConfiguration(204)).resolves.toEqual({ moderatorLocationEnabled: true });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/integrations/toab_jitsi/location?eventTypeId=204");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("rejects malformed location responses", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ moderatorLocationEnabled: "yes" }));
    const { loadLocationConfiguration } = await import("./setupConfiguration");

    await expect(loadLocationConfiguration(205)).rejects.toThrow();
  });
});
