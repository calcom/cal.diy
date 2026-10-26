/**
 * @vitest-environment jsdom
 */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BookerLayouts } from "@calcom/prisma/zod-utils";

let mockQueryParams: Record<string, string | null> = {};
const mockSetLayout = vi.fn();
let mockIsEmbed = false;
let mockIsMobile = false;

vi.mock("@calcom/embed-core/embed-iframe", () => ({
  useIsEmbed: () => mockIsEmbed,
  useEmbedType: () => "inline",
  useEmbedUiConfig: () => ({}),
  useSlotsViewOnSmallScreen: () => false,
}));

vi.mock("@calcom/lib/hooks/useMediaQuery", () => ({
  default: () => mockIsMobile,
}));

vi.mock("@calcom/features/bookings/Booker/BookerStoreProvider", () => ({
  useBookerStoreContext: (selector: any) =>
    selector({
      layout: "month_view",
      setLayout: mockSetLayout,
    }),
}));

vi.mock("@calcom/features/bookings/Booker/utils/query-param", () => ({
  getQueryParam: (key: string) => mockQueryParams[key] ?? null,
}));

import { useBookerLayout } from "./useBookerLayout";

describe("useBookerLayout", () => {
  const profileBookerLayouts = {
    defaultLayout: "month_view" as BookerLayouts,
    enabledLayouts: ["month_view", "week_view", "column_view"] as BookerLayouts[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryParams = {};
    mockIsEmbed = false;
    mockIsMobile = false;
  });

  afterEach(() => {
    cleanup();
  });

  it("returns configured profile defaultLayout when no layout query param is present", () => {
    const { result } = renderHook(() => useBookerLayout(profileBookerLayouts));

    expect(result.current.defaultLayout).toBe("month_view");
  });

  it("resolves defaultLayout to week_view when ?layout=week_view query param is present and enabled", () => {
    mockQueryParams = { layout: "week_view" };
    const { result } = renderHook(() => useBookerLayout(profileBookerLayouts));

    expect(result.current.defaultLayout).toBe("week_view");
  });

  it("resolves defaultLayout to column_view when ?layout=column_view query param is present and enabled", () => {
    mockQueryParams = { layout: "column_view" };
    const { result } = renderHook(() => useBookerLayout(profileBookerLayouts));

    expect(result.current.defaultLayout).toBe("column_view");
  });

  it("falls back to profile defaultLayout when query param is invalid", () => {
    mockQueryParams = { layout: "not_a_valid_layout" };
    const { result } = renderHook(() => useBookerLayout(profileBookerLayouts));

    expect(result.current.defaultLayout).toBe("month_view");
  });

  it("falls back to profile defaultLayout when query param layout is not in enabledLayouts", () => {
    mockQueryParams = { layout: "week_view" };
    const restrictedLayouts = {
      defaultLayout: "month_view" as BookerLayouts,
      enabledLayouts: ["month_view"] as BookerLayouts[],
    };

    const { result } = renderHook(() => useBookerLayout(restrictedLayouts));

    expect(result.current.defaultLayout).toBe("month_view");
  });
});
