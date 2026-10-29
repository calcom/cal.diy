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

export const setIs24hClockInLocalStorage = (is24h: boolean): void =>
  localStorage.setItem(is24hLocalstorageKey, is24h.toString());

export const getIs24hClockFromLocalStorage = (): boolean | null => {
  const is24hFromLocalstorage = localStorage.getItem(is24hLocalstorageKey);

  if (is24hFromLocalstorage === null) return null;

  return is24hFromLocalstorage === "true";
};

export const getTimeFormatStringFromUserTimeFormat = (timeFormat: number | null | undefined): TimeFormat => {
  if (timeFormat === 24) {
    return TimeFormat.TWENTY_FOUR_HOUR;
  }
  return TimeFormat.TWELVE_HOUR;
};

/**
 * Retrieves the browsers time format preference, checking local storage first
 * for a user set preference. If no preference is found, it will use the browser
 * locale to determine the time format and store it in local storage.
 */
export const isBrowserLocale24h = (): boolean => {
  const localStorageTimeFormat = getIs24hClockFromLocalStorage();
  // If time format is already stored in the browser then retrieve and return early
  if (localStorageTimeFormat === true) {
    return true;
  }
  if (localStorageTimeFormat === false) {
    return false;
  }
  // Intl.DateTimeFormat with value=undefined uses local browser settings.
  if (new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12) {
    setIs24hClockInLocalStorage(false);
    return false;
  }
  
  setIs24hClockInLocalStorage(true);
  return true;
};

/**
 * Returns the time format string based on whether the current set locale is 24h or 12h.
 */
export const detectBrowserTimeFormat: TimeFormat = isBrowserLocale24h()
  ? TimeFormat.TWENTY_FOUR_HOUR
  : TimeFormat.TWELVE_HOUR;
