import type { CountryCode } from "@calcom/features/bookings/Booker/store";
import { isSupportedCountry } from "libphonenumber-js";
import { TIMEZONE_COUNTRIES } from "./timezone-countries.generated";

const isCountryCode = (value: string): value is CountryCode => isSupportedCountry(value.toUpperCase());

/** Country preselected in the phone input when nothing else (booker store, IP, browser) tells it. */
export const resolveFallbackCountry = (raw: string | undefined): CountryCode => {
  const candidate = raw?.trim().toLowerCase();
  if (!candidate || !isCountryCode(candidate)) return "us";
  return candidate;
};

export const FALLBACK_COUNTRY: CountryCode = resolveFallbackCountry(
  // biome-ignore lint/correctness/noProcessGlobal: Next.js inlines `process.env.NEXT_PUBLIC_*` into the client bundle at build; a `node:process` import would not be.
  process.env.NEXT_PUBLIC_DEFAULT_PHONE_COUNTRY
);

const regionOf = (languageTag: string): string | undefined => {
  const region = languageTag.split(/[-_]/)[1];
  if (!region || region.length !== 2) return undefined;
  return region.toLowerCase();
};

/**
 * The time zone says where the device is, the language only what its owner reads: a Belgian
 * browser in fr-FR sits in Europe/Brussels, so the time zone wins.
 */
export const detectCountry = ({
  timeZone,
  languages,
}: {
  timeZone: string | undefined;
  languages: readonly string[];
}): CountryCode | null => {
  const fromTimeZone = timeZone ? TIMEZONE_COUNTRIES[timeZone] : undefined;
  if (fromTimeZone && isCountryCode(fromTimeZone)) return fromTimeZone;

  for (const language of languages) {
    const region = regionOf(language);
    if (region && isCountryCode(region)) return region;
  }
  return null;
};

export const detectBrowserCountry = (): CountryCode | null => {
  let timeZone: string | undefined;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timeZone = undefined;
  }
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return detectCountry({ timeZone, languages });
};
