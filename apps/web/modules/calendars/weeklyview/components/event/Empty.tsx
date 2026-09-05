import { useMemo } from "react";
import { shallow } from "zustand/shallow";

import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import { useTimePreferences } from "@calcom/features/bookings/lib";
import classNames from "@calcom/ui/classNames";

import { OutOfOfficeInSlots } from "@calcom/web/modules/bookings/components/OutOfOfficeInSlots";
import { useCalendarStore } from "@calcom/features/calendars/weeklyview/state/store";
import type { CalendarAvailableTimeslots } from "@calcom/features/calendars/weeklyview/types/state";
import type { GridCellToDateProps } from "@calcom/features/calendars/weeklyview/utils";
import { gridCellToDateTime } from "@calcom/features/calendars/weeklyview/utils";

type EmptyCellProps = GridCellToDateProps & {
};

export function EmptyCell(props: EmptyCellProps) {
  const cellToDate = gridCellToDateTime({
    day: props.day,
    gridCellIdx: props.gridCellIdx,
    totalGridCells: props.totalGridCells,
    selectionLength: props.selectionLength,
    startHour: props.startHour,
    timezone: props.timezone,
  });

  const minutesFromStart = (cellToDate.hour() - props.startHour) * 60 + cellToDate.minute();

  return <Cell topOffsetMinutes={minutesFromStart} timeSlot={dayjs(cellToDate).tz(props.timezone)} />;
}

type AvailableCellProps = {
  timezone: string;
  availableSlots: CalendarAvailableTimeslots;
  day: GridCellToDateProps["day"];
  startHour: GridCellToDateProps["startHour"];
};

export function AvailableCellsForDay({ timezone, availableSlots, day, startHour }: AvailableCellProps) {
  const date = dayjs(day);
  const dateFormatted = date.format("YYYY-MM-DD");
  const slotsForToday = availableSlots && availableSlots[dateFormatted];

  const slots = useMemo(() => {
    const calculatedSlots: {
      slot: CalendarAvailableTimeslots[string][number];
      topOffsetMinutes: number;
      firstSlot?: CalendarAvailableTimeslots[string][number];
      timezone?: string;
    }[] = [];

    // first and last slot for ooo to display range correctly in week view
    let firstSlotIndex = -1;
    let lastSlotIndex = -1;
    let areAllSlotsAway = true;
    let startEndTimeDuration = 0;

    slotsForToday?.forEach((slot, index) => {
      const startTime = dayjs(slot.start).tz(timezone);
      const topOffsetMinutes = (startTime.hour() - startHour) * 60 + startTime.minute();
      calculatedSlots.push({ slot, topOffsetMinutes });

      if (!slot.away) {
        areAllSlotsAway = false;
      } else {
        if (firstSlotIndex === -1) {
          firstSlotIndex = index;
        }
        lastSlotIndex = index;
      }
    });

    if (areAllSlotsAway && firstSlotIndex !== -1) {
      const firstSlot = slotsForToday[firstSlotIndex];
      const lastSlot = slotsForToday[lastSlotIndex];
      startEndTimeDuration = dayjs(lastSlot.end).diff(dayjs(firstSlot.start), "minutes");

      if (firstSlot.toUser == null && !firstSlot.showNotePublicly) {
        return null;
      }

      // This will return null if all slots are away and the first slot has no user
      return {
        slots: calculatedSlots,
        startEndTimeDuration,
        firstSlot,
        timezone,
      };
    }

    return { slots: calculatedSlots, startEndTimeDuration };
  }, [slotsForToday, startHour, timezone]);

  if (slots === null) return null;

  if (slots.startEndTimeDuration) {
    const { firstSlot, startEndTimeDuration } = slots;
    return (
      <CustomCell
        timeSlot={dayjs(firstSlot?.start).tz(slots.timezone)}
        topOffsetMinutes={slots.slots[0]?.topOffsetMinutes}
        startEndTimeDuration={startEndTimeDuration}>
        <OutOfOfficeInSlots
          fromUser={firstSlot?.fromUser}
          toUser={firstSlot?.toUser}
          reason={firstSlot?.reason}
          emoji={firstSlot?.emoji}
          notes={firstSlot?.notes}
          showNotePublicly={firstSlot?.showNotePublicly}
          borderDashed={false}
          date={dateFormatted}
          className="pb-0"
        />
      </CustomCell>
    );
  }

  return (
    <>
      {slots.slots.map((slot, index) => (
        <Cell
          key={index}
          timeSlot={dayjs(slot.slot.start).tz(timezone)}
          topOffsetMinutes={slot.topOffsetMinutes}
        />
      ))}
    </>
  );
}

type CellProps = {
  topOffsetMinutes?: number;
  timeSlot: Dayjs;
};

function Cell({ topOffsetMinutes, timeSlot }: CellProps) {
  const { timeFormat } = useTimePreferences();

  const { onEmptyCellClick, hoverEventDuration } = useCalendarStore(
    (state) => ({
      onEmptyCellClick: state.onEmptyCellClick,
      hoverEventDuration: state.hoverEventDuration,
    }),
    shallow
  );

  return (
    <div
      className={classNames(
        "group flex w-[calc(100%-1px)] items-center justify-center",
        "bg-default dark:bg-cal-muted",
        topOffsetMinutes && "absolute"
      )}
      data-slot={timeSlot.toISOString()}
      data-testid="calendar-empty-cell"
      style={{
        height: `calc(${hoverEventDuration}*var(--one-minute-height))`,
        overflow: "visible",
        top: topOffsetMinutes ? `calc(${topOffsetMinutes}*var(--one-minute-height))` : undefined,
      }}
      onClick={() => {
        onEmptyCellClick?.(timeSlot.toDate());
      }}>
      {hoverEventDuration !== 0 && (
        <div
          className={classNames(
            "bg-brand-default hover:bg-brand-default text-brand dark:border-emphasis absolute hidden rounded-[4px] p-[6px] text-xs font-semibold leading-5 group-hover:flex group-hover:cursor-pointer",
            hoverEventDuration && hoverEventDuration > 15 && "items-start pt-3",
            hoverEventDuration && hoverEventDuration < 15 && "items-center"
          )}
          style={{
            height: `calc(${hoverEventDuration}*var(--one-minute-height) - 2px)`,
            zIndex: 80,
            // @TODO: This used to be 90% as per Sean's work. I think this was needed when
            // multiple events are stacked next to each other. We might need to add this back later.
            width: "calc(100% - 2px)",
          }}>
          <div className="text-ellipsis leading-0">{timeSlot.format(timeFormat)}</div>
        </div>
      )}
    </div>
  );
}

function CustomCell({
  timeSlot,
  children,
  topOffsetMinutes,
  startEndTimeDuration,
}: CellProps & { children: React.ReactNode; startEndTimeDuration?: number }) {
  return (
    <div
      className={classNames(
        "bg-default dark:bg-cal-muted group absolute z-65 flex w-[calc(100%-1px)] items-center justify-center"
      )}
      data-slot={timeSlot.toISOString()}
      style={{
        top: topOffsetMinutes ? `calc(${topOffsetMinutes}*var(--one-minute-height))` : undefined,
        overflow: "visible",
      }}>
      <div
        className={classNames(
          "dark:border-emphasis bg-default dark:bg-cal-muted cursor-pointer rounded-[4px] p-[6px] text-xs font-semibold dark:text-white"
        )}
        style={{
          height: `calc(${startEndTimeDuration}*var(--one-minute-height) - 2px)`,
          width: "calc(100% - 2px)",
        }}>
        {children}
      </div>
    </div>
  );
}
