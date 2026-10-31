import process from "node:process";
import { fetchWithTimeout } from "../fetchWithTimeout";
import { HttpError } from "../http-error";

export const INVALID_CLOUDFLARE_TOKEN_ERROR = "Invalid cloudflare token";

export async function checkCfTurnstileToken({ token, remoteIp }: { token?: string; remoteIp: string }) {
  const turnstileSecretId = process.env.CLOUDFLARE_TURNSTILE_SECRET;
  // This means the instance doesn't have turnstile enabled - we skip the check and just return success.
  // OR the instance is running in CI so we skip these checks also
  if (!turnstileSecretId || !!process.env.NEXT_PUBLIC_IS_E2E) {
    return {
      success: true,
    };
  }

  if (!token) {
    throw new HttpError({ statusCode: 401, message: "No cloudflare token - please try again" });
  }

  const form = new URLSearchParams();
  form.append("secret", turnstileSecretId);
  form.append("response", token);
  form.append("remoteip", remoteIp);

  const result = await fetchWithTimeout(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: form,
    },
    10000
  );

  const data = await result.json();

  if (!data.success) {
    throw new HttpError({ statusCode: 401, message: INVALID_CLOUDFLARE_TOKEN_ERROR });
  }

  return data;
}
