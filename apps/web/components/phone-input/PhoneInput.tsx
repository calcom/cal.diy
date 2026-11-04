"use client";

import { isSupportedCountry } from "libphonenumber-js";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";

import { useIsPlatform } from "@calcom/atoms/hooks/useIsPlatform";
import { type CountryCode, useBookerStore } from "@calcom/features/bookings/Booker/store";
import { trpc } from "@calcom/trpc/react";
import classNames from "@calcom/ui/classNames";
import { CUSTOM_PHONE_MASKS } from "./phone-masks";

export type PhoneInputProps = {
  value?: string;
  id?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  name?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  defaultCountry?: string;
  inputStyle?: CSSProperties;
  flagButtonStyle?: CSSProperties;
};

function BasePhoneInput({
  name,
  className = "",
  onChange,
  value,
  defaultCountry = "us",
  ...rest
}: PhoneInputProps) {
  const isPlatform = useIsPlatform();
  const defaultPhoneCountryFromStore = useBookerStore((state) => state.defaultPhoneCountry);
  const effectiveDefaultCountry = defaultPhoneCountryFromStore || defaultCountry;

  // This is to trigger validation on prefill value changes
  useEffect(() => {
    if (!value) return;

    const sanitized = value
      .trim()
      .replace(/[^\d+]/g, "")
      .replace(/^\+?/, "+");

    if (sanitized === "+" || sanitized === "") return;

    if (value !== sanitized) {
      onChange(sanitized);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isPlatform) {
    return (
      <BasePhoneInputWeb name={name} className={className} onChange={onChange} value={value} {...rest} />
    );
  }

  return (
    <PhoneInput
      {...rest}
      value={value ? value.trim().replace(/^\+?/, "+") : undefined}
      enableSearch
      disableSearchIcon
      country={effectiveDefaultCountry}
      masks={CUSTOM_PHONE_MASKS}
      inputProps={{
        name,
        required: rest.required,
        placeholder: rest.placeholder,
        autoComplete: "tel",
      }}
      onChange={(val: string) => {
        onChange(val.startsWith("+") ? val : `+${val}`);
      }}
      containerClass={classNames(
        "hover:border-emphasis focus-within:border-emphasis border-default !bg-default rounded-md border focus-within:outline-none focus-within:ring-0 focus-within:ring-brand-default disabled:cursor-not-allowed",
        className
      )}
      inputClass="text-sm focus:ring-0 !bg-default text-default placeholder:text-muted"
      buttonClass="text-emphasis !bg-default"
      searchClass="!text-default !bg-default"
      dropdownClass="!text-default !bg-default"
      inputStyle={{ width: "inherit", border: 0 }}
      searchStyle={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        padding: "6px 12px",
        gap: "8px",
        width: "296px",
        height: "28px",
        marginLeft: "-4px",
      }}
      dropdownStyle={{ width: "max-content" }}
    />
  );
}

function BasePhoneInputWeb({
  name,
  className = "",
  onChange,
  value,
  inputStyle,
  flagButtonStyle,
  ...rest
}: Omit<PhoneInputProps, "defaultCountry">) {
  const defaultCountry = useDefaultCountry();

  return (
    <PhoneInput
      {...rest}
      value={value ? value.trim().replace(/^\+?/, "+") : undefined}
      // react-phone-input-2 treats `country` as a fallback. Keeping it stable 
      // preserves calling-code-only values like `+371` during async updates, 
      // while full international numbers still resolve their country from `value`.
      country={defaultCountry}
      enableSearch
      disableSearchIcon
      masks={CUSTOM_PHONE_MASKS}
      inputProps={{
        name,
        required: rest.required,
        placeholder: rest.placeholder,
        autoComplete: "tel",
      }}
      onChange={(val: string) => {
        onChange(val.startsWith("+") ? val : `+${val}`);
      }}
      containerClass={classNames(
        "hover:border-emphasis focus-within:border-emphasis border-default !bg-default rounded-md border focus-within:outline-none focus-within:ring-0 focus-within:ring-brand-default disabled:cursor-not-allowed",
        className
      )}
      inputClass="text-sm focus:ring-0 !bg-default text-default placeholder:text-muted"
      buttonClass="text-emphasis !bg-default"
      buttonStyle={{ ...flagButtonStyle }}
      searchClass="!text-default !bg-default"
      dropdownClass="!text-default !bg-default"
      inputStyle={{ width: "inherit", border: 0, ...inputStyle }}
      searchStyle={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        padding: "6px 12px",
        gap: "8px",
        width: "296px",
        height: "28px",
        marginLeft: "-4px",
      }}
      dropdownStyle={{ width: "max-content" }}
    />
  );
}

// Maps IANA timezone to ISO 3166-1 alpha-2 country code (lowercase).
// navigator.language region is unreliable — browser language ≠ user location.
// Timezone is a much better proxy for physical location.
const TIMEZONE_COUNTRY_MAP: Record<string, CountryCode> = {
  "Asia/Kolkata": "in",
  "Asia/Calcutta": "in",
  "America/New_York": "us",
  "America/Chicago": "us",
  "America/Denver": "us",
  "America/Los_Angeles": "us",
  "America/Anchorage": "us",
  "Pacific/Honolulu": "us",
  "Europe/London": "gb",
  "Europe/Paris": "fr",
  "Europe/Berlin": "de",
  "Europe/Madrid": "es",
  "Europe/Rome": "it",
  "Europe/Amsterdam": "nl",
  "Europe/Brussels": "be",
  "Europe/Zurich": "ch",
  "Europe/Vienna": "at",
  "Europe/Stockholm": "se",
  "Europe/Oslo": "no",
  "Europe/Copenhagen": "dk",
  "Europe/Helsinki": "fi",
  "Europe/Warsaw": "pl",
  "Europe/Prague": "cz",
  "Europe/Bucharest": "ro",
  "Europe/Athens": "gr",
  "Europe/Istanbul": "tr",
  "Europe/Moscow": "ru",
  "Europe/Lisbon": "pt",
  "Europe/Dublin": "ie",
  "Asia/Tokyo": "jp",
  "Asia/Shanghai": "cn",
  "Asia/Hong_Kong": "hk",
  "Asia/Singapore": "sg",
  "Asia/Seoul": "kr",
  "Asia/Taipei": "tw",
  "Asia/Bangkok": "th",
  "Asia/Jakarta": "id",
  "Asia/Manila": "ph",
  "Asia/Kuala_Lumpur": "my",
  "Asia/Dubai": "ae",
  "Asia/Riyadh": "sa",
  "Asia/Karachi": "pk",
  "Asia/Dhaka": "bd",
  "Asia/Colombo": "lk",
  "Asia/Kathmandu": "np",
  "Asia/Ho_Chi_Minh": "vn",
  "Australia/Sydney": "au",
  "Australia/Melbourne": "au",
  "Australia/Perth": "au",
  "Pacific/Auckland": "nz",
  "America/Toronto": "ca",
  "America/Vancouver": "ca",
  "America/Mexico_City": "mx",
  "America/Sao_Paulo": "br",
  "America/Argentina/Buenos_Aires": "ar",
  "America/Santiago": "cl",
  "America/Bogota": "co",
  "America/Lima": "pe",
  "Africa/Cairo": "eg",
  "Africa/Lagos": "ng",
  "Africa/Johannesburg": "za",
  "Africa/Nairobi": "ke",
  "Africa/Casablanca": "ma",
  "Asia/Jerusalem": "il",
  "Asia/Beirut": "lb",
  "Asia/Baghdad": "iq",
  "Asia/Tehran": "ir",
};

function getResolvedTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

const useDefaultCountry = () => {
  const defaultPhoneCountryFromStore = useBookerStore((state) => state.defaultPhoneCountry);
  const [defaultCountry, setDefaultCountry] = useState<CountryCode>(defaultPhoneCountryFromStore || "us");
  const query = trpc.viewer.public.countryCode.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  useEffect(
    function refactorMeWithoutEffect() {
      if (defaultPhoneCountryFromStore) {
        setDefaultCountry(defaultPhoneCountryFromStore);
        return;
      }

      // Wait until the query has settled. Empty countryCode (no CF/Vercel
      // headers) is a valid resolved state and must fall through to the
      // timezone fallback rather than returning early.
      if (!query.isSuccess && !query.isError) {
        return;
      }

      const cc = (query.data?.countryCode ?? "").trim().toUpperCase();
      if (cc && isSupportedCountry(cc)) {
        setDefaultCountry(cc.toLowerCase() as CountryCode);
        return;
      }

      const tz = getResolvedTimezone();
      const tzCountry = tz ? TIMEZONE_COUNTRY_MAP[tz] : undefined;
      if (tzCountry && isSupportedCountry(tzCountry.toUpperCase())) {
        setDefaultCountry(tzCountry);
      }

      // For unmapped timezones, keep the initial default ("us" or whatever
      // came from the store). The previous explicit fallback used
      // `tz.startsWith("America/")` to force "us", but `America/*` covers
      // many non-US zones (Latin America, Caribbean) and would mis-detect
      // those users as US.
    },
    [query.data, query.isSuccess, query.isError, defaultPhoneCountryFromStore]
  );

  return defaultCountry;
};

export default BasePhoneInput;
