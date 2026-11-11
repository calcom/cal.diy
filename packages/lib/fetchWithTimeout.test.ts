import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchWithTimeout } from "./fetchWithTimeout";

describe("fetchWithTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should successfully return response when request finishes before timeout", async () => {
    const mockResponse = new Response(JSON.stringify({ success: true }), { status: 200 });
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    vi.stubGlobal("fetch", mockFetch);

    const promise = fetchWithTimeout("https://api.example.com/data", {}, 3000);
    const response = await promise;

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/data",
      expect.objectContaining({ signal: expect.any(Object) })
    );
  });

  it("should abort the request when timeout duration is exceeded", async () => {
    const mockFetch = vi.fn().mockImplementation((_url, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const promise = fetchWithTimeout("https://api.example.com/slow", {}, 1000);

    // Fast-forward past timeout
    vi.advanceTimersByTime(1001);

    await expect(promise).rejects.toThrow("The operation was aborted");
  });

  it("should respect external AbortSignal and abort when external controller aborts", async () => {
    const mockFetch = vi.fn().mockImplementation((_url, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("External signal aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const externalController = new AbortController();
    const promise = fetchWithTimeout(
      "https://api.example.com/data",
      { signal: externalController.signal },
      10000
    );

    // Abort externally after 200ms (way before 10000ms timeout)
    vi.advanceTimersByTime(200);
    externalController.abort();

    await expect(promise).rejects.toThrow("External signal aborted");
  });

  it("should immediately abort if external signal is already aborted", async () => {
    const mockFetch = vi.fn().mockImplementation((_url, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        const err = new Error("Already aborted");
        err.name = "AbortError";
        return Promise.reject(err);
      }
      return Promise.resolve(new Response("ok"));
    });
    vi.stubGlobal("fetch", mockFetch);

    const externalController = new AbortController();
    externalController.abort();

    const promise = fetchWithTimeout(
      "https://api.example.com/data",
      { signal: externalController.signal },
      5000
    );

    await expect(promise).rejects.toThrow("Already aborted");
  });

  it("should propagate network errors and clean up timer", async () => {
    const networkError = new TypeError("Failed to fetch (DNS resolution failed)");
    const mockFetch = vi.fn().mockRejectedValue(networkError);
    vi.stubGlobal("fetch", mockFetch);

    const promise = fetchWithTimeout("https://unreachable.domain/api", {}, 5000);

    await expect(promise).rejects.toThrow("Failed to fetch (DNS resolution failed)");
  });

  it("should detach its listener from the external signal once the request settles", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const external = new AbortController();
    const addSpy = vi.spyOn(external.signal, "addEventListener");
    const removeSpy = vi.spyOn(external.signal, "removeEventListener");

    await fetchWithTimeout("https://api.example.com/data", { signal: external.signal }, 5000);

    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy.mock.calls[0][1]).toBe(addSpy.mock.calls[0][1]);
  });

  it("should detach its listener from the external signal when the request rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const external = new AbortController();
    const removeSpy = vi.spyOn(external.signal, "removeEventListener");

    await expect(
      fetchWithTimeout("https://unreachable.domain/api", { signal: external.signal }, 5000)
    ).rejects.toThrow("Failed to fetch");

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it("should not leak a listener per request on a long-lived external signal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ok", { status: 200 })));

    const external = new AbortController();
    const addSpy = vi.spyOn(external.signal, "addEventListener");
    const removeSpy = vi.spyOn(external.signal, "removeEventListener");

    for (let i = 0; i < 5; i++) {
      await fetchWithTimeout("https://api.example.com/data", { signal: external.signal }, 5000);
    }

    expect(addSpy).toHaveBeenCalledTimes(5);
    expect(removeSpy).toHaveBeenCalledTimes(5);
  });
});
