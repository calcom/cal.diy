import { z } from "zod";

import { RefundPolicy } from "@calcom/lib/payment/types";

import { eventTypeAppCardZod } from "../eventTypeAppCardZod";
import { paymentOptions } from "./lib/constants";

// Extract the payment options enum from paymentOptions
// https://stackoverflow.com/a/73825370
type PaymentOption = (typeof paymentOptions)[number]["value"];
const VALUES: [PaymentOption, ...PaymentOption[]] = [
  paymentOptions[0].value,
  ...paymentOptions.slice(1).map((option) => option.value),
];
export const paymentOptionEnum = z.enum(VALUES);

export const autoChargeNoShowFeeTimeUnitEnum = z.enum(["minutes", "hours", "days"]);

export const appDataSchema = eventTypeAppCardZod.merge(
  z.object({
    price: z.number(),
    currency: z.string(),
    paymentOption: paymentOptionEnum.optional(),
    enabled: z.boolean().optional(),
    refundPolicy: z.nativeEnum(RefundPolicy).optional(),
    refundDaysCount: z.number().optional(),
    refundCountCalendarDays: z.boolean().optional(),
    autoChargeNoShowFeeIfCancelled: z.boolean().optional(),
    autoChargeNoShowFeeTimeValue: z.number().optional(),
    autoChargeNoShowFeeTimeUnit: autoChargeNoShowFeeTimeUnitEnum.optional(),
  })
);

export const appKeysSchema = z.object({
  client_id: z.string().startsWith("ca_").min(1).optional(),
  client_secret: z.string().startsWith("sk_").min(1),
  public_key: z.string().startsWith("pk_").min(1),
  webhook_secret: z.string().startsWith("whsec_").min(1),
  direct_api_keys: z.boolean().optional(),
});
