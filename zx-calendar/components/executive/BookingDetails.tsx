"use client";

import { useState } from "react";
import { Clock, External, Google, Mail, Note, User, Video } from "../Icons";
import { Sheet } from "../Sheet";
import { BOOKING_STYLE } from "@/lib/categories";
import { formatDayLong, formatRange } from "@/lib/dates";
import type { Booking } from "@/lib/types";

interface BookingDetailsProps {
  booking: Booking | null;
  onClose: () => void;
  onCancel: (booking: Booking) => Promise<void>;
}

export function BookingDetails({ booking, onClose, onCancel }: BookingDetailsProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!booking) return null;
  const start = new Date(booking.start);
  const end = new Date(booking.end);

  return (
    <Sheet
      open
      onClose={() => {
        setConfirming(false);
        onClose();
      }}
      hero={
        <div className="detail-hero" style={{ background: BOOKING_STYLE.fill, color: BOOKING_STYLE.ink }}>
          <p className="eyebrow" style={{ color: "inherit", opacity: 0.6 }}>
            Booked call
          </p>
          <h2>{booking.topic}</h2>
          <p>
            {formatDayLong(start)} · {formatRange(start, end)}
          </p>
        </div>
      }
      footer={
        <>
          {confirming ? (
            <>
              <span className="muted" style={{ fontSize: 13, flex: 1 }}>
                Cancel and notify {booking.name}?
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
                Keep
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onCancel(booking);
                  } finally {
                    setBusy(false);
                    setConfirming(false);
                  }
                }}>
                {busy ? <span className="spinner" /> : "Cancel call"}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirming(true)}>
                Cancel call
              </button>
              <div style={{ flex: 1 }} />
              {booking.meetLink && (
                <a className="btn btn-dark" href={booking.meetLink} target="_blank" rel="noreferrer">
                  <Video /> Join Meet
                </a>
              )}
            </>
          )}
        </>
      }>
      <dl className="detail-list">
        <div>
          <dt>
            <User />
          </dt>
          <dd>{booking.name}</dd>
        </div>
        <div>
          <dt>
            <Mail />
          </dt>
          <dd>
            <a href={`mailto:${booking.email}`}>{booking.email}</a>
          </dd>
        </div>
        <div>
          <dt>
            <Clock />
          </dt>
          <dd>
            Booked{" "}
            {new Date(booking.createdAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </dd>
        </div>
        {booking.notes && (
          <div>
            <dt>
              <Note />
            </dt>
            <dd style={{ whiteSpace: "pre-wrap" }}>{booking.notes}</dd>
          </div>
        )}
        <div>
          <dt>
            <Google />
          </dt>
          <dd>
            {booking.googleEventLink ? (
              <a href={booking.googleEventLink} target="_blank" rel="noreferrer">
                Open in Google Calendar <External size={13} />
              </a>
            ) : (
              <span className="muted">Not synced to Google Calendar</span>
            )}
          </dd>
        </div>
      </dl>
    </Sheet>
  );
}
