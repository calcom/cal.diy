import { canonicalizeTimezone } from "@calcom/lib/timezone";

export const formatTimezones = (
  timeZones: {
    city: string;
    timezone: string;
  }[]
) => {
  return timeZones.map(({ city, timezone }) => ({
    label: city,
    timezone,
  }));
};

export const filterPropsTimezones = (
  propsTimezones: string[],
  availableTimezones: { city: string; timezone: string }[]
) => {
  // Callers persist pre-rename IANA links (e.g. Europe/Kiev) while the
  // available city list is canonical (Europe/Kyiv). Compare on canonical ids
  // so a stale allow-list doesn't silently drop the zone.
  const canonicalPropsTimezones = new Set(propsTimezones.map(canonicalizeTimezone));

  return availableTimezones.filter((availableTimezone) =>
    canonicalPropsTimezones.has(canonicalizeTimezone(availableTimezone.timezone))
  );
};
