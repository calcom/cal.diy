/**
 * @vitest-environment jsdom
 */
import dayjs from "@calcom/dayjs";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useOverlayCalendarStore } from "../Booker/components/OverlayCalendar/store";
import { useCheckOverlapWithOverlay } from "./useCheckOverlapWithOverlay";

const checkSlot = (start: string) =>
  renderHook(() => useCheckOverlapWithOverlay({ start: dayjs(start), selectedDuration: 30, offset: 0 }))
    .result.current;

describe("useCheckOverlapWithOverlay", () => {
  beforeEach(() => {
    useOverlayCalendarStore.setState({
      overlayBusyDates: [
        { start: new Date("2024-01-10T10:00:00"), end: new Date("2024-01-10T11:00:00"), title: "Standup" },
        { start: new Date("2024-01-11T14:00:00"), end: new Date("2024-01-13T16:00:00"), title: "Conference" },
        { start: new Date("2024-01-15T10:00:00"), end: new Date("2024-01-15T11:00:00") },
      ],
    });
  });

  it("returns the title and time of the event a slot overlaps with", () => {
    expect(checkSlot("2024-01-10T10:30:00")).toEqual({
      isOverlapping: true,
      overlappingTimeStart: "10:00",
      overlappingTimeEnd: "11:00",
      overlappingTitle: "Standup",
    });
  });

  it("includes the date for events spanning several days", () => {
    expect(checkSlot("2024-01-12T09:00:00")).toEqual({
      isOverlapping: true,
      overlappingTimeStart: "Jan 11, 14:00",
      overlappingTimeEnd: "Jan 13, 16:00",
      overlappingTitle: "Conference",
    });
  });

  it("returns no title for busy times without one", () => {
    expect(checkSlot("2024-01-15T10:00:00")).toMatchObject({ isOverlapping: true, overlappingTitle: null });
  });

  it("doesn't overlap when the slot is free", () => {
    expect(checkSlot("2024-01-10T12:00:00")).toEqual({
      isOverlapping: false,
      overlappingTimeStart: null,
      overlappingTimeEnd: null,
      overlappingTitle: null,
    });
  });
});
