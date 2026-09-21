import type { IntervalLimitKey, IntervalLimitUnit } from "./intervalLimitSchema";

export const ascendingLimitKeys: IntervalLimitKey[] = ["PER_DAY", "PER_WEEK", "PER_MONTH", "PER_YEAR"];

export const descendingLimitKeys = [...ascendingLimitKeys].reverse();

function isIntervalLimitUnit(value: string): value is IntervalLimitUnit {
  return ["day", "week", "month", "year"].includes(value); // Replace with actual values
}
/**
 * Turns `PER_DAY` into `day`, `PER_WEEK` into `week` etc.
 */
export function intervalLimitKeyToUnit(key: IntervalLimitKey): IntervalLimitUnit {
  const extracted = key.split("_")[1].toLowerCase();
  if (isIntervalLimitUnit(extracted)) return extracted;
  throw new Error(`Invalid interval limit key: ${key}`);
}
