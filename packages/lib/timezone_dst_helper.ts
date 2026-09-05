/**
 * Returns the signed UTC offset, in minutes, for an IANA timezone at a date.
 *
 * The sign applies to the complete hours-and-minutes value. This matters for
 * fractional negative offsets such as GMT-03:30, which must be -210 minutes.
 */
export function getTimezoneOffsetMinutes(tz: string, date = new Date()): number {
  const value = date.toLocaleString("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  });
  const match = value.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = match[3] ? Number.parseInt(match[3], 10) : 0;
  return sign * (hours * 60 + minutes);
}
