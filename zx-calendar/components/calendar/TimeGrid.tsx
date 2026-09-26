"use client";

import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check } from "../Icons";
import { layoutDays, type PlacedSegment } from "./layout";
import type { AllDayItem, CalEvent, CalendarHandlers } from "./types";
import {
  addMinutes,
  atMinutes,
  clamp,
  formatRange,
  hourLabel,
  isSameDay,
  minutesIntoDay,
  snapMinutes,
  startOfDay,
  toDateKey,
} from "@/lib/dates";

interface TimeGridProps extends CalendarHandlers {
  days: Date[];
  events: CalEvent[];
  allDay: AllDayItem[];
  editable: boolean;
  onDayClick?: (day: Date) => void;
  onSwipe?: (direction: 1 | -1) => void;
  initialScrollMinutes?: number;
}

type Interaction =
  | { kind: "move"; event: CalEvent; offsetMs: number; canDrag: boolean }
  | { kind: "resize"; event: CalEvent; canDrag: true }
  | { kind: "create"; anchor: Date; canDrag: boolean };

interface Pending {
  interaction: Interaction;
  pointerId: number;
  pointerType: string;
  x0: number;
  y0: number;
  x: number;
  y: number;
  active: boolean;
  timer?: number;
  preview?: { start: Date; end: Date };
}

const LONG_PRESS_MS = 260;
const MOUSE_SLOP = 4;
const TOUCH_SLOP = 8;
const EDGE = 40;

function snapDate(date: Date, step = 15): Date {
  return atMinutes(startOfDay(date), snapMinutes(minutesIntoDay(date), step));
}

function floorDate(date: Date, step: number): Date {
  return atMinutes(startOfDay(date), Math.floor(minutesIntoDay(date) / step) * step);
}

export function TimeGrid({
  days,
  events,
  allDay,
  editable,
  onEventClick,
  onEventChange,
  onCreate,
  onAllDayClick,
  onDayClick,
  onSwipe,
  initialScrollMinutes = 7 * 60,
}: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<Pending | null>(null);
  const rafRef = useRef<number | null>(null);
  const [preview, setPreview] = useState<{
    id: string | null;
    start: Date;
    end: Date;
    event?: CalEvent;
  } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [scrollbarWidth, setScrollbarWidth] = useState(0);

  const handlers = useRef({ onEventClick, onEventChange, onCreate });
  handlers.current = { onEventClick, onEventChange, onCreate };

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Scroll to the working day once, then leave the user's scroll position alone.
  const didInitialScroll = useRef(false);
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const cols = colsRef.current;
    if (!scroller || !cols) return;
    setScrollbarWidth(scroller.offsetWidth - scroller.clientWidth);
    if (didInitialScroll.current) return;
    didInitialScroll.current = true;
    const hourHeight = cols.getBoundingClientRect().height / 24;
    scroller.scrollTop = (initialScrollMinutes / 60) * hourHeight - 8;
  }, [initialScrollMinutes]);

  const layout = useMemo(() => layoutDays(days, events), [days, events]);

  const ghostLayout = useMemo(() => {
    if (!preview) return null;
    const ghost: CalEvent = preview.event
      ? { ...preview.event, start: preview.start, end: preview.end }
      : {
          id: "__create__",
          title: "New block",
          start: preview.start,
          end: preview.end,
          fill: "",
          ink: "",
          accent: "",
          draggable: false,
        };
    return layoutDays(days, [ghost]);
  }, [days, preview]);

  const pointerTime = useCallback(
    (x: number, y: number): Date => {
      const rect = colsRef.current?.getBoundingClientRect();
      if (!rect) return new Date();
      const dayIndex = clamp(Math.floor(((x - rect.left) / rect.width) * days.length), 0, days.length - 1);
      const minutes = clamp(((y - rect.top) / rect.height) * 1440, 0, 1440);
      return atMinutes(days[dayIndex], minutes);
    },
    [days]
  );

  const computePreview = useCallback(
    (p: Pending) => {
      const at = pointerTime(p.x, p.y);
      const it = p.interaction;
      if (it.kind === "move") {
        const duration = it.event.end.getTime() - it.event.start.getTime();
        const start = snapDate(new Date(at.getTime() - it.offsetMs));
        return { start, end: new Date(start.getTime() + duration) };
      }
      if (it.kind === "resize") {
        const minEnd = addMinutes(it.event.start, 15);
        const end = snapDate(at);
        return { start: it.event.start, end: end < minEnd ? minEnd : end };
      }
      const current = snapDate(at);
      if (current >= it.anchor) {
        const minEnd = addMinutes(it.anchor, 15);
        return { start: it.anchor, end: current < minEnd ? minEnd : current };
      }
      return { start: current, end: addMinutes(it.anchor, 15) };
    },
    [pointerTime]
  );

  const refreshPreview = useCallback(() => {
    const p = pendingRef.current;
    if (!p?.active) return;
    const next = computePreview(p);
    p.preview = next;
    const it = p.interaction;
    setPreview({
      id: it.kind === "create" ? null : it.event.id,
      start: next.start,
      end: next.end,
      event: it.kind === "create" ? undefined : it.event,
    });
  }, [computePreview]);


  const autoScroll = useCallback(() => {
    const p = pendingRef.current;
    const scroller = scrollRef.current;
    if (!p?.active || !scroller) return;
    const rect = scroller.getBoundingClientRect();
    let delta = 0;
    if (p.y < rect.top + EDGE) delta = -Math.ceil((rect.top + EDGE - p.y) / 4);
    else if (p.y > rect.bottom - EDGE) delta = Math.ceil((p.y - (rect.bottom - EDGE)) / 4);
    if (delta) {
      scroller.scrollTop += delta;
      refreshPreview();
    }
    rafRef.current = requestAnimationFrame(autoScroll);
  }, [refreshPreview]);

  const cleanup = useCallback(() => {
    const p = pendingRef.current;
    if (p?.timer) window.clearTimeout(p.timer);
    pendingRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    document.body.classList.remove("is-dragging");
    setPreview(null);
  }, []);

  const activate = useCallback(() => {
    const p = pendingRef.current;
    if (!p || p.active) return;
    p.active = true;
    document.body.classList.add("is-dragging");
    if (p.pointerType === "touch") navigator.vibrate?.(8);
    refreshPreview();
    rafRef.current = requestAnimationFrame(autoScroll);
  }, [autoScroll, refreshPreview]);

  const onWindowMove = useCallback(
    (e: PointerEvent) => {
      const p = pendingRef.current;
      if (!p || e.pointerId !== p.pointerId) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (!p.active) {
        const distance = Math.hypot(p.x - p.x0, p.y - p.y0);
        if (p.pointerType === "touch") {
          // Moving before the long-press fires means the user is scrolling.
          if (distance > TOUCH_SLOP) {
            if (p.timer) window.clearTimeout(p.timer);
            p.timer = undefined;
            p.interaction = { ...p.interaction, canDrag: false } as Interaction;
          }
          return;
        }
        if (distance > MOUSE_SLOP && p.interaction.canDrag) activate();
        return;
      }
      refreshPreview();
    },
    [activate, refreshPreview]
  );

  const onWindowUp = useCallback(
    (e: PointerEvent) => {
      const p = pendingRef.current;
      if (!p || e.pointerId !== p.pointerId) return;
      const it = p.interaction;
      const { onEventClick: click, onEventChange: change, onCreate: create } = handlers.current;
      const moved = Math.hypot(e.clientX - p.x0, e.clientY - p.y0);

      if (p.active && p.preview) {
        if (it.kind === "create") {
          create?.(p.preview.start, p.preview.end);
        } else if (
          p.preview.start.getTime() !== it.event.start.getTime() ||
          p.preview.end.getTime() !== it.event.end.getTime()
        ) {
          change?.(it.event.id, p.preview.start, p.preview.end);
        }
      } else if (!p.active && moved <= (p.pointerType === "touch" ? TOUCH_SLOP : MOUSE_SLOP * 2)) {
        const at = pointerTime(e.clientX, e.clientY);
        if (it.kind === "create") {
          const start = floorDate(at, 30);
          create?.(start, addMinutes(start, 60));
        } else {
          click?.(it.event, at);
        }
      }
      cleanup();
    },
    [cleanup, pointerTime]
  );

  const onWindowCancel = useCallback(
    (e: PointerEvent) => {
      if (pendingRef.current?.pointerId === e.pointerId) cleanup();
    },
    [cleanup]
  );

  useEffect(() => {
    window.addEventListener("pointermove", onWindowMove);
    window.addEventListener("pointerup", onWindowUp);
    window.addEventListener("pointercancel", onWindowCancel);
    return () => {
      window.removeEventListener("pointermove", onWindowMove);
      window.removeEventListener("pointerup", onWindowUp);
      window.removeEventListener("pointercancel", onWindowCancel);
    };
  }, [onWindowMove, onWindowUp, onWindowCancel]);

  // A non-passive touchmove listener is the only reliable way to stop the page
  // from scrolling once a long-press drag has started on touch devices.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const block = (e: TouchEvent) => {
      if (pendingRef.current?.active) e.preventDefault();
    };
    scroller.addEventListener("touchmove", block, { passive: false });
    return () => scroller.removeEventListener("touchmove", block);
  }, []);

  // Horizontal swipe to change period on touch screens.
  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !onSwipe) return;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      swipeRef.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
    };
    const end = (e: TouchEvent) => {
      const s = swipeRef.current;
      swipeRef.current = null;
      if (!s || pendingRef.current?.active) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Date.now() - s.t < 600 && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        onSwipe(dx < 0 ? 1 : -1);
      }
    };
    scroller.addEventListener("touchstart", start, { passive: true });
    scroller.addEventListener("touchend", end, { passive: true });
    return () => {
      scroller.removeEventListener("touchstart", start);
      scroller.removeEventListener("touchend", end);
    };
  }, [onSwipe]);

  const begin = (e: ReactPointerEvent, interaction: Interaction, immediate = false) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (pendingRef.current) cleanup();
    const p: Pending = {
      interaction,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      active: false,
    };
    pendingRef.current = p;
    if (!interaction.canDrag) return;
    if (immediate) {
      activate();
    } else if (e.pointerType === "touch") {
      p.timer = window.setTimeout(activate, LONG_PRESS_MS);
    }
  };

  const onEventPointerDown = (e: ReactPointerEvent, event: CalEvent) => {
    e.stopPropagation();
    const at = pointerTime(e.clientX, e.clientY);
    begin(e, {
      kind: "move",
      event,
      offsetMs: at.getTime() - event.start.getTime(),
      canDrag: editable && event.draggable,
    });
  };

  const onResizePointerDown = (e: ReactPointerEvent, event: CalEvent) => {
    e.stopPropagation();
    begin(e, { kind: "resize", event, canDrag: true }, e.pointerType === "touch");
  };

  const onColumnPointerDown = (e: ReactPointerEvent) => {
    if (!editable || e.target !== e.currentTarget) return;
    const anchor = floorDate(pointerTime(e.clientX, e.clientY), 15);
    begin(e, { kind: "create", anchor, canDrag: true });
  };

  const onEventKey = (e: ReactKeyboardEvent, event: CalEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onEventClick?.(event, null);
    }
  };

  const tasksByDay = useMemo(() => {
    const map = new Map<string, AllDayItem[]>();
    for (const item of allDay) {
      const list = map.get(item.dateKey) ?? [];
      list.push(item);
      map.set(item.dateKey, list);
    }
    return map;
  }, [allDay]);
  const hasAllDay = days.some((d) => tasksByDay.has(toDateKey(d)));

  const gridStyle = { "--days": days.length, "--sbw": `${scrollbarWidth}px` } as CSSProperties;

  return (
    <div className="tg" style={gridStyle}>
      <div className="tg-head">
        <div />
        {days.map((day) => {
          const today = isSameDay(day, now);
          const label = day.toLocaleDateString(undefined, { weekday: "short" });
          const content = (
            <>
              <span>{label}</span>
              <span className="tg-daynum">{day.getDate()}</span>
            </>
          );
          return onDayClick && days.length > 1 ? (
            <button
              key={day.toISOString()}
              type="button"
              className={`tg-dayhead${today ? " today" : ""}`}
              onClick={() => onDayClick(day)}
              aria-label={`Open ${day.toDateString()}`}>
              {content}
            </button>
          ) : (
            <div key={day.toISOString()} className={`tg-dayhead${today ? " today" : ""}`}>
              {content}
            </div>
          );
        })}
        {hasAllDay && (
          <>
            <div className="tg-allday-label">tasks</div>
            <div className="tg-allday" style={{ gridColumn: "2 / -1" }}>
              {days.map((day) => (
                <div key={day.toISOString()} className="tg-allday-cell">
                  {(tasksByDay.get(toDateKey(day)) ?? []).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`task-chip${item.done ? " done" : ""}`}
                      onClick={() => onAllDayClick?.(item.id)}
                      title={item.title}>
                      {item.done && <Check size={11} />}
                      <span>{item.title}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="tg-scroll" ref={scrollRef}>
        <div className="tg-body">
          <div className="tg-gutter">
            {Array.from({ length: 23 }, (_, i) => i + 1).map((hour) => (
              <span key={hour} className="tg-hour" style={{ top: `calc(var(--hour-h) * ${hour})` }}>
                {hourLabel(hour)}
              </span>
            ))}
          </div>
          <div className="tg-cols" ref={colsRef}>
            {days.map((day, dayIndex) => {
              const today = isSameDay(day, now);
              const weekend = day.getDay() === 0 || day.getDay() === 6;
              return (
                // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only affordance; keyboard users create blocks with the New button.
                <div
                  key={day.toISOString()}
                  className={`tg-col${today ? " today" : ""}${weekend ? " weekend" : ""}`}
                  onPointerDown={onColumnPointerDown}
                  onContextMenu={(e) => e.preventDefault()}>
                  {layout[dayIndex].map((seg) => (
                    <EventBlock
                      key={`${seg.event.id}-${dayIndex}`}
                      seg={seg}
                      dimmed={preview?.id === seg.event.id}
                      editable={editable}
                      onPointerDown={onEventPointerDown}
                      onResizePointerDown={onResizePointerDown}
                      onKeyDown={onEventKey}
                    />
                  ))}
                  {ghostLayout?.[dayIndex].map((seg) => (
                    <EventBlock
                      key={`ghost-${dayIndex}`}
                      seg={{ ...seg, column: 0, columns: 1 }}
                      ghost
                      editable={false}
                    />
                  ))}
                  {today && (
                    <div
                      className="now-line"
                      style={{ top: `calc(var(--hour-h) * ${minutesIntoDay(now) / 60})` }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

interface EventBlockProps {
  seg: PlacedSegment;
  editable: boolean;
  dimmed?: boolean;
  ghost?: boolean;
  onPointerDown?: (e: ReactPointerEvent, event: CalEvent) => void;
  onResizePointerDown?: (e: ReactPointerEvent, event: CalEvent) => void;
  onKeyDown?: (e: ReactKeyboardEvent, event: CalEvent) => void;
}

function EventBlock({
  seg,
  editable,
  dimmed,
  ghost,
  onPointerDown,
  onResizePointerDown,
  onKeyDown,
}: EventBlockProps) {
  const { event } = seg;
  const minutes = seg.bottom - seg.top;
  const compact = minutes < 45;
  const isCreate = event.id === "__create__";
  const canDrag = editable && event.draggable;
  const durationLabel = formatRange(event.start, event.end);
  const inset = !ghost && !event.background && seg.overBackground ? 14 : 3;

  const style = {
    top: `calc(var(--hour-h) * ${seg.top / 60} + 1px)`,
    height: `max(calc(var(--hour-h) * ${minutes / 60} - 3px), 18px)`,
    left: `calc(${(seg.column / seg.columns) * 100}% + ${inset}px)`,
    width: `calc(${100 / seg.columns}% - ${inset + 3}px)`,
    background: isCreate ? undefined : event.fill,
    color: isCreate ? undefined : event.ink,
    "--accent": event.accent,
    borderTopLeftRadius: seg.continuesBefore ? 4 : undefined,
    borderTopRightRadius: seg.continuesBefore ? 4 : undefined,
    borderBottomLeftRadius: seg.continuesAfter ? 4 : undefined,
    borderBottomRightRadius: seg.continuesAfter ? 4 : undefined,
  } as CSSProperties;

  const className = [
    "ev",
    compact && "compact",
    canDrag && "draggable",
    dimmed && "dimmed",
    ghost && "ghost",
    isCreate && "create-ghost",
    event.variant === "booked" && "booked",
    event.background && !ghost && "background",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      role={ghost ? undefined : "button"}
      tabIndex={ghost ? undefined : 0}
      aria-label={ghost ? undefined : `${event.title}, ${durationLabel}`}
      className={className}
      style={style}
      onPointerDown={onPointerDown ? (e) => onPointerDown(e, event) : undefined}
      onKeyDown={onKeyDown ? (e) => onKeyDown(e, event) : undefined}
      onContextMenu={(e) => e.preventDefault()}>
      <span className="ev-title">{event.title}</span>
      <span className="ev-time">{durationLabel}</span>
      {!compact && event.subtitle && minutes >= 75 && <span className="ev-sub">{event.subtitle}</span>}
      {canDrag && !ghost && !seg.continuesAfter && (
        <span className="ev-resize" onPointerDown={(e) => onResizePointerDown?.(e, event)} />
      )}
    </div>
  );
}
