"use client";

import dayjs from "@calcom/dayjs";
import { useBookingLocation } from "@calcom/features/bookings/hooks";
import { shouldShowFieldInCustomResponses } from "@calcom/lib/bookings/SystemField";
import { formatPrice } from "@calcom/lib/currencyConversions";
import { formatToLocalizedTimezone } from "@calcom/lib/dayjs";
import { getPlaceholderAvatar } from "@calcom/lib/defaultAvatarImage";
import { getUserAvatarUrl } from "@calcom/lib/getAvatarUrl";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { getEveryFreqFor } from "@calcom/lib/recurringStrings";
import { BookingStatus } from "@calcom/prisma/enums";
import {
  bookingMetadataSchema,
  EventTypeMetaDataSchema,
  eventTypeBookingFields,
} from "@calcom/prisma/zod-utils";
import { trpc } from "@calcom/trpc/react";
import type { RecurringEvent } from "@calcom/types/Calendar";
import classNames from "@calcom/ui/classNames";
import { Avatar } from "@calcom/ui/components/avatar";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { SegmentedControl } from "@calcom/ui/components/segmented-control";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@calcom/ui/components/sheet";
import { Tooltip } from "@calcom/ui/components/tooltip";
import { BookingHistory } from "@calcom/web/modules/booking-audit/components/BookingHistory";
import { ExternalLinkIcon, RepeatIcon } from "@coss/ui/icons";
import assignmentReasonBadgeTitleMap from "@lib/booking/assignmentReasonBadgeTitleMap";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { z } from "zod";
import { AcceptBookingButton } from "../../../components/booking/AcceptBookingButton";
import { BookingActionsDropdown } from "../../../components/booking/actions/BookingActionsDropdown";
import { BookingActionsStoreProvider } from "../../../components/booking/actions/BookingActionsStoreProvider";
import { RejectBookingButton } from "../../../components/booking/RejectBookingButton";
import type { BookingListingStatus } from "../../../components/booking/types";
import { usePaymentStatus } from "../hooks/usePaymentStatus";
import {
  checkSheetActive,
  createBookingSheetKeydownHandler,
} from "../lib/bookingSheetKeyboardHandler";
import { useBookingDetailsSheetStore } from "../store/bookingDetailsSheetStore";
import type { BookingOutput } from "../types";
import { BookingUid } from "./BookingUid";
import { JoinMeetingButton } from "./JoinMeetingButton";

type BookingMetaData = z.infer<typeof bookingMetadataSchema>;

interface BookingDetailsSheetProps {
  userTimeZone?: string;
  userTimeFormat?: number;
  userId?: number;
  userEmail?: string;
  bookingAuditEnabled?: boolean;
}

export function BookingDetailsSheet({
  userTimeZone,
  userTimeFormat,
  userId,
  userEmail,
  bookingAuditEnabled = false,
}: BookingDetailsSheetProps) {
  const booking = useBookingDetailsSheetStore((state) => state.getSelectedBooking());
  const selectedBookingUid = useBookingDetailsSheetStore((state) => state.selectedBookingUid);
  const lastBookingRef = useRef<BookingOutput | null>(null);

  if (booking) {
    lastBookingRef.current = booking;
  }

  if (!selectedBookingUid) {
    lastBookingRef.current = null;
  }

  const displayBooking = booking ?? lastBookingRef.current;

  if (!displayBooking) return null;

  return (
    <BookingActionsStoreProvider>
      <BookingDetailsSheetInner
        booking={displayBooking}
        userTimeZone={userTimeZone}
        userTimeFormat={userTimeFormat}
        userId={userId}
        userEmail={userEmail}
        bookingAuditEnabled={bookingAuditEnabled}
      />
    </BookingActionsStoreProvider>
  );
}

interface BookingDetailsSheetInnerProps {
  booking: BookingOutput;
  userTimeZone?: string;
  userTimeFormat?: number;
  userId?: number;
  userEmail?: string;
  bookingAuditEnabled?: boolean;
}

function useActiveSegment(bookingAuditEnabled: boolean) {
  const [activeSegment, setActiveSegmentInStore] = useBookingDetailsSheetStore(
    (state) => [state.activeSegment, state.setActiveSegment]
  );

  const getDerivedActiveSegment = ({
    activeSegment,
    bookingAuditEnabled,
  }: {
    activeSegment: "info" | "history" | null;
    bookingAuditEnabled: boolean;
  }) => {
    if (!bookingAuditEnabled && activeSegment === "history") {
      return "info";
    }
    return activeSegment ?? "info";
  };

  const derivedActiveSegment = getDerivedActiveSegment({
    activeSegment,
    bookingAuditEnabled,
  });

  const setDerivedActiveSegment = (segment: "info" | "history") => {
    setActiveSegmentInStore(
      getDerivedActiveSegment({ activeSegment: segment, bookingAuditEnabled })
    );
  };

  return [derivedActiveSegment, setDerivedActiveSegment] as const;
}

function BookingDetailsSheetInner({
  booking,
  userTimeZone,
  userTimeFormat,
  userId,
  userEmail,
  bookingAuditEnabled = false,
}: BookingDetailsSheetInnerProps) {
  const { t } = useLocale();
  const [activeSegment, setActiveSegment] =
    useActiveSegment(bookingAuditEnabled);

  // Fetch additional booking details for reschedule information
  const { data: bookingDetails } =
    trpc.viewer.bookings.getBookingDetails.useQuery(
      { uid: booking.uid },
      {
        // Keep data fresh but don't refetch too aggressively
        staleTime: 5 * 60 * 1000, // 5 minutes
      }
    );

  // Get navigation state from the store in a single selector
  const navigation = useBookingDetailsSheetStore((state) => {
    const hasNextInArray = state.hasNextInArray();
    const hasPreviousInArray = state.hasPreviousInArray();
    const isLastInArray = state.isLastInArray();
    const isFirstInArray = state.isFirstInArray();

    return {
      navigateNext: state.navigateNext,
      navigatePrevious: state.navigatePrevious,
      isTransitioning: state.isTransitioning,
      setSelectedBookingUid: state.setSelectedBookingUid,
      setActiveSegment: state.setActiveSegment,
      canGoNext:
        hasNextInArray ||
        (isLastInArray && state.capabilities?.canNavigateToNextPeriod()),
      canGoPrev:
        hasPreviousInArray ||
        (isFirstInArray && state.capabilities?.canNavigateToPreviousPeriod()),
    };
  });

  const handleClose = useCallback(() => {
    navigation.setSelectedBookingUid(null);
    navigation.setActiveSegment(null);
  }, [navigation.setSelectedBookingUid, navigation.setActiveSegment]);

  const handleNext = useCallback(() => {
    navigation.navigateNext();
  }, [navigation.navigateNext]);

  const handlePrevious = useCallback(() => {
    navigation.navigatePrevious();
  }, [navigation.navigatePrevious]);

  const joinButtonWrapperRef = useRef<HTMLDivElement>(null);
  const sheetContentRef = useRef<HTMLDivElement>(null);

  const isSheetActive = useCallback(
    () => checkSheetActive(sheetContentRef.current, document.activeElement),
    []
  );

  useEffect(() => {
    const handleKeyDown = createBookingSheetKeydownHandler({
      isSheetActive,
      canGoPrev: navigation.canGoPrev,
      canGoNext: navigation.canGoNext,
      isTransitioning: navigation.isTransitioning,
      handlePrevious,
      handleNext,
      getJoinLink: () => joinButtonWrapperRef.current?.querySelector("a"),
    });

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [
    navigation.canGoPrev,
    navigation.canGoNext,
    navigation.isTransitioning,
    handleNext,
    handlePrevious,
    isSheetActive,
  ]);

  const startTime = dayjs(booking.startTime).tz(userTimeZone);
  const endTime = dayjs(booking.endTime).tz(userTimeZone);

  const statusBadge = useMemo(() => {
    if (booking.rescheduled) {
      return {
        variant: "red" as const,
        label: t("rescheduled"),
      };
    }

    switch (booking.status) {
      case "ACCEPTED":
        return { variant: "green" as const, label: t("confirmed") };
      case "PENDING":
        return { variant: "orange" as const, label: t("pending") };
      case "CANCELLED":
        return { variant: "red" as const, label: t("cancelled") };
      case "REJECTED":
        return { variant: "red" as const, label: t("rejected") };
      default:
        return { variant: "gray" as const, label: booking.status };
    }
  }, [booking.status, booking.rescheduled, t]);

  const isPending = booking.status === BookingStatus.PENDING;

  const parsedMetadata = bookingMetadataSchema.safeParse(
    booking.metadata ?? null
  );
  const bookingMetadata = parsedMetadata.success ? parsedMetadata.data : null;

  const recurringInfo =
    booking.recurringEventId && booking.eventType?.recurringEvent
      ? {
          count: booking.eventType.recurringEvent.count,
          recurringEvent: booking.eventType.recurringEvent,
        }
      : null;

  const responses = (booking.responses ?? {}) as Record<string, unknown>;

  const reason =
    booking.assignmentReasonSortedByCreatedAt?.[booking.assignmentReasonSortedByCreatedAt.length - 1];
  const reasonTitle = reason && assignmentReasonBadgeTitleMap(reason.reasonEnum);

  return (
    <Sheet open={true} onOpenChange={handleClose} modal={false}>
      <SheetContent
        ref={sheetContentRef}
        className="overflow-y-auto pb-0 sm:pb-0"
        hideOverlay
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement;
          const isBookingItem =
            target.closest("[data-booking-list-item]") || target.closest("[data-booking-calendar-event]");

          if (isBookingItem) {
            e.preventDefault();
          }
        }}>
        <SheetHeader showCloseButton={false} className="mt-0 w-full">
          <div className="flex items-center justify-between gap-x-4">
            <div className="flex min-w-0 flex-col gap-y-1">
              <BookingHeaderBadges
                statusBadge={statusBadge}
                reasonTitle={reasonTitle}
                booking={booking}
                recurringInfo={recurringInfo}
              />
            </div>
            <div className="flex gap-2">
              <Tooltip
                content={
                  <div className="flex items-center gap-1.5">
                    <span>{t("previous_shortcut")}</span>
                  </div>
                }
              >
                <Button
                  variant="icon"
                  size="sm"
                  color="secondary"
                  StartIcon="chevron-up"
                  tabIndex={-1}
                  disabled={!navigation.canGoPrev || navigation.isTransitioning}
                  onClick={(e) => {
                    e.preventDefault();
                    handlePrevious();
                  }}
                />
              </Tooltip>
              <Tooltip
                content={
                  <div className="flex items-center gap-1.5">
                    <span>{t("next_shortcut")}</span>
                  </div>
                }
              >
                <Button
                  variant="icon"
                  size="sm"
                  color="secondary"
                  StartIcon="chevron-down"
                  tabIndex={-1}
                  disabled={!navigation.canGoNext || navigation.isTransitioning}
                  onClick={(e) => {
                    e.preventDefault();
                    handleNext();
                  }}
                />
              </Tooltip>
              <Tooltip
                content={
                  <div className="flex items-center gap-1.5">
                    <span>{t("close_shortcut")}</span>
                  </div>
                }
              >
                <Button
                  variant="icon"
                  size="sm"
                  color="secondary"
                  StartIcon="x"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.preventDefault();
                    handleClose();
                  }}
                />
              </Tooltip>
            </div>
          </div>
        </SheetHeader>

        <SheetBody className="-mt-3">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <SheetTitle className="flex items-center gap-3 font-semibold text-emphasis text-xl">
                <div className="w-0.5 shrink-0 self-stretch rounded-lg bg-emphasis"></div>
                <span data-testid="booking-sheet-title">{booking.title}</span>
              </SheetTitle>
            </div>

            {bookingAuditEnabled && (
              <SegmentedControl
                data={[
                  { value: "info", label: t("info") },
                  { value: "history", label: t("history") },
                ]}
                value={activeSegment}
                onChange={(value) => setActiveSegment(value)}
              />
            )}

            {activeSegment === "info" && (
              <>
                <WhenSection
                  rescheduled={booking.rescheduled || false}
                  startTime={startTime}
                  endTime={endTime}
                  timeZone={userTimeZone}
                  previousBooking={bookingDetails?.previousBooking}
                />

                <Section title={t("booking_uid")}>
                  <BookingUid uid={booking.uid} />
                </Section>

                <OldRescheduledBookingInfo
                  booking={booking}
                  rescheduledToBooking={bookingDetails?.rescheduledToBooking}
                />

                <NewRescheduledBookingInfo booking={booking} />

                <CancelledBookingInfo booking={booking} />

                <WhoSection booking={booking} />

                <WhereSection booking={booking} meta={bookingMetadata} />

                <RecurringInfoSection recurringInfo={recurringInfo} />

                <AssignmentReasonSection booking={booking} />

                {booking.payment?.[0] && (
                  <PaymentSection
                    booking={booking}
                    payment={booking.payment[0]}
                  />
                )}

                <SlotsSection booking={booking} />

                <AdditionalNotesSection booking={booking} />

                <CustomQuestionsSection
                  responses={responses}
                  bookingFields={booking.eventType?.bookingFields}
                />

                <TrackingSection tracking={bookingDetails?.tracking} />
              </>
            )}

            {bookingAuditEnabled && activeSegment === "history" && (
              <BookingHistory bookingUid={booking.uid} />
            )}
          </div>
        </SheetBody>

        <SheetFooter className="bg-muted border-subtle -mx-4 border-t pt-0 sm:-mx-6">
          <div className="flex w-full min-w-0 flex-row flex-wrap items-center justify-end gap-2 px-4 pb-4 pt-4">
            {isPending ? (
              <>
                <RejectBookingButton
                  bookingId={booking.id}
                  bookingUid={booking.uid}
                  recurringEventId={booking.recurringEventId}
                  isRecurring={!!booking.recurringEventId}
                />
                <AcceptBookingButton
                  bookingId={booking.id}
                  bookingUid={booking.uid}
                  recurringEventId={booking.recurringEventId}
                  isRecurring={!!booking.recurringEventId}
                />
              </>
            ) : (
              !booking.rescheduled && (
                <Tooltip
                  content={
                    <div className="flex items-center gap-1.5">
                      <span>{t("join_shortcut")}</span>
                    </div>
                  }
                >
                  <div ref={joinButtonWrapperRef}>
                    <JoinMeetingButton
                      location={booking.location}
                      metadata={booking.metadata}
                      bookingStatus={booking.status}
                    />
                  </div>
                </Tooltip>
              )
            )}

            <BookingActionsDropdown
              booking={{
                ...booking,
                listingStatus:
                  booking.status.toLowerCase() as BookingListingStatus,
                recurringInfo: undefined,
                loggedInUser: {
                  userId,
                  userTimeZone,
                  userTimeFormat: userTimeFormat ?? null,
                  userEmail,
                },
                isToday: false,
              }}
              usePortal={false}
              context="details"
            />
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function WhenSection({
  rescheduled,
  startTime,
  endTime,
  timeZone,
  previousBooking,
}: {
  rescheduled: boolean;
  startTime: dayjs.Dayjs;
  endTime: dayjs.Dayjs;
  timeZone?: string;
  previousBooking?: { uid: string; startTime: Date; endTime: Date } | null;
}) {
  const { t } = useLocale();

  return (
    <Section title={t("when")}>
      {previousBooking?.startTime && previousBooking?.endTime && (
        <div className="flex flex-col text-default text-sm line-through opacity-60">
          <DisplayTimestamp
            startTime={previousBooking.startTime}
            endTime={previousBooking.endTime}
            timeZone={timeZone}
          />
        </div>
      )}
      <div
        className={classNames(
          "flex flex-col font-medium text-emphasis text-sm",
          rescheduled && "line-through"
        )}
      >
        <DisplayTimestamp
          startTime={startTime}
          endTime={endTime}
          timeZone={timeZone}
        />
      </div>
    </Section>
  );
}

function DisplayTimestamp({
  startTime,
  endTime,
  timeZone,
}: {
  startTime: Date | dayjs.Dayjs;
  endTime: Date | dayjs.Dayjs;
  timeZone?: string;
}) {
  const {
    i18n: { language },
  } = useLocale();
  const start = startTime instanceof Date ? dayjs(startTime).tz(timeZone) : startTime;
  const end = endTime instanceof Date ? dayjs(endTime).tz(timeZone) : endTime;
  const localizedTimezone = timeZone
    ? (formatToLocalizedTimezone(start, language, timeZone) ?? timeZone)
    : start.format("Z");

  return (
    <>
      <span>{start.format("dddd, MMMM D, YYYY")}</span>
      <span>
        {start.format("h:mma")} - {end.format("h:mma")} ({localizedTimezone})
      </span>
    </>
  );
}

function WhoSection({ booking }: { booking: BookingOutput }) {
  const { t } = useLocale();
  return (
    <Section title={t("who")}>
      <div className="mt-2 flex flex-col gap-3">
        {booking.user && (
          <div className="flex items-center gap-4">
            <Avatar
              size="md"
              imageSrc={
                booking.user.avatarUrl
                  ? getUserAvatarUrl(booking.user)
                  : getPlaceholderAvatar(
                      null,
                      booking.user.name || booking.user.email
                    )
              }
              alt={booking.user.name || booking.user.email || ""}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-emphasis text-sm leading-[1.2]">
                  {booking.eventType?.hideOrganizerEmail
                    ? booking.user.name || t("organizer")
                    : booking.user.name || booking.user.email}
                </p>
                <Badge variant="purple" size="sm" className="capitalize">
                  {t("host")}
                </Badge>
              </div>
              {!booking.eventType?.hideOrganizerEmail && (
                <p className="truncate text-default text-sm leading-[1.2]">
                  {booking.user.email}
                </p>
              )}
            </div>
          </div>
        )}

        {booking.attendees.map((attendee, idx) => {
          const name =
            attendee.user?.name ||
            attendee.name ||
            attendee.user?.email ||
            attendee.email;
          return (
            <div key={idx} className="flex items-center gap-4">
              <Avatar
                size="md"
                imageSrc={
                  attendee.user?.avatarUrl
                    ? getUserAvatarUrl(attendee.user)
                    : getPlaceholderAvatar(null, name)
                }
                alt={name}
              />
              <div className="min-w-0 flex-1">
                <p className="text-emphasis truncate text-sm leading-[1.2]">{name}</p>
                {attendee.phoneNumber && (
                  <p className="text-default truncate text-sm leading-[1.2]">{attendee.phoneNumber}</p>
                )}
                <p className="text-default truncate text-sm leading-[1.2]">{attendee.email}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function WhereSection({
  booking,
  meta,
}: {
  booking: BookingOutput;
  meta: BookingMetaData | null;
}) {
  const { t } = useLocale();

  const { locationToDisplay, provider, isLocationURL } = useBookingLocation({
    location: booking.location,
    videoCallUrl: meta?.videoCallUrl,
    t,
    bookingStatus: booking.status,
  });

  if (booking.rescheduled) {
    return null;
  }

  if (!locationToDisplay) {
    return null;
  }

  if (!isLocationURL) {
    return (
      <Section title={t("where")}>
        <p className="text-default text-sm">{locationToDisplay}</p>
      </Section>
    );
  }

  return (
    <Section title={t("where")}>
      <div className="flex items-center gap-2 text-sm">
        {provider?.iconUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={provider.iconUrl}
            className="h-4 w-4 shrink-0 rounded-sm"
            alt={`${provider?.label} logo`}
          />
        )}
        <div className="flex min-w-0 items-baseline gap-1">
          <span className="shrink-0 font-medium text-emphasis">
            {provider?.label}:
          </span>
          <a
            href={locationToDisplay}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-blue-600 hover:underline"
          >
            {locationToDisplay}
          </a>
        </div>
      </div>
    </Section>
  );
}

function RecurringInfoSection({
  recurringInfo,
}: {
  recurringInfo: { count: number; recurringEvent: RecurringEvent } | null;
}) {
  const { t } = useLocale();

  if (!recurringInfo || recurringInfo.count <= 0) {
    return null;
  }

  return (
    <Section title={t("recurring_event")}>
      <p className="font-medium text-emphasis text-sm">
        {getEveryFreqFor({
          t,
          recurringEvent: recurringInfo.recurringEvent,
          recurringCount: recurringInfo.count,
        })}
      </p>
    </Section>
  );
}

function AssignmentReasonSection({ booking }: { booking: BookingOutput }) {
  const { t } = useLocale();

  if (
    !booking.assignmentReasonSortedByCreatedAt ||
    booking.assignmentReasonSortedByCreatedAt.length === 0
  ) {
    return null;
  }

  const reason =
    booking.assignmentReasonSortedByCreatedAt[
      booking.assignmentReasonSortedByCreatedAt.length - 1
    ];
  if (!reason.reasonString) {
    return null;
  }

  return (
    <Section title={t("assignment_reason")}>
      <div className="font-medium text-emphasis text-sm">
        {reason.reasonString}
      </div>
    </Section>
  );
}

function PaymentSection({
  booking,
  payment,
}: {
  booking: BookingOutput;
  payment: NonNullable<BookingOutput["payment"]>[number];
}) {
  const { t } = useLocale();

  // Get refund policy from event type metadata
  const parsedEventTypeMetadata = booking.eventType?.metadata
    ? EventTypeMetaDataSchema.safeParse(booking.eventType.metadata)
    : null;
  const eventTypeMetadata = parsedEventTypeMetadata?.success
    ? parsedEventTypeMetadata.data
    : null;

  const refundPolicy = eventTypeMetadata?.apps?.stripe?.refundPolicy;
  const refundDaysCount = eventTypeMetadata?.apps?.stripe?.refundDaysCount;

  const paymentStatusMessage = usePaymentStatus({
    bookingStatus: booking.status,
    startTime: booking.startTime,
    eventTypeTeamId: booking.eventType?.teamId,
    userId: booking.user?.id,
    payment,
    refundPolicy,
    refundDaysCount,
  });

  const formattedPrice = formatPrice(payment.amount, payment.currency);

  return (
    <Section title={t("payment")}>
      <p className="font-medium text-emphasis text-sm">{formattedPrice}</p>
      {paymentStatusMessage && (
        <p className="text-subtle text-xs">{paymentStatusMessage}</p>
      )}
    </Section>
  );
}

function SlotsSection({ booking }: { booking: BookingOutput }) {
  const { t } = useLocale();

  if (
    !booking.eventType?.seatsShowAvailabilityCount ||
    !booking.eventType?.seatsPerTimeSlot ||
    booking.eventType.seatsPerTimeSlot <= 0
  ) {
    return null;
  }

  const totalSeats = booking.eventType.seatsPerTimeSlot;
  const takenSeats = booking.attendees.length;

  return (
    <Section title={t("slots")}>
      <p className="font-medium text-emphasis text-sm">
        {t("slots_taken", { takenSeats, totalSeats })}
      </p>
    </Section>
  );
}

function CustomQuestionsSection({
  responses,
  bookingFields: rawBookingFields,
}: {
  responses: Record<string, unknown>;
  bookingFields?: unknown;
}) {
  const { t } = useLocale();

  const bookingFields = useMemo(() => {
    if (!rawBookingFields) return undefined;
    const parsed = eventTypeBookingFields.safeParse(rawBookingFields);
    return parsed.success ? parsed.data : undefined;
  }, [rawBookingFields]);

  if (!bookingFields) {
    return null;
  }

  return (
    <>
      {bookingFields.map((field) => {
        if (!field) return null;
        if (!shouldShowFieldInCustomResponses(field.name)) return null;

        const answer = responses[field.name];
        if (!answer) return null;
        if (Array.isArray(answer) && answer.length === 0) return null;

        const label = field.label || t(field.defaultLabel || field.name);

        return (
          <Section key={field.name} title={label}>
            <p className="font-medium text-emphasis text-sm">
              {field.type === "boolean" ? (answer ? t("yes") : t("no")) : String(answer)}
            </p>
          </Section>
        );
      })}
    </>
  );
}

// Old booking that was rescheduled away
function OldRescheduledBookingInfo({
  booking,
  rescheduledToBooking,
}: {
  booking: BookingOutput;
  rescheduledToBooking?: { uid: string } | null;
}) {
  const { t } = useLocale();

  // Only show for old rescheduled bookings
  if (!booking.rescheduled) {
    return null;
  }

  const cancellationReason =
    booking.cancellationReason || booking.rejectionReason;
  const rescheduledBy = booking.rescheduledBy;
  const cancelledBy = booking.cancelledBy;

  return (
    <>
      {rescheduledToBooking?.uid && (
        <Section title={t("rescheduled")}>
          <Link href={`/booking/${rescheduledToBooking.uid}`}>
            <div className="flex items-center gap-1 text-default text-sm underline">
              {t("view_booking")}
              <ExternalLinkIcon className="h-4 w-4" />
            </div>
          </Link>
        </Section>
      )}
      {rescheduledBy && (
        <Section title={t("rescheduled_by")}>
          <p className="font-medium text-emphasis text-sm">{rescheduledBy}</p>
        </Section>
      )}
      {cancellationReason && (
        <Section title={t("reason")}>
          <p className="whitespace-pre-wrap font-medium text-emphasis text-sm">
            {cancellationReason}
          </p>
        </Section>
      )}
      {cancelledBy && (
        <Section title={t("cancelled_by")}>
          <p className="font-medium text-emphasis text-sm">{cancelledBy}</p>
        </Section>
      )}
    </>
  );
}

// New booking that replaced an old one
function NewRescheduledBookingInfo({ booking }: { booking: BookingOutput }) {
  const { t } = useLocale();

  // Only show for new bookings that replaced an old one
  if (!booking.fromReschedule) {
    return null;
  }

  const cancellationReason =
    booking.cancellationReason || booking.rejectionReason;
  const rescheduledBy = booking.rescheduler;

  return (
    <>
      <Section title={t("rescheduled_by")}>
        {rescheduledBy && (
          <p className="font-medium text-emphasis text-sm">{rescheduledBy}</p>
        )}
        <Link href={`/booking/${booking.fromReschedule}`}>
          <div className="flex items-center gap-1 text-default text-sm underline">
            {t("original_booking")}
            <ExternalLinkIcon className="h-4 w-4" />
          </div>
        </Link>
      </Section>
      {cancellationReason && (
        <Section title={t("reschedule_reason")}>
          <p className="whitespace-pre-wrap font-medium text-emphasis text-sm">
            {cancellationReason}
          </p>
        </Section>
      )}
    </>
  );
}

// Purely cancelled or rejected (not rescheduled)
function CancelledBookingInfo({ booking }: { booking: BookingOutput }) {
  const { t } = useLocale();

  // Only show for cancelled/rejected bookings that were NOT rescheduled
  const isCancelled =
    booking.status === BookingStatus.CANCELLED ||
    booking.status === BookingStatus.REJECTED;
  const wasRescheduled = booking.rescheduled === true;

  if (!isCancelled || wasRescheduled) {
    return null;
  }

  const cancellationReason =
    booking.cancellationReason || booking.rejectionReason;
  const cancelledBy = booking.cancelledBy;

  if (!cancellationReason && !cancelledBy) {
    return null;
  }

  return (
    <>
      {cancelledBy && (
        <Section title={t("cancelled_by")}>
          <p className="font-medium text-emphasis text-sm">{cancelledBy}</p>
        </Section>
      )}
      {cancellationReason && (
        <Section title={t("reason")}>
          <p className="whitespace-pre-wrap font-medium text-emphasis text-sm">
            {cancellationReason}
          </p>
        </Section>
      )}
    </>
  );
}

function AdditionalNotesSection({ booking }: { booking: BookingOutput }) {
  const { t } = useLocale();

  if (!booking.description) {
    return null;
  }

  return (
    <Section title={t("additional_notes")}>
      <p className="whitespace-pre-wrap font-medium text-emphasis text-sm">
        {booking.description}
      </p>
    </Section>
  );
}

function BookingHeaderBadges({
  statusBadge,
  reasonTitle,
  booking,
  recurringInfo,
}: {
  statusBadge: { variant: "red" | "green" | "orange" | "gray"; label: string };
  reasonTitle: string | undefined;
  booking: BookingOutput;
  recurringInfo: { count: number; recurringEvent: RecurringEvent } | null;
}) {
  const { t } = useLocale();
  const payment = booking.payment?.[0];

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Badge variant={statusBadge.variant} className="capitalize">
        {statusBadge.label}
      </Badge>
      {reasonTitle && (
        <Badge variant="gray" className="capitalize">
          {reasonTitle}
        </Badge>
      )}
      {booking.eventType.team && (
        <Badge variant="gray">{booking.eventType.team.name}</Badge>
      )}
      {booking.paid && !payment ? (
        <Badge variant="orange">{t("error_collecting_card")}</Badge>
      ) : booking.paid ? (
        <Badge variant="green" data-testid="paid_badge">
          {payment?.paymentOption === "HOLD" ? t("card_held") : t("paid")}
        </Badge>
      ) : null}
      {recurringInfo && (
        <Badge variant="gray">
          <RepeatIcon className="mr-1 h-3 w-3" />
          {recurringInfo.count}
        </Badge>
      )}
    </div>
  );
}

function TrackingSection({
  tracking,
}: {
  tracking?: {
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    utm_term: string | null;
    utm_content: string | null;
  } | null;
}) {
  const { t } = useLocale();

  if (!tracking) {
    return null;
  }

  const utmEntries = Object.entries(tracking).filter(([_, value]) =>
    Boolean(value)
  );

  if (utmEntries.length === 0) {
    return null;
  }

  return (
    <Section title={t("utm_params")}>
      <div className="text-default text-sm">
        {utmEntries.map(([key, value]) => (
          <div key={key} className="mb-1 last:mb-0">
            <span className="font-medium">{key}</span>:{" "}
            <code className="rounded bg-subtle px-1 py-0.5 font-mono text-default text-xs">
              {value}
            </code>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Section({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={classNames("flex flex-col gap-1", className)}>
      <h3 className="font-medium text-subtle text-xs">{title}</h3>
      {children}
    </div>
  );
}
