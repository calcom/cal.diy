import { useState } from "react";

import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { calculatePeriodLimits, isTimeViolatingFutureLimit } from "@calcom/lib/isOutOfBounds";
import type { PeriodData } from "@calcom/types/Event";
import { Button } from "@calcom/ui/components/button";
import { Dialog, DialogContent, DialogFooter, DialogClose } from "@calcom/ui/components/dialog";

// Determines if the next month will pass the booking limits for 'ROLLING' and 'RANGE' period types
const useNoFutureAvailability = (browsingDate: Dayjs, periodData: PeriodData) => {
  const { periodDays, periodType, periodCountCalendarDays, periodEndDate, periodStartDate } = periodData;
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
  // Check if limit is before start of next month
  const isOutOfBoundsByPeriod = isTimeViolatingFutureLimit({
    time: browsingDate.add(1, "month").startOf("month").toDate(),
    periodLimits,
  });
  return isOutOfBoundsByPeriod;
};

// Creates message to use in dialog explaining lack of availability based on period type
const useDescription = (noFutureAvailability: boolean, p: PeriodData) => {
  const { t } = useLocale();

  if (!noFutureAvailability) return "";

  if (p.periodType === "ROLLING") {
    const daysDescription = p.periodCountCalendarDays ? t("calendar_days") : t("business_days");
    return t("no_availability_rolling", { days: `${p.periodDays} ${daysDescription}` });
  }

  if (p.periodType === "RANGE") {
    return t("no_availability_range", { date: dayjs(p.periodEndDate).format("MMMM D YYYY") });
  }

  return "";
};

// This component is used to show a dialog when there is no availability in the selected month.
const NoAvailabilityDialog = ({
  month,
  nextMonthButton,
  browsingDate,
  periodData,
  onJumpToStart,
}: {
  month: string | null;
  nextMonthButton: () => void;
  browsingDate: Dayjs;
  periodData: PeriodData;
  onJumpToStart?: () => void;
}) => {
  const { t } = useLocale();
  const [isOpenDialog, setIsOpenDialog] = useState(true);

  const noFutureAvailability = useNoFutureAvailability(browsingDate, periodData);
  const description = useDescription(noFutureAvailability, periodData);
  const isBeforeBookingWindow =
    periodData.periodType === "RANGE" &&
    !!periodData.periodStartDate &&
    dayjs().isBefore(dayjs(periodData.periodStartDate), "month");
  const beforeWindowDescription = isBeforeBookingWindow
    ? t("bookings_open_on_date", { date: dayjs(periodData.periodStartDate).format("MMMM D, YYYY") })
    : "";

  const closeDialog = () => {
    setIsOpenDialog(false);
  };

  const jumpToStartMonth = () => {
    if (onJumpToStart) {
      onJumpToStart();
      setIsOpenDialog(false);
      return;
    }

    if (!periodData.periodStartDate) {
      return;
    }

    const monthsToJump = dayjs(periodData.periodStartDate)
      .startOf("month")
      .diff(browsingDate.startOf("month"), "month");

    if (monthsToJump <= 0) {
      setIsOpenDialog(false);
      return;
    }

    let remainingJumps = monthsToJump;
    const stepForward = () => {
      nextMonthButton();
      remainingJumps -= 1;

      if (remainingJumps > 0) {
        setTimeout(stepForward, 0);
      }
    };

    stepForward();
    setIsOpenDialog(false);
  };

  return (
    <Dialog
      open={isOpenDialog}
      onOpenChange={(open) => {
        setIsOpenDialog(open);
      }}>
      <DialogContent
        title={t("no_availability_in_month", { month: month })}
        type="creation"
        description={isBeforeBookingWindow ? beforeWindowDescription : description}
        preventCloseOnOutsideClick={isBeforeBookingWindow}>
        <DialogFooter>
          {!isBeforeBookingWindow && (
            <DialogClose
              color={noFutureAvailability ? "primary" : "secondary"}
              onClick={closeDialog}
              data-testid="close_dialog_button">
              {t("close")}
            </DialogClose>
          )}
          {isBeforeBookingWindow && (
            <Button color="primary" onClick={jumpToStartMonth} data-testid="jump_to_first_available_slot">
              {t("show_available_slots")}
            </Button>
          )}
          {!isBeforeBookingWindow && !noFutureAvailability && (
            <Button
              color="primary"
              onClick={nextMonthButton}
              data-testid="view_next_month"
              EndIcon="arrow-right">
              {t("view_next_month")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NoAvailabilityDialog;
