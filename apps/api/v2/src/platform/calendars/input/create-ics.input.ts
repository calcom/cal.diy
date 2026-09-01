import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { ValidatorConstraintInterface } from "class-validator";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  Validate,
  ValidatorConstraint,
} from "class-validator";

@ValidatorConstraint({ async: false })
export class IsICSUrlConstraint implements ValidatorConstraintInterface {
  validate(url: unknown): boolean {
    if (typeof url !== "string") return false;

    try {
      const urlObject = new URL(url);
      return urlObject.protocol === "http:" || urlObject.protocol === "https:";
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return "The URL must be a valid HTTP or HTTPS URL";
  }
}

export class CreateIcsFeedInputDto {
  @ApiProperty({
    example: ["https://cal.com/ics/feed.ics", "https://caldav.example.com/calendars/user?export"],
    description: "An array of ICS URLs",
    type: "array",
    items: {
      type: "string",
      example: "https://caldav.example.com/calendars/user?export",
    },
    required: true,
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsNotEmpty({ each: true })
  @Validate(IsICSUrlConstraint, { each: true })
  urls!: string[];

  @IsBoolean()
  @ApiPropertyOptional({
    example: false,
    description: "Whether to allowing writing to the calendar or not",
    type: "boolean",
    default: true,
  })
  @IsOptional()
  readOnly?: boolean = true;
}
