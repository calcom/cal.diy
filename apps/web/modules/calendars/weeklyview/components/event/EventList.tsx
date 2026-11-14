import type { Dayjs } from "@calcom/dayjs";
import { useCalendarStore } from "@calcom/features/calendars/weeklyview/state/store";
import { getEventSegmentForDay } from "@calcom/features/calendars/weeklyview/utils";
import { calculateEventLayouts, createLayoutMap } from "@calcom/features/calendars/weeklyview/utils/overlap";
import classNames from "@calcom/ui/classNames";
import { useEffect, useMemo, useState } from "react";
import { shallow } from "zustand/shallow";
import { Event } from "./Event";

type Props = {
  day: Dayjs;
};

export function EventList({ day }: Props) {
  const { startHour, events, eventOnClick, selectedBookingUid } = useCalendarStore(
    (state) => ({
      startHour: state.startHour,
      events: state.events,
      eventOnClick: state.onEventClick,
      selectedBookingUid: state.selectedBookingUid,
    }),
    shallow
  );

  const [hoveredEventId, setHoveredEventId] = useState<number | null>(null);

  const daySegments = useMemo(() => {
    return events.flatMap((event) => {
      if (event.options?.allDay) return [];
      const segment = getEventSegmentForDay(event, day);
      return segment ? [{ event, segment }] : [];
    });
  }, [events, day]);

  const dayEvents = useMemo(() => daySegments.map(({ event }) => event), [daySegments]);

  const layoutMap = useMemo(() => {
    const layoutEvents = daySegments.map(({ event, segment }) => ({
      ...event,
      start: segment.start.toDate(),
      end: segment.end.toDate(),
    }));
    const layouts = calculateEventLayouts(layoutEvents);
    return createLayoutMap(layouts);
  }, [daySegments]);

  const eventCalculations = useMemo(() => {
    return new Map(
      daySegments.map(({ event, segment }) => {
        const eventStart = segment.start;
        const eventDuration = segment.end.diff(eventStart, "minutes");
        const eventStartHour = eventStart.hour();
        const eventStartDiff = (eventStartHour - (startHour || 0)) * 60 + eventStart.minute();

        return [
          event.id,
          {
            eventStart,
            eventDuration,
            eventStartDiff,
          },
        ];
      })
    );
  }, [daySegments, startHour]);

  // Find which overlap group the hovered event belongs to
  const hoveredEventLayout = hoveredEventId !== null ? layoutMap.get(hoveredEventId) : null;
  const hoveredGroupIndex = hoveredEventLayout?.groupIndex ?? null;

  // Find the event ID that matches the selected booking UID (only for events on this day)
  const selectedEventId = useMemo(() => {
    if (!selectedBookingUid) return undefined;
    const matchingEvent = dayEvents.find((event) => event.options?.bookingUid === selectedBookingUid);
    return matchingEvent?.id;
  }, [dayEvents, selectedBookingUid]);

  // Scroll to the selected event when it changes
  useEffect(() => {
    if (selectedEventId === undefined) return;

    // Use requestAnimationFrame to ensure the DOM has updated
    requestAnimationFrame(() => {
      const eventElement = document.querySelector(`[data-calendar-event-id="${selectedEventId}"]`);
      if (eventElement) {
        eventElement.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    });
  }, [selectedEventId]);

  return (
    <>
      {dayEvents.map((event) => {
        const layout = layoutMap.get(event.id);
        if (!layout) return null;

        const calc = eventCalculations.get(event.id);
        if (!calc) return null;

        const { eventStart, eventDuration, eventStartDiff } = calc;

        const isHovered = hoveredEventId === event.id;
        const isSelected = selectedEventId === event.id;
        const isInHoveredGroup = hoveredGroupIndex !== null && layout.groupIndex === hoveredGroupIndex;
        const zIndex = isHovered || isSelected ? 79 : layout.baseZIndex;

        return (
          <div
            key={`${event.id}-${eventStart.toISOString()}`}
            className={classNames(
              "absolute transition-all duration-100 ease-out",
              event.options?.borderOnly && "pointer-events-none"
            )}
            data-testid={event.options?.["data-test-id"]}
            data-calendar-event-id={event.id}
            data-calendar-event-source={event.source}
            onMouseEnter={() => setHoveredEventId(event.id)}
            onMouseLeave={() => setHoveredEventId(null)}
            style={{
              left: `${layout.leftOffsetPercent}%`,
              width: `${layout.widthPercent}%`,
              zIndex,
              top: `calc(${eventStartDiff}*var(--one-minute-height))`,
              height: `max(15px, calc(${eventDuration}*var(--one-minute-height)))`,
              transform: isHovered || isSelected ? "scale(1.02)" : "scale(1)",
              opacity: hoveredGroupIndex !== null && !isHovered && isInHoveredGroup ? 0.6 : 1,
            }}>
            <Event
              event={event}
              day={day}
              eventDuration={eventDuration}
              onEventClick={eventOnClick}
              isHovered={isHovered}
              currentlySelectedEventId={selectedEventId}
            />
          </div>
        );
      })}
    </>
  );
}
