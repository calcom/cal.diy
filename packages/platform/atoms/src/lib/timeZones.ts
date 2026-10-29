const normalizeTimezone = (tz: string): string => (tz === "Europe/Kiev" ? "Europe/Kyiv" : tz);

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
  const normalizedPropsTimezones = new Set(propsTimezones.map(normalizeTimezone));
  return availableTimezones.filter((availableTimezone) =>
    normalizedPropsTimezones.has(normalizeTimezone(availableTimezone.timezone))
  );
};
