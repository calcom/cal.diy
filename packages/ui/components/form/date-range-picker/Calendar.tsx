"use client";

import dayjs from "@calcom/dayjs";
import cn from "@calcom/ui/classNames";
import { ChevronLeftIcon, ChevronRightIcon } from "@coss/ui/icons";
import { format } from "date-fns";
import type * as React from "react";
import { DayPicker } from "react-day-picker";
import { buttonClasses } from "../../button/Button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  fromDate,
  toDate,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      fromDate={fromDate}
      toDate={toDate || undefined}
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row stack-y-4 sm:space-x-4 sm:stack-y-0",
        month: "stack-y-4",
        caption: "flex pt-1 relative items-center justify-between",
        caption_label: "text-sm font-medium",
        nav: "flex items-center",
        head: "",
        head_row: "flex w-full items-center justify-between",
        head_cell: "w-8 md:w-11 h-8 text-sm font-medium text-default text-center",
        nav_button: cn(buttonClasses({ color: "minimal", variant: "icon" })),
        table: "w-full border-collapse stack-y-1",
        row: "flex w-full mt-0.5 gap-0.5",
        cell: "w-8 h-8 md:h-11 md:w-11 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
        day: cn(
          buttonClasses({ color: "minimal" }),
          "w-8 h-8 md:h-11 md:w-11 p-0 text-sm font-medium aria-selected:opacity-100 inline-flex items-center justify-center"
        ),
        day_range_end: "hover:bg-inverted! text-inverted!",
        day_range_start: "hover:bg-inverted! text-inverted!",
        day_selected: "bg-inverted text-inverted",
        day_today: "",
        day_outside: "",
        day_disabled: "text-muted opacity-50",
        day_range_middle: "aria-selected:bg-emphasis aria-selected:text-emphasis",
        day_hidden: "invisible",
        ...classNames,
      }}
      labels={{
        labelDay: (day, activeModifiers) => {
          const base = format(day, "MMMM d, yyyy");
          if (activeModifiers?.disabled) {
            return `${base}, unavailable`;
          }
          return base;
        },
        labelWeekday: (day, options) => {
          return new Intl.DateTimeFormat(options?.locale?.code ?? "en", { weekday: "long" }).format(day);
        },
      }}
      components={{
        CaptionLabel: (capLabelProps) => (
          <div className="px-2">
            <span className="text-emphasis font-semibold leading-none">
              {dayjs(capLabelProps.displayMonth).format("MMMM")}{" "}
            </span>
            <span className="text-subtle font-medium leading-none">
              {dayjs(capLabelProps.displayMonth).format("YYYY")}
            </span>
          </div>
        ),
        IconLeft: () => <ChevronLeftIcon className="h-4 w-4 stroke-2" />,
        IconRight: () => <ChevronRightIcon className="h-4 w-4 stroke-2" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
