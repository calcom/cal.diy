import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import { IsBoolean, IsEnum, IsInt, IsString, ValidateNested, IsArray } from "class-validator";

import { SUCCESS_STATUS, ERROR_STATUS } from "@calcom/platform-constants";
import { WebhookTriggerEvents } from "@calcom/platform-libraries";

export class WebhookOutputDto {
  @IsInt()
  @Expose()
  readonly id!: number;

  @IsString()
  @Expose()
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
  readonly payloadTemplate!: string;

  @IsArray()
  @IsEnum(WebhookTriggerEvents, { each: true })
  @Expose()
  @ApiProperty({ isArray: true, enum: WebhookTriggerEvents })
  readonly triggers!: WebhookTriggerEvents[];

  @IsString()
  @Expose()
  readonly subscriberUrl!: string;

  @IsBoolean()
  @Expose()
  readonly active!: boolean;

  @IsString()
  @Expose()
  readonly secret?: string;
}

export class DeleteManyWebhooksOutputResponseDto {
  @ApiProperty({ example: SUCCESS_STATUS, enum: [SUCCESS_STATUS, ERROR_STATUS] })
  @IsEnum([SUCCESS_STATUS, ERROR_STATUS])
  @Expose()
  status!: typeof SUCCESS_STATUS | typeof ERROR_STATUS;

  @Expose()
  @ValidateNested()
  @Type(() => WebhookOutputDto)
  data!: string;
}
