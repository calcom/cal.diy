import process from "node:process";
import { NextResponse } from "next/server";
import { BOOKING_DURATIONS, isBookable, MIN_NOTICE_MINUTES } from "@/lib/availability";
import { MINUTE, uid } from "@/lib/dates";
import { createCalendarEvent } from "@/lib/google";
import { emailInvite } from "@/lib/notify";
import { emailFallbackRecipients, inviteRecipients, uniqueEmails } from "@/lib/recipients";
import { read, update } from "@/lib/store";
import type { Booking } from "@/lib/types";
import { BookingInput, firstIssue } from "@/lib/validation";

const toInterval = (b: { start: string; end: string }) => ({
  start: Date.parse(b.start),
  end: Date.parse(b.end),
});

/** Public: the team books a call inside Z's free time. */
export async function POST(request: Request) {
  const parsed = BookingInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  const input = parsed.data;

  const start = Date.parse(input.start);
  const end = Date.parse(input.end);
  const minutes = (end - start) / MINUTE;
  if (!BOOKING_DURATIONS.includes(minutes as (typeof BOOKING_DURATIONS)[number])) {
    return NextResponse.json({ error: "Pick a 15, 30, 45 or 60 minute call." }, { status: 400 });
  }

  const free = (await read("blocks")).filter((b) => b.category === "free").map(toInterval);
  const notBefore = Date.now() + MIN_NOTICE_MINUTES * MINUTE;

  const booking: Booking = {
    id: uid("bkg_"),
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    name: input.name,
    email: input.email,
    topic: input.topic,
    notes: input.notes || undefined,
    createdAt: new Date().toISOString(),
  };

  // The overlap check runs inside the write so two people can't grab the same slot
  // from stale screens.
  const accepted = await update("bookings", (bookings) => {
    if (!isBookable(start, end, free, bookings.map(toInterval), notBefore)) {
      return { next: bookings, result: false };
    }
    return { next: [...bookings, booking], result: true };
  });
  if (!accepted) {
    return NextResponse.json(
      { error: "That time was just taken or is no longer free. Pick another slot." },
      { status: 409 }
    );
  }

  let calendarWarning: string | undefined;
  let organizerEmail: string | undefined;
  let googleFailed = false;
  try {
    const event = await createCalendarEvent(booking);
    if (event) {
      booking.googleEventId = event.id;
      booking.googleEventLink = event.htmlLink;
      booking.meetLink = event.hangoutLink;
      organizerEmail = event.organizer?.email;
    }
  } catch (error) {
    googleFailed = true;
    console.error("[bookings] Google Calendar sync failed", error);
  }

  const recipients = inviteRecipients(process.env);
  const fallback = emailFallbackRecipients({
    googleEventCreated: Boolean(booking.googleEventId),
    organizerEmail,
    recipients,
    bookerEmail: booking.email,
  });
  let emailed: string[] = [];
  try {
    emailed = await emailInvite(booking, fallback);
  } catch (error) {
    console.error("[bookings] Invite email failed", error);
  }
  booking.invitesSentTo = uniqueEmails([
    ...(booking.googleEventId
      ? recipients.filter((r) => r.toLowerCase() !== organizerEmail?.toLowerCase())
      : []),
    ...emailed,
  ]).filter((email) => recipients.some((r) => r.toLowerCase() === email.toLowerCase()));

  await update("bookings", (bookings) => ({
    next: bookings.map((b) => (b.id === booking.id ? booking : b)),
    result: null,
  }));

  const inviteDelivered = Boolean(booking.googleEventId) || emailed.length > 0;
  if (!inviteDelivered) {
    calendarWarning = googleFailed
      ? "Your call is booked, but the calendar invite couldn't be sent. Z & XOE will follow up."
      : undefined;
  }

  return NextResponse.json(
    {
      booking: {
        id: booking.id,
        start: booking.start,
        end: booking.end,
        topic: booking.topic,
        meetLink: booking.meetLink,
        synced: Boolean(booking.googleEventId),
        emailed: emailed.some((e) => e.toLowerCase() === booking.email.toLowerCase()),
      },
      calendarWarning,
    },
    { status: 201 }
  );
}
