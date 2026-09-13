import type { NextApiRequest, NextApiResponse } from "next";

import { symmetricDecrypt, symmetricEncrypt } from "@calcom/lib/crypto";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";

import getInstalledAppPath from "../../_utils/getInstalledAppPath";
import { BuildCalendarService } from "../lib";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    const { username, password, url } = req.body;

    const user = await prisma.user.findFirstOrThrow({
      where: {
        id: req.session?.user?.id,
      },
      select: {
        id: true,
        email: true,
      },
    });

    const data = {
      type: "caldav_calendar",
      key: symmetricEncrypt(
        JSON.stringify({ username, password, url }),
        process.env.CALENDSO_ENCRYPTION_KEY || ""
      ),
      userId: user.id,
      teamId: null,
      appId: "caldav-calendar",
      invalid: false,
      delegationCredentialId: null,
    };

    try {
      const dav = BuildCalendarService({
        id: 0,
        ...data,
        user: { email: user.email },
        encryptedKey: null,
      });

      await dav?.listCalendars();

      const existingCredentials = await prisma.credential.findMany({
        where: {
          userId: user.id,
          type: "caldav_calendar",
        },
      });

      let existingCredentialId: number | null = null;

      for (const credential of existingCredentials) {
        try {
          const decrypted = JSON.parse(
            symmetricDecrypt(
              credential.key,
              process.env.CALENDSO_ENCRYPTION_KEY || ""
            )
          );

          if (decrypted.url === url && decrypted.username === username) {
            existingCredentialId = credential.id;
            break;
          }
        } catch {
          // Ignore credentials that cannot be decrypted.
        }
      }

      if (existingCredentialId !== null) {
        await prisma.credential.update({
          where: {
            id: existingCredentialId,
          },
          data,
        });
      } else {
        await prisma.credential.create({
          data,
        });
      }
    } catch (e) {
      logger.error("Could not add this caldav account", e);

      if (e instanceof Error) {
        let message = e.message;

        if (e.message.indexOf("Invalid credentials") > -1 && url.indexOf("dav.php") > -1) {
          const parsedUrl = new URL(url);

          const adminUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}${
            parsedUrl.port ? `:${parsedUrl.port}` : ""
          }/admin/?/settings/standard/`;

          message =
            `Couldn't connect to caldav account, please verify WebDAV ` +
            `authentication type is set to "Basic"`;

          return res.status(500).json({
            message,
            actionUrl: adminUrl,
          });
        }
      }

      return res.status(500).json({
        message: "Could not add this caldav account",
      });
    }

    return res.status(200).json({
      url: getInstalledAppPath({
        variant: "calendar",
        slug: "caldav-calendar",
      }),
    });
  }

  if (req.method === "GET") {
    return res.status(200).json({
      url: "/apps/caldav-calendar/setup",
    });
  }
}
