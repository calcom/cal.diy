import { shallow } from "zustand/shallow";
import { useEffect, useRef } from "react";

import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import { useBookerStoreContext } from "@calcom/features/bookings/Booker/BookerStoreProvider";
import type { DatePickerClassNames } from "@calcom/features/bookings/Booker/types";
import { DatePicker as DatePickerComponent } from "@calcom/features/calendars/components/DatePicker";
import { useNonEmptyScheduleDays } from "@calcom/web/modules/schedules/hooks/useNonEmptyScheduleDays";
import { weekdayToWeekIndex } from "@calcom/lib/dayjs";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { User } from "@calcom/prisma/client";
import type { PeriodData } from "@calcom/types/Event";
import { useSlotsViewOnSmallScreen } from "@calcom/embed-core/embed-iframe";

import type { Slots } from "@calcom/features/bookings/types";

const useMoveToNextMonthOnNoAvailability = ({
  browsingDate,
  nonEmptyScheduleDays,
  onMonthChange,
  isLoading,
}: {
  browsingDate: Dayjs;
  nonEmptyScheduleDays: string[];
  isLoading: boolean;
  onMonthChange: (date: Dayjs) => void;
}) => {
  if (isLoading) {
    return {
      moveToNextMonthOnNoAvailability: () => {
        /* return noop until ready */
      },
    };
  }

  const nonEmptyScheduleDaysInBrowsingMonth = nonEmptyScheduleDays.filter((date) =>
    dayjs(date).isSame(browsingDate, "month")
  );

  const moveToNextMonthOnNoAvailability = () => {
    const currentMonth = dayjs().startOf("month").format("YYYY-MM");
    const browsingMonth = browsingDate.format("YYYY-MM");
    // Not meeting the criteria to move to next month
    // Has to be currentMonth and it must have all days unbookable
    if (currentMonth != browsingMonth || nonEmptyScheduleDaysInBrowsingMonth.length) {
      return;
    }
    onMonthChange(browsingDate.add(1, "month"));
  };
  return {
    moveToNextMonthOnNoAvailability,
  };
};

export const DatePicker = ({
  event,
  slots = {},
  isLoading,
  classNames,
  scrollToTimeSlots,
  showNoAvailabilityDialog = true,
  onDateChange,
}: {
  event: {
    data?: {
      subsetOfUsers: Pick<User, "weekStart">[];
      periodType?: PeriodData["periodType"];
      periodStartDate?: PeriodData["periodStartDate"];
      periodEndDate?: PeriodData["periodEndDate"];
      periodDays?: PeriodData["periodDays"];
      periodCountCalendarDays?: PeriodData["periodCountCalendarDays"];
    } | null;
  };
  slots?: Slots;
  isLoading?: boolean;
  classNames?: DatePickerClassNames;
  scrollToTimeSlots?: () => void;
  showNoAvailabilityDialog?: boolean;
  onDateChange?: () => void;
}) => {
  const { i18n } = useLocale();
  const [month, selectedDate, layout] = useBookerStoreContext(
    (state) => [state.month, state.selectedDate, state.layout],
    shallow
  );

  const [setSelectedDate, setMonth, setDayCount] = useBookerStoreContext(
    (state) => [state.setSelectedDate, state.setMonth, state.setDayCount],
    shallow
  );

  const slotsViewOnSmallScreen = useSlotsViewOnSmallScreen();

  const onMonthChange = (date: Dayjs) => {
    setMonth(date.format("YYYY-MM"));
    if (!slotsViewOnSmallScreen) {
      setSelectedDate({ date: date.format("YYYY-MM-DD") });
    }
    setDayCount(null); // Whenever the month is changed, we nullify getting X days
  };

  // ✅ FIX: when the booking window is a future RANGE, jump to its start month
  const periodStartDate = event?.data?.periodStartDate;
  const periodEndDate = event?.data?.periodEndDate;
  const periodType = event?.data?.periodType;
  const isBeforeWindowRangeWithDialog =
    showNoAvailabilityDialog !== false &&
    periodType === "RANGE" &&
    !!periodStartDate &&
    dayjs().isBefore(dayjs(periodStartDate), "day");
  const hasSelectedDateOutsideCurrentMonth =
    !!selectedDate && dayjs(selectedDate).isValid() && !dayjs(selectedDate).isSame(dayjs(), "month");
  const hasSyncedCurrentMonthForDialog = useRef(false);

  useEffect(() => {
    if (!isBeforeWindowRangeWithDialog) return;
    if (hasSyncedCurrentMonthForDialog.current) return;
    if (hasSelectedDateOutsideCurrentMonth) {
      hasSyncedCurrentMonthForDialog.current = true;
      return;
    }

    const currentMonth = dayjs().startOf("month").format("YYYY-MM");
    hasSyncedCurrentMonthForDialog.current = true;
    if (month !== currentMonth) {
      setMonth(currentMonth);
    }
  }, [hasSelectedDateOutsideCurrentMonth, isBeforeWindowRangeWithDialog, month, setMonth]);

  useEffect(() => {
    if (showNoAvailabilityDialog !== false) return;
    if (periodType !== "RANGE" || !periodStartDate) return;
    const periodStart = dayjs(periodStartDate);
    if (dayjs().isBefore(periodStart, "month")) {
      setMonth(periodStart.format("YYYY-MM"));
    }
  }, [periodType, periodStartDate?.toString(), setMonth, showNoAvailabilityDialog]);

  const nonEmptyScheduleDays = useNonEmptyScheduleDays(slots);
  const browsingDate = month ? dayjs(month) : dayjs().startOf("month");

  const { moveToNextMonthOnNoAvailability } = useMoveToNextMonthOnNoAvailability({
    browsingDate,
    nonEmptyScheduleDays,
    onMonthChange,
    isLoading: isLoading ?? true,
  });
  if (!isBeforeWindowRangeWithDialog) {
    moveToNextMonthOnNoAvailability();
  }

  // Determine if this is a compact sidebar view based on layout
  const isCompact = layout !== "month_view" && layout !== "mobile";

  const periodData: PeriodData = {
    ...{
      periodType: "UNLIMITED",
      periodStartDate: null,
      periodEndDate: null,
      periodDays: null,
      periodCountCalendarDays: false,
    },
    ...(event?.data && {
      periodType: event.data.periodType,
      periodStartDate: event.data.periodStartDate,
      periodEndDate: event.data.periodEndDate,
      periodDays: event.data.periodDays,
      periodCountCalendarDays: event.data.periodCountCalendarDays,
    }),
  };

  return (
    <DatePickerComponent
      customClassNames={{
        datePickerTitle: classNames?.datePickerTitle,
        datePickerDays: classNames?.datePickerDays,
        datePickersDates: classNames?.datePickerDate,
        datePickerDatesActive: classNames?.datePickerDatesActive,
        datePickerToggle: classNames?.datePickerToggle,
      }}
      className={classNames?.datePickerContainer}
      isLoading={isLoading}
      onChange={(date: Dayjs | null, omitUpdatingParams?: boolean) => {
        const newDate = date === null ? null : date.format("YYYY-MM-DD");
        const previousDate = selectedDate;
        const dateChanged = newDate !== previousDate;

        setSelectedDate({
          date: date === null ? null : date.format("YYYY-MM-DD"),
          omitUpdatingParams,
          preventMonthSwitching: !isCompact, // Prevent month switching when in monthly view
        });

        if (dateChanged) {
          onDateChange?.();
        }
      }}
      onMonthChange={onMonthChange}
      includedDates={nonEmptyScheduleDays}
      locale={i18n.language}
      browsingDate={month ? dayjs(month) : undefined}
      selected={dayjs(selectedDate)}
      weekStart={weekdayToWeekIndex(event?.data?.subsetOfUsers?.[0]?.weekStart)}
      slots={slots}
      scrollToTimeSlots={scrollToTimeSlots}
      periodData={periodData}
      isCompact={isCompact}
      showNoAvailabilityDialog={showNoAvailabilityDialog}
      minDate={periodType === "RANGE" && periodStartDate ? periodStartDate : undefined}
      maxDate={periodType === "RANGE" && periodEndDate ? periodEndDate : undefined}
    />
  );
};
