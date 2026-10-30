import { useEffect } from "react";
import { shallow } from "zustand/shallow";

import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import { useEmbedStyles, useSlotsViewOnSmallScreen } from "@calcom/embed-core/embed-iframe";
import { useBookerStoreContext } from "@calcom/features/bookings/Booker/BookerStoreProvider";
import { getAvailableDatesInMonth } from "@calcom/features/calendars/lib/getAvailableDatesInMonth";
import type { Slots } from "@calcom/features/calendars/lib/types";
import { daysInMonth, yyyymmdd } from "@calcom/lib/dayjs";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { weekdayNames } from "@calcom/lib/weekday";
import type { PeriodData } from "@calcom/types/Event";
import classNames from "@calcom/ui/classNames";
import { Button } from "@calcom/ui/components/button";
import { SkeletonText } from "@calcom/ui/components/skeleton";
import { Tooltip } from "@calcom/ui/components/tooltip";

import NoAvailabilityDialog from "./NoAvailabilityDialog";

export type DatePickerProps = {
  /** which day of the week to render the calendar. Usually Sunday (=0) or Monday (=1) - default: Sunday */
  weekStart?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Fires whenever a selected date is changed. */
  onChange: (date: Dayjs | null, omitUpdatingParams?: boolean) => void;
  /** Fires when the month is changed. */
  onMonthChange?: (date: Dayjs) => void;
  /** which date or dates are currently selected (not tracked from here) */
  selected?: Dayjs | Dayjs[] | null;
  /** defaults to current date. */
  minDate?: Date;
  /**
   * Latest date that can be reached via month navigation (used to disable the next-month button),
   * default = UNLIMITED. Does not by itself constrain which individual days are selectable.
   */
  maxDate?: Date;
  /** locale, any IETF language tag, e.g. "hu-HU" - defaults to Browser settings */
  locale: string;
  /** Defaults to [], which dates are not bookable. Array of valid dates like: ["2022-04-23", "2022-04-24"] */
  excludedDates?: string[];
  /** defaults to all, which dates are bookable (inverse of excludedDates) */
  includedDates?: string[];
  /** allows adding classes to the container */
  className?: string;
  /** Shows a small loading spinner next to the month name */
  isLoading?: boolean;
  /** used to query the multiple selected dates */
  eventSlug?: string;
  /** To identify days that are not available and should display OOO and redirect if toUser exists */
  slots?: Slots;
  periodData?: PeriodData;
  // Whether this is a compact sidebar view or main monthly view
  isCompact?: boolean;
  // Whether to show the no availability dialog
  showNoAvailabilityDialog?: boolean;
};

const Day = ({
  date,
  active,
  disabled,
  away,
  emoji,
  customClassName,
  showMonthTooltip,
  isFirstDayOfNextMonth,
  ...props
}: JSX.IntrinsicElements["button"] & {
  active: boolean;
  date: Dayjs;
  away?: boolean;
  emoji?: string | null;
  customClassName?: {
    dayContainer?: string;
    dayActive?: string;
  };
  showMonthTooltip?: boolean;
  isFirstDayOfNextMonth?: boolean;
}) => {
  const { t } = useLocale();
  const enabledDateButtonEmbedStyles = useEmbedStyles("enabledDateButton");
  const disabledDateButtonEmbedStyles = useEmbedStyles("disabledDateButton");

  const buttonContent = (
    <button
      type="button"
      style={disabled ? { ...disabledDateButtonEmbedStyles } : { ...enabledDateButtonEmbedStyles }}
      className={classNames(
        "disabled:text-bookinglighter absolute bottom-0 left-0 right-0 top-0 mx-auto w-full cursor-pointer rounded-md border-2 border-transparent text-center text-sm font-medium transition disabled:cursor-default disabled:border-transparent disabled:font-light ",
        active
          ? "bg-brand-default text-brand"
          : !disabled
            ? `${
                !customClassName?.dayActive
                  ? "hover:border-brand-default text-emphasis bg-emphasis"
                  : `hover:border-brand-default ${customClassName.dayActive}`
              }`
            : `${customClassName ? "" : " text-mute"}`
      )}
      data-testid="day"
      data-disabled={disabled}
      disabled={disabled}
      {...props}>
      {away && <span data-testid="away-emoji">{emoji}</span>}
      {!away && date.date()}
      {date.isToday() && (
        <span
          className={classNames(
            "bg-brand-default absolute left-1/2 top-1/2 flex h-[5px] w-[5px] -translate-x-1/2 translate-y-[8px] items-center justify-center rounded-full align-middle sm:translate-y-[12px]",
            active && "bg-brand-accent"
          )}>
          <span className="sr-only">{t("today")}</span>
        </span>
      )}
    </button>
  );

  const content = showMonthTooltip ? (
    <Tooltip content={date.format("MMMM")}>{buttonContent}</Tooltip>
  ) : (
    buttonContent
  );

  return (
    <>
      {isFirstDayOfNextMonth && (
        <div
          className={classNames(
            "absolute top-0 z-10 mx-auto w-fit rounded-full font-semibold uppercase tracking-wide",
            active ? "text-white" : "text-default",
            disabled && "bg-emphasis"
          )}
          style={{
            fontSize: "10px",
            lineHeight: "13px",
            padding: disabled ? "0 3px" : "3px 3px 3px 4px",
          }}>
          {date.format("MMM")}
        </div>
      )}
      {content}
    </>
  );
};

const Days = ({
  minDate,
  excludedDates = [],
  browsingDate,
  weekStart,
  DayComponent = Day,
  selected,
  month,
  nextMonthButton,
  eventSlug,
  slots,
  customClassName,
  isBookingInPast,
  periodData,
  isCompact,
  showNoAvailabilityDialog = true,
  ...props
}: Omit<DatePickerProps, "locale" | "className" | "weekStart"> & {
  DayComponent?: React.FC<React.ComponentProps<typeof Day>>;
  browsingDate: Dayjs;
  weekStart: number;
  month: string | null;
  nextMonthButton: () => void;
  customClassName?: {
    datePickerDate?: string;
    datePickerDateActive?: string;
  };
  scrollToTimeSlots?: () => void;
  isBookingInPast: boolean;
  periodData: PeriodData;
  isCompact?: boolean;
}) => {
  const slotsViewOnSmallScreen = useSlotsViewOnSmallScreen();

  const includedDates = getAvailableDatesInMonth({
    browsingDate: browsingDate.toDate(),
    minDate,
    includedDates: props.includedDates,
  });
  const shouldShowBeforeWindowDialog =
    periodData.periodType === "RANGE" &&
    !!periodData.periodStartDate &&
    dayjs().isBefore(dayjs(periodData.periodStartDate), "month") &&
    dayjs().isSame(browsingDate, "month");
  const isPreWindowRange =
    periodData.periodType === "RANGE" &&
    !!periodData.periodStartDate &&
    dayjs().isBefore(dayjs(periodData.periodStartDate), "month");
  const shouldShowRegularNoAvailabilityDialog =
    !isPreWindowRange && !!includedDates && includedDates.length === 0;

  const today = dayjs();
  const firstDayOfMonth = browsingDate.startOf("month");
  const isSecondWeekOver = today.isAfter(firstDayOfMonth.add(2, "week"));
  let days: (Dayjs | null)[] = [];

  const getPadding = (day: number) => (browsingDate.set("date", day).day() - weekStart + 7) % 7;
  const totalDays = daysInMonth(browsingDate);

  const showNextMonthDays = isSecondWeekOver && !isCompact;

  // Only apply end-of-month logic for main monthly view (not compact sidebar)
  if (showNextMonthDays) {
    const startDay = 8;
    const pad = getPadding(startDay);
    days = Array(pad).fill(null);

    for (let day = startDay; day <= totalDays; day++) {
      days.push(browsingDate.set("date", day));
    }

    const remainingInRow = days.length % 7;
    const extraDays = (remainingInRow > 0 ? 7 - remainingInRow : 0) + 7;
    const nextMonth = browsingDate.add(1, "month");

    // Add days starting from day 1 of next month
    for (let i = 0; i < extraDays; i++) {
      days.push(nextMonth.set("date", 1 + i));
    }
  } else {
    // Traditional calendar grid logic for compact sidebar or early in month
    const pad = getPadding(1);
    days = Array(pad).fill(null);

    for (let day = 1; day <= totalDays; day++) {
      days.push(browsingDate.set("date", day));
    }
  }

  const [selectedDatesAndTimes] = useBookerStoreContext((state) => [state.selectedDatesAndTimes], shallow);

  const isActive = (day: dayjs.Dayjs) => {
    // for selecting a range of dates
    if (Array.isArray(selected)) {
      return Array.isArray(selected) && selected?.some((e) => yyyymmdd(e) === yyyymmdd(day));
    }

    if (selected && yyyymmdd(selected) === yyyymmdd(day)) {
      return true;
    }

    // for selecting multiple dates for an event
    if (
      eventSlug &&
      selectedDatesAndTimes &&
      selectedDatesAndTimes[eventSlug as string] &&
      Object.keys(selectedDatesAndTimes[eventSlug as string]).length > 0
    ) {
      return Object.keys(selectedDatesAndTimes[eventSlug as string]).some((date) => {
        return yyyymmdd(dayjs(date)) === yyyymmdd(day);
      });
    }

    return false;
  };

  const daysToRenderForTheMonth = days.map((day) => {
    if (!day) return { day: null, disabled: true };

    const dateKey = yyyymmdd(day);
    const daySlots = slots?.[dateKey] || [];
    const oooInfo = daySlots.find((slot) => slot.away) || null;

    const isNextMonth = day.month() !== browsingDate.month();
    const isFirstDayOfNextMonth = isSecondWeekOver && !isCompact && isNextMonth && day.date() === 1;

    const included = includedDates?.includes(dateKey);
    const excluded = excludedDates.includes(dateKey);

    const hasAvailableSlots = daySlots.some((slot) => !slot.away);
    const isOOOAllDay = daySlots.length > 0 && daySlots.every((slot) => slot.away);
    const away = isOOOAllDay;

    // OOO dates are selectable only if there's a redirect user OR the note is public
    const oooIsSelectable = oooInfo?.toUser || oooInfo?.showNotePublicly;
    const disabled = away ? !oooIsSelectable : isNextMonth ? !hasAvailableSlots : !included || excluded;

    return {
      day,
      disabled,
      away,
      emoji: oooInfo?.emoji,
      isFirstDayOfNextMonth,
    };
  });

  /**
   * Takes care of selecting a valid date in the month if the selected date is not available in the month
   */

  const useHandleInitialDateSelection = () => {
    // Don't auto-select date when slots view on small screen is enabled on mobile
    if (slotsViewOnSmallScreen) {
      return;
    }

    // Let's not do something for now in case of multiple selected dates as behaviour is unclear and it's not needed at the moment
    if (selected instanceof Array) {
      return;
    }
    const firstAvailableDateOfTheMonth = daysToRenderForTheMonth.find((day) => !day.disabled)?.day;
    const isSelectedDateAvailable = selected
      ? daysToRenderForTheMonth.some(({ day, disabled }) => {
          if (day && yyyymmdd(day) === yyyymmdd(selected) && !disabled) return true;
        })
      : false;
    if (!isSelectedDateAvailable && firstAvailableDateOfTheMonth) {
      // If selected date not available in the month, select the first available date of the month
      const shouldOmitUpdatingParams = selected?.isValid() ? false : true; // In case a date is selected and it is not available, then we have to change search params
      props.onChange(firstAvailableDateOfTheMonth, shouldOmitUpdatingParams);
    }
    if (isSelectedDateAvailable) {
      props.onChange(dayjs(selected), true);
    }
    if (!firstAvailableDateOfTheMonth) {
      props.onChange(null);
    }
  };

  useEffect(useHandleInitialDateSelection);

  return (
    <>
      {daysToRenderForTheMonth.map(({ day, disabled, away, emoji, isFirstDayOfNextMonth }, idx) => (
        <div key={day === null ? `e-${idx}` : `day-${day.format()}`} className="relative w-full pt-[100%]">
          {day === null ? (
            <div key={`e-${idx}`} />
          ) : props.isLoading ? (
            <button
              className="bg-cal-muted text-muted absolute bottom-0 left-0 right-0 top-0 mx-auto flex w-full items-center justify-center rounded-sm border-transparent text-center font-medium opacity-90 transition"
              key={`e-${idx}`}
              disabled>
              <SkeletonText className="h-8 w-9" />
            </button>
          ) : (
            <DayComponent
              customClassName={{
                dayContainer: customClassName?.datePickerDate,
                dayActive: customClassName?.datePickerDateActive,
              }}
              date={day}
              onClick={() => {
                props.onChange(day);
                props?.scrollToTimeSlots?.();
              }}
              disabled={disabled}
              active={isActive(day)}
              away={away}
              emoji={emoji}
              showMonthTooltip={showNextMonthDays && !disabled && day.month() !== browsingDate.month()}
              isFirstDayOfNextMonth={isFirstDayOfNextMonth}
            />
          )}
        </div>
      ))}
      {!props.isLoading &&
        !isBookingInPast &&
        (shouldShowBeforeWindowDialog || shouldShowRegularNoAvailabilityDialog) &&
        showNoAvailabilityDialog && (
          <NoAvailabilityDialog
            month={month}
            nextMonthButton={nextMonthButton}
            browsingDate={browsingDate}
            periodData={periodData}
            onJumpToStart={() => {
              if (periodData.periodStartDate && props.onMonthChange) {
                props.onMonthChange(dayjs(periodData.periodStartDate).startOf("month"));
              }
            }}
          />
        )}
    </>
  );
};

const DatePicker = ({
  weekStart = 0,
  className,
  locale,
  selected,
  onMonthChange,
  slots,
  customClassNames,
  includedDates,
  periodData = {
    periodStartDate: null,
    periodEndDate: null,
    periodCountCalendarDays: null,
    periodDays: null,
    periodType: "UNLIMITED",
  },
  isCompact,
  showNoAvailabilityDialog,
  ...passThroughProps
}: DatePickerProps &
  Partial<React.ComponentProps<typeof Days>> & {
    customClassNames?: {
      datePickerTitle?: string;
      datePickerDays?: string;
      datePickersDates?: string;
      datePickerDatesActive?: string;
      datePickerToggle?: string;
    };
    scrollToTimeSlots?: () => void;
  }) => {
  const minDate = passThroughProps.minDate;
  const maxDate = passThroughProps.maxDate;
  const rawBrowsingDate = passThroughProps.browsingDate || dayjs().startOf("month");
  const shouldKeepCurrentMonthForBeforeWindowDialog =
    showNoAvailabilityDialog &&
    periodData.periodType === "RANGE" &&
    !!periodData.periodStartDate &&
    dayjs().isBefore(dayjs(periodData.periodStartDate), "month");
  const browsingDate =
    !shouldKeepCurrentMonthForBeforeWindowDialog && minDate && rawBrowsingDate.valueOf() < minDate.valueOf()
      ? dayjs(minDate)
      : rawBrowsingDate;

  // ✅ FIX: disable prev/next navigation outside the booking window
  const isPrevDisabled =
    !browsingDate.isAfter(dayjs()) || (!!minDate && !browsingDate.isAfter(dayjs(minDate), "month"));
  const isNextDisabled = !!maxDate && !browsingDate.isBefore(dayjs(maxDate), "month");

  const { i18n, t } = useLocale();
  const bookingData = useBookerStoreContext((state) => state.bookingData);
  const isBookingInPast = bookingData ? new Date(bookingData.endTime) < new Date() : false;
  const changeMonth = (newMonth: number) => {
    if (onMonthChange) {
      onMonthChange(browsingDate.add(newMonth, "month"));
    }
  };
  const month = browsingDate
    ? new Intl.DateTimeFormat(i18n.language, { month: "long" }).format(
        new Date(browsingDate.year(), browsingDate.month())
      )
    : null;

  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between text-xl">
        <span className="text-default w-1/2 text-base">
          {browsingDate ? (
            <time dateTime={browsingDate.format("YYYY-MM")} data-testid="selected-month-label">
              <strong
                className={classNames(`text-emphasis font-semibold`, customClassNames?.datePickerTitle)}>
                {month}
              </strong>{" "}
              <span className={classNames(`text-subtle font-medium`, customClassNames?.datePickerTitle)}>
                {browsingDate.format("YYYY")}
              </span>
            </time>
          ) : (
            <SkeletonText className="h-8 w-24" />
          )}
        </span>
        <div className="text-emphasis">
          <div className="flex">
            <Button
              className={classNames(
                `group p-1 opacity-70 transition hover:opacity-100 rtl:rotate-180`,
                isPrevDisabled && `disabled:text-bookinglighter hover:bg-background hover:opacity-70`,
                customClassNames?.datePickerToggle
              )}
              onClick={() => changeMonth(-1)}
              disabled={isPrevDisabled}
              data-testid="decrementMonth"
              color="minimal"
              variant="icon"
              StartIcon="chevron-left"
              aria-label={t("view_previous_month")}
            />
            <Button
              className={classNames(
                `group p-1 opacity-70 transition hover:opacity-100 rtl:rotate-180`,
                `${customClassNames?.datePickerToggle}`
              )}
              onClick={() => changeMonth(+1)}
              disabled={isNextDisabled}
              data-testid="incrementMonth"
              color="minimal"
              variant="icon"
              StartIcon="chevron-right"
              aria-label={t("view_next_month")}
            />
          </div>
        </div>
      </div>
      <div className="border-subtle mb-2 grid grid-cols-7 gap-4 border-b border-t text-center md:mb-0 md:border-0">
        {weekdayNames(locale, weekStart, "short").map((weekDay) => (
          <div
            key={weekDay}
            className={classNames(
              `text-emphasis my-4 text-xs font-medium uppercase tracking-widest`,
              customClassNames?.datePickerDays
            )}>
            {weekDay}
          </div>
        ))}
      </div>
      <div className="relative grid grid-cols-7 grid-rows-6 gap-1 text-center">
        <Days
          customClassName={{
            datePickerDate: customClassNames?.datePickersDates,
            datePickerDateActive: customClassNames?.datePickerDatesActive,
          }}
          weekStart={weekStart}
          selected={selected}
          onMonthChange={onMonthChange}
          {...passThroughProps}
          browsingDate={browsingDate}
          month={month}
          nextMonthButton={() => changeMonth(+1)}
          slots={slots}
          includedDates={includedDates}
          isBookingInPast={isBookingInPast}
          periodData={periodData}
          isCompact={isCompact}
          showNoAvailabilityDialog={showNoAvailabilityDialog}
        />
      </div>
    </div>
  );
};

export { DatePicker, Day };
export default DatePicker;