import { v4 as uuidv4 } from "uuid";

import dayjs from "@calcom/dayjs";
import { isBookingDryRun } from "@calcom/features/bookings/Booker/utils/isBookingDryRun";
import { getLocationValue } from "@calcom/lib/bookings/getLocationValue";
import { getRoutedTeamMemberIdsFromSearchParams } from "@calcom/lib/bookings/getRoutedTeamMemberIdsFromSearchParams";
import { parseRecurringDates } from "@calcom/lib/parse-dates";
import type { BookerEvent, BookingCreateBody, RecurringBookingCreateBody } from "../../../types";
import type { Tracking } from "../../handleNewBooking/types";

export type BookingOptions = {
  values: Record<string, unknown>;
  event: Pick<BookerEvent, "id" | "length" | "slug" | "schedulingType" | "recurringEvent">;
  date: string;
  // @NOTE: duration is not validated in this function
  duration: number | undefined | null;
  timeZone: string;
  language: string;
  rescheduleUid: string | undefined;
  rescheduledBy: string | undefined;
  username: string;
  metadata?: Record<string, string>;
  bookingUid?: string;
  seatReferenceUid?: string;
  hashedLink?: string | null;
  teamMemberEmail?: string | null;
  crmOwnerRecordType?: string | null;
  crmAppSlug?: string | null;
  crmRecordId?: string | null;
  orgSlug?: string;
  isDryRunProp?: boolean;
  verificationCode?: string;
  rrHostSubsetIds?: number[];
};

export const mapBookingToMutationInput = ({
  values,
  event,
  date,
  duration,
  timeZone,
  language,
  rescheduleUid,
  rescheduledBy,
  username,
  metadata,
  bookingUid,
  seatReferenceUid,
  hashedLink,
  teamMemberEmail,
  crmOwnerRecordType,
  crmAppSlug,
  crmRecordId,
  orgSlug,
  isDryRunProp,
  verificationCode,
  rrHostSubsetIds,
}: BookingOptions): BookingCreateBody => {
  const searchParams = new URLSearchParams(window.location.search);
  const routedTeamMemberIds = getRoutedTeamMemberIdsFromSearchParams(searchParams);
  const skipContactOwner = searchParams.get("cal.skipContactOwner") === "true";
  const _isDryRun = isDryRunProp !== undefined ? isDryRunProp : isBookingDryRun(searchParams);
  const dub_id = searchParams?.get("dub_id");
  const location = values?.location as unknown as string | undefined;
  const responseLocation = (values?.responses as Record<string, unknown> | undefined)?.location as
    | string
    | { value: unknown }
    | undefined;

  return {
    ...values,
    user: username,
    start: dayjs(date).format(),
    end: dayjs(date)
      // Defaults to the default event length in case no custom duration is set.
      .add(duration || event.length, "minute")
      .format(),
    eventTypeId: event.id,
    eventTypeSlug: event.slug,
    timeZone: timeZone,
    language: language,
    rescheduleUid,
    rescheduledBy,
    metadata: metadata || {},
    hasHashedBookingLink: hashedLink ? true : false,
    bookingUid,
    seatReferenceUid,
    hashedLink,
    teamMemberEmail,
    crmOwnerRecordType,
    crmAppSlug,
    crmRecordId,
    orgSlug,
    routedTeamMemberIds,
    rrHostSubsetIds,
    skipContactOwner,
    _isDryRun,
    dub_id,
    verificationCode,
    location: getLocationValue(location, responseLocation),
  };
};

// This method is here to ensure that the types are correct (recurring count is required),
// as well as generate a unique ID for the recurring bookings and turn one single booking
// into an array of multiple bookings based on the recurring count.
// Other than that it forwards the mapping to mapBookingToMutationInput.
export const mapRecurringBookingToMutationInput = (
  booking: BookingOptions,
  recurringCount: number,
  tracking?: Tracking
): RecurringBookingCreateBody[] => {
  const recurringEventId = uuidv4();
  const [, recurringDates] = parseRecurringDates(
    {
      startDate: booking.date,
      timeZone: booking.timeZone,
      recurringEvent: booking.event.recurringEvent,
      recurringCount,
      withDefaultTimeFormat: true,
    },
    booking.language
  );

  const input = mapBookingToMutationInput({ ...booking, bookingUid: undefined });

  return recurringDates.map((recurringDate) => ({
    ...input,
    start: dayjs(recurringDate).format(),
    end: dayjs(recurringDate)
      .add(booking.duration || booking.event.length, "minute")
      .format(),
    recurringEventId,
    schedulingType: booking.event.schedulingType || undefined,
    recurringCount: recurringDates.length,
    tracking,
  }));
};
