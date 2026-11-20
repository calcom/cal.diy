/* eslint-disable playwright/missing-playwright-await */
import { Provider as TooltipProvider } from "@radix-ui/react-tooltip";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";

import { Button, buttonClasses } from "./Button";

const render = (ui: React.ReactElement, options = {}) => rtlRender(<TooltipProvider>{ui}</TooltipProvider>, options);

const observeMock = vi.fn();

window.ResizeObserver = vi.fn().mockImplementation(function () {
  return {
    disconnect: vi.fn(),
    observe: observeMock,
    unobserve: vi.fn(),
  };
});

vi.mock("../tooltip/Tooltip", async () => {
  const actual = (await vi.importActual("../tooltip/Tooltip")) as any;
  const TooltipMock = (props: any) => {
    return (
      <div data-testid="tooltip" data-state={props.open ? "open" : "closed"}>
        {props.children}
      </div>
    );
  };
  return {
    ...actual,
    Tooltip: TooltipMock,
  };
});

describe("Tests for Button component", () => {
  test("Should apply the icon variant class", () => {
    render(<Button variant="icon">Test Button</Button>);
    const buttonClass = screen.getByRole("button", { name: "Test Button" }).className;
    const buttonComponentClass = buttonClasses({ variant: "icon" });
    const buttonClassArray = buttonClass.split(" ");
    const hasMatchingClassNames = buttonComponentClass
      .split(" ")
      .some((className) => buttonClassArray.includes(className));
    expect(hasMatchingClassNames).toBe(true);
  });

  test("Should apply the fab variant class", () => {
    render(<Button variant="fab">Test Button</Button>);
    // The fab text is hidden on mobile but rendered in a hidden div
    expect(screen.getByText("Test Button")).toHaveClass("hidden md:inline-flex");
  });

  test("Should apply the secondary color class", () => {
    render(<Button color="secondary">Test Button</Button>);
    const buttonClass = screen.getByRole("button", { name: "Test Button" }).className;
    const buttonComponentClass = buttonClasses({ color: "secondary" });
    const buttonClassArray = buttonClass.split(" ");
    const hasMatchingClassNames = buttonComponentClass
      .split(" ")
      .some((className) => buttonClassArray.includes(className));
    expect(hasMatchingClassNames).toBe(true);
  });

  test("Should apply the minimal color class", () => {
    render(<Button color="minimal">Test Button</Button>);
    const buttonClass = screen.getByRole("button", { name: "Test Button" }).className;
    const buttonComponentClass = buttonClasses({ color: "minimal" });
    const buttonClassArray = buttonClass.split(" ");
    const hasMatchingClassNames = buttonComponentClass
      .split(" ")
      .some((className) => buttonClassArray.includes(className));
    expect(hasMatchingClassNames).toBe(true);
  });

  test("Should apply the sm size class", () => {
    render(<Button size="sm">Test Button</Button>);
    const buttonClass = screen.getByRole("button", { name: "Test Button" }).className;
    const buttonComponentClass = buttonClasses({ size: "sm" });
    const buttonClassArray = buttonClass.split(" ");
    const hasMatchingClassNames = buttonComponentClass
      .split(" ")
      .some((className) => buttonClassArray.includes(className));
    expect(hasMatchingClassNames).toBe(true);
  });

  test("Should apply the base size class", () => {
    render(<Button size="base">Test Button</Button>);
    const buttonClass = screen.getByRole("button", { name: "Test Button" }).className;
    const buttonComponentClass = buttonClasses({ size: "base" });
    const buttonClassArray = buttonClass.split(" ");
    const hasMatchingClassNames = buttonComponentClass
      .split(" ")
      .some((className) => buttonClassArray.includes(className));
    expect(hasMatchingClassNames).toBe(true);
  });

  test("Should apply the lg size class", () => {
    render(<Button size="lg">Test Button</Button>);
    const buttonClass = screen.getByRole("button", { name: "Test Button" }).className;
    const buttonComponentClass = buttonClasses({ size: "lg" });
    const buttonClassArray = buttonClass.split(" ");
    const hasMatchingClassNames = buttonComponentClass
      .split(" ")
      .some((className) => buttonClassArray.includes(className));
    expect(hasMatchingClassNames).toBe(true);
  });

  test("Should apply the loading class", () => {
    render(<Button loading>Test Button</Button>);
    // button might be disabled, so we can't search by name reliably if it alters accessibility tree, but getByRole works.
    const buttonClass = screen.getByRole("button").className;
    const buttonComponentClass = buttonClasses({ loading: true });
    const buttonClassArray = buttonClass.split(" ");
    const hasMatchingClassNames = buttonComponentClass
      .split(" ")
      .some((className) => buttonClassArray.includes(className));
    expect(hasMatchingClassNames).toBe(true);
  });

  test("Should apply the disabled class when disabled prop is true", () => {
    render(<Button disabled>Test Button</Button>);
    const buttonClass = screen.getByRole("button").className;
    const expectedClassName = "disabled:cursor-not-allowed";
    expect(buttonClass.includes(expectedClassName)).toBe(true);
  });

  test("Should apply the custom class", () => {
    const className = "custom-class";
    render(<Button className={className}>Test Button</Button>);
    expect(screen.getByRole("button", { name: "Test Button" })).toHaveClass(className);
  });

  test("Should render as a button by default", () => {
    render(<Button>Test Button</Button>);
    const button = screen.getByRole("button", { name: "Test Button" });
    expect(button.tagName).toBe("BUTTON");
  });

  test("Should render StartIcon and Plus icon if is fab variant", async () => {
    render(
      <Button variant="fab" StartIcon="plus" data-testid="start-icon">
        Test Button
      </Button>
    );
    // Fab has inner SVGs
    expect(await screen.findByTestId("start-icon")).toBeInTheDocument();
    expect(await screen.findByTestId("plus")).toBeInTheDocument();
  });

  test("Should render just StartIcon if is not fab variant", async () => {
    render(
      <Button StartIcon="plus" data-testid="start-icon">
        Test Button
      </Button>
    );
    expect(await screen.findByTestId("start-icon")).toBeInTheDocument();
    expect(screen.queryByTestId("plus")).not.toBeInTheDocument();
  });

  test("Should render EndIcon and Plus icon if is fab variant", async () => {
    render(
      <Button variant="fab" EndIcon="plus" data-testid="end-icon">
        Test Button
      </Button>
    );
    expect(await screen.findByTestId("end-icon")).toBeInTheDocument();
    expect(await screen.findByTestId("plus")).toBeInTheDocument();
  });

  test("Should render just EndIcon if is not fab variant", async () => {
    render(
      <Button EndIcon="plus" data-testid="end-icon">
        Test Button
      </Button>
    );
    expect(await screen.findByTestId("end-icon")).toBeInTheDocument();
    expect(screen.queryByTestId("plus")).not.toBeInTheDocument();
  });
});

describe("Test for button as a link", () => {
  test("Should render Link if have href", () => {
    render(<Button href="/test">Test Button</Button>);
    const linkElement = screen.getByRole("link", { name: "Test Button" });
    expect(linkElement).toHaveAttribute("href", "/test");
    expect(linkElement.closest("a")).toBeInTheDocument();
  });

  test("Should render Wrapper if don't have href", () => {
    render(<Button>Test Button</Button>);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test Button" })).toBeInTheDocument();
  });

  test("Should render Tooltip if exists", () => {
    render(<Button tooltip="Hi, Im a tooltip">Test Button</Button>);
    const tooltip = screen.getByTestId("tooltip");
    expect(tooltip.getAttribute("data-state")).toEqual("closed");
  });

  test("Should not render Tooltip if no exists", () => {
    render(<Button>Test Button</Button>);
    expect(screen.queryByTestId("tooltip")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test Button" })).toBeInTheDocument();
  });

  test("Should render as a button with a custom type", () => {
    render(<Button type="submit">Test Button</Button>);
    const button = screen.getByRole("button", { name: "Test Button" });
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "submit");
  });

  test("Should render as an anchor when href prop is provided", () => {
    render(<Button href="/path">Test Button</Button>);
    const button = screen.getByRole("link", { name: "Test Button" });
    expect(button.tagName).toBe("A");
    expect(button).toHaveAttribute("href", "/path");
  });

  test("Should call onClick callback when clicked", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Test Button</Button>);
    const button = screen.getByRole("button", { name: "Test Button" });
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  test("Should render default button correctly", () => {
    render(<Button loading={false}>Default Button</Button>);
    const button = screen.getByRole("button", { name: "Default Button" });
    // Verify it applies the default primary colors instead of strict class matching 
    // which might fail due to tailwind-merge deduplication
    expect(button).toHaveClass("bg-brand-default", "text-brand");
    expect(button).toHaveAttribute("type", "button");
  });
});
