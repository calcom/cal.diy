import process from "node:process";
import { encryptSecret } from "@calcom/lib/crypto/keyring";
import { prisma } from "@calcom/prisma";

async function main(): Promise<void> {
  const CHUNK_SIZE = 1000;
  let cursorId = 0;
  let totalProcessed = 0;
  let totalUpdated = 0;

  console.log("🚀 Starting backfill for Credential encryption...");

  try {
    // Check if we have the necessary environment variables
    if (!process.env.CALCOM_KEYRING_CREDENTIALS_CURRENT) {
      console.warn(
        "⚠️  CALCOM_KEYRING_CREDENTIALS_CURRENT is not set. Encryption might fail if it relies on it."
      );
    }

    while (true) {
      // Fetch a chunk of credentials that haven't been encrypted yet
      const credentials = await prisma.credential.findMany({
        where: {
          id: { gt: cursorId },
          encryptedKey: null,
        },
        take: CHUNK_SIZE,
        orderBy: { id: "asc" },
        select: {
          id: true,
          type: true,
          key: true,
        },
      });

      if (credentials.length === 0) {
        break;
      }

      for (const credential of credentials) {
        try {
          // Skip if key is missing, not an object, or an empty object
          if (
            !credential.key ||
            typeof credential.key !== "object" ||
            Object.keys(credential.key).length === 0
          ) {
            console.log(`⏩ Skipping credential ${credential.id}: Missing, invalid, or empty key data.`);
            cursorId = credential.id;
            continue;
          }

          const aad = { type: credential.type };
          const plaintext = JSON.stringify(credential.key);

          const envelope = encryptSecret({
            ring: "CREDENTIALS",
            plaintext,
            aad,
          });

          await prisma.credential.update({
            where: { id: credential.id },
            data: {
              encryptedKey: JSON.stringify(envelope),
            },
          });

          totalUpdated++;
        } catch (error) {
          let errorMessage: string;
          if (error instanceof Error) {
            errorMessage = error.message;
          } else {
            errorMessage = String(error);
          }
          console.error(`❌ Failed to encrypt credential ${credential.id}:`, errorMessage);
        }
        cursorId = credential.id;
      }

      totalProcessed += credentials.length;
      console.log(
        `📊 Progress: Processed ${totalProcessed} records, Updated ${totalUpdated}. Last ID: ${cursorId}`
      );
    }

    console.log(`✅ Backfill completed! Total updated: ${totalUpdated}`);
  } catch (error) {
    console.error("💥 Fatal error during backfill:", error);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
