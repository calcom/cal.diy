import type { NextApiRequest, NextApiResponse } from "next";

import { symmetricEncrypt } from "@calcom/lib/crypto";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";

import getInstalledAppPath from "../../_utils/getInstalledAppPath";
import { BuildCalendarService } from "../lib";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    const { username, password, url } = req.body;
    // Get user
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
      await prisma.credential.create({
        data,
      });
    } catch (e) {
      logger.error("Could not add this caldav account", e);
      if (e instanceof Error) {
        let message = e.message;
        let actionUrl: string | undefined;

        // Handle specific error cases with helpful messages
        if (e.message.indexOf("Invalid credentials") > -1) {
          if (url.indexOf("dav.php") > -1) {
            const parsedUrl = new URL(url);
            actionUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}${
              parsedUrl.port ? `:${parsedUrl.port}` : ""
            }/admin/?/settings/standard/`;
            message = `Couldn\'t connect to caldav account, please verify WebDAV authentication type is set to "Basic"`;
          } else {
            message = `Invalid credentials. Please verify your username and password are correct. Some CalDAV servers require app-specific passwords.`;
          }
        } else if (e.message.indexOf("cannot find homeUrl") > -1) {
          message = `Could not discover calendar home URL. Please try using the full calendar URL (e.g., https://server.com/calendars/username/) instead of the base server URL.`;
        } else if (e.message.indexOf("PROPFIND") > -1 || e.message.indexOf("fetch") > -1) {
          message = `Could not connect to the CalDAV server. Please verify the URL is correct and the server is accessible.`;
        } else if (message && message !== "Could not add this caldav account") {
          // Pass through the actual error message if it's informative
          message = `CalDAV connection failed: ${message}`;
        } else {
          message = "Could not add this caldav account. Please verify your credentials and URL.";
        }

        return res.status(500).json({ message, ...(actionUrl && { actionUrl }) });
      }
      return res.status(500).json({ message: "Could not add this caldav account. Please check your connection details." });
    }

    return res
      .status(200)
      .json({ url: getInstalledAppPath({ variant: "calendar", slug: "caldav-calendar" }) });
  }

  if (req.method === "GET") {
    return res.status(200).json({ url: "/apps/caldav-calendar/setup" });
  }
}
