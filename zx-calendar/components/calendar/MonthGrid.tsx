"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AllDayItem, CalEvent, CalendarHandlers } from "./types";
import {
  addDays,
  formatTime,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  toDateKey,
} from "@/lib/dates";

interface MonthGridProps extends CalendarHandlers {
  date: Date;
  events: CalEvent[];
  allDay: AllDayItem[];
  editable: boolean;
  onDayClick: (day: Date) => void;
}

const MAX_CHIPS = 3;
const LONG_PRESS_MS = 300;

export function MonthGrid({
  date,
  events,
  allDay,
  editable,
  onDayClick,
  onEventClick,
  onEventChange,
}: MonthGridProps) {
  const firstTime = startOfWeek(startOfMonth(date)).getTime();
  const days = useMemo(
    () => Array.from({ length: 42 }, (_, i) => addDays(new Date(firstTime), i)),
    [firstTime]
  );
  const today = new Date();

  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
    for (const ev of sorted) {
      // Show multi-day events on each day they touch.
      for (let d = startOfDay(ev.start); d < ev.end; d = addDays(d, 1)) {
        const key = toDateKey(d);
        const list = map.get(key) ?? [];
        list.push(ev);
        map.set(key, list);
      }
    }
    return map;
  }, [events]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of allDay) map.set(t.dateKey, (map.get(t.dateKey) ?? 0) + 1);
    return map;
  }, [allDay]);

  const drag = useRef<{
    event: CalEvent;
    pointerId: number;
    x0: number;
    y0: number;
    active: boolean;
    timer?: number;
    touch: boolean;
    target: string | null;
  } | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    const keyAt = (x: number, y: number) =>
      (document.elementFromPoint(x, y)?.closest("[data-date]") as HTMLElement | null)?.dataset.date ?? null;

    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || d.pointerId !== e.pointerId) return;
      const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
      if (!d.active) {
        if (d.touch) {
          if (dist > 8 && d.timer) {
            window.clearTimeout(d.timer);
            d.timer = undefined;
          }
          return;
        }
        if (dist > 4) {
          d.active = true;
          setDraggingId(d.event.id);
          document.body.classList.add("is-dragging");
        } else return;
      }
      d.target = keyAt(e.clientX, e.clientY);
      setDropKey(d.target);
    };
    const finish = (e: PointerEvent, cancelled: boolean) => {
      const d = drag.current;
      if (!d || d.pointerId !== e.pointerId) return;
      if (d.timer) window.clearTimeout(d.timer);
      drag.current = null;
      document.body.classList.remove("is-dragging");
      setDropKey(null);
      setDraggingId(null);
      if (cancelled) return;
      if (d.active && d.target) {
        const [y, m, day] = d.target.split("-").map(Number);
        const from = startOfDay(d.event.start);
        const to = new Date(y, m - 1, day);
        const shiftDays = Math.round((to.getTime() - from.getTime()) / 86_400_000);
        if (shiftDays) {
          onEventChange?.(d.event.id, addDays(d.event.start, shiftDays), addDays(d.event.end, shiftDays));
        }
      } else if (!d.active && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) {
        onEventClick?.(d.event, null);
      }
    };
    const up = (e: PointerEvent) => finish(e, false);
    const cancel = (e: PointerEvent) => finish(e, true);
    const block = (e: TouchEvent) => {
      if (drag.current?.active) e.preventDefault();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("touchmove", block, { passive: false });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("touchmove", block);
    };
  }, [onEventChange, onEventClick]);

  const onChipDown = (e: ReactPointerEvent, event: CalEvent) => {
    e.stopPropagation();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const canDrag = editable && event.draggable;
    const d = {
      event,
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      active: false,
      touch: e.pointerType === "touch",
      target: null as string | null,
      timer: undefined as number | undefined,
    };
    if (!canDrag) {
      // Only clicks allowed: never activates.
      d.touch = true;
    } else if (d.touch) {
      d.timer = window.setTimeout(() => {
        d.active = true;
        navigator.vibrate?.(8);
        setDraggingId(event.id);
      }, LONG_PRESS_MS);
    }
    drag.current = d;
  };

  const weekdayLabels = days.slice(0, 7).map((d) => d.toLocaleDateString(undefined, { weekday: "short" }));

  return (
    <div className="mg">
      <div className="mg-head">
        {weekdayLabels.map((l) => (
          <div key={l}>{l}</div>
        ))}
      </div>
      <div className="mg-grid" style={{ gridTemplateRows: "repeat(6, minmax(0, 1fr))" }}>
        {days.map((day) => {
          const key = toDateKey(day);
          const list = byDay.get(key) ?? [];
          const tasks = tasksByDay.get(key) ?? 0;
          const outside = day.getMonth() !== date.getMonth();
          return (
            // biome-ignore lint/a11y/useSemanticElements: contains interactive chips, so it can't be a <button>.
            <div
              key={key}
              role="button"
              tabIndex={0}
              data-date={key}
              className={`mg-cell${outside ? " outside" : ""}${isSameDay(day, today) ? " today" : ""}${
                dropKey === key ? " drop-target" : ""
              }`}
              onClick={() => onDayClick(day)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onDayClick(day);
              }}
              aria-label={`${day.toDateString()}, ${list.length} items`}>
              <span className="mg-date">{day.getDate()}</span>
              {list.slice(0, MAX_CHIPS).map((ev) => (
                <div
                  key={ev.id}
                  className="mg-chip"
                  style={{ background: ev.fill, color: ev.ink, opacity: draggingId === ev.id ? 0.4 : 1 }}
                  onPointerDown={(e) => onChipDown(e, ev)}
                  onClick={(e) => e.stopPropagation()}
                  onContextMenu={(e) => e.preventDefault()}
                  title={`${formatTime(ev.start)} ${ev.title}`}>
                  <span>
                    {formatTime(ev.start)} {ev.title}
                  </span>
                </div>
              ))}
              {list.length > MAX_CHIPS && <span className="mg-more">+{list.length - MAX_CHIPS} more</span>}
              {tasks > 0 && list.length <= MAX_CHIPS && (
                <span className="mg-more">
                  {tasks} task{tasks > 1 ? "s" : ""}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
