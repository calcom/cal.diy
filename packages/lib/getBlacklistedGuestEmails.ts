import process from "node:process";

/**
 * `BLACKLISTED_GUEST_EMAILS` is a comma-separated list of emails that may not book or be added as guests.
 * Operators commonly write it with spaces or line breaks after the commas, and a bare `split(",")`
 * would then produce entries like `" b@example.com"` that never match anything, so the
 * blocklist silently stops working for every entry but the first.
 */
export const parseBlacklistedGuestEmails = (value: string | undefined | null): string[] => {
  if (!value) return [];
  return value
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
};

export const getBlacklistedGuestEmails = (): string[] =>
  parseBlacklistedGuestEmails(process.env.BLACKLISTED_GUEST_EMAILS);
