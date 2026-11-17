import { describe, expect, it } from "vitest";
import { symmetricDecrypt, symmetricEncrypt } from "./crypto";

describe("crypto", () => {
  const testKey = "12345678901234567890123456789012"; // 32 bytes key
  const testText = "Hello, World!";

  describe("symmetricEncrypt", () => {
    it("should encrypt text with a valid key", () => {
      const encrypted = symmetricEncrypt(testText, testKey);

      // Verify the format is "iv:ciphertext"
      expect(encrypted).toContain(":");
      const [iv, ciphertext] = encrypted.split(":");

      // IV should be 32 characters (16 bytes in hex)
      expect(iv).toHaveLength(32);
      // Ciphertext should exist
      expect(ciphertext).toBeDefined();
      expect(ciphertext.length).toBeGreaterThan(0);
    });

    it("should produce different ciphertexts for the same input due to random IV", () => {
      const encrypted1 = symmetricEncrypt(testText, testKey);
      const encrypted2 = symmetricEncrypt(testText, testKey);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it("should throw error if key is not 32 bytes", () => {
      const shortKey = "short";
      expect(() => symmetricEncrypt(testText, shortKey)).toThrow();
    });
  });

  describe("symmetricDecrypt", () => {
    it("should correctly decrypt encrypted text", () => {
      const encrypted = symmetricEncrypt(testText, testKey);
      const decrypted = symmetricDecrypt(encrypted, testKey);

      expect(decrypted).toBe(testText);
    });

    it("should throw error for malformed encrypted text", () => {
      // Test with invalid IV:ciphertext format
      expect(() => symmetricDecrypt("invalid", testKey)).toThrow();
      expect(() => symmetricDecrypt("invalid:data", testKey)).toThrow();
      expect(() => symmetricDecrypt(":", testKey)).toThrow();
    });

    it("should fail to decrypt correctly if wrong key is used", () => {
      const encrypted = symmetricEncrypt(testText, testKey);
      const wrongKey = "12345678901234567890123456789013"; // Different 32 bytes key

      // AES-256-CBC doesn't guarantee throwing on wrong key - it depends on whether
      // the decrypted bytes happen to have valid PKCS#7 padding. The test verifies
      // that decryption either throws OR returns a value different from the original.
      let decryptedWithWrongKey: string | null = null;
      let threwError = false;

      try {
        decryptedWithWrongKey = symmetricDecrypt(encrypted, wrongKey);
      } catch {
        threwError = true;
      }

      // Either it threw an error, or the decrypted value is not the original text
      expect(threwError || decryptedWithWrongKey !== testText).toBe(true);
    });

    it("should handle empty string encryption/decryption", () => {
      const emptyText = "";
      const encrypted = symmetricEncrypt(emptyText, testKey);
      const decrypted = symmetricDecrypt(encrypted, testKey);

      expect(decrypted).toBe(emptyText);
    });

    it("should handle long text encryption/decryption", () => {
      const longText = "a".repeat(1000);
      const encrypted = symmetricEncrypt(longText, testKey);
      const decrypted = symmetricDecrypt(encrypted, testKey);

      expect(decrypted).toBe(longText);
    });

    it("should handle special characters", () => {
      const specialChars = "!@#$%^&*()_+-=[]{}|;:'\",.<>?/\\`~";
      const encrypted = symmetricEncrypt(specialChars, testKey);
      const decrypted = symmetricDecrypt(encrypted, testKey);

      expect(decrypted).toBe(specialChars);
    });

    it("should handle unicode characters", () => {
      const unicodeText = "Hello, 世界! 👋 🌍";
      const encrypted = symmetricEncrypt(unicodeText, testKey);
      const decrypted = symmetricDecrypt(encrypted, testKey);

      expect(decrypted).toBe(unicodeText);
    });
  });
});
