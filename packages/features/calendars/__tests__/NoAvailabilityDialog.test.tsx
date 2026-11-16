
import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";

import dayjs from "@calcom/dayjs";
import { PeriodType } from "@calcom/prisma/enums";

import NoAvailabilityDialog from "../components/NoAvailabilityDialog";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, vars?: { [key: string]: string | number }) => {
      if (key === "no_availability_in_month") return `No availability in ${vars?.month}`;
      if (key === "no_availability_rolling")
        return `Scheduling is only available up to ${vars?.days} in advance. Please check again soon.`;
      if (key === "no_availability_range_start")
        return `Bookings open on ${vars?.date}. Please check again soon.`;
      if (key === "no_availability_range")
        return `Scheduling ended on ${vars?.date}. Please check again soon.`;
      if (key === "close") return "Close";
      if (key === "view_next_month") return "View next month";
      if (key === "calendar_days") return "calendar days";
      if (key === "business_days") return "business days";
      return key;
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NoAvailabilityOverlay", () => {
  const defaultProps = {
    month: "March",
    nextMonthButton: vi.fn(),
    browsingDate: dayjs(),
    periodData: {
      periodType: PeriodType.UNLIMITED,
      periodDays: null,
      periodCountCalendarDays: true,
      periodStartDate: null,
      periodEndDate: null,
    },
  };

  test("Displays booking opening date when range starts after the next month", () => {
    const browsingDate = dayjs().startOf("month");
    const startDate = browsingDate.add(60, "days");
    const endDate = browsingDate.add(90, "days");

    render(
      <NoAvailabilityDialog
        {...defaultProps}
        browsingDate={browsingDate}
        periodData={{
          ...defaultProps.periodData,
          periodType: PeriodType.RANGE,
          periodStartDate: startDate.toDate(),
          periodEndDate: endDate.toDate(),
        }}
      />
    );

    expect(screen.getByRole("dialog")).toHaveTextContent(
      `Bookings open on ${startDate.format("MMMM D YYYY")}. Please check again soon.`
    );

    expect(screen.queryByTestId("view_next_month")).not.toBeInTheDocument();
    expect(screen.getByTestId("close_dialog_button")).toBeInTheDocument();
  });

  test("Displays rolling period description and close button when period ends before next month", () => {
    const periodDays = 5;

    render(
      <NoAvailabilityDialog
        {...defaultProps}
        browsingDate={dayjs().add(periodDays + 1, "day")}
        periodData={{
          ...defaultProps.periodData,
          periodType: PeriodType.ROLLING,
          periodDays,
        }}
      />
    );

    expect(screen.getByRole("dialog")).toHaveTextContent(
      `Scheduling is only available up to ${periodDays} calendar days in advance. Please check again soon.`
    );

    expect(screen.queryAllByTestId("view_next_month")).toHaveLength(0);
    expect(screen.getAllByTestId("close_dialog_button")).toHaveLength(1);
  });

  test("Displays range period description when range ends before the next month", () => {
    const startDate = dayjs().subtract(30, "days");
    const endDate = dayjs();

    render(
      <NoAvailabilityDialog
        {...defaultProps}
        browsingDate={dayjs().add(40, "days")}
        periodData={{
          ...defaultProps.periodData,
          periodType: PeriodType.RANGE,
          periodStartDate: startDate.toDate(),
          periodEndDate: endDate.toDate(),
        }}
      />
    );

    expect(screen.getByRole("dialog")).toHaveTextContent(
      `Scheduling ended on ${endDate.format("MMMM D YYYY")}. Please check again soon.`
    );

    expect(screen.queryAllByTestId("view_next_month")).toHaveLength(0);
    expect(screen.getAllByTestId("close_dialog_button")).toHaveLength(1);
  });

  test("Calls nextMonthButton when View next month is clicked", () => {
    render(<NoAvailabilityDialog {...defaultProps} />);

    const nextButton = screen.getByText("View next month");
    fireEvent.click(nextButton);

    expect(defaultProps.nextMonthButton).toHaveBeenCalled();
  });

  test("Displays View next month and close buttons without description for a rolling 32-day period", () => {
    render(
      <NoAvailabilityDialog
        {...defaultProps}
        browsingDate={dayjs()}
        periodData={{
          ...defaultProps.periodData,
          periodType: PeriodType.ROLLING,
          // 32 days means the next month should still have at least one available day.
          periodDays: 32,
        }}
      />
    );

    expect(screen.queryByTestId("dialog-subtitle")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("view_next_month")).toHaveLength(1);
    expect(screen.getAllByTestId("close_dialog_button")).toHaveLength(1);
  });

  test("Displays View next month and close buttons when the range includes the current date", () => {
    render(
      <NoAvailabilityDialog
        {...defaultProps}
        browsingDate={dayjs()}
        periodData={{
          ...defaultProps.periodData,
          periodType: PeriodType.RANGE,
          periodStartDate: dayjs().subtract(10, "days").toDate(),
          periodEndDate: dayjs().add(40, "days").toDate(),
        }}
      />
    );

    expect(screen.queryByTestId("dialog-subtitle")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("view_next_month")).toHaveLength(1);
    expect(screen.getAllByTestId("close_dialog_button")).toHaveLength(1);
  });
});
