import dayjs from "@calcom/dayjs";
import type { CalendarEvent } from "@calcom/features/calendars/weeklyview/types/events";
import type { BookingStatus } from "@calcom/prisma/enums";
import classNames from "@calcom/ui/classNames";
import { Tooltip } from "@calcom/ui/components/tooltip";
import { cva } from "class-variance-authority";

type EventProps = {
  event: CalendarEvent;
  currentlySelectedEventId?: number;
  eventDuration: number;
  onEventClick?: (event: CalendarEvent) => void;
  isHovered?: boolean;
};

const eventClasses = cva(
  "group flex h-full w-full overflow-hidden rounded-[6px] px-[6px] text-xs leading-5 border-default font-medium",
  {
    variants: {
      status: {
        ACCEPTED: "bg-subtle hover:bg-emphasis text-emphasis border-[1px] border-default",
        PENDING: "bg-subtle text-subtle border-[1px] border-dashed border-default",
        REJECTED: "bg-subtle border-[1px] border-dashed text-subtle line-through",
        CANCELLED: "bg-subtle border-[1px] border-dashed text-subtle line-through",
        AWAITING_HOST: "bg-subtle text-emphasis border-[1px] border-dashed border-default",
      },
      disabled: {
        true: "hover:cursor-default",
        false: "hover:cursor-pointer",
      },
      selected: {
        true: "",
        false: "",
      },
      borderOnly: {
        true: "bg-transparent border-[1.5px] border-subtle border-dashed opacity-60",
        false: "",
      },
    },
  }
);

const STATUS_COLOR_MAP: Record<BookingStatus, string> = {
  ACCEPTED: "bg-green-500",
  PENDING: "bg-orange-500",
  REJECTED: "bg-red-500",
  CANCELLED: "bg-red-500",
  AWAITING_HOST: "bg-blue-500",
};

// Maps booking status to color classes for the color bar
// Follows the same pattern as BookingDetailsSheet badge variants
const getStatusColorClass = (status?: BookingStatus): string | undefined => {
  if (!status) return undefined;

  return STATUS_COLOR_MAP[status];
};

export function Event({
  event,
  currentlySelectedEventId,
  eventDuration,
  onEventClick,
  isHovered = false,
}: EventProps) {
  const selected = currentlySelectedEventId === event.id;
  const { options } = event;

  // Use custom color if provided, otherwise derive from status
  const colorClass = !options?.color ? getStatusColorClass(options?.status) : undefined;

  const Component = onEventClick ? "button" : "div";

  const dayOfWeek = dayjs(event.start).day();
  const tooltipSide = dayOfWeek >= 1 && dayOfWeek <= 4 ? "right" : "left";

  const tooltipContent = (
    <div className="flex min-w-[200px] max-w-[300px] flex-col gap-1 py-1">
      <div className="flex items-start gap-2">
        {(options?.color || colorClass) && (
          <div
            className={classNames("mt-1 h-3 w-1 shrink-0 rounded-sm", colorClass)}
            style={options?.color ? { backgroundColor: options.color } : undefined}></div>
        )}
        <div className="flex-1">
          <div className="font-semibold leading-tight">{event.title}</div>
          {!event.options?.hideTime && (
            <div className="text-inverted-muted mt-1 text-xs">
              {dayjs(event.start).format("HH:mm")} - {dayjs(event.end).format("HH:mm")}
            </div>
          )}
          {event.description && (
            <div className="text-inverted-muted mt-1 text-xs leading-snug">{event.description}</div>
          )}
          {options?.status && options.status !== "ACCEPTED" && (
            <div className="text-inverted-muted mt-1 text-xs capitalize">
              {options.status.toLowerCase().replace("_", " ")}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const displayType = eventDuration < 40 ? "single-line" : eventDuration < 45 ? "multi-line" : "full";

  return (
    <Tooltip content={tooltipContent} className="max-w-none" side={tooltipSide}>
      <Component
        data-booking-calendar-event="true"
        onClick={() => onEventClick?.(event)}
        {...(options?.bookingUid ? { "data-booking-uid": options.bookingUid } : {})}
        className={classNames(
          eventClasses({
            status: options?.status,
            selected,
            borderOnly: options?.borderOnly ?? false,
          }),
          options?.className,
          (isHovered || selected) && "ring-brand-default shadow-lg ring-2 ring-offset-0"
        )}
        style={{
          transition: "all 100ms ease-out",
        }}>
        {(options?.color || colorClass) && (
          <div
            className={classNames("-ml-1.5 mr-1.5 h-full w-[3px] shrink-0", colorClass)}
            style={options?.color ? { backgroundColor: options.color } : undefined}></div>
        )}
        <div className={classNames("flex w-full", displayType !== "single-line" && "flex-col py-1")}>
          {displayType === "single-line" && (
            <div
              className={classNames(
                "flex w-full shrink-0 gap-2 overflow-hidden text-ellipsis whitespace-nowrap text-left leading-4",
                "items-center"
              )}>
              <span>{event.title}</span>
              {!event.options?.hideTime && (
                <p className="text-subtle mt-1 w-full whitespace-nowrap text-left text-[10px] leading-none">
                  {dayjs(event.start).format("HH:mm")} - {dayjs(event.end).format("HH:mm")}
                </p>
              )}
            </div>
          )}
          {displayType !== "single-line" && (
            <p className={classNames("shrink-0 whitespace-nowrap text-left leading-4")}>{event.title}</p>
          )}
          {displayType !== "single-line" && !event.options?.hideTime && (
            <p className="text-subtle mt-1 whitespace-nowrap text-left text-[10px] leading-none">
              {dayjs(event.start).format("HH:mm")} - {dayjs(event.end).format("HH:mm")}
            </p>
          )}
          {displayType === "full" && event.description && (
            <p className="text-subtle mt-1 text-left text-[10px] leading-none">{event.description}</p>
          )}
        </div>
      </Component>
    </Tooltip>
  );
}
