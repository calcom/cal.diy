export function normalizeTimezone(value: unknown): string | unknown {
  if (typeof value === "string") {
    // note(Lauris): if the value is a valid IANA time zone, prefer the canonical
    // spelling reported by Intl. This preserves names with lower-case words or
    // inner capitals (e.g. "Europe/Isle_of_Man", "America/Port_of_Spain",
    // "Antarctica/McMurdo") that the naive capitalization below would rewrite.
    // Intl resolves case-insensitively but may also swap a name for a different
    // alias (e.g. "Asia/Kolkata" -> "Asia/Calcutta"), so we only trust the
    // resolved name when it equals the input ignoring case.
    try {
      const resolved = new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions()
        .timeZone;
      if (resolved && resolved.toLowerCase() === value.toLowerCase()) {
        return resolved;
      }
    } catch {
      // not a valid IANA time zone — fall through to the capitalization logic
    }

    const parts = value.split("/");
    const normalizedParts = parts.map((part) =>
      part
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join("_")
    );
    let normalizedTimeZone = normalizedParts.join("/");

    // note(Lauris): regex matching GMT, EST, UTC at the start, end, or surrounded by non-letters and capitalizing them
    const specialCases = ["GMT", "EST", "UTC"];
    specialCases.forEach((specialCase) => {
      const regex = new RegExp(`(^|[^a-zA-Z])(${specialCase})([^a-zA-Z]|$)`, "gi");
      normalizedTimeZone = normalizedTimeZone.replace(regex, (match, p1, p2, p3) => {
        return `${p1}${specialCase}${p3}`;
      });
    });

    return normalizedTimeZone;
  }
  return value;
}
