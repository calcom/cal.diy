import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import DestinationCalendarSelector from "../components/DestinationCalendarSelector";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

vi.mock("@calcom/ui/components/form", async () => ({
  Select: (await import("react-select")).default,
}));

vi.mock("@calcom/ui/components/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

type QueryData = NonNullable<ComponentProps<typeof DestinationCalendarSelector>["calendarsQueryData"]>;

const calendar = {
  externalId: "owner@example.com",
  integration: "google_calendar",
  name: "Personal",
  email: "owner@example.com",
  readOnly: false,
};

const connectedCalendar: QueryData["connectedCalendars"][number] = {
  credentialId: 1,
  integration: {
    name: "Google Calendar",
    type: "google_calendar",
    description: "",
    variant: "calendar",
    slug: "google-calendar",
    categories: ["calendar"],
    logo: "",
    publisher: "",
    url: "",
    email: "",
  },
  primary: { ...calendar, name: "owner@example.com" },
  calendars: [calendar],
};

const renderSelector = (data: QueryData, value?: string) => {
  const onChange = vi.fn();
  const result = render(
    <DestinationCalendarSelector
      calendarsQueryData={data}
      value={value}
      onChange={onChange}
      hidePlaceholder
      hideAdvancedText
    />
  );
  return { ...result, onChange };
};

describe("DestinationCalendarSelector", () => {
  it.each([
    ["Google Calendar", "owner@example.com", "Personal (Google Calendar - owner@example.com)"],
    [undefined, "owner@example.com", "Personal (owner@example.com)"],
    ["Google Calendar", null, "Personal (Google Calendar)"],
    [undefined, null, "Personal"],
    [" ", " ", "Personal"],
  ])("formats the default with provider %s and account %s", (integrationTitle, primaryEmail, expected) => {
    const { container } = renderSelector({
      connectedCalendars: [connectedCalendar],
      destinationCalendar: { ...calendar, integrationTitle, primaryEmail },
    });

    expect(screen.getByText("default")).toBeInTheDocument();
    expect(container).toHaveTextContent(`default ${expected}`);
    expect(container.textContent).not.toMatch(/undefined|null|\(\)|\(\s*-|-\s*\)/);
  });

  it.each([
    ["Google Calendar", "owner@example.com", "(Google - owner@example.com)"],
    ["Google Calendar", undefined, "(Google)"],
    [" ", "owner@example.com", "(owner@example.com)"],
    [" ", undefined, ""],
  ])("formats selected and dropdown subtitles with provider %s and account %s", (name, account, subtitle) => {
    const data = {
      connectedCalendars: [
        {
          ...connectedCalendar,
          integration: { ...connectedCalendar.integration, name },
          primary: { ...calendar, name: account },
        },
      ],
      destinationCalendar: null,
    };
    const { container } = renderSelector(data, calendar.externalId);

    expect(container).toHaveTextContent(`Personal ${subtitle}`.trim());
    expect(container.textContent).not.toMatch(/undefined|null|\(\)|\(\s*-|-\s*\)/);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    expect(container.textContent).not.toMatch(/undefined|null|\(\)|\(\s*-|-\s*\)/);
    fireEvent.click(screen.getByRole("option", { name: "Personal" }));
    expect(container).toHaveTextContent(`Personal ${subtitle}`.trim());
  });

  it("omits missing primary account metadata from the dropdown group", () => {
    const { container } = renderSelector({
      connectedCalendars: [{ ...connectedCalendar, primary: null }],
      destinationCalendar: null,
    });

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/undefined|null|\(\)/);
  });

  it("keeps the Office 365 account email in the dropdown group", () => {
    renderSelector({
      connectedCalendars: [
        {
          ...connectedCalendar,
          integration: { ...connectedCalendar.integration, name: "Office 365 Calendar" },
          primary: { ...calendar, integration: "office365_calendar" },
        },
      ],
      destinationCalendar: null,
    });

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    expect(screen.getByText("Office 365 (owner@example.com)")).toBeInTheDocument();
  });

  it("filters read-only calendars and preserves colons in the selected external ID", () => {
    const externalId = "https://calendar.example.com:443/personal";
    const { onChange } = renderSelector({
      connectedCalendars: [
        {
          ...connectedCalendar,
          calendars: [
            { ...calendar, integration: "apple_calendar", externalId },
            { ...calendar, externalId: "readonly", name: "Read only", readOnly: true },
            { ...calendar, externalId: "unnamed", name: undefined },
          ],
        },
      ],
      destinationCalendar: null,
    });

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    expect(screen.queryByRole("option", { name: "Read only" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.getByRole("option", { name: "" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Personal" }));
    expect(onChange).toHaveBeenCalledWith({ integration: "apple_calendar", externalId });
  });
});
