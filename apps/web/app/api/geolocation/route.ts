import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

async function getHandler() {
  const headersList = await headers();
  const raw = headersList.get("cf-ipcountry") || headersList.get("x-vercel-ip-country") || "";
  // Headers should already be uppercase ISO 3166-1 alpha-2 codes, but
  // normalize defensively so consumers can do strict equality (e.g. "US").
  const country = raw.trim().toUpperCase() || "Unknown";

  const response = NextResponse.json({ country });
  // The response varies by request headers (cf-ipcountry / x-vercel-ip-country).
  // A shared CDN cache without a Vary key would serve one user's country to
  // every other user. The only consumer (apps/web/components/GTM.tsx) already
  // does its own 24h localStorage + react-query cache, so per-user browser
  // caching is enough.
  response.headers.set("Cache-Control", "private, max-age=3600");

  return response;
}

export const GET = defaultResponderForAppDir(getHandler);
