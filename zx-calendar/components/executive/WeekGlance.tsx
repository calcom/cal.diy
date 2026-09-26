"use client";

import { useMemo } from "react";
import { CATEGORIES, CATEGORY_ORDER, PALETTE } from "@/lib/categories";
import { addDays, HOUR, isSameDay, startOfWeek } from "@/lib/dates";
import type { Booking, CategoryId, ScheduleBlock, Task } from "@/lib/types";

interface WeekGlanceProps {
  date: Date;
  blocks: ScheduleBlock[];
  bookings: Booking[];
  tasks: Task[];
}

function fmtHours(h: number) {
  const rounded = Math.round(h * 10) / 10;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
}

function overlapHours(start: number, end: number, from: number, to: number) {
  const s = Math.max(start, from);
  const e = Math.min(end, to);
  return e > s ? (e - s) / HOUR : 0;
}

export function WeekGlance({ date, blocks, bookings, tasks }: WeekGlanceProps) {
  const stats = useMemo(() => {
    const monday = startOfWeek(date);
    const from = monday.getTime();
    const to = addDays(monday, 7).getTime();
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const dayBounds = days.map((d) => [d.getTime(), addDays(d, 1).getTime()] as const);

    const hours = Object.fromEntries(CATEGORY_ORDER.map((id) => [id, 0])) as Record<CategoryId, number>;
    const freeByDay = days.map(() => 0);
    for (const b of blocks) {
      const s = Date.parse(b.start);
      const e = Date.parse(b.end);
      if (e <= from || s >= to) continue;
      hours[b.category] += overlapHours(s, e, from, to);
      if (b.category !== "free") continue;
      dayBounds.forEach(([ds, de], i) => {
        freeByDay[i] += overlapHours(s, e, ds, de);
      });
    }
    const calls = bookings.filter((b) => Date.parse(b.start) >= from && Date.parse(b.start) < to).length;
    const openTasks = tasks.filter((t) => !t.done).length;
    const total = CATEGORY_ORDER.reduce((sum, id) => sum + hours[id], 0);
    return { days, hours, freeByDay, calls, openTasks, total };
  }, [date, blocks, bookings, tasks]);

  const maxFree = Math.max(1, ...stats.freeByDay);
  const today = new Date();

  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const arcs = CATEGORY_ORDER.filter((id) => stats.hours[id] > 0).map((id) => {
    const length = (stats.hours[id] / stats.total) * circumference;
    const arc = { id, length, offset };
    offset += length;
    return arc;
  });

  return (
    <section className="card card-pad" aria-label="This week at a glance">
      <p className="eyebrow">Free time this week</p>
      <div className="stat-value" style={{ marginTop: 8, fontSize: 36 }}>
        {fmtHours(stats.hours.free)}
        <small>hours</small>
      </div>
      <p className="muted" style={{ margin: "6px 0 0", fontSize: 11 }}>
        <span className="highlight">{stats.calls}</span> call{stats.calls === 1 ? "" : "s"} booked ·{" "}
        <span className="highlight">{stats.openTasks}</span> open task{stats.openTasks === 1 ? "" : "s"}
      </p>

      <div className="bars" role="img" aria-label="Free hours per day">
        {stats.days.map((day, i) => (
          <div key={day.toISOString()} className={`bar-col${isSameDay(day, today) ? " current" : ""}`}>
            <div className="bar-track" title={`${fmtHours(stats.freeByDay[i])}h free`}>
              <div
                className="bar-fill"
                style={{
                  height: `${Math.max(6, (stats.freeByDay[i] / maxFree) * 100)}%`,
                  animationDelay: `${i * 40}ms`,
                }}
              />
            </div>
            <span>{day.toLocaleDateString(undefined, { weekday: "narrow" })}</span>
          </div>
        ))}
      </div>

      <div className="donut-wrap">
        <svg viewBox="0 0 124 124" width="124" height="124" role="img" aria-label="Hours by category">
          <circle cx="62" cy="62" r={radius} fill="none" stroke="rgba(171,210,250,0.08)" strokeWidth="13" />
          {arcs.map((arc) => (
            <circle
              key={arc.id}
              cx="62"
              cy="62"
              r={radius}
              fill="none"
              stroke={CATEGORIES[arc.id].accent}
              strokeWidth="13"
              strokeDasharray={`${Math.max(arc.length - 2, 0.5)} ${circumference}`}
              strokeDashoffset={-arc.offset}
              transform="rotate(-90 62 62)"
              style={{ transition: "stroke-dasharray 0.6s var(--ease), stroke-dashoffset 0.6s var(--ease)" }}
            />
          ))}
          <text x="62" y="62" textAnchor="middle" fill="#FFFFFF" fontSize="22" fontWeight="700" dy="4">
            {Math.round(stats.total)}
          </text>
          <text x="62" y="80" textAnchor="middle" fontSize="8" fill={PALETTE.icy} letterSpacing="1">
            HOURS
          </text>
        </svg>
        <div className="legend">
          {CATEGORY_ORDER.filter((id) => stats.hours[id] > 0).map((id) => (
            <div key={id} className="legend-row">
              <span className="dot" style={{ background: CATEGORIES[id].accent }} />
              {CATEGORIES[id].short}
              <b>{fmtHours(stats.hours[id])}h</b>
            </div>
          ))}
          {stats.total === 0 && <span className="muted">Nothing planned yet.</span>}
        </div>
      </div>
    </section>
  );
}
