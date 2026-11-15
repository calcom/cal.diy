import type { TimeRange } from "@calcom/types/schedule";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { DayRanges, ScheduleComponent } from "./ScheduleComponent";

const mockMessages: Record<string, string> = {
  start_time: "Start time",
  start_time_of_day: "{{day}} start time",
  start_time_of_day_index: "{{day}} start time {{index}}",
  start_time_index: "Start time {{index}}",
  end_time: "End time",
  end_time_of_day: "{{day}} end time",
  end_time_of_day_index: "{{day}} end time {{index}}",
  end_time_index: "End time {{index}}",
  add_time_availability: "Add new time slot",
  add_time_slot_of_day: "Add time slot for {{day}}",
  copy_times_to_tooltip: "Copy times to …",
  copy_times_of_day_to: "Copy {{day}}'s times to…",
  remove_time_slot_of_day: "Remove time slot {{index}} for {{day}}",
  remove_time_slot_index: "Remove time slot {{index}}",
  delete: "Delete",
};

// The schedule UI reads its accessible names from the locale, so keep the test independent of i18n setup.
vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, options?: { day?: string; index?: number }) =>
      (mockMessages[key] ?? key)
        .replace("{{day}}", options?.day ?? "")
        .replace("{{index}}", String(options?.index ?? "")),
    i18n: { language: "en" },
    isLocaleReady: true,
  }),
}));

const singleRange: TimeRange[] = [
  {
    start: new Date("2024-01-15T09:00:00Z"),
    end: new Date("2024-01-15T17:00:00Z"),
  },
];

const twoRanges: TimeRange[] = [
  ...singleRange,
  {
    start: new Date("2024-01-15T18:00:00Z"),
    end: new Date("2024-01-15T20:00:00Z"),
  },
];

type FormValues = { schedule: TimeRange[][] };

const buildDefaultValues = (ranges: TimeRange[]): FormValues => ({
  // weekStart=0 means Monday is at index 1.
  schedule: [[], ranges, [], [], [], [], []],
});

const TestForm = ({ ranges }: { ranges: TimeRange[] }) => {
  const form = useForm<FormValues>({ defaultValues: buildDefaultValues(ranges) });

  return (
    <TooltipProvider>
      <FormProvider {...form}>
        <ScheduleComponent<FormValues, "schedule">
          name="schedule"
          control={form.control}
          userTimeFormat={12}
        />
      </FormProvider>
    </TooltipProvider>
  );
};

const TestDayRanges = ({ ranges }: { ranges: TimeRange[] }) => {
  const form = useForm<FormValues>({ defaultValues: buildDefaultValues(ranges) });

  return (
    <TooltipProvider>
      <FormProvider {...form}>
        <DayRanges<FormValues> name="schedule.1" userTimeFormat={12} />
      </FormProvider>
    </TooltipProvider>
  );
};

describe("ScheduleComponent accessible names", () => {
  it("labels a single range's time pickers with the day name", () => {
    render(<TestForm ranges={singleRange} />);

    expect(screen.getByRole("combobox", { name: "Monday start time" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Monday end time" })).toBeInTheDocument();
  });

  it("labels the icon buttons next to the time pickers", () => {
    render(<TestForm ranges={singleRange} />);

    expect(screen.getByRole("button", { name: "Add time slot for Monday" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Monday's times to…" })).toBeInTheDocument();
  });

  it("gives each range's time pickers a distinct name when a day has multiple ranges", () => {
    render(<TestForm ranges={twoRanges} />);

    expect(screen.getByRole("combobox", { name: "Monday start time 1" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Monday start time 2" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Monday end time 1" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Monday end time 2" })).toBeInTheDocument();
  });

  it("gives each range's remove button a distinct name", () => {
    render(<TestForm ranges={twoRanges} />);

    expect(screen.getByRole("button", { name: "Remove time slot 1 for Monday" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove time slot 2 for Monday" })).toBeInTheDocument();
  });

  it("falls back to day-agnostic names when no weekday is provided (date overrides)", () => {
    render(<TestDayRanges ranges={twoRanges} />);

    expect(screen.getByRole("combobox", { name: "Start time 1" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Start time 2" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "End time 1" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "End time 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add new time slot" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove time slot 1" })).toBeInTheDocument();
  });
});
