/** Everyone who must receive an invite for every team booking. */
export const DEFAULT_INVITE_RECIPIENTS = ["xoe@zannyworld.org", "zantavius@zannyworld.org"] as const;

/** Case-insensitive de-duplication that keeps the first spelling seen. */
export function uniqueEmails(emails: (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const email = raw?.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

/**
 * XOE_EMAIL / Z_EMAIL can override the defaults (e.g. for staging), and
 * INVITE_EMAILS can add extra comma-separated addresses.
 */
export function inviteRecipients(env: Record<string, string | undefined>): string[] {
  return uniqueEmails([
    env.XOE_EMAIL || DEFAULT_INVITE_RECIPIENTS[0],
    env.Z_EMAIL || DEFAULT_INVITE_RECIPIENTS[1],
    ...(env.INVITE_EMAILS ?? "").split(","),
  ]);
}

/**
 * Who still needs an emailed invite after the Google Calendar step.
 * Google emails every attendee except the calendar owner (the organizer), so when
 * the event exists only the organizer is left; without an event everyone is.
 */
export function emailFallbackRecipients(opts: {
  googleEventCreated: boolean;
  organizerEmail?: string;
  recipients: string[];
  bookerEmail: string;
}): string[] {
  if (!opts.googleEventCreated) return uniqueEmails([...opts.recipients, opts.bookerEmail]);
  const organizer = opts.organizerEmail?.toLowerCase();
  if (!organizer) return [];
  return opts.recipients.filter((email) => email.toLowerCase() === organizer);
}
