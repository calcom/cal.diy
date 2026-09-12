import React from "react";
import { screen } from "@testing-library/react";
import { vi } from "vitest";

import { render } from "@calcom/features/bookings/Booker/__tests__/test-utils";

import { AvailableTimes } from "./AvailableTimes";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  m: { div: ({ children }: { children: React.ReactNode }) => <>{children}</> },
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, opts?: Record<string, string>) => {
      if (key === "book_time_slot") return `Book ${opts?.time}`;
      if (key === "time_slot_unavailable_label") return `${opts?.time}, unavailable`;
      return key;
    },
  }),
}));

vi.mock("@calcom/features/bookings/Booker/hooks/useBookerTime", () => ({
  useBookerTime: () => ({ timeFormat: "h:mma", timezone: "UTC" }),
}));

vi.mock("@calcom/features/bookings/lib/useCheckOverlapWithOverlay", () => ({
  useCheckOverlapWithOverlay: () => ({
    isOverlapping: false,
    overlappingTimeEnd: null,
    overlappingTimeStart: null,
  }),
}));

vi.mock("@calcom/app-store/_utils/payments/getPaymentAppData", () => ({
  getPaymentAppData: () => ({ price: 0 }),
}));

vi.mock("@calcom/features/bookings/Booker/utils/query-param", () => ({
  getQueryParam: () => null,
}));

vi.mock("@calcom/atoms/hooks/useIsPlatform", () => ({
  useIsPlatform: () => false,
}));

vi.mock("@calcom/lib/webstorage", () => ({
  localStorage: { getItem: () => null },
}));

const mockEvent = {
  data: {
    length: 30,
    bookingFields: [],
    price: 0,
    currency: "USD",
    metadata: {},
  },
};

const mockSlot = {
  time: "2026-04-07T13:30:00.000Z",
  attendees: 0,
  bookingUid: undefined,
  away: false as const,
};

describe("AvailableTimes", () => {
  it("renders time slot button with Book aria-label for an available slot", () => {
    render(
      <AvailableTimes
        slots={[mockSlot]}
        event={mockEvent}
        unavailableTimeSlots={[]}
        skipConfirmStep={false}
      />
    );

    expect(screen.getByRole("button", { name: /^Book /i })).toBeInTheDocument();
  });

  it("renders time slot button with unavailable aria-label when slot is in unavailableTimeSlots", () => {
    render(
      <AvailableTimes
        slots={[mockSlot]}
        event={mockEvent}
        unavailableTimeSlots={[mockSlot.time]}
        skipConfirmStep={false}
      />
    );

    expect(screen.getByRole("button", { name: /, unavailable$/i })).toBeInTheDocument();
  });
});
