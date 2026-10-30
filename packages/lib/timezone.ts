import dayjs from "@calcom/dayjs";
import type { ITimezoneOption } from "react-timezone-select";
import isProblematicTimezone from "./isProblematicTimezone";

export type Timezones = { label: string; timezone: string }[];

/**
 * IANA ids that were renamed and are now backward-compatibility links.
 * Maps the old (link) id to the current canonical id (tzdata 2022b+ for Kyiv).
 * Old ids still resolve identically in Intl/dayjs, but the picker only
 * offers canonical ids, so stored link ids must be mapped on read.
 */
export const RENAMED_TIMEZONE_ALIASES: Record<string, string> = {
  "Europe/Kiev": "Europe/Kyiv",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
};

export const canonicalizeTimezone = (timezone: string): string =>
  // Own-property lookup only: a bare index would return inherited members for
  // inputs like "__proto__" or "constructor", handing callers a non-string and
  // breaking the string contract this function advertises.
  Object.prototype.hasOwnProperty.call(RENAMED_TIMEZONE_ALIASES, timezone)
    ? RENAMED_TIMEZONE_ALIASES[timezone]
    : timezone;

const searchTextFilter = (tzOption: Timezones[number], searchText: string) => {
  return searchText && tzOption.label.toLowerCase().includes(searchText.toLowerCase());
};

export const filterBySearchText = (searchText: string, timezones: Timezones) => {
  return timezones.filter((tzOption) => searchTextFilter(tzOption, searchText));
};

export const addTimezonesToDropdown = (timezones: Timezones) => {
  return Object.fromEntries(
    timezones
      .filter(({ timezone }) => {
        return timezone !== null && !isProblematicTimezone(timezone);
      })
      .map(({ label, timezone }) => [timezone, label])
  );
};

const formatOffset = (offset: string) =>
  offset.replace(/^([-+])(0)(\d):00$/, (_, sign, _zero, hour) => `${sign}${hour}:00`);

export const handleOptionLabel = (option: ITimezoneOption, timezones: Timezones) => {
  const offsetUnit = option.label.split(/[-+]/)[0].substring(1);
  const cityName = option.label.split(") ")[1];

  const timezoneValue = ` ${offsetUnit} ${formatOffset(dayjs.tz(undefined, option.value).format("Z"))}`;
  return timezones.length > 0
    ? `${cityName}${timezoneValue}`
    : `${option.value.replace(/_/g, " ")}${timezoneValue}`;
};
