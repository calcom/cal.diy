import process from "node:process";
import { HttpError } from "../http-error";

const TURNSTILE_SECRET_ID = process.env.CLOUDFLARE_TURNSTILE_SECRET;

export const INVALID_CLOUDFLARE_TOKEN_ERROR = "Invalid cloudflare token";

export async function checkCfTurnstileToken({ token, remoteIp }: { token?: string; remoteIp: string }) {
  // This means the instance doesn't have turnstile enabled - we skip the check and just return success.
  // OR the instance is running in CI so we skip these checks also
  if (!TURNSTILE_SECRET_ID || !!process.env.NEXT_PUBLIC_IS_E2E) {
    return {
      success: true,
    };
  }

  if (!token) {
    throw new HttpError({ statusCode: 401, message: "No cloudflare token - please try again" });
  }

  const form = new URLSearchParams();
  form.append("secret", TURNSTILE_SECRET_ID);
  form.append("response", token);
  form.append("remoteip", remoteIp);

  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });

  const data = await result.json();

  if (!data.success) {
    throw new HttpError({ statusCode: 401, message: INVALID_CLOUDFLARE_TOKEN_ERROR });
  }

  return data;
}
