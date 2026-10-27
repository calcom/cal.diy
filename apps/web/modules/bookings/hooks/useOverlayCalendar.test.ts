/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WrappedBookerPropsMain } from "../types";
import { useOverlayCalendar } from "./useOverlayCalendar";

import dayjs from "@calcom/dayjs";
import { useOverlayCalendarStore } from "@calcom/features/bookings/Booker/components/OverlayCalendar/store";

const { getTimezone, setTimezone } = vi.hoisted(() => {
  let tz = "UTC";
  return {
    getTimezone: () => tz,
    setTimezone: (newTz: string) => {
      tz = newTz;
    },
  };
});

vi.mock("@calcom/features/bookings/lib", () => ({
  useTimePreferences: () => ({ timezone: getTimezone() }),
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
    setTimezone("UTC");
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

  it("shifts overlay busy dates correctly across different DST periods", () => {
    setTimezone("America/New_York");
    const onToggleCalendar = vi.fn();
    const octStart = "2026-10-15T10:00:00Z";
    const octEnd = "2026-10-15T11:00:00Z";
    const decStart = "2026-12-15T10:00:00Z";
    const decEnd = "2026-12-15T11:00:00Z";

    renderHook(() =>
      useOverlayCalendar({
        connectedCalendars: [],
        overlayBusyDates: [
          { start: octStart, end: octEnd },
          { start: decStart, end: decEnd },
        ],
        onToggleCalendar,
      })
    );

    const storedDates = useOverlayCalendarStore.getState().overlayBusyDates;
    expect(storedDates).toBeDefined();
    expect(storedDates).toHaveLength(2);

    const octShift = (dayjs(octStart).tz("America/New_York").utcOffset() - dayjs(octStart).utcOffset()) / 60;
    const decShift = (dayjs(decStart).tz("America/New_York").utcOffset() - dayjs(decStart).utcOffset()) / 60;

    expect(storedDates![0].start).toEqual(dayjs(octStart).add(octShift, "hours").toDate());
    expect(storedDates![1].start).toEqual(dayjs(decStart).add(decShift, "hours").toDate());
  });

  it("recalculates overlay busy dates when booker timezone changes", () => {
    setTimezone("UTC");
    const onToggleCalendar = vi.fn();
    const busyDate = { start: "2026-10-15T10:00:00Z", end: "2026-10-15T11:00:00Z" };

    const { rerender } = renderHook(
      () =>
        useOverlayCalendar({
          connectedCalendars: [],
          overlayBusyDates: [busyDate],
          onToggleCalendar,
        })
    );

    const initialStored = useOverlayCalendarStore.getState().overlayBusyDates;
    expect(initialStored![0].start).toEqual(dayjs(busyDate.start).toDate());

    setTimezone("America/New_York");
    rerender();

    const updatedStored = useOverlayCalendarStore.getState().overlayBusyDates;
    const shift = (dayjs(busyDate.start).tz("America/New_York").utcOffset() - dayjs(busyDate.start).utcOffset()) / 60;
    expect(updatedStored![0].start).toEqual(dayjs(busyDate.start).add(shift, "hours").toDate());
  });

  it("re-evaluates shift when shifted instant crosses a DST boundary", () => {
    setTimezone("UTC");
    const onToggleCalendar = vi.fn();
    const switchoverInstant = "2026-03-08T06:30:00Z";

    renderHook(() =>
      useOverlayCalendar({
        connectedCalendars: [],
        overlayBusyDates: [{ start: switchoverInstant, end: "2026-03-08T07:30:00Z" }],
        onToggleCalendar,
      })
    );

    const storedDates = useOverlayCalendarStore.getState().overlayBusyDates;
    expect(storedDates).toBeDefined();
    expect(storedDates).toHaveLength(1);

    const date = dayjs(switchoverInstant);
    const shift = (date.tz("UTC").utcOffset() - date.utcOffset()) / 60;
    let expectedOut = date.add(shift, "hours");
    const shiftAtOut = (expectedOut.tz("UTC").utcOffset() - expectedOut.utcOffset()) / 60;
    if (shiftAtOut !== shift) expectedOut = date.add(shiftAtOut, "hours");

    expect(storedDates![0].start).toEqual(expectedOut.toDate());
  });
});
