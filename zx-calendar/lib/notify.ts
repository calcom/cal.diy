import "server-only";

import process from "node:process";
import { formatInTimeZone } from "./format";
import { icsFile } from "./invite";
import { inviteRecipients, uniqueEmails } from "./recipients";
import type { Booking } from "./types";

const resendKey = process.env.RESEND_API_KEY ?? "";
const fromAddress = process.env.INVITE_FROM || "Z × XOE Calendar <calendar@zannyworld.org>";
const displayTimeZone = process.env.CALENDAR_TIMEZONE || "America/New_York";

export const emailConfigured = Boolean(resendKey);

function fromEmail(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1] ?? from;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Sends the booking as a calendar invitation (.ics, METHOD:REQUEST) through Resend.
 * Used for whoever Google Calendar did not already email: everybody when Google
 * isn't connected, otherwise just the calendar owner (Google never emails the organizer).
 * Returns the addresses it emailed.
 */
export async function emailInvite(booking: Booking, recipients: string[]): Promise<string[]> {
  const to = uniqueEmails(recipients);
  if (!emailConfigured || to.length === 0) return [];

  const start = new Date(booking.start);
  const end = new Date(booking.end);
  const when = `${formatInTimeZone(start, displayTimeZone, "long")} – ${formatInTimeZone(end, displayTimeZone, "time")}`;
  const title = `${booking.topic} · ${booking.name} × Z & XOE`;
  const details = [
    `Topic: ${booking.topic}`,
    booking.notes ? `Notes: ${booking.notes}` : "",
    `Booked by ${booking.name} <${booking.email}>`,
    booking.meetLink ? `Google Meet: ${booking.meetLink}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const ics = icsFile({
    uid: booking.id,
    title,
    start,
    end,
    details,
    location: booking.meetLink,
    organizer: { email: fromEmail(fromAddress), name: "Z × XOE Calendar" },
    attendees: uniqueEmails([...inviteRecipients(process.env), booking.email]),
  });

  const html = `<div style="font-family:'Space Mono',Menlo,monospace;background:#091540;color:#EEF3FF;padding:28px;border-radius:18px">
<p style="margin:0 0 6px;color:#ABD2FA;font-size:11px;letter-spacing:2px;text-transform:uppercase">New team booking</p>
<h1 style="margin:0 0 12px;font-size:22px">${escapeHtml(booking.topic)}</h1>
<p style="margin:0 0 4px">${escapeHtml(when)} (${escapeHtml(displayTimeZone)})</p>
<p style="margin:0 0 16px;color:#AAB7D9">with ${escapeHtml(booking.name)} &lt;${escapeHtml(booking.email)}&gt;</p>
${booking.notes ? `<p style="margin:0 0 16px;color:#AAB7D9;white-space:pre-wrap">${escapeHtml(booking.notes)}</p>` : ""}
${booking.meetLink ? `<p><a href="${escapeHtml(booking.meetLink)}" style="background:#1B2CC1;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none">Join Google Meet</a></p>` : ""}
<p style="margin:16px 0 0;color:#6F7EA8;font-size:11px">The attached invite adds it to your calendar.</p>
</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromAddress,
      to,
      reply_to: booking.email,
      subject: `Invitation: ${title} — ${when}`,
      html,
      text: `${title}\n${when} (${displayTimeZone})\n\n${details}`,
      attachments: [
        {
          filename: "invite.ics",
          content: Buffer.from(ics).toString("base64"),
          content_type: "text/calendar; method=REQUEST; charset=UTF-8",
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Invite email failed (${res.status}): ${await res.text()}`);
  }
  return to;
}
