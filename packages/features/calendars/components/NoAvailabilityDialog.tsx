import { useState } from "react";

import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import {
  calculatePeriodLimits,
  isTimeViolatingFutureLimit,
} from "@calcom/lib/isOutOfBounds";
import type { PeriodData } from "@calcom/types/Event";
import { Button } from "@calcom/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogClose,
} from "@calcom/ui/components/dialog";

// Determines if the next month will pass the booking limits for 'ROLLING' and 'RANGE' period types
const useNoFutureAvailability = (
  browsingDate: Dayjs,
  periodData: PeriodData,
) => {
  const {
    periodDays,
    periodType,
    periodCountCalendarDays,
    periodEndDate,
    periodStartDate,
  } = periodData;
  const periodLimits = calculatePeriodLimits({
    periodType,
    periodDays,
    periodCountCalendarDays,
    periodStartDate,
    periodEndDate,
    allDatesWithBookabilityStatusInBookerTz: null, // Temporary workaround
    _skipRollingWindowCheck: true,
    eventUtcOffset: 0,
    bookerUtcOffset: 0,
  });

  const nextMonthStart = browsingDate.add(1, "month").startOf("month");

  const isBeforeRangeStart =
    !!periodLimits.startOfRangeStartDayInEventTz &&
    nextMonthStart.toDate().valueOf() <
      periodLimits.startOfRangeStartDayInEventTz.valueOf();

  const isOutOfBoundsByPeriod = isTimeViolatingFutureLimit({
    time: nextMonthStart.toDate(),
    periodLimits,
  });

  return { noFutureAvailability: isOutOfBoundsByPeriod, isBeforeRangeStart };
};

// Creates message to use in dialog explaining lack of availability based on period type
const useDescription = (
  noFutureAvailability: boolean,
  isBeforeRangeStart: boolean,
  p: PeriodData,
) => {
  const { t } = useLocale();

  if (!noFutureAvailability) return "";

  if (p.periodType === "ROLLING") {
    const daysDescription = p.periodCountCalendarDays
      ? t("calendar_days")
      : t("business_days");
    return t("no_availability_rolling", {
      days: `${p.periodDays} ${daysDescription}`,
    });
  }

  if (p.periodType === "RANGE") {
    if (isBeforeRangeStart) {
      return t("no_availability_range_start", {
        date: dayjs(p.periodStartDate).format("MMMM D YYYY"),
      });
    }

    return t("no_availability_range", {
      date: dayjs(p.periodEndDate).format("MMMM D YYYY"),
    });
  }

  return "";
};

// This component is used to show a dialog when there is no availability in the selected month.
const NoAvailabilityDialog = ({
  month,
  nextMonthButton,
  browsingDate,
  periodData,
}: {
  month: string | null;
  nextMonthButton: () => void;
  browsingDate: Dayjs;
  periodData: PeriodData;
}) => {
  const { t } = useLocale();
  const [isOpenDialog, setIsOpenDialog] = useState(true);
  const { noFutureAvailability, isBeforeRangeStart } = useNoFutureAvailability(
    browsingDate,
    periodData,
  );
  const description = useDescription(
    noFutureAvailability,
    isBeforeRangeStart,
    periodData,
  );

  const closeDialog = () => {
    setIsOpenDialog(false);
  };
  return (
    <Dialog
      open={isOpenDialog}
      onOpenChange={(open) => {
        setIsOpenDialog(open);
      }}
    >
      <DialogContent
        title={t("no_availability_in_month", { month: month })}
        type="creation"
        description={description}
        preventCloseOnOutsideClick={false}
      >
        <DialogFooter>
          <DialogClose
            color={noFutureAvailability ? "primary" : "secondary"}
            onClick={closeDialog}
            data-testid="close_dialog_button"
          >
            {t("close")}
          </DialogClose>
          {!noFutureAvailability && (
            <Button
              color="primary"
              onClick={nextMonthButton}
              data-testid="view_next_month"
              EndIcon="arrow-right"
            >
              {t("view_next_month")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NoAvailabilityDialog;
