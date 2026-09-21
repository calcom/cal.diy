import { renderHook } from "@testing-library/react-hooks";
import { describe, expect, it, vi } from "vitest";
import { useParamsWithFallback } from "./useParamsWithFallback";

describe("useParamsWithFallback hook", () => {
  it("should return router.query when param is null", () => {
    vi.mock("next/navigation", () => ({
      useParams: vi.fn().mockReturnValue(null),
    }));

    vi.mock("next/compat/router", () => ({
      useRouter: vi.fn().mockReturnValue({ query: { id: 1 } }),
    }));

    const { result } = renderHook(() => useParamsWithFallback());

    expect(result.current).toEqual({ id: 1 });
  });

  it("should return router.query when param is undefined", () => {
    vi.mock("next/navigation", () => ({
      useParams: vi.fn().mockReturnValue(undefined),
    }));

    vi.mock("next/compat/router", () => ({
      useRouter: vi.fn().mockReturnValue({ query: { id: 1 } }),
    }));

    const { result } = renderHook(() => useParamsWithFallback());

    expect(result.current).toEqual({ id: 1 });
  });

  it("should return useParams() if it exists", () => {
    vi.mock("next/navigation", () => ({
      useParams: vi.fn().mockReturnValue({ id: 1 }),
    }));

    vi.mock("next/compat/router", () => ({
      useRouter: vi.fn().mockReturnValue(null),
    }));

    const { result } = renderHook(() => useParamsWithFallback());

    expect(result.current).toEqual({ id: 1 });
  });

  it("should return useParams() if it exists", () => {
    vi.mock("next/navigation", () => ({
      useParams: vi.fn().mockReturnValue({ id: 1 }),
    }));

    vi.mock("next/compat/router", () => ({
      useRouter: vi.fn().mockReturnValue({ query: { id: 2 } }),
    }));

    const { result } = renderHook(() => useParamsWithFallback());

    expect(result.current).toEqual({ id: 1 });
  });
});
