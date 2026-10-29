import type { Payment } from "@calcom/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockStripe, mockPrisma, mockBookingRepo } = vi.hoisted(() => ({
  mockStripe: {
    customers: { retrieve: vi.fn() },
    paymentMethods: { retrieve: vi.fn() },
    paymentIntents: { create: vi.fn() },
  },
  mockPrisma: {
    payment: { update: vi.fn() },
  },
  mockBookingRepo: {
    findByIdIncludeUserAndAttendees: vi.fn(),
  },
}));

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(function () {
    return mockStripe;
  }),
}));

vi.mock("@calcom/prisma", () => ({
  default: mockPrisma,
  prisma: mockPrisma,
}));

vi.mock("@calcom/features/bookings/repositories/BookingRepository", () => ({
  BookingRepository: vi.fn().mockImplementation(function () {
    return mockBookingRepo;
  }),
}));

vi.mock("@calcom/features/tasker", () => ({
  default: {},
}));

import { BuildPaymentService } from "./PaymentService";

describe("StripePaymentService.chargeCard", () => {
  const credentials = {
    key: {
      stripe_user_id: "acct_123",
      default_currency: "usd",
      stripe_publishable_key: "pk_test_123",
    },
  };

  const payment = {
    id: 1,
    amount: 5000,
    currency: "usd",
    data: {
      setupIntent: { id: "seti_123", customer: "cus_123", payment_method: "pm_123" },
    },
  } as unknown as Payment;

  beforeEach(() => {
    vi.clearAllMocks();

    mockBookingRepo.findByIdIncludeUserAndAttendees.mockResolvedValue({
      id: 10,
      title: "Test booking",
      user: { id: 1, username: "organizer" },
      eventType: { title: "Test event" },
      attendees: [{ name: "Attendee", email: "attendee@example.com", phoneNumber: null }],
    });
    mockStripe.customers.retrieve.mockResolvedValue({ id: "cus_123" });
    mockStripe.paymentMethods.retrieve.mockResolvedValue({ id: "pm_123" });
    mockStripe.paymentIntents.create.mockResolvedValue({ id: "pi_123", status: "succeeded" });
    mockPrisma.payment.update.mockResolvedValue({ ...payment, success: true });
  });

  it("sends an idempotency key tied to the payment when charging the card", async () => {
    const paymentService = BuildPaymentService(credentials);

    await paymentService.chargeCard(payment, 10);

    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000, currency: "usd", off_session: true, confirm: true }),
      { stripeAccount: "acct_123", idempotencyKey: "no-show-fee-1" }
    );
  });
});
