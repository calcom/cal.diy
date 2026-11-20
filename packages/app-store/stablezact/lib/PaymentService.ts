import process from "node:process";
import prisma from "@calcom/prisma";
import type { Booking, Payment, PaymentOption, Prisma } from "@calcom/prisma/client";
import type { IAbstractPaymentService } from "@calcom/types/PaymentService";
import axios, { type AxiosInstance } from "axios";
import { v4 as uuidv4 } from "uuid";
import type { AppKeysSchema } from "../zod";
import { appKeysSchema } from "../zod";

interface StablezactPaymentIntent {
  success: boolean;
  requestId: string;
  amount: number;
  payment: {
    id: string;
    amount: number;
    totalAmount: number;
    currency: string;
    network: string;
    status: "pending" | "confirmed" | "failed";
    expiresAt: string;
    paymentMethod: string;
    contractAddress?: string;
    merchantWallet?: string;
    stablezactWallet?: string;
    merchantPercentage?: number;
    stablezactPercentage?: number;
    chainId?: number;
    tokenAddress?: string;
    tokenDecimals?: number;
    [key: string]: unknown; // For additional fields
  };
}

interface StablezactPaymentDetails {
  paymentId: string;
  transactionHash?: string;
  status: "pending" | "confirmed" | "failed" | "refunded";
  network: string;
  currency: string;
  amount: number;
  confirmations: number;
  blockNumber?: number;
  customerWallet?: string;
  merchantWallet: string;
  timestamp: string;
}

export class PaymentService implements IAbstractPaymentService {
  private client: AxiosInstance;
  private credentials: AppKeysSchema | null;

  constructor(credentials: { key: Prisma.JsonValue }) {
    try {
      // Validate and parse credentials
      this.credentials = appKeysSchema.parse(credentials.key);

      // Initialize Stablezact API client
      // API URL is configured via environment variable - not user-provided
      const baseURL = process.env.STABLEZACT_API_URL || "https://hub.stablezact.com";
      const apiBaseURL = baseURL.endsWith("/api") ? baseURL : `${baseURL}/api`;

      this.client = axios.create({
        baseURL: apiBaseURL,
        headers: {
          "Content-Type": "application/json",
          "X-Public-Key": this.credentials.public_key,
        },
        timeout: 30000,
      });
    } catch (error) {
      console.error("[Stablezact] Invalid credentials:", error);
      this.credentials = null;
      // Don't throw - just set credentials to null so isSetupAlready() returns false
      // Throwing here breaks getConnectedApps() and causes the apps tab to hang
      this.client = axios.create({
        baseURL: process.env.STABLEZACT_API_URL || "https://hub.stablezact.com/api",
        timeout: 30000,
      });
    }
  }

  /**
   * Create a new payment intent
   */
  async create(
    payment: Pick<Prisma.PaymentUncheckedCreateInput, "amount" | "currency">,
    bookingId: Booking["id"],
    userId: Booking["userId"],
    username: string | null,
    bookerName: string | null,
    paymentOption: PaymentOption,
    bookerEmail: string,
    bookerPhoneNumber?: string | null,
    eventTitle?: string,
    bookingTitle?: string
  ): Promise<Payment> {
    if (!this.credentials) {
      throw new Error("Stablezact credentials not configured");
    }

    const paymentUid = uuidv4();

    try {
      console.log("[Stablezact PaymentService] Creating payment");

      // Create payment intent with Stablezact API
      // Note: Merchant wallet addresses are retrieved by the backend using the API key/secret
      const response = await this.client.post<StablezactPaymentIntent>("/payments/create", {
        amount: payment.amount / 100, // Convert cents to dollars
        currency: payment.currency || "USDT",
        network: "ethereum", // Default network, will be configurable per event type
        customerEmail: bookerEmail,
        metadata: {
          bookingId: bookingId.toString(),
          userId: userId?.toString() || "",
          username: username || "",
          bookerName: bookerName || "",
          bookerEmail,
          paymentUid,
          source: "calcom",
          eventTitle: eventTitle || "",
          bookingTitle: bookingTitle || "",
        },
        paymentOption: paymentOption === "HOLD" ? "authorize" : "capture",
        // CallbackUrl not used - frontend handles confirmation via confirm-payment API
        callbackUrl: "https://google.com",
      });

      const paymentIntent = response.data;

      // Calculate fee (1.5% of transaction)
      const feePercentage = 0.015;
      const fee = Math.round(payment.amount * feePercentage);

      // Store payment in database
      // Include public_key in data for frontend SDK initialization
      const storedPayment = await prisma.payment.create({
        data: {
          uid: paymentUid,
          appId: "stablezact",
          bookingId,
          amount: payment.amount,
          fee,
          currency: payment.currency || "USDT",
          success: false,
          refunded: false,
          data: {
            ...paymentIntent,
            credentials: {
              public_key: this.credentials.public_key,
            },
          } as unknown as Prisma.InputJsonObject,
          externalId: paymentIntent.payment.id,
          paymentOption: paymentOption || "ON_BOOKING",
        },
      });

      console.log("[Stablezact] Payment created successfully");

      return storedPayment;
    } catch (error) {
      const axiosError = error as { response?: { data?: { message?: string } }; message?: string };
      console.error("[Stablezact] Error creating payment:", axiosError.response?.data || axiosError.message);
      throw new Error(
        `Failed to create Stablezact payment: ${axiosError.response?.data?.message || axiosError.message}`
      );
    }
  }

  /**
   * Collect card/wallet for later charging (HOLD payments)
   */
  async collectCard(
    payment: Pick<Prisma.PaymentUncheckedCreateInput, "amount" | "currency">,
    bookingId: Booking["id"],
    paymentOption: PaymentOption,
    bookerEmail: string,
    bookerPhoneNumber?: string | null
  ): Promise<Payment> {
    if (paymentOption !== "HOLD") {
      throw new Error("collectCard requires HOLD payment option");
    }

    // For blockchain payments, collectCard and create are similar
    // The difference is in the backend handling (authorize vs capture)
    return this.create(
      payment,
      bookingId,
      null, // userId
      null, // username
      null, // bookerName
      paymentOption,
      bookerEmail,
      bookerPhoneNumber
    );
  }

  /**
   * Charge a previously authorized payment
   */
  async chargeCard(payment: Payment, _bookingId?: Booking["id"]): Promise<Payment> {
    if (!this.credentials) {
      throw new Error("Stablezact credentials not configured");
    }

    try {
      // Use externalId which stores the Stablezact payment ID from when payment was created
      const stablezactPaymentId = payment.externalId;
      if (!stablezactPaymentId) {
        throw new Error("Payment has no external ID - cannot capture");
      }

      // Capture the authorized payment
      const response = await this.client.post<StablezactPaymentDetails>(
        `/payments/${stablezactPaymentId}/capture`
      );

      const capturedPayment = response.data;

      // Update payment record
      const updatedPayment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          success: capturedPayment.status === "confirmed",
          data: capturedPayment as unknown as Prisma.InputJsonObject,
        },
      });

      console.log("[Stablezact] Payment captured successfully");

      return updatedPayment;
    } catch (error) {
      const axiosError = error as { response?: { data?: { message?: string } }; message?: string };
      console.error("[Stablezact] Error capturing payment:", axiosError.response?.data || axiosError.message);
      throw new Error(
        `Failed to capture payment: ${axiosError.response?.data?.message || axiosError.message}`
      );
    }
  }

  /**
   * Refund a payment
   */
  async refund(paymentId: Payment["id"]): Promise<Payment> {
    if (!this.credentials) {
      throw new Error("Stablezact credentials not configured");
    }

    try {
      // Get payment from database
      const payment = await this.getPayment(paymentId);

      if (!payment.success) {
        throw new Error("Cannot refund unsuccessful payment");
      }

      if (payment.refunded) {
        throw new Error("Payment already refunded");
      }

      // create() persists the Stablezact payment id in externalId; payment.data holds
      // the original intent (whose id is nested at data.payment.id, not data.paymentId).
      const stablezactPaymentId = payment.externalId;
      if (!stablezactPaymentId) {
        throw new Error("Payment has no external ID - cannot refund");
      }

      // Create refund via Stablezact API
      await this.client.post(`/payments/${stablezactPaymentId}/refund`, {
        amount: payment.amount / 100, // Convert cents to dollars
        reason: "Booking cancelled by merchant",
      });

      // Update payment record
      const refundedPayment = await prisma.payment.update({
        where: { id: payment.id },
        data: { refunded: true },
      });

      console.log("[Stablezact] Payment refunded successfully");

      return refundedPayment;
    } catch (error) {
      const axiosError = error as { response?: { data?: { message?: string } }; message?: string };
      console.error("[Stablezact] Error refunding payment:", axiosError.response?.data || axiosError.message);
      throw new Error(
        `Failed to refund payment: ${axiosError.response?.data?.message || axiosError.message}`
      );
    }
  }

  /**
   * Delete/cancel a payment
   */
  async deletePayment(paymentId: Payment["id"]): Promise<boolean> {
    if (!this.credentials) {
      return false;
    }

    try {
      const payment = await this.getPayment(paymentId);
      const stablezactPaymentId = payment.externalId;
      if (!stablezactPaymentId) {
        return false;
      }

      // Cancel payment with Stablezact API
      await this.client.post(`/payments/${stablezactPaymentId}/cancel`);

      // Delete from database
      await prisma.payment.delete({
        where: { id: payment.id },
      });

      console.log("[Stablezact] Payment deleted successfully");

      return true;
    } catch (error) {
      const axiosError = error as { response?: { data?: unknown }; message?: string };
      console.error("[Stablezact] Error deleting payment:", axiosError.response?.data || axiosError.message);
      return false;
    }
  }

  /**
   * Update payment details
   */
  async update(
    paymentId: Payment["id"],
    data: Partial<Prisma.PaymentUncheckedCreateInput>
  ): Promise<Payment> {
    const updatedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data,
    });

    return updatedPayment;
  }

  /**
   * Get payment by ID
   */
  async getPayment(paymentId: Payment["id"]): Promise<Payment> {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    return payment;
  }

  /**
   * After payment actions (send confirmations, etc.)
   */
  async afterPayment(
    _event: unknown,
    _booking: {
      user: { email: string | null; name: string | null; timeZone: string } | null;
      id: number;
      startTime: { toISOString: () => string };
      uid: string;
    },
    _paymentData: Payment,
    _eventTypeMetadata?: unknown
  ): Promise<void> {
    console.log("[Stablezact] After payment hook executed");

    // Additional actions can be added here:
    // - Send custom confirmation emails
    // - Update external systems
    // - Trigger webhooks
    // - Analytics tracking
  }

  /**
   * Check if credentials are configured
   */
  isSetupAlready(): boolean {
    return !!this.credentials;
  }

  /**
   * Get payment status from Stablezact API
   */
  async getPaymentStatus(externalId: string): Promise<StablezactPaymentDetails> {
    if (!this.credentials) {
      throw new Error("Stablezact credentials not configured");
    }

    try {
      const response = await this.client.get<StablezactPaymentDetails>(`/payments/${externalId}`);
      return response.data;
    } catch (error) {
      const axiosError = error as { response?: { data?: { message?: string } }; message?: string };
      console.error(
        "[Stablezact] Error getting payment status:",
        axiosError.response?.data || axiosError.message
      );
      throw new Error(
        `Failed to get payment status: ${axiosError.response?.data?.message || axiosError.message}`
      );
    }
  }

  /**
   * Get payment paid status (for Cal.com integration)
   */
  async getPaymentPaidStatus(): Promise<string> {
    // This method can be implemented if needed for specific Cal.com flows
    // For now, return "paid" as status is tracked via webhooks
    return "paid";
  }

  /**
   * Get payment details (for Cal.com integration)
   */
  async getPaymentDetails(): Promise<Payment> {
    // This method can be implemented if needed for specific Cal.com flows
    // For now, throw an error as payment details are fetched via getPayment()
    throw new Error("Use getPayment() or getPaymentStatus() instead");
  }
}

// cal.com's handlePayment resolves payment apps via a `BuildPaymentService` export
// (isPaymentService check). Without it the payment step silently no-ops and the
// booking is confirmed unpaid. Factory export mirrors the other payment apps.
export function BuildPaymentService(credentials: { key: Prisma.JsonValue }): IAbstractPaymentService {
  return new PaymentService(credentials);
}

export default PaymentService;
