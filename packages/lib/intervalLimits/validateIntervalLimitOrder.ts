import { ascendingLimitKeys } from "./intervalLimit";
import type { IntervalLimit } from "./intervalLimitSchema";

export const validateIntervalLimitOrder = (input: IntervalLimit): boolean => {
  const limits = ascendingLimitKeys.map((key) => input[key]).filter((limit) => limit !== undefined);

  return limits.every((limit, index) => index === 0 || limits[index - 1] <= limit);
};
