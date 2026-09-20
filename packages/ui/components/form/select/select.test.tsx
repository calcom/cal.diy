/* eslint-disable @typescript-eslint/no-explicit-any */

/* eslint-disable playwright/missing-playwright-await */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { Select, SelectField, SelectWithValidation } from "./Select";

const options = [
  { label: "Option 1", value: "option1" },
  { label: "Option 2", value: "option2" },
  { label: "Option 3", value: "option3" },
];

const onChangeMock = vi.fn();

const props: any = {
  name: "test",
  options: options,
  defaultValue: { label: "Option 3", value: "option3" },
  onChange: onChangeMock,
};

const classNames = {
  singleValue: () => "w-1",
  valueContainer: () => "w-2",
  control: () => "w-3",
  input: () => "w-4",
  option: () => "w-5",
  menuList: () => "w-6",
  menu: () => "w-7",
  multiValue: () => "w-8",
};

const renderSelectWithForm = (newProps?: any) => {
  render(
    <form aria-label="test-form">
      <label htmlFor="test">Test</label>
      <Select {...props} {...newProps} inputId="test" />
      <p>Click Outside</p>
    </form>
  );
};

const selectOption = async (optionText: string) => {
  const element = screen.getByLabelText("Test");
  element.focus();
  fireEvent.keyDown(element, { key: "ArrowDown", code: "ArrowDown" });
  screen.getByText(optionText);
  const option = screen.getByText(optionText);
  fireEvent.click(option);
};

describe("Tests for Select File", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Test Select Component", () => {
    describe("Tests the default Behavior of Select component", () => {
      beforeEach(() => {
        renderSelectWithForm();
      });

      test("Should render with the correct default value", async () => {
        expect(screen.getByText("Option 3")).toBeInTheDocument();
        expect(screen.getByRole("form")).toHaveFormValues({ test: "option3" });
      });

      test("Should select a correct option", async () => {
        await waitFor(async () => {
          await selectOption("Option 2");
        });

        expect(onChangeMock).toHaveBeenCalledWith(
          expect.objectContaining({
            label: "Option 2",
            value: "option2",
          }),
          expect.objectContaining({
            action: "select-option",
            name: "test",
            option: undefined,
          })
        );
        expect(screen.getByRole("form")).toHaveFormValues({ test: "option2" });
      });

      test("Should keep the default value after selections are shown and the user clicks outside the selection element", async () => {
        await waitFor(async () => {
          const element = screen.getByLabelText("Test");
          element.focus();
          fireEvent.keyDown(element, { key: "ArrowDown", code: "ArrowDown" });

          screen.getByText("Option 2");
          const outsideButton = screen.getByText("Click Outside");
          fireEvent.click(outsideButton);
        });

        expect(screen.getByRole("form")).toHaveFormValues({ test: "option3" });
      });

      test("Should keep the selected value after the user has selected an option and clicked out of the selection element", async () => {
        await waitFor(async () => {
          await selectOption("Option 2");
          const outsideButton = screen.getByText("Click Outside");
          fireEvent.click(outsideButton);
        });

        expect(screen.getByRole("form")).toHaveFormValues({ test: "option2" });
      });
    });

    describe("Tests the Select Component with isMulti", () => {
      test("Should have the right behavior when it has the prop isMulti", async () => {
        renderSelectWithForm({ isMulti: true });

        await waitFor(async () => {
          const optionText = options[1].label;
          const element = screen.getByLabelText("Test");
          element.focus();
          fireEvent.keyDown(element, { key: "ArrowDown", code: "ArrowDown" });
          const option = screen.getByText(optionText);
          fireEvent.click(option);
          fireEvent.keyDown(element, { key: "ArrowDown", code: "ArrowDown" });
        });

        const option2Selected = screen.getByLabelText("Remove Option 2");
        const option3Selected = screen.getAllByLabelText("Remove Option 3");

        expect(option2Selected).toBeInTheDocument();
        expect(option3Selected.length).toBeGreaterThan(0);

        fireEvent.click(option2Selected);

        expect(option2Selected).not.toBeInTheDocument();
      });
    });

    describe("Tests the classes and CSS of the Select component", () => {
      test("Should render classes correctly when isDisabled is true", async () => {
        renderSelectWithForm({ isDisabled: true });
        const singleValueEl = screen.getByText("Option 3");
        const valueContainerEl = singleValueEl.parentElement;
        const cotrolEl = valueContainerEl?.parentElement;

        expect(cotrolEl).toHaveClass("bg-subtle");
      });

      test("Should render classes correctly when classNames props is passed", async () => {
        renderSelectWithForm({ classNames });

        const singleValueEl = screen.getByText("Option 3");
        const valueContainerEl = singleValueEl.parentElement;
        const cotrolEl = valueContainerEl?.parentElement;
        const inputEl = screen.getByRole("combobox", { hidden: true }).parentElement;

        expect(singleValueEl).toHaveClass("w-1");
        expect(valueContainerEl).toHaveClass("w-2");
        expect(cotrolEl).toHaveClass("w-3");
        expect(inputEl).toHaveClass("w-4");

        await waitFor(async () => {
          const optionText = options[1].label;
          const element = screen.getByLabelText("Test");
          element.focus();
          fireEvent.keyDown(element, { key: "ArrowDown", code: "ArrowDown" });
          screen.getByText(optionText);
        });
        const optionEl = screen.getByText("Option 2").parentElement?.parentElement;
        const menuListEl = optionEl?.parentElement;
        const menuEl = menuListEl?.parentElement;

        expect(optionEl).toHaveClass("w-5");
        expect(menuListEl).toHaveClass("w-6");
        expect(menuEl).toHaveClass("w-7");
      });

      test("Should render classes correctly for multiValue when classNames and isMulti props are passed and menu is open", async () => {
        renderSelectWithForm({ classNames, isMulti: true });

        const singleValueEl = screen.getByText("Option 3");
        const multiValueEl = singleValueEl.parentElement;

        expect(singleValueEl).not.toHaveClass("w-1");
        expect(multiValueEl).toHaveClass("w-8");

        await waitFor(async () => {
          const optionText = options[1].label;
          const element = screen.getByLabelText("Test");
          element.focus();
          fireEvent.keyDown(element, { key: "ArrowDown", code: "ArrowDown" });
          const option = screen.getByText(optionText);
          fireEvent.click(option);
          fireEvent.keyDown(element, { key: "ArrowDown", code: "ArrowDown" });
        });

        const option2 = screen.getByText(options[1].label);
        const menuIsOpenEl = option2.parentElement?.parentElement?.nextSibling;
        expect(menuIsOpenEl).toHaveClass(
          "[&>*:last-child]:rotate-180 [&>*:last-child]:transition-transform "
        );
      });

      test("Should render classes correctly when focused, selected and menu is open", async () => {
        renderSelectWithForm();
        await waitFor(async () => {
          const optionText = options[1].label;
          const element = screen.getByLabelText("Test");
          element.focus();
          fireEvent.keyDown(element, { key: "ArrowDown", code: "ArrowDown" });
          const option = screen.getByText(optionText);
          option.focus();
        });
        const option1 = screen.getByText("Option 1");
        const option1Parent = option1.parentElement?.parentElement;
        const option3 = screen.getAllByText("Option 3");
        const option3Parent = option3[1].parentElement?.parentElement;
        const menuIsOpenEl = option3[0].parentElement?.nextSibling;

        expect(option1).toBeInTheDocument();
        expect(option1Parent).toHaveClass("bg-subtle");
        expect(option3[1]).toBeInTheDocument();
        expect(option3Parent).toHaveClass("bg-emphasis text-default");
        expect(menuIsOpenEl).toHaveClass("rotate-180 transition-transform");
      });
    });
  });

  describe("Tests for SelectField component", () => {
    const renderSelectField = (newProps?: any) => {
      render(
        <form aria-label="test-form">
          <SelectField {...{ ...props, ...newProps }} />
        </form>
      );
    };

    test("Should render name as fallback label", () => {
      renderSelectField();
      expect(screen.getByText(props.name)).toBeInTheDocument();
    });

    test("Should not render the label element when label not passed and name is undefined", () => {
      renderSelectField({ name: undefined });
      expect(screen.queryByRole("label")).not.toBeInTheDocument();
    });

    test("Should render with the default value and label", () => {
      renderSelectField({ label: "Test SelectField", name: "test" });

      expect(screen.getByText("Option 3")).toBeInTheDocument();
      expect(screen.getByRole("form")).toHaveFormValues({ test: "option3" });

      const labelElement = screen.getByText("Test SelectField");
      expect(labelElement).toBeInTheDocument();
    });
  });

  describe("Tests for SelectWithValidation component", () => {
    const handleSubmit = vi.fn((event) => {
      event.preventDefault();
    });

    const renderSelectWithValidation = (required: boolean) => {
      render(
        <form onSubmit={handleSubmit} aria-label="test-form">
          <label htmlFor="test">Test</label>
          <SelectWithValidation {...props} required={required} inputId="test" />
          <button type="submit">Submit</button>
        </form>
      );
    };

    test("Should render with the default value", () => {
      renderSelectWithValidation(true);

      expect(screen.getByText("Option 3")).toBeInTheDocument();
      expect(screen.getByRole("form")).toHaveFormValues({ test: "option3" });
    });

    test("Should render an input element with the value passed as prop", () => {
      renderSelectWithValidation(false);
      expect(screen.getAllByDisplayValue("option3")).toHaveLength(1);
    });

    test("Should submit the form with the selected value after validation", async () => {
      renderSelectWithValidation(true);

      await waitFor(async () => {
        await selectOption("Option 2");
        const submitButton = screen.getByRole("button", { name: "Submit" });
        fireEvent.click(submitButton);
      });

      expect(handleSubmit).toHaveBeenCalled();
    });

    test("Should fail to submit if nothing is selected", async () => {
      renderSelectWithValidation(true);

      const submitButton = screen.getByRole("button", { name: "Submit" });
      fireEvent.click(submitButton);

      expect(handleSubmit).not.toHaveBeenCalled();
    });

    test("Should focus the react-select component when the hidden input receives focus", async () => {
      renderSelectWithValidation(true);
      const hiddenInput = document.querySelector('input[required]') as HTMLInputElement;
      expect(hiddenInput).toBeInTheDocument();
      
      // Simulate browser focusing the hidden input due to validation failure
      fireEvent.focus(hiddenInput);
      
      // React Select uses a combobox role for its internal input
      const combobox = screen.getByRole("combobox");
      expect(combobox).toHaveFocus();
    });
  });
});
