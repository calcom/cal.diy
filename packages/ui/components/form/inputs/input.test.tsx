import { TooltipProvider } from "@radix-ui/react-tooltip";
import { render, fireEvent } from "@testing-library/react";
import { vi } from "vitest";

import { EmailField, TextAreaField, PasswordField, NumberInput, FilterSearchField } from "./Input";
import { InputField } from "./TextField";

const onChangeMock = vi.fn();

describe("Tests for InputField Component", () => {
  test("Should render correctly with label and placeholder", () => {
    const { getByLabelText, getByPlaceholderText } = render(
      <InputField name="testInput" label="Test Label" placeholder="Test Placeholder" />
    );

    expect(getByLabelText("Test Label")).toBeInTheDocument();
    expect(getByPlaceholderText("Test Placeholder")).toBeInTheDocument();
  });

  test("Should handle input correctly", () => {
    const { getByRole } = render(<InputField name="testInput" onChange={onChangeMock} />);
    const inputElement = getByRole("textbox") as HTMLInputElement;

    fireEvent.change(inputElement, { target: { value: "Hello" } });
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(inputElement.value).toBe("Hello");
  });

  it("should render with addOnLeading prop", () => {
    const { getByText } = render(<InputField addOnLeading={<span>Leading</span>} />);

    const addOnLeadingElement = getByText("Leading");
    expect(addOnLeadingElement).toBeInTheDocument();
  });

  it("should render with addOnSuffix prop", () => {
    const { getByText } = render(<InputField addOnSuffix={<span>Suffix</span>} />);

    const addOnSuffixElement = getByText("Suffix");
    expect(addOnSuffixElement).toBeInTheDocument();
  });

  it("should display both addOnLeading and addOnSuffix", () => {
    const { getByText } = render(
      <InputField addOnLeading={<span>Leading</span>} addOnSuffix={<span>Suffix</span>} />
    );

    const addOnLeadingElement = getByText("Leading");
    const addOnSuffixElement = getByText("Suffix");

    expect(addOnLeadingElement).toBeInTheDocument();
    expect(addOnSuffixElement).toBeInTheDocument();
  });

  it("Should display error message when error prop is provided", () => {
    const errorMessage = "This field is required";
    const { getByRole } = render(<InputField error={errorMessage} />);

    const errorElement = getByRole("textbox");
    expect(errorElement).toHaveAttribute("error", errorMessage);
  });
});

describe("Tests for PasswordField Component", () => {
  test("Should toggle password visibility correctly", () => {
    const { getByLabelText, getByText } = render(
      <TooltipProvider>
        <PasswordField name="password" />
      </TooltipProvider>
    );
    const passwordInput = getByLabelText("password") as HTMLInputElement;
    const toggleButton = getByText("show_password");

    expect(passwordInput.type).toBe("password");

    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe("text");

    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe("password");
  });
});

describe("Tests for EmailField Component", () => {
  test("Should render correctly with email-related attributes", () => {
    const { getByRole } = render(<EmailField name="email" />);
    const emailInput = getByRole("textbox");
    expect(emailInput).toHaveAttribute("type", "email");
    expect(emailInput).toHaveAttribute("autoCapitalize", "none");
    expect(emailInput).toHaveAttribute("autoComplete", "email");
    expect(emailInput).toHaveAttribute("autoCorrect", "off");
    expect(emailInput).toHaveAttribute("inputMode", "email");
  });
});

describe("Tests for TextAreaField Component", () => {
  test("Should render correctly with label and placeholder", () => {
    const { getByText, getByPlaceholderText, getByRole } = render(
      <TextAreaField name="testTextArea" label="Test Label" placeholder="Test Placeholder" />
    );

    expect(getByText("Test Label")).toBeInTheDocument();
    expect(getByPlaceholderText("Test Placeholder")).toBeInTheDocument();
    expect(getByRole("textbox")).toBeInTheDocument();
  });

  test("Should handle input correctly", () => {
    const { getByRole } = render(<TextAreaField name="testTextArea" onChange={onChangeMock} />);
    const textareaElement = getByRole("textbox") as HTMLInputElement;

    fireEvent.change(textareaElement, { target: { value: "Hello" } });
    expect(onChangeMock).toHaveBeenCalled();
    expect(textareaElement.value).toBe("Hello");
  });
});

describe("Tests for NumberInput Component", () => {
  test("Should render correctly with input type number", () => {
    const { getByRole } = render(<NumberInput name="numberInput" />);
    const numberInput = getByRole("spinbutton");

    expect(numberInput).toBeInTheDocument();
    expect(numberInput).toHaveAttribute("type", "number");
  });

  test("Should handle input correctly", () => {
    const { getByRole } = render(<NumberInput name="numberInput" onChange={onChangeMock} />);
    const numberInput = getByRole("spinbutton") as HTMLInputElement;

    fireEvent.change(numberInput, { target: { value: "42" } });
    expect(onChangeMock).toHaveBeenCalled();
    expect(numberInput.value).toBe("42");
  });
});

describe("Tests for FilterSearchField Component", () => {
  test("Should render correctly with Search icon and input", async () => {
    const { getByRole, findByTestId } = render(<FilterSearchField name="searchField" />);
    const searchInput = getByRole("textbox");
    const searchIcon = await findByTestId("search-icon");

    expect(searchInput).toBeInTheDocument();
    expect(searchIcon).toBeInTheDocument();
  });

  test("Should handle input correctly", () => {
    const { getByRole } = render(<FilterSearchField name="searchField" onChange={onChangeMock} />);
    const searchInput = getByRole("textbox") as HTMLInputElement;

    fireEvent.change(searchInput, { target: { value: "Test search" } });
    expect(onChangeMock).toHaveBeenCalled();
    expect(searchInput.value).toBe("Test search");
  });
});

describe("label association regressions (calcom/cal.diy#30390, #30391)", () => {
  test("InputField associates the label with a caller-provided id", () => {
    const { getByLabelText } = render(<InputField name="email" label="Email" id="signup-email" />);
    const input = getByLabelText("Email") as HTMLInputElement;
    expect(input.id).toBe("signup-email");
  });

  test("TextAreaField associates its label with the textarea", () => {
    const { getByLabelText } = render(<TextAreaField name="bio" label="About" />);
    expect(getByLabelText("About")).toBeInTheDocument();
  });

  test("TextAreaField associates the label with a caller-provided id", () => {
    const { getByLabelText } = render(<TextAreaField name="bio" label="About" id="about-bio" />);
    const textarea = getByLabelText("About") as HTMLTextAreaElement;
    expect(textarea.id).toBe("about-bio");
  });
});
