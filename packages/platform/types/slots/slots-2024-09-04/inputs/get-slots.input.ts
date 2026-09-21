import { ApiHideProperty, ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsDateString,
  IsTimeZone,
  IsOptional,
  IsNumber,
  IsString,
  IsArray,
  ArrayMinSize,
  IsEnum,
} from "class-validator";

import { SlotFormat } from "@calcom/platform-enums";

export class GetAvailableSlotsInput_2024_09_04 {
  @IsDateString({ strict: true })
  @ApiProperty({
    type: String,
    description: `
      Time starting from which available slots should be checked.
    
      Must be in UTC timezone as ISO 8601 datestring.
      
      You can pass date without hours which defaults to start of day or specify hours:
      2024-08-13 (will have hours 00:00:00 aka at very beginning of the date) or you can specify hours manually like 2024-08-13T09:00:00Z
      `,
    example: "2050-09-05",
  })
  start!: string;

  @IsDateString({ strict: true })
  @ApiProperty({
    type: String,
    description: `
      Time until which available slots should be checked.
      
      Must be in UTC timezone as ISO 8601 datestring.
      
      You can pass date without hours which defaults to end of day or specify hours:
      2024-08-20 (will have hours 23:59:59 aka at the very end of the date) or you can specify hours manually like 2024-08-20T18:00:00Z`,
    example: "2050-09-06",
  })
  end!: string;

  @IsTimeZone()
  @IsOptional()
  @ApiPropertyOptional({
    type: String,
    description: "Time zone in which the available slots should be returned. Defaults to UTC.",
    example: "Europe/Rome",
  })
  timeZone?: string;

  @Transform(({ value }: { value: string }) => value && parseInt(value))
  @IsNumber()
  @IsOptional()
  @ApiPropertyOptional({
    type: Number,
    description:
      "If event type has multiple possible durations then you can specify the desired duration here. Also, if you are fetching slots for a dynamic event then you can specify the duration her which defaults to 30, meaning that returned slots will be each 30 minutes long.",
    example: "60",
  })
  duration?: number;

  @IsString()
  @IsEnum(SlotFormat, {
    message: "slotFormat must be either 'range' or 'time'",
  })
  @Transform(({ value }) => {
    if (!value) return undefined;
    return value.toLowerCase();
  })
  @IsOptional()
  @ApiPropertyOptional({
    description: "Format of slot times in response. Use 'range' to get start and end times.",
    example: "range",
    enum: SlotFormat,
  })
  format?: SlotFormat;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({
    type: String,
    description:
      "The unique identifier of the booking being rescheduled. When provided will ensure that the original booking time appears within the returned available slots when rescheduling.",
    example: "abc123def456",
  })
  bookingUidToReschedule?: string;

  @Transform(({ value }) => {
    if (typeof value === "string") {
      return value.split(",").map((id: string) => parseInt(id.trim(), 10));
    }
    if (Array.isArray(value)) {
      return value.map((id) => (typeof id === "string" ? parseInt(id, 10) : id));
    }
    return value;
  })
  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  /* @ApiPropertyOptional({
    type: [Number],
    description:
      "For round robin event types, filter available slots to only consider the specified subset of host user IDs. This allows you to get availability for specific hosts within a round robin event type.",
    example: [1, 2, 3],
  }) */
  @ApiHideProperty()
  rrHostSubsetIds?: number[];
}

export const ById_2024_09_04_type = "byEventTypeId";
export class ById_2024_09_04 extends GetAvailableSlotsInput_2024_09_04 {
  @IsString()
  type: typeof ById_2024_09_04_type = ById_2024_09_04_type;

  @Transform(({ value }: { value: string }) => value && parseInt(value))
  @IsNumber()
  @ApiProperty({
    type: Number,
    description: "The ID of the event type for which available slots should be checked.",
    example: "100",
  })
  eventTypeId!: number;
}

export const ByUsernameAndEventTypeSlug_2024_09_04_type = "byUsernameAndEventTypeSlug";
export class ByUsernameAndEventTypeSlug_2024_09_04 extends GetAvailableSlotsInput_2024_09_04 {
  @IsString()
  type: typeof ByUsernameAndEventTypeSlug_2024_09_04_type = ByUsernameAndEventTypeSlug_2024_09_04_type;

  @IsString()
  @ApiProperty({
    type: String,
    description: "The slug of the event type for which available slots should be checked.",
    example: "event-type-slug",
  })
  eventTypeSlug!: string;

  @IsString()
  @ApiProperty({
    type: String,
    description:
      "When searching by eventTypeSlug a username must be provided too aka username of the owner of the event type.",
    example: "bob",
  })
  username!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    type: String,
    description:
      "Organzation slug in which the slots of event type belonging to the specified username should be checked.",
    example: "org-slug",
  })
  organizationSlug?: string;
}

export const ByTeamSlugAndEventTypeSlug_2024_09_04_type = "byTeamSlugAndEventTypeSlug";
export class ByTeamSlugAndEventTypeSlug_2024_09_04 extends GetAvailableSlotsInput_2024_09_04 {
  @IsString()
  type: typeof ByTeamSlugAndEventTypeSlug_2024_09_04_type = ByTeamSlugAndEventTypeSlug_2024_09_04_type;

  @IsString()
  @ApiProperty({
    type: String,
    description: "The slug of the event type for which available slots should be checked.",
    example: "event-type-slug",
  })
  eventTypeSlug!: string;

  @IsString()
  @ApiProperty({
    type: String,
    description:
      "When searching by eventTypeSlug a teamSlug must be provided too aka team who owns the event type.",
    example: "bob",
  })
  teamSlug!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    type: String,
    description:
      "Organzation slug in which the slots of event type belonging to the specified teamSlug should be checked.",
    example: "org-slug",
  })
  organizationSlug?: string;
}

export const ByUsernames_2024_09_04_type = "byUsernames";
export class ByUsernames_2024_09_04 extends GetAvailableSlotsInput_2024_09_04 {
  @IsString()
  type: typeof ByUsernames_2024_09_04_type = ByUsernames_2024_09_04_type;

  @Transform(({ value }) => {
    if (typeof value === "string") {
      return value.split(",").map((username: string) => username.trim());
    }
    return value;
  })
  @IsArray()
  @ArrayMinSize(2, { message: "The array must contain at least 2 elements." })
  @IsString({ each: true })
  @ApiProperty({
    type: [String],
    description: `The usernames for which available slots should be checked.
      
      Checking slots by usernames is used mainly for dynamic event where there is no specific event but we just want to know when are 2 or more people available.
      
      Must contain at least 2 usernames e.g. ?usernames=alice,bob`,
    example: ["username1", "username2"],
  })
  usernames!: string[];

  @IsString()
  @ApiProperty({
    type: String,
    description: "Slug of the organization to which each user in the `usernames` array belongs.",
    example: "org-slug",
  })
  organizationSlug!: string;
}
