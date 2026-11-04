import process from "node:process";

/**
 * Returns a normalized array of blacklisted guest email addresses from the BLACKLISTED_GUEST_EMAILS environment variable.
 * Whitespace around entries is trimmed, emails are lowercased, and empty entries are filtered out.
 */
export function getBlacklistedGuestEmails(): string[] {
  const envVal = process.env.BLACKLISTED_GUEST_EMAILS;
  if (!envVal) {
    return [];
  }

  return envVal
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

/**
 * Checks whether an email address is included in the blacklisted guest emails list.
 */
export function isGuestEmailBlacklisted(email: string): boolean {
  if (!email) {
    return false;
  }
  const blacklistedEmails = getBlacklistedGuestEmails();
  if (blacklistedEmails.length === 0) {
    return false;
  }

  return blacklistedEmails.includes(email.trim().toLowerCase());
}
