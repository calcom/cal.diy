"use client";

import { type ReactNode, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "../Icons";
import { MonthGrid } from "./MonthGrid";
import { TimeGrid } from "./TimeGrid";
import type { AllDayItem, CalEvent, CalendarHandlers, ViewMode } from "./types";
import { addDays, startOfDay, startOfMonth, startOfWeek } from "@/lib/dates";

interface CalendarProps extends CalendarHandlers {
  events: CalEvent[];
  allDay?: AllDayItem[];
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  date: Date;
  onDateChange: (date: Date) => void;
  editable: boolean;
  toolbarExtra?: ReactNode;
  overlay?: ReactNode;
}

const VIEWS: { id: ViewMode; label: string; short: string }[] = [
  { id: "day", label: "Day", short: "D" },
  { id: "3day", label: "3 Day", short: "3D" },
  { id: "week", label: "Week", short: "W" },
  { id: "month", label: "Month", short: "M" },
];

export function visibleDays(view: ViewMode, date: Date): Date[] {
  if (view === "day") return [startOfDay(date)];
  if (view === "3day") return [0, 1, 2].map((i) => addDays(startOfDay(date), i));
  const monday = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function visibleRange(view: ViewMode, date: Date): { from: Date; to: Date } {
  if (view === "month") {
    const from = startOfWeek(startOfMonth(date));
    return { from, to: addDays(from, 42) };
  }
  const days = visibleDays(view, date);
  return { from: days[0], to: addDays(days[days.length - 1], 1) };
}

function shift(view: ViewMode, date: Date, direction: 1 | -1): Date {
  if (view === "day") return addDays(date, direction);
  if (view === "3day") return addDays(date, 3 * direction);
  if (view === "week") return addDays(date, 7 * direction);
  return new Date(date.getFullYear(), date.getMonth() + direction, 1);
}

function title(view: ViewMode, date: Date): ReactNode {
  if (view === "month") {
    return (
      <>
        <b>{date.toLocaleDateString(undefined, { month: "long" })}</b> {date.getFullYear()}
      </>
    );
  }
  const days = visibleDays(view, date);
  const first = days[0];
  const last = days[days.length - 1];
  if (view === "day") {
    return (
      <>
        <b>{first.toLocaleDateString(undefined, { weekday: "short" })}</b>{" "}
        {first.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
      </>
    );
  }
  const sameMonth = first.getMonth() === last.getMonth();
  return (
    <>
      <b>{first.toLocaleDateString(undefined, { month: "short" })}</b> {first.getDate()} –{" "}
      {sameMonth ? "" : `${last.toLocaleDateString(undefined, { month: "short" })} `}
      {last.getDate()}
    </>
  );
}

export function Calendar({
  events,
  allDay = [],
  view,
  onViewChange,
  date,
  onDateChange,
  editable,
  toolbarExtra,
  overlay,
  ...handlers
}: CalendarProps) {
  const days = useMemo(() => visibleDays(view, date), [view, date]);
  const go = useCallback(
    (direction: 1 | -1) => onDateChange(shift(view, date, direction)),
    [view, date, onDateChange]
  );
  const openDay = useCallback(
    (day: Date) => {
      onDateChange(day);
      onViewChange("day");
    },
    [onDateChange, onViewChange]
  );

  return (
    <section className="card cal" aria-label="Calendar">
      <div className="cal-toolbar">
        <button
          type="button"
          className="btn btn-soft btn-sm desktop-only"
          onClick={() => onDateChange(new Date())}>
          Today
        </button>
        <button type="button" className="icon-btn sm" onClick={() => go(-1)} aria-label="Previous">
          <ChevronLeft />
        </button>
        <button type="button" className="icon-btn sm" onClick={() => go(1)} aria-label="Next">
          <ChevronRight />
        </button>
        <h2 className="cal-title" aria-live="polite">
          <button type="button" onClick={() => onDateChange(new Date())} title="Jump to today">
            {title(view, date)}
          </button>
        </h2>
        <div style={{ flex: 1 }} className="desktop-only" />
        {toolbarExtra}
        <div className="segmented" role="group" aria-label="Calendar view">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => onViewChange(v.id)}>
              <span className="desktop-only">{v.label}</span>
              <span className="mobile-only">{v.short}</span>
            </button>
          ))}
        </div>
      </div>
      {overlay}
      {view === "month" ? (
        <MonthGrid
          date={date}
          events={events}
          allDay={allDay}
          editable={editable}
          onDayClick={openDay}
          {...handlers}
        />
      ) : (
        <TimeGrid
          key={view}
          days={days}
          events={events}
          allDay={allDay}
          editable={editable}
          onDayClick={openDay}
          onSwipe={go}
          {...handlers}
        />
      )}
    </section>
  );
}
