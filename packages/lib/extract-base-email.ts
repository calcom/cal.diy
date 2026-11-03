/**
 * Strips any "+" alias tag from an email's local part, so that a tagged address and its base
 * compare equal. Callers use the result to match attendees against one another.
 *
 * @param email - The email address to reduce to its base form.
 * @returns The address without its alias tag, the input unchanged when it holds no "@", or an
 *          empty string when the input is not a string at all.
 */
export const extractBaseEmail = (email: string): string => {
  // The declared return type is what callers rely on — several of them go straight into
  // .toLowerCase() — so anything that is not a string leaves as one.
  if (typeof email !== "string") {
    return "";
  }

  // Splitting a string with no "@" left the domain undefined and produced "<input>@undefined",
  // which made unrelated malformed entries compare equal to each other.
  if (!email.includes("@")) {
    return email;
  }

  const [localPart, ...domainParts] = email.split("@");
  const baseLocalPart = localPart.split("+")[0];

  return `${baseLocalPart}@${domainParts.join("@")}`;
};
