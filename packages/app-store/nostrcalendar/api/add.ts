import type { NextApiRequest, NextApiResponse } from "next";
import { nip19, getPublicKey } from "nostr-tools";

import { symmetricEncrypt } from "@calcom/lib/crypto";
import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { defaultHandler } from "@calcom/lib/server/defaultHandler";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import prisma from "@calcom/prisma";

import getInstalledAppPath from "../../_utils/getInstalledAppPath";
import appConfig from "../config.json";
import { BunkerManager } from "../lib/BunkerManager";
import { NostrClient } from "../lib/NostrClient";

const log = logger.getSubLogger({ prefix: ["nostr/api/add"] });

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  // GET: Return setup URL
  return res.status(200).json({ url: "/apps/nostrcalendar/setup" });
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const loggedInUser = req.session?.user;

  if (!loggedInUser) {
    throw new HttpError({ statusCode: 401, message: "You must be logged in to do this" });
  }

  const { authMethod, bunkerUri, nsec } = req.body;

  // Validate authMethod
  if (!authMethod || (authMethod !== "bunker" && authMethod !== "nsec")) {
    throw new HttpError({ statusCode: 400, message: "authMethod must be 'bunker' or 'nsec'" });
  }

  const encryptionKey = process.env.CALENDSO_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error("CALENDSO_ENCRYPTION_KEY is not configured");
  }

  const decodedKey = Buffer.from(encryptionKey, "base64").toString("latin1");

  try {
    if (authMethod === "bunker") {
      // Bunker-based authentication
      if (!bunkerUri || typeof bunkerUri !== "string") {
        throw new HttpError({ statusCode: 400, message: "bunkerUri is required for bunker auth" });
      }

      log.info("Setting up bunker authentication", { userId: loggedInUser.id });

      // Validate bunker URI format
      if (!BunkerManager.isValidBunkerUri(bunkerUri)) {
        throw new Error("Invalid bunker URI format. Expected bunker:// or name@domain.com");
      }

      // Connect to bunker
      const { bunker, clientSecret } = await BunkerManager.connectFromUri(bunkerUri);

      // Get public key from bunker
      const publicKey = await bunker.getPublicKey();
      const npub = nip19.npubEncode(publicKey);

      log.info("Connected to bunker successfully", {
        userId: loggedInUser.id,
        npub: npub.substring(0, 12) + "...",
      });

      // Encrypt client secret for storage
      const encryptedClientSecret = symmetricEncrypt(Buffer.from(clientSecret).toString("hex"), decodedKey);

      // Query user's kind 0 metadata to get display name
      const nostrClient = new NostrClient({ bunker });
      const displayName = await nostrClient.queryUserMetadata();

      // Store credential
      const data = {
        type: appConfig.type,
        key: {
          authType: "bunker" as const,
          bunkerUri,
          localClientSecret: encryptedClientSecret,
          npub,
          ...(displayName && { displayName }),
        },
        userId: loggedInUser.id,
        teamId: null,
        appId: appConfig.slug,
        invalid: false,
      };

      await prisma.credential.create({ data });

      // Clean up bunker connection
      await bunker.close();

      log.info("Bunker credential created successfully", { userId: loggedInUser.id, npub });

      return res.status(200).json({
        url: getInstalledAppPath({ variant: appConfig.variant, slug: appConfig.slug }),
      });
    } else {
      // nsec-based authentication (existing flow)
      if (!nsec || typeof nsec !== "string") {
        throw new HttpError({ statusCode: 400, message: "nsec key is required for nsec auth" });
      }

      log.info("Setting up nsec authentication", { userId: loggedInUser.id });

      // Decode nsec to validate and get public key
      const decoded = nip19.decode(nsec);
      if (decoded.type !== "nsec") {
        throw new Error("Invalid nsec key format");
      }

      const secretKey = decoded.data as Uint8Array;
      const publicKey = getPublicKey(secretKey);
      const npub = nip19.npubEncode(publicKey);

      // Encrypt the nsec before storing
      const encryptedNsec = symmetricEncrypt(nsec, decodedKey);

      // Query user's kind 0 metadata to get display name
      const nostrClient = new NostrClient({ nsec });
      const displayName = await nostrClient.queryUserMetadata(publicKey);
      nostrClient.close();

      // Store credential (relays will be discovered from kind 10002)
      const data = {
        type: appConfig.type,
        key: {
          authType: "nsec" as const,
          nsec: encryptedNsec,
          npub,
          ...(displayName && { displayName }),
        },
        userId: loggedInUser.id,
        teamId: null,
        appId: appConfig.slug,
        invalid: false,
      };

      await prisma.credential.create({ data });

      log.info("Nsec credential created successfully", { userId: loggedInUser.id, npub });

      return res.status(200).json({
        url: getInstalledAppPath({ variant: appConfig.variant, slug: appConfig.slug }),
      });
    }
  } catch (e) {
    const error = e as Error;
    log.error("Could not add Nostr account", error);
    return res.status(500).json({
      message: error.message || "Could not add Nostr account. Please verify your credentials are correct.",
    });
  }
}

export default defaultHandler({
  GET: Promise.resolve({ default: defaultResponder(getHandler) }),
  POST: Promise.resolve({ default: defaultResponder(postHandler) }),
});
