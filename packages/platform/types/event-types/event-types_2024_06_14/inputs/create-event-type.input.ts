import { SUPPORTED_LOCALES } from "@calcom/platform-constants";
import { SchedulingType } from "@calcom/platform-enums";
import {
  ApiExtraModels,
  ApiHideProperty,
  ApiProperty as DocsProperty,
  ApiPropertyOptional as DocsPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import { Expose, Transform, Type } from "class-transformer";
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateNested,
} from "class-validator";

import { RequiresAtLeastOnePropertyWhenNotDisabled } from "../../../utils/RequiresOneOfPropertiesWhenNotDisabled";
import { BookerActiveBookingsLimit_2024_06_14 } from "./booker-active-booking-limit.input";
import { BookerLayouts_2024_06_14 } from "./booker-layouts.input";
import type { InputBookingField_2024_06_14 } from "./booking-fields.input";
import {
  AddressFieldInput_2024_06_14,
  BooleanFieldInput_2024_06_14,
  CheckboxGroupFieldInput_2024_06_14,
  EmailDefaultFieldInput_2024_06_14,
  GuestsDefaultFieldInput_2024_06_14,
  LocationDefaultFieldInput_2024_06_14,
  MultiEmailFieldInput_2024_06_14,
  MultiSelectFieldInput_2024_06_14,
  NameDefaultFieldInput_2024_06_14,
  NotesDefaultFieldInput_2024_06_14,
  NumberFieldInput_2024_06_14,
  PhoneFieldInput_2024_06_14,
  RadioGroupFieldInput_2024_06_14,
  RescheduleReasonDefaultFieldInput_2024_06_14,
  SelectFieldInput_2024_06_14,
  TextAreaFieldInput_2024_06_14,
  TextFieldInput_2024_06_14,
  TitleDefaultFieldInput_2024_06_14,
  UrlFieldInput_2024_06_14,
  ValidateInputBookingFields_2024_06_14,
} from "./booking-fields.input";
import type { BookingLimitsCount_2024_06_14 } from "./booking-limits-count.input";
import { BaseBookingLimitsCount_2024_06_14, ValidateBookingLimitsCount } from "./booking-limits-count.input";
import type { BookingLimitsDuration_2024_06_14 } from "./booking-limits-duration.input";
import {
  BaseBookingLimitsDuration_2024_06_14,
  ValidateBookingLimistsDuration,
} from "./booking-limits-duration.input";
import type { BookingWindow_2024_06_14 } from "./booking-window.input";
import {
  BusinessDaysWindow_2024_06_14,
  CalendarDaysWindow_2024_06_14,
  RangeWindow_2024_06_14,
  ValidateBookingWindow,
} from "./booking-window.input";
import type { ConfirmationPolicy_2024_06_14 } from "./confirmation-policy.input";
import { BaseConfirmationPolicy_2024_06_14, ValidateConfirmationPolicy } from "./confirmation-policy.input";
import { DestinationCalendar_2024_06_14 } from "./destination-calendar.input";
import { DisableCancelling_2024_06_14 } from "./disable-cancelling.input";
import { DisableRescheduling_2024_06_14 } from "./disable-rescheduling.input";
import { Disabled_2024_06_14 } from "./disabled.input";
import { EmailSettings_2024_06_14 } from "./email-settings.input";
import { EventTypeColor_2024_06_14 } from "./event-type-color.input";
import type { InputLocation_2024_06_14, InputTeamLocation_2024_06_14 } from "./locations.input";
import {
  InputAddressLocation_2024_06_14,
  InputAttendeeAddressLocation_2024_06_14,
  InputAttendeeDefinedLocation_2024_06_14,
  InputAttendeePhoneLocation_2024_06_14,
  InputIntegrationLocation_2024_06_14,
  InputLinkLocation_2024_06_14,
  InputOrganizersDefaultApp_2024_06_14,
  InputPhoneLocation_2024_06_14,
  ValidateLocations_2024_06_14,
  ValidateTeamLocations_2024_06_14,
} from "./locations.input";
import { Recurrence_2024_06_14 } from "./recurrence.input";
import { Seats_2024_06_14 } from "./seats.input";
import { CantHaveRecurrenceAndBookerActiveBookingsLimit } from "./validators/CantHaveRecurrenceAndBookerActiveBookingsLimit";

export const CREATE_EVENT_LENGTH_EXAMPLE = 60;
export const CREATE_EVENT_TITLE_EXAMPLE = "Learn the secrets of masterchief!";
export const CREATE_EVENT_DESCRIPTION_EXAMPLE =
  "Discover the culinary wonders of the Argentina by making the best flan ever!";
export const CREATE_EVENT_SLUG_EXAMPLE = "learn-the-secrets-of-masterchief";

@ApiExtraModels(
  InputAddressLocation_2024_06_14,
  InputLinkLocation_2024_06_14,
  InputIntegrationLocation_2024_06_14,
  InputPhoneLocation_2024_06_14,
  PhoneFieldInput_2024_06_14,
  AddressFieldInput_2024_06_14,
  TextFieldInput_2024_06_14,
  NumberFieldInput_2024_06_14,
  TextAreaFieldInput_2024_06_14,
  SelectFieldInput_2024_06_14,
  MultiSelectFieldInput_2024_06_14,
  MultiEmailFieldInput_2024_06_14,
  CheckboxGroupFieldInput_2024_06_14,
  RadioGroupFieldInput_2024_06_14,
  BooleanFieldInput_2024_06_14,
  UrlFieldInput_2024_06_14,
  BusinessDaysWindow_2024_06_14,
  CalendarDaysWindow_2024_06_14,
  RangeWindow_2024_06_14,
  BaseBookingLimitsCount_2024_06_14,
  BookerActiveBookingsLimit_2024_06_14,
  Disabled_2024_06_14,
  BaseBookingLimitsDuration_2024_06_14,
  Recurrence_2024_06_14,
  BaseConfirmationPolicy_2024_06_14,
  Seats_2024_06_14,
  InputAttendeeAddressLocation_2024_06_14,
  InputAttendeePhoneLocation_2024_06_14,
  InputAttendeeDefinedLocation_2024_06_14,
  NameDefaultFieldInput_2024_06_14,
  EmailDefaultFieldInput_2024_06_14,
  TitleDefaultFieldInput_2024_06_14,
  LocationDefaultFieldInput_2024_06_14,
  NotesDefaultFieldInput_2024_06_14,
  GuestsDefaultFieldInput_2024_06_14,
  RescheduleReasonDefaultFieldInput_2024_06_14,
  InputOrganizersDefaultApp_2024_06_14,
  EmailSettings_2024_06_14,
  DisableRescheduling_2024_06_14,
  DisableCancelling_2024_06_14
)
export class CalVideoSettings {
  @IsOptional()
  @IsBoolean()
  @DocsPropertyOptional({
    description: "If true, the organizer will not be able to record the meeting",
    default: false,
  })
  disableRecordingForOrganizer?: boolean;

  @IsOptional()
  @IsBoolean()
  @DocsPropertyOptional({
    description: "If true, the guests will not be able to record the meeting",
    default: false,
  })
  disableRecordingForGuests?: boolean;

  @IsOptional()
  @IsUrl()
  @DocsPropertyOptional({
    description: "URL to which participants are redirected when they exit the call",
  })
  redirectUrlOnExit?: string | null;

  @IsOptional()
  @IsBoolean()
  @DocsPropertyOptional({
    description: "If true, enables the automatic recording for the event when organizer joins the call",
    default: false,
  })
  enableAutomaticRecordingForOrganizer?: boolean;

  @IsOptional()
  @IsBoolean()
  @DocsPropertyOptional({
    description: "If true, enables the automatic transcription for the event whenever someone joins the call",
    default: false,
  })
  enableAutomaticTranscription?: boolean;

  @IsOptional()
  @IsBoolean()
  @DocsPropertyOptional({
    description: "If true, the guests will not be able to receive transcription of the meeting",
    default: false,
  })
  disableTranscriptionForGuests?: boolean;

  @IsOptional()
  @IsBoolean()
  @DocsPropertyOptional({
    description: "If true, the organizer will not be able to receive transcription of the meeting",
    default: false,
  })
  disableTranscriptionForOrganizer?: boolean;

  @IsOptional()
  @IsBoolean()
  @DocsPropertyOptional({
    description: "Send emails with the transcription of the Cal Video after the meeting ends.",
    default: true,
  })
  sendTranscriptionEmails?: boolean;
}

@CantHaveRecurrenceAndBookerActiveBookingsLimit()
export class BaseCreateEventTypeInput {
  @IsInt()
  @Min(1)
  @DocsProperty({ example: CREATE_EVENT_LENGTH_EXAMPLE })
  lengthInMinutes!: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @DocsPropertyOptional({
    example: [15, 30, 60],
    description:
      "If you want that user can choose between different lengths of the event you can specify them here. Must include the provided `lengthInMinutes`.",
  })
  lengthInMinutesOptions?: number[];

  @IsString()
  @DocsProperty({ example: CREATE_EVENT_TITLE_EXAMPLE })
  title!: string;

  @IsString()
  @DocsProperty({ example: CREATE_EVENT_SLUG_EXAMPLE })
  slug!: string;

  @IsOptional()
  @IsString()
  @DocsPropertyOptional({ example: CREATE_EVENT_DESCRIPTION_EXAMPLE })
  description?: string;

  @IsOptional()
  @ValidateInputBookingFields_2024_06_14()
  @DocsPropertyOptional({
    description:
      "Custom fields that can be added to the booking form when the event is booked by someone. By default booking form has name and email field.",
    oneOf: [
      { $ref: getSchemaPath(NameDefaultFieldInput_2024_06_14) },
      { $ref: getSchemaPath(EmailDefaultFieldInput_2024_06_14) },
      { $ref: getSchemaPath(TitleDefaultFieldInput_2024_06_14) },
      { $ref: getSchemaPath(LocationDefaultFieldInput_2024_06_14) },
      { $ref: getSchemaPath(NotesDefaultFieldInput_2024_06_14) },
      { $ref: getSchemaPath(GuestsDefaultFieldInput_2024_06_14) },
      { $ref: getSchemaPath(RescheduleReasonDefaultFieldInput_2024_06_14) },
      { $ref: getSchemaPath(PhoneFieldInput_2024_06_14) },
      { $ref: getSchemaPath(AddressFieldInput_2024_06_14) },
      { $ref: getSchemaPath(TextFieldInput_2024_06_14) },
      { $ref: getSchemaPath(NumberFieldInput_2024_06_14) },
      { $ref: getSchemaPath(TextAreaFieldInput_2024_06_14) },
      { $ref: getSchemaPath(SelectFieldInput_2024_06_14) },
      { $ref: getSchemaPath(MultiSelectFieldInput_2024_06_14) },
      { $ref: getSchemaPath(MultiEmailFieldInput_2024_06_14) },
      { $ref: getSchemaPath(CheckboxGroupFieldInput_2024_06_14) },
      { $ref: getSchemaPath(RadioGroupFieldInput_2024_06_14) },
      { $ref: getSchemaPath(BooleanFieldInput_2024_06_14) },
      { $ref: getSchemaPath(UrlFieldInput_2024_06_14) },
    ],
    type: "array",
  })
  @Type(() => Object)
  bookingFields?: InputBookingField_2024_06_14[];

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    description: "If true, person booking this event can't add guests via their emails.",
  })
  disableGuests?: boolean;

  @IsInt()
  @IsOptional()
  @DocsPropertyOptional({
    description: `Number representing length of each slot when event is booked. By default it equal length of the event type.
      If event length is 60 minutes then we would have slots 9AM, 10AM, 11AM etc. but if it was changed to 30 minutes then
      we would have slots 9AM, 9:30AM, 10AM, 10:30AM etc. as the available times to book the 60 minute event.`,
  })
  slotInterval?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  @DocsPropertyOptional({
    description: "Minimum number of minutes before the event that a booking can be made.",
  })
  minimumBookingNotice?: number;

  @IsInt()
  @IsOptional()
  @DocsPropertyOptional({
    description:
      "Extra time automatically blocked on your calendar before a meeting starts. This gives you time to prepare, review notes, or transition from your previous activity.",
  })
  beforeEventBuffer?: number;

  @IsInt()
  @IsOptional()
  @DocsPropertyOptional({
    description:
      "Extra time automatically blocked on your calendar after a meeting ends. This gives you time to wrap up, add notes, or decompress before your next commitment.",
  })
  afterEventBuffer?: number;

  @IsInt()
  @IsOptional()
  @DocsPropertyOptional({
    description:
      "If you want that this event has different schedule than user's default one you can specify it here.",
  })
  scheduleId?: number;

  @IsOptional()
  @ValidateBookingLimitsCount()
  @DocsPropertyOptional({
    description: "Limit how many times this event can be booked",
    oneOf: [
      { $ref: getSchemaPath(BaseBookingLimitsCount_2024_06_14) },
      { $ref: getSchemaPath(Disabled_2024_06_14) },
    ],
  })
  @Type(() => Object)
  bookingLimitsCount?: BookingLimitsCount_2024_06_14;

  @IsOptional()
  @RequiresAtLeastOnePropertyWhenNotDisabled()
  @Transform(({ value }) => {
    if (value && typeof value === "object") {
      if ("disabled" in value && value.disabled) {
        return Object.assign(new Disabled_2024_06_14(), value);
      } else {
        return Object.assign(new BookerActiveBookingsLimit_2024_06_14(), value);
      }
    }
    return value;
  })
  @ValidateNested()
  @DocsPropertyOptional({
    description: "Limit the number of active bookings a booker can make for this event type.",
    oneOf: [
      { $ref: getSchemaPath(BookerActiveBookingsLimit_2024_06_14) },
      { $ref: getSchemaPath(Disabled_2024_06_14) },
    ],
  })
  @Type(() => Object)
  bookerActiveBookingsLimit?: BookerActiveBookingsLimit_2024_06_14 | Disabled_2024_06_14;

  @IsOptional()
  @IsBoolean()
  @DocsPropertyOptional({
    description:
      "This will limit your availability for this event type to one slot per day, scheduled at the earliest available time.",
  })
  onlyShowFirstAvailableSlot?: boolean;

  @IsOptional()
  @ValidateBookingLimistsDuration()
  @DocsPropertyOptional({
    description: "Limit total amount of time that this event can be booked",
    oneOf: [
      { $ref: getSchemaPath(BaseBookingLimitsDuration_2024_06_14) },
      { $ref: getSchemaPath(Disabled_2024_06_14) },
    ],
  })
  @Type(() => Object)
  bookingLimitsDuration?: BookingLimitsDuration_2024_06_14;

  @IsOptional()
  @ValidateBookingWindow()
  @DocsPropertyOptional({
    description: "Limit how far in the future this event can be booked",
    oneOf: [
      { $ref: getSchemaPath(BusinessDaysWindow_2024_06_14) },
      { $ref: getSchemaPath(CalendarDaysWindow_2024_06_14) },
      { $ref: getSchemaPath(RangeWindow_2024_06_14) },
      { $ref: getSchemaPath(Disabled_2024_06_14) },
    ],
  })
  @Type(() => Object)
  bookingWindow?: BookingWindow_2024_06_14;

  @IsOptional()
  @IsInt()
  @Min(0)
  @DocsPropertyOptional({ description: "Offset timeslots shown to bookers by a specified number of minutes" })
  offsetStart?: number;

  @IsOptional()
  @DocsPropertyOptional({
    description:
      "Should booker have week, month or column view. Specify default layout and enabled layouts user can pick.",
  })
  @Type(() => BookerLayouts_2024_06_14)
  @ValidateNested()
  bookerLayouts?: BookerLayouts_2024_06_14;

  @IsOptional()
  @ValidateConfirmationPolicy()
  @DocsPropertyOptional({
    description:
      "Specify how the booking needs to be manually confirmed before it is pushed to the integrations and a confirmation mail is sent.",
    oneOf: [
      { $ref: getSchemaPath(BaseConfirmationPolicy_2024_06_14) },
      { $ref: getSchemaPath(Disabled_2024_06_14) },
    ],
  })
  @Type(() => Object)
  confirmationPolicy?: ConfirmationPolicy_2024_06_14;

  @ValidateNested()
  @IsOptional()
  @Transform(({ value }) => {
    if (value && typeof value === "object") {
      if ("interval" in value) {
        return Object.assign(new Recurrence_2024_06_14(), value);
      } else if ("disabled" in value) {
        return Object.assign(new Disabled_2024_06_14(), value);
      }
    }
    return value;
  })
  @ValidateNested()
  @DocsPropertyOptional({
    description: "Create a recurring event type.",
    oneOf: [{ $ref: getSchemaPath(Recurrence_2024_06_14) }, { $ref: getSchemaPath(Disabled_2024_06_14) }],
  })
  @Type(() => Object)
  recurrence?: Recurrence_2024_06_14 | Disabled_2024_06_14;

  @IsOptional()
  @IsBoolean()
  @DocsPropertyOptional()
  requiresBookerEmailVerification?: boolean;

  @IsOptional()
  @IsBoolean()
  @DocsPropertyOptional()
  hideCalendarNotes?: boolean;

  @IsOptional()
  @IsBoolean()
  @DocsPropertyOptional()
  lockTimeZoneToggleOnBookingPage?: boolean;

  @IsOptional()
  @DocsPropertyOptional()
  @Type(() => EventTypeColor_2024_06_14)
  color?: EventTypeColor_2024_06_14;

  @IsOptional()
  @Transform(({ value }) => {
    if (value && typeof value === "object") {
      if ("seatsPerTimeSlot" in value) {
        return Object.assign(new Seats_2024_06_14(), value);
      } else if ("disabled" in value) {
        return Object.assign(new Disabled_2024_06_14(), value);
      }
    }
    return value;
  })
  @ValidateNested()
  @DocsPropertyOptional({
    description: "Create an event type with multiple seats.",
    oneOf: [{ $ref: getSchemaPath(Seats_2024_06_14) }, { $ref: getSchemaPath(Disabled_2024_06_14) }],
  })
  @Type(() => Object)
  seats?: Seats_2024_06_14 | Disabled_2024_06_14;

  @IsOptional()
  @IsString()
  @DocsPropertyOptional({
    description: `Customizable event name with valid variables:
      {Event type title}, {Organiser}, {Scheduler}, {Location}, {Organiser first name},
      {Scheduler first name}, {Scheduler last name}, {Event duration}, {LOCATION},
      {HOST/ATTENDEE}, {HOST}, {ATTENDEE}, {USER}`,
    example: "{Event type title} between {Organiser} and {Scheduler}",
  })
  customName?: string;

  @IsOptional()
  @DocsPropertyOptional()
  @Type(() => DestinationCalendar_2024_06_14)
  destinationCalendar?: DestinationCalendar_2024_06_14;

  @IsOptional()
  @IsBoolean()
  @DocsPropertyOptional()
  useDestinationCalendarEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  @DocsPropertyOptional()
  hideCalendarEventDetails?: boolean;

  @IsOptional()
  @IsUrl()
  @DocsPropertyOptional({
    description: "A valid URL where the booker will redirect to, once the booking is completed successfully",
    example: "https://masterchief.com/argentina/flan/video/9129412",
  })
  successRedirectUrl?: string;

  @IsOptional()
  @IsBoolean()
  @DocsPropertyOptional({
    description:
      "Boolean to Hide organizer's email address from the booking screen, email notifications, and calendar events",
  })
  hideOrganizerEmail?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => CalVideoSettings)
  @DocsPropertyOptional({
    description:
      "Cal video settings for the event type. Platform customers can't manage this property because currently we have no way of determining if managed user is a host or an attendee.",
    type: CalVideoSettings,
  })
  calVideoSettings?: CalVideoSettings;

  @IsOptional()
  @IsBoolean()
  @DocsPropertyOptional()
  hidden?: boolean;

  @IsOptional()
  @IsBoolean()
  @DocsPropertyOptional({
    default: false,
    description:
      "Boolean to require authentication for booking this event type via api. If true, only authenticated users who are the event-type owner or org/team admin/owner can book this event type.",
  })
  bookingRequiresAuthentication?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => DisableCancelling_2024_06_14)
  @DocsPropertyOptional({
    description: "Settings for disabling cancelling of this event type.",
    type: DisableCancelling_2024_06_14,
    example: { disabled: true },
  })
  disableCancelling?: DisableCancelling_2024_06_14;

  @IsOptional()
  @ValidateNested()
  @Type(() => DisableRescheduling_2024_06_14)
  @DocsPropertyOptional({
    description:
      "Settings for disabling rescheduling of this event type. Can be always disabled or disabled when less than X minutes before the meeting.",
    type: DisableRescheduling_2024_06_14,
    example: { disabled: false, minutesBefore: 60 },
  })
  disableRescheduling?: DisableRescheduling_2024_06_14;

  @IsOptional()
  @IsString()
  @IsIn([...SUPPORTED_LOCALES])
  @DocsPropertyOptional({
    description:
      "Set preferred language for the booking interface. Use empty string for visitor's browser language (default).",
    enum: SUPPORTED_LOCALES,
  })
  interfaceLanguage?: string;

  @IsOptional()
  @IsBoolean()
  @DocsPropertyOptional({
    description: "Enabling this option allows for past events to be rescheduled.",
    default: false,
  })
  allowReschedulingPastBookings?: boolean;

  @IsOptional()
  @IsBoolean()
  @DocsPropertyOptional({
    description:
      "When enabled, users will be able to create a new booking when trying to reschedule a cancelled booking.",
    default: false,
  })
  allowReschedulingCancelledBookings?: boolean;

  @IsOptional()
  @IsBoolean()
  @DocsPropertyOptional({
    description: "Arrange time slots to optimize availability.",
    default: false,
  })
  showOptimizedSlots?: boolean;
}
export class CreateEventTypeInput_2024_06_14 extends BaseCreateEventTypeInput {
  @IsOptional()
  @ValidateLocations_2024_06_14()
  @DocsPropertyOptional({
    description:
      "Locations where the event will take place. If not provided, cal video link will be used as the location. Note: Setting a location to a conferencing app does not install the app - the app must already be installed. Via API, only Google Meet (google-meet), Microsoft Teams (office365-video), and Zoom (zoom) can be installed. Cal Video (cal-video) is installed by default. All other conferencing apps must be connected via the Cal.diy web app and are not available for Platform plan customers. You can only set an event type location to an app that has already been installed or connected.",
    oneOf: [
      { $ref: getSchemaPath(InputAddressLocation_2024_06_14) },
      { $ref: getSchemaPath(InputLinkLocation_2024_06_14) },
      { $ref: getSchemaPath(InputIntegrationLocation_2024_06_14) },
      { $ref: getSchemaPath(InputPhoneLocation_2024_06_14) },
      { $ref: getSchemaPath(InputAttendeeAddressLocation_2024_06_14) },
      { $ref: getSchemaPath(InputAttendeePhoneLocation_2024_06_14) },
      { $ref: getSchemaPath(InputAttendeeDefinedLocation_2024_06_14) },
    ],
    type: "array",
  })
  @Type(() => Object)
  locations?: InputLocation_2024_06_14[];
}

export enum HostPriority {
  lowest = "lowest",
  low = "low",
  medium = "medium",
  high = "high",
  highest = "highest",
}
export class Host {
  @Expose()
  @IsInt()
  @DocsProperty({ description: "Which user is the host of this event" })
  userId!: number;

  @IsOptional()
  @Expose()
  @IsBoolean()
  @DocsPropertyOptional({
    description:
      "Only relevant for round robin event types. If true then the user must attend round robin event always.",
  })
  mandatory?: boolean = false;

  @IsEnum(HostPriority)
  @Expose()
  @IsOptional()
  @DocsPropertyOptional({ enum: HostPriority })
  priority?: keyof typeof HostPriority = "medium";
}

export class CreateTeamEventTypeInput_2024_06_14 extends BaseCreateEventTypeInput {
  @Transform(({ value }) => {
    if (value === "collective") {
      return SchedulingType.COLLECTIVE;
    }
    if (value === "roundRobin") {
      return SchedulingType.ROUND_ROBIN;
    }
    if (value === "managed") {
      return SchedulingType.MANAGED;
    }
    return value;
  })
  @IsEnum(SchedulingType)
  @DocsProperty({
    enum: ["collective", "roundRobin", "managed"],
    example: "collective",
    description: "The scheduling type for the team event - collective, roundRobin or managed.",
  })
  schedulingType!: keyof typeof SchedulingType;

  @ValidateNested({ each: true })
  @Type(() => Host)
  @IsArray()
  @IsOptional()
  @DocsPropertyOptional({
    type: [Host],
    description:
      "Hosts contain specific team members you want to assign to this event type, but if you want to assign all team members, use `assignAllTeamMembers: true` instead and omit this field. For platform customers the hosts can include userIds only of managed users. Provide either hosts or assignAllTeamMembers but not both",
  })
  hosts?: Host[];

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    description:
      "If true, all current and future team members will be assigned to this event type. Provide either assignAllTeamMembers or hosts but not both",
  })
  assignAllTeamMembers?: boolean;

  @IsOptional()
  @ValidateTeamLocations_2024_06_14()
  @DocsPropertyOptional({
    description:
      "Locations where the event will take place. If not provided, cal video link will be used as the location. Note: Setting a location to a conferencing app does not install the app - the app must already be installed. Via API, only Google Meet (google-meet), Microsoft Teams (office365-video), and Zoom (zoom) can be installed. Cal Video (cal-video) is installed by default. All other conferencing apps must be connected via the Cal.diy web app and are not available for Platform plan customers. You can only set an event type location to an app that has already been installed or connected.",
    oneOf: [
      { $ref: getSchemaPath(InputAddressLocation_2024_06_14) },
      { $ref: getSchemaPath(InputLinkLocation_2024_06_14) },
      { $ref: getSchemaPath(InputIntegrationLocation_2024_06_14) },
      { $ref: getSchemaPath(InputPhoneLocation_2024_06_14) },
      { $ref: getSchemaPath(InputAttendeeAddressLocation_2024_06_14) },
      { $ref: getSchemaPath(InputAttendeePhoneLocation_2024_06_14) },
      { $ref: getSchemaPath(InputAttendeeDefinedLocation_2024_06_14) },
      { $ref: getSchemaPath(InputOrganizersDefaultApp_2024_06_14) },
    ],
    type: "array",
  })
  @Type(() => Object)
  locations?: InputTeamLocation_2024_06_14[];

  @IsOptional()
  @ValidateNested()
  @DocsPropertyOptional({
    description: "Email settings for this event type - only available for organization team event types.",
    type: () => EmailSettings_2024_06_14,
  })
  @Type(() => EmailSettings_2024_06_14)
  emailSettings?: EmailSettings_2024_06_14;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    description: "Rescheduled events will be assigned to the same host as initially scheduled.",
  })
  rescheduleWithSameRoundRobinHost?: boolean;

  @IsBoolean()
  @IsOptional()
  /* @DocsPropertyOptional({
    description:
      "For round robin event types, enable filtering available hosts to only consider a specified subset of host user IDs. This allows you to book with specific hosts within a round robin event type.",
  }) */
  @ApiHideProperty()
  rrHostSubsetEnabled?: boolean;
}
