import { renderHook } from "@testing-library/react-hooks";
import { describe, expect, it, vi } from "vitest";
import { useCompatSearchParams } from "./useCompatSearchParams";

vi.mock("next/navigation", () => ({
  ReadonlyURLSearchParams: vi.fn().mockImplementation(function (a) {
    return a;
  }),
}));

describe("useCompatSearchParams hook", () => {
  it("should return the searchParams in next@13.4.6 Pages Router, SSR", async () => {
    const navigation = await import("next/navigation");

    navigation.useSearchParams = vi.fn().mockReturnValue(new URLSearchParams("a=a&b=b"));
    navigation.useParams = vi.fn().mockReturnValue(null);

    const { result } = renderHook(() => useCompatSearchParams());

    expect(result.current.toString()).toEqual("a=a&b=b");
  });

  it("should return both searchParams and params in next@13.4.6 App Router, SSR", async () => {
    const navigation = await import("next/navigation");

    navigation.useSearchParams = vi.fn().mockReturnValue(new URLSearchParams("a=a"));
    navigation.useParams = vi.fn().mockReturnValue({ b: "b" });

    const { result } = renderHook(() => useCompatSearchParams());

    expect(result.current.toString()).toEqual("a=a&b=b");
  });

  it("params should always override searchParams in case of conflicting keys", async () => {
    const navigation = await import("next/navigation");

    navigation.useSearchParams = vi.fn().mockReturnValue(new URLSearchParams("a=a"));
    navigation.useParams = vi.fn().mockReturnValue({ a: "b" });

    const { result } = renderHook(() => useCompatSearchParams());

    expect(result.current.toString()).toEqual("a=b");
  });

  it("should split paramsseparated with '/' (catch-all segments) in next@13.4.6 App Router, SSR", async () => {
    const navigation = await import("next/navigation");

    navigation.useSearchParams = vi.fn().mockReturnValue(new URLSearchParams());
    // in next@13.4.6 useParams will return params separated by `/`
    navigation.useParams = vi.fn().mockReturnValue({ a: "a/b/c" });

    const { result } = renderHook(() => useCompatSearchParams());

    expect(result.current.getAll("a")).toEqual(["a", "b", "c"]);
  });

  it("should include params and searchParams in next@13.5.4, Pages/App Router, SSR", async () => {
    const navigation = await import("next/navigation");

    navigation.useSearchParams = vi.fn().mockReturnValue(new URLSearchParams("a=a"));
    navigation.useParams = vi.fn().mockReturnValue({ b: "b" });

    const { result } = renderHook(() => useCompatSearchParams());

    expect(result.current.toString()).toEqual("a=a&b=b");
  });
});
