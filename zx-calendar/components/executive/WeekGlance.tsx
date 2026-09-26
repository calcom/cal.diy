"use client";

import { useMemo } from "react";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/categories";
import { addDays, HOUR, startOfWeek } from "@/lib/dates";
import type { Booking, CategoryId, ScheduleBlock, Task } from "@/lib/types";

interface WeekGlanceProps {
  date: Date;
  blocks: ScheduleBlock[];
  bookings: Booking[];
  tasks: Task[];
}

function fmtHours(h: number) {
  return h % 1 === 0 ? String(h) : h.toFixed(1);
}

export function WeekGlance({ date, blocks, bookings, tasks }: WeekGlanceProps) {
  const stats = useMemo(() => {
    const from = startOfWeek(date).getTime();
    const to = addDays(startOfWeek(date), 7).getTime();
    const hours = Object.fromEntries(CATEGORY_ORDER.map((id) => [id, 0])) as Record<CategoryId, number>;
    for (const b of blocks) {
      const s = Math.max(Date.parse(b.start), from);
      const e = Math.min(Date.parse(b.end), to);
      if (e > s) hours[b.category] += (e - s) / HOUR;
    }
    const calls = bookings.filter((b) => Date.parse(b.start) >= from && Date.parse(b.start) < to).length;
    const openTasks = tasks.filter((t) => !t.done).length;
    const total = CATEGORY_ORDER.reduce((sum, id) => sum + hours[id], 0);
    return { hours, calls, openTasks, total };
  }, [date, blocks, bookings, tasks]);

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const arcs = CATEGORY_ORDER.filter((id) => stats.hours[id] > 0).map((id) => {
    const length = (stats.hours[id] / stats.total) * circumference;
    const arc = { id, length, offset };
    offset += length;
    return arc;
  });

  return (
    <section className="card card-sage card-pad" aria-label="This week at a glance">
      <p className="eyebrow">This week</p>
      <div className="glance">
        <div className="stat">
          <span className="stat-value">
            {fmtHours(Math.round(stats.hours.free * 10) / 10)}
            <small>h</small>
          </span>
          <span className="stat-label">Free time</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats.calls}</span>
          <span className="stat-label">Calls booked</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats.openTasks}</span>
          <span className="stat-label">Open tasks</span>
        </div>
      </div>
      <div className="donut-wrap">
        <svg viewBox="0 0 132 132" width="132" height="132" role="img" aria-label="Hours by category">
          <circle cx="66" cy="66" r={radius} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="14" />
          {arcs.map((arc) => (
            <circle
              key={arc.id}
              cx="66"
              cy="66"
              r={radius}
              fill="none"
              stroke={CATEGORIES[arc.id].accent}
              strokeWidth="14"
              strokeDasharray={`${Math.max(arc.length - 2, 0.5)} ${circumference}`}
              strokeDashoffset={-arc.offset}
              transform="rotate(-90 66 66)"
              strokeLinecap="butt"
              style={{ transition: "stroke-dasharray 0.6s var(--ease), stroke-dashoffset 0.6s var(--ease)" }}
            />
          ))}
          <circle cx="66" cy="66" r="38" fill="none" stroke="rgba(29,34,33,0.2)" strokeDasharray="1 4" />
          <text x="66" y="66" textAnchor="middle" className="donut-center" fill="#1D2221" dy="4">
            {Math.round(stats.total)}
          </text>
          <text x="66" y="84" textAnchor="middle" fontSize="10" fill="rgba(29,34,33,0.55)">
            hours planned
          </text>
        </svg>
        <div className="legend">
          {CATEGORY_ORDER.filter((id) => stats.hours[id] > 0).map((id) => (
            <div key={id} className="legend-row">
              <span className="dot" style={{ background: CATEGORIES[id].accent }} />
              {CATEGORIES[id].short}
              <b>{fmtHours(Math.round(stats.hours[id] * 10) / 10)}h</b>
            </div>
          ))}
          {stats.total === 0 && <span style={{ color: "rgba(29,34,33,0.6)" }}>Nothing planned yet.</span>}
        </div>
      </div>
    </section>
  );
}
