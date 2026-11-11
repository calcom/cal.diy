import crypto from "node:crypto";

const ALGORITHM = "aes256";
const INPUT_ENCODING = "utf8";
const OUTPUT_ENCODING = "hex";
const IV_LENGTH = 16; // AES blocksize

/**
 *
 * @param text Value to be encrypted
 * @param key Key used to encrypt value must be 32 bytes for AES256 encryption algorithm
 *
 * @returns Encrypted value using key
 */
export const symmetricEncrypt = (text: string, key: string) => {
  const _key = Buffer.from(key, "latin1");
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, _key, iv);
  let ciphered = cipher.update(text, INPUT_ENCODING, OUTPUT_ENCODING);
  ciphered += cipher.final(OUTPUT_ENCODING);
  const ciphertext = `${iv.toString(OUTPUT_ENCODING)}:${ciphered}`;

  return ciphertext;
};

/**
 *
 * @param text Value to decrypt
 * @param key Key used to decrypt value must be 32 bytes for AES256 encryption algorithm
 */
export const symmetricDecrypt = (text: string, key: string) => {
  const _key = Buffer.from(key, "latin1");

  const components = text.split(":");
  const iv_from_ciphertext = Buffer.from(components.shift() || "", OUTPUT_ENCODING);
  const decipher = crypto.createDecipheriv(ALGORITHM, _key, iv_from_ciphertext);
  let deciphered = decipher.update(components.join(":"), OUTPUT_ENCODING, INPUT_ENCODING);
  deciphered += decipher.final(INPUT_ENCODING);

  return deciphered;
};

/**
 * Safely compares two secret strings in constant time to prevent timing attacks.
 * Uses SHA-256 digest hashing before timingSafeEqual to normalize both buffers
 * to exactly 32 bytes, eliminating length-leak timing attacks and preventing RangeError.
 *
 * @param a First string to compare
 * @param b Second string to compare
 * @returns true if both strings are identical, false otherwise
 */
export const safeCompare = (a: string | null | undefined, b: string | null | undefined): boolean => {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
};
