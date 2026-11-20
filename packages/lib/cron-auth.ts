/**
 * Cron route auth helpers. Fail closed when secrets are unset so template literals
 * like `Bearer ${undefined}` cannot be used as a valid credential.
 */
export function isAuthorizedCronBearer(
  authHeader: string | null,
  cronSecret: string | undefined = process.env.CRON_SECRET
): boolean {
  if (!cronSecret) {
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

export function isAuthorizedCronApiKey(
  apiKey: string | null | undefined,
  cronApiKey: string | undefined = process.env.CRON_API_KEY
): boolean {
  if (!cronApiKey || !apiKey) {
    return false;
  }

  return apiKey === cronApiKey;
}

export function isAuthorizedCronRequest(
  apiKey: string | null | undefined,
  cronApiKey: string | undefined = process.env.CRON_API_KEY,
  cronSecret: string | undefined = process.env.CRON_SECRET
): boolean {
  return (
    isAuthorizedCronApiKey(apiKey, cronApiKey) ||
    isAuthorizedCronBearer(apiKey, cronSecret)
  );
}
