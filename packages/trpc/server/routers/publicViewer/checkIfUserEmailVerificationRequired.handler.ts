import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { extractBaseEmail } from "@calcom/lib/extract-base-email";
import { getBlacklistedGuestEmails } from "@calcom/lib/getBlacklistedGuestEmails";
import logger from "@calcom/lib/logger";
import { prisma } from "@calcom/prisma";

import type { TUserEmailVerificationRequiredSchema } from "./checkIfUserEmailVerificationRequired.schema";

const log = logger.getSubLogger({ prefix: ["checkIfUserEmailVerificationRequired"] });

export const userWithEmailHandler = async ({ input }: { input: TUserEmailVerificationRequiredSchema }) => {
  return checkEmailVerificationRequired(input);
};

export const checkEmailVerificationRequired = async ({
  userSessionEmail,
  email,
}: {
  userSessionEmail?: string;
  email: string;
}) => {
  const baseEmail = extractBaseEmail(email);

  const blacklistedEmail = getBlacklistedGuestEmails().find(
    (guestEmail) => guestEmail === baseEmail.toLowerCase()
  );

  if (!!blacklistedEmail && blacklistedEmail !== userSessionEmail?.toLowerCase()) {
    log.warn(`blacklistedEmail: ${blacklistedEmail}`);
    return true;
  }

  const userRepo = new UserRepository(prisma);
  const users = await userRepo.findManyByEmailsWithEmailVerificationSettings({ emails: [baseEmail] });
  const user = users[0];

  if (user?.requiresBookerEmailVerification && baseEmail.toLowerCase() !== userSessionEmail?.toLowerCase()) {
    log.warn(`user email requiring verification: ${baseEmail}`);
    return true;
  }

  return false;
};

export default userWithEmailHandler;
