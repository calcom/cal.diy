import { BookingsRepository_2024_08_13 } from "@/platform/bookings/2024-08-13/repositories/bookings.repository";
import {
  defaultBookingMetadata,
  defaultBookingResponses,
  defaultSeatedBookingData,
  defaultSeatedBookingMetadata,
} from "@/lib/safe-parse/default-responses-booking";
import { safeParse } from "@/lib/safe-parse/safe-parse";
import { Injectable } from "@nestjs/common";
import { plainToClass } from "class-transformer";
import { DateTime } from "luxon";
import { z } from "zod";

import { bookingMetadataSchema } from "@calcom/platform-libraries";
import {
  GetRecurringSeatedBookingOutput_2024_08_13,
  RecurringBookingOutput_2024_08_13,
  SeatedAttendee,
  BookingOutput_2024_08_13,
  GetSeatedBookingOutput_2024_08_13,
} from "@calcom/platform-types";
import type {
  CreateRecurringSeatedBookingOutput_2024_08_13,
  CreateSeatedBookingOutput_2024_08_13,
  ReassignBookingOutput_2024_08_13,
} from "@calcom/platform-types";
import type { Booking, BookingSeat } from "@calcom/prisma/client";

export const bookingResponsesSchema = z
  .object({
    email: z.string(),
    attendeePhoneNumber: z.string().optional(),
    name: z.union([
      z.string(),
      z.object({
        firstName: z.string(),
        lastName: z.string(),
      }),
    ]),
    guests: z.array(z.string()).optional(),
    rescheduleReason: z.string().optional(),
  })
  .passthrough()
  .describe("BookingResponses");

export const seatedBookingDataSchema = z
  .object({
    responses: z
      .object({
        email: z.string(),
        attendeePhoneNumber: z.string().optional(),
        name: z.union([
          z.string(),
          z.object({
            firstName: z.string(),
            lastName: z.string(),
          }),
        ]),
      })
      .passthrough(),
  })
  .passthrough()
  .describe("SeatedBookingData");

const seatedBookingMetadataSchema = z.object({}).catchall(z.string()).describe("SeatedBookingMetadata");

type DatabaseUser = { id: number; name: string | null; email: string; username: string | null };

type DatabaseBooking = Booking & {
  eventType: {
    id: number;
    slug: string;
    seatsShowAttendees?: boolean | null;
  } | null;
  attendees: {
    name: string;
    email: string;
    timeZone: string;
    locale: string | null;
    phoneNumber?: string | null;
    noShow: boolean | null;
    bookingSeat?: BookingSeat | null;
    createdAt?: Date | null
  }[];
  user: DatabaseUser | null;
  createdAt: Date;
};

type BookingWithUser = Booking & { user: DatabaseUser | null };

type DatabaseMetadata = z.infer<typeof bookingMetadataSchema>;

@Injectable()
export class OutputBookingsService_2024_08_13 {
  constructor(private readonly bookingsRepository: BookingsRepository_2024_08_13) {}

  private getDisplayEmail(email: string): string {
    return email.replace(/\+[a-zA-Z0-9]{25}/, "");
  }

  async getOutputBooking(databaseBooking: DatabaseBooking) {
    const dateStart = DateTime.fromISO(databaseBooking.startTime.toISOString());
    const dateEnd = DateTime.fromISO(databaseBooking.endTime.toISOString());
    const duration = dateEnd.diff(dateStart, "minutes").minutes;
    const bookingResponses = safeParse(
      bookingResponsesSchema,
      databaseBooking.responses,
      defaultBookingResponses
    );
    const metadata = safeParse(bookingMetadataSchema, databaseBooking.metadata, defaultBookingMetadata);
    const location = metadata?.videoCallUrl || databaseBooking.location;
    const rescheduledToUid = await this.getRescheduledToUid(databaseBooking);
    const rescheduledByEmail = await this.getRescheduledByEmail(databaseBooking);

    const booking = {
      id: databaseBooking.id,
      uid: databaseBooking.uid,
      title: databaseBooking.title,
      description: databaseBooking.description,
      hosts: [this.getHost(databaseBooking.user)],
      status: databaseBooking.status.toLowerCase(),
      cancellationReason: databaseBooking.cancellationReason || "",
      cancelledByEmail: databaseBooking.cancelledBy || "",
      reschedulingReason: bookingResponses?.rescheduledReason,
      rescheduledFromUid: databaseBooking.fromReschedule || undefined,
      start: databaseBooking.startTime,
      end: databaseBooking.endTime,
      duration,
      eventType: databaseBooking.eventType,
      // note(Lauris): eventTypeId is deprecated
      eventTypeId: databaseBooking.eventTypeId,
      attendees: databaseBooking.attendees.map((attendee) => ({
        name: attendee.name,
        email: attendee.email,
        displayEmail: this.getDisplayEmail(attendee.email),
        timeZone: attendee.timeZone,
        language: attendee.locale,
        absent: !!attendee.noShow,
        phoneNumber: attendee.phoneNumber ?? undefined,
      })),
      guests: bookingResponses.guests,
      location,
      // note(Lauris): meetingUrl is deprecated
      meetingUrl: location,
      absentHost: !!databaseBooking.noShowHost,
      createdAt: databaseBooking.createdAt,
      updatedAt: databaseBooking.updatedAt,
      rating: databaseBooking.rating,
      icsUid: databaseBooking.iCalUID,
      rescheduledToUid,
      rescheduledByEmail,
    };

    const bookingTransformed = plainToClass(BookingOutput_2024_08_13, booking, { strategy: "excludeAll" });
    // note(Lauris): I don't know why plainToClass erases bookings responses and metadata so attaching manually
    bookingTransformed.bookingFieldsResponses = bookingResponses;
    bookingTransformed.metadata = this.getUserDefinedMetadata(metadata);

    if (
      bookingTransformed.bookingFieldsResponses?.email &&
      typeof bookingTransformed.bookingFieldsResponses.email === "string"
    ) {
      bookingTransformed.bookingFieldsResponses.displayEmail = this.getDisplayEmail(
        bookingTransformed.bookingFieldsResponses.email
      );
    }

    if (
      bookingTransformed.bookingFieldsResponses?.guests &&
      Array.isArray(bookingTransformed.bookingFieldsResponses.guests)
    ) {
      bookingTransformed.bookingFieldsResponses.displayGuests = bookingTransformed.bookingFieldsResponses.guests.map(
        (guest: string) => this.getDisplayEmail(guest)
      );
    }

    return bookingTransformed;
  }

  async getRescheduledToInfo(bookingUid: string): Promise<{ uid?: string; rescheduledBy?: string | null }> {
    const rescheduledTo = await this.bookingsRepository.getByFromReschedule(bookingUid);
    return {
      uid: rescheduledTo?.uid,
      rescheduledBy: rescheduledTo?.rescheduledBy,
    };
  }

  private async getRescheduledToUid(databaseBooking: DatabaseBooking) {
    if (!databaseBooking.rescheduled) return undefined;
    const rescheduledTo = await this.bookingsRepository.getByFromReschedule(databaseBooking.uid);
    return rescheduledTo?.uid;
  }

  private async getRescheduledByEmail(databaseBooking: DatabaseBooking) {
    if (databaseBooking.rescheduled) {
      return databaseBooking.rescheduledBy;
    }
    if (databaseBooking.fromReschedule) {
      const previousBooking = await this.bookingsRepository.getByUid(databaseBooking.fromReschedule);
      return previousBooking?.rescheduledBy ?? databaseBooking.rescheduledBy;
    }
    return databaseBooking.rescheduledBy;
  }

  getUserDefinedMetadata(databaseMetadata: DatabaseMetadata) {
    if (databaseMetadata === null) return {};

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { videoCallUrl, ...userDefinedMetadata } = databaseMetadata;

    return userDefinedMetadata;
  }

  getHost(user: DatabaseUser | null) {
    if (!user) {
      return {
        id: "unknown",
        name: "unknown",
        email: "unknown",
        displayEmail: "unknown",
        username: "unknown",
      };
    }

    return {
      ...user,
      displayEmail: this.getDisplayEmail(user.email),
      username: user.username || "unknown",
    };
  }

  async getOutputRecurringBookings(bookingsIds: number[]) {
    const databaseBookings = await this.bookingsRepository.getByIdsWithAttendeesAndUserAndEvent(bookingsIds);
    
    const bookingsMap = new Map(databaseBookings.map(booking => [booking.id, booking]));
    
    const transformed = bookingsIds.map(bookingId => {
      const databaseBooking = bookingsMap.get(bookingId);
      if (!databaseBooking) {
        throw new Error(`Booking with id=${bookingId} was not found in the database`);
      }
      return this.getOutputRecurringBooking(databaseBooking);
    });
    return transformed.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }

  getOutputRecurringBooking(databaseBooking: DatabaseBooking) {
    const dateStart = DateTime.fromISO(databaseBooking.startTime.toISOString());
    const dateEnd = DateTime.fromISO(databaseBooking.endTime.toISOString());
    const duration = dateEnd.diff(dateStart, "minutes").minutes;
    const bookingResponses = safeParse(
      bookingResponsesSchema,
      databaseBooking.responses,
      defaultBookingResponses
    );
    const metadata = safeParse(bookingMetadataSchema, databaseBooking.metadata, defaultBookingMetadata);
    const location = metadata?.videoCallUrl || databaseBooking.location;

    const booking = {
      id: databaseBooking.id,
      uid: databaseBooking.uid,
      title: databaseBooking.title,
      description: databaseBooking.description,
      hosts: [this.getHost(databaseBooking.user)],
      status: databaseBooking.status.toLowerCase(),
      cancellationReason: databaseBooking.cancellationReason || "",
      cancelledByEmail: databaseBooking.cancelledBy || "",
      reschedulingReason: bookingResponses?.rescheduledReason,
      rescheduledFromUid: databaseBooking.fromReschedule || undefined,
      start: databaseBooking.startTime,
      end: databaseBooking.endTime,
      duration,
      eventType: databaseBooking.eventType,
      // note(Lauris): eventTypeId is deprecated
      eventTypeId: databaseBooking.eventTypeId,
      attendees: databaseBooking.attendees.map((attendee) => ({
        name: attendee.name,
        email: attendee.email,
        displayEmail: this.getDisplayEmail(attendee.email),
        timeZone: attendee.timeZone,
        language: attendee.locale,
        absent: !!attendee.noShow,
      })),
      guests: bookingResponses.guests,
      location,
      // note(Lauris): meetingUrl is deprecated
      meetingUrl: location,
      recurringBookingUid: databaseBooking.recurringEventId,
      absentHost: !!databaseBooking.noShowHost,
      bookingFieldsResponses: databaseBooking.responses,
      createdAt: databaseBooking.createdAt,
      updatedAt: databaseBooking.updatedAt,
      rating: databaseBooking.rating,
      icsUid: databaseBooking.iCalUID,
    };

    const bookingTransformed = plainToClass(RecurringBookingOutput_2024_08_13, booking, {
      strategy: "excludeAll",
    });
    // note(Lauris): I don't know why plainToClass erases bookings responses and metadata so attaching manually
    bookingTransformed.bookingFieldsResponses = bookingResponses;
    bookingTransformed.metadata = this.getUserDefinedMetadata(metadata);

    if (
      bookingTransformed.bookingFieldsResponses?.email &&
      typeof bookingTransformed.bookingFieldsResponses.email === "string"
    ) {
      bookingTransformed.bookingFieldsResponses.displayEmail = this.getDisplayEmail(
        bookingTransformed.bookingFieldsResponses.email
      );
    }

    if (
      bookingTransformed.bookingFieldsResponses?.guests &&
      Array.isArray(bookingTransformed.bookingFieldsResponses.guests)
    ) {
      bookingTransformed.bookingFieldsResponses.displayGuests = bookingTransformed.bookingFieldsResponses.guests.map(
        (guest: string) => this.getDisplayEmail(guest)
      );
    }

    return bookingTransformed;
  }

  async getOutputCreateSeatedBooking(
    databaseBooking: DatabaseBooking,
    seatUid: string,
    userIsEventTypeAdminOrOwner: boolean
  ): Promise<CreateSeatedBookingOutput_2024_08_13> {
    const showAttendees = userIsEventTypeAdminOrOwner || !!databaseBooking.eventType?.seatsShowAttendees;
    const getSeatedBookingOutput = await this.getOutputSeatedBooking(databaseBooking, showAttendees);
    return { ...getSeatedBookingOutput, seatUid };
  }

  async getOutputSeatedBooking(databaseBooking: DatabaseBooking, showAttendees: boolean) {
    const dateStart = DateTime.fromISO(databaseBooking.startTime.toISOString());
    const dateEnd = DateTime.fromISO(databaseBooking.endTime.toISOString());
    const duration = dateEnd.diff(dateStart, "minutes").minutes;
    const metadata = safeParse(bookingMetadataSchema, databaseBooking.metadata, defaultBookingMetadata);
    const location = metadata?.videoCallUrl || databaseBooking.location;
    const rescheduledToUid = await this.getRescheduledToUid(databaseBooking);
    const rescheduledByEmail = await this.getRescheduledByEmail(databaseBooking);

    const booking = {
      id: databaseBooking.id,
      uid: databaseBooking.uid,
      title: databaseBooking.title,
      description: databaseBooking.description,
      hosts: [this.getHost(databaseBooking.user)],
      status: databaseBooking.status.toLowerCase(),
      cancellationReason: databaseBooking.cancellationReason || "",
      rescheduledFromUid: databaseBooking.fromReschedule || undefined,
      start: databaseBooking.startTime,
      end: databaseBooking.endTime,
      duration,
      eventType: databaseBooking.eventType,
      // note(Lauris): eventTypeId is deprecated
      eventTypeId: databaseBooking.eventTypeId,
      attendees: [],
      location,
      // note(Lauris): meetingUrl is deprecated
      meetingUrl: location,
      absentHost: !!databaseBooking.noShowHost,
      createdAt: databaseBooking.createdAt,
      updatedAt: databaseBooking.updatedAt,
      rating: databaseBooking.rating,
      icsUid: databaseBooking.iCalUID,
      rescheduledToUid,
      rescheduledByEmail,
    };

    const parsed = plainToClass(GetSeatedBookingOutput_2024_08_13, booking, { strategy: "excludeAll" });

    // note(Lauris): I don't know why plainToClass erases booking.attendees[n].responses so attaching manually
    parsed.attendees = showAttendees
      ? databaseBooking.attendees.map((attendee) => {
          const { responses } = safeParse(
            seatedBookingDataSchema,
            attendee.bookingSeat?.data,
            defaultSeatedBookingData,
            false
          );

          const attendeeData = {
            name: attendee.name,
            email: attendee.email,
            displayEmail: this.getDisplayEmail(attendee.email),
            timeZone: attendee.timeZone,
            language: attendee.locale,
            absent: !!attendee.noShow,
            seatUid: attendee.bookingSeat?.referenceUid,
            bookingFieldsResponses: {},
            createdAt: attendee.createdAt ? attendee.createdAt.toISOString() : null,
          };
          const attendeeParsed = plainToClass(SeatedAttendee, attendeeData, { strategy: "excludeAll" });
          attendeeParsed.bookingFieldsResponses = responses || {};
          attendeeParsed.metadata = safeParse(
            seatedBookingMetadataSchema,
            attendee.bookingSeat?.metadata,
            defaultSeatedBookingMetadata,
            false
          );
          // note(Lauris): as of now email is not returned for privacy
          delete attendeeParsed.bookingFieldsResponses.email;

          return attendeeParsed;
        })
      : [];

    return parsed;
  }

  async getOutputRecurringSeatedBookings(bookingsIds: number[], showAttendees: boolean) {
    const databaseBookings = await this.bookingsRepository.getByIdsWithAttendeesWithBookingSeatAndUserAndEvent(bookingsIds);
    
    const bookingsMap = new Map(databaseBookings.map(booking => [booking.id, booking]));
    
    const transformed = bookingsIds.map(bookingId => {
      const databaseBooking = bookingsMap.get(bookingId);
      if (!databaseBooking) {
        throw new Error(`Booking with id=${bookingId} was not found in the database`);
      }
      return this.getOutputRecurringSeatedBooking(databaseBooking, showAttendees);
    });

    return transformed.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }

  async getOutputCreateRecurringSeatedBookings(
    bookings: { uid: string; seatUid: string }[],
    userIsEventTypeAdminOrOwner: boolean
  ) {
    const transformed = [];

    for (const booking of bookings) {
      const databaseBooking =
        await this.bookingsRepository.getByUidWithAttendeesWithBookingSeatAndUserAndEvent(booking.uid);
      if (!databaseBooking) {
        throw new Error(`Booking with uid=${booking.uid} was not found in the database`);
      }
      transformed.push(
        this.getOutputCreateRecurringSeatedBooking(
          databaseBooking,
          booking.seatUid,
          userIsEventTypeAdminOrOwner
        )
      );
    }

    return transformed.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }

  getOutputCreateRecurringSeatedBooking(
    databaseBooking: DatabaseBooking,
    seatUid: string,
    userIsEventTypeAdminOrOwner: boolean
  ): CreateRecurringSeatedBookingOutput_2024_08_13 {
    const showAttendees = userIsEventTypeAdminOrOwner || !!databaseBooking.eventType?.seatsShowAttendees;
    const getRecurringSeatedBookingOutput = this.getOutputRecurringSeatedBooking(
      databaseBooking,
      showAttendees
    );
    return { ...getRecurringSeatedBookingOutput, seatUid };
  }

  getOutputRecurringSeatedBooking(databaseBooking: DatabaseBooking, showAttendees: boolean) {
    const dateStart = DateTime.fromISO(databaseBooking.startTime.toISOString());
    const dateEnd = DateTime.fromISO(databaseBooking.endTime.toISOString());
    const duration = dateEnd.diff(dateStart, "minutes").minutes;
    const metadata = safeParse(bookingMetadataSchema, databaseBooking.metadata, defaultBookingMetadata);
    const location = metadata?.videoCallUrl || databaseBooking.location;

    const booking = {
      id: databaseBooking.id,
      uid: databaseBooking.uid,
      title: databaseBooking.title,
      description: databaseBooking.description,
      hosts: [this.getHost(databaseBooking.user)],
      status: databaseBooking.status.toLowerCase(),
      cancellationReason: databaseBooking.cancellationReason || "",
      rescheduledFromUid: databaseBooking.fromReschedule || undefined,
      start: databaseBooking.startTime,
      end: databaseBooking.endTime,
      duration,
      eventType: databaseBooking.eventType,
      // note(Lauris): eventTypeId is deprecated
      eventTypeId: databaseBooking.eventTypeId,
      attendees: [],
      location,
      // note(Lauris): meetingUrl is deprecated
      meetingUrl: location,
      recurringBookingUid: databaseBooking.recurringEventId,
      absentHost: !!databaseBooking.noShowHost,
      createdAt: databaseBooking.createdAt,
      updatedAt: databaseBooking.updatedAt,
      rating: databaseBooking.rating,
      icsUid: databaseBooking.iCalUID,
    };

    const parsed = plainToClass(GetRecurringSeatedBookingOutput_2024_08_13, booking, {
      strategy: "excludeAll",
    });

    // note(Lauris): I don't know why plainToClass erases booking.attendees[n].responses so attaching manually
    parsed.attendees = showAttendees
      ? databaseBooking.attendees.map((attendee) => {
          const { responses } = safeParse(
            seatedBookingDataSchema,
            attendee.bookingSeat?.data,
            defaultSeatedBookingData,
            false
          );

          const attendeeData = {
            name: attendee.name,
            email: attendee.email,
            displayEmail: this.getDisplayEmail(attendee.email),
            timeZone: attendee.timeZone,
            language: attendee.locale,
            absent: !!attendee.noShow,
            seatUid: attendee.bookingSeat?.referenceUid,
            bookingFieldsResponses: {},
            createdAt: attendee.createdAt ? attendee.createdAt.toISOString() : null,
          };
          const attendeeParsed = plainToClass(SeatedAttendee, attendeeData, { strategy: "excludeAll" });
          attendeeParsed.bookingFieldsResponses = responses || {};
          attendeeParsed.metadata = safeParse(
            seatedBookingMetadataSchema,
            attendee.bookingSeat?.metadata,
            defaultSeatedBookingMetadata,
            false
          );
          // note(Lauris): as of now email is not returned for privacy
          delete attendeeParsed.bookingFieldsResponses.email;
          return attendeeParsed;
        })
      : [];

    return parsed;
  }

  getOutputReassignedBooking(
    databaseBooking: Pick<BookingWithUser, "uid" | "user">
  ): ReassignBookingOutput_2024_08_13 {
    return {
      bookingUid: databaseBooking.uid,
      reassignedTo: {
        id: databaseBooking?.user?.id || 0,
        name: databaseBooking?.user?.name || "unknown",
        email: databaseBooking?.user?.email || "unknown",
        displayEmail: databaseBooking?.user?.email
          ? this.getDisplayEmail(databaseBooking.user.email)
          : "unknown",
      },
    };
  }
}
