/*
 * Detects navigator locale 24h time preference
 * based on the user's preferred language.
 */
import { localStorage } from "@calcom/lib/webstorage";

const is24hLocalstorageKey = "timeOption.is24hClock";

export enum TimeFormat {
  TWELVE_HOUR = "h:mma",
  TWENTY_FOUR_HOUR = "HH:mm",
}

export const setIs24hClockInLocalStorage = (is24h: boolean) =>
  localStorage.setItem(is24hLocalstorageKey, is24h.toString());

export const getIs24hClockFromLocalStorage = () => {
  const is24hFromLocalstorage = localStorage.getItem(is24hLocalstorageKey);

  if (is24hFromLocalstorage === null) return null;

  return is24hFromLocalstorage === "true";
};

export const getTimeFormatStringFromUserTimeFormat = (
  timeFormat: number | null | undefined
): TimeFormat => {
  return timeFormat === 24 ? TimeFormat.TWENTY_FOUR_HOUR : TimeFormat.TWELVE_HOUR;
};

/**
 * Retrieves the browser's time format preference, checking local storage first
 * for a user-set preference. If no preference is found, it uses the browser
 * locale to determine the time format and stores it in local storage.
 */
export const isBrowserLocale24h = () => {
  const localStorageTimeFormat = getIs24hClockFromLocalStorage();

  // If time format is already stored in the browser, retrieve and return early.
  if (localStorageTimeFormat === true) {
    return true;
  } else if (localStorageTimeFormat === false) {
    return false;
  }

  // Use the browser's locale settings to detect the preferred hour cycle.
  const formatter = new Intl.DateTimeFormat(undefined, { hour: "numeric" });
  const { hour12 } = formatter.resolvedOptions();

  // If hour12 is false, 24-hour clock is preferred.
  // If hour12 is true or undefined, default to 12-hour clock (false).
  const is24h = hour12 === false;

  setIs24hClockInLocalStorage(is24h);
  return is24h;
};

/**
 * Returns the time format string based on whether the current set locale is 24h or 12h.
 */
export const detectBrowserTimeFormat = isBrowserLocale24h()
  ? TimeFormat.TWENTY_FOUR_HOUR
  : TimeFormat.TWELVE_HOUR;
