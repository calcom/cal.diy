/* eslint-disable playwright/missing-playwright-await */
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import type { Props as SelectProps } from "react-timezone-select";
import { vi } from "vitest";

import dayjs from "@calcom/dayjs";

import { TimezoneSelect } from "./TimezoneSelect";

const cityTimezonesMock = [
  { city: "Dawson City", timezone: "America/Dawson" },
  { city: "Honolulu", timezone: "Pacific/Honolulu" },
  { city: "Juneau", timezone: "America/Juneau" },
  { city: "Toronto", timezone: "America/Toronto" },
];

const runtimeMock = async (isPending: boolean) => {
  const updatedTrcp = {
    viewer: {
      timezones: {
        cityTimezones: {
          useQuery() {
            return {
              data: cityTimezonesMock,
              isPending,
            };
          },
        },
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockedLib = (await import("@calcom/trpc/react")) as any;
  mockedLib.trpc = updatedTrcp;
};

const formatOffset = (offset: string) =>
  offset.replace(/^([-+])(0)(\d):00$/, (_, sign, _zero, hour) => `${sign}${hour}:00`);
const formatTimeZoneWithOffset = (timeZone: string) =>
  `${timeZone} GMT ${formatOffset(dayjs.tz(undefined, timeZone).format("Z"))}`;

const timezoneMockValues = ["America/Dawson", "Pacific/Honolulu", "America/Juneau", "America/Toronto"];
const optionMockValues = timezoneMockValues.map(formatTimeZoneWithOffset);

const classNames = {
  singleValue: () => "test1",
  valueContainer: () => "test2",
  control: () => "test3",
  input: () => "test4",
  option: () => "test5",
  menuList: () => "test6",
  menu: () => "test7",
  multiValue: () => "test8",
};

const onChangeMock = vi.fn();

const renderSelect = (newProps: SelectProps & { variant?: "default" | "minimal" }) => {
  render(
    <form aria-label="test-form">
      <label htmlFor="test">Test</label>
      <TimezoneSelect {...newProps} inputId="test" />
    </form>
  );
};

const openMenu = async () => {
  await waitFor(async () => {
    const element = screen.getByLabelText("Test");
    element.focus();
    fireEvent.keyDown(element, { key: "ArrowDown", code: "ArrowDown" });
    screen.getByText(optionMockValues[0]);
  });
};

describe("Test TimezoneSelect", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  describe("Test TimezoneSelect with isPending = false", () => {
    beforeAll(async () => {
      // INFO: This needs to be here before the other calls to runtimeMock. For some reason,
      // when we moved this file from @calcom/ui, the imports started breaking, resulting in
      // errors of "Cannot set property 'trpc' of [object Module] which has only a getter"
      // TODO: Update this pattern to be more consistent. Using this direct mocking in the
      // functions below breaks some tests.
      vi.mock("@calcom/trpc/react", () => ({
        trpc: {
          viewer: {
            timezones: {
              cityTimezones: {
                useQuery() {
                  return {
                    data: cityTimezonesMock,
                    isPending: false,
                  };
                },
              },
            },
          },
        },
      }));
    });
    test("Should render with the correct CSS when provided with classNames prop", async () => {
      renderSelect({ value: timezoneMockValues[0], classNames });
      openMenu();

      const dawsonEl = screen.getByText(timezoneMockValues[0]);

      expect(dawsonEl).toBeInTheDocument();

      const singleValueEl = dawsonEl.parentElement;
      const valueContainerEl = singleValueEl?.parentElement;
      const controlEl = valueContainerEl?.parentElement;
      const inputEl = screen.getByRole("combobox", { hidden: true }).parentElement;
      const optionEl = screen.getByText(optionMockValues[0]).parentElement?.parentElement;
      const menuListEl = optionEl?.parentElement;
      const menuEl = menuListEl?.parentElement;

      expect(singleValueEl).toHaveClass(classNames.singleValue());
      expect(valueContainerEl).toHaveClass(classNames.valueContainer());
      expect(controlEl).toHaveClass(classNames.control());
      expect(inputEl).toHaveClass(classNames.input());
      expect(optionEl).toHaveClass(classNames.option());
      expect(menuListEl).toHaveClass(classNames.menuList());
      expect(menuEl).toHaveClass(classNames.menu());

      for (const mockText of optionMockValues) {
        expect(screen.getByText(mockText)).toBeInTheDocument();
      }
    });

    test("Should render with the correct CSS when provided with className prop", async () => {
      renderSelect({ value: timezoneMockValues[0], className: "test-css" });
      openMenu();
      const labelTest = screen.getByText("Test");
      const timezoneEl = labelTest.nextSibling;
      expect(timezoneEl).toHaveClass("test-css");
    });

    test("Should render with the correct CSS when isMulti is enabled", async () => {
      renderSelect({ value: timezoneMockValues[0], isMulti: true, classNames });
      openMenu();

      const dawsonEl = screen.getByText(timezoneMockValues[0]);
      const multiValueEl = dawsonEl.parentElement?.parentElement;
      expect(multiValueEl).toHaveClass(classNames.multiValue());

      const inputEl = screen.getByRole("combobox", { hidden: true }).parentElement;
      const menuIsOpenEl = inputEl?.parentElement?.nextSibling;
      expect(menuIsOpenEl).toHaveClass("[&>*:last-child]:rotate-180 [&>*:last-child]:transition-transform ");
    });

    test("Should render with the correct CSS when menu is open and onChange is called", async () => {
      renderSelect({ value: timezoneMockValues[0], onChange: onChangeMock });
      await waitFor(async () => {
        const element = screen.getByLabelText("Test");
        element.focus();
        fireEvent.keyDown(element, { key: "ArrowDown", code: "ArrowDown" });
        screen.getByText(optionMockValues[3]);

        const inputEl = screen.getByRole("combobox", { hidden: true }).parentElement;
        const menuIsOpenEl = inputEl?.parentElement?.nextSibling;
        expect(menuIsOpenEl).toHaveClass("rotate-180 transition-transform ");
        const opt = screen.getByText(optionMockValues[3]);
        fireEvent.click(opt);
        fireEvent.keyDown(element, { key: "ArrowDown", code: "ArrowDown" });
      });

      expect(onChangeMock).toBeCalled();
    });

    test("Should render with cursor-pointer by default on control and option", async () => {
      renderSelect({ value: timezoneMockValues[0] });
      openMenu();

      const dawsonEl = screen.getByText(timezoneMockValues[0]);
      const singleValueEl = dawsonEl.parentElement;
      const valueContainerEl = singleValueEl?.parentElement;
      const controlEl = valueContainerEl?.parentElement;
      const optionEl = screen.getByText(optionMockValues[0]).parentElement?.parentElement;

      expect(controlEl).toHaveClass("cursor-pointer");
      expect(optionEl).toHaveClass("cursor-pointer");
    });
  });

  describe("Test TimezoneSelect with isPending = true", () => {
    beforeAll(async () => {
      await runtimeMock(true);
    });
    test("Should have no options when isPending is true", async () => {
      renderSelect({ value: timezoneMockValues[0] });
      await waitFor(async () => {
        const element = screen.getByLabelText("Test");
        element.focus();
        fireEvent.keyDown(element, { key: "ArrowDown", code: "ArrowDown" });
      });

      for (const mockText of optionMockValues) {
        const optionEl = screen.queryByText(mockText);
        expect(optionEl).toBeNull();
      }
    });
  });
});
