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

function escapeIcs(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, ";");
}

export function icsFile(opts: {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  details?: string;
}): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Z x XOE//Team Calendar//EN",
    "BEGIN:VEVENT",
    `UID:${opts.uid}@zx-calendar`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(opts.start)}`,
    `DTEND:${utcStamp(opts.end)}`,
    `SUMMARY:${escapeIcs(opts.title)}`,
    `DESCRIPTION:${escapeIcs(opts.details ?? "")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
