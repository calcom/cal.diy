import { z } from "zod";

// Schema for data stored in the credential - discriminated union for nsec vs bunker auth
export const nostrCredentialSchema = z.discriminatedUnion("authType", [
  z.object({
    authType: z.literal("nsec"),
    nsec: z.string().min(1), // Encrypted nsec key
    npub: z.string().min(1), // Public key in bech32 format
    displayName: z.string().optional(), // User's display name from kind 0 metadata
    // Relays are discovered from kind 10002 relay list metadata
  }),
  z.object({
    authType: z.literal("bunker"),
    bunkerUri: z.string().min(1), // Bunker connection URI (bunker://)
    localClientSecret: z.string().min(1), // Encrypted client secret for reconnection
    npub: z.string().min(1), // Public key in bech32 format
    displayName: z.string().optional(), // User's display name from kind 0 metadata
  }),
]);

export type NostrCredential = z.infer<typeof nostrCredentialSchema>;

// Required by app-store build system
export const appDataSchema = z.object({});

export const appKeysSchema = z.object({});
