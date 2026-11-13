import { z } from "zod";

import { CalendarServiceCredentialPayload } from "@calcom/lib/CalendarService";
import { symmetricDecrypt, symmetricEncrypt } from "@calcom/lib/crypto";
import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { prisma } from "@calcom/prisma";
import { Prisma } from "@calcom/prisma/client";
import { AppDeclarativeHandler } from "@calcom/types/AppHandler";

import YandexCalendarService from "../lib/CalendarService";

type UserForSetupYandexCalendar = Prisma.UserGetPayload<{
  select: ReturnType<typeof getUserSelect>;
}>;

const getUserSelect = (type: string) => ({
  id: true,
  email: true,
  credentials: {
    where: {
      type,
    },
    select: {
      id: true,
      key: true,
    },
  },
});

export const bodySchema = z.object({
  username: z.string(),
  password: z.string(),
});

export const setupYandexCalendar: AppDeclarativeHandler<
  z.infer<typeof bodySchema>
>["createCredential"] = async ({ body, user: providedUser, slug, appType, method, teamId }) => {
  try {
    // When it's GET, the default redirect will be used
    if (method !== "POST") {
      return { credential: null };
    }

    if (!body) {
      throw new HttpError({ statusCode: 400, message: "Invalid request" });
    }

    if (!providedUser) {
      throw new HttpError({ statusCode: 401, message: "Unauthenticated" });
    }

    const user = await getUserForYandexCalendarSetup(providedUser.id, appType);
    if (!user) {
      logger.error("[Yandex Calendar] User not found", { userId: providedUser.id });
      // 500 beause this should not happen, if the session has a userId, then the user should be found
      throw new HttpError({ statusCode: 500, message: "Something went wrong" });
    }

    // Check if the credentials are installed
    const foundCredentials = getExistingCredentials(user.credentials, body);
    if (foundCredentials === "exact_match") {
      throw new HttpError({ statusCode: 409, message: "The account is already linked" });
    }

    const baseData = {
      type: appType,
      userId: user.id,
      teamId,
      appId: slug,
      invalid: false,
    } satisfies Omit<Prisma.CredentialUncheckedCreateInput, "key">;

    // Validate the credentials
    const isValid = await validateCredentials({
      id: -1,
      ...baseData,
      credentials: { username: body.username, password: body.password },
      delegationCredentialId: null,
      user: { email: user.email },
      teamId: teamId || null,
    });
    if (!isValid) {
      throw new Error("Could not connect to Yandex Calendar");
    }

    // Upsert the credentials
    const data = {
      ...baseData,
      key: symmetricEncrypt(
        JSON.stringify({ username: body.username, password: body.password }),
        process.env.CALENDSO_ENCRYPTION_KEY as string
      ),
    } satisfies Prisma.CredentialUncheckedCreateInput;

    const credential = await prisma.credential.upsert({
      where: {
        id: foundCredentials ? foundCredentials.id : -1,
      },
      create: data,
      update: data,
    });

    return {
      credential,
      redirect: { url: "/apps/installed/calendar?hl=yandex-calendar" },
    };
  } catch (e) {
    logger.error("[Yandex Calendar] Error setting up Yandex Calendar", e);
    throw new Error("Something went wrong");
  }
};

/**
 *
 * @returns false if no credentials are found, Credential if found, "exact_match" if a credential was found but it matches exactly with the provided username and password
 */
const getExistingCredentials = (
  credentials: UserForSetupYandexCalendar["credentials"],
  { username, password }: Pick<z.infer<typeof bodySchema>, "username" | "password">
): false | UserForSetupYandexCalendar["credentials"][number] | "exact_match" => {
  for (const credential of credentials) {
    if (!credential.key) continue;

    // Decrypt the credential
    try {
      const decryptedCredential = JSON.parse(
        symmetricDecrypt(credential.key.toString(), process.env.CALENDSO_ENCRYPTION_KEY as string)
      );
      if (decryptedCredential.username === username) {
        if (decryptedCredential.password === password) {
          return "exact_match";
        }
        return credential;
      }
    } catch (error) {
      logger.error("[Yandex Calendar] Error decrypting credential", error);
      continue;
    }
  }

  return false;
};

const getUserForYandexCalendarSetup = async (userId: number, type: string) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: getUserSelect(type),
  });
  return user;
};

const validateCredentials = async (credential: CalendarServiceCredentialPayload): Promise<boolean> => {
  try {
    const dav = new YandexCalendarService(credential);
    const calendars = await dav.listCalendars();
    if (!calendars.length) {
      return false;
    }
    return true;
  } catch (error) {
    logger.error("[Yandex Calendar] Error validating credentials", error);
    return false;
  }
};
