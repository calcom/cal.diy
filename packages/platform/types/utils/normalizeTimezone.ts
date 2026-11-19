export function normalizeTimezone(value: unknown): string | unknown {
  if (typeof value === "string") {
    // If the input is a valid IANA timezone name matching case-insensitively,
    // preserve the exact canonical IANA capitalization (e.g. Europe/Isle_of_Man, Africa/Dar_es_Salaam).
    try {
      const resolved = Intl.DateTimeFormat(undefined, { timeZone: value }).resolvedOptions().timeZone;
      if (resolved && resolved.toLowerCase() === value.toLowerCase()) {
        return resolved;
      }
    } catch {
      // Ignore Intl failure and fallback to heuristic capitalization below
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
