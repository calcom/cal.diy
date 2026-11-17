const CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const CHARACTERS_LENGTH = CHARACTERS.length;

/**
 * Generate a random string of a given length using alphanumeric characters.
 */
export const randomString = (length = 12) => {
  let result = "";

  for (let i = 0; i < length; i++) {
    result += CHARACTERS.charAt(Math.floor(Math.random() * CHARACTERS_LENGTH));
  }

  return result;
};
