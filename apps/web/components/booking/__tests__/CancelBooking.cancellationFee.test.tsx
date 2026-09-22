import * as shouldChargeModule from "@calcom/features/bookings/lib/payment/shouldChargeNoShowCancellationFee";
import { cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import CancelBooking from "../CancelBooking";

// Mock the embed-iframe module to prevent it from scheduling timers/RAF that can cause
// teardown issues when jsdom environment is destroyed
vi.mock("@calcom/embed-core/embed-iframe", () => ({
  sdkActionManager: null,
}));

// Store original scrollIntoView to restore later
const originalScrollIntoView = Element.prototype.scrollIntoView;

beforeAll(() => {
  // jsdom doesn't implement scrollIntoView, so we need to mock it
  Element.prototype.scrollIntoView = vi.fn();
});

afterAll(() => {
  // Restore scrollIntoView to avoid polluting other tests in the same worker
  if (originalScrollIntoView) {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  } else {
    // If it was originally undefined, delete it
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  }
  // Clean up module mocks to avoid polluting other tests
  vi.unmock("@calcom/embed-core/embed-iframe");
});

afterEach(() => {
  cleanup();
});

vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    viewer: {
      bookings: {
        requestReschedule: {
          useMutation: () => ({
            mutate: vi.fn(),
            isLoading: false,
          }),
        },
      },
    },
  },
}));

vi.mock("next-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === "cancellation_fee_warning_cancel") {
        const opts = options as {
          time?: string;
          unit?: string;
          amount?: number;
          formatParams?: { amount?: { currency?: string } };
        };
        return `Cancelling within ${opts?.time} ${opts?.unit} will result in a ${opts?.amount} ${opts?.formatParams?.amount?.currency} cancellation fee being charged to your card.`;
      }
      return key;
    },
  }),
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === "cancel_booking_acknowledge_no_show_fee") {
        const opts = options as {
          timeValue?: number;
          timeUnit?: string;
          amount?: number;
          formatParams?: { amount?: { currency?: string } };
        };
        return `I acknowledge that cancelling within ${opts?.timeValue} ${opts?.timeUnit} will result in a ${opts?.amount} ${opts?.formatParams?.amount?.currency} cancellation fee being charged to my card.`;
      }
      return key;
    },
  }),
}));

vi.mock("@calcom/lib/hooks/useRefreshData", () => ({
  useRefreshData: () => vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    push: vi.fn(),
    query: {},
  }),
}));

vi.mock("@calcom/features/bookings/lib/payment/shouldChargeNoShowCancellationFee", () => ({
  shouldChargeNoShowCancellationFee: vi.fn(),
}));

const mockBookingWithCancellationFee = {
  uid: "test-booking-uid",
  title: "Test Meeting",
  id: 123,
  startTime: new Date(Date.now() + 30 * 60 * 1000),
  payment: {
    amount: 1000,
    currency: "usd",
    appId: "stripe",
  },
};

const mockEventTypeMetadataWithFee = {
  apps: {
    stripe: {
      autoChargeNoShowFeeIfCancelled: true,
      autoChargeNoShowFeeTimeValue: 1,
      autoChargeNoShowFeeTimeUnit: "hours" as const,
      paymentOption: "HOLD" as const,
    },
  },
};

const mockEventTypeMetadataWithoutFee = {
  apps: {
    stripe: {
      autoChargeNoShowFeeIfCancelled: true,
      autoChargeNoShowFeeTimeValue: 1,
      autoChargeNoShowFeeTimeUnit: "hours" as const,
      paymentOption: "HOLD" as const,
    },
  },
};

const mockProps = {
  recurringEvent: null,
  setIsCancellationMode: vi.fn(),
  theme: "light",
  allRemainingBookings: false,
  seatReferenceUid: undefined,
  currentUserEmail: "test@example.com",
  bookingCancelledEventProps: {
    booking: {},
    organizer: {
      name: "Test Organizer",
      email: "organizer@example.com",
      timeZone: "UTC",
    },
    eventType: {},
  },
  internalNotePresets: [],
  renderContext: "booking-single-view" as const,
};

const mockBookingWithoutCancellationFee = {
  uid: "test-booking-uid-2",
  title: "Test Meeting 2",
  id: 124,
  startTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
  payment: {
    amount: 1000,
    currency: "usd",
    appId: "stripe",
  },
};

describe("CancelBooking Cancellation Fee Warning", () => {
  it("should show cancellation fee warning when booking is within time threshold", () => {
    vi.mocked(shouldChargeModule.shouldChargeNoShowCancellationFee).mockReturnValue(true);

    render(
      <CancelBooking
        booking={mockBookingWithCancellationFee}
        profile={{ name: "Test User", slug: "test-user" }}
        team={null}
        isHost={false}
        eventTypeMetadata={mockEventTypeMetadataWithFee}
        {...mockProps}
      />
    );

    expect(
      screen.getByText(
        /I acknowledge that cancelling within 1 hours will result in a 10 usd cancellation fee/
      )
    ).toBeInTheDocument();
  });

  it("should not show cancellation fee warning when booking is outside time threshold", () => {
    vi.mocked(shouldChargeModule.shouldChargeNoShowCancellationFee).mockReturnValue(false);

    render(
      <CancelBooking
        booking={mockBookingWithoutCancellationFee}
        profile={{ name: "Test User", slug: "test-user" }}
        team={null}
        isHost={false}
        eventTypeMetadata={mockEventTypeMetadataWithoutFee}
        {...mockProps}
      />
    );

    expect(screen.queryByText(/I acknowledge that cancelling within/)).not.toBeInTheDocument();
  });

  it("should not show cancellation fee warning when user is host", () => {
    vi.mocked(shouldChargeModule.shouldChargeNoShowCancellationFee).mockReturnValue(false);

    render(
      <CancelBooking
        booking={mockBookingWithCancellationFee}
        profile={{ name: "Test User", slug: "test-user" }}
        team={null}
        isHost={true}
        eventTypeMetadata={mockEventTypeMetadataWithFee}
        {...mockProps}
      />
    );

    expect(screen.queryByText(/I acknowledge that cancelling within/)).not.toBeInTheDocument();
  });

  it("should not show cancellation fee warning when cancellation fee is disabled", () => {
    const eventTypeMetadataWithDisabledFee = {
      apps: {
        stripe: {
          autoChargeNoShowFeeIfCancelled: false,
          autoChargeNoShowFeeTimeValue: 1,
          autoChargeNoShowFeeTimeUnit: "hours" as const,
          paymentOption: "HOLD" as const,
        },
      },
    };

    vi.mocked(shouldChargeModule.shouldChargeNoShowCancellationFee).mockReturnValue(false);

    render(
      <CancelBooking
        booking={mockBookingWithCancellationFee}
        profile={{ name: "Test User", slug: "test-user" }}
        team={null}
        isHost={false}
        eventTypeMetadata={eventTypeMetadataWithDisabledFee}
        {...mockProps}
      />
    );

    expect(screen.queryByText(/I acknowledge that cancelling within/)).not.toBeInTheDocument();
  });

  it("should not show cancellation fee warning when payment option is not HOLD", () => {
    const eventTypeMetadataWithOnBookingPayment = {
      apps: {
        stripe: {
          autoChargeNoShowFeeIfCancelled: true,
          autoChargeNoShowFeeTimeValue: 1,
          autoChargeNoShowFeeTimeUnit: "hours" as const,
          paymentOption: "ON_BOOKING" as const,
        },
      },
    };

    vi.mocked(shouldChargeModule.shouldChargeNoShowCancellationFee).mockReturnValue(false);

    render(
      <CancelBooking
        booking={mockBookingWithCancellationFee}
        profile={{ name: "Test User", slug: "test-user" }}
        team={null}
        isHost={false}
        eventTypeMetadata={eventTypeMetadataWithOnBookingPayment}
        {...mockProps}
      />
    );

    expect(screen.queryByText(/I acknowledge that cancelling within/)).not.toBeInTheDocument();
  });

  it.each([
    ["jpy", 5000, "5000 jpy"],
    ["krw", 12000, "12000 krw"],
    ["vnd", 250000, "250000 vnd"],
  ])("should render a zero-decimal %s amount without dividing by 100", (currency, amount, expected) => {
    vi.mocked(shouldChargeModule.shouldChargeNoShowCancellationFee).mockReturnValue(true);

    render(
      <CancelBooking
        booking={{
          ...mockBookingWithCancellationFee,
          payment: { amount, currency, appId: "stripe" },
        }}
        profile={{ name: "Test User", slug: "test-user" }}
        team={null}
        isHost={false}
        eventTypeMetadata={mockEventTypeMetadataWithFee}
        {...mockProps}
      />
    );

    expect(screen.getByRole("checkbox")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${expected} cancellation fee`))).toBeInTheDocument();
  });

  it.each([
    ["usd", 1000, "10 usd"],
    ["eur", 2550, "25.5 eur"],
    ["gbp", 99, "0.99 gbp"],
  ])("should still divide a two-decimal %s amount by 100", (currency, amount, expected) => {
    vi.mocked(shouldChargeModule.shouldChargeNoShowCancellationFee).mockReturnValue(true);

    render(
      <CancelBooking
        booking={{
          ...mockBookingWithCancellationFee,
          payment: { amount, currency, appId: "stripe" },
        }}
        profile={{ name: "Test User", slug: "test-user" }}
        team={null}
        isHost={false}
        eventTypeMetadata={mockEventTypeMetadataWithFee}
        {...mockProps}
      />
    );

    expect(screen.getByText(new RegExp(`${expected} cancellation fee`))).toBeInTheDocument();
  });
});
