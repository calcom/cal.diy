import type { Payment } from "@calcom/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockStripe, mockPrisma, mockBookingRepo } = vi.hoisted(() => ({
  mockStripe: {
    customers: { retrieve: vi.fn() },
    paymentMethods: { retrieve: vi.fn() },
    paymentIntents: { create: vi.fn(), list: vi.fn() },
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
    mockStripe.paymentIntents.list.mockResolvedValue({ data: [] });
    mockStripe.paymentIntents.create.mockResolvedValue({ id: "pi_123", status: "succeeded" });
    mockPrisma.payment.update.mockResolvedValue({ ...payment, success: true });
  });

  it("charges the card with a key for the first attempt and tags the payment in metadata", async () => {
    const paymentService = BuildPaymentService(credentials);

    await paymentService.chargeCard(payment, 10);

    expect(mockStripe.paymentIntents.list).toHaveBeenCalledWith(
      { customer: "cus_123", limit: 100 },
      { stripeAccount: "acct_123" }
    );
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5000,
        currency: "usd",
        off_session: true,
        confirm: true,
        metadata: expect.objectContaining({ noShowFeePaymentId: 1 }),
      }),
      { stripeAccount: "acct_123", idempotencyKey: "no-show-fee-1-0" }
    );
  });

  it("uses a new key after a declined attempt and ignores other payments", async () => {
    mockStripe.paymentIntents.list.mockResolvedValue({
      data: [
        { id: "pi_declined", status: "requires_payment_method", metadata: { noShowFeePaymentId: "1" } },
        { id: "pi_other", status: "requires_payment_method", metadata: { noShowFeePaymentId: "2" } },
        { id: "pi_untagged", status: "succeeded", metadata: {} },
      ],
    });
    const paymentService = BuildPaymentService(credentials);

    await paymentService.chargeCard(payment, 10);

    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(expect.anything(), {
      stripeAccount: "acct_123",
      idempotencyKey: "no-show-fee-1-1",
    });
  });

  it("saves an earlier successful charge instead of charging the card again", async () => {
    const succeededPaymentIntent = {
      id: "pi_succeeded",
      status: "succeeded",
      metadata: { noShowFeePaymentId: "1" },
    };
    mockStripe.paymentIntents.list.mockResolvedValue({ data: [succeededPaymentIntent] });
    const paymentService = BuildPaymentService(credentials);

    await paymentService.chargeCard(payment, 10);

    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(mockPrisma.payment.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        success: true,
        data: expect.objectContaining({ paymentIntent: succeededPaymentIntent }),
      },
    });
  });

  it("does not charge while an earlier attempt is still processing", async () => {
    mockStripe.paymentIntents.list.mockResolvedValue({
      data: [{ id: "pi_processing", status: "processing", metadata: { noShowFeePaymentId: "1" } }],
    });
    const paymentService = BuildPaymentService(credentials);

    await expect(paymentService.chargeCard(payment, 10)).rejects.toThrow("could_not_charge_card");
    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
  });
});
