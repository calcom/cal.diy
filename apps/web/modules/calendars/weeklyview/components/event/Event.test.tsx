import dayjs from "@calcom/dayjs";
import type { CalendarEvent } from "@calcom/features/calendars/weeklyview/types/events";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Event } from "./Event";

vi.mock("@calcom/ui/components/tooltip", () => ({
  Tooltip: ({ children, side }: { children: ReactNode; side: string }) => (
    <div data-testid="event-tooltip" data-side={side}>
      {children}
    </div>
  ),
}));

describe("Event tooltip placement", () => {
  it("uses the displayed column day for a multi-day event", () => {
    const event: CalendarEvent = {
      id: 0,
      title: "Thursday to Friday event",
      start: new Date(2026, 9, 22, 20, 0),
      end: new Date(2026, 9, 23, 12, 0),
    };

    render(<Event event={event} day={dayjs("2026-10-23")} eventDuration={60} />);

    expect(screen.getByTestId("event-tooltip").getAttribute("data-side")).toBe("left");
    expect(screen.getByText("Thursday to Friday event")).toBeTruthy();
  });
});
