"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Check, Download, External, Video } from "../Icons";
import { Sheet } from "../Sheet";
import { ApiError, api } from "@/lib/api";
import { BOOKING_DURATIONS, type Interval, slotStarts } from "@/lib/availability";
import { CATEGORIES } from "@/lib/categories";
import { formatDayLong, formatRange, formatTime, MINUTE } from "@/lib/dates";
import { googleCalendarTemplateUrl, icsFile } from "@/lib/invite";

interface BookingResponse {
  booking: { id: string; start: string; end: string; topic: string; meetLink?: string; synced: boolean };
  calendarWarning?: string;
}

interface BookingFlowProps {
  openWindow: Interval | null;
  initialStart?: number | null;
  duration: number;
  onDurationChange: (minutes: number) => void;
  onClose: () => void;
  onBooked: () => void;
  onConflict: () => void;
}

const PROFILE_KEY = "zx:booker";

function loadProfile(): { name: string; email: string } {
  try {
    return { name: "", email: "", ...JSON.parse(window.localStorage.getItem(PROFILE_KEY) ?? "{}") };
  } catch {
    return { name: "", email: "" };
  }
}

export function BookingFlow({
  openWindow: win,
  initialStart,
  duration,
  onDurationChange,
  onClose,
  onBooked,
  onConflict,
}: BookingFlowProps) {
  const [start, setStart] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<BookingResponse | null>(null);

  const slots = useMemo(() => (win ? slotStarts(win, duration) : []), [win, duration]);

  useEffect(() => {
    if (!win) return;
    const profile = loadProfile();
    setName((n) => n || profile.name);
    setEmail((e) => e || profile.email);
    setError(null);
    setDone(null);
  }, [win]);

  useEffect(() => {
    if (!win) return;
    // Keep the chosen slot when possible; otherwise pick the one nearest to where they tapped.
    setStart((current) => {
      if (current !== null && slots.includes(current)) return current;
      const target = initialStart ?? win.start;
      const nearest = slots.find((s) => s + duration * MINUTE > target) ?? slots[0];
      return nearest ?? null;
    });
  }, [win, slots, initialStart, duration]);

  if (!win) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (start === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<BookingResponse>("/api/bookings", {
        method: "POST",
        json: {
          start: new Date(start).toISOString(),
          end: new Date(start + duration * MINUTE).toISOString(),
          name,
          email,
          topic,
          notes: notes || undefined,
        },
      });
      try {
        window.localStorage.setItem(PROFILE_KEY, JSON.stringify({ name, email }));
      } catch {
        // Not remembering the booker is fine.
      }
      setDone(res);
      setTopic("");
      setNotes("");
      onBooked();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) onConflict();
      setError(err instanceof Error ? err.message : "Couldn't book that time");
    } finally {
      setSubmitting(false);
    }
  };

  const free = CATEGORIES.free;

  if (done) {
    const s = new Date(done.booking.start);
    const en = new Date(done.booking.end);
    const title = `${done.booking.topic} · Z & XOE`;
    const details = done.booking.meetLink ? `Google Meet: ${done.booking.meetLink}` : "Call with Z & XOE";
    const icsHref = `data:text/calendar;charset=utf-8,${encodeURIComponent(
      icsFile({ uid: done.booking.id, title, start: s, end: en, details })
    )}`;
    return (
      <Sheet open onClose={onClose} title="You're booked">
        <div style={{ textAlign: "center", display: "grid", gap: 6 }}>
          <div className="success-mark">
            <Check size={32} strokeWidth={2.2} />
          </div>
          <h3 style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 400, letterSpacing: "-0.02em" }}>
            {done.booking.topic}
          </h3>
          <p className="muted" style={{ margin: 0 }}>
            {formatDayLong(s)} · {formatRange(s, en)}
          </p>
          <p style={{ margin: "10px 0 0", fontSize: 14 }}>
            {done.booking.synced
              ? `A Google Calendar invite is on its way to ${email}.`
              : "Z & XOE have been notified in the app."}
          </p>
        </div>
        {done.calendarWarning && <div className="banner warn">{done.calendarWarning}</div>}
        <div style={{ display: "grid", gap: 8 }}>
          {done.booking.meetLink && (
            <a
              className="btn btn-dark btn-block"
              href={done.booking.meetLink}
              target="_blank"
              rel="noreferrer">
              <Video /> Google Meet link
            </a>
          )}
          {!done.booking.synced && (
            <a
              className="btn btn-soft btn-block"
              href={googleCalendarTemplateUrl({ title, start: s, end: en, details })}
              target="_blank"
              rel="noreferrer">
              <External /> Add to Google Calendar
            </a>
          )}
          <a className="btn btn-ghost btn-block" href={icsHref} download="call-with-z-and-xoe.ics">
            <Download /> Download .ics
          </a>
        </div>
      </Sheet>
    );
  }

  const winStart = new Date(win.start);
  const winEnd = new Date(win.end);
  const windowMinutes = (win.end - win.start) / MINUTE;

  return (
    <Sheet
      open
      onClose={onClose}
      wide
      hero={
        <div className="detail-hero" style={{ background: free.fill, color: free.ink }}>
          <p className="eyebrow" style={{ color: "inherit", opacity: 0.65 }}>
            Book a call with Z & XOE
          </p>
          <h2>{formatDayLong(winStart)}</h2>
          <p>Free {formatRange(winStart, winEnd)}</p>
        </div>
      }
      footer={
        <button
          type="submit"
          form="booking-form"
          className="btn btn-dark btn-block"
          disabled={submitting || start === null}>
          {submitting ? (
            <span className="spinner" />
          ) : start !== null ? (
            `Book ${formatTime(new Date(start))} · ${duration} min`
          ) : (
            "Pick a time"
          )}
        </button>
      }>
      <form id="booking-form" onSubmit={submit} style={{ display: "grid", gap: 16 }}>
        <div className="field">
          <span>Length</span>
          <div className="segmented" role="group" aria-label="Call length" style={{ justifySelf: "start" }}>
            {BOOKING_DURATIONS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={duration === m}
                disabled={m > windowMinutes}
                onClick={() => onDurationChange(m)}
                style={m > windowMinutes ? { opacity: 0.35 } : undefined}>
                {m} min
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Start time</span>
          {slots.length ? (
            <div className="slot-grid">
              {slots.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="slot"
                  aria-pressed={start === s}
                  onClick={() => setStart(s)}>
                  {formatTime(new Date(s))}
                </button>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              This window is shorter than {duration} minutes — pick a shorter call.
            </p>
          )}
        </div>

        <div className="row">
          <label className="field">
            <span>Your name</span>
            <input
              className="input"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
          <label className="field">
            <span>Email (invite goes here)</span>
            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
        </div>
        <label className="field">
          <span>What's it about?</span>
          <input
            className="input"
            required
            maxLength={140}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Mix feedback, shift swap, weekly sync…"
          />
        </label>
        <label className="field">
          <span>Anything else (optional)</span>
          <textarea
            className="textarea"
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {error && <div className="banner warn">{error}</div>}
      </form>
    </Sheet>
  );
}
