"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Repeat, Trash } from "../Icons";
import { Sheet } from "../Sheet";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/categories";
import { addDays, formatDuration, fromLocal, MINUTE, toDateKey, toTimeValue } from "@/lib/dates";
import type { CategoryId, ScheduleBlock } from "@/lib/types";

export type EditorState =
  | { mode: "create"; start: Date; end: Date; category?: CategoryId }
  | { mode: "edit"; block: ScheduleBlock };

export interface BlockDraft {
  title: string;
  category: CategoryId;
  start: Date;
  end: Date;
  notes: string;
  location: string;
  repeatWeeks: number;
}

interface BlockEditorProps {
  state: EditorState | null;
  onClose: () => void;
  onSave: (draft: BlockDraft) => Promise<void> | void;
  onDelete: (block: ScheduleBlock, wholeSeries: boolean) => void;
}

function initialDraft(state: EditorState): BlockDraft {
  if (state.mode === "edit") {
    const b = state.block;
    return {
      title: b.title,
      category: b.category,
      start: new Date(b.start),
      end: new Date(b.end),
      notes: b.notes ?? "",
      location: b.location ?? "",
      repeatWeeks: 0,
    };
  }
  return {
    title: "",
    category: state.category ?? "free",
    start: state.start,
    end: state.end,
    notes: "",
    location: "",
    repeatWeeks: 0,
  };
}

export function BlockEditor({ state, onClose, onSave, onDelete }: BlockEditorProps) {
  const [draft, setDraft] = useState<BlockDraft | null>(null);
  const [dateKey, setDateKey] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmSeries, setConfirmSeries] = useState(false);

  useEffect(() => {
    if (!state) return;
    const d = initialDraft(state);
    setDraft(d);
    setDateKey(toDateKey(d.start));
    setStartTime(toTimeValue(d.start));
    setEndTime(toTimeValue(d.end));
    setConfirmSeries(false);
    setSaving(false);
  }, [state]);

  if (!state || !draft) return null;

  const start = fromLocal(dateKey, startTime);
  let end = fromLocal(dateKey, endTime);
  // An end time earlier than the start means the block runs past midnight (night shifts).
  if (start && end && end <= start) end = addDays(end, 1);
  const valid = Boolean(start && end && end > start);
  const minutes = valid && start && end ? Math.round((end.getTime() - start.getTime()) / MINUTE) : 0;
  const style = CATEGORIES[draft.category];
  const editing = state.mode === "edit" ? state.block : null;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!valid || !start || !end) return;
    setSaving(true);
    try {
      await onSave({ ...draft, title: draft.title.trim() || style.label, start, end });
    } finally {
      setSaving(false);
    }
  };

  const hero = (
    <div className="detail-hero" style={{ background: style.fill, color: style.ink }}>
      <p className="eyebrow" style={{ color: "inherit", opacity: 0.7 }}>
        {editing ? "Edit block" : "New block"} · {style.label}
      </p>
      <h2>{draft.title.trim() || style.label}</h2>
      <p>
        {valid && start && end
          ? `${start.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} · ${formatDuration(
              minutes
            )}`
          : "Check the times"}
      </p>
    </div>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      hero={hero}
      footer={
        <>
          {editing &&
            (editing.seriesId && confirmSeries ? (
              <>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => onDelete(editing, false)}>
                  Just this
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => onDelete(editing, true)}>
                  All repeats
                </button>
              </>
            ) : (
              <button
                type="button"
                className="icon-btn"
                aria-label="Delete block"
                onClick={() => (editing.seriesId ? setConfirmSeries(true) : onDelete(editing, false))}>
                <Trash />
              </button>
            ))}
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="block-form" className="btn btn-primary" disabled={!valid || saving}>
            {saving ? <span className="spinner" /> : editing ? "Save" : "Add to calendar"}
          </button>
        </>
      }>
      <form id="block-form" onSubmit={submit} style={{ display: "grid", gap: 16 }}>
        <label className="field">
          <span>Title</span>
          <input
            className="input"
            value={draft.title}
            placeholder={style.label}
            maxLength={120}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>

        <div className="field">
          <span>Category</span>
          <div className="chips" role="group" aria-label="Category">
            {CATEGORY_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={draft.category === id}
                className="chip"
                onClick={() => setDraft({ ...draft, category: id })}>
                <span className="dot" style={{ background: CATEGORIES[id].accent }} />
                {CATEGORIES[id].short}
              </button>
            ))}
          </div>
          {draft.category === "free" ? (
            <small className="muted">Free time is the only thing the team can see and book calls in.</small>
          ) : (
            <small className="muted">Private — the team never sees this block.</small>
          )}
        </div>

        <div className="row">
          <label className="field">
            <span>Date</span>
            <input
              className="input"
              type="date"
              required
              value={dateKey}
              onChange={(e) => setDateKey(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Starts</span>
            <input
              className="input"
              type="time"
              step={900}
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Ends</span>
            <input
              className="input"
              type="time"
              step={900}
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </label>
        </div>

        <label className="field">
          <span>Location</span>
          <input
            className="input"
            value={draft.location}
            placeholder="Hospital, campus, studio…"
            maxLength={200}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
          />
        </label>

        <label className="field">
          <span>Notes</span>
          <textarea
            className="textarea"
            value={draft.notes}
            maxLength={2000}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </label>

        {!editing && (
          <label className="field">
            <span>
              <Repeat size={12} /> Repeat weekly
            </span>
            <select
              className="select"
              value={draft.repeatWeeks}
              onChange={(e) => setDraft({ ...draft, repeatWeeks: Number(e.target.value) })}>
              <option value={0}>Doesn't repeat</option>
              {[2, 4, 6, 8, 12, 16].map((n) => (
                <option key={n} value={n - 1}>
                  Every week for {n} weeks
                </option>
              ))}
            </select>
          </label>
        )}
      </form>
    </Sheet>
  );
}
