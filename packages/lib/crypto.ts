import crypto from "node:crypto";

export function timingSafeEqualStrings(
  actual: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (typeof actual !== "string" || typeof expected !== "string") return false;

  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const length = Math.max(actualBuffer.length, expectedBuffer.length);
  const paddedActual = Buffer.alloc(length);
  const paddedExpected = Buffer.alloc(length);

  actualBuffer.copy(paddedActual);
  expectedBuffer.copy(paddedExpected);

  const isEqual = crypto.timingSafeEqual(paddedActual, paddedExpected);
  return actualBuffer.length === expectedBuffer.length && isEqual;
}

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
export const symmetricEncrypt = function (text: string, key: string) {
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
export const symmetricDecrypt = function (text: string, key: string) {
  const _key = Buffer.from(key, "latin1");

  const components = text.split(":");
  const iv_from_ciphertext = Buffer.from(components.shift() || "", OUTPUT_ENCODING);
  const decipher = crypto.createDecipheriv(ALGORITHM, _key, iv_from_ciphertext);
  let deciphered = decipher.update(components.join(":"), OUTPUT_ENCODING, INPUT_ENCODING);
  deciphered += decipher.final(INPUT_ENCODING);

  return deciphered;
};
