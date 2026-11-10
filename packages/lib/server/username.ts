import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import slugify from "@calcom/lib/slugify";
import prisma from "@calcom/prisma";
import { RedirectType } from "@calcom/prisma/enums";

import logger from "../logger";
import notEmpty from "../notEmpty";

const log = logger.getSubLogger({ prefix: ["server/username"] });

export const generateUsernameSuggestion = async (users: string[], username: string) => {
  const limit = username.length < 2 ? 9999 : 999;
  const suffix = (value: number) => String(value).padStart(3, "0");
  let rand = 1;
  while (users.includes(username + suffix(rand))) {
    rand = Math.ceil(1 + Math.random() * (limit - 1));
  }
  return username + suffix(rand);
};

const usernameCheck = async (usernameRaw: string, currentOrgDomain?: string | null) => {
  log.debug("usernameCheck", { usernameRaw, currentOrgDomain });
  const isCheckingUsernameInGlobalNamespace = !currentOrgDomain;
  const response = {
    available: true,
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
    }
    // If user isn't found, it's a direct signup and that can't be of an organization
  } else {
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

export { usernameCheck, usernameCheckForSignup };
