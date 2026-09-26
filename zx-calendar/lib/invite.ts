function utcStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export function googleCalendarTemplateUrl(opts: {
  title: string;
  start: Date;
  end: Date;
  details?: string;
}): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates: `${utcStamp(opts.start)}/${utcStamp(opts.end)}`,
    details: opts.details ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

// Built from a char code on purpose: an auto-fixer once rewrote the "\\;" string
// literal to ";" and silently broke escaping.
const BACKSLASH = String.fromCharCode(92);

/** RFC 5545 TEXT escaping: backslash, semicolon, comma and newlines. */
export function escapeIcs(text: string): string {
  return text.replace(/\r?\n/g, "\n").replace(/[;,\n]|\\/g, (c) => BACKSLASH + (c === "\n" ? "n" : c));
}

interface IcsOptions {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  details?: string;
  location?: string;
  /** With an organizer and attendees the file is an invitation (METHOD:REQUEST). */
  organizer?: { email: string; name?: string };
  attendees?: string[];
}

export function icsFile(opts: IcsOptions): string {
  const isInvite = Boolean(opts.organizer && opts.attendees?.length);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Z x XOE//Team Calendar//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${isInvite ? "REQUEST" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${opts.uid}@zx-calendar`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(opts.start)}`,
    `DTEND:${utcStamp(opts.end)}`,
    `SUMMARY:${escapeIcs(opts.title)}`,
    `DESCRIPTION:${escapeIcs(opts.details ?? "")}`,
  ];
  if (opts.location) lines.push(`LOCATION:${escapeIcs(opts.location)}`);
  if (isInvite && opts.organizer) {
    const cn = opts.organizer.name ? `;CN=${escapeIcs(opts.organizer.name)}` : "";
    lines.push(`ORGANIZER${cn}:mailto:${opts.organizer.email}`);
    for (const email of opts.attendees ?? []) {
      lines.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${email}`);
    }
    lines.push("STATUS:CONFIRMED", "SEQUENCE:0");
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}
