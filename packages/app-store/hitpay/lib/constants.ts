import process from "node:process";
export const API_HITPAY = process.env.NEXT_PUBLIC_API_HITPAY_PRODUCTION || "https://api.hit-pay.com";
export const SANDBOX_API_HITPAY =
  process.env.NEXT_PUBLIC_API_HITPAY_SANDBOX || "https://api.sandbox.hit-pay.com";
