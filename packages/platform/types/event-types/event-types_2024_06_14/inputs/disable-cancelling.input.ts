import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsOptional, Min } from "class-validator";

export class DisableCancelling_2024_06_14 {
  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    description: "If true, cancelling is always disabled for this event type.",
    example: true,
  })
  disabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    description:
      "Disable cancelling when less than the specified number of minutes before the meeting. If set, `disabled` should be false or undefined.",
    example: 60,
  })
  minutesBefore?: number;
}

