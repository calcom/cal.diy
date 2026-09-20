import {
  confirmBookingHandler,
  distributedTracing,
  getAllUserBookings,
  getCalendarLinks,
  getTranslation,
  handleCancelBooking,
  handleMarkNoShow,
  roundRobinManualReassignment,
  roundRobinReassignment,
} from "@calcom/platform-libraries";
import { makeUserActor, PrismaOrgMembershipRepository } from "@calcom/platform-libraries/bookings";
import type { RescheduleSeatedBookingInput_2024_08_13 } from "@calcom/platform-types";
import {
  BookingOutput_2024_08_13,
  CancelBookingInput,
  CreateBookingInput,
  CreateBookingInput_2024_08_13,
  CreateRecurringBookingInput_2024_08_13,
  GetBookingsInput_2024_08_13,
  GetRecurringSeatedBookingOutput_2024_08_13,
  GetSeatedBookingOutput_2024_08_13,
  MarkAbsentBookingInput_2024_08_13,
  ReassignToUserBookingInput_2024_08_13,
  RecurringBookingOutput_2024_08_13,
  RescheduleBookingInput,
} from "@calcom/platform-types";
import type { PrismaClient } from "@calcom/prisma";
import type { EventType, Team, User } from "@calcom/prisma/client";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Request } from "express";
import { DateTime } from "luxon";
import { z } from "zod";
import { CalendarLink } from "@/platform/bookings/2024-08-13/outputs/calendar-links.output";
import { BookingsRepository_2024_08_13 } from "@/platform/bookings/2024-08-13/repositories/bookings.repository";
import { ErrorsBookingsService_2024_08_13 } from "@/platform/bookings/2024-08-13/services/errors.service";
import { InputBookingsService_2024_08_13 } from "@/platform/bookings/2024-08-13/services/input.service";
import { OutputBookingsService_2024_08_13 } from "@/platform/bookings/2024-08-13/services/output.service";
import { PlatformBookingsService } from "@/platform/bookings/shared/platform-bookings.service";
import { EventTypesRepository_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/event-types.repository";
import { getPagination } from "@/lib/pagination/pagination";
import { RecurringBookingService } from "@/lib/services/recurring-booking.service";
import { RegularBookingService } from "@/lib/services/regular-booking.service";
import { AuthOptionalUser } from "@/modules/auth/decorators/get-optional-user/get-optional-user.decorator";
import { ApiAuthGuardUser } from "@/modules/auth/strategies/api-auth/api-auth.strategy";
import { BookingSeatRepository } from "@/modules/booking-seat/booking-seat.repository";
import { EventTypeAccessService } from "@/modules/event-types/services/event-type-access.service";
import { KyselyReadService } from "@/modules/kysely/kysely-read.service";
import { OAuthClientRepository } from "@/modules/oauth-clients/oauth-client.repository";
import { OAuthClientUsersService } from "@/modules/oauth-clients/services/oauth-clients-users.service";
import { PrismaReadService } from "@/modules/prisma/prisma-read.service";
import { TeamsEventTypesRepository } from "@/modules/teams/event-types/teams-event-types.repository";
import { TeamsRepository } from "@/modules/teams/teams/teams.repository";
import { UsersService } from "@/modules/users/services/users.service";
import { UsersRepository } from "@/modules/users/users.repository";

export const BOOKING_REASSIGN_PERMISSION_ERROR = "You do not have permission to reassign this booking";

type CreatedBooking = {
  hosts: { id: number }[];
  uid: string;
  start: string;
  isPlatformManagedUserBooking?: boolean;
};

const eventTypeBookingFieldSchema = z
  .object({
    name: z.string(),
    required: z.boolean(),
    editable: z.string(),
    type: z.string(),
    options: z.array(z.object({ value: z.string() })).optional(),
  })
  .passthrough();

export const eventTypeBookingFieldsSchema = z.array(eventTypeBookingFieldSchema);

export type EventTypeWithOwnerAndTeam = EventType & { owner: User | null; team: Team | null };

@Injectable()
export class BookingsService_2024_08_13 {
  private readonly logger = new Logger("BookingsService");
  constructor(
    private readonly inputService: InputBookingsService_2024_08_13,
    private readonly outputService: OutputBookingsService_2024_08_13,
    private readonly bookingsRepository: BookingsRepository_2024_08_13,
    private readonly bookingSeatRepository: BookingSeatRepository,
    private readonly eventTypesRepository: EventTypesRepository_2024_06_14,
    private readonly prismaReadService: PrismaReadService,
    private readonly kyselyReadService: KyselyReadService,
    private readonly usersService: UsersService,
    private readonly usersRepository: UsersRepository,
    private readonly platformBookingsService: PlatformBookingsService,
    private readonly oAuthClientRepository: OAuthClientRepository,
    private readonly teamsRepository: TeamsRepository,
    private readonly teamsEventTypesRepository: TeamsEventTypesRepository,
    private readonly errorsBookingsService: ErrorsBookingsService_2024_08_13,
    private readonly regularBookingService: RegularBookingService,
    private readonly recurringBookingService: RecurringBookingService,
    private readonly eventTypeAccessService: EventTypeAccessService
  ) {}

  async createBooking(request: Request, body: CreateBookingInput, authUser: AuthOptionalUser) {
    let bookingTeamEventType = false;
    try {
      const eventType = await this.getBookedEventType(body);
      if (eventType?.team) {
        bookingTeamEventType = true;
      }
      if (!eventType) {
        this.errorsBookingsService.handleEventTypeToBeBookedNotFound(body);
      }
      const userIsEventTypeAdminOrOwner = authUser
        ? await this.eventTypeAccessService.userIsEventTypeAdminOrOwner(authUser, eventType)
        : false;
      const skipAvailabilityCheck = this.getSkipAvailabilityForOverride({
        overrideAvailabilityRequested: !!body.overrideAvailability,
        authUser,
        userIsEventTypeAdminOrOwner,
      });
      await this.checkBookingRequiresAuthenticationSetting(eventType, authUser, userIsEventTypeAdminOrOwner);

      if (eventType.schedulingType === "MANAGED") {
        throw new BadRequestException(
          `Event type with id=${eventType.id} is the parent managed event type that can't be booked. You have to provide the child event type id aka id of event type that has been assigned to one of the users.`
        );
      }

      if (eventType.schedulingType === "COLLECTIVE" || eventType.schedulingType === "ROUND_ROBIN") {
        await this.checkEventTypeHasHosts(eventType.id);
      }

      body.eventTypeId = eventType.id;

      const isRecurring = !!eventType?.recurringEvent;
      const isSeated = !!eventType?.seatsPerTimeSlot;

      await this.hasRequiredBookingFieldsResponses(body, eventType);

      if (isRecurring && isSeated) {
        return await this.createRecurringSeatedBooking(
          request,
          body,
          eventType,
          userIsEventTypeAdminOrOwner,
          skipAvailabilityCheck
        );
      }
      if (isRecurring && !isSeated) {
        return await this.createRecurringBooking(request, body, eventType, skipAvailabilityCheck);
      }
      if (isSeated) {
        return await this.createSeatedBooking(
          request,
          body,
          eventType,
          userIsEventTypeAdminOrOwner,
          skipAvailabilityCheck
        );
      }

      return await this.createRegularBooking(request, body, eventType, skipAvailabilityCheck);
    } catch (error) {
      this.errorsBookingsService.handleBookingError(error, bookingTeamEventType);
    }
  }

  private getSkipAvailabilityForOverride(params: {
    overrideAvailabilityRequested: boolean;
    authUser: AuthOptionalUser;
    userIsEventTypeAdminOrOwner: boolean;
  }): boolean {
    if (!params.overrideAvailabilityRequested) {
      return false;
    }
    if (!params.authUser) {
      throw new UnauthorizedException("overrideAvailability requires authentication");
    }
    if (!params.userIsEventTypeAdminOrOwner) {
      throw new ForbiddenException(
        "overrideAvailability is only permitted when authenticated as the event type owner or host, or as a team or organization administrator."
      );
    }
    return true;
  }

  async checkEventTypeHasHosts(eventTypeId: number) {
    const eventType = await this.eventTypesRepository.getEventTypeWithHosts(eventTypeId);
    if (!eventType?.hosts?.length) {
      throw new UnprocessableEntityException(
        `Can't book this team event type because it has no hosts. Please, add at least 1 host to event type with id=${eventTypeId} belonging to team with id=${eventType?.teamId} and try again.`
      );
    }
  }

  async checkBookingRequiresAuthenticationSetting(
    eventType: EventTypeWithOwnerAndTeam,
    authUser: AuthOptionalUser,
    userIsEventTypeAdminOrOwner: boolean
  ) {
    if (!eventType.bookingRequiresAuthentication) return true;
    if (!authUser) {
      throw new UnauthorizedException(
        "checkBookingRequiresAuthentication - request must be authenticated by passing credentials belonging to event type owner, host or team or org admin or owner."
      );
    }

    if (!userIsEventTypeAdminOrOwner) {
      throw new ForbiddenException(
        "checkBookingRequiresAuthentication - user is not authorized to access this event type. User has to be either event type owner, host, team admin or owner or org admin or owner."
      );
    }
  }

  async getBookedEventType(body: CreateBookingInput) {
    if (body.eventTypeId) {
      return await this.eventTypesRepository.getEventTypeByIdWithOwnerAndTeam(body.eventTypeId);
    } else if (body.username && body.eventTypeSlug) {
      const user = await this.usersRepository.findByUsername(body.username, body.organizationSlug);
      if (!user) {
        throw new NotFoundException(`User with username ${body.username} not found`);
      }
      return await this.eventTypesRepository.getUserEventTypeBySlugWithOwnerAndTeam(
        user.id,
        body.eventTypeSlug
      );
    } else if (body.teamSlug && body.eventTypeSlug) {
      const team = await this.getBookedEventTypeTeam(body.teamSlug);
      if (!team) {
        throw new NotFoundException(`Team with slug ${body.teamSlug} not found`);
      }
      return await this.teamsEventTypesRepository.getEventTypeByTeamIdAndSlugWithOwnerAndTeam(
        team.id,
        body.eventTypeSlug
      );
    }
    return null;
  }

  async getBookedEventTypeTeam(teamSlug: string) {
    return await this.teamsRepository.findTeamBySlug(teamSlug);
  }

  async hasRequiredBookingFieldsResponses(body: CreateBookingInput, eventType: EventType | null) {
    const bookingFieldsResponses: Record<string, unknown> = {
      ...body.bookingFieldsResponses,
      attendeePhoneNumber: body.attendee.phoneNumber,
      smsReminderNumber: body.attendee.phoneNumber,
    };
    if (!eventType?.bookingFields) {
      return true;
    }

    // note(Lauris): we filter out system fields, because some of them are set by default and name and email are passed in the body.attendee. Only exception
    // is smsReminderNumber, because if it is required and not passed SMS reminders won't work.
    const eventTypeBookingFields = eventTypeBookingFieldsSchema
      .parse(eventType.bookingFields)
      .filter((field) => !field.editable.startsWith("system") || field.name === "smsReminderNumber");

    if (!eventTypeBookingFields.length) {
      return true;
    }

    for (const eventTypeBookingField of eventTypeBookingFields) {
      if (
        eventTypeBookingField.required &&
        (bookingFieldsResponses[eventTypeBookingField.name] === null ||
          bookingFieldsResponses[eventTypeBookingField.name] === undefined)
      ) {
        if (
          eventTypeBookingField.name === "attendeePhoneNumber" ||
          eventTypeBookingField.name === "smsReminderNumber"
        ) {
          throw new BadRequestException(
            `Missing attendee phone number - it is required by the event type. Pass it as "attendee.phoneNumber" string in the request.`
          );
        }
        throw new BadRequestException(
          `Missing required booking field response: ${eventTypeBookingField.name} - it is required by the event type booking fields, but missing in the bookingFieldsResponses. You can fetch the event type with ID ${eventType.id} to see the required fields.`
        );
      }

      const bookingFieldResponseValue = bookingFieldsResponses[eventTypeBookingField.name];
      if (bookingFieldResponseValue !== undefined) {
        const bookingFieldResponseValueType = typeof bookingFieldResponseValue;
        let expectedBookingFieldResponseValueType = "";
        let isValidType = false;
        const eventTypeBookingFieldType = eventTypeBookingField.type;

        switch (eventTypeBookingFieldType) {
          case "phone":
            expectedBookingFieldResponseValueType = "string";
            isValidType = bookingFieldResponseValueType === "string";
            break;
          case "address":
            expectedBookingFieldResponseValueType = "string";
            isValidType = bookingFieldResponseValueType === "string";
            break;
          case "text":
            expectedBookingFieldResponseValueType = "string";
            isValidType = bookingFieldResponseValueType === "string";
            break;
          case "number":
            expectedBookingFieldResponseValueType = "number";
            isValidType = bookingFieldResponseValueType === "number";
            break;
          case "textarea":
            expectedBookingFieldResponseValueType = "string";
            isValidType = bookingFieldResponseValueType === "string";
            break;
          case "multiemail":
            expectedBookingFieldResponseValueType = "array";
            isValidType = Array.isArray(bookingFieldResponseValue);
            break;
          case "boolean":
            expectedBookingFieldResponseValueType = "boolean";
            isValidType = bookingFieldResponseValueType === "boolean";
            break;
          case "select":
            expectedBookingFieldResponseValueType = "string or number";
            isValidType =
              bookingFieldResponseValueType === "string" || bookingFieldResponseValueType === "number";
            if (isValidType && Array.isArray(eventTypeBookingField.options)) {
              const submittedValue = bookingFieldResponseValue as string | number;
              const allowedOptionValues = eventTypeBookingField.options.map((opt) => opt.value);
              if (!this.isValidSingleOptionValue(submittedValue, allowedOptionValues)) {
                throw new BadRequestException(
                  `Invalid option '${submittedValue}' for booking field '${
                    eventTypeBookingField.name
                  }'. Allowed options are: ${allowedOptionValues.join(", ")}.`
                );
              }
            }
            break;
          case "multiselect":
            expectedBookingFieldResponseValueType = "array";
            isValidType = Array.isArray(bookingFieldResponseValue);
            if (isValidType && Array.isArray(eventTypeBookingField.options)) {
              const submittedValues = bookingFieldResponseValue as (string | number)[];
              const allowedOptionValues = eventTypeBookingField.options.map((opt) => opt.value);
              if (!this.areValidMultipleOptionValues(submittedValues, allowedOptionValues)) {
                throw new BadRequestException(
                  `One or more invalid options for booking field '${
                    eventTypeBookingField.name
                  }'. Allowed options are: ${allowedOptionValues.join(", ")}.`
                );
              }
            }
            break;
          case "checkbox":
            expectedBookingFieldResponseValueType = "array";
            isValidType = Array.isArray(bookingFieldResponseValue);
            if (isValidType && Array.isArray(eventTypeBookingField.options)) {
              const submittedValues = bookingFieldResponseValue as (string | number)[];
              const allowedOptionValues = eventTypeBookingField.options.map((opt) => opt.value);
              if (!this.areValidMultipleOptionValues(submittedValues, allowedOptionValues)) {
                throw new BadRequestException(
                  `One or more invalid options for booking field '${
                    eventTypeBookingField.name
                  }'. Allowed options are: ${allowedOptionValues.join(", ")}.`
                );
              }
            }
            break;
          case "radio":
            expectedBookingFieldResponseValueType = "string or number";
            isValidType =
              bookingFieldResponseValueType === "string" || bookingFieldResponseValueType === "number";
            if (isValidType && Array.isArray(eventTypeBookingField.options)) {
              const submittedValue = bookingFieldResponseValue as string | number;
              const allowedOptionValues = eventTypeBookingField.options.map((opt) => opt.value);
              if (!this.isValidSingleOptionValue(submittedValue, allowedOptionValues)) {
                throw new BadRequestException(
                  `Invalid option '${submittedValue}' for booking field '${
                    eventTypeBookingField.name
                  }'. Allowed options are: ${allowedOptionValues.join(", ")}.`
                );
              }
            }
            break;
          case "url":
            expectedBookingFieldResponseValueType = "string";
            isValidType = bookingFieldResponseValueType === "string";
            break;
          default:
            // note(Lauris): by default pass the field if we have a missing "case" in the switch
            isValidType = true;
            break;
        }

        if (!isValidType) {
          throw new BadRequestException(
            `Invalid type for booking field '${eventTypeBookingField.name}'. Expected type ${expectedBookingFieldResponseValueType} (compatible with field type '${eventTypeBookingFieldType}'), but received ${bookingFieldResponseValueType}.`
          );
        }
      }
    }

    return true;
  }

  private isValidSingleOptionValue(
    bookingFieldResponseValue: string | number,
    eventTypeBookingFieldOptions: string[]
  ): boolean {
    if (eventTypeBookingFieldOptions.length === 0) {
      // note(Lauris): If no options defined, cannot validate against them, so pass.
      return true;
    }
    return eventTypeBookingFieldOptions.some((val) => val === String(bookingFieldResponseValue));
  }

  private areValidMultipleOptionValues(
    bookingFieldResponseValues: (string | number)[],
    eventTypeBookingFieldOptions: string[]
  ): boolean {
    if (eventTypeBookingFieldOptions.length === 0) {
      // note(Lauris): If no options defined, cannot validate against them, so pass.
      return true;
    }
    return bookingFieldResponseValues.every((submittedVal) =>
      eventTypeBookingFieldOptions.some((allowedVal) => allowedVal === String(submittedVal))
    );
  }

  async createRecurringBooking(
    request: Request,
    body: CreateRecurringBookingInput_2024_08_13,
    eventType: EventTypeWithOwnerAndTeam,
    skipAvailabilityCheck: boolean
  ) {
    const bookingRequest = await this.inputService.createRecurringBookingRequest(request, body, eventType);
    const bookings = await this.recurringBookingService.createBooking({
      bookingData: bookingRequest.body,
      bookingMeta: {
        userId: bookingRequest.userId,
        hostname: bookingRequest.headers?.host || "",
        platformClientId: bookingRequest.platformClientId,
        platformRescheduleUrl: bookingRequest.platformRescheduleUrl,
        platformCancelUrl: bookingRequest.platformCancelUrl,
        platformBookingUrl: bookingRequest.platformBookingUrl,
        platformBookingLocation: bookingRequest.platformBookingLocation,
        noEmail: bookingRequest.noEmail,
        areCalendarEventsEnabled: bookingRequest.areCalendarEventsEnabled,
        skipAvailabilityCheck,
      },
      creationSource: "API_V2",
    });
    const ids = bookings.map((booking) => booking.id || 0);
    const outputBookings = await this.outputService.getOutputRecurringBookings(ids);
    const isPlatformManagedUserBooking = !!(bookings[0]?.userId && bookings[0]?.user?.isPlatformManaged);
    return outputBookings.map((outputBooking) =>
      Object.assign(outputBooking, { isPlatformManagedUserBooking })
    );
  }

  async createRecurringSeatedBooking(
    request: Request,
    body: CreateRecurringBookingInput_2024_08_13,
    eventType: EventTypeWithOwnerAndTeam,
    userIsEventTypeAdminOrOwner: boolean,
    skipAvailabilityCheck: boolean
  ) {
    const bookingRequest = await this.inputService.createRecurringBookingRequest(request, body, eventType);
    const bookings = await this.recurringBookingService.createBooking({
      bookingData: bookingRequest.body,
      bookingMeta: {
        userId: bookingRequest.userId,
        hostname: bookingRequest.headers?.host || "",
        platformClientId: bookingRequest.platformClientId,
        platformRescheduleUrl: bookingRequest.platformRescheduleUrl,
        platformCancelUrl: bookingRequest.platformCancelUrl,
        platformBookingUrl: bookingRequest.platformBookingUrl,
        platformBookingLocation: bookingRequest.platformBookingLocation,
        areCalendarEventsEnabled: bookingRequest.areCalendarEventsEnabled,
        skipAvailabilityCheck,
      },
      creationSource: "API_V2",
    });
    const outputBookings = await this.outputService.getOutputCreateRecurringSeatedBookings(
      bookings.map((booking) => ({ uid: booking.uid || "", seatUid: booking.seatReferenceUid || "" })),
      userIsEventTypeAdminOrOwner
    );
    const isPlatformManagedUserBooking = !!(bookings[0]?.userId && bookings[0]?.user?.isPlatformManaged);
    return outputBookings.map((outputBooking) =>
      Object.assign(outputBooking, { isPlatformManagedUserBooking })
    );
  }

  async createRegularBooking(
    request: Request,
    body: CreateBookingInput_2024_08_13,
    eventType: EventTypeWithOwnerAndTeam,
    skipAvailabilityCheck: boolean
  ) {
    const bookingRequest = await this.inputService.createBookingRequest(request, body, eventType);
    const booking = await this.regularBookingService.createBooking({
      bookingData: bookingRequest.body,
      bookingMeta: {
        userId: bookingRequest.userId,
        hostname: bookingRequest.headers?.host || "",
        platformClientId: bookingRequest.platformClientId,
        platformRescheduleUrl: bookingRequest.platformRescheduleUrl,
        platformCancelUrl: bookingRequest.platformCancelUrl,
        platformBookingUrl: bookingRequest.platformBookingUrl,
        platformBookingLocation: bookingRequest.platformBookingLocation,
        areCalendarEventsEnabled: bookingRequest.areCalendarEventsEnabled,
        skipAvailabilityCheck,
      },
    });

    if (!booking.uid) {
      throw new Error("Booking missing uid");
    }

    const databaseBooking = await this.bookingsRepository.getByUidWithAttendeesAndUserAndEvent(booking.uid);
    if (!databaseBooking) {
      throw new Error(`Booking with uid=${booking.uid} was not found in the database`);
    }

    const outputBooking = await this.outputService.getOutputBooking(databaseBooking);
    return Object.assign(
      outputBooking,
      booking.userId
        ? {
            isPlatformManagedUserBooking: booking.user?.isPlatformManaged ?? false,
          }
        : {}
    );
  }

  async createSeatedBooking(
    request: Request,
    body: CreateBookingInput_2024_08_13,
    eventType: EventTypeWithOwnerAndTeam,
    userIsEventTypeAdminOrOwner: boolean,
    skipAvailabilityCheck: boolean
  ) {
    const bookingRequest = await this.inputService.createBookingRequest(request, body, eventType);
    try {
      const booking = await this.regularBookingService.createBooking({
        bookingData: bookingRequest.body,
        bookingMeta: {
          userId: bookingRequest.userId,
          hostname: bookingRequest.headers?.host || "",
          platformClientId: bookingRequest.platformClientId,
          platformRescheduleUrl: bookingRequest.platformRescheduleUrl,
          platformCancelUrl: bookingRequest.platformCancelUrl,
          platformBookingUrl: bookingRequest.platformBookingUrl,
          platformBookingLocation: bookingRequest.platformBookingLocation,
          areCalendarEventsEnabled: bookingRequest.areCalendarEventsEnabled,
          skipAvailabilityCheck,
        },
      });

      if (!booking.uid) {
        throw new Error("Booking missing uid");
      }

      const databaseBooking =
        await this.bookingsRepository.getByUidWithAttendeesWithBookingSeatAndUserAndEvent(booking.uid);
      if (!databaseBooking) {
        throw new Error(`Booking with uid=${booking.uid} was not found in the database`);
      }

      const outputBooking = await this.outputService.getOutputCreateSeatedBooking(
        databaseBooking,
        booking.seatReferenceUid || "",
        userIsEventTypeAdminOrOwner
      );
      return Object.assign(
        outputBooking,
        booking.userId
          ? {
              isPlatformManagedUserBooking: booking.user?.isPlatformManaged ?? false,
            }
          : {}
      );
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "booking_seats_full_error") {
          throw new ConflictException("No more seats left at this seated booking.");
        }
      }
      throw error;
    }
  }

  async getBooking(uid: string, authUser: AuthOptionalUser) {
    const booking = await this.bookingsRepository.getByUidWithAttendeesWithBookingSeatAndUserAndEvent(uid);
    const userIsEventTypeAdminOrOwner =
      authUser && booking?.eventType
        ? await this.eventTypeAccessService.userIsEventTypeAdminOrOwner(authUser, booking.eventType)
        : false;

    if (booking) {
      const isRecurring = !!booking.recurringEventId;
      const isSeated = !!booking.eventType?.seatsPerTimeSlot;

      if (isRecurring && !isSeated) {
        return this.outputService.getOutputRecurringBooking(booking);
      }
      if (isRecurring && isSeated) {
        const showAttendees = userIsEventTypeAdminOrOwner || !!booking.eventType?.seatsShowAttendees;
        return this.outputService.getOutputRecurringSeatedBooking(booking, showAttendees);
      }
      if (isSeated) {
        const showAttendees = userIsEventTypeAdminOrOwner || !!booking.eventType?.seatsShowAttendees;
        return this.outputService.getOutputSeatedBooking(booking, showAttendees);
      }
      return this.outputService.getOutputBooking(booking);
    }

    const recurringBooking = await this.bookingsRepository.getRecurringByUidWithAttendeesAndUserAndEvent(uid);
    if (!recurringBooking.length) {
      throw new NotFoundException(`Booking with uid=${uid} was not found in the database`);
    }
    const ids = recurringBooking.map((booking) => booking.id);
    const isRecurringSeated = !!recurringBooking[0].eventType?.seatsPerTimeSlot;
    if (isRecurringSeated) {
      const showAttendees =
        userIsEventTypeAdminOrOwner || !!recurringBooking[0].eventType?.seatsShowAttendees;
      return this.outputService.getOutputRecurringSeatedBookings(ids, showAttendees);
    }

    return this.outputService.getOutputRecurringBookings(ids);
  }

  async getBookingBySeatUid(seatUid: string, authUser: AuthOptionalUser) {
    const bookingSeat =
      await this.bookingSeatRepository.getByReferenceUidIncludeBookingWithAttendeesAndUserAndEvent(seatUid);

    if (!bookingSeat || !bookingSeat.booking) {
      throw new NotFoundException(`Booking with seatUid=${seatUid} was not found in the database`);
    }

    const booking = bookingSeat.booking;
    const userIsEventTypeAdminOrOwner =
      authUser && booking.eventType
        ? await this.eventTypeAccessService.userIsEventTypeAdminOrOwner(
            authUser,
            booking.eventType as EventType
          )
        : false;

    const isRecurring = !!booking.recurringEventId;
    const seatsShowAttendees = !!booking.eventType?.seatsShowAttendees;
    const showAllAttendees = userIsEventTypeAdminOrOwner || seatsShowAttendees;

    // When user is not admin and seatsShowAttendees is false, show only the attendee for this seatUid
    if (!showAllAttendees) {
      const seatAttendee = booking.attendees.find(
        (attendee) => attendee.bookingSeat?.referenceUid === seatUid
      );
      const bookingWithFilteredAttendees = {
        ...booking,
        attendees: seatAttendee ? [seatAttendee] : [],
      };

      if (isRecurring) {
        return this.outputService.getOutputRecurringSeatedBooking(bookingWithFilteredAttendees, true);
      }
      return this.outputService.getOutputSeatedBooking(bookingWithFilteredAttendees, true);
    }

    if (isRecurring) {
      return this.outputService.getOutputRecurringSeatedBooking(booking, true);
    }

    return this.outputService.getOutputSeatedBooking(booking, true);
  }

  async getBookings(
    queryParams: GetBookingsInput_2024_08_13,
    user: { email: string; id: number; orgId?: number },
    userIds?: number[]
  ) {
    if (queryParams.attendeeEmail) {
      queryParams.attendeeEmail = await this.getAttendeeEmail(queryParams.attendeeEmail, user);
    }

    const skip = Math.abs(queryParams?.skip ?? 0);
    const take = Math.abs(queryParams?.take ?? 100);

    const fetchedBookings: { bookings: { id: number }[]; totalCount: number } = await getAllUserBookings({
      bookingListingByStatus: queryParams.status || [],
      skip,
      take,
      filters: {
        ...this.inputService.transformGetBookingsFilters(queryParams),
        ...(userIds?.length ? { userIds } : {}),
      },
      ctx: {
        user,
        prisma: this.prismaReadService.prisma as unknown as PrismaClient,
        kysely: this.kyselyReadService.kysely,
      },
      sort: this.inputService.transformGetBookingsSort(queryParams),
    });
    // note(Lauris): fetchedBookings don't have attendees information and responses and i don't want to add them to the handler query,
    // because its used elsewhere in code that does not need that information, so i get ids, fetch bookings and then return them formatted in same order as ids.
    const ids = fetchedBookings.bookings.map((booking) => booking.id);
    const bookings = await this.bookingsRepository.getByIdsWithAttendeesWithBookingSeatAndUserAndEvent(ids);

    const bookingMap = new Map(bookings.map((booking) => [booking.id, booking]));
    const orderedBookings = ids.map((id) => bookingMap.get(id));

    const formattedBookings: (
      | BookingOutput_2024_08_13
      | RecurringBookingOutput_2024_08_13
      | GetSeatedBookingOutput_2024_08_13
      | GetRecurringSeatedBookingOutput_2024_08_13
    )[] = [];
    for (const booking of orderedBookings) {
      if (!booking) {
        continue;
      }

      const formatted = {
        ...booking,
        eventType: booking.eventType,
        eventTypeId: booking.eventTypeId,
        startTime: new Date(booking.startTime),
        endTime: new Date(booking.endTime),
        absentHost: !!booking.noShowHost,
      };

      const isRecurring = !!formatted.recurringEventId;
      const isSeated = !!formatted.eventType?.seatsPerTimeSlot;
      if (isRecurring && !isSeated) {
        formattedBookings.push(this.outputService.getOutputRecurringBooking(formatted));
      } else if (isRecurring && isSeated) {
        formattedBookings.push(this.outputService.getOutputRecurringSeatedBooking(formatted, true));
      } else if (isSeated) {
        formattedBookings.push(await this.outputService.getOutputSeatedBooking(formatted, true));
      } else {
        formattedBookings.push(await this.outputService.getOutputBooking(formatted));
      }
    }

    const pagination = getPagination({ skip, take, totalCount: fetchedBookings.totalCount });

    return {
      bookings: formattedBookings,
      pagination,
    };
  }

  async getAttendeeEmail(queryParamsAttendeeEmail: string, user: { id: number }) {
    // note(Lauris): this is to handle attendees that are managed users - in attendee table their email is one of managed users e.g
    // urdasdqinm+clxyyy21o0003sbk7yw5z6tzg@example.com but if attendeeEmail is passed as urdasdqinm@example.com then we check if user whose
    // access token is used is a managed user and if attendee with passed email has managed user email composed of passed email without oAuth client id +
    // authenticated user oAuth client id.
    const oAuthClient = await this.oAuthClientRepository.getByUserId(user.id);
    if (!oAuthClient) {
      return queryParamsAttendeeEmail;
    }
    // note(Lauris): query param already contains oAuth client id in the attendeeEmail
    if (queryParamsAttendeeEmail.includes(oAuthClient.id)) {
      return queryParamsAttendeeEmail;
    }

    const managedAttendeeEmail = OAuthClientUsersService.getOAuthUserEmail(
      oAuthClient.id,
      queryParamsAttendeeEmail
    );
    const [attendee, managedAttendee] = await Promise.all([
      this.usersRepository.findByEmail(queryParamsAttendeeEmail),
      this.usersRepository.findByEmail(managedAttendeeEmail),
    ]);
    if (!attendee && managedAttendee) {
      return managedAttendeeEmail;
    }

    return queryParamsAttendeeEmail;
  }

  async rescheduleBooking(
    request: Request,
    bookingUid: string,
    body: RescheduleBookingInput,
    authUser: AuthOptionalUser
  ) {
    try {
      const isIndividualSeatRequest = this.isRescheduleSeatedBody(body);
      const isIndividualSeatReschedule = await this.shouldRescheduleIndividualSeat(
        bookingUid,
        isIndividualSeatRequest,
        authUser
      );

      const bookingRequest = await this.inputService.createRescheduleBookingRequest(
        request,
        bookingUid,
        body,
        isIndividualSeatReschedule
      );

      await this.canRescheduleBooking(bookingUid);

      const booking = await this.regularBookingService.createBooking({
        bookingData: bookingRequest.body,
        bookingMeta: {
          userId: bookingRequest.userId ?? authUser?.id,
          hostname: bookingRequest.headers?.host || "",
          platformClientId: bookingRequest.platformClientId,
          platformRescheduleUrl: bookingRequest.platformRescheduleUrl,
          platformCancelUrl: bookingRequest.platformCancelUrl,
          platformBookingUrl: bookingRequest.platformBookingUrl,
          platformBookingLocation: bookingRequest.platformBookingLocation,
          areCalendarEventsEnabled: bookingRequest.areCalendarEventsEnabled,
        },
      });
      if (!booking.uid) {
        throw new Error("Booking missing uid");
      }

      const databaseBooking =
        await this.bookingsRepository.getByUidWithAttendeesWithBookingSeatAndUserAndEvent(booking.uid);
      if (!databaseBooking) {
        throw new Error(`Booking with uid=${booking.uid} was not found in the database`);
      }

      const userIsEventTypeAdminOrOwner =
        authUser && databaseBooking.eventType
          ? await this.eventTypeAccessService.userIsEventTypeAdminOrOwner(authUser, databaseBooking.eventType)
          : false;
      const isRecurring = !!databaseBooking.recurringEventId;
      const isSeated = !!databaseBooking.eventType?.seatsPerTimeSlot;
      const isPlatformManagedUserBooking = !!(booking.userId && booking.user?.isPlatformManaged);

      if (isRecurring && !isSeated) {
        const outputBooking = await this.outputService.getOutputRecurringBooking(databaseBooking);
        return Object.assign(outputBooking, { isPlatformManagedUserBooking });
      }
      if (isRecurring && isSeated) {
        const outputBooking = await this.outputService.getOutputCreateRecurringSeatedBooking(
          databaseBooking,
          booking?.seatReferenceUid || "",
          userIsEventTypeAdminOrOwner
        );
        return Object.assign(outputBooking, { isPlatformManagedUserBooking });
      }
      if (isSeated) {
        const outputBooking = await this.outputService.getOutputCreateSeatedBooking(
          databaseBooking,
          booking.seatReferenceUid || "",
          userIsEventTypeAdminOrOwner
        );
        return Object.assign(outputBooking, { isPlatformManagedUserBooking });
      }
      const outputBooking = await this.outputService.getOutputBooking(databaseBooking);
      return Object.assign(outputBooking, { isPlatformManagedUserBooking });
    } catch (error) {
      this.errorsBookingsService.handleBookingError(error, false);
    }
  }

  async canRescheduleBooking(bookingUid: string) {
    const booking = await this.bookingsRepository.getByUid(bookingUid);
    if (!booking) {
      throw new Error(`Booking with uid=${bookingUid} was not found in the database`);
    }
    if (booking.status === "CANCELLED" && !booking.rescheduled) {
      throw new BadRequestException(
        `Can't reschedule booking with uid=${bookingUid} because it has been cancelled. Please provide uid of a booking that is not cancelled.`
      );
    }
    if (booking.status === "CANCELLED" && booking.rescheduled) {
      const rescheduledTo = await this.bookingsRepository.getByFromReschedule(bookingUid);
      throw new BadRequestException(
        `Can't reschedule booking with uid=${bookingUid} because it has been cancelled and rescheduled already to booking with uid=${rescheduledTo?.uid}. You probably want to reschedule ${rescheduledTo?.uid} instead by passing it within the request URL.`
      );
    }
    return booking;
  }

  async shouldRescheduleIndividualSeat(
    bookingUid: string,
    isIndividualSeatReschedule: boolean,
    authUser: AuthOptionalUser
  ) {
    const booking = await this.bookingsRepository.getByUidWithUserIdAndSeatsReferencesCount(bookingUid);

    if (!booking) {
      throw new NotFoundException(`Booking with uid=${bookingUid} was not found in the database`);
    }

    const hasSeatsPresent = booking.seatsReferences.length > 0;

    if (!hasSeatsPresent) return false;

    return await this.isIndividualSeatOrOrgAdminReschedule(
      isIndividualSeatReschedule,
      booking.userId,
      authUser?.id
    );
  }

  async isIndividualSeatOrOrgAdminReschedule(
    isIndividualSeatReschedule: boolean,
    bookingUserId: number | null,
    authUserId?: number | null
  ) {
    if (isIndividualSeatReschedule) {
      return true;
    }

    if (!authUserId) {
      throw new Error(`No auth user found`);
    }

    if (!bookingUserId) {
      throw new Error(`No user found for booking`);
    }

    const isOrgAdmin = await PrismaOrgMembershipRepository.isLoggedInUserOrgAdminOfBookingHost(
      authUserId,
      bookingUserId
    );

    return isOrgAdmin;
  }

  isRescheduleSeatedBody(body: RescheduleBookingInput): body is RescheduleSeatedBookingInput_2024_08_13 {
    return "seatUid" in body;
  }

  async cancelBooking(
    request: Request,
    bookingUid: string,
    body: CancelBookingInput,
    authUser: AuthOptionalUser
  ) {
    if (this.inputService.isCancelSeatedBody(body)) {
      const seat = await this.bookingSeatRepository.getByReferenceUid(body.seatUid);

      if (!seat) {
        throw new BadRequestException(
          "Invalid seatUid: this seat does not exist or has already been cancelled."
        );
      }

      if (seat && bookingUid !== seat.booking.uid) {
        throw new BadRequestException("Invalid seatUid: this seat does not belong to this booking.");
      }
    }

    const bookingRequest = await this.inputService.createCancelBookingRequest(request, bookingUid, body);
    const res = await handleCancelBooking({
      bookingData: bookingRequest.body,
      userId: bookingRequest.userId,
      userUuid: authUser?.uuid,
      actionSource: "API_V2",
      arePlatformEmailsEnabled: bookingRequest.arePlatformEmailsEnabled,
      platformClientId: bookingRequest.platformClientId,
      platformCancelUrl: bookingRequest.platformCancelUrl,
      platformRescheduleUrl: bookingRequest.platformRescheduleUrl,
      platformBookingUrl: bookingRequest.platformBookingUrl,
    });

    if ("cancelSubsequentBookings" in body && body.cancelSubsequentBookings) {
      return this.getAllRecurringBookingsByIndividualUid(bookingUid, authUser);
    }

    return this.getBooking(bookingUid, authUser);
  }

  private async getAllRecurringBookingsByIndividualUid(bookingUid: string, authUser: AuthOptionalUser) {
    const booking = await this.bookingsRepository.getByUid(bookingUid);
    const recurringBookingUid = booking?.recurringEventId;
    if (!recurringBookingUid) {
      throw new BadRequestException(
        `Booking with bookingUid=${bookingUid} is not part of a recurring booking.`
      );
    }

    return await this.getBooking(recurringBookingUid, authUser);
  }

  async markAbsent(
    bookingUid: string,
    bookingOwnerId: number,
    body: MarkAbsentBookingInput_2024_08_13,
    userUuid: string
  ) {
    const bodyTransformed = this.inputService.transformInputMarkAbsentBooking(body);
    const bookingBefore = await this.bookingsRepository.getByUid(bookingUid);

    if (!bookingBefore) {
      throw new NotFoundException(`Booking with uid=${bookingUid} not found.`);
    }

    const nowUtc = DateTime.utc();
    const bookingStartTimeUtc = DateTime.fromJSDate(bookingBefore.startTime, { zone: "utc" });

    if (nowUtc < bookingStartTimeUtc) {
      throw new BadRequestException(
        `Bookings can only be marked as absent after their scheduled start time. Current time in UTC+0: ${nowUtc.toISO()}, Booking start time in UTC+0: ${bookingStartTimeUtc.toISO()}`
      );
    }

    const platformClientParams = bookingBefore?.eventTypeId
      ? await this.platformBookingsService.getOAuthClientParams(bookingBefore.eventTypeId)
      : undefined;

    await handleMarkNoShow({
      bookingUid,
      attendees: bodyTransformed.attendees,
      noShowHost: bodyTransformed.noShowHost,
      userId: bookingOwnerId,
      platformClientParams,
    });

    const booking = await this.bookingsRepository.getByUidWithAttendeesAndUserAndEvent(bookingUid);

    if (!booking) {
      throw new Error(`Booking with uid=${bookingUid} was not found in the database`);
    }

    const isRecurring = !!booking.recurringEventId;
    if (isRecurring) {
      return this.outputService.getOutputRecurringBooking(booking);
    }
    return this.outputService.getOutputBooking(booking);
  }

  async reassignBooking(bookingUid: string, reassignedByUser: ApiAuthGuardUser) {
    const booking = await this.bookingsRepository.getByUidWithEventType(bookingUid);
    if (!booking) {
      throw new NotFoundException(`Booking with uid=${bookingUid} was not found in the database`);
    }

    if (!booking.eventType) {
      throw new BadRequestException(
        `Event type with id=${booking.eventTypeId} was not found in the database`
      );
    }

    const isAllowed = await this.eventTypeAccessService.userIsEventTypeAdminOrOwner(
      reassignedByUser,
      booking.eventType
    );

    if (!isAllowed) {
      throw new ForbiddenException(BOOKING_REASSIGN_PERMISSION_ERROR);
    }

    const platformClientParams = booking.eventTypeId
      ? await this.platformBookingsService.getOAuthClientParams(booking.eventTypeId)
      : undefined;

    const emailsEnabled = platformClientParams ? platformClientParams.arePlatformEmailsEnabled : true;

    const profile = this.usersService.getUserMainProfile(reassignedByUser);

    try {
      await roundRobinReassignment({
        bookingId: booking.id,
        orgId: profile?.organizationId || null,
        emailsEnabled,
        platformClientParams,
        reassignedById: reassignedByUser.id,
        actionSource: "API_V2",
        reassignedByUuid: reassignedByUser.uuid,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "no_available_users_found_error") {
          throw new BadRequestException(
            "Can't reassign the booking because no other host is available at that time."
          );
        }
      }
      throw error;
    }

    const reassigned = await this.bookingsRepository.getByUidWithUser(bookingUid);
    if (!reassigned) {
      throw new NotFoundException(`Reassigned booking with uid=${bookingUid} was not found in the database`);
    }

    return this.outputService.getOutputReassignedBooking(reassigned);
  }

  async reassignBookingToUser(
    bookingUid: string,
    newUserId: number,
    reassignedByUser: ApiAuthGuardUser,
    body: ReassignToUserBookingInput_2024_08_13
  ) {
    const booking = await this.bookingsRepository.getByUidWithEventType(bookingUid);
    if (!booking) {
      throw new NotFoundException(`Booking with uid=${bookingUid} was not found in the database`);
    }
    if (!booking.eventType) {
      throw new BadRequestException(
        `Event type with id=${booking.eventTypeId} was not found in the database`
      );
    }

    const isAllowed = await this.eventTypeAccessService.userIsEventTypeAdminOrOwner(
      reassignedByUser,
      booking.eventType
    );

    if (!isAllowed) {
      throw new ForbiddenException(BOOKING_REASSIGN_PERMISSION_ERROR);
    }

    const user = await this.usersRepository.findByIdWithProfile(newUserId);
    if (!user) {
      throw new NotFoundException(`User with id=${newUserId} was not found in the database`);
    }

    const platformClientParams = booking.eventTypeId
      ? await this.platformBookingsService.getOAuthClientParams(booking.eventTypeId)
      : undefined;

    const emailsEnabled = platformClientParams ? platformClientParams.arePlatformEmailsEnabled : true;

    const profile = this.usersService.getUserMainProfile(user);

    try {
      await roundRobinManualReassignment({
        bookingId: booking.id,
        newUserId,
        orgId: profile?.organizationId || null,
        reassignReason: body.reason,
        reassignedById: reassignedByUser.id,
        emailsEnabled,
        platformClientParams,
        actionSource: "API_V2",
        reassignedByUuid: reassignedByUser.uuid,
      });

      const reassigned = await this.bookingsRepository.getByUidWithUser(bookingUid);
      if (!reassigned) {
        throw new NotFoundException(
          `Reassigned booking with uid=${bookingUid} was not found in the database`
        );
      }

      return this.outputService.getOutputReassignedBooking(reassigned);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "invalid_round_robin_host") {
          throw new BadRequestException(
            `User with id=${newUserId} is not a valid Round Robin host - the user to which you reassign this booking must be one of the booking hosts. Fetch the booking using the GET /v2/bookings/{uid} endpoint and select id of one of the hosts.`
          );
        }
      }
      throw error;
    }
  }

  async confirmBooking(bookingUid: string, requestUser: ApiAuthGuardUser) {
    const booking = await this.bookingsRepository.getByUid(bookingUid);
    if (!booking) {
      throw new NotFoundException(`Booking with uid=${bookingUid} was not found in the database`);
    }

    const platformClientParams = booking.eventTypeId
      ? await this.platformBookingsService.getOAuthClientParams(booking.eventTypeId)
      : undefined;

    const emailsEnabled = platformClientParams ? platformClientParams.arePlatformEmailsEnabled : true;
    const userCalendars = await this.usersRepository.findByIdWithCalendars(requestUser.id);

    await confirmBookingHandler({
      ctx: {
        user: {
          ...requestUser,
          destinationCalendar: userCalendars?.destinationCalendar ?? null,
        },
        traceContext: distributedTracing.createTrace("api_v2_confirm_booking"),
      },
      input: {
        bookingId: booking.id,
        confirmed: true,
        recurringEventId: booking.recurringEventId ?? undefined,
        emailsEnabled,
        platformClientParams,
        actionSource: "API_V2",
        actor: makeUserActor(requestUser.uuid),
      },
    });

    return this.getBooking(bookingUid, requestUser);
  }

  async declineBooking(bookingUid: string, requestUser: ApiAuthGuardUser, reason?: string) {
    const booking = await this.bookingsRepository.getByUid(bookingUid);
    if (!booking) {
      throw new NotFoundException(`Booking with uid=${bookingUid} was not found in the database`);
    }

    const platformClientParams = booking.eventTypeId
      ? await this.platformBookingsService.getOAuthClientParams(booking.eventTypeId)
      : undefined;

    const emailsEnabled = platformClientParams ? platformClientParams.arePlatformEmailsEnabled : true;
    const userCalendars = await this.usersRepository.findByIdWithCalendars(requestUser.id);

    await confirmBookingHandler({
      ctx: {
        user: {
          ...requestUser,
          destinationCalendar: userCalendars?.destinationCalendar ?? null,
        },
        traceContext: distributedTracing.createTrace("api_v2_decline_booking"),
      },
      input: {
        bookingId: booking.id,
        confirmed: false,
        recurringEventId: booking.recurringEventId ?? undefined,
        reason,
        emailsEnabled,
        platformClientParams,
        actionSource: "API_V2",
        actor: makeUserActor(requestUser.uuid),
      },
    });

    return this.getBooking(bookingUid, requestUser);
  }

  async getCalendarLinks(bookingUid: string): Promise<CalendarLink[]> {
    const booking = await this.bookingsRepository.getByUidWithAttendeesAndUserAndEvent(bookingUid);

    if (!booking) {
      throw new NotFoundException(`Booking with uid ${bookingUid} not found`);
    }

    if (!booking.eventTypeId) {
      throw new BadRequestException(`Booking with uid ${bookingUid} has no event type`);
    }

    const eventType = await this.eventTypesRepository.getEventTypeByIdIncludeUsersAndTeam(
      booking.eventTypeId
    );
    if (!eventType) {
      throw new BadRequestException(`Booking with uid ${bookingUid} has no event type`);
    }
    // TODO: Maybe we should get locale from query params?
    return getCalendarLinks({
      booking,
      eventType: {
        ...eventType,
        // TODO: Support dynamic event bookings later. It would require a slug input it seems
        isDynamic: false,
      },
      // It can be made customizable through the API endpoint later.
      t: await getTranslation("en", "common"),
    });
  }
}
