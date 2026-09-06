/**
 * Parses and calculates the minute offset for fractional timezones, supporting both
 * positive offsets (e.g. India GMT+05:30, Nepal GMT+05:45) and negative offsets
 * (e.g. Newfoundland GMT-03:30, Marquesas Islands GMT-09:30).
 *
 * @param gmtString Timezone string representation (e.g., "GMT-03:30", "GMT-3:30", "GMT+05:45")
 * @returns Total signed offset in minutes from UTC (e.g., -210 for GMT-3:30, +330 for GMT+5:30)
 * @throws {Error} When the format is not a valid GMT offset string
 *
 * @example
 * ```ts
 * parseFractionalTimezoneOffset("GMT-03:30"); // returns -210
 * parseFractionalTimezoneOffset("GMT+05:30"); // returns 330
 * ```
 */
export function parseFractionalTimezoneOffset(gmtString: string): number {
  if (!gmtString || typeof gmtString !== 'string') {
    throw new Error('Invalid timezone input: must be a non-empty string');
  }

  const match = gmtString.trim().match(/^GMT?([+-])(\d{1,2}):?(\d{2})?$/i);
  if (!match) {
    throw new Error(`Invalid timezone format: ${gmtString}`);
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = parseInt(match[2], 10);
  const minutes = match[3] ? parseInt(match[3], 10) : 0;

  return sign * (hours * 60 + minutes);
}
