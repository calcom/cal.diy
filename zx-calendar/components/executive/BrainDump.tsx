"use client";

import { useState } from "react";
import { Sparkle } from "../Icons";
import { ApiError, api } from "@/lib/api";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/categories";
import { addDays, formatDayShort, formatRange, fromLocalDateTime, toLocalDateTime } from "@/lib/dates";
import { parseOffline } from "@/lib/offlineParser";
import type { BrainDumpEvent, BrainDumpResult, BrainDumpTask, CategoryId, ScheduleBlock } from "@/lib/types";

const PLACEHOLDER =
  "Need to call mom Tuesday, block 2 hours for deep work on the SOP draft sometime this week, and remind me to pay rent on the 1st";

interface Row<T> {
  item: T;
  include: boolean;
}

interface BrainDumpProps {
  aiEnabled: boolean;
  blocks: ScheduleBlock[];
  onApply: (events: BrainDumpEvent[], tasks: BrainDumpTask[]) => Promise<void>;
}

export function BrainDump({ aiEnabled, blocks, onApply }: BrainDumpProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ engine: BrainDumpResult["engine"]; summary: string } | null>(null);
  const [events, setEvents] = useState<Row<BrainDumpEvent>[]>([]);
  const [tasks, setTasks] = useState<Row<BrainDumpTask>[]>([]);

  const structure = async () => {
    const input = text.trim() || PLACEHOLDER;
    setLoading(true);
    setError(null);
    const now = new Date();
    const horizon = addDays(now, 14).getTime();
    const upcoming = blocks.filter(
      (b) => b.category !== "free" && Date.parse(b.end) > now.getTime() && Date.parse(b.start) < horizon
    );

    let parsed: BrainDumpResult;
    try {
      parsed = await api<BrainDumpResult>("/api/brain-dump", {
        method: "POST",
        json: {
          text: input,
          now: toLocalDateTime(now),
          weekday: now.toLocaleDateString("en-US", { weekday: "long" }),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          busy: upcoming.slice(0, 300).map((b) => ({
            title: b.title,
            category: b.category,
            start: toLocalDateTime(new Date(b.start)),
            end: toLocalDateTime(new Date(b.end)),
          })),
        },
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        parsed = parseOffline(
          input,
          now,
          upcoming.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }))
        );
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setLoading(false);
        return;
      }
    }

    setResult({ engine: parsed.engine, summary: parsed.summary });
    setEvents(
      parsed.events.filter((e) => fromLocalDateTime(e.start)).map((item) => ({ item, include: true }))
    );
    setTasks(parsed.tasks.map((item) => ({ item, include: true })));
    if (!text.trim()) setText(input);
    setLoading(false);
  };

  const apply = async () => {
    setApplying(true);
    try {
      await onApply(
        events.filter((r) => r.include).map((r) => r.item),
        tasks.filter((r) => r.include).map((r) => r.item)
      );
      setResult(null);
      setEvents([]);
      setTasks([]);
      setText("");
    } finally {
      setApplying(false);
    }
  };

  const selectedCount = events.filter((r) => r.include).length + tasks.filter((r) => r.include).length;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <textarea
        className="textarea bd-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        aria-label="Brain dump"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) structure();
        }}
      />
      <div className="pill-combo">
        <button type="button" className="btn btn-primary" onClick={structure} disabled={loading}>
          {loading ? <span className="spinner" /> : <Sparkle />}
          {loading ? "Structuring…" : text.trim() ? "Structure it" : "Try the example"}
        </button>
        <span className="tag" title={aiEnabled ? "Parsed by Claude" : "Add ANTHROPIC_API_KEY for AI parsing"}>
          {aiEnabled ? "Claude" : "Offline"}
        </span>
      </div>

      {error && <div className="banner warn">{error}</div>}

      {loading && (
        <div className="bd-results" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer" style={{ height: 58 }} />
          ))}
        </div>
      )}

      {result && !loading && (
        <div className="bd-results rise">
          <p className="muted" style={{ margin: "2px 4px", fontSize: 13 }}>
            {result.summary}
          </p>
          {events.map((row, i) => (
            <EventRow
              key={`e${i}`}
              row={row}
              onChange={(next) => setEvents(events.map((r, j) => (j === i ? next : r)))}
            />
          ))}
          {tasks.map((row, i) => (
            <div key={`t${i}`} className={`bd-item${row.include ? "" : " off"}`}>
              <input
                type="checkbox"
                checked={row.include}
                aria-label="Include task"
                onChange={(e) =>
                  setTasks(tasks.map((r, j) => (j === i ? { ...r, include: e.target.checked } : r)))
                }
              />
              <div>
                <input
                  className="bd-title"
                  value={row.item.title}
                  aria-label="Task title"
                  onChange={(e) =>
                    setTasks(
                      tasks.map((r, j) =>
                        j === i ? { ...r, item: { ...r.item, title: e.target.value } } : r
                      )
                    )
                  }
                />
                <div className="bd-meta">
                  <span className="tag">Task</span>
                  <input
                    className="input"
                    type="date"
                    value={row.item.due ?? ""}
                    aria-label="Due date"
                    onChange={(e) =>
                      setTasks(
                        tasks.map((r, j) =>
                          j === i ? { ...r, item: { ...r.item, due: e.target.value || null } } : r
                        )
                      )
                    }
                  />
                </div>
                {row.item.notes && (
                  <small className="muted" style={{ display: "block", marginTop: 4 }}>
                    {row.item.notes}
                  </small>
                )}
              </div>
            </div>
          ))}
          {events.length + tasks.length > 0 && (
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={apply}
              disabled={!selectedCount || applying}>
              {applying ? (
                <span className="spinner" />
              ) : (
                `Add ${selectedCount} item${selectedCount === 1 ? "" : "s"}`
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EventRow({
  row,
  onChange,
}: {
  row: Row<BrainDumpEvent>;
  onChange: (row: Row<BrainDumpEvent>) => void;
}) {
  const start = fromLocalDateTime(row.item.start);
  const end = fromLocalDateTime(row.item.end);
  const style = CATEGORIES[row.item.category];
  const set = (patch: Partial<BrainDumpEvent>) => onChange({ ...row, item: { ...row.item, ...patch } });

  const moveTo = (dateTime: string) => {
    const nextStart = fromLocalDateTime(dateTime);
    if (!nextStart || !start || !end) return;
    const nextEnd = new Date(nextStart.getTime() + (end.getTime() - start.getTime()));
    set({ start: toLocalDateTime(nextStart), end: toLocalDateTime(nextEnd) });
  };

  return (
    <div
      className={`bd-item${row.include ? "" : " off"}`}
      style={{ borderLeft: `4px solid ${style.accent}` }}>
      <input
        type="checkbox"
        checked={row.include}
        aria-label="Include event"
        onChange={(e) => onChange({ ...row, include: e.target.checked })}
      />
      <div>
        <input
          className="bd-title"
          value={row.item.title}
          aria-label="Event title"
          onChange={(e) => set({ title: e.target.value })}
        />
        {start && end && (
          <small className="muted" style={{ display: "block", marginTop: 2 }}>
            {formatDayShort(start)} · {formatRange(start, end)}
          </small>
        )}
        <div className="bd-meta">
          <select
            className="select"
            value={row.item.category}
            aria-label="Category"
            onChange={(e) => set({ category: e.target.value as CategoryId })}>
            {CATEGORY_ORDER.map((id) => (
              <option key={id} value={id}>
                {CATEGORIES[id].short}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="datetime-local"
            step={900}
            value={row.item.start}
            aria-label="Start"
            onChange={(e) => moveTo(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
