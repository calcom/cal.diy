import { fireEvent, render } from "@testing-library/react";
import { format } from "date-fns";
import { vi } from "vitest";
import DatePicker from "./DatePicker";

const onChangeMock = vi.fn();

describe("Tests for DatePicker Component", () => {
  const testDate = new Date("2024-02-20");

  test("Should render correctly with default date", () => {
    const testDate = new Date("2024-02-20");
    const { getByTestId } = render(<DatePicker date={testDate} />);

    const dateButton = getByTestId("pick-date");
    expect(dateButton).toHaveTextContent(format(testDate, "LLL dd, y"));
  });

  test("Should show placeholder when no date is provided", () => {
    const { getByTestId } = render(<DatePicker date={null as unknown as Date} />);

    const dateButton = getByTestId("pick-date");
    expect(dateButton).toHaveTextContent("Pick a date");
  });

  test("Should handle date selection correctly", async () => {
    const testDate = new Date("2024-02-20");
    const { getByTestId, getAllByRole } = render(<DatePicker date={testDate} onDatesChange={onChangeMock} />);

    const dateButton = getByTestId("pick-date");
    fireEvent.click(dateButton);
    const gridCells = getAllByRole("gridcell");
    const selectedDate = gridCells.find((cell) => {
      return cell.getAttribute("tabindex") === "0";
    });

    expect(selectedDate).toBeTruthy();
    await expect(selectedDate).not.toHaveClass("opacity-50");
  });
  test("Should respect minDate prop", async () => {
    const testDate = new Date("2024-02-20");
    const minDate = new Date("2024-02-19");
    const { getByTestId, getAllByRole } = render(
      <DatePicker date={testDate} minDate={minDate} onDatesChange={onChangeMock} />
    );

    const dateButton = getByTestId("pick-date");
    fireEvent.click(dateButton);

    const disabledDates = getAllByRole("gridcell").filter((cell) => cell.classList.contains("opacity-50"));
    expect(disabledDates.length).toBeGreaterThan(0);
    await expect(disabledDates[0]).toHaveAttribute("disabled");
  });

  test("Should respect disabled prop", () => {
    const { getByTestId } = render(<DatePicker date={testDate} disabled={true} />);

    const dateButton = getByTestId("pick-date");
    expect(dateButton.classList.toString()).toContain("disabled:cursor-not-allowed");
    expect(dateButton.classList.toString()).toContain("disabled:opacity-30");
  });

  test("Should disable the days after maxDate", () => {
    const { getByTestId, getAllByRole } = render(
      <DatePicker date={new Date(2024, 1, 10)} maxDate={new Date(2024, 1, 20)} />
    );
    fireEvent.click(getByTestId("pick-date"));

    const day21 = getAllByRole("gridcell").find((cell) => cell.textContent === "21");
    expect(day21).toHaveAttribute("disabled");
  });

  describe("withMonthYearSelect", () => {
    const minDate = new Date(1900, 0, 1);
    const maxDate = new Date(2026, 10, 9);

    test("Should list every year between minDate and maxDate", () => {
      const { getByTestId, getAllByRole } = render(
        <DatePicker date={new Date(2026, 10, 9)} minDate={minDate} maxDate={maxDate} withMonthYearSelect />
      );
      fireEvent.click(getByTestId("pick-date"));

      const [monthSelect, yearSelect] = getAllByRole("combobox") as HTMLSelectElement[];
      expect(monthSelect.options).toHaveLength(12);
      expect(yearSelect.options).toHaveLength(127);
      expect(yearSelect.value).toBe("2026");
    });

    test("Should jump to the chosen year", () => {
      const { getByTestId, getAllByRole } = render(
        <DatePicker
          date={new Date(2026, 10, 9)}
          minDate={minDate}
          maxDate={maxDate}
          onDatesChange={onChangeMock}
          withMonthYearSelect
        />
      );
      fireEvent.click(getByTestId("pick-date"));
      const yearSelect = getAllByRole("combobox")[1] as HTMLSelectElement;
      fireEvent.change(yearSelect, { target: { value: "1950" } });

      const day15 = getAllByRole("gridcell").find((cell) => cell.textContent === "15");
      if (!day15) throw new Error("day 15 not rendered");
      fireEvent.click(day15);
      expect(onChangeMock).toHaveBeenLastCalledWith(new Date(1950, 10, 15));
    });

    test("Should keep the arrows only when a bound is missing", () => {
      const { getByTestId, queryAllByRole } = render(
        <DatePicker date={new Date(2026, 10, 9)} minDate={minDate} withMonthYearSelect />
      );
      fireEvent.click(getByTestId("pick-date"));

      expect(queryAllByRole("combobox")).toHaveLength(0);
    });
  });
});
