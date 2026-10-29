import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get, patch, post, put, remove } from "./fetch-wrapper";
import { HttpError } from "./http-error";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockFetch.mockReset();
});

describe("http wrapper functions", () => {
  it("get should make a GET request and return JSON", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 }), { status: 200 }));

    const result = await get<{ id: number }>("http://localhost/api/test");
    expect(result).toEqual({ id: 1 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
      })
    );
  });

  it("post should make a POST request with body and return JSON", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    const result = await post<{ name: string }, { success: boolean }>("http://localhost/api/test", {
      name: "test",
    });
    expect(result).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "test" }),
      })
    );
  });

  it("put should make a PUT request with body and return JSON", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ updated: true }), { status: 200 }));

    const result = await put<{ name: string }, { updated: boolean }>("http://localhost/api/test", {
      name: "test",
    });
    expect(result).toEqual({ updated: true });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "test" }),
      })
    );
  });

  it("patch should make a PATCH request with body and return JSON", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ patched: true }), { status: 200 }));

    const result = await patch<{ name: string }, { patched: boolean }>("http://localhost/api/test", {
      name: "test",
    });
    expect(result).toEqual({ patched: true });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "test" }),
      })
    );
  });

  it("remove should make a DELETE request with body and return JSON", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true }), { status: 200 }));

    const result = await remove<{ id: number }, { deleted: boolean }>("http://localhost/api/test", { id: 1 });
    expect(result).toEqual({ deleted: true });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 1 }),
      })
    );
  });

  it("should throw HttpError on error response with JSON body", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Bad Request" }), { status: 400 })
    );

    await expect(get("http://localhost/api/test")).rejects.toThrow(HttpError);
  });

  it("should throw HttpError with statusCode 400 for bad request", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Validation failed" }), { status: 400 })
    );

    const err = await get("http://localhost/api/test").catch((e) => e) as HttpError;
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe("Validation failed");
    expect(err.url).toBe("http://localhost/api/test");
    expect(err.method).toBe("GET");
  });

  it("should throw HttpError on error response with non-JSON body", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Service Unavailable", { status: 503, statusText: "Service Unavailable" })
    );

    const err = await get("http://localhost/api/test").catch((e) => e) as HttpError;
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(503);
    expect(err.message).toBe("Service Unavailable");
  });

  it("should throw on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    await expect(get("http://localhost/api/test")).rejects.toThrow("Network failure");
  });
});
