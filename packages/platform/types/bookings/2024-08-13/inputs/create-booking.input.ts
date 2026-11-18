import {
  ApiExtraModels,
  ApiHideProperty,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import type { ValidationArguments, ValidationOptions } from "class-validator";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUrl,
  isEmail,
  Min,
  registerDecorator,
  Validate,
  ValidateNested,
} from "class-validator";
import { isValidPhoneNumber } from "libphonenumber-js/max";
import type { BookingLanguageType } from "./language";
import { BookingLanguage } from "./language";
import type { BookingInputLocation_2024_08_13 } from "./location.input";
import {
  BookingInputAddressLocation_2024_08_13,
  BookingInputAttendeeAddressLocation_2024_08_13,
  BookingInputAttendeeDefinedLocation_2024_08_13,
  BookingInputAttendeePhoneLocation_2024_08_13,
  BookingInputIntegrationLocation_2024_08_13,
  BookingInputLinkLocation_2024_08_13,
  BookingInputOrganizersDefaultAppLocation_2024_08_13,
  BookingInputPhoneLocation_2024_08_13,
  ValidateBookingLocation_2024_08_13,
} from "./location.input";
import { ValidateMetadata } from "./validators/validate-metadata";

export const FAILED_EVENT_TYPE_IDENTIFICATION_ERROR_MESSAGE =
  "Either eventTypeId or eventTypeSlug + username or eventTypeSlug + teamSlug must be provided";

function RequireEventTypeIdentification(validationOptions?: ValidationOptions) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (object: any) => {
    registerDecorator({
      name: "requireEventTypeIdentification",
      target: object,
      propertyName: "eventTypeId or eventTypeSlug + username",
      options: validationOptions,
      constraints: [],
      validator: {
        validate(_: unknown, args: ValidationArguments) {
          const obj = args.object as CreateBookingInput_2024_08_13;

          const hasEventTypeId = !!obj?.eventTypeId;

          const hasSlugAndUsername = !!obj?.eventTypeSlug && !!obj?.username;

          const hasSlugAndTeamSlug = !!obj?.eventTypeSlug && !!obj?.teamSlug;

          return hasEventTypeId || hasSlugAndUsername || hasSlugAndTeamSlug;
        },
        defaultMessage(): string {
          return FAILED_EVENT_TYPE_IDENTIFICATION_ERROR_MESSAGE;
        },
      },
    });
  };
}

function RequireEmailOrPhone(validationOptions?: ValidationOptions) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (object: any) => {
    registerDecorator({
      name: "requireEmailOrPhone",
      target: object,
      propertyName: "attendee email or phone",
      options: validationOptions,
      constraints: [],
      validator: {
        validate(_: unknown, args: ValidationArguments) {
          const obj = args.object as CreateBookingAttendee;

          const hasPhoneNumber = !!obj.phoneNumber;
          const hasEmail = !!obj.email;
          return hasPhoneNumber || hasEmail;
        },
        defaultMessage(): string {
          return "Attendee must have at least one contact method (email or phone number)";
        },
      },
    });
  };
}

export class BaseBookingAttendee {
  @ApiProperty({
    type: String,
    description: "The name of the attendee.",
    example: "John Doe",
  })
  @IsString()
  name!: string;

  @ApiProperty({
    type: String,
    description: "The time zone of the attendee.",
    example: "America/New_York",
  })
  @IsTimeZone()
  timeZone!: string;

  @ApiPropertyOptional({
    type: String,
    description: "The phone number of the attendee in international format.",
    example: "+919876543210",
  })
  @IsOptional()
  @Validate((value: string) => !value || isValidPhoneNumber(value), {
    message: "Invalid phone number format. Please use international format.",
  })
  phoneNumber?: string;

  @ApiPropertyOptional({
    enum: BookingLanguage,
    description: "The preferred language of the attendee. Used for booking confirmation.",
    example: BookingLanguage.it,
    default: BookingLanguage.en,
  })
  @IsEnum(BookingLanguage)
  @IsOptional()
  language?: BookingLanguageType;
}

@RequireEmailOrPhone()
export class CreateBookingAttendee extends BaseBookingAttendee {
  @ApiPropertyOptional({
    type: String,
    description: "The email of the attendee.",
    example: "john.doe@example.com",
  })
  @IsOptional()
  @Validate((value: string) => !value || isEmail(value), {
    message: "Invalid email format",
  })
  email?: string;
}

class Routing {
  @ApiProperty({
    type: Number,
    description: "The ID of the routing form response that determined this booking assignment.",
    example: 123,
  })
  @IsInt()
  responseId!: number;

  @ApiProperty({
    type: [Number],
    description: "Array of team member IDs that were routed to handle this booking.",
    example: [101, 102],
  })
  @IsArray()
  @IsInt({ each: true })
  teamMemberIds!: number[];

  @ApiPropertyOptional({
    type: String,
    description: "The email of the team member assigned to handle this booking.",
    example: "john.doe@example.com",
  })
  @IsString()
  @IsOptional()
  teamMemberEmail?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: "Whether to skip contact owner assignment from CRM integration.",
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  skipContactOwner?: boolean;

  @ApiPropertyOptional({
    type: String,
    description: "The CRM application slug for integration.",
    example: "salesforce",
  })
  @IsString()
  @IsOptional()
  crmAppSlug?: string;

  @ApiPropertyOptional({
    type: String,
    description: "The CRM owner record type for contact assignment.",
    example: "Account",
  })
  @IsString()
  @IsOptional()
  crmOwnerRecordType?: string;
}

@ApiExtraModels(
  BookingInputAddressLocation_2024_08_13,
  BookingInputAttendeeAddressLocation_2024_08_13,
  BookingInputAttendeeDefinedLocation_2024_08_13,
  BookingInputAttendeePhoneLocation_2024_08_13,
  BookingInputIntegrationLocation_2024_08_13,
  BookingInputLinkLocation_2024_08_13,
  BookingInputPhoneLocation_2024_08_13,
  BookingInputOrganizersDefaultAppLocation_2024_08_13,
  ValidateBookingLocation_2024_08_13
)
@RequireEventTypeIdentification()
export class CreateBookingInput_2024_08_13 {
  @ApiProperty({
    type: String,
    description: "The start time of the booking in ISO 8601 format in UTC timezone.",
    example: "2024-08-13T09:00:00Z",
  })
  @IsDateString()
  start!: string;

  @ApiProperty({
    type: CreateBookingAttendee,
    description: "The attendee's details.",
  })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateBookingAttendee)
  attendee!: CreateBookingAttendee;

  @ApiPropertyOptional({
    type: Object,
    description:
      "Booking field responses consisting of an object with booking field slug as keys and user response as values for custom booking fields added by you.",
    example: { customField: "customValue" },
    required: false,
  })
  @IsObject()
  @IsOptional()
  @Transform(({ value }) => {
    if (!value || typeof value !== "object") return value;
    const transformed: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      transformed[key] = val === null ? "" : val;
    }
    return transformed;
  })
  bookingFieldsResponses?: Record<string, unknown>;

  @ApiPropertyOptional({
    type: Number,
    description:
      "The ID of the event type that is booked. Required unless eventTypeSlug and username are provided as an alternative to identifying the event type.",
    example: 123,
  })
  @IsOptional()
  @IsInt()
  eventTypeId?: number;

  @ApiPropertyOptional({
    type: String,
    description:
      "The slug of the event type. Required along with username / teamSlug and optionally organizationSlug if eventTypeId is not provided.",
    example: "my-event-type",
  })
  @IsOptional()
  @IsString()
  eventTypeSlug?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      "The username of the event owner. Required along with eventTypeSlug and optionally organizationSlug if eventTypeId is not provided.",
    example: "john-doe",
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      "Team slug for team that owns event type for which slots are fetched. Required along with eventTypeSlug and optionally organizationSlug if the team is part of organization",
    example: "john-doe",
  })
  @IsOptional()
  @IsString()
  teamSlug?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      "The organization slug. Optional, only used when booking with eventTypeSlug + username or eventTypeSlug + teamSlug.",
    example: "acme-corp",
  })
  @IsOptional()
  @IsString()
  organizationSlug?: string;

  @ApiPropertyOptional({
    type: [String],
    description: "An optional list of guest emails attending the event.",
    example: ["guest1@example.com", "guest2@example.com"],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  guests?: string[];

  @ApiProperty({
    type: String,
    description:
      "Deprecated - use 'location' instead. Meeting URL just for this booking. Displayed in email and calendar event. If not provided then cal video link will be generated.",
    example: "https://example.com/meeting",
    required: false,
    deprecated: true,
  })
  @IsUrl()
  @IsOptional()
  meetingUrl?: string;

  @IsOptional()
  @ValidateBookingLocation_2024_08_13()
  @ApiPropertyOptional({
    description:
      "One of the event type locations. If instead of passing one of the location objects as required by schema you are still passing a string please use an object.",
    oneOf: [
      { $ref: getSchemaPath(BookingInputAddressLocation_2024_08_13) },
      { $ref: getSchemaPath(BookingInputAttendeeAddressLocation_2024_08_13) },
      { $ref: getSchemaPath(BookingInputAttendeeDefinedLocation_2024_08_13) },
      { $ref: getSchemaPath(BookingInputAttendeePhoneLocation_2024_08_13) },
      { $ref: getSchemaPath(BookingInputIntegrationLocation_2024_08_13) },
      { $ref: getSchemaPath(BookingInputLinkLocation_2024_08_13) },
      { $ref: getSchemaPath(BookingInputPhoneLocation_2024_08_13) },
      { $ref: getSchemaPath(BookingInputOrganizersDefaultAppLocation_2024_08_13) },
    ],
  })
  @Type(() => Object)
  // note(Lauris): string is for backwards compatibility
  location?: BookingInputLocation_2024_08_13 | string;

  @ApiProperty({
    type: Object,
    description:
      "You can store any additional data you want here. Metadata must have at most 50 keys, each key up to 40 characters, and string values up to 500 characters.",
    example: { key: "value" },
    required: false,
  })
  @IsObject()
  @IsOptional()
  @ValidateMetadata({
    message:
      "Metadata must have at most 50 keys, each key up to 40 characters, and string values up to 500 characters.",
  })
  metadata?: Record<string, string>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    example: 30,
    description: `If it is an event type that has multiple possible lengths that attendee can pick from, you can pass the desired booking length here.
    If not provided then event type default length will be used for the booking.`,
  })
  lengthInMinutes?: number;

  @ApiPropertyOptional({
    type: Routing,
    description:
      "Routing information from routing forms that determined the booking assignment. Both responseId and teamMemberIds are required if provided.",
    example: {
      responseId: 123,
      teamMemberIds: [101, 102],
    },
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => Routing)
  routing?: Routing;

  @ApiPropertyOptional({
    type: String,
    description: "Email verification code required when event type has email verification enabled.",
    example: "123456",
  })
  @IsOptional()
  @IsString()
  emailVerificationCode?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      "When true, skips host availability and calendar conflict checks. Only permitted when the request is authenticated as the event type owner, a host, or a team or organization administrator. Use for organizer overrides (double bookings, administrative sessions) or integration tests.",
    example: false,
    default: false,
  })
  @Transform(({ value }) => {
    if (value === null || value === undefined) return undefined;
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    return value;
  })
  @IsOptional()
  @IsBoolean()
  overrideAvailability?: boolean;
  /* @ApiPropertyOptional({
    type: [Number],
    description:
      "For round robin event types, filter available hosts to only consider the specified subset of host user IDs. This allows you to book with specific hosts within a round robin event type.",
    example: [1, 2, 3],
  }) */
  @ApiHideProperty()
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  rrHostSubsetIds?: number[];
}

export class CreateRecurringBookingInput_2024_08_13 extends CreateBookingInput_2024_08_13 {
  @ApiPropertyOptional({
    type: Number,
    description: `The number of recurrences. If not provided then event type recurrence count will be used. Can't be more than
    event type recurrence count`,
    example: 5,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  recurrenceCount?: number;
}
