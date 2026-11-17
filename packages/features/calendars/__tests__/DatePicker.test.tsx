import { TooltipProvider } from "@radix-ui/react-tooltip";
import { render } from "@testing-library/react";
import React from "react";
import { vi } from "vitest";

import dayjs from "@calcom/dayjs";
import { BookerStoreProvider } from "@calcom/features/bookings/Booker/BookerStoreProvider";
import { PeriodType } from "@calcom/prisma/enums";

import { DatePicker } from "../components/DatePicker";

const noop = () => {
  /* noop */
};

describe("Tests for DatePicker Component", () => {
  test("Should render correctly with default date", async () => {
    const testDate = dayjs("2024-02-20");
    const { getByTestId } = render(
      <BookerStoreProvider>
        <TooltipProvider>
          <DatePicker
            onChange={noop}
            browsingDate={testDate}
            locale="en"
            periodData={{
              periodType: PeriodType.UNLIMITED,
              periodDays: null,
              periodCountCalendarDays: false,
              periodStartDate: null,
              periodEndDate: null,
            }}
          />
        </TooltipProvider>
      </BookerStoreProvider>
    );

    const selectedMonthLabel = getByTestId("selected-month-label");
    await expect(selectedMonthLabel).toHaveAttribute("dateTime", testDate.format("YYYY-MM"));
  });

  test("Should render with the minimum date if browsingDate < minDate", async () => {
    const testDate = dayjs("2024-02-20");
    const minDate = dayjs("2025-02-10");
    const { getByTestId } = render(
      <BookerStoreProvider>
        <TooltipProvider>
          <DatePicker onChange={noop} browsingDate={testDate} minDate={minDate.toDate()} locale="en" />
        </TooltipProvider>
      </BookerStoreProvider>
    );

    const selectedMonthLabel = getByTestId("selected-month-label");
    await expect(selectedMonthLabel).toHaveAttribute("dateTime", minDate.format("YYYY-MM"));
  });

  test("Should render with the browsingDate date if browsingDate >= minDate", async () => {
    const testDate = dayjs("2025-03-20");
    const minDate = dayjs("2025-02-10");
    const { getByTestId } = render(
      <BookerStoreProvider>
        <TooltipProvider>
          <DatePicker onChange={noop} browsingDate={testDate} minDate={minDate.toDate()} locale="en" />
        </TooltipProvider>
      </BookerStoreProvider>
    );

    const selectedMonthLabel = getByTestId("selected-month-label");
    await expect(selectedMonthLabel).toHaveAttribute("dateTime", testDate.format("YYYY-MM"));
  });

  describe("End-of-Month UI Improvements", () => {
    const createMockSlots = (dates: string[]) => {
      const slots: Record<string, { time: string; userIds?: number[] }[]> = {};
      dates.forEach((date) => {
        slots[date] = [{ time: `${date}T10:00:00` }];
      });
      return slots;
    };

    test("Should show traditional calendar view before second week of month", async () => {
      // Set test date to early in month (January 10th, 2024)
      const earlyMonthDate = dayjs("2024-01-10");

      // Mock current date to also be early in month so isSecondWeekOver is false
      vi.useFakeTimers();
      vi.setSystemTime(earlyMonthDate.toDate());

      const slots = createMockSlots([
        "2024-01-15", // Available date in current month
        "2024-01-20",
      ]);

      const { getAllByTestId } = render(
        <BookerStoreProvider>
          <TooltipProvider>
            <DatePicker
              onChange={noop}
              browsingDate={earlyMonthDate}
              locale="en"
              slots={slots}
              isCompact={false}
              periodData={{
                periodType: PeriodType.UNLIMITED,
                periodDays: null,
                periodCountCalendarDays: false,
                periodStartDate: null,
                periodEndDate: null,
              }}
            />
          </TooltipProvider>
        </BookerStoreProvider>
      );

      const dayElements = getAllByTestId("day");

      // Should show full month starting from day 1
      const firstAvailableDay = dayElements.find((day) => day.textContent && day.textContent.trim() !== "");
      expect(firstAvailableDay?.textContent).toBe("1");

      vi.useRealTimers();
    });

    test("Should show end-of-month view after second week (monthly view)", async () => {
      // Mock current date to ensure we're after second week
      const mockDate = dayjs("2024-01-20");
      vi.useFakeTimers();
      vi.setSystemTime(mockDate.toDate());

      const lateMonthDate = dayjs("2024-01-20");

      const slots = createMockSlots([
        "2024-01-25", // Available in current month
        "2024-02-01", // Available in next month
        "2024-02-05",
      ]);

      const { getAllByTestId, queryByText } = render(
        <BookerStoreProvider>
          <TooltipProvider>
            <DatePicker
              onChange={noop}
              browsingDate={lateMonthDate}
              locale="en"
              slots={slots}
              isCompact={false}
              periodData={{
                periodType: PeriodType.UNLIMITED,
                periodDays: null,
                periodCountCalendarDays: false,
                periodStartDate: null,
                periodEndDate: null,
              }}
            />
          </TooltipProvider>
        </BookerStoreProvider>
      );

      const dayElements = getAllByTestId("day");

      const firstAvailableDay = dayElements.find((day) => day.textContent && day.textContent.trim() !== "");

      // Should show days from day 8 onwards of current month (the main change in end-of-month view)
      expect(firstAvailableDay?.textContent).toBe("8");

      // Should show next month days (February days when browsing January)
      // In end-of-month view, the first day of next month gets a month label
      const febLabel = queryByText("Feb");
      expect(febLabel).toBeTruthy();

      vi.useRealTimers();
    });

    test("Should preserve the full month and include next-month dates when compact=true", async () => {
      const lateMonthDate = dayjs("2024-01-20");

      vi.useFakeTimers();
      vi.setSystemTime(lateMonthDate.toDate());

      const slots = createMockSlots(["2024-01-25", "2024-02-01"]);

      const { getAllByTestId } = render(
        <BookerStoreProvider>
          <TooltipProvider>
            <DatePicker
              onChange={noop}
              browsingDate={lateMonthDate}
              locale="en"
              slots={slots}
              isCompact={true} // This should force traditional view
              periodData={{
                periodType: PeriodType.UNLIMITED,
                periodDays: null,
                periodCountCalendarDays: false,
                periodStartDate: null,
                periodEndDate: null,
              }}
            />
          </TooltipProvider>
        </BookerStoreProvider>
      );

      const dayElements = getAllByTestId("day");

      const firstDayOfMonth = dayElements.find((day) => day.textContent === "1");
      expect(firstDayOfMonth).toBeTruthy();
      expect(dayElements.slice(-3).map((day) => day.textContent?.trim())).toEqual(["1", "2", "3"]);
      vi.useRealTimers();
    });
  });
});
