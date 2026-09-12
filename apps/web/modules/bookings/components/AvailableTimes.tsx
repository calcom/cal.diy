// We do not need to worry about importing framer-motion here as it is lazy imported in Booker.

import { getPaymentAppData } from "@calcom/app-store/_utils/payments/getPaymentAppData";
import { useIsPlatform } from "@calcom/atoms/hooks/useIsPlatform";
import dayjs from "@calcom/dayjs";
import type { IOutOfOfficeData } from "@calcom/features/availability/lib/getUserAvailability";
import { useBookerStoreContext } from "@calcom/features/bookings/Booker/BookerStoreProvider";
import { useBookerTime } from "@calcom/features/bookings/Booker/hooks/useBookerTime";
import { getQueryParam } from "@calcom/features/bookings/Booker/utils/query-param";
import { useCheckOverlapWithOverlay } from "@calcom/features/bookings/lib/useCheckOverlapWithOverlay";
import type { BookerEvent, Slots } from "@calcom/features/bookings/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { localStorage } from "@calcom/lib/webstorage";
import classNames from "@calcom/ui/classNames";
import { Button } from "@calcom/ui/components/button";
import { SkeletonText } from "@calcom/ui/components/skeleton";
import { CalendarX2Icon } from "@coss/ui/icons";
import * as HoverCard from "@radix-ui/react-hover-card";
import { AnimatePresence, m } from "framer-motion";
import { useMemo } from "react";
import type { Slot } from "~/schedules/lib/types";
import type { IUseBookingLoadingStates } from "../hooks/useBookings";
import { OutOfOfficeInSlots } from "./OutOfOfficeInSlots";
import { SeatsAvailabilityText } from "./SeatsAvailabilityText";

type TOnTimeSelect = (
  time: string,
  attendees: number,
  seatsPerTimeSlot?: number | null,
  bookingUid?: string
) => void;

type TOnTentativeTimeSelect = ({
  time,
  attendees,
  seatsPerTimeSlot,
  bookingUid,
}: {
  time: string;
  attendees: number;
  seatsPerTimeSlot?: number | null;
  bookingUid?: string;
}) => void;

export type AvailableTimesProps = {
  slots: Slots[string];
  showTimeFormatToggle?: boolean;
  className?: string;
  // It is called when a slot is selected, but it is not a confirmation and a confirm button will be shown besides it.
  onTentativeTimeSelect?: TOnTentativeTimeSelect;
  unavailableTimeSlots?: string[];
} & Omit<SlotItemProps, "slot">;

type SlotItemProps = {
  slot: Slot;
  seatsPerTimeSlot?: number | null;
  selectedSlots?: string[];
  onTimeSelect?: TOnTimeSelect;
  onTentativeTimeSelect?: TOnTentativeTimeSelect;
  showAvailableSeatsCount?: boolean | null;
  event: {
    data?: Pick<BookerEvent, "length" | "bookingFields" | "price" | "currency" | "metadata"> | null;
  };
  customClassNames?: string;
  confirmStepClassNames?: {
    confirmButton?: string;
  };
  loadingStates?: IUseBookingLoadingStates;
  isVerificationCodeSending?: boolean;
  renderConfirmNotVerifyEmailButtonCond?: boolean;
  skipConfirmStep?: boolean;
  shouldRenderCaptcha?: boolean;
  watchedCfToken?: string;
  unavailableTimeSlots?: string[];
  confirmButtonDisabled?: boolean;
  handleSlotClick?: (slot: Slot, isOverlapping: boolean) => void;
};

const SlotItem = ({
  slot,
  seatsPerTimeSlot,
  selectedSlots,
  onTimeSelect,
  showAvailableSeatsCount,
  event,
  customClassNames,
  loadingStates,
  renderConfirmNotVerifyEmailButtonCond,
  isVerificationCodeSending,
  skipConfirmStep,
  shouldRenderCaptcha,
  watchedCfToken,
  handleSlotClick,
  onTentativeTimeSelect,
  unavailableTimeSlots = [],
  confirmButtonDisabled,
  confirmStepClassNames,
}: SlotItemProps) => {
  const { t } = useLocale();

  const { data: eventData } = event;

  const isPaidEvent = useMemo(() => {
    if (!eventData?.price) return false;
    const paymentAppData = getPaymentAppData(eventData);
    return eventData?.price > 0 && !Number.isNaN(paymentAppData.price) && paymentAppData.price > 0;
  }, [eventData]);

  const overlayCalendarToggled =
    getQueryParam("overlayCalendar") === "true" || localStorage.getItem("overlayCalendarSwitchDefault");

  const { timeFormat, timezone } = useBookerTime();
  const bookingData = useBookerStoreContext((state) => state.bookingData);
  const layout = useBookerStoreContext((state) => state.layout);
  const hasTimeSlots = !!seatsPerTimeSlot;
  const computedDateWithUsersTimezone = dayjs.utc(slot.time).tz(timezone);

  const bookingFull = !!(hasTimeSlots && slot.attendees && slot.attendees >= seatsPerTimeSlot);
  const isHalfFull = slot.attendees && seatsPerTimeSlot && slot.attendees / seatsPerTimeSlot >= 0.5;
  const isNearlyFull = slot.attendees && seatsPerTimeSlot && slot.attendees / seatsPerTimeSlot >= 0.83;
  const colorClass = isNearlyFull ? "bg-rose-600" : isHalfFull ? "bg-yellow-500" : "bg-emerald-400";

  const nowDate = dayjs();
  const usersTimezoneDate = nowDate.tz(timezone);

  const offset = (usersTimezoneDate.utcOffset() - nowDate.utcOffset()) / 60;

  const selectedTimeslot = useBookerStoreContext((state) => state.selectedTimeslot);

  const { isOverlapping, overlappingTimeEnd, overlappingTimeStart } = useCheckOverlapWithOverlay({
    start: computedDateWithUsersTimezone,
    selectedDuration: eventData?.length ?? 0,
    offset,
  });

  const onButtonClick = () => {
    if (handleSlotClick) {
      handleSlotClick(slot, isOverlapping);
    }
    if (onTentativeTimeSelect) {
      onTentativeTimeSelect({
        time: slot.time,
        attendees: slot.attendees || 0,
        seatsPerTimeSlot,
      });
    }
  };

  const isTimeslotUnavailable = unavailableTimeSlots.includes(slot.time);
  return (
    <AnimatePresence>
      <div className="flex gap-2">
        <Button
          key={slot.time}
          disabled={
            bookingFull ||
            !!(slot.bookingUid && slot.bookingUid === bookingData?.uid) ||
            loadingStates?.creatingBooking ||
            loadingStates?.creatingRecurringBooking ||
            isVerificationCodeSending ||
            (skipConfirmStep && !!shouldRenderCaptcha && !watchedCfToken) ||
            isTimeslotUnavailable
          }
          data-testid="time"
          data-disabled={bookingFull}
          data-time={slot.time}
          aria-label={
            bookingFull || isTimeslotUnavailable
              ? t("time_slot_unavailable_label", { time: computedDateWithUsersTimezone.format(timeFormat) })
              : t("book_time_slot", { time: computedDateWithUsersTimezone.format(timeFormat) })
          }
          onClick={onButtonClick}
          className={classNames(
            `hover:border-brand-default min-h-9 mb-2 flex h-auto w-full grow flex-col justify-center py-2`,
            selectedSlots?.includes(slot.time) && "border-brand-default",
            `${customClassNames}`
          )}
          color="secondary">
          <div className="flex items-center gap-2">
            {!hasTimeSlots && overlayCalendarToggled && (
              <span
                className={classNames(
                  "inline-block h-2 w-2 rounded-full",
                  isOverlapping ? "bg-rose-600" : "bg-emerald-400"
                )}
              />
            )}
            {computedDateWithUsersTimezone.format(timeFormat)}
          </div>
          {bookingFull && <p className="text-sm">{t("booking_full")}</p>}
          {hasTimeSlots && !bookingFull && (
            <p className="flex items-center text-sm">
              <span
                className={classNames(colorClass, "mr-1 inline-block h-2 w-2 rounded-full")}
                aria-hidden
              />
              <SeatsAvailabilityText
                showExact={!!showAvailableSeatsCount}
                totalSeats={seatsPerTimeSlot}
                bookedSeats={slot.attendees || 0}
              />
            </p>
          )}
        </Button>
        {!!slot.showConfirmButton && (
          <HoverCard.Root>
            <HoverCard.Trigger asChild>
              <m.div key={slot.time} initial={{ width: 0 }} animate={{ width: "auto" }} exit={{ width: 0 }}>
                <Button
                  variant={layout === "column_view" ? "icon" : "button"}
                  StartIcon={layout === "column_view" ? "chevron-right" : undefined}
                  type="button"
                  className={confirmStepClassNames?.confirmButton}
                  onClick={() =>
                    onTimeSelect &&
                    onTimeSelect(slot.time, slot?.attendees || 0, seatsPerTimeSlot, slot.bookingUid)
                  }
                  data-testid="skip-confirm-book-button"
                  disabled={
                    isTimeslotUnavailable ||
                    (!!shouldRenderCaptcha && !watchedCfToken) ||
                    loadingStates?.creatingBooking ||
                    loadingStates?.creatingRecurringBooking ||
                    isVerificationCodeSending ||
                    confirmButtonDisabled
                  }
                  color="primary"
                  loading={
                    (selectedTimeslot === slot.time && loadingStates?.creatingBooking) ||
                    loadingStates?.creatingRecurringBooking ||
                    isVerificationCodeSending
                  }>
                  {(() => {
                    if (layout === "column_view") return "";
                    if (isTimeslotUnavailable) return t("timeslot_unavailable_short");
                    if (!renderConfirmNotVerifyEmailButtonCond) return t("verify_email_button");
                    return isPaidEvent ? t("pay_and_book") : t("confirm");
                  })()}
                </Button>
              </m.div>
            </HoverCard.Trigger>
            {isOverlapping && (
              <HoverCard.Portal>
                <HoverCard.Content side="top" align="end" sideOffset={2}>
                  <div className="text-emphasis bg-inverted w-(--booker-timeslots-width) rounded-md p-3">
                    <div className="flex items-center gap-2">
                      <p>Busy</p>
                    </div>
                    <p className="text-muted">
                      {overlappingTimeStart} - {overlappingTimeEnd}
                    </p>
                  </div>
                </HoverCard.Content>
              </HoverCard.Portal>
            )}
          </HoverCard.Root>
        )}
      </div>
    </AnimatePresence>
  );
};

export const AvailableTimes = ({
  slots,
  showTimeFormatToggle = true,
  className,
  ...props
}: AvailableTimesProps) => {
  const { t } = useLocale();

  const oooAllDay = slots.every((slot) => slot.away);
  if (oooAllDay) {
    return <OOOSlot {...slots[0]} />;
  }

  // Display ooo in slots once but after or before slots
  const oooBeforeSlots = slots[0] && slots[0].away;
  const oooAfterSlots = slots[slots.length - 1] && slots[slots.length - 1].away;

  return (
    <div className={classNames("text-default flex flex-col", className)}>
      <div className="h-full pb-4">
        {!slots.length && (
          <div
            data-testId="no-slots-available"
            className="bg-subtle border-subtle flex h-full flex-col items-center rounded-md border p-6 dark:bg-transparent">
            <CalendarX2Icon className="text-muted mb-2 h-4 w-4" />
            <p className={classNames("text-muted", showTimeFormatToggle ? "-mt-1 text-lg" : "text-sm")}>
              {t("all_booked_today")}
            </p>
          </div>
        )}
        {oooBeforeSlots && !oooAfterSlots && <OOOSlot {...slots[0]} />}
        {slots.map((slot) => {
          if (slot.away) return null;
          return <SlotItem key={slot.time} slot={slot} {...props} />;
        })}
        {oooAfterSlots && !oooBeforeSlots && <OOOSlot {...slots[slots.length - 1]} className="pb-0" />}
      </div>
    </div>
  );
};

interface IOOOSlotProps {
  fromUser?: IOutOfOfficeData["anyDate"]["fromUser"];
  toUser?: IOutOfOfficeData["anyDate"]["toUser"];
  reason?: string;
  emoji?: string;
  notes?: string | null;
  showNotePublicly?: boolean;
  time?: string;
  className?: string;
}

const OOOSlot: React.FC<IOOOSlotProps> = (props) => {
  const isPlatform = useIsPlatform();
  const { fromUser, toUser, reason, emoji, notes, showNotePublicly, time, className = "" } = props;

  if (isPlatform) return <></>;
  return (
    <OutOfOfficeInSlots
      fromUser={fromUser}
      toUser={toUser}
      date={dayjs(time).format("YYYY-MM-DD")}
      reason={reason}
      emoji={emoji}
      notes={notes}
      showNotePublicly={showNotePublicly}
      borderDashed
      className={className}
    />
  );
};

export const AvailableTimesSkeleton = () => (
  <div className="flex w-[20%] flex-col only:w-full">
    {/* Random number of elements between 1 and 6. */}
    {Array.from({ length: Math.floor(Math.random() * 6) + 1 }).map((_, i) => (
      <SkeletonText className="mb-4 h-6 w-full" key={i} />
    ))}
  </div>
);
