// TypeScript types imported from lib/types path for moduleResolution: "node" compatibility
import { SimplePool, generateSecretKey } from "nostr-tools";
import type { BunkerSigner } from "nostr-tools/lib/types/nip46";
// @ts-expect-error - TypeScript can't resolve this with moduleResolution: "node", but it works at runtime via package.json exports
import { BunkerSigner as BunkerSignerClass, parseBunkerInput, BUNKER_REGEX } from "nostr-tools/nip46";

import { symmetricDecrypt } from "@calcom/lib/crypto";
import logger from "@calcom/lib/logger";

import type { BunkerConnection } from "./types";

const log = logger.getSubLogger({ prefix: ["bunker-manager"] });

// Permissions required for calendar operations
const CALENDAR_PERMISSIONS = [
  "get_public_key", // Get the user's public key
  "sign_event:31922", // Sign date-based calendar events
  "sign_event:31923", // Sign time-based calendar events
  "sign_event:31927", // Sign availability blocks
  "sign_event:5", // Sign deletion events
  "sign_event:13", // Sign seals (for private events via NIP-59)
  "nip44_encrypt", // Encrypt content for private events
  "nip44_decrypt", // Decrypt received private events
];

export class BunkerManager {
  /**
   * Connect to a bunker using a bunker URI
   * @param bunkerUri - bunker:// URI or NIP-05 identifier
   * @param localClientSecret - Optional client secret for reconnection (if not provided, generates new one)
   * @returns BunkerSigner instance and client secret for storage
   */
  static async connectFromUri(bunkerUri: string, localClientSecret?: Uint8Array): Promise<BunkerConnection> {
    log.info("Connecting to bunker", { uri: bunkerUri.substring(0, 20) + "..." });

    // Generate or reuse client secret
    const clientSecret = localClientSecret || generateSecretKey();

    // Parse the bunker URI
    const bunkerPointer = await parseBunkerInput(bunkerUri);
    if (!bunkerPointer) {
      throw new Error("Invalid bunker URI format. Expected bunker:// or name@domain.com");
    }

    log.debug("Bunker pointer parsed", {
      relays: bunkerPointer.relays,
      pubkey: bunkerPointer.pubkey.slice(0, 8),
    });

    // Create pool and bunker signer
    const pool = new SimplePool();
    const bunker = BunkerSignerClass.fromBunker(clientSecret, bunkerPointer, { pool });

    // Connect and request permissions
    // Note: This will prompt the user in their bunker app to approve permissions
    try {
      // Format permissions as comma-separated string per NIP-46 spec
      const permissions = CALENDAR_PERMISSIONS.join(",");
      log.debug("Requesting permissions", { permissions });

      // Send connect request with permissions
      // NIP-46 format: ["connect", <remote_pubkey>, <optional_secret>, <optional_requested_permissions>]
      await bunker.sendRequest("connect", [bunkerPointer.pubkey, bunkerPointer.secret || "", permissions]);
      log.info("Successfully connected to bunker with calendar permissions");
    } catch (error) {
      log.error("Failed to connect to bunker", error);
      pool.close([]);
      throw new Error(
        `Bunker connection failed: ${error instanceof Error ? error.message : "Unknown error"}. ` +
          "Please approve the connection in your bunker app."
      );
    }

    return { bunker, clientSecret };
  }

  /**
   * Reconnect to a bunker using stored encrypted client secret
   * Used when loading existing credentials
   * @param bunkerUri - The bunker URI
   * @param encryptedClientSecret - Encrypted client secret from database
   * @param encryptionKey - Decryption key
   * @returns BunkerSigner instance
   */
  static async reconnect(
    bunkerUri: string,
    encryptedClientSecret: string,
    encryptionKey: string
  ): Promise<BunkerSigner> {
    log.info("Reconnecting to bunker with stored secret");

    // Decrypt the client secret
    const clientSecretHex = symmetricDecrypt(encryptedClientSecret, encryptionKey);
    const clientSecret = Buffer.from(clientSecretHex, "hex");

    log.debug("Client secret decrypted", { length: clientSecret.length });

    // Parse the bunker URI
    const bunkerPointer = await parseBunkerInput(bunkerUri);
    if (!bunkerPointer) {
      throw new Error("Invalid bunker URI format");
    }

    // Create pool and bunker signer with stored secret
    const pool = new SimplePool();
    const bunker = BunkerSignerClass.fromBunker(clientSecret, bunkerPointer, { pool });

    // fromBunker() automatically sets up subscription and makes the signer ready to use
    // Do NOT call connect() on reconnection - the bunker will ignore it since the secret
    // was already used for the initial connection (per NIP-46 spec)
    // The signer is operational immediately and will handle requests
    log.info("BunkerSigner reconnected (ready for operations)");

    return bunker;
  }

  /**
   * Validate a bunker URI format
   * @param uri - The URI to validate
   * @returns True if valid bunker URI
   */
  static isValidBunkerUri(uri: string): boolean {
    // Check if it matches bunker:// pattern or NIP-05 format
    if (BUNKER_REGEX.test(uri)) {
      return true;
    }

    // Also accept NIP-05 format: name@domain.com
    const nip05Regex = /^[a-zA-Z0-9_-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return nip05Regex.test(uri);
  }

  /**
   * Test a bunker connection without storing credentials
   * Useful for validation during setup
   * @param bunkerUri - The bunker URI to test
   * @returns True if connection successful
   */
  static async testConnection(bunkerUri: string): Promise<boolean> {
    try {
      log.info("Testing bunker connection");
      const { bunker } = await this.connectFromUri(bunkerUri);

      // Try to get public key as a connection test
      await bunker.getPublicKey();

      // Clean up
      await bunker.close();

      log.info("Bunker connection test successful");
      return true;
    } catch (error) {
      log.warn("Bunker connection test failed", error);
      return false;
    }
  }

  /**
   * Get list of permissions required for calendar operations
   * Used for display in UI
   */
  static getRequiredPermissions(): string[] {
    return [...CALENDAR_PERMISSIONS];
  }
}
