import { isWithinMinimumRescheduleNotice } from "@calcom/features/bookings/lib/reschedule/isWithinMinimumRescheduleNotice";
import { BookingStatus, SchedulingType } from "@calcom/prisma/enums";
import type { ActionType } from "@calcom/ui/components/table";

import type { BookingItemProps } from "../types";

export interface BookingActionContext {
  booking: BookingItemProps;
  isUpcoming: boolean;
  isOngoing: boolean;
  isBookingInPast: boolean;
  isCancelled: boolean;
  isConfirmed: boolean;
  isRejected: boolean;
  isPending: boolean;
  isRescheduled: boolean;
  isRecurring: boolean;
  isTabRecurring: boolean;
  isTabUnconfirmed: boolean;
  isDisabledCancelling: boolean;
  isDisabledRescheduling: boolean;
  isCalVideoLocation: boolean;
  showPendingPayment: boolean;
  isAttendee: boolean;
  cardCharged: boolean;
  attendeeList: Array<{
    name: string;
    email: string;
    id: number;
    noShow: boolean;
    phoneNumber: string | null;
  }>;
  getSeatReferenceUid: () => string | undefined;
  t: (key: string) => string;
}

export function getPendingActions(context: BookingActionContext): ActionType[] {
  const { booking, isPending, isTabRecurring, isTabUnconfirmed, isRecurring, showPendingPayment, t } =
    context;

  const actions: ActionType[] = [];

  // For bookings with payment, only confirm if the booking is paid for
  // Original logic: (isPending && !paymentAppData.enabled) || (paymentAppData.enabled && !!paymentAppData.price && booking.paid)
  if ((isPending && !showPendingPayment) || (showPendingPayment && booking.paid)) {
    actions.push({
      id: "confirm",
      bookingUid: booking.uid,
      label: (isTabRecurring || isTabUnconfirmed) && isRecurring ? t("confirm_all") : t("confirm"),
      icon: "check" as const,
      disabled: false, // This would be controlled by mutation state in the component
    });
  }

  actions.push({
    id: "reject",
    label: (isTabRecurring || isTabUnconfirmed) && isRecurring ? t("reject_all") : t("reject"),
    icon: "ban",
    disabled: false, // This would be controlled by mutation state in the component
  });

  return actions;
}

export function getCancelEventAction(context: BookingActionContext): ActionType {
  const { booking, isTabRecurring, isRecurring, t } = context;

  return {
    id: "cancel",
    label: isTabRecurring && isRecurring ? t("cancel_all_remaining") : t("cancel_event"),
    icon: "circle-x",
    color: "destructive",
    disabled: isActionDisabled("cancel", context),
    bookingUid: booking.uid,
  };
}

export function getVideoOptionsActions(context: BookingActionContext): ActionType[] {
  const { booking, isBookingInPast, isConfirmed, isCalVideoLocation, t } = context;

  return [
    {
      id: "view_recordings",
      label: t("view_recordings"),
      icon: "video",
      disabled: !(isBookingInPast && isConfirmed && isCalVideoLocation && booking.isRecorded),
    },
    {
      id: "meeting_session_details",
      label: t("view_session_details"),
      icon: "info",
      disabled: !(isBookingInPast && isConfirmed && isCalVideoLocation),
    },
  ];
}

export function getEditEventActions(context: BookingActionContext): ActionType[] {
  const {
    booking,
    isBookingInPast,
    isDisabledRescheduling,
    getSeatReferenceUid,
    isAttendee,
    isPending,
    t,
  } = context;
  const seatReferenceUid = getSeatReferenceUid();

  const isReassignableRoundRobin =
    booking.eventType.schedulingType === SchedulingType.ROUND_ROBIN &&
    (!booking.eventType.hostGroups || booking.eventType.hostGroups.length <= 1);
  const isManagedChildEvent = booking.eventType.parentId != null;
  const isReassignable = isReassignableRoundRobin || isManagedChildEvent;

  const actions: (ActionType | null)[] = [
    {
      id: "reschedule",
      icon: "clock",
      label: t("reschedule_booking"),
      href: `/reschedule/${booking.uid}${
        booking.seatsReferences.length && isAttendee && seatReferenceUid
          ? `?seatReferenceUid=${seatReferenceUid}`
          : ""
      }`,
      disabled: isActionDisabled("reschedule", {
        ...context,
        booking,
        isBookingInPast,
        isDisabledRescheduling,
      }),
    },
    {
      id: "reschedule_request",
      icon: "send",
      iconClassName: "rotate-45 w-[16px] -translate-x-0.5 ",
      label: t("send_reschedule_request"),
      disabled:
        isActionDisabled("reschedule_request", {
          ...context,
          booking,
          isBookingInPast,
          isDisabledRescheduling,
        }) || booking.seatsReferences.length > 0,
    },
    {
      id: "change_location",
      label: t("edit_location"),
      icon: "map-pin",
      disabled: isActionDisabled("change_location", context),
    },
    booking.eventType?.disableGuests
      ? null
      : {
          id: "add_members",
          label: t("additional_guests"),
          icon: "user-plus",
          disabled: isActionDisabled("add_members", context),
        },
    isReassignable
      ? {
          id: "reassign",
          label: t("reassign"),
          icon: "users",
          disabled: isActionDisabled("reassign", context),
        }
      : null,
  ];

  return actions.filter(Boolean) as ActionType[];
}

export function getReportAction(context: BookingActionContext): ActionType {
  const { booking, t } = context;

  return {
    id: "report",
    label: t("report_booking"),
    icon: "flag",
    color: "destructive",
    disabled: !!booking.report,
  };
}

export function getAfterEventActions(context: BookingActionContext): ActionType[] {
  const { booking, cardCharged, attendeeList, t } = context;

  const actions: (ActionType | null)[] = [
    ...getVideoOptionsActions(context),
    booking.status === BookingStatus.ACCEPTED && booking.paid && booking.payment[0]?.paymentOption === "HOLD"
      ? {
          id: "charge_card",
          label: cardCharged ? t("no_show_fee_charged") : t("collect_no_show_fee"),
          icon: "credit-card",
          disabled: cardCharged,
        }
      : null,
    {
      id: "no_show",
      label:
        attendeeList.length === 1 && attendeeList[0].noShow ? t("unmark_as_no_show") : t("mark_as_no_show"),
      icon: attendeeList.length === 1 && attendeeList[0].noShow ? "eye" : "eye-off",
      disabled: false, // This would be controlled by booking state in the component
    },
  ];

  return actions.filter(Boolean) as ActionType[];
}

export function shouldShowPendingActions(context: BookingActionContext): boolean {
  const { isPending, isUpcoming, isCancelled } = context;
  return isPending && isUpcoming && !isCancelled;
}

export function shouldShowEditActions(context: BookingActionContext): boolean {
    const { isTabRecurring, isRecurring, isCancelled } = context;
    return !(isTabRecurring && isRecurring) && !isCancelled;
}

export function shouldShowRecurringCancelAction(context: BookingActionContext): boolean {
  const { isTabRecurring, isRecurring } = context;
  return isTabRecurring && isRecurring;
}

export function shouldShowIndividualReportButton(context: BookingActionContext): boolean {
  const { booking, isPending, isUpcoming, isCancelled, isRejected } = context;
  const hasDropdown = shouldShowEditActions(context);
  return !booking.report && !hasDropdown && (isCancelled || isRejected || (isPending && isUpcoming));
}

export function isActionDisabled(actionId: string, context: BookingActionContext): boolean {
  const {
    booking,
    isBookingInPast,
    isDisabledRescheduling,
    isDisabledCancelling,
    isAttendee,
    isCancelled,
    isRejected,
    isPending,
  } = context;

  switch (actionId) {
    case "reschedule":
      const isUserOrganizer =
     !isAttendee &&
     booking.loggedInUser?.userId &&
     booking.user?.id &&
     booking.loggedInUser.userId === booking.user.id;
   const isWithinMinimumNotice =
     !isUserOrganizer &&
     isWithinMinimumRescheduleNotice(
      new Date(booking.startTime),
          booking.eventType.minimumRescheduleNotice ?? null
        );
    return (
      isCancelled ||
      isRejected ||
      (isBookingInPast && !booking.eventType.allowReschedulingPastBookings) ||
      isDisabledRescheduling ||
      isWithinMinimumNotice
    );
      case "reschedule_request":
        const isWithinMinimumNoticeForRequest =
      isWithinMinimumRescheduleNotice(
        new Date(booking.startTime),
        booking.eventType.minimumRescheduleNotice ?? null
      );
    return (
      isPending ||
      isCancelled ||
      isRejected ||
      (isBookingInPast && !booking.eventType.allowReschedulingPastBookings) ||
      isDisabledRescheduling ||
      isWithinMinimumNoticeForRequest
    );
    case "cancel":
      return isDisabledCancelling || isBookingInPast || isCancelled || isRejected;
    case "view_recordings":
      return !(isBookingInPast && booking.status === BookingStatus.ACCEPTED && context.isCalVideoLocation);
    case "meeting_session_details":
      return !(isBookingInPast && booking.status === BookingStatus.ACCEPTED && context.isCalVideoLocation);
    case "charge_card":
      return context.cardCharged;
    case "reassign":
    case "change_location":
    case "add_members":
      return isBookingInPast || isCancelled || isRejected || isPending;
    default:
      return false;
  }
}

export function getActionLabel(actionId: string, context: BookingActionContext): string {
  const { isTabRecurring, isRecurring, attendeeList, cardCharged, t } = context;

  switch (actionId) {
    case "reject":
      return (isTabRecurring || context.isTabUnconfirmed) && isRecurring ? t("reject_all") : t("reject");
    case "confirm":
      return (isTabRecurring || context.isTabUnconfirmed) && isRecurring ? t("confirm_all") : t("confirm");
    case "cancel":
      return isTabRecurring && isRecurring ? t("cancel_all_remaining") : t("cancel_event");
    case "no_show":
      return attendeeList.length === 1 && attendeeList[0].noShow
        ? t("unmark_as_no_show")
        : t("mark_as_no_show");
    case "charge_card":
      return cardCharged ? t("no_show_fee_charged") : t("collect_no_show_fee");
    default:
      return t(actionId);
  }
}
