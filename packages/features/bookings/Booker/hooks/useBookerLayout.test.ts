/**
 * @vitest-environment jsdom
 */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BookerLayouts } from "@calcom/prisma/zod-utils";

import { useBookerLayout } from "./useBookerLayout";

const mockSetLayout = vi.fn();
const mockGetQueryParam = vi.fn();
const mockUseIsEmbed = vi.fn(() => false);
const mockUseEmbedUiConfig = vi.fn(() => ({ layout: undefined, hideEventTypeDetails: false }));

vi.mock("@calcom/features/bookings/Booker/BookerStoreProvider", () => ({
  useBookerStoreContext: vi.fn((selector) =>
    selector({
      layout: BookerLayouts.MONTH_VIEW,
      setLayout: mockSetLayout,
    })
  ),
}));

vi.mock("@calcom/embed-core/embed-iframe", () => ({
  useIsEmbed: () => mockUseIsEmbed(),
  useEmbedUiConfig: () => mockUseEmbedUiConfig(),
  useEmbedType: () => "inline",
  useSlotsViewOnSmallScreen: () => false,
}));

vi.mock("@calcom/features/bookings/Booker/utils/query-param", () => ({
  getQueryParam: (key: string) => mockGetQueryParam(key),
}));

vi.mock("@calcom/lib/hooks/useMediaQuery", () => ({
  default: () => false,
}));

describe("useBookerLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsEmbed.mockReturnValue(false);
    mockUseEmbedUiConfig.mockReturnValue({ layout: undefined, hideEventTypeDetails: false });
    mockGetQueryParam.mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it("uses enabled layout from query param as defaultLayout when not in embed mode", () => {
    mockGetQueryParam.mockImplementation((key: string) =>
      key === "layout" ? BookerLayouts.WEEK_VIEW : null
    );

    const { result } = renderHook(() =>
      useBookerLayout({
        defaultLayout: BookerLayouts.MONTH_VIEW,
        enabledLayouts: [
          BookerLayouts.MONTH_VIEW,
          BookerLayouts.WEEK_VIEW,
          BookerLayouts.COLUMN_VIEW,
        ],
      })
    );

    expect(result.current.defaultLayout).toBe(BookerLayouts.WEEK_VIEW);
    expect(mockSetLayout).toHaveBeenCalledWith(BookerLayouts.WEEK_VIEW);
  });

  it("falls back to profile defaultLayout when query param layout is not enabled", () => {
    mockGetQueryParam.mockImplementation((key: string) =>
      key === "layout" ? BookerLayouts.COLUMN_VIEW : null
    );

    const { result } = renderHook(() =>
      useBookerLayout({
        defaultLayout: BookerLayouts.MONTH_VIEW,
        enabledLayouts: [BookerLayouts.MONTH_VIEW, BookerLayouts.WEEK_VIEW],
      })
    );

    expect(result.current.defaultLayout).toBe(BookerLayouts.MONTH_VIEW);
  });
});
