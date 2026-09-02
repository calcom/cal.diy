import dayjs from "@calcom/dayjs";
import type { ITimezoneOption } from "react-timezone-select";
import isProblematicTimezone from "./isProblematicTimezone";

type Timezones = { label: string; timezone: string }[];

const searchTextFilter = (tzOption: Timezones[number], searchText: string): boolean => {
  if (!searchText) return false;
  return tzOption.label.toLowerCase().includes(searchText.toLowerCase());
};

const filterBySearchText = (searchText: string, timezones: Timezones): Timezones => {
  return timezones.filter((tzOption) => searchTextFilter(tzOption, searchText));
};

const addTimezonesToDropdown = (timezones: Timezones): Record<string, string> => {
  return Object.fromEntries(
    timezones
      .filter(({ timezone }) => {
        return timezone !== null && !isProblematicTimezone(timezone);
      })
      .map(({ label, timezone }) => [timezone, label])
  );
};

const formatOffset = (offset: string): string =>
  offset.replace(/^([-+])0(\d):/, (_, sign, hour) => `${sign}${hour}:`);

const handleOptionLabel = (option: ITimezoneOption, timezones: Timezones): string => {
  const offsetUnit = option.label.split(/[-+]/)[0].substring(1);
  const cityName = option.label.split(") ")[1];

  const timezoneValue = ` ${offsetUnit} ${formatOffset(dayjs.tz(undefined, option.value).format("Z"))}`;
  if (timezones.length > 0) {
    return `${cityName}${timezoneValue}`;
  }
  return `${option.value.replace(/_/g, " ")}${timezoneValue}`;
};

export { addTimezonesToDropdown, filterBySearchText, handleOptionLabel, type Timezones };
