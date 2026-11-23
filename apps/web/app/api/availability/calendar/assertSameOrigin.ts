import { WEBAPP_URL } from "@calcom/lib/constants";
import { HttpError } from "@calcom/lib/http-error";

/**
 * Production session cookies are SameSite=none (needed for embeds), so a
 * logged-in browser will attach them to cross-site requests. `req.json()`
 * happily parses text/plain bodies, which lets a cross-origin `fetch` with
 * mode: "no-cors" reach these handlers without a CORS preflight. Reject
 * cross-origin mutations (CSRF); non-browser clients send no Origin header.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) {
    return;
  }

  if (origin !== new URL(WEBAPP_URL).origin) {
    throw new HttpError({ statusCode: 403, message: "Cross-origin request rejected" });
  }
}
