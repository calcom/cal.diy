import type { NextApiRequest, NextApiResponse } from "next";

import { symmetricDecrypt } from "@calcom/lib/crypto";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";

import appConfig from "../config.json";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const userId = req.session?.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "You must be logged in to do this" });
  }

  try {
    // Only the logged-in user's own ICS feed credentials are read
    const credentials = await prisma.credential.findMany({
      where: { userId, appId: appConfig.slug },
      select: { id: true, key: true },
    });

    const feeds = credentials.flatMap((credential) => {
      try {
        const { urls } = JSON.parse(
          symmetricDecrypt(credential.key as string, process.env.CALENDSO_ENCRYPTION_KEY || "")
        );
        return Array.isArray(urls) ? (urls as string[]) : [];
      } catch (e) {
        logger.error("Could not read saved ICS feed", e);
        return [];
      }
    });

    return res.status(200).json({ urls: feeds });
  } catch (e) {
    logger.error("Could not load ICS feeds", e);
    return res.status(500).json({ message: "Could not load ICS feeds" });
  }
}