import { parsePhoneNumberWithError } from "libphonenumber-js/max";

/**
 * Safely formats a phone number to international format, falling back to original string on parse error.
 *
 * @param phoneNumber - The raw phone number string to format.
 * @returns The formatted international phone number or original string.
 */
export const formatPhoneNumber = (phoneNumber: string) => {
  try {
    const parsedPhoneNumber = parsePhoneNumberWithError(phoneNumber);
    return parsedPhoneNumber?.isValid() ? parsedPhoneNumber.formatInternational() : phoneNumber;
  } catch {
    return phoneNumber;
  }
};
