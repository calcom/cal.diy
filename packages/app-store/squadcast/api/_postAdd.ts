import process from "node:process";
import { symmetricEncrypt } from "@calcom/lib/crypto";
import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import prisma from "@calcom/prisma";
import type { NextApiRequest } from "next";
import checkSession from "../../_utils/auth";
import getInstalledAppPath from "../../_utils/getInstalledAppPath";
import config from "../config.json";
import { validateToken } from "../lib/squadcastApi";

export async function postHandler(req: NextApiRequest) {
  const session = checkSession(req);

  const { api_token } = req.body;
  if (!api_token) throw new HttpError({ statusCode: 400, message: "No API token provided" });

  const isValid = await validateToken(api_token);
  if (!isValid) {
    throw new HttpError({ statusCode: 401, message: "Invalid API token" });
  }

  const encryptionKey = process.env.CALENDSO_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new HttpError({ statusCode: 500, message: "Encryption key not configured" });
  }

  let encrypted: string;
  try {
    encrypted = symmetricEncrypt(JSON.stringify({ api_token }), encryptionKey);
  } catch (reason) {
    logger.error("Could not encrypt SquadCast API token", reason);
    throw new HttpError({ statusCode: 500, message: "Encryption failed" });
  }

  const data = {
    type: config.type,
    key: { encrypted },
    userId: session.user?.id,
    appId: "squadcast",
  };

  try {
    await prisma.credential.create({
      data,
    });
  } catch (reason) {
    logger.error("Could not add SquadCast app", reason);
    throw new HttpError({ statusCode: 500, message: "Could not add SquadCast app" });
  }

  return { url: getInstalledAppPath({ variant: "conferencing", slug: "squadcast" }) };
}

export default defaultResponder(postHandler);
