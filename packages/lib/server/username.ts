import process from "node:process";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import slugify from "@calcom/lib/slugify";
import prisma from "@calcom/prisma";
import { RedirectType } from "@calcom/prisma/enums";
import type { NextResponse } from "next/server";
import { IS_PREMIUM_USERNAME_ENABLED } from "../constants";
import logger from "../logger";
import notEmpty from "../notEmpty";

const log = logger.getSubLogger({ prefix: ["server/username"] });
const cachedData: Set<string> = new Set();

type UsernameStatus = {
  /**
   * ```text
   * 200: Username is available
   * 402: Pro username, must be purchased
   * 418: A user exists with that username
   * ```
   */
  statusCode: 200 | 402 | 418;
  requestedUserName: string;
  json: {
    available: boolean;
    premium: boolean;
    message?: string;
    suggestion?: string;
  };
};

export type CustomNextApiHandler = (
  body: Record<string, string>,
  usernameStatus: UsernameStatus,
  query?: Record<string, string>
) => Promise<NextResponse<any>>;

export async function isBlacklisted(username: string) {
  // NodeJS forEach is very, very fast (these days) so even though we only have to construct the Set
  // once every few iterations, it doesn't add much overhead.
  if (!cachedData.size && process.env.USERNAME_BLACKLIST_URL) {
    await fetch(process.env.USERNAME_BLACKLIST_URL).then(async (resp) =>
      (await resp.text()).split("\n").forEach(cachedData.add, cachedData)
    );
  }
  return cachedData.has(username);
}

export const isPremiumUserName = IS_PREMIUM_USERNAME_ENABLED
  ? async (username: string) => {
      return username.length <= 4 || isBlacklisted(username);
    }
  : // outside of cal.com the concept of premium username needs not exist.
    () => Promise.resolve(false);

export const generateUsernameSuggestion = async (users: string[], username: string) => {
  const limit = username.length < 2 ? 9999 : 999;
  const suffix = (value: number) => String(value).padStart(3, "0");
  let rand = 1;
  while (users.includes(username + suffix(rand))) {
    rand = Math.ceil(1 + Math.random() * (limit - 1));
  }
  return username + suffix(rand);
};

const processResult = (
  result: "ok" | "username_exists" | "is_premium"
): // explicitly assign return value to ensure statusCode is typehinted
{ statusCode: UsernameStatus["statusCode"]; message: string } => {
  // using a switch statement instead of multiple ifs to make sure typescript knows
  // there is only limited options
  switch (result) {
    case "ok":
      return {
        statusCode: 200,
        message: "Username is available",
      };
    case "username_exists":
      return {
        statusCode: 418,
        message: "A user exists with that username or email",
      };
    case "is_premium":
      return { statusCode: 402, message: "This is a premium username." };
  }
};

const usernameHandler =
  (handler: CustomNextApiHandler) => async (body: Record<string, string>, query: Record<string, string>) => {
    const username = slugify(body.username);
    const check = await usernameCheckForSignup({ username, email: body.email });

    let result: Parameters<typeof processResult>[0] = "ok";
    if (check.premium) result = "is_premium";
    if (!check.available) result = "username_exists";

    const { statusCode, message } = processResult(result);
    const usernameStatus = {
      statusCode,
      requestedUserName: username,
      json: {
        available: result !== "username_exists",
        premium: result === "is_premium",
        message,
        suggestion: check.suggestedUsername,
      },
    };
    return handler(body, usernameStatus, query);
  };

const usernameCheck = async (usernameRaw: string, currentOrgDomain?: string | null) => {
  log.debug("usernameCheck", { usernameRaw, currentOrgDomain });
  const isCheckingUsernameInGlobalNamespace = !currentOrgDomain;
  const response = {
    available: true,
    premium: false,
    suggestedUsername: "",
  };

  const username = slugify(usernameRaw);

  let organizationId: number | null = null;
  if (currentOrgDomain) {
    // Get organizationId from orgSlug
    const organization = await prisma.team.findFirst({
      where: {
        isOrganization: true,
        OR: [{ slug: currentOrgDomain }, { metadata: { path: ["requestedSlug"], equals: currentOrgDomain } }],
      },
      select: {
        id: true,
      },
    });
    if (!organization) {
      throw new ErrorWithCode(
        ErrorCode.NotFound,
        `Organization with domain "${currentOrgDomain}" not found`,
        { currentOrgDomain }
      );
    }
    organizationId = organization.id;
  }

  const user = await prisma.user.findFirst({
    where: {
      username,
      // Check in the specific organization context, or global namespace if no org
      organizationId: organizationId ?? null,
    },
    select: {
      id: true,
      username: true,
    },
  });

  if (user) {
    response.available = false;
  } else {
    response.available = isCheckingUsernameInGlobalNamespace
      ? !(await isUsernameReservedDueToMigration(username))
      : true;
  }

  if (await isPremiumUserName(username)) {
    response.premium = true;
  }

  // get list of similar usernames in the db (scoped to organization if checking in org context)
  const users = await prisma.user.findMany({
    where: {
      username: {
        contains: username,
      },
      ...(organizationId !== null ? { organizationId } : { organizationId: null }),
    },
    select: {
      username: true,
    },
  });

  // We only need suggestedUsername if the username is not available
  if (!response.available) {
    response.suggestedUsername = await generateUsernameSuggestion(
      users.map((user) => user.username).filter(notEmpty),
      username
    );
  }

  return response;
};

/**
 * Should be used when in global namespace(i.e. outside of an organization)
 */
export const isUsernameReservedDueToMigration = async (username: string) =>
  !!(await prisma.tempOrgRedirect.findUnique({
    where: {
      from_type_fromOrgId: {
        type: RedirectType.User,
        from: username,
        fromOrgId: 0,
      },
    },
  }));

/**
 * It is a bit different from usernameCheck because it also check if the user signing up is the same user that has a pending invitation to organization
 * So, it uses email to uniquely identify the user and then also checks if the username requested by that user is available for taking or not.
 * TODO: We should reuse `usernameCheck` and then do the additional thing in here.
 */
const usernameCheckForSignup = async ({
  username: usernameRaw,
  email,
}: {
  username: string;
  email: string;
}) => {
  const response = {
    available: true,
    premium: false,
    suggestedUsername: "",
  };

  const username = slugify(usernameRaw);

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
    select: {
      id: true,
      username: true,
      organizationId: true,
    },
  });

  if (user) {
    // TODO: When supporting multiple profiles of a user, we would need to check if the user has a membership with the correct organization
    const userIsAMemberOfAnOrg = await prisma.membership.findFirst({
      where: {
        userId: user.id,
        team: {
          isOrganization: true,
        },
      },
    });

    // When we invite an email, that doesn't match the orgAutoAcceptEmail, we create a user with organizationId=null.
    // The only way to differentiate b/w 'a new email that was invited to an Org' and 'a user that was created using regular signup' is to check if the user is a member of an org.
    // If username is in global namespace
    if (!userIsAMemberOfAnOrg) {
      const isClaimingAlreadySetUsername = user.username === username;
      const isClaimingUnsetUsername = !user.username;
      response.available = isClaimingUnsetUsername || isClaimingAlreadySetUsername;
      // There are premium users outside an organization only
      response.premium = await isPremiumUserName(username);
    }
    // If user isn't found, it's a direct signup and that can't be of an organization
  } else {
    response.premium = await isPremiumUserName(username);
    response.available = !(await isUsernameReservedDueToMigration(username));
  }

  // get list of similar usernames in the db
  const users = await prisma.user.findMany({
    where: {
      username: {
        contains: username,
      },
    },
    select: {
      username: true,
    },
  });

  // We only need suggestedUsername if the username is not available
  if (!response.available) {
    response.suggestedUsername = await generateUsernameSuggestion(
      users.map((user) => user.username).filter(notEmpty),
      username
    );
  }

  return response;
};

export { usernameHandler, usernameCheck, usernameCheckForSignup };
