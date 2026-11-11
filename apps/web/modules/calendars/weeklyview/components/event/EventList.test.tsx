import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import type { CalendarEvent } from "@calcom/features/calendars/weeklyview/types/events";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventList } from "./EventList";

const mockState = vi.hoisted(() => ({
  value: {
    startHour: 0,
    events: [] as CalendarEvent[],
    onEventClick: undefined as ((event: CalendarEvent) => void) | undefined,
    selectedBookingUid: undefined as string | undefined,
  },
}));

vi.mock("@calcom/features/calendars/weeklyview/state/store", () => ({
  useCalendarStore: (selector: (state: typeof mockState.value) => unknown) => selector(mockState.value),
}));

vi.mock("./Event", () => ({
  Event: ({
    event,
    day,
    onEventClick,
  }: {
    event: CalendarEvent;
    day: Dayjs;
    onEventClick?: (event: CalendarEvent) => void;
  }) => (
    <button
      type="button"
      data-testid={`event-${event.id}`}
      data-rendered-day={day.format("YYYY-MM-DD")}
      onClick={() => onEventClick?.(event)}>
      {event.title}
    </button>
  ),
}));

const earlierEvent: CalendarEvent = {
  id: 0,
  title: "Ends early on Friday",
  start: new Date(2026, 9, 21, 20, 0),
  end: new Date(2026, 9, 23, 4, 0),
};

const laterEvent: CalendarEvent = {
  id: 1,
  title: "Ends later on Friday",
  start: new Date(2026, 9, 22, 20, 0),
  end: new Date(2026, 9, 23, 12, 0),
};

describe("EventList multi-day events", () => {
  beforeEach(() => {
    mockState.value.events = [earlierEvent, laterEvent];
    mockState.value.onEventClick = undefined;
    mockState.value.selectedBookingUid = undefined;
  });

  it("uses day-clipped bounds for overlap order without changing the clicked event", () => {
    const onEventClick = vi.fn();
    mockState.value.onEventClick = onEventClick;

    const { container } = render(<EventList day={dayjs("2026-10-23")} />);
    const earlierElement = container.querySelector<HTMLElement>('[data-calendar-event-id="0"]');
    const laterElement = container.querySelector<HTMLElement>('[data-calendar-event-id="1"]');

    expect(laterElement?.style.left).toBe("0%");
    expect(earlierElement?.style.left).not.toBe("0%");
    expect(screen.getByTestId("event-0").getAttribute("data-rendered-day")).toBe("2026-10-23");

    fireEvent.click(screen.getByTestId("event-1"));
    expect(onEventClick).toHaveBeenCalledWith(laterEvent);
  });

  it("dims other members of the overlap group when hovering event id 0", () => {
    const { container } = render(<EventList day={dayjs("2026-10-23")} />);
    const firstElement = container.querySelector<HTMLElement>('[data-calendar-event-id="0"]');
    const secondElement = container.querySelector<HTMLElement>('[data-calendar-event-id="1"]');

    expect(firstElement).not.toBeNull();
    expect(secondElement?.style.opacity).toBe("1");
    fireEvent.mouseEnter(firstElement as HTMLElement);
    expect(secondElement?.style.opacity).toBe("0.6");
  });
});
