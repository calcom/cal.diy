"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../AppShell";
import { Calendar } from "../calendar/Calendar";
import type { CalEvent, ViewMode } from "../calendar/types";
import { Calendar as CalendarIcon, ListIcon, Lock, Refresh } from "../Icons";
import { useToast } from "../Toasts";
import { BookingFlow } from "./BookingFlow";
import { api } from "@/lib/api";
import {
  BOOKING_DURATIONS,
  type Interval,
  MIN_NOTICE_MINUTES,
  openWindows,
  subtractIntervals,
} from "@/lib/availability";
import { BOOKING_STYLE, CATEGORIES } from "@/lib/categories";
import { addDays, formatDuration, formatRange, MINUTE, startOfDay, toDateKey } from "@/lib/dates";
import type { PublicAvailability } from "@/lib/types";

const toInterval = (b: { start: string; end: string }): Interval => ({
  start: Date.parse(b.start),
  end: Date.parse(b.end),
});

function dayHeading(date: Date): string {
  const today = startOfDay(new Date());
  const diff = Math.round((startOfDay(date).getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function TeamApp() {
  const toast = useToast();
  const [availability, setAvailability] = useState<PublicAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("week");
  const [date, setDate] = useState(() => new Date());
  const [mobileMode, setMobileMode] = useState<"list" | "calendar">("list");
  const [duration, setDuration] = useState<number>(30);
  const [selected, setSelected] = useState<{ window: Interval; at: number | null } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (window.matchMedia("(max-width: 899px)").matches) setView("3day");
  }, []);

  const load = useCallback(async () => {
    try {
      setAvailability(await api<PublicAvailability>("/api/availability"));
      setNow(Date.now());
    } catch {
      toast.show("Couldn't load availability", { tone: "error" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const windows = useMemo(() => {
    if (!availability) return [];
    return openWindows(
      availability.free.map(toInterval),
      availability.booked.map(toInterval),
      now + MIN_NOTICE_MINUTES * MINUTE
    ).filter((w) => w.end - w.start >= BOOKING_DURATIONS[0] * MINUTE);
  }, [availability, now]);

  const events = useMemo<CalEvent[]>(() => {
    if (!availability) return [];
    const free = CATEGORIES.free;
    const open = windows.map<CalEvent>((w) => ({
      id: `open-${w.start}`,
      title: "Open",
      subtitle: `${formatDuration((w.end - w.start) / MINUTE)} free · tap to book`,
      start: new Date(w.start),
      end: new Date(w.end),
      fill: free.fill,
      ink: free.ink,
      accent: free.accent,
      draggable: false,
    }));
    // Only reveal bookings that sit inside free time; everything else stays private.
    const freeIntervals = availability.free.map(toInterval);
    const bookedInFree = availability.booked
      .map(toInterval)
      .filter((b) => b.end > now)
      .flatMap((b) => {
        const outside = subtractIntervals([b], freeIntervals);
        return subtractIntervals([b], outside);
      });
    const booked = bookedInFree.map<CalEvent>((b) => ({
      id: `booked-${b.start}`,
      title: "Booked",
      start: new Date(b.start),
      end: new Date(b.end),
      fill: BOOKING_STYLE.fill,
      ink: BOOKING_STYLE.ink,
      accent: "rgba(171, 210, 250, 0.4)",
      draggable: false,
      variant: "booked",
    }));
    return [...open, ...booked];
  }, [availability, windows, now]);

  const grouped = useMemo(() => {
    const horizon = addDays(startOfDay(new Date(now)), 21).getTime();
    const map = new Map<string, Interval[]>();
    for (const w of windows) {
      if (w.start >= horizon) break;
      const key = toDateKey(new Date(w.start));
      map.set(key, [...(map.get(key) ?? []), w]);
    }
    return [...map.entries()];
  }, [windows, now]);

  const openFor = useCallback(
    (ev: CalEvent, at: Date | null) => {
      if (!ev.id.startsWith("open-")) return;
      const w = windows.find((x) => x.start === ev.start.getTime());
      if (w) setSelected({ window: w, at: at?.getTime() ?? null });
    },
    [windows]
  );

  const totalMinutes = windows.reduce((sum, w) => sum + (w.end - w.start) / MINUTE, 0);

  const list = (
    <div style={{ display: "grid", gap: 2 }}>
      {loading &&
        [0, 1, 2].map((i) => <div key={i} className="shimmer" style={{ height: 60, marginBottom: 6 }} />)}
      {!loading && grouped.length === 0 && (
        <div className="empty">
          <CalendarIcon size={28} />
          No open time right now. Check back soon — Z updates the schedule often.
        </div>
      )}
      {grouped.map(([key, items]) => (
        <div key={key} className="window-day rise">
          <h3>{dayHeading(new Date(items[0].start))}</h3>
          {items.map((w) => {
            const start = new Date(w.start);
            return (
              <button
                key={w.start}
                type="button"
                className="window-btn"
                onClick={() => setSelected({ window: w, at: null })}>
                <span className="window-icon">{start.getDate()}</span>
                <span>
                  <strong>{formatRange(start, new Date(w.end))}</strong>
                  <small>{start.toLocaleDateString(undefined, { weekday: "long" })}</small>
                </span>
                <span className="go">
                  {formatDuration((w.end - w.start) / MINUTE)}
                  <small style={{ display: "block", fontWeight: 400 }}>open</small>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );

  const windowsCard = (
    <section className="card card-pad">
      <div className="card-head">
        <div>
          <p className="eyebrow">Next 3 weeks</p>
          <h2 className="card-title">Open windows</h2>
        </div>
      </div>
      <DurationPicker value={duration} onChange={setDuration} />
      <div style={{ marginTop: 6 }}>{list}</div>
    </section>
  );

  return (
    <AppShell
      active="/team"
      aside={
        <>
          <TeamHero totalMinutes={totalMinutes} />
          {windowsCard}
        </>
      }
      railCard={
        <>
          <strong>Are you Z or XOE?</strong>
          <p>Edit the schedule in the admin view.</p>
          <a className="btn btn-primary btn-sm" href="/executive">
            <Lock size={14} /> Admin login
          </a>
        </>
      }
      overlays={
        <>
          <nav className="dock mobile-only" aria-label="Team view mode">
            <button
              type="button"
              className="icon-btn"
              aria-pressed={mobileMode === "list"}
              aria-label="List of open times"
              onClick={() => setMobileMode("list")}>
              <ListIcon />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-pressed={mobileMode === "calendar"}
              aria-label="Calendar"
              onClick={() => setMobileMode("calendar")}>
              <CalendarIcon />
            </button>
            <button type="button" className="icon-btn" aria-label="Refresh" onClick={load}>
              <Refresh />
            </button>
          </nav>
          <BookingFlow
            openWindow={selected?.window ?? null}
            initialStart={selected?.at}
            duration={duration}
            onDurationChange={setDuration}
            onClose={() => setSelected(null)}
            onBooked={load}
            onConflict={load}
          />
        </>
      }>
      {mobileMode === "list" && (
        <div className="mobile-only" style={{ overflowY: "auto", minHeight: 0, flex: 1 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <TeamHero totalMinutes={totalMinutes} compact />
            {windowsCard}
          </div>
        </div>
      )}
      <div
        className={mobileMode === "calendar" ? "" : "desktop-only"}
        style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Calendar
          events={events}
          view={view}
          onViewChange={setView}
          date={date}
          onDateChange={setDate}
          editable={false}
          onEventClick={openFor}
          toolbarExtra={
            <button
              type="button"
              className="icon-btn sm desktop-only"
              onClick={load}
              aria-label="Refresh availability">
              <Refresh size={16} />
            </button>
          }
        />
      </div>
    </AppShell>
  );
}

function DurationPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="segmented" role="group" aria-label="Call length">
      {BOOKING_DURATIONS.map((m) => (
        <button key={m} type="button" aria-pressed={value === m} onClick={() => onChange(m)}>
          {m}m
        </button>
      ))}
    </div>
  );
}

function TeamHero({ totalMinutes, compact }: { totalMinutes: number; compact?: boolean }) {
  const hours = Math.round(totalMinutes / 6) / 10;
  return (
    <section className="card card-feature card-pad team-hero">
      <p className="eyebrow">Team booking</p>
      <h1>
        Grab time with
        <br />Z &amp; XOE
      </h1>
      {!compact && (
        <p>
          Only Z&apos;s free time shows here. Pick a window and a length — the invite goes straight to Z, XOE
          and you.
        </p>
      )}
      <div className="hero-foot">
        <div className="avatars">
          <span className="avatar">Z</span>
          <span className="avatar">X</span>
        </div>
        <div className="stat" style={{ textAlign: "right" }}>
          <span className="stat-value" style={{ fontSize: compact ? 24 : 30 }}>
            {hours % 1 === 0 ? hours : hours.toFixed(1)}
            <small style={{ color: "rgba(255,255,255,0.75)" }}>h open</small>
          </span>
        </div>
      </div>
    </section>
  );
}
