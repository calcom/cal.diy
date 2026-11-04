"use client";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@radix-ui/react-collapsible";
import classNames from "classnames";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { z } from "zod";

import BookingPageTagManager from "@calcom/app-store/BookingPageTagManager";
import type { getEventLocationValue } from "@calcom/app-store/locations";
import { getSuccessPageLocationMessage, guessEventLocationType } from "@calcom/app-store/locations";
import { getEventTypeAppData } from "@calcom/app-store/utils";
import { eventTypeMetaDataSchemaWithTypedApps } from "@calcom/app-store/zod-utils";
import type { ConfigType } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import {
  useEmbedNonStylesConfig,
  useIsBackgroundTransparent,
  useIsEmbed,
} from "@calcom/embed-core/embed-iframe";
import { Price } from "@calcom/features/bookings/components/event-meta/Price";
import { getCalendarLinks, CalendarLinkType } from "@calcom/features/bookings/lib/getCalendarLinks";
import { RATING_OPTIONS, validateRating } from "@calcom/features/bookings/lib/rating";
import { isWithinMinimumCancellationNotice as isWithinMinimumCancellationNoticeUtil } from "@calcom/features/bookings/lib/isWithinMinimumCancellationNotice";
import { isWithinMinimumRescheduleNotice as isWithinMinimumRescheduleNoticeUtil } from "@calcom/features/bookings/lib/reschedule/isWithinMinimumRescheduleNotice";
import type { nameObjectSchema } from "@calcom/features/eventtypes/lib/eventNaming";
import { getEventName } from "@calcom/features/eventtypes/lib/eventNaming";
import { shouldShowFieldInCustomResponses } from "@calcom/lib/bookings/SystemField";
import { APP_NAME } from "@calcom/lib/constants";
import { formatToLocalizedDate, formatToLocalizedTime, formatToLocalizedTimezone } from "@calcom/lib/dayjs";
import useGetBrandingColours from "@calcom/lib/getBrandColours";
import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { useRouterQuery } from "@calcom/lib/hooks/useRouterQuery";
import useTheme from "@calcom/lib/hooks/useTheme";
import isSmsCalEmail from "@calcom/lib/isSmsCalEmail";
import { markdownToSafeHTML } from "@calcom/lib/markdownToSafeHTML";
import { getEveryFreqFor } from "@calcom/lib/recurringStrings";
import { getIs24hClockFromLocalStorage, isBrowserLocale24h } from "@calcom/lib/timeFormat";
import { getTimeShiftFlags, getFirstShiftFlags } from "@calcom/lib/timeShift";
import { CURRENT_TIMEZONE } from "@calcom/lib/timezoneConstants";
import { localStorage } from "@calcom/lib/webstorage";
import { AssignmentReasonEnum, BookingStatus, SchedulingType } from "@calcom/prisma/enums";

import assignmentReasonBadgeTitleMap from "@calcom/web/lib/booking/assignmentReasonBadgeTitleMap";
import { bookingMetadataSchema } from "@calcom/prisma/zod-utils";
import { trpc } from "@calcom/trpc/react";
import { Alert } from "@calcom/ui/components/alert";
import { Avatar } from "@calcom/ui/components/avatar";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { EmptyScreen } from "@calcom/ui/components/empty-screen";
import { EmailInput, TextArea } from "@calcom/ui/components/form";
import { Icon } from "@calcom/ui/components/icon";
import {
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  XIcon,
} from "@coss/ui/icons";
import { showToast } from "@calcom/ui/components/toast";
import { useCalcomTheme } from "@calcom/ui/styles";
import CancelBooking from "@calcom/web/components/booking/CancelBooking";
import EventReservationSchema from "@calcom/web/components/schemas/EventReservationSchema";
import { timeZone } from "@calcom/web/lib/clock";

import { usePaymentStatus } from "../hooks/usePaymentStatus";
import type { PageProps } from "./bookings-single-view.getServerSideProps";

const stringToBoolean = z
  .string()
  .optional()
  .transform((val) => val === "true");

const querySchema = z.object({
  uid: z.string(),
  email: z.string().optional(),
  eventTypeSlug: z.string().optional(),
  cancel: stringToBoolean,
  allRemainingBookings: stringToBoolean,
  changes: stringToBoolean,
  reschedule: stringToBoolean,
  isSuccessBookingPage: stringToBoolean,
  formerTime: z.string().optional(),
  seatReferenceUid: z.string().optional(),
  rating: z.string().optional(),
  noShow: stringToBoolean,
  redirect_status: z.string().optional(),
});

const useBrandColors = ({
  brandColor,
  darkBrandColor,
}: {
  brandColor?: string | null;
  darkBrandColor?: string | null;
}) => {
  const brandTheme = useGetBrandingColours({
    lightVal: brandColor,
    darkVal: darkBrandColor,
  });
  useCalcomTheme(brandTheme);
};

export default function Success(props: PageProps) {
  const { t } = useLocale();
  const router = useRouter();
  const routerQuery = useRouterQuery();
  const pathname = usePathname();
  const searchParams = useCompatSearchParams();

  const {
    eventType,
    bookingInfo,
    previousBooking,
    requiresLoginToUpdate,
    rescheduledToUid,
    canViewHiddenData,
  } = props;

  const {
    allRemainingBookings,
    isSuccessBookingPage,
    cancel: isCancellationMode,
    formerTime,
    email,
    seatReferenceUid,
    noShow,
    rating,
    redirect_status,
  } = querySchema.parse(routerQuery);

  const attendeeTimeZone = bookingInfo?.attendees.find((attendee) => attendee.email === email)?.timeZone;

  const isFeedbackMode = !!(noShow || rating);
  const tz = props.tz ? props.tz : isSuccessBookingPage && attendeeTimeZone ? attendeeTimeZone : timeZone();

  const location = bookingInfo.location as ReturnType<typeof getEventLocationValue>;
  let rescheduleLocation: string | undefined;
  if (
    typeof bookingInfo.responses?.location === "object" &&
    "optionValue" in bookingInfo.responses.location
  ) {
    rescheduleLocation = bookingInfo.responses.location.optionValue;
  }

  const parsed = bookingMetadataSchema.safeParse(bookingInfo?.metadata ?? null);
  const parsedBookingMetadata = parsed.success ? parsed.data : null;

  const bookingWithParsedMetadata = {
    ...bookingInfo,
    metadata: parsedBookingMetadata,
  };
  const locationVideoCallUrl = bookingWithParsedMetadata.metadata?.videoCallUrl;

  const status = bookingInfo?.status;
  const reschedule = bookingInfo.status === BookingStatus.ACCEPTED;
  const cancellationReason = bookingInfo.cancellationReason || bookingInfo.rejectionReason;

  const isPaymentSucceededFromRedirect = redirect_status === "succeeded";
  const isAwaitingPayment =
    props.paymentStatus && !props.paymentStatus.success && !isPaymentSucceededFromRedirect;

  const attendees = bookingInfo?.attendees;

  const isGmail = !!attendees.find((attendee) => attendee?.email?.includes("gmail.com"));

  const [is24h, setIs24h] = useState(
    props?.userTimeFormat ? props.userTimeFormat === 24 : isBrowserLocale24h()
  );
  const { data: session } = useSession();
  const isHost = props.isLoggedInUserHost;

  const [showUtmParams, setShowUtmParams] = useState(false);

  const utmParams = bookingInfo.tracking;

  const [date, setDate] = useState(dayjs.utc(bookingInfo.startTime));
  const calendarLinks = getCalendarLinks({
    booking: bookingWithParsedMetadata,
    eventType: eventType,
    t,
  });

  // TODO: We could transform the JSX to just iterate over calendarLinks and render a link for each type
  const icsLink = calendarLinks.find((link) => link.id === CalendarLinkType.ICS)?.link;
  const microsoftOfficeLink = calendarLinks.find(
    (link) => link.id === CalendarLinkType.MICROSOFT_OFFICE
  )?.link;
  const microsoftOutlookLink = calendarLinks.find(
    (link) => link.id === CalendarLinkType.MICROSOFT_OUTLOOK
  )?.link;
  const googleCalendarLink = calendarLinks.find((link) => link.id === CalendarLinkType.GOOGLE_CALENDAR)?.link;

  const isBackgroundTransparent = useIsBackgroundTransparent();
  const isEmbed = useIsEmbed();
  const shouldAlignCentrallyInEmbed = useEmbedNonStylesConfig("align") !== "left";
  const shouldAlignCentrally = !isEmbed || shouldAlignCentrallyInEmbed;
  const [calculatedDuration, setCalculatedDuration] = useState<number | undefined>(undefined);
  const [comment, setComment] = useState("");
  const currentUserEmail =
    searchParams?.get("rescheduledBy") ??
    searchParams?.get("cancelledBy") ??
    session?.user?.email ??
    undefined;

  const defaultRating = validateRating(rating);
  const [rateValue, setRateValue] = useState<number>(defaultRating);
  const [isFeedbackSubmitted, setIsFeedbackSubmitted] = useState(false);

  const mutation = trpc.viewer.public.submitRating.useMutation({
    onSuccess: async () => {
      setIsFeedbackSubmitted(true);
      showToast("Thank you, feedback submitted", "success");
    },
    onError: (err) => {
      showToast(err.message, "error");
    },
  });

  const hostNoShowMutation = trpc.viewer.public.markHostAsNoShow.useMutation({
    onSuccess: async () => {
      showToast("Thank you, feedback submitted", "success");
    },
    onError: (err) => {
      showToast(err.message, "error");
    },
  });

  useEffect(() => {
    if (noShow) {
      hostNoShowMutation.mutate({ bookingUid: bookingInfo.uid, noShowHost: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendFeedback = async (rating: string, comment: string) => {
    mutation.mutate({ bookingUid: bookingInfo.uid, rating: rateValue, comment: comment });
  };

  function setIsCancellationMode(value: boolean) {
    const _searchParams = new URLSearchParams(searchParams?.toString() ?? undefined);

    if (value) {
      _searchParams.set("cancel", "true");
    } else {
      if (_searchParams.get("cancel")) {
        _searchParams.delete("cancel");
      }
    }

    router.replace(`${pathname}?${_searchParams.toString()}`);
  }

  let evtName = eventType.eventName;
  if (eventType.isDynamic && bookingInfo.responses?.title) {
    evtName = bookingInfo.responses.title as string;
  }

  const eventNameObject = {
    attendeeName: bookingInfo.responses.name as z.infer<typeof nameObjectSchema> | string,
    eventType: eventType.title,
    eventName: evtName,
    host: props.profile.name || "Nameless",
    location: location,
    bookingFields: bookingInfo.responses,
    eventDuration: dayjs(bookingInfo.endTime).diff(bookingInfo.startTime, "minutes"),
    t,
  };

  const giphyAppData = getEventTypeAppData(
    {
      ...eventType,
      metadata: eventTypeMetaDataSchemaWithTypedApps.parse(eventType.metadata),
    },
    "giphy"
  );
  const giphyImage = giphyAppData?.thankYouPage;
  const isRoundRobin = eventType.schedulingType === SchedulingType.ROUND_ROBIN;

  const eventName = getEventName(eventNameObject, true);
  // Confirmation can be needed in two cases as of now
  // - Event Type has require confirmation option enabled always
  // - EventType has conditionally enabled confirmation option based on how far the booking is scheduled.
  // - It's a paid event and payment is pending.
  const needsConfirmation = bookingInfo.status === BookingStatus.PENDING && eventType.requiresConfirmation;
  const userIsOwner = !!(session?.user?.id && eventType.owner?.id === session.user.id);
  const isLoggedIn = session?.user;
  const isCancelled =
    status === "CANCELLED" ||
    status === "REJECTED" ||
    (!!seatReferenceUid &&
      !bookingInfo.seatsReferences.some((reference) => reference.referenceUid === seatReferenceUid));

  useEffect(() => {
    setDate(date.tz(localStorage.getItem("timeOption.preferredTimeZone") || CURRENT_TIMEZONE));
    setIs24h(props?.userTimeFormat ? props.userTimeFormat === 24 : !!getIs24hClockFromLocalStorage());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, needsConfirmation]);

  useEffect(() => {
    setCalculatedDuration(dayjs(bookingInfo.endTime).diff(dayjs(bookingInfo.startTime), "minutes"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getTitle(): string {
    const titleSuffix = props.recurringBookings ? "_recurring" : "";
    const titlePrefix = isRoundRobin ? "round_robin_" : "";
    if (isCancelled) {
      return "";
    }
    if (isAwaitingPayment && !isCancelled) {
      return t("complete_your_booking_subject", {
        title: eventName,
        date: formatToLocalizedDate(date, undefined, "long", tz),
      });
    }
    if (needsConfirmation) {
      if (props.profile.name !== null) {
        return t(`user_needs_to_confirm_or_reject_booking${titleSuffix}`, {
          user: props.profile.name,
          interpolation: { escapeValue: false },
        });
      }
      return t(`needs_to_be_confirmed_or_rejected${titleSuffix}`);
    }
    if (bookingInfo.user) {
      const isAttendee = bookingInfo.attendees.find((attendee) => attendee.email === session?.user?.email);
      const attendee = bookingInfo.attendees[0]?.name || bookingInfo.attendees[0]?.email || "Nameless";
      const host = bookingInfo.user.name || bookingInfo.user.email;
      if (isHost) {
        return t(`${titlePrefix}emailed_host_and_attendee${titleSuffix}`, {
          host,
          attendee,
          interpolation: { escapeValue: false },
        });
      }
      if (isAttendee) {
        return t(`${titlePrefix}emailed_host_and_attendee${titleSuffix}`, {
          host,
          attendee,
          interpolation: { escapeValue: false },
        });
      }
      return t(`${titlePrefix}emailed_host_and_attendee${titleSuffix}`, {
        host,
        attendee,
        interpolation: { escapeValue: false },
      });
    }
    return t(`emailed_host_and_attendee${titleSuffix}`);
  }

  // This is a weird case where the same route can be opened in booking flow as a success page or as a booking detail page from the app
  // As Booking Page it has to support configured theme, but as booking detail page it should not do any change. Let Shell.tsx handle it.
  useTheme(isSuccessBookingPage ? props.profile.theme : "system");
  useBrandColors({
    brandColor: props.profile.brandColor,
    darkBrandColor: props.profile.darkBrandColor,
  });
  const locationToDisplay = getSuccessPageLocationMessage(
    locationVideoCallUrl ? locationVideoCallUrl : location,
    t,
    bookingInfo.status
  );

  const rescheduleLocationToDisplay = getSuccessPageLocationMessage(
    rescheduleLocation ?? "",
    t,
    bookingInfo.status
  );

  const providerName = guessEventLocationType(location)?.label;
  const rescheduleProviderName = guessEventLocationType(rescheduleLocation)?.label;
  const isBookingInPast = new Date(bookingInfo.endTime) < new Date();
  const isReschedulable = !isCancelled;

  const bookingCancelledEventProps = {
    booking: bookingInfo,
    organizer: {
      name: bookingInfo?.user?.name || "Nameless",
      email: bookingInfo?.userPrimaryEmail || bookingInfo?.user?.email || "Email-less",
      timeZone: bookingInfo?.user?.timeZone,
    },
    eventType,
  };

  const isRecurringBooking = props.recurringBookings;
  const needsConfirmationAndReschedulable = needsConfirmation && isReschedulable;
  const isNotAttendingSeatedEvent = isCancelled && seatReferenceUid;
  const isEventCancelled = isCancelled && !seatReferenceUid;
  const isPastBooking = isBookingInPast;
  const isRerouting = searchParams?.get("cal.rerouting") === "true";
  const isRescheduled = bookingInfo?.rescheduled;

  const canCancelOrReschedule = !eventType?.disableCancelling || !eventType?.disableRescheduling;

  const canCancel = !eventType?.disableCancelling;
  const canReschedule = !eventType?.disableRescheduling;

  // Check if reschedule should be disabled due to minimum reschedule notice
  // Use server-side computed isHost prop instead of client-side computation
  const isWithinMinimumRescheduleNotice = isHost
    ? false // Organizers can always reschedule
    : isWithinMinimumRescheduleNoticeUtil(
        bookingInfo?.startTime ?? null,
        eventType?.minimumRescheduleNotice ?? null
      );
  const isRescheduleDisabled = !canReschedule || isWithinMinimumRescheduleNotice;

  // Check if cancel should be disabled due to minimum cancellation notice
  const isWithinMinimumCancellationNotice = isHost
    ? false // Organizers can always cancel
    : isWithinMinimumCancellationNoticeUtil(
        bookingInfo?.startTime ?? null,
        eventType?.minimumCancellationNotice ?? null
      );
  const isCancelDisabled = !canCancel || isWithinMinimumCancellationNotice;
  const paymentStatusMessage = usePaymentStatus({
    bookingStatus: bookingInfo.status,
    startTime: bookingInfo.startTime,
    eventTypeTeamId: eventType?.teamId,
    userId: eventType?.owner?.id,
    payment: props.paymentStatus
      ? {
          success: props.paymentStatus.success,
          refunded: props.paymentStatus.refunded,
          paymentOption: props.paymentStatus.paymentOption,
        }
      : { success: false, refunded: false },
    refundPolicy: eventType?.metadata?.apps?.stripe?.refundPolicy,
    refundDaysCount: eventType?.metadata?.apps?.stripe?.refundDaysCount,
  });

  const successPageHeadline = (() => {
    if (isAwaitingPayment && !isCancelled) {
      return props.paymentStatus?.paymentOption === "HOLD"
        ? t("meeting_awaiting_payment_method")
        : t("meeting_awaiting_payment");
    }

    if (needsConfirmationAndReschedulable) {
      return isRecurringBooking ? t("booking_submitted_recurring") : t("booking_submitted");
    }

    if (isRerouting) {
      return t("This meeting has been rerouted");
    }

    if (isNotAttendingSeatedEvent) {
      return t("no_longer_attending");
    }

    if (isRescheduled) {
      return t("your_event_has_been_rescheduled");
    }

    if (isEventCancelled) {
      return t("event_cancelled");
    }

    if (isPastBooking) {
      return t("event_is_in_the_past");
    }

    return isRecurringBooking ? t("meeting_is_scheduled_recurring") : t("meeting_is_scheduled");
  })();

  return (
    <div className={isEmbed ? "" : "h-screen"} data-testid="success-page">
      {!isEmbed && !isFeedbackMode && (
        <EventReservationSchema
          reservationId={bookingInfo.uid}
          eventName={eventName}
          startTime={bookingInfo.startTime}
          endTime={bookingInfo.endTime}
          organizer={bookingInfo.user}
          attendees={bookingInfo.attendees}
          location={locationToDisplay}
          description={bookingInfo.description}
          status={status}
        />
      )}
      {isLoggedIn && !isEmbed && !isFeedbackMode && (
        <div className="-mb-4 ml-4 mt-2">
          <Link
            href={allRemainingBookings ? "/bookings/recurring" : "/bookings/upcoming"}
            data-testid="back-to-bookings"
            className="hover:bg-subtle text-subtle hover:text-default mt-2 inline-flex px-1 py-2 text-sm transition dark:hover:bg-transparent">
            <ChevronLeftIcon className="h-5 w-5 rtl:rotate-180" /> {t("back_to_bookings")}
          </Link>
        </div>
      )}
      <BookingPageTagManager
        eventType={{ ...eventType, metadata: eventTypeMetaDataSchemaWithTypedApps.parse(eventType.metadata) }}
      />
      <main className={classNames(shouldAlignCentrally ? "mx-auto" : "", isEmbed ? "" : "max-w-3xl")}>
        <div className={classNames("overflow-y-auto", isEmbed ? "" : "z-50 ")}>
          <div
            className={classNames(
              shouldAlignCentrally ? "text-center" : "",
              "flex items-end justify-center px-4 pb-20 pt-4 sm:flex sm:p-0"
            )}>
            <div
              className={classNames(
                "main my-4 flex flex-col transition-opacity sm:my-0 ",
                isEmbed ? "" : " inset-0"
              )}
              aria-hidden="true">
              <div
                className={classNames(
                  "inline-block transform overflow-hidden rounded-lg border sm:my-8 sm:max-w-xl",
                  !isBackgroundTransparent &&
                    " bg-default dark:bg-cal-muted border-booker border-booker-width",
                  "px-8 pb-4 pt-5 text-left align-bottom transition-all sm:w-full sm:py-8 sm:align-middle"
                )}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-headline">
                {!isFeedbackMode && (
                  <>
                    <div
                      className={classNames(isRoundRobin && "min-h-24 min-w-32 relative mx-auto h-24 w-32")}>
                      {isRoundRobin && bookingInfo.user && (
                        <Avatar
                          className="mx-auto flex items-center justify-center"
                          alt={bookingInfo.user.name || bookingInfo.user.email}
                          size="xl"
                          imageSrc={`${bookingInfo.user.avatarUrl}`}
                        />
                      )}
                      {giphyImage && !needsConfirmation && isReschedulable && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={giphyImage} className="w-full rounded-lg" alt="Gif from Giphy" />
                      )}
                      <div
                        className={classNames(
                          "mx-auto flex h-12 w-12 items-center justify-center rounded-full",
                          isRoundRobin &&
                            "border-cal-bg dark:border-cal-bg-muted absolute bottom-0 right-0 z-10 h-12 w-12 border-8",
                          !giphyImage && isReschedulable && !needsConfirmation && !isAwaitingPayment
                            ? "bg-cal-success"
                            : "",
                          !giphyImage && isReschedulable && (needsConfirmation || isAwaitingPayment)
                            ? "bg-subtle"
                            : "",
                          isCancelled ? "bg-error" : ""
                        )}>
                        {!giphyImage && !needsConfirmation && !isAwaitingPayment && isReschedulable && (
                          <CheckIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                        )}
                        {(needsConfirmation || isAwaitingPayment) && isReschedulable && (
                          <CalendarIcon className="text-emphasis h-5 w-5" />
                        )}
                        {isCancelled && <XIcon className="h-5 w-5 text-red-600 dark:text-red-200" />}
                      </div>
                    </div>
                    <div className="mb-8 mt-6 text-center last:mb-0">
                      <h3
                        className="text-emphasis text-2xl font-semibold leading-6"
                        data-testid={isCancelled ? "cancelled-headline" : ""}
                        id="modal-headline">
                        {successPageHeadline}
                      </h3>

                      <div className="mt-3">
                        <p className="text-default">{getTitle()}</p>
                      </div>
                      {props.paymentStatus &&
                        (bookingInfo.status === BookingStatus.CANCELLED ||
                          bookingInfo.status === BookingStatus.REJECTED) && <h4>{paymentStatusMessage}</h4>}

                      <div className="border-subtle text-default mt-8 grid grid-cols-3 gap-x-4 border-t pt-8 text-left rtl:text-right sm:gap-x-0">
                        {(isCancelled || reschedule) && cancellationReason && (
                          <>
                            <div className="font-medium">
                              {isCancelled ? t("reason") : t("reschedule_reason")}
                            </div>
                            <div className="col-span-2 mb-6 last:mb-0">
                              <p className="wrap-break-word">{cancellationReason}</p>
                            </div>
                          </>
                        )}
                        {isCancelled &&
                          bookingInfo?.cancelledBy &&
                          !(bookingInfo.eventType?.hideOrganizerEmail && !isHost) && (
                            <>
                              <div className="font-medium">{t("cancelled_by")}</div>
                              <div className="col-span-2 mb-6 last:mb-0">
                                <p className="wrap-break-word">{bookingInfo?.cancelledBy}</p>
                              </div>
                            </>
                          )}
                        {previousBooking && (
                          <>
                            <div className="font-medium">{t("rescheduled_by")}</div>
                            <div className="col-span-2 mb-6 last:mb-0">
                              <p className="wrap-break-word">{previousBooking?.rescheduledBy}</p>
                              <Link className="text-sm underline" href={`/booking/${previousBooking?.uid}`}>
                                {t("original_booking")}
                              </Link>
                            </div>
                          </>
                        )}
                        <div className="font-medium">{t("what")}</div>
                        <div
                          className="wrap-break-word col-span-2 mb-6 last:mb-0"
                          data-testid="booking-title">
                          {isRoundRobin
                            ? typeof bookingInfo.title === "string"
                              ? bookingInfo.title
                              : eventName
                            : eventName}
                        </div>
                        <div className="font-medium">{t("when")}</div>
                        <div className="col-span-2 mb-6 last:mb-0">
                          {reschedule && !!formerTime && (
                            <p className="line-through">
                              <RecurringBookings
                                eventType={eventType}
                                duration={calculatedDuration}
                                recurringBookings={props.recurringBookings}
                                allRemainingBookings={allRemainingBookings}
                                date={dayjs(formerTime)}
                                is24h={is24h}
                                isCancelled={isCancelled}
                                tz={tz}
                              />
                            </p>
                          )}
                          <RecurringBookings
                            eventType={eventType}
                            duration={calculatedDuration}
                            recurringBookings={props.recurringBookings}
                            allRemainingBookings={allRemainingBookings}
                            date={date}
                            is24h={is24h}
                            isCancelled={isCancelled}
                            tz={tz}
                          />
                        </div>
                        {(bookingInfo?.user || bookingInfo?.attendees) && (
                          <>
                            <div className="font-medium">{t("who")}</div>
                            <div className="col-span-2 last:mb-0">
                              {bookingInfo?.user && (
                                <div className="mb-3">
                                  <div>
                                    <span data-testid="booking-host-name" className="mr-2">
                                      {bookingInfo.user.name}
                                    </span>
                                    <Badge variant="blue">{t("Host")}</Badge>
                                  </div>
                                  {!bookingInfo.eventType?.hideOrganizerEmail && (
                                    <p className="text-default" data-testid="booking-host-email">
                                      {bookingInfo?.userPrimaryEmail ?? bookingInfo.user.email}
                                    </p>
                                  )}
                                </div>
                              )}
                              {bookingInfo?.attendees.map((attendee) => {
                                // Check if attendee is a team member/host (for round robin scenarios)
                                const isTeamMemberOrHost =
                                  eventType.hosts?.some((host) => host.user.email === attendee.email) ||
                                  eventType.users?.some((user) => user.email === attendee.email);
                                const shouldHideEmail =
                                  bookingInfo.eventType?.hideOrganizerEmail && isTeamMemberOrHost;

                                return (
                                  <div key={attendee.name + attendee.email} className="mb-3 last:mb-0">
                                    {attendee.name && (
                                      <p data-testid={`attendee-name-${attendee.name}`}>{attendee.name}</p>
                                    )}
                                    {attendee.phoneNumber && (
                                      <p data-testid={`attendee-phone-${attendee.phoneNumber}`}>
                                        {attendee.phoneNumber}
                                      </p>
                                    )}
                                    {!isSmsCalEmail(attendee.email) && !shouldHideEmail && (
                                      <p data-testid={`attendee-email-${attendee.email}`}>{attendee.email}</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                        {locationToDisplay && !isCancelled && (
                          <>
                            <div className="mt-3 font-medium">{t("where")}</div>
                            <div className="col-span-2 mt-3" data-testid="where">
                              {!rescheduleLocation || locationToDisplay === rescheduleLocationToDisplay ? (
                                <DisplayLocation
                                  locationToDisplay={locationToDisplay}
                                  providerName={providerName}
                                />
                              ) : (
                                <>
                                  {!!formerTime && (
                                    <DisplayLocation
                                      locationToDisplay={locationToDisplay}
                                      providerName={providerName}
                                      className="line-through"
                                    />
                                  )}

                                  <DisplayLocation
                                    locationToDisplay={rescheduleLocationToDisplay}
                                    providerName={rescheduleProviderName}
                                  />
                                </>
                              )}
                            </div>
                          </>
                        )}
                        {props.paymentStatus && (
                          <>
                            <div className="mt-3 font-medium">
                              {props.paymentStatus.paymentOption === "HOLD"
                                ? t("complete_your_booking")
                                : t("payment")}
                            </div>
                            <div className="col-span-2 mb-2 mt-3">
                              <Price
                                currency={props.paymentStatus.currency}
                                price={props.paymentStatus.amount}
                              />
                            </div>
                          </>
                        )}

                        {rescheduledToUid ? <RescheduledToLink rescheduledToUid={rescheduledToUid} /> : null}

                        {bookingInfo?.description && (
                          <>
                            <div className="mt-9 font-medium">{t("additional_notes")}</div>
                            <div className="col-span-2 mb-2 mt-9">
                              <p className="wrap-break-word whitespace-pre-line">{bookingInfo.description}</p>
                            </div>
                          </>
                        )}
                        {!!utmParams && canViewHiddenData && (
                          <>
                            <div className="mt-9 pr-2 font-medium sm:pr-0">{t("utm_params")}</div>
                            <div className="col-span-2 mb-2 ml-3 mt-9 sm:ml-0">
                              <button
                                data-testid="utm-dropdown"
                                onClick={() => {
                                  setShowUtmParams((prev) => !prev);
                                }}
                                className="font-medium transition hover:text-blue-500 focus:outline-none">
                                <div className="flex items-center gap-1">
                                  {showUtmParams ? t("hide") : t("show")}
                                  <Icon
                                    name={showUtmParams ? "chevron-up" : "chevron-down"}
                                    className="size-4"
                                  />
                                </div>
                              </button>

                              {showUtmParams && (
                                <div className="col-span-2 mb-2 mt-2">
                                  {Object.entries(utmParams).filter(([_, value]) => Boolean(value)).length >
                                  0 ? (
                                    <ul className="stack-y-1 list-disc p-1 pl-5 sm:w-80">
                                      {Object.entries(utmParams)
                                        .filter(([_, value]) => Boolean(value))
                                        .map(([key, value]) => (
                                          <li key={key} className="text-muted space-x-1 text-sm">
                                            <span>{key}</span>: <span>{value}</span>
                                          </li>
                                        ))}
                                    </ul>
                                  ) : (
                                    <p className="text-muted text-sm">{t("no_utm_params")}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                        {canViewHiddenData &&
                          bookingInfo.assignmentReason &&
                          bookingInfo.assignmentReason.length > 0 &&
                          bookingInfo.assignmentReason[0].reasonEnum && (
                            <>
                              <div className="mt-9 font-medium">{t("assignment_reason")}</div>
                              <div className="col-span-2 mb-2 mt-9">
                                <Badge
                                  variant="gray"
                                  className="mb-2 cursor-pointer hover:opacity-80"
>
                                  {t(
                                    assignmentReasonBadgeTitleMap(
                                      bookingInfo.assignmentReason[0].reasonEnum as AssignmentReasonEnum
                                    )
                                  )}
                                </Badge>
                                {bookingInfo.assignmentReason[0].reasonString && (
                                  <p className="text-muted wrap-break-word text-sm">
                                    {bookingInfo.assignmentReason[0].reasonString}
                                  </p>
                                )}
                              </div>
                            </>
                          )}
                      </div>
                      <div className="text-bookingdark dark:border-darkgray-200 mt-8 text-left dark:text-gray-300">
                        {eventType.bookingFields.map((field) => {
                          if (!field) return null;

                          if (!bookingInfo.responses[field.name]) return null;

                          const response = bookingInfo.responses[field.name];
                          // We show location in the "where" section
                          // We show Booker Name, Emails and guests in Who section
                          // We show notes in additional notes section
                          // We show rescheduleReason at the top

                          if (!shouldShowFieldInCustomResponses(field.name)) {
                            return null;
                          }

                          const label = field.label || t(field.defaultLabel);

                          return (
                            <Fragment key={field.name}>
                              {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Content is sanitized via markdownToSafeHTML */}
                              <div
                                className="text-emphasis mt-4 font-medium"
                                dangerouslySetInnerHTML={{
                                  __html: markdownToSafeHTML(label),
                                }}
                              />
                              <p
                                className="text-default wrap-break-word"
                                data-testid="field-response"
                                data-fob-field={field.name}>
                                {field.type === "boolean"
                                  ? response
                                    ? t("yes")
                                    : t("no")
                                  : response.toString()}
                              </p>
                            </Fragment>
                          );
                        })}
                      </div>
                    </div>
                    {requiresLoginToUpdate && (
                      <>
                        <hr className="border-subtle mb-8" />
                        <div className="text-center">
                          <span className="text-emphasis ltr:mr-2 rtl:ml-2">
                            {t("need_to_make_a_change")}
                          </span>
                          {/* Login button but redirect to here */}
                          <span className="text-default inline">
                            <Link
                              href={`/auth/login?callbackUrl=${encodeURIComponent(
                                `/booking/${bookingInfo?.uid}`
                              )}`}
                              className="underline"
                              data-testid="reschedule-link">
                              {t("login")}
                            </Link>
                          </span>
                        </div>
                      </>
                    )}
                    {!requiresLoginToUpdate &&
                      (!needsConfirmation || !userIsOwner) &&
                      isReschedulable &&
                      !isRerouting &&
                      canCancelOrReschedule &&
                      (!isCancellationMode ? (
                        <>
                          {/* Only show section if there's at least one actionable option */}
                          {((!props.recurringBookings &&
                            (!isBookingInPast || eventType.allowReschedulingPastBookings) &&
                            canReschedule &&
                            !isRescheduleDisabled) ||
                            (!isBookingInPast && canCancel && !isCancelDisabled)) && (
                            <>
                              <hr className="border-subtle mb-8" />
                              <div className="text-center last:pb-0">
                                <span className="text-emphasis ltr:mr-2 rtl:ml-2">
                                  {t("need_to_make_a_change")}
                                </span>

                                <>
                                  {!props.recurringBookings &&
                                    (!isBookingInPast || eventType.allowReschedulingPastBookings) &&
                                    canReschedule &&
                                    !isRescheduleDisabled && (
                                      <span className="text-default inline">
                                        <Link
                                          href={`/reschedule/${seatReferenceUid || bookingInfo?.uid}${
                                            currentUserEmail
                                              ? `?rescheduledBy=${encodeURIComponent(currentUserEmail)}`
                                              : ""
                                          }`}
                                          className="underline"
                                          data-testid="reschedule-link">
                                          {t("reschedule")}
                                        </Link>
                                        {!isBookingInPast && canCancel && !isCancelDisabled && (
                                          <span className="mx-2">{t("or_lowercase")}</span>
                                        )}
                                      </span>
                                    )}

                                  {!isBookingInPast && canCancel && !isCancelDisabled && (
                                    <button
                                      data-testid="cancel"
                                      className={classNames(
                                        "text-default underline",
                                        props.recurringBookings && "ltr:mr-2 rtl:ml-2"
                                      )}
                                      onClick={() => setIsCancellationMode(true)}>
                                      {t("cancel")}
                                    </button>
                                  )}
                                </>
                              </div>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          <hr className="border-subtle" />
                          <CancelBooking
                            booking={{
                              uid: bookingInfo?.uid,
                              title: bookingInfo?.title,
                              id: bookingInfo?.id,
                              startTime: bookingInfo?.startTime,
                              payment: props.paymentStatus,
                            }}
                            eventTypeMetadata={eventType.metadata}
                            requiresCancellationReason={eventType.requiresCancellationReason}
                            profile={{ name: props.profile.name, slug: props.profile.slug }}
                            recurringEvent={eventType.recurringEvent}
                            team={eventType?.team?.name}
                            teamId={eventType?.team?.id}
                            setIsCancellationMode={setIsCancellationMode}
                            theme={isSuccessBookingPage ? props.profile.theme : "light"}
                            allRemainingBookings={allRemainingBookings}
                            seatReferenceUid={seatReferenceUid}
                            bookingCancelledEventProps={bookingCancelledEventProps}
                            currentUserEmail={currentUserEmail}
                            isHost={isHost}
                            internalNotePresets={props.internalNotePresets}
                            renderContext="booking-single-view"
                          />
                        </>
                      ))}
                    {isRerouting && typeof window !== "undefined" && window.opener && (
                      <div className="flex justify-center">
                        <Button
                          type="button"
                          onClick={() => {
                            window.opener.focus();
                            window.close();
                          }}>
                          Go Back
                        </Button>
                      </div>
                    )}
                    {!needsConfirmation && !isCancellationMode && isReschedulable && !!calculatedDuration && (
                      <>
                        <hr className="border-subtle mt-8" />
                        <div className="text-default align-center flex flex-row justify-center pt-8">
                          <span className="text-default flex self-center font-medium ltr:mr-2 rtl:ml-2 ">
                            {t("add_to_calendar")}
                          </span>
                          <div className="justify-left mt-1 flex text-left sm:mt-0">
                            {googleCalendarLink && (
                              <Link
                                href={googleCalendarLink}
                                className="text-default border-subtle h-10 w-10 rounded-sm border px-3 py-2 ltr:mr-2 rtl:ml-2"
                                target="_blank">
                                <svg
                                  className="-mt-1.5 inline-block h-4 w-4"
                                  fill="currentColor"
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 24 24">
                                  <title>Google</title>
                                  <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
                                </svg>
                              </Link>
                            )}
                            {microsoftOutlookLink && (
                              <Link
                                href={microsoftOutlookLink}
                                className="border-subtle text-default mx-2 h-10 w-10 rounded-sm border px-3 py-2"
                                target="_blank">
                                <svg
                                  className="-mt-1.5 mr-1 inline-block h-4 w-4"
                                  fill="currentColor"
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 24 24">
                                  <title>Microsoft Outlook</title>
                                  <path d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.5V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V10.85l1.24.72h.01q.1.07.18.18.07.12.07.25zm-6-8.25v3h3v-3zm0 4.5v3h3v-3zm0 4.5v1.83l3.05-1.83zm-5.25-9v3h3.75v-3zm0 4.5v3h3.75v-3zm0 4.5v2.03l2.41 1.5 1.34-.8v-2.73zM9 3.75V6h2l.13.01.12.04v-2.3zM5.98 15.98q.9 0 1.6-.3.7-.32 1.19-.86.48-.55.73-1.28.25-.74.25-1.61 0-.83-.25-1.55-.24-.71-.71-1.24t-1.15-.83q-.68-.3-1.55-.3-.92 0-1.64.3-.71.3-1.2.85-.5.54-.75 1.3-.25.74-.25 1.63 0 .85.26 1.56.26.72.74 1.23.48.52 1.17.81.69.3 1.56.3zM7.5 21h12.39L12 16.08V17q0 .41-.3.7-.29.3-.7.3H7.5zm15-.13v-7.24l-5.9 3.54Z" />
                                </svg>
                              </Link>
                            )}
                            {microsoftOfficeLink && (
                              <Link
                                href={microsoftOfficeLink}
                                className="text-default border-subtle mx-2 h-10 w-10 rounded-sm border px-3 py-2"
                                target="_blank">
                                <svg
                                  className="-mt-1.5 mr-1 inline-block h-4 w-4"
                                  fill="currentColor"
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 24 24">
                                  <title>Microsoft Office</title>
                                  <path d="M21.53 4.306v15.363q0 .807-.472 1.433-.472.627-1.253.85l-6.888 1.974q-.136.037-.29.055-.156.019-.293.019-.396 0-.72-.105-.321-.106-.656-.292l-4.505-2.544q-.248-.137-.391-.366-.143-.23-.143-.515 0-.434.304-.738.304-.305.739-.305h5.831V4.964l-4.38 1.563q-.533.187-.856.658-.322.472-.322 1.03v8.078q0 .496-.248.912-.25.416-.683.651l-2.072 1.13q-.286.148-.571.148-.497 0-.844-.347-.348-.347-.348-.844V6.563q0-.62.33-1.19.328-.571.874-.881L11.07.285q.248-.136.534-.21.285-.075.57-.075.211 0 .38.031.166.031.364.093l6.888 1.899q.384.11.7.329.317.217.547.52.23.305.353.67.125.367.125.764zm-1.588 15.363V4.306q0-.273-.16-.478-.163-.204-.423-.28l-3.388-.93q-.397-.111-.794-.23-.397-.117-.794-.216v19.68l4.976-1.427q.26-.074.422-.28.161-.204.161-.477z" />
                                </svg>
                              </Link>
                            )}
                            {icsLink && (
                              <Link
                                href={icsLink}
                                className="border-subtle text-default mx-2 h-10 w-10 rounded-sm border px-3 py-2"
                                download={`${eventType.title}.ics`}>
                                <svg
                                  version="1.1"
                                  fill="currentColor"
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 1000 1000"
                                  className="-mt-1.5 mr-1 inline-block h-4 w-4">
                                  <title>{t("other")}</title>
                                  <path d="M971.3,154.9c0-34.7-28.2-62.9-62.9-62.9H611.7c-1.3,0-2.6,0.1-3.9,0.2V10L28.7,87.3v823.4L607.8,990v-84.6c1.3,0.1,2.6,0.2,3.9,0.2h296.7c34.7,0,62.9-28.2,62.9-62.9V154.9z M607.8,636.1h44.6v-50.6h-44.6v-21.9h44.6v-50.6h-44.6v-92h277.9v230.2c0,3.8-3.1,7-7,7H607.8V636.1z M117.9,644.7l-50.6-2.4V397.5l50.6-2.2V644.7z M288.6,607.3c17.6,0.6,37.3-2.8,49.1-7.2l9.1,48c-11,5.1-35.6,9.9-66.9,8.3c-85.4-4.3-127.5-60.7-127.5-132.6c0-86.2,57.8-136.7,133.2-140.1c30.3-1.3,53.7,4,64.3,9.2l-12.2,48.9c-12.1-4.9-28.8-9.2-49.5-8.6c-45.3,1.2-79.5,30.1-79.5,87.4C208.8,572.2,237.8,605.7,288.6,607.3z M455.5,665.2c-32.4-1.6-63.7-11.3-79.1-20.5l12.6-50.7c16.8,9.1,42.9,18.5,70.4,19.4c30.1,1,46.3-10.7,46.3-29.3c0-17.8-14-28.1-48.8-40.6c-46.9-16.4-76.8-41.7-76.8-81.5c0-46.6,39.3-84.1,106.8-87.1c33.3-1.5,58.3,4.2,76.5,11.2l-15.4,53.3c-12.1-5.3-33.5-12.8-62.3-12c-28.3,0.8-41.9,13.6-41.9,28.1c0,17.8,16.1,25.5,53.6,39c52.9,18.5,78.4,45.3,78.4,86.4C575.6,629.7,536.2,669.2,455.5,665.2z M935.3,842.7c0,14.9-12.1,27-27,27H611.7c-1.3,0-2.6-0.2-3.9-0.4V686.2h270.9c19.2,0,34.9-15.6,34.9-34.9V398.4c0-19.2-15.6-34.9-34.9-34.9h-47.1v-32.3H808v32.3h-44.8v-32.3h-22.7v32.3h-43.3v-32.3h-22.7v32.3H628v-32.3h-20.2v-203c1.31.2,2.6-0.4,3.9-0.4h296.7c14.9,0,27,12.1,27,27L935.3,842.7L935.3,842.7z" />
                                </svg>
                              </Link>
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    {session === null && !(userIsOwner || props.hideBranding) && (
                      <>
                        <hr className="border-subtle mt-8" />
                        <div className="text-default pt-8 text-center text-xs">
                          <a href="https://cal.com/signup">
                            {t("create_booking_link_with_calcom", { appName: APP_NAME })}
                          </a>

                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const target = e.target as typeof e.target & {
                                email: { value: string };
                              };
                              router.push(`https://cal.com/signup?email=${target.email.value}`);
                            }}
                            className="mt-4 flex">
                            <EmailInput
                              name="email"
                              id="email"
                              defaultValue={email}
                              className="mr- focus:border-brand-default border-default text-default mt-0 block w-full rounded-none rounded-l-md shadow-sm focus:ring-black sm:text-sm"
                              placeholder="rick.astley@cal.com"
                            />
                            <Button
                              type="submit"
                              className="min-w-max rounded-none rounded-r-md"
                              color="primary">
                              {t("try_for_free")}
                            </Button>
                          </form>
                        </div>
                      </>
                    )}
                  </>
                )}
                {isFeedbackMode &&
                  (noShow ? (
                    <>
                      <EmptyScreen
                        Icon="user-x"
                        iconClassName="text-error"
                        iconWrapperClassName="bg-error"
                        headline={t("host_no_show")}
                        description={t("no_show_description")}
                        buttonRaw={
                          !props.recurringBookings ? (
                            <Button href={`/reschedule/${seatReferenceUid || bookingInfo?.uid}`}>
                              {t("reschedule")}
                            </Button>
                          ) : undefined
                        }
                      />
                    </>
                  ) : (
                    <>
                      <div className="my-3 flex justify-center space-x-1">
                        {RATING_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            className={classNames(
                              "flex h-10 w-10 items-center justify-center rounded-full border text-2xl hover:opacity-100",
                              rateValue === option.value
                                ? "border-emphasis bg-emphasis"
                                : "border-muted bg-default opacity-50"
                            )}
                            disabled={isFeedbackSubmitted}
                            onClick={() => setRateValue(option.value)}>
                            {option.emoji}
                          </button>
                        ))}
                      </div>
                      <div className="stack-y-1 my-4 text-center">
                        <h2 className="font-cal text-lg">{t("submitted_feedback")}</h2>
                        <p className="text-sm">{rateValue < 4 ? t("how_can_we_improve") : t("most_liked")}</p>
                      </div>
                      <TextArea
                        id="comment"
                        name="comment"
                        placeholder="Next time I would like to ..."
                        rows={3}
                        disabled={isFeedbackSubmitted}
                        onChange={(event) => setComment(event.target.value)}
                      />
                      <div className="my-4 flex justify-start">
                        <Button
                          loading={mutation.isPending}
                          disabled={isFeedbackSubmitted}
                          onClick={async () => {
                            if (rating) {
                              await sendFeedback(rating, comment);
                            }
                          }}>
                          {t("submit_feedback")}
                        </Button>
                      </div>
                    </>
                  ))}
              </div>
              {isGmail && !isFeedbackMode && (
                <Alert
                  className="main -mb-20 mt-4 inline-block ltr:text-left rtl:text-right sm:-mt-4 sm:mb-4 sm:w-full sm:max-w-xl sm:align-middle"
                  severity="warning"
                  message={
                    <div>
                      <p className="font-semibold">{t("google_new_spam_policy")}</p>
                      <span className="underline">
                        <a
                          target="_blank"
                          href="https://cal.com/blog/google-s-new-spam-policy-may-be-affecting-your-invitations"
                          rel="noreferrer">
                          {t("resolve")}
                        </a>
                      </span>
                    </div>
                  }
                  CustomIcon="circle-alert"
                  customIconColor="text-attention dark:text-orange-200"
                />
              )}
            </div>
          </div>
        </div>
      </main>
      <Toaster position="bottom-right" />
    </div>
  );
}

const RescheduledToLink = ({ rescheduledToUid }: { rescheduledToUid: string }) => {
  const { t } = useLocale();
  return (
    <>
      <div className="mt-3 font-medium">{t("rescheduled")}</div>
      <div className="col-span-2 mb-2 mt-3">
        <span className="underline">
          <Link href={`/booking/${rescheduledToUid}`}>
            <div className="flex items-center gap-1">
              {t("view_booking")}
              <ExternalLinkIcon className="h-4 w-4" />
            </div>
          </Link>
        </span>
      </div>
    </>
  );
};

const DisplayLocation = ({
  locationToDisplay,
  providerName,
  className,
}: {
  locationToDisplay: string;
  providerName?: string;
  className?: string;
}) =>
  locationToDisplay.startsWith("http") ? (
    <a
      href={locationToDisplay}
      target="_blank"
      title={locationToDisplay}
      className={classNames("text-default flex items-center gap-2", className)}
      rel="noreferrer">
      {providerName || "Link"}
      <ExternalLinkIcon className="text-default inline h-4 w-4" />
    </a>
  ) : (
    <p className={className}>{locationToDisplay}</p>
  );

type RecurringBookingsProps = {
  eventType: PageProps["eventType"];
  recurringBookings: PageProps["recurringBookings"];
  date: dayjs.Dayjs;
  duration: number | undefined;
  is24h: boolean;
  allRemainingBookings: boolean;
  isCancelled: boolean;
  tz: string;
};

function RecurringBookings({
  eventType,
  recurringBookings,
  duration,
  date,
  allRemainingBookings,
  is24h,
  isCancelled,
  tz,
}: RecurringBookingsProps) {
  const [moreEventsVisible, setMoreEventsVisible] = useState(false);
  const {
    t,
    i18n: { language },
  } = useLocale();
  const recurringBookingsSorted = recurringBookings
    ? recurringBookings.sort((a: ConfigType, b: ConfigType) => (dayjs(a).isAfter(dayjs(b)) ? 1 : -1))
    : null;

  if (!duration) return null;

  if (recurringBookingsSorted && allRemainingBookings) {
    const shiftFlags = getTimeShiftFlags({
      dates: recurringBookingsSorted,
      timezone: tz,
    });
    const displayFlags = getFirstShiftFlags(shiftFlags);

    return (
      <>
        {eventType.recurringEvent?.count && (
          <span className="font-medium">
            {getEveryFreqFor({
              t,
              recurringEvent: eventType.recurringEvent,
              recurringCount: recurringBookings?.length ?? undefined,
            })}
          </span>
        )}
        {eventType.recurringEvent?.count &&
          recurringBookingsSorted.slice(0, 4).map((dateStr: string, idx: number) => (
            <div key={idx} className={classNames("mb-2", isCancelled ? "line-through" : "")}>
              {formatToLocalizedDate(dayjs.utc(dateStr), language, "full", tz)}
              <br />
              {formatToLocalizedTime({
                date: dayjs(dateStr),
                locale: language,
                timeStyle: undefined,
                hour12: !is24h,
                timeZone: tz,
              })}{" "}
              -{" "}
              {formatToLocalizedTime({
                date: dayjs(dateStr).add(duration, "m"),
                locale: language,
                timeStyle: undefined,
                hour12: !is24h,
                timeZone: tz,
              })}{" "}
              <span className="text-bookinglight">
                ({formatToLocalizedTimezone(dayjs.utc(dateStr), language, tz)})
              </span>
              {displayFlags[idx] && (
                <>
                  {" "}
                  <Badge variant="orange" size="sm">
                    {t("time_shift")}
                  </Badge>
                </>
              )}
            </div>
          ))}
        {recurringBookingsSorted.length > 4 && (
          <Collapsible open={moreEventsVisible} onOpenChange={() => setMoreEventsVisible(!moreEventsVisible)}>
            <CollapsibleTrigger
              type="button"
              className={classNames("flex w-full", moreEventsVisible ? "hidden" : "")}>
              + {t("plus_more", { count: recurringBookingsSorted.length - 4 })}
            </CollapsibleTrigger>
            <CollapsibleContent>
              {eventType.recurringEvent?.count &&
                recurringBookingsSorted.slice(4).map((dateStr: string, idx: number) => (
                  <div key={idx} className={classNames("mb-2", isCancelled ? "line-through" : "")}>
                    {formatToLocalizedDate(dayjs.utc(dateStr), language, "full", tz)}
                    <br />
                    {formatToLocalizedTime({
                      date: dayjs(dateStr),
                      locale: language,
                      hour12: !is24h,
                      timeZone: tz,
                    })}{" "}
                    -{" "}
                    {formatToLocalizedTime({
                      date: dayjs(dateStr).add(duration, "m"),
                      locale: language,
                      hour12: !is24h,
                      timeZone: tz,
                    })}{" "}
                    <span className="text-bookinglight">
                      ({formatToLocalizedTimezone(dayjs.utc(dateStr), language, tz)})
                    </span>
                    {displayFlags[idx + 4] && (
                      <>
                        {" "}
                        <Badge variant="orange" size="sm">
                          {t("time_shift")}
                        </Badge>
                      </>
                    )}
                  </div>
                ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </>
    );
  }

  return (
    <div className={classNames(isCancelled ? "line-through" : "")}>
      {formatToLocalizedDate(date, language, "full", tz)}
      <br />
      {formatToLocalizedTime({ date, locale: language, hour12: !is24h, timeZone: tz })} -{" "}
      {formatToLocalizedTime({
        date: dayjs(date).add(duration, "m"),
        locale: language,
        hour12: !is24h,
        timeZone: tz,
      })}{" "}
      <span className="text-bookinglight">({formatToLocalizedTimezone(date, language, tz)})</span>
    </div>
  );
}
