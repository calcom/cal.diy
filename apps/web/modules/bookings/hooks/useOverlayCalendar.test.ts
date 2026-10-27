/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WrappedBookerPropsMain } from "../types";
import { useOverlayCalendar } from "./useOverlayCalendar";

vi.mock("@calcom/features/bookings/lib", () => ({
  useTimePreferences: () => ({ timezone: "UTC" }),
}));

type ConnectedCalendars = WrappedBookerPropsMain["calendars"]["connectedCalendars"];

const buildConnectedCalendars = (
  calendars: NonNullable<ConnectedCalendars[number]["calendars"]>
): ConnectedCalendars => [
  {
    credentialId: 1,
    cacheUpdatedAt: null,
    integration: { slug: "google-calendar", logo: "" },
    calendars,
  },
];

const renderOverlayCalendar = (connectedCalendars: ConnectedCalendars) => {
  const onToggleCalendar = vi.fn();
  const hook = renderHook(
    (props: { connectedCalendars: ConnectedCalendars }) =>
      useOverlayCalendar({ ...props, overlayBusyDates: undefined, onToggleCalendar }),
    { initialProps: { connectedCalendars } }
  );
  return { ...hook, onToggleCalendar };
};

describe("useOverlayCalendar", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts with the calendars that are checked for conflicts", () => {
    const { result, onToggleCalendar } = renderOverlayCalendar(
      buildConnectedCalendars([
        { externalId: "primary", primary: true, isSelected: false },
        { externalId: "work", primary: false, isSelected: true },
      ])
    );

    expect(result.current.checkIsCalendarToggled("work", 1)).toBe(true);
    expect(result.current.checkIsCalendarToggled("primary", 1)).toBe(false);
    expect(onToggleCalendar).toHaveBeenCalledTimes(1);
    expect(Array.from(onToggleCalendar.mock.calls[0][0])).toEqual([{ credentialId: 1, externalId: "work" }]);
  });

  it("falls back to the primary calendar when it isn't known which calendars are checked for conflicts", () => {
    const { result } = renderOverlayCalendar(
      buildConnectedCalendars([
        { externalId: "primary", primary: true },
        { externalId: "work", primary: false },
      ])
    );

    expect(result.current.checkIsCalendarToggled("primary", 1)).toBe(true);
    expect(result.current.checkIsCalendarToggled("work", 1)).toBe(false);
  });

  it("waits for the connected calendars to load", () => {
    const { result, rerender, onToggleCalendar } = renderOverlayCalendar([]);
    expect(onToggleCalendar).not.toHaveBeenCalled();

    rerender({
      connectedCalendars: buildConnectedCalendars([{ externalId: "work", primary: false, isSelected: true }]),
    });

    expect(result.current.checkIsCalendarToggled("work", 1)).toBe(true);
    expect(onToggleCalendar).toHaveBeenCalledTimes(1);
  });

  it("keeps the calendars the user toggled before", () => {
    window.localStorage.setItem(
      "toggledConnectedCalendars",
      JSON.stringify([{ credentialId: 1, externalId: "personal" }])
    );

    const { result, onToggleCalendar } = renderOverlayCalendar(
      buildConnectedCalendars([
        { externalId: "personal", primary: false, isSelected: false },
        { externalId: "work", primary: false, isSelected: true },
      ])
    );

    expect(result.current.checkIsCalendarToggled("personal", 1)).toBe(true);
    expect(result.current.checkIsCalendarToggled("work", 1)).toBe(false);
    expect(onToggleCalendar).not.toHaveBeenCalled();
  });
});
