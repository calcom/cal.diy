import { SERVICE_ACCOUNT_ENCRYPTION_KEY } from "@calcom/lib/constants";
import { symmetricDecrypt, symmetricEncrypt } from "@calcom/lib/crypto";
import type { Prisma } from "@calcom/prisma/client";
import { serviceAccountKeySchema } from "@calcom/prisma/zod-utils";
import { z } from "zod";

export type ServiceAccountKey = z.infer<typeof serviceAccountKeySchema>;
export { serviceAccountKeySchema };
// Schema for encrypted service account key (our storage format)
export const encryptedServiceAccountKeySchema = z
  .object({
    client_email: z.string().optional(),
    client_id: z.string(),
    encrypted_credentials: z.string(),
    tenant_id: z.string().optional(),
  })
  .passthrough();

export type EncryptedServiceAccountKey = z.infer<typeof encryptedServiceAccountKeySchema>;

export function encryptServiceAccountKey(serviceAccountKey: ServiceAccountKey): EncryptedServiceAccountKey {
  if (!SERVICE_ACCOUNT_ENCRYPTION_KEY) {
    throw new Error("Service account encryption key is not set");
  }

  // Extract private_key to encrypt
  const { private_key, ...rest } = serviceAccountKey;
  const sensitiveData = { private_key };

  // Create a new object with encrypted credentials
  return {
    ...rest,
    encrypted_credentials: symmetricEncrypt(JSON.stringify(sensitiveData), SERVICE_ACCOUNT_ENCRYPTION_KEY),
  } as EncryptedServiceAccountKey;
}

export function decryptServiceAccountKey(encryptedServiceAccountKey: Prisma.JsonValue): ServiceAccountKey {
  if (!SERVICE_ACCOUNT_ENCRYPTION_KEY) {
    throw new Error("Service account encryption key is not set");
  }
  try {
    // Parse and validate the encrypted format
    const parsedEncrypted = encryptedServiceAccountKeySchema.safeParse(encryptedServiceAccountKey);
    if (!parsedEncrypted.success) {
      throw new Error(`Invalid service account key format: ${JSON.stringify(parsedEncrypted.error)}`);
    }

    const { encrypted_credentials, ...rest } = parsedEncrypted.data;

    // Decrypt and parse the sensitive data
    const decryptedData = JSON.parse(
      symmetricDecrypt(encrypted_credentials, SERVICE_ACCOUNT_ENCRYPTION_KEY)
    ) as Record<string, string>;

    // Reconstruct and validate the decrypted format
    const decrypted = {
      ...rest,
      ...decryptedData,
    };

    const parsedDecrypted = serviceAccountKeySchema.safeParse(decrypted);
    if (!parsedDecrypted.success) {
      throw new Error("Invalid decrypted service account key format");
    }

    return parsedDecrypted.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to decrypt service account key: ${error.message}`);
    }
    throw new Error("Failed to decrypt service account key");
  }
}
