import { BOOKING_READ, BOOKING_WRITE, SUCCESS_STATUS } from "@calcom/platform-constants";
import {
  CancelBookingInput,
  CancelBookingInput_2024_08_13,
  CancelBookingInputPipe,
  CancelSeatedBookingInput_2024_08_13,
  CreateBookingInput,
  CreateBookingInput_2024_08_13,
  CreateBookingInputPipe,
  CreateRecurringBookingInput_2024_08_13,
  DeclineBookingInput_2024_08_13,
  GetBookingOutput_2024_08_13,
  GetBookingRecordingsOutput,
  GetBookingsInput_2024_08_13,
  GetBookingsOutput_2024_08_13,
  GetBookingTranscriptsOutput,
  GetBookingVideoSessionsOutput,
  MarkAbsentBookingInput_2024_08_13,
  ReassignToUserBookingInput_2024_08_13,
  RescheduleBookingInput,
  RescheduleBookingInput_2024_08_13,
  RescheduleBookingInputPipe,
  RescheduleSeatedBookingInput_2024_08_13,
} from "@calcom/platform-types";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiExtraModels,
  ApiHeader,
  ApiOperation,
  ApiTags as DocsTags,
  getSchemaPath,
} from "@nestjs/swagger";
import { Request } from "express";
import { BookingPbacGuard } from "@/platform/bookings/2024-08-13/guards/booking-pbac.guard";
import { BookingUidGuard } from "@/platform/bookings/2024-08-13/guards/booking-uid.guard";
import { BookingReferencesFilterInput_2024_08_13 } from "@/platform/bookings/2024-08-13/inputs/booking-references-filter.input";
import { BookingReferencesOutput_2024_08_13 } from "@/platform/bookings/2024-08-13/outputs/booking-references.output";
import { CalendarLinksOutput_2024_08_13 } from "@/platform/bookings/2024-08-13/outputs/calendar-links.output";
import { CancelBookingOutput_2024_08_13 } from "@/platform/bookings/2024-08-13/outputs/cancel-booking.output";
import { CreateBookingOutput_2024_08_13 } from "@/platform/bookings/2024-08-13/outputs/create-booking.output";
import { MarkAbsentBookingOutput_2024_08_13 } from "@/platform/bookings/2024-08-13/outputs/mark-absent.output";
import { ReassignBookingOutput_2024_08_13 } from "@/platform/bookings/2024-08-13/outputs/reassign-booking.output";
import { RescheduleBookingOutput_2024_08_13 } from "@/platform/bookings/2024-08-13/outputs/reschedule-booking.output";
import { BookingReferencesService_2024_08_13 } from "@/platform/bookings/2024-08-13/services/booking-references.service";
import { BookingsService_2024_08_13 } from "@/platform/bookings/2024-08-13/services/bookings.service";
import { CalVideoService } from "@/platform/bookings/2024-08-13/services/cal-video.service";
import { VERSION_2024_08_13, VERSION_2024_08_13_VALUE } from "@/lib/api-versions";
import {
  API_KEY_OR_ACCESS_TOKEN_HEADER,
  OPTIONAL_API_KEY_OR_ACCESS_TOKEN_HEADER,
  OPTIONAL_X_CAL_CLIENT_ID_HEADER,
  OPTIONAL_X_CAL_SECRET_KEY_HEADER,
} from "@/lib/docs/headers";
import {
  AuthOptionalUser,
  GetOptionalUser,
} from "@/modules/auth/decorators/get-optional-user/get-optional-user.decorator";
import { GetUser } from "@/modules/auth/decorators/get-user/get-user.decorator";
import { Pbac } from "@/modules/auth/decorators/pbac/pbac.decorator";
import { Permissions } from "@/modules/auth/decorators/permissions/permissions.decorator";
import { ApiAuthGuard } from "@/modules/auth/guards/api-auth/api-auth.guard";
import { OptionalApiAuthGuard } from "@/modules/auth/guards/optional-api-auth/optional-api-auth.guard";
import { PermissionsGuard } from "@/modules/auth/guards/permissions/permissions.guard";
import { ApiAuthGuardUser } from "@/modules/auth/strategies/api-auth/api-auth.strategy";
import { UsersService } from "@/modules/users/services/users.service";

@Controller({
  path: "/v2/bookings",
  version: VERSION_2024_08_13_VALUE,
})
@UseGuards(PermissionsGuard)
@DocsTags("Bookings")
@ApiHeader({
  name: "cal-api-version",
  description: `Must be set to ${VERSION_2024_08_13}. If not set to this value, the endpoint will default to an older version.`,
  example: VERSION_2024_08_13,
  required: true,
  schema: {
    default: VERSION_2024_08_13,
  },
})
export class BookingsController_2024_08_13 {
  private readonly logger = new Logger("BookingsController_2024_08_13");

  constructor(
    private readonly bookingsService: BookingsService_2024_08_13,
    private readonly usersService: UsersService,
    private readonly bookingReferencesService: BookingReferencesService_2024_08_13,
    private readonly calVideoService: CalVideoService
  ) {}

  @Post("/")
  @UseGuards(OptionalApiAuthGuard)
  @ApiHeader(OPTIONAL_X_CAL_CLIENT_ID_HEADER)
  @ApiHeader(OPTIONAL_X_CAL_SECRET_KEY_HEADER)
  @ApiHeader(OPTIONAL_API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Create a booking",
    description: `
      POST /v2/bookings is used to create regular bookings, recurring bookings and instant bookings. The request bodies for all 3 are almost the same except:
      If eventTypeId in the request body is id of a regular event, then regular booking is created.

      If it is an id of a recurring event type, then recurring booking is created.

      Meaning that the request bodies are equal but the outcome depends on what kind of event type it is with the goal of making it as seamless for developers as possible.

      The start needs to be in UTC aka if the timezone is GMT+2 in Rome and meeting should start at 11, then UTC time should have hours 09:00 aka without time zone.

      Finally, there are 2 ways to book an event type belonging to an individual user:
      1. Provide \`eventTypeId\` in the request body.
      2. Provide \`eventTypeSlug\` and \`username\` and optionally \`organizationSlug\` if the user with the username is within an organization.

      And 2 ways to book and event type belonging to a team:
      1. Provide \`eventTypeId\` in the request body.
      2. Provide \`eventTypeSlug\` and \`teamSlug\` and optionally \`organizationSlug\` if the team with the teamSlug is within an organization.

      If you are creating a seated booking for an event type with 'show attendees' disabled, then to retrieve attendees in the response either set 'show attendees' to true on event type level or
      you have to provide an authentication method of event type owner, host, team admin or owner or org admin or owner.

      To create a booking that overlaps busy time or existing bookings (organizer override), set \`overrideAvailability\` to \`true\` in the JSON body while authenticated as the event type owner, host, team admin or owner, or org admin or owner.

      For event types that have SMS reminders enabled, you need to pass the attendee's phone number in the request body via \`attendee.phoneNumber\` (e.g., "+19876543210" in international format). This is an optional field, but becomes required when SMS reminders are enabled for the event type. For the complete attendee object structure, see the attendee schema in the \`/docs\` Swagger endpoint.

      <Note>Please make sure to pass in the cal-api-version header value as mentioned in the Headers section. Not passing the correct value will default to an older version of this endpoint.</Note>
      `,
  })
  @ApiBody({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(CreateBookingInput_2024_08_13) },
        { $ref: getSchemaPath(CreateRecurringBookingInput_2024_08_13) },
      ],
    },
    description:
      "Accepts different types of booking input: Create Booking (Option 1) or Create Recurring Booking (Option 2)",
  })
  @ApiExtraModels(CreateBookingInput_2024_08_13, CreateRecurringBookingInput_2024_08_13)
  async createBooking(
    @Body(new CreateBookingInputPipe())
    body: CreateBookingInput,
    @Req() request: Request,
    @GetOptionalUser() user: AuthOptionalUser
  ): Promise<CreateBookingOutput_2024_08_13> {
    const booking = await this.bookingsService.createBooking(request, body, user);

    return {
      status: SUCCESS_STATUS,
      data: booking,
    };
  }

  @Get("/by-seat/:seatUid")
  @UseGuards(OptionalApiAuthGuard)
  @ApiHeader(OPTIONAL_X_CAL_CLIENT_ID_HEADER)
  @ApiHeader(OPTIONAL_X_CAL_SECRET_KEY_HEADER)
  @ApiHeader(OPTIONAL_API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Get a booking by seat UID",
    description: `Get a seated booking by its seat reference UID. This is useful when you have a seatUid from a seated booking and want to retrieve the full booking details.

      If you are fetching a seated booking for an event type with 'show attendees' disabled, then to retrieve attendees in the response either set 'show attendees' to true on event type level or
      you have to provide an authentication method of event type owner, host, team admin or owner or org admin or owner.

      <Note>Please make sure to pass in the cal-api-version header value as mentioned in the Headers section. Not passing the correct value will default to an older version of this endpoint.</Note>
      `,
  })
  async getBookingBySeatUid(
    @Param("seatUid") seatUid: string,
    @GetOptionalUser() user: AuthOptionalUser
  ): Promise<GetBookingOutput_2024_08_13> {
    const booking = await this.bookingsService.getBookingBySeatUid(seatUid, user);

    return {
      status: SUCCESS_STATUS,
      data: booking,
    };
  }

  @Get("/:bookingUid")
  @UseGuards(BookingUidGuard, OptionalApiAuthGuard)
  @ApiHeader(OPTIONAL_X_CAL_CLIENT_ID_HEADER)
  @ApiHeader(OPTIONAL_X_CAL_SECRET_KEY_HEADER)
  @ApiHeader(OPTIONAL_API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Get a booking",
    description: `\`:bookingUid\` can be

      1. uid of a normal booking

      2. uid of one of the recurring booking recurrences

      3. uid of recurring booking which will return an array of all recurring booking recurrences (stored as recurringBookingUid on one of the individual recurrences).

      If you are fetching a seated booking for an event type with 'show attendees' disabled, then to retrieve attendees in the response either set 'show attendees' to true on event type level or
      you have to provide an authentication method of event type owner, host, team admin or owner or org admin or owner.

      <Note>Please make sure to pass in the cal-api-version header value as mentioned in the Headers section. Not passing the correct value will default to an older version of this endpoint.</Note>
      `,
  })
  async getBooking(
    @Param("bookingUid") bookingUid: string,
    @GetOptionalUser() user: AuthOptionalUser
  ): Promise<GetBookingOutput_2024_08_13> {
    const booking = await this.bookingsService.getBooking(bookingUid, user);

    return {
      status: SUCCESS_STATUS,
      data: booking,
    };
  }

  @Get("/:bookingUid/recordings")
  @Pbac(["booking.readRecordings"])
  @Permissions([BOOKING_READ])
  @UseGuards(ApiAuthGuard, BookingUidGuard, BookingPbacGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Get all the recordings for the booking",
    description: `Fetches all the recordings for the booking \`:bookingUid\`. Requires authentication and proper authorization. Access is granted if you are the booking organizer, team admin or org admin/owner.

    <Note>cal-api-version: \`2024-08-13\` is required in the request header.</Note>
    `,
  })
  async getBookingRecordings(@Param("bookingUid") bookingUid: string): Promise<GetBookingRecordingsOutput> {
    const recordings = await this.calVideoService.getRecordings(bookingUid);

    return {
      status: SUCCESS_STATUS,
      data: recordings,
    };
  }

  @Get("/:bookingUid/transcripts")
  @Pbac(["booking.readRecordings"])
  @Permissions([BOOKING_READ])
  @UseGuards(ApiAuthGuard, BookingUidGuard, BookingPbacGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Get Cal Video real time transcript download links for the booking",
    description: `Fetches all the transcript download links for the booking \`:bookingUid\`

    <Note>
    Transcripts are generated when clicking "Transcribe" during a Cal Video meeting. Download links are valid for 1 hour only - make a new request to generate fresh links after expiration.

    Please make sure to pass in the cal-api-version header value as mentioned in the Headers section. Not passing the correct value will default to an older version of this endpoint.
    </Note>
    `,
  })
  async getBookingTranscripts(@Param("bookingUid") bookingUid: string): Promise<GetBookingTranscriptsOutput> {
    const transcripts = await this.calVideoService.getTranscripts(bookingUid);

    return {
      status: SUCCESS_STATUS,
      data: transcripts ?? [],
    };
  }

  @Get("/")
  @UseGuards(ApiAuthGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @Permissions([BOOKING_READ])
  @ApiOperation({
    summary: "Get all bookings",
    description: `<Note>Please make sure to pass in the cal-api-version header value as mentioned in the Headers section. Not passing the correct value will default to an older version of this endpoint.</Note>`,
  })
  async getBookings(
    @Query() queryParams: GetBookingsInput_2024_08_13,
    @GetUser() user: ApiAuthGuardUser
  ): Promise<GetBookingsOutput_2024_08_13> {
    const profile = this.usersService.getUserMainProfile(user);

    const { bookings, pagination } = await this.bookingsService.getBookings(queryParams, {
      email: user.email,
      id: user.id,
      orgId: profile?.organizationId ?? undefined,
    });

    return {
      status: SUCCESS_STATUS,
      data: bookings,
      pagination,
    };
  }

  @Post("/:bookingUid/reschedule")
  @UseGuards(BookingUidGuard, OptionalApiAuthGuard)
  @ApiHeader(OPTIONAL_X_CAL_CLIENT_ID_HEADER)
  @ApiHeader(OPTIONAL_X_CAL_SECRET_KEY_HEADER)
  @ApiHeader(OPTIONAL_API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Reschedule a booking",
    description: `Reschedule a booking or seated booking

    <Note>Please make sure to pass in the cal-api-version header value as mentioned in the Headers section. Not passing the correct value will default to an older version of this endpoint.</Note>
    `,
  })
  @ApiBody({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(RescheduleBookingInput_2024_08_13) },
        { $ref: getSchemaPath(RescheduleSeatedBookingInput_2024_08_13) },
      ],
    },
    description: `Accepts different types of reschedule booking input: Reschedule Booking (Option 1) or Reschedule Seated Booking (Option 2). If you're rescheduling a seated booking as org admin of booking host, pass booking input for Reschedule Booking (Option 1) along with your access token in the request header.

      If you are rescheduling a seated booking for an event type with 'show attendees' disabled, then to retrieve attendees in the response either set 'show attendees' to true on event type level or
      you have to provide an authentication method of event type owner, host, team admin or owner or org admin or owner.`,
  })
  @ApiExtraModels(RescheduleBookingInput_2024_08_13, RescheduleSeatedBookingInput_2024_08_13)
  async rescheduleBooking(
    @Param("bookingUid") bookingUid: string,
    @Body(new RescheduleBookingInputPipe())
    body: RescheduleBookingInput,
    @Req() request: Request,
    @GetOptionalUser() user: AuthOptionalUser
  ): Promise<RescheduleBookingOutput_2024_08_13> {
    const newBooking = await this.bookingsService.rescheduleBooking(request, bookingUid, body, user);

    return {
      status: SUCCESS_STATUS,
      data: newBooking,
    };
  }

  @Post("/:bookingUid/cancel")
  @UseGuards(BookingUidGuard, OptionalApiAuthGuard)
  @ApiHeader(OPTIONAL_X_CAL_CLIENT_ID_HEADER)
  @ApiHeader(OPTIONAL_X_CAL_SECRET_KEY_HEADER)
  @ApiHeader(OPTIONAL_API_KEY_OR_ACCESS_TOKEN_HEADER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Cancel a booking",
    description: `:bookingUid can be :bookingUid of an usual booking, individual recurrence or recurring booking to cancel all recurrences.

    \nCancelling normal bookings:
    If the booking is not seated and not recurring, simply pass :bookingUid in the request URL \`/bookings/:bookingUid/cancel\` and optionally cancellationReason in the request body \`{"cancellationReason": "Will travel"}\`.

    \nCancelling seated bookings:
    It is possible to cancel specific seat within a booking as an attendee or all of the seats as the host.
    \n1. As an attendee - provide :bookingUid in the request URL \`/bookings/:bookingUid/cancel\` and seatUid in the request body \`{"seatUid": "123-123-123"}\` . This will remove this particular attendance from the booking.
    \n2. As the host or org admin of host - host can cancel booking for all attendees aka for every seat, this also applies to org admins. Provide :bookingUid in the request URL \`/bookings/:bookingUid/cancel\` and cancellationReason in the request body \`{"cancellationReason": "Will travel"}\` and \`Authorization: Bearer token\` request header where token is event type owner (host) credential. This will cancel the booking for all attendees.

    \nCancelling recurring seated bookings:
    For recurring seated bookings it is not possible to cancel all of them with 1 call
    like with non-seated recurring bookings by providing recurring bookind uid - you have to cancel each recurrence booking by its bookingUid + seatUid.

    If you are cancelling a seated booking for an event type with 'show attendees' disabled, then to retrieve attendees in the response either set 'show attendees' to true on event type level or
    you have to provide an authentication method of event type owner, host, team admin or owner or org admin or owner.

    <Note>Please make sure to pass in the cal-api-version header value as mentioned in the Headers section. Not passing the correct value will default to an older version of this endpoint.</Note>
    `,
  })
  @ApiBody({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(CancelBookingInput_2024_08_13) },
        { $ref: getSchemaPath(CancelSeatedBookingInput_2024_08_13) },
      ],
    },
    description:
      "Accepts different types of cancel booking input: Cancel Booking (Option 1 which is for normal or recurring bookings) or Cancel Seated Booking (Option 2 which is for seated bookings)",
  })
  @ApiExtraModels(CancelBookingInput_2024_08_13, CancelSeatedBookingInput_2024_08_13)
  async cancelBooking(
    @Req() request: Request,
    @Param("bookingUid") bookingUid: string,
    @Body(new CancelBookingInputPipe())
    body: CancelBookingInput,
    @GetOptionalUser() user: AuthOptionalUser
  ): Promise<CancelBookingOutput_2024_08_13> {
    const cancelledBooking = await this.bookingsService.cancelBooking(request, bookingUid, body, user);

    return {
      status: SUCCESS_STATUS,
      data: cancelledBooking,
    };
  }

  @Post("/:bookingUid/mark-absent")
  @HttpCode(HttpStatus.OK)
  @Permissions([BOOKING_WRITE])
  @UseGuards(ApiAuthGuard, BookingUidGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Mark a booking absence",
    description: `The provided authorization header refers to the owner of the booking.

    <Note>Please make sure to pass in the cal-api-version header value as mentioned in the Headers section. Not passing the correct value will default to an older version of this endpoint.</Note>
    `,
  })
  async markNoShow(
    @Param("bookingUid") bookingUid: string,
    @Body() body: MarkAbsentBookingInput_2024_08_13,
    @GetUser() user: ApiAuthGuardUser
  ): Promise<MarkAbsentBookingOutput_2024_08_13> {
    const booking = await this.bookingsService.markAbsent(bookingUid, user.id, body, user.uuid);

    return {
      status: SUCCESS_STATUS,
      data: booking,
    };
  }

  @Post("/:bookingUid/reassign")
  @HttpCode(HttpStatus.OK)
  @Permissions([BOOKING_WRITE])
  @UseGuards(ApiAuthGuard, BookingUidGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Reassign a booking to auto-selected host",
    description: `Currently only supports reassigning host for round robin bookings. The provided authorization header refers to the owner of the booking.

       <Note>Please make sure to pass in the cal-api-version header value as mentioned in the Headers section. Not passing the correct value will default to an older version of this endpoint.</Note>
      `,
  })
  async reassignBooking(
    @Param("bookingUid") bookingUid: string,
    @GetUser() reassignedByUser: ApiAuthGuardUser
  ): Promise<ReassignBookingOutput_2024_08_13> {
    const booking = await this.bookingsService.reassignBooking(bookingUid, reassignedByUser);

    return {
      status: SUCCESS_STATUS,
      data: booking,
    };
  }

  @Post("/:bookingUid/reassign/:userId")
  @HttpCode(HttpStatus.OK)
  @Permissions([BOOKING_WRITE])
  @UseGuards(ApiAuthGuard, BookingUidGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Reassign a booking to a specific host",
    description: `Currently only supports reassigning host for round robin bookings. The provided authorization header refers to the owner of the booking.

      <Note>Please make sure to pass in the cal-api-version header value as mentioned in the Headers section. Not passing the correct value will default to an older version of this endpoint.</Note>
      `,
  })
  async reassignBookingToUser(
    @Param("bookingUid") bookingUid: string,
    @Param("userId") userId: number,
    @GetUser() reassignedByUser: ApiAuthGuardUser,
    @Body() body: ReassignToUserBookingInput_2024_08_13
  ): Promise<ReassignBookingOutput_2024_08_13> {
    const booking = await this.bookingsService.reassignBookingToUser(
      bookingUid,
      userId,
      reassignedByUser,
      body
    );

    return {
      status: SUCCESS_STATUS,
      data: booking,
    };
  }

  @Post("/:bookingUid/confirm")
  @HttpCode(HttpStatus.OK)
  @Permissions([BOOKING_WRITE])
  @UseGuards(ApiAuthGuard, BookingUidGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Confirm a booking",
    description: `The provided authorization header refers to the owner of the booking.

    <Note>Please make sure to pass in the cal-api-version header value as mentioned in the Headers section. Not passing the correct value will default to an older version of this endpoint.</Note>
    `,
  })
  async confirmBooking(
    @Param("bookingUid") bookingUid: string,
    @GetUser() user: ApiAuthGuardUser
  ): Promise<GetBookingOutput_2024_08_13> {
    const booking = await this.bookingsService.confirmBooking(bookingUid, user);

    return {
      status: SUCCESS_STATUS,
      data: booking,
    };
  }

  @Post("/:bookingUid/decline")
  @HttpCode(HttpStatus.OK)
  @Permissions([BOOKING_WRITE])
  @UseGuards(ApiAuthGuard, BookingUidGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Decline a booking",
    description: `The provided authorization header refers to the owner of the booking.

    <Note>Please make sure to pass in the cal-api-version header value as mentioned in the Headers section. Not passing the correct value will default to an older version of this endpoint.</Note>
    `,
  })
  async declineBooking(
    @Param("bookingUid") bookingUid: string,
    @Body() body: DeclineBookingInput_2024_08_13,
    @GetUser() user: ApiAuthGuardUser
  ): Promise<GetBookingOutput_2024_08_13> {
    const booking = await this.bookingsService.declineBooking(bookingUid, user, body.reason);

    return {
      status: SUCCESS_STATUS,
      data: booking,
    };
  }

  @Get("/:bookingUid/calendar-links")
  @UseGuards(ApiAuthGuard, BookingUidGuard)
  @Permissions([BOOKING_READ])
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Get 'Add to Calendar' links for a booking",
    description: `Retrieve calendar links for a booking that can be used to add the event to various calendar services. Returns links for Google Calendar, Microsoft Office, Microsoft Outlook, and a downloadable ICS file.

      <Note>Please make sure to pass in the cal-api-version header value as mentioned in the Headers section. Not passing the correct value will default to an older version of this endpoint.</Note>
      `,
  })
  @HttpCode(HttpStatus.OK)
  async getCalendarLinks(@Param("bookingUid") bookingUid: string): Promise<CalendarLinksOutput_2024_08_13> {
    const calendarLinks = await this.bookingsService.getCalendarLinks(bookingUid);

    return {
      status: SUCCESS_STATUS,
      data: calendarLinks,
    };
  }

  @Get("/:bookingUid/references")
  @UseGuards(ApiAuthGuard, BookingUidGuard)
  @Permissions([BOOKING_READ])
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Get booking references",
    description: `<Note>Please make sure to pass in the cal-api-version header value as mentioned in the Headers section. Not passing the correct value will default to an older version of this endpoint.</Note>`,
  })
  @HttpCode(HttpStatus.OK)
  async getBookingReferences(
    @Param("bookingUid") bookingUid: string,
    @GetUser("id") userId: number,
    @Query() filter: BookingReferencesFilterInput_2024_08_13
  ): Promise<BookingReferencesOutput_2024_08_13> {
    const bookingReferences = await this.bookingReferencesService.getBookingReferences(
      bookingUid,
      userId,
      filter
    );

    return {
      status: SUCCESS_STATUS,
      data: bookingReferences,
    };
  }

  @Get("/:bookingUid/conferencing-sessions")
  @HttpCode(HttpStatus.OK)
  @Pbac(["booking.readRecordings"])
  @Permissions([BOOKING_READ])
  @UseGuards(ApiAuthGuard, BookingUidGuard, BookingPbacGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Get Video Meeting Sessions. Only supported for Cal Video",
    description: `Requires authentication and proper authorization. Access is granted if you are the booking organizer, team admin or org admin/owner.

    <Note>cal-api-version: \`2024-08-13\` is required in the request header.</Note>`,
  })
  async getVideoSessions(@Param("bookingUid") bookingUid: string): Promise<GetBookingVideoSessionsOutput> {
    const sessions = await this.calVideoService.getVideoSessions(bookingUid);

    return {
      status: SUCCESS_STATUS,
      data: sessions,
    };
  }
}
