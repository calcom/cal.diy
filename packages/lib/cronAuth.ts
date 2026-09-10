import type { NextRequest } from "next/server";

/**
 * Returns true when the incoming cron request carries a recognised credential.
 *
 * Accepts either:
 *  • A plain `CRON_API_KEY` query-param / Authorization header value, or
 *  • A `Bearer <CRON_SECRET>` Authorization header.
 *
 * If the environment variable is undefined the corresponding key is excluded
 * from the allow-list so that `Bearer undefined` can never match.
 */
export function isValidCronRequest(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const queryApiKey = req.nextUrl.searchParams.get("apiKey");

  if (authHeader) {
    if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) return true;
    if (process.env.CRON_API_KEY && authHeader === process.env.CRON_API_KEY) return true;
  }

  if (queryApiKey && process.env.CRON_API_KEY && queryApiKey === process.env.CRON_API_KEY) return true;

  return false;
}
