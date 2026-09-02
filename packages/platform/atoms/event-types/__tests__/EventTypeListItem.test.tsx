import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { EventTypeListItem } from "../components/EventTypeListItem";
import type { AtomEventTypeListItem } from "../types";

// Mock auto-animate
vi.mock("@formkit/auto-animate/react", () => ({
  useAutoAnimate: () => [null],
}));

// Mock Next.js Link
vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

// Mock useLocale
vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, options?: { count?: number }) => {
      const count = options?.count ?? 0;

      switch (key) {
        case "minute_one_short":
          return `${count}m`;
        case "multiple_duration_timeUnit_short":
          return `${count}${options?.unit === "hour" ? "h" : "m"}`;
        case "minute_one":
          return "1 minute";
        case "minute_other":
          return `${count} minutes`;
        case "hour_one":
          return "1 hour";
        case "hour_other":
          return `${count} hours`;
        default:
          return key;
      }
    },
  }),
}));

// Mock toast
vi.mock("@calcom/ui/components/toast", () => ({
  showToast: vi.fn(),
}));

// Mock dialog components
vi.mock("@calcom/ui/components/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  ConfirmationDialogContent: ({
    children,
    onConfirm,
  }: {
    children: React.ReactNode;
    onConfirm: () => void;
  }) => (
    <div data-testid="confirmation-dialog">
      {children}
      <button onClick={onConfirm} data-testid="confirm-delete">
        Confirm
      </button>
    </div>
  ),
}));

describe("EventTypeListItem", () => {
  const mockEventType: AtomEventTypeListItem = {
    id: 1,
    title: "30 Min Meeting",
    slug: "30min",
    description: "Quick meeting",
    length: 30,
    locations: null,
    logo: "/test-logo.svg",
  };

  const mockDeleteFunction = vi.fn();

  const renderComponent = ({
    eventType = mockEventType,
    deleteFunction = mockDeleteFunction,
    isDeletable = true,
    getEventTypeUrl,
  }: {
    eventType?: typeof mockEventType;
    deleteFunction?: typeof mockDeleteFunction;
    isDeletable?: boolean;
    getEventTypeUrl?: (id: number) => string;
  } = {}) => {
    return render(
      <EventTypeListItem
        eventType={eventType}
        deleteFunction={deleteFunction}
        isDeletable={isDeletable}
        getEventTypeUrl={getEventTypeUrl}
      />
    );
  };

  it("should render event type details correctly", () => {
    renderComponent();

    expect(screen.getByText("30 Min Meeting")).toBeInTheDocument();
    expect(screen.getByText("Quick meeting")).toBeInTheDocument();
    expect(screen.getByText(/30m/)).toBeInTheDocument();
    expect(screen.getByLabelText("30 minutes")).toBeInTheDocument();
  });

  it("should render as link when getEventTypeUrl is provided", () => {
    const getEventTypeUrl = (id: number) => `/event-types/${id}`;
    renderComponent({ getEventTypeUrl });

    const link = screen.getByRole("link", { name: /30 Min Meeting/i });
    expect(link).toHaveAttribute("href", "/event-types/1");
  });

  it("should render without link when getEventTypeUrl is not provided", () => {
    renderComponent();

    const links = screen.queryAllByRole("link");
    expect(links.length).toBe(0);
  });

  it("should display event type without description when description is null", () => {
    renderComponent({
      eventType: { ...mockEventType, description: null },
    });

    expect(screen.getByText("30 Min Meeting")).toBeInTheDocument();
    expect(screen.queryByText("Quick meeting")).not.toBeInTheDocument();
    expect(screen.getByText(/30m/)).toBeInTheDocument();
  });

  it("should render dropdown menu trigger", () => {
    renderComponent();

    const dropdownTrigger = screen.getByTestId("event-type-options-1");
    expect(dropdownTrigger).toBeInTheDocument();
  });

  it("should render with unique data-testid based on event type ID", () => {
    const customEventType = {
      ...mockEventType,
      id: 999,
    };

    renderComponent({ eventType: customEventType });

    const dropdownTrigger = screen.getByTestId("event-type-options-999");
    expect(dropdownTrigger).toBeInTheDocument();
  });

  it("should display different event durations correctly", () => {
    const shortEvent = { ...mockEventType, length: 15 };
    const { rerender } = renderComponent({ eventType: shortEvent });

    expect(screen.getByText(/15m/)).toBeInTheDocument();

    const longEvent = { ...mockEventType, length: 120 };
    rerender(
      <EventTypeListItem eventType={longEvent} deleteFunction={mockDeleteFunction} isDeletable={true} />
    );

    expect(screen.getByText(/120m/)).toBeInTheDocument();
    expect(screen.getByLabelText("120 minutes")).toBeInTheDocument();
  });

  it("should render event type with long title without breaking layout", () => {
    const longTitleEvent = {
      ...mockEventType,
      title: "This is a very long event type title that should be truncated properly in the UI",
    };

    renderComponent({ eventType: longTitleEvent });

    expect(
      screen.getByText("This is a very long event type title that should be truncated properly in the UI")
    ).toBeInTheDocument();
    expect(screen.getByText("Quick meeting")).toBeInTheDocument();
  });

  it("should render with locations as null", () => {
    const eventType: AtomEventTypeListItem = {
      ...mockEventType,
      locations: null,
    };

    renderComponent({ eventType });
    expect(screen.getByText("30 Min Meeting")).toBeInTheDocument();
  });

  it("should render without logo", () => {
    const eventType: AtomEventTypeListItem = {
      ...mockEventType,
      logo: undefined,
    };

    renderComponent({ eventType });
    expect(screen.getByText("30 Min Meeting")).toBeInTheDocument();
  });

  it("should render with locations object", () => {
    const eventType: AtomEventTypeListItem = {
      ...mockEventType,
      locations: [{ type: "integrations:zoom" }],
      logo: "/app-store/zoomvideo/icon.svg",
    };

    renderComponent({ eventType });
    expect(screen.getByText("30 Min Meeting")).toBeInTheDocument();
  });
});
