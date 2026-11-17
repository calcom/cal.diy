// Note: avoid Node's crypto to support runtimes where it's unavailable (e.g., edge/browsers)

import process from "node:process";
export interface PiiHasher {
  hash(input: string): string;
}

export class Md5PiiHasher implements PiiHasher {
  constructor(private readonly salt: string) {}
  hash(input: string) {
    // FNV-1a 32-bit using Math.imul, repeated 4 times with variant salt to get 128-bit hex
    const fnv1a32 = (str: string) => {
      // Convert to UTF-8 bytes without relying on TextEncoder/Buffer
      const data = unescape(encodeURIComponent(str));
      let hash = 0x811c9dc5; // offset basis (2166136261)
      for (let i = 0; i < data.length; i++) {
        hash = Math.imul(hash ^ data.charCodeAt(i), 0x01000193); // 16777619
      }
      return hash >>> 0; // unsigned 32-bit
    };

    // Four independent 32-bit hashes to produce a stable 128-bit hex string
    const h1 = fnv1a32(`${this.salt}::1::${input}`);
    const h2 = fnv1a32(`${this.salt}::2::${input}`);
    const h3 = fnv1a32(`${this.salt}::3::${input}`);
    const h4 = fnv1a32(`${this.salt}::4::${input}`);
    const toHex8 = (n: number) => n.toString(16).padStart(8, "0");
    return `${toHex8(h1)}${toHex8(h2)}${toHex8(h3)}${toHex8(h4)}`;
  }
}

export const piiHasher: PiiHasher = new Md5PiiHasher(process.env.CALENDSO_ENCRYPTION_KEY ?? "");

export const hashEmail = (email: string, hasher: PiiHasher = piiHasher): string => {
  const [localPart, domain] = email.split("@");
  // Simple hash function for email, can be replaced with a more complex one if needed
  return `${hasher.hash(localPart)}@${domain}`;
};
