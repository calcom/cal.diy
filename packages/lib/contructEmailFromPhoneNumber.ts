/**
 * Builds the SMS gateway address used as an attendee's email when they booked with a phone
 * number instead of one.
 *
 * `isValidPhoneNumber` accepts formatted input ("+55 11 99999-8888" passes), and the booking
 * response stores whatever the attendee typed, so every non-digit is stripped rather than just
 * the leading "+" — otherwise the address carries spaces, parentheses or dots and is not a valid
 * email at all.
 *
 * @param phoneNumber - The phone number as stored in the booking response.
 * @returns The SMS gateway address, or an empty string when the input holds no digits.
 */
export const contructEmailFromPhoneNumber = (phoneNumber: string): string => {
  const digits = typeof phoneNumber === "string" ? phoneNumber.replace(/\D/g, "") : "";

  // An optional, unfilled phone field reaches this point as "". Returning "@sms.cal.com" would
  // give every such booking the same address and merge unrelated attendees onto one identity.
  if (!digits) {
    return "";
  }

  return `${digits}@sms.cal.com`;
};
