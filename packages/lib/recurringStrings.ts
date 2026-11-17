import { Frequency } from "@calcom/prisma/zod-utils";
import type { RecurringEvent } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";

export const getRecurringFreq = ({
  t,
  recurringEvent,
}: {
  t: TFunction;
  recurringEvent: RecurringEvent;
}): string => {
  if (recurringEvent.interval && recurringEvent.freq >= 0) {
    return t("every_for_freq", {
      freq: `${recurringEvent.interval > 1 ? recurringEvent.interval : ""} ${t(
        Frequency[recurringEvent.freq].toString().toLowerCase(),
        {
          count: recurringEvent.interval,
        }
      )}`,
    });
  }
  return "";
};

export const getEveryFreqFor = ({
  t,
  recurringEvent,
  recurringCount,
  recurringFreq,
}: {
  t: TFunction;
  recurringEvent: RecurringEvent;
  recurringCount?: number;
  recurringFreq?: string;
}): string => {
  if (recurringEvent.freq != null) {
    return `${recurringFreq || getRecurringFreq({ t, recurringEvent })} ${
      recurringCount || recurringEvent.count
    } ${t("occurrence", {
      count: recurringCount || recurringEvent.count,
    })}`;
  }
  return "";
};
