import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsOptional, Min } from "class-validator";

export class DisableCancellingOutput_2024_06_14 {
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
      "Cancelling is disabled when less than the specified number of minutes before the meeting.",
    example: 60,
  })
  minutesBefore?: number;
}

