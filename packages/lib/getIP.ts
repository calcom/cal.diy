import process from "node:process";
import type { NextApiRequest } from "next";
import z from "zod";
import logger from "./logger";

/**
 * Extracts the first IP address from a header value.
 *
 * Handles both string and array header values. When the value is an array
 * (as Node.js/Next.js may present multiple forwarded headers), it takes the
 * first element and then splits on comma to get the leftmost IP — the one
 * added by the most recent trusted proxy.
 *
 * @param value - The raw header value, either a plain string or an array of strings.
 * @returns The trimmed first IP address, or an empty string if the input is empty.
 */
export function parseIpFromHeaders(value: string | string[]) {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.split(",")[0]?.trim() ?? "";
}



/**
 * Tries to extract IP address from a request.
 *
 * Header priority (CF → Vercel setup):
 *  1. cf-connecting-ip  – set by Cloudflare with the real client IP
 *  2. true-client-ip    – set by Cloudflare (Enterprise / Managed Transforms)
 *  3. x-forwarded-for   – first IP is the real client; survives the CF → Vercel hop
 *  4. x-real-ip         – set by Vercel to the *connecting* IP (CF edge IP when
 *                         behind Cloudflare, so least reliable)
 *
 * @see https://github.com/vercel/examples/blob/main/edge-functions/ip-blocking/lib/get-ip.ts
 **/
export default function getIP(request: Request | NextApiRequest) {
  const headers: readonly string[] = ["cf-connecting-ip", "true-client-ip", "x-forwarded-for", "x-real-ip"];

  for (const header of headers) {
    const value = request instanceof Request ? request.headers.get(header) : request.headers[header];
    if (value) {
      return parseIpFromHeaders(value);
    }
  }

  return "127.0.0.1";
}

const banlistSchema = z.array(z.string());

export function isIpInBanlist(request: Request | NextApiRequest) {
  const IP = getIP(request);
  const rawBanListJson = process.env.IP_BANLIST || "[]";
  const banList = banlistSchema.parse(JSON.parse(rawBanListJson));
  if (banList.includes(IP)) {
    logger.warn(`Found banned IP: ${IP} in IP_BANLIST`);
    return true;
  }
  return false;
}

export function isIpInBanListString(identifer: string) {
  const rawBanListJson = process.env.IP_BANLIST || "[]";
  const banList = banlistSchema.parse(JSON.parse(rawBanListJson));
  if (banList.includes(identifer)) {
    logger.warn(`Found banned IP: ${identifer} in IP_BANLIST`);
    return true;
  }
  return false;
}