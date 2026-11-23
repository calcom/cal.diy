import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, type Mock, vi } from "vitest";
import { SelectedCalendarsSettingsWebWrapper } from "./SelectedCalendarsSettingsWebWrapper";

const mockUseQuery: Mock = vi.fn();

vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    viewer: {
      calendars: {
        connectedCalendars: {
          useQuery: (...args: unknown[]) => mockUseQuery(...args),
        },
      },
    },
  },
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

vi.mock("@calcom/atoms/selected-calendars/SelectedCalendarsSettings", () => ({
  SelectedCalendarsSettings: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@calcom/web/modules/apps/components/AppListCardWebWrapper", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@calcom/web/modules/apps/components/CredentialActionsDropdown", () => ({
  default: () => null,
}));

vi.mock("@calcom/web/modules/calendars/components/AdditionalCalendarSelector", () => ({
  default: () => null,
}));

vi.mock("@calcom/web/modules/calendars/components/CalendarSwitch", () => ({
  CalendarSwitch: ({ title }: { title: string }) => <div>{title}</div>,
}));

const integration = { slug: "google-calendar", name: "Google Calendar", logo: "", description: "" };

const renderWithConnectedCalendars = (connectedCalendars: unknown[]): void => {
  mockUseQuery.mockReturnValue({ data: { connectedCalendars, destinationCalendar: null } });
  render(<SelectedCalendarsSettingsWebWrapper />);
};

describe("SelectedCalendarsSettingsWebWrapper", () => {
  it("explains that availability is hidden when a connected calendar can't be reached", () => {
    renderWithConnectedCalendars([
      { integration, credentialId: 1, error: { message: "Could not get connected calendars" } },
    ]);

    expect(screen.getByText("something_went_wrong")).toBeInTheDocument();
    expect(screen.getByText("calendar_error_availability_hidden")).toBeInTheDocument();
  });

  it("doesn't show the availability hint for a working calendar", () => {
    renderWithConnectedCalendars([
      {
        integration,
        credentialId: 1,
        calendars: [{ externalId: "primary", name: "Work", isSelected: true, credentialId: 1 }],
      },
    ]);

    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.queryByText("calendar_error_availability_hidden")).not.toBeInTheDocument();
  });
});
