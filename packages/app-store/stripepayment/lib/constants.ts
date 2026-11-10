export const PREMIUM_MONTHLY_PLAN_PRICE = process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PLAN_PRICE_MONTHLY || "";

export const paymentOptions = [
  {
    label: "on_booking_option",
    value: "ON_BOOKING",
  },
  {
    label: "hold_option",
    value: "HOLD",
  },
];
