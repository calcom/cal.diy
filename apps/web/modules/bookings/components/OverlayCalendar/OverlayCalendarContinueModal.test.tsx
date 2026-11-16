import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverlayCalendarContinueModal } from "./OverlayCalendarContinueModal";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, options?: { appName?: string }) =>
      options?.appName ? `${key} ${options.appName}` : key,
  }),
}));

// The dialog itself depends on the app router, only its content matters here
vi.mock("@calcom/features/components/controlled-dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@calcom/ui/components/dialog", () => ({
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("OverlayCalendarContinueModal", () => {
  it("only offers the social logins that are available", () => {
    const onContinue = vi.fn();
    render(<OverlayCalendarContinueModal open onContinue={onContinue} socialLoginProviders={["google"]} />);

    expect(screen.getByTestId("overlay-calendar-continue-button")).toBeInTheDocument();
    expect(screen.queryByTestId("overlay-calendar-microsoft-button")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("overlay-calendar-google-button"));
    expect(onContinue).toHaveBeenCalledWith("google");
  });

  it("continues with the regular login when no social login is chosen", () => {
    const onContinue = vi.fn();
    render(
      <OverlayCalendarContinueModal
        open
        onContinue={onContinue}
        socialLoginProviders={["google", "azure-ad"]}
      />
    );

    expect(screen.getByTestId("overlay-calendar-microsoft-button")).toHaveTextContent(
      "continue_with Microsoft"
    );

    fireEvent.click(screen.getByTestId("overlay-calendar-continue-button"));
    expect(onContinue).toHaveBeenCalledWith();
  });
});
