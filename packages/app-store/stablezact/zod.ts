import { eventTypeAppCardZod } from "@calcom/app-store/eventTypeAppCardZod";
import { z } from "zod";

// Supported blockchain networks
export const SUPPORTED_NETWORKS = [
  "ethereum",
  "bsc",
  "polygon",
  "arbitrum",
  "optimism",
  "avalanche",
  "celo",
  "base",
] as const;

export type SupportedNetwork = (typeof SUPPORTED_NETWORKS)[number];

// Supported cryptocurrencies
export const SUPPORTED_CURRENCIES = ["USDT", "USDC"] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

// Validate API credentials
export const appKeysSchema = z.object({
  public_key: z
    .string()
    .startsWith("pk_", "Public key must start with 'pk_'")
    .min(10, "Valid public key is required"),
  // Note: API URL is hardcoded in the Stablezact SDK/backend - users don't provide it
  // Note: Merchant wallet addresses are configured in the Stablezact merchant dashboard
  // and retrieved via the merchant's public key, not stored in Cal.com
});

export type AppKeysSchema = z.infer<typeof appKeysSchema>;

// Validate event type app settings
export const appDataSchema = eventTypeAppCardZod.merge(
  z.object({
    // Payment settings
    price: z.number().positive({ message: "Price must be greater than 0" }),
    currency: z.enum(SUPPORTED_CURRENCIES).default("USDT"),

    // Network selection
    preferredNetwork: z.enum(SUPPORTED_NETWORKS).default("ethereum"),

    // Allow users to choose network/currency at checkout
    allowNetworkSelection: z.boolean().default(true),
    allowCurrencySelection: z.boolean().default(true),

    // Payment option
    paymentOption: z.enum(["ON_BOOKING", "HOLD"]).default("ON_BOOKING"),

    // Enable/disable payment for this event
    enabled: z.boolean().default(false),

    // Fee configuration
    feeChargedTo: z.enum(["customer", "merchant"]).default("customer"),
    customFeePercentage: z.number().min(0).max(100).optional(),

    // Payment timeout (in minutes)
    paymentTimeout: z.number().int().positive().default(30),

    // Refund policy
    refundPolicy: z
      .object({
        refundDaysCount: z.number().int().positive().optional(),
        refundCountCalendarDays: z.boolean().default(true),
      })
      .optional(),

    // No-show fee automation
    autoChargeNoShowFeeIfCancelled: z.boolean().default(false),
    autoChargeNoShowFeeTimeValue: z.number().int().positive().optional(),
    autoChargeNoShowFeeTimeUnit: z.enum(["minutes", "hours", "days"]).optional(),

    // Metadata
    metadata: z.record(z.string()).optional(),
  })
);

export type AppDataSchema = z.infer<typeof appDataSchema>;

// Payment data stored with bookings
export const paymentDataSchema = z.object({
  paymentId: z.string(),
  transactionHash: z.string().optional(),
  network: z.enum(SUPPORTED_NETWORKS),
  currency: z.enum(SUPPORTED_CURRENCIES),
  amount: z.number().positive(),
  merchantWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  customerWallet: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  status: z.enum(["pending", "confirmed", "failed", "refunded"]),
  confirmations: z.number().int().nonnegative().default(0),
  blockNumber: z.number().int().positive().optional(),
  timestamp: z.string().datetime(),
});

export type PaymentDataSchema = z.infer<typeof paymentDataSchema>;
