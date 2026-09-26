import "server-only";

import process from "node:process";
import { read, write } from "./store";
import type { Booking } from "./types";

const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

export const googleConfigured = Boolean(clientId && clientSecret);

export async function googleRefreshToken(): Promise<string | null> {
  if (process.env.GOOGLE_REFRESH_TOKEN) return process.env.GOOGLE_REFRESH_TOKEN;
  const stored = await read("google");
  return stored?.refreshToken ?? null;
}

export function authUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    // Forces Google to return a refresh token even if the account granted access before.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json()) as { refresh_token?: string; error_description?: string };
  if (!res.ok || !data.refresh_token) {
    throw new Error(`Google token exchange failed: ${data.error_description ?? res.statusText}`);
  }
  await write("google", { refreshToken: data.refresh_token, connectedAt: new Date().toISOString() });
  return data.refresh_token;
}

async function accessToken(): Promise<string | null> {
  const refreshToken = await googleRefreshToken();
  if (!googleConfigured || !refreshToken) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Google token refresh failed: ${data.error_description ?? res.statusText}`);
  }
  return data.access_token;
}

interface GoogleEvent {
  id: string;
  htmlLink?: string;
  hangoutLink?: string;
}

/**
 * Creates the call on the connected Google calendar with Z, XOE and the booker as
 * attendees plus a Meet link. Returns null when Google isn't connected yet so
 * bookings still work before setup is finished.
 */
export async function createCalendarEvent(booking: Booking): Promise<GoogleEvent | null> {
  const token = await accessToken();
  if (!token) return null;

  const attendees = [process.env.Z_EMAIL, process.env.XOE_EMAIL, booking.email]
    .filter((email): email is string => Boolean(email))
    .filter((email, i, all) => all.findIndex((e) => e.toLowerCase() === email.toLowerCase()) === i)
    .map((email) => ({ email }));

  const description = [
    booking.topic && `Topic: ${booking.topic}`,
    booking.notes && `Notes: ${booking.notes}`,
    `Booked by ${booking.name} <${booking.email}> via the Z × XOE team calendar.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
  );
  url.searchParams.set("conferenceDataVersion", "1");
  url.searchParams.set("sendUpdates", "all");

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: `${booking.topic || "Call"} · ${booking.name} × Z & XOE`,
      description,
      start: { dateTime: booking.start },
      end: { dateTime: booking.end },
      attendees,
      conferenceData: {
        createRequest: { requestId: booking.id, conferenceSolutionKey: { type: "hangoutsMeet" } },
      },
      reminders: { useDefault: true },
    }),
  });
  if (!res.ok) {
    throw new Error(`Google Calendar rejected the event (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as GoogleEvent;
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const token = await accessToken();
  if (!token) return;
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId
  )}/events/${encodeURIComponent(eventId)}?sendUpdates=all`;
  const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  // 410 = already deleted on Google's side, which is the outcome we want anyway.
  if (!res.ok && res.status !== 410 && res.status !== 404) {
    throw new Error(`Google Calendar delete failed (${res.status})`);
  }
}
