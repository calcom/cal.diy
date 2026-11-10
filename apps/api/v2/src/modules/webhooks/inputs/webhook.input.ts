import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString } from "class-validator";

import { WebhookTriggerEvents, WebhookVersion } from "@calcom/platform-libraries";

export class CreateWebhookInputDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      "The template of the payload that will be sent to the subscriberUrl, check https://github.com/OpenCal-Community/cal.diy/wiki/Webhooks for more information",
    example: JSON.stringify({
      content: "A new event has been scheduled",
      type: "{{type}}",
      name: "{{title}}",
      organizer: "{{organizer.name}}",
      booker: "{{attendees.0.name}}",
    }),
  })
  payloadTemplate?: string;

  @IsBoolean()
  @ApiProperty()
  active!: boolean;

  @IsString()
  @ApiProperty()
  subscriberUrl!: string;

  @IsArray()
  @ApiProperty({
    isArray: true,
    enum: WebhookTriggerEvents,
    example: [
      "BOOKING_CREATED",
      "BOOKING_RESCHEDULED",
      "BOOKING_CANCELLED",
      "BOOKING_CONFIRMED",
      "BOOKING_REJECTED",
      "BOOKING_COMPLETED",
      "BOOKING_NO_SHOW",
      "BOOKING_REOPENED",
    ],
  })
  @IsEnum(WebhookTriggerEvents, { each: true })
  triggers!: WebhookTriggerEvents[];

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  secret?: string;

  @IsOptional()
  @IsEnum(WebhookVersion)
  @ApiPropertyOptional({
    description: "The version of the webhook",
    example: WebhookVersion.V_2021_10_20,
    enum: WebhookVersion,
  })
  version?: WebhookVersion;
}

export class UpdateWebhookInputDto extends PartialType(CreateWebhookInputDto) {}
