import { fireEvent, render, screen } from "@testing-library/react";
import type { ButtonHTMLAttributes, ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookingUid } from "./BookingUid";

const copyToClipboard: ReturnType<typeof vi.fn> = vi.fn();
let isCopied = false;

vi.mock("@calcom/lib/hooks/useCopy", () => ({
  useCopy: () => ({ copyToClipboard, isCopied }),
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

vi.mock("@calcom/ui/components/button", () => ({
  Button: ({
    StartIcon,
    tooltip: _,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { StartIcon: string; tooltip: string }): ReactElement => (
    <button data-icon={StartIcon} {...props} />
  ),
}));

describe("BookingUid", () => {
  beforeEach(() => {
    copyToClipboard.mockClear();
    isCopied = false;
  });

  it("shows and copies the booking UID", () => {
    render(<BookingUid uid="booking-123" />);

    expect(screen.getByText("booking-123")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "copy_to_clipboard" }));

    expect(copyToClipboard).toHaveBeenCalledWith("booking-123");
  });

  it("shows copied feedback", () => {
    isCopied = true;

    render(<BookingUid uid="booking-123" />);

    const button = screen.getByRole("button", { name: "copied" });
    expect(button).toHaveAttribute("data-icon", "clipboard-check");
  });
});
