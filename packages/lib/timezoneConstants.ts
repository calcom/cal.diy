// Using Intl directly instead of dayjs.tz.guess() so this module evaluates
// without requiring the timezone plugin to be extended first. When this file
// ends up in a vendor chunk that loads before `@calcom/dayjs/index.ts`
// (e.g. inside the bundled `@calcom/atoms` package), `dayjs.tz` is undefined
// and accessing `.guess()` crashes at module-eval time. `Intl.DateTimeFormat`
// is what `dayjs.tz.guess()` wraps internally and has no plugin dependency.
// `timeZone` is a string per ECMA-402, but can be undefined on non-conformant
// engines; fall back so the `.indexOf` below never throws in those cases.
const guessedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";

export const IS_EUROPE = guessedTimezone.startsWith("Europe/");
export const CURRENT_TIMEZONE = guessedTimezone !== "Etc/Unknown" ? guessedTimezone : "Europe/London";
