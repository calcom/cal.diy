// IANA names are matched case-insensitively, but some contain lower-case words ("Isle_of_Man",
// "Dar_es_Salaam") or inner capitals ("McMurdo", "Port-au-Prince") that word-by-word capitalization
// gets wrong. Use the spelling Intl resolves to, but only when it is the same name: Intl may also
// swap in a different alias (e.g. "Asia/Kolkata" -> "Asia/Calcutta"), which we must not do.
function getIanaSpelling(timeZone: string): string | undefined {
  try {
    const resolved = new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
    if (resolved.toLowerCase() !== timeZone.toLowerCase()) {
      return undefined;
    }
    return resolved;
  } catch {
    return undefined;
  }
}

export function normalizeTimezone(value: unknown): string | unknown {
  if (typeof value === "string") {
    const ianaSpelling = getIanaSpelling(value);
    if (ianaSpelling) {
      return ianaSpelling;
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
