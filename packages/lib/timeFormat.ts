/*
 * Detects navigator locale 24h time preference
 * It works by checking whether hour output contains AM ('1 AM' or '01 h')
 * based on the user's preferred language
 * defaults to 'en-US' (12h) if no navigator language is found
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

export const getTimeFormatStringFromUserTimeFormat = (timeFormat: number | null | undefined): TimeFormat => {
  return timeFormat === 24 ? TimeFormat.TWENTY_FOUR_HOUR : TimeFormat.TWELVE_HOUR;
};

/**
 * Retrieves the browsers time format preference, checking local storage first
 * for a user set preference. If no preference is found, it will use the browser
 * locale to determine the time format and store it in local storage.
 */
export const isBrowserLocale24h = () => {
  const localStorageTimeFormat = getIs24hClockFromLocalStorage();
  // If time format is already stored in the browser then retrieve and return early
  if (localStorageTimeFormat === true) {
    return true;
  } else if (localStorageTimeFormat === false) {
    return false;
  }
  // Use Intl.DateTimeFormat.resolvedOptions().hour12 for accurate locale detection
  // This correctly handles locales with non-Latin AM/PM markers (ar, el, zh-TW, etc.)
  const dtf = new Intl.DateTimeFormat(undefined, { hour: "numeric" });
  const is12h = dtf.resolvedOptions().hour12 === true;
  setIs24hClockInLocalStorage(!is12h);
  return !is12h;
};

/**
 * Returns the time format string based on whether the current set locale is 24h or 12h.
 */
export const detectBrowserTimeFormat = isBrowserLocale24h()
  ? TimeFormat.TWENTY_FOUR_HOUR
  : TimeFormat.TWELVE_HOUR;
