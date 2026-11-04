// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BookerLayouts } from "@calcom/prisma/zod-utils";

import { createBookerStore } from "../store";

const initializeStore = (
  store: ReturnType<typeof createBookerStore>,
  isPlatform = false,
  allowUpdatingUrlParams = true,
  month?: string
) => {
  store.getState().initialize({
    username: "pro",
    eventSlug: "30min",
    eventId: 1,
    layout: BookerLayouts.MONTH_VIEW,
    month,
    isPlatform,
    allowUpdatingUrlParams,
  });
};

describe("Booker URL date parameters", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 6, 12));
    window.history.replaceState(null, "", "/pro/30min");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    "?month=garbage&date=garbage",
    "?month=2026-13&date=2026-02-31",
    "?month=2020-01&date=2020-01-01",
    "?month=&date=",
  ])("normalizes invalid query parameters: %s", (search) => {
    window.history.replaceState(null, "", "/pro/30min" + search);
    const store = createBookerStore();

    initializeStore(store);

    expect(store.getState().month).toBe("2026-10");
    expect(store.getState().selectedDate).toBeNull();

    const params = new URLSearchParams(window.location.search);
    expect(params.get("month")).toBe("2026-10");
    expect(params.has("date")).toBe(false);
  });

  it("preserves the selected date month when the initialized month is past", () => {
    const search = "?month=2020-01&date=2027-01-01";
    window.history.replaceState(null, "", "/pro/30min" + search);
    const store = createBookerStore();

    initializeStore(store, false, true, "2020-01");

    expect(store.getState().month).toBe("2027-01");
    expect(store.getState().selectedDate).toBe("2027-01-01");

    const params = new URLSearchParams(window.location.search);
    expect(params.get("month")).toBe("2027-01");
    expect(params.get("date")).toBe("2027-01-01");
  });

  it("sanitizes state without rewriting embed URLs when updates are disabled", () => {
    const search = "?month=garbage&date=garbage";
    window.history.replaceState(null, "", "/pro/30min" + search);
    const store = createBookerStore();

    initializeStore(store, true, false);

    expect(store.getState().month).toBe("2026-10");
    expect(store.getState().selectedDate).toBeNull();
    expect(window.location.search).toBe(search);
  });
});
