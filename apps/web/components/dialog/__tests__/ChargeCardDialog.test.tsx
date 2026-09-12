import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChargeCardDialog } from "../ChargeCardDialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/bookings/upcoming",
}));

vi.mock("@calcom/lib/hooks/useCompatSearchParams", () => ({
  useCompatSearchParams: () => new URLSearchParams(),
}));

vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    useUtils: () => ({
      viewer: {
        bookings: {
          invalidate: vi.fn(),
        },
      },
    }),
  },
}));

// Echoes the interpolated amount so the assertion reads the exact number the
// dialog passed to i18next, rather than an Intl-formatted string.
vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === "charge_card_dialog_body") {
        const opts = options as {
          amount?: number;
          formatParams?: { amount?: { currency?: string } };
        };
        return `You are about to charge the attendee [${opts?.amount}] ${opts?.formatParams?.amount?.currency}.`;
      }
      return key;
    },
  }),
}));

const mockProps = {
  isOpenDialog: true,
  setIsOpenDialog: vi.fn(),
  bookingId: 123,
};

afterEach(() => {
  cleanup();
});

describe("ChargeCardDialog", () => {
  it("does not scale the amount for zero-decimal currencies", () => {
    // JPY is stored unscaled, so 5000 means ¥5000 and must not be presented as ¥50.
    render(<ChargeCardDialog {...mockProps} paymentAmount={5000} paymentCurrency="jpy" />);

    expect(screen.getByText(/about to charge the attendee \[5000\] jpy/)).toBeInTheDocument();
  });

  it("still scales the amount for two-decimal currencies", () => {
    render(<ChargeCardDialog {...mockProps} paymentAmount={5000} paymentCurrency="usd" />);

    expect(screen.getByText(/about to charge the attendee \[50\] usd/)).toBeInTheDocument();
  });
});
