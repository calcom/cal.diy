import { z } from "zod";
import type { LocationResponse } from "~/lib/booking-fields";
import type { EditableLocation } from "../event-types/types";
import { isValidTimeZone } from "../schedules/scheduleMapper";
import type { ApiBookingRow } from "./ApiBookingRepository";

const BOOKINGS_API_VERSION = "2024-08-13";

const isoDateTime = z.string().datetime({ offset: true });

/** Cal's BookingInputLocation_2024_08_13 variants this app can honor. */
const bookingLocationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("address") }),
  z.object({ type: z.literal("link") }),
  z.object({ type: z.literal("phone") }),
  z.object({ type: z.literal("attendeePhone"), phone: z.string().trim().min(1).max(30) }),
  z.object({ type: z.literal("integration"), integration: z.literal("google-meet") }),
]);

const createBookingInputSchema = z
  .object({
    start: isoDateTime,
    attendee: z.object({
      name: z.string().trim().min(1).max(200),
      email: z.string().trim().email().max(320),
      timeZone: z.string().min(1).max(100),
      phoneNumber: z.string().trim().max(30).optional(),
      language: z.string().max(20).optional(),
    }),
    eventTypeId: z.number().int().positive().optional(),
    eventTypeSlug: z.string().min(1).max(200).optional(),
    username: z.string().min(1).max(100).optional(),
    guests: z.array(z.string().trim().email().max(320)).max(30).optional(),
    location: bookingLocationSchema.optional(),
    bookingFieldsResponses: z.record(z.string(), z.unknown()).optional(),
    lengthInMinutes: z.number().int().min(1).max(1440).optional(),
    recurrenceCount: z.number().int().min(1).max(100).optional(),
    emailVerificationCode: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
  })
  .refine((input) => input.eventTypeId !== undefined || (input.eventTypeSlug && input.username), {
    message: "Provide eventTypeId, or eventTypeSlug and username",
    path: ["eventTypeId"],
  });

type CreateBookingApiInput = z.infer<typeof createBookingInputSchema>;

const STATUSES = ["upcoming", "recurring", "past", "cancelled", "unconfirmed"] as const;
const sortOrder = z.enum(["asc", "desc"]).optional();
const commaList = <T extends z.ZodType>(item: T) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.split(",").map((part) => part.trim()) : value),
    z.array(item).min(1)
  );

const listBookingsQuerySchema = z.object({
  status: commaList(z.enum(STATUSES)).optional(),
  attendeeEmail: z.string().trim().email().optional(),
  attendeeName: z.string().trim().min(1).max(200).optional(),
  bookingUid: z.string().min(1).max(100).optional(),
  eventTypeIds: commaList(z.coerce.number().int().positive()).optional(),
  eventTypeId: z.coerce.number().int().positive().optional(),
  afterStart: isoDateTime.optional(),
  beforeEnd: isoDateTime.optional(),
  afterCreatedAt: isoDateTime.optional(),
  beforeCreatedAt: isoDateTime.optional(),
  afterUpdatedAt: isoDateTime.optional(),
  beforeUpdatedAt: isoDateTime.optional(),
  sortStart: sortOrder,
  sortEnd: sortOrder,
  sortCreated: sortOrder,
  sortUpdatedAt: sortOrder,
  take: z.coerce.number().int().min(1).max(250).default(100),
  skip: z.coerce.number().int().min(0).default(0),
});

type ListBookingsApiQuery = z.infer<typeof listBookingsQuerySchema>;

const cancelBookingInputSchema = z.object({
  cancellationReason: z.string().max(1000).optional(),
  cancelSubsequentBookings: z.boolean().optional(),
  seatUid: z.string().min(1).max(100).optional(),
});

const rescheduleBookingInputSchema = z.object({
  start: isoDateTime,
  reschedulingReason: z.string().max(1000).optional(),
  rescheduledBy: z.string().email().optional(),
  seatUid: z.string().min(1).max(100).optional(),
});

const declineBookingInputSchema = z.object({ reason: z.string().max(1000).optional() });

/** Cal's MarkAbsentBookingInput_2024_08_13. */
const markAbsentInputSchema = z.object({
  host: z.boolean().optional(),
  attendees: z
    .array(z.object({ email: z.string().trim().email().max(320), absent: z.boolean() }))
    .max(100)
    .optional(),
});

/** Cal's AddGuestsInput_2024_08_13; guests start with the organizer's name, time zone and language. */
const addGuestsInputSchema = z.object({
  guests: z
    .array(
      z.object({
        email: z.string().trim().email().max(320),
        name: z.string().max(200).optional(),
        timeZone: z.string().max(100).refine(isValidTimeZone, "invalid time zone").optional(),
        phoneNumber: z.string().max(30).optional(),
        language: z.string().max(20).optional(),
      })
    )
    .min(1)
    .max(30),
});

/** Cal's UpdateBookingLocationInput_2024_08_13, for the locations a host can set here. */
const updateLocationInputSchema = z.object({
  location: z.discriminatedUnion("type", [
    z.object({ type: z.literal("address"), address: z.string().trim().min(1).max(500) }),
    z.object({ type: z.literal("link"), link: z.string().trim().url().max(2000) }),
    z.object({ type: z.literal("phone"), phone: z.string().trim().min(6).max(20) }),
    z.object({ type: z.literal("integration"), integration: z.literal("google-meet") }),
  ]),
});

function toEditableLocation(
  location: z.infer<typeof updateLocationInputSchema>["location"]
): EditableLocation {
  switch (location.type) {
    case "address":
      return { type: "inPerson", address: location.address };
    case "link":
      return { type: "link", link: location.link };
    case "phone":
      return { type: "userPhone", hostPhoneNumber: location.phone };
    case "integration":
      return { type: "integrations:google:meet" };
  }
}

/** Cal's location answer format, which the booking service checks against the event's options. */
function toLocationResponse(location: CreateBookingApiInput["location"]): LocationResponse | undefined {
  switch (location?.type) {
    case undefined:
      return undefined;
    case "address":
      return { value: "inPerson", optionValue: "" };
    case "link":
      return { value: "link", optionValue: "" };
    case "phone":
      return { value: "userPhone", optionValue: "" };
    case "attendeePhone":
      return { value: "phone", optionValue: location.phone };
    case "integration":
      return { value: "integrations:google:meet", optionValue: "" };
  }
}

/** The booking form's answers, in Cal's `responses` format, from the API's input. */
function toResponses(input: CreateBookingApiInput): Record<string, unknown> {
  const location = toLocationResponse(input.location);
  return {
    ...input.bookingFieldsResponses,
    name: input.attendee.name,
    email: input.attendee.email,
    ...(input.guests?.length ? { guests: input.guests } : {}),
    ...(location ? { location } : {}),
    ...(input.attendee.phoneNumber ? { attendeePhoneNumber: input.attendee.phoneNumber } : {}),
  };
}

/** The list sort Cal applies: the first sort parameter given, else upcoming first. */
function listSort(query: ListBookingsApiQuery): {
  column: "startTime" | "endTime" | "createdAt" | "updatedAt";
  direction: "asc" | "desc";
} {
  if (query.sortStart) return { column: "startTime", direction: query.sortStart };
  if (query.sortEnd) return { column: "endTime", direction: query.sortEnd };
  if (query.sortCreated) return { column: "createdAt", direction: query.sortCreated };
  if (query.sortUpdatedAt) return { column: "updatedAt", direction: query.sortUpdatedAt };
  return { column: "startTime", direction: "asc" };
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isUrl(value: string | null): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}

/** Cal's BookingOutput_2024_08_13. */
function toBookingOutput(row: ApiBookingRow) {
  const responses = objectRecord(row.responses);
  const guests = Array.isArray(responses.guests)
    ? responses.guests.filter((guest): guest is string => typeof guest === "string")
    : [];
  const reschedulingReason =
    typeof responses.rescheduleReason === "string" ? responses.rescheduleReason : undefined;
  return {
    id: row.id,
    uid: row.uid,
    title: row.title,
    description: row.description ?? "",
    hosts:
      row.userId === null
        ? []
        : [
            {
              id: row.userId,
              name: row.hostName ?? "",
              email: row.hostEmail ?? "",
              displayEmail: row.hostEmail ?? "",
              username: row.hostUsername ?? "",
              timeZone: row.hostTimeZone ?? "UTC",
            },
          ],
    status: row.status.toLowerCase(),
    ...(row.cancellationReason ? { cancellationReason: row.cancellationReason } : {}),
    ...(row.rejectionReason && row.status === "REJECTED" ? { cancellationReason: row.rejectionReason } : {}),
    ...(row.cancelledBy ? { cancelledByEmail: row.cancelledBy } : {}),
    ...(reschedulingReason ? { reschedulingReason } : {}),
    ...(row.rescheduledBy ? { rescheduledByEmail: row.rescheduledBy } : {}),
    ...(row.fromReschedule ? { rescheduledFromUid: row.fromReschedule } : {}),
    ...(row.rescheduledToUid ? { rescheduledToUid: row.rescheduledToUid } : {}),
    ...(row.recurringEventId ? { recurringBookingUid: row.recurringEventId } : {}),
    start: row.startTime.toISOString(),
    end: row.endTime.toISOString(),
    duration: Math.round((row.endTime.getTime() - row.startTime.getTime()) / 60_000),
    eventTypeId: row.eventTypeId,
    eventType: row.eventTypeId === null ? null : { id: row.eventTypeId, slug: row.eventTypeSlug ?? "" },
    ...(isUrl(row.location) ? { meetingUrl: row.location } : {}),
    location: row.location ?? "",
    absentHost: Boolean(row.noShowHost),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? null,
    metadata: stringRecord(row.metadata),
    ...(row.rating !== null ? { rating: row.rating } : {}),
    ...(row.iCalUID ? { icsUid: row.iCalUID } : {}),
    attendees: row.attendees.map((attendee) => ({
      name: attendee.name,
      email: attendee.email,
      displayEmail: attendee.email,
      timeZone: attendee.timeZone,
      language: attendee.locale ?? "en",
      absent: Boolean(attendee.noShow),
      ...(attendee.phoneNumber ? { phoneNumber: attendee.phoneNumber } : {}),
    })),
    guests,
    bookingFieldsResponses: responses,
  };
}

type BookingOutput = ReturnType<typeof toBookingOutput>;

export type { CreateBookingApiInput, ListBookingsApiQuery, BookingOutput };
export {
  addGuestsInputSchema,
  markAbsentInputSchema,
  toEditableLocation,
  updateLocationInputSchema,
  BOOKINGS_API_VERSION,
  createBookingInputSchema,
  listBookingsQuerySchema,
  cancelBookingInputSchema,
  rescheduleBookingInputSchema,
  declineBookingInputSchema,
  toLocationResponse,
  toResponses,
  listSort,
  toBookingOutput,
};
