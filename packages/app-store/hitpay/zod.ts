import { eventTypeAppCardZod } from "@calcom/app-store/eventTypeAppCardZod";
import { z } from "zod";

export const PaypalPaymentOptions = [
  {
    label: "on_booking_option",
    value: "ON_BOOKING",
  },
];

type PaymentOption = (typeof PaypalPaymentOptions)[number]["value"];
const VALUES: [PaymentOption, ...PaymentOption[]] = [
  PaypalPaymentOptions[0].value,
  ...PaypalPaymentOptions.slice(1).map((option) => option.value),
];
export const paymentOptionEnum = z.enum(VALUES);

export const appDataSchema = eventTypeAppCardZod.merge(
  z.object({
    price: z.number(),
    currency: z.string(),
    paymentOption: z.string().optional(),
    enabled: z.boolean().optional(),
  })
);
export const appKeysSchema = z.object({});
