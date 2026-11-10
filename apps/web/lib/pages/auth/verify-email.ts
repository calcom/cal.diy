import dayjs from "@calcom/dayjs";
import { OnboardingPathService } from "@calcom/features/onboarding/lib/onboarding-path.service";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { prisma } from "@calcom/prisma";
import { CreationSource, MembershipRole } from "@calcom/prisma/enums";
import { userMetadata } from "@calcom/prisma/zod-utils";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const verifySchema = z.object({
  token: z.string(),
});

const USER_ALREADY_EXISTING_MESSAGE = "A User already exists with this email";

// TODO: To be unit tested
export async function moveUserToMatchingOrg({ email }: { email: string }) {
  const organizationRepository = { findUniqueNonPlatformOrgsByMatchingAutoAcceptEmail: async (_args: { email: string }) => null as { id: number } | null };
  const org = await organizationRepository.findUniqueNonPlatformOrgsByMatchingAutoAcceptEmail({ email });

  if (!org) {
    return;
  }

  ({});
}

export async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { token } = verifySchema.parse(req.query);

  const foundToken = await prisma.verificationToken.findFirst({
    where: {
      token,
    },
  });

  if (!foundToken) {
    return res.status(401).json({ message: "No token found" });
  }

  if (dayjs(foundToken?.expires).isBefore(dayjs())) {
    return res.status(401).json({ message: "Token expired" });
  }

  // The user is verifying the secondary email
  if (foundToken?.secondaryEmailId) {
    await prisma.secondaryEmail.update({
      where: {
        id: foundToken.secondaryEmailId,
        email: foundToken?.identifier,
      },
      data: {
        emailVerified: new Date(),
      },
    });

    await cleanUpVerificationTokens(foundToken.id);

    return res.redirect(`${WEBAPP_URL}/settings/my-account/profile`);
  }

  const user = await prisma.user.findFirst({
    where: {
      email: foundToken?.identifier,
    },
  });

  if (!user) {
    return res.status(401).json({ message: "Cannot find a user attached to this token" });
  }

  const userMetadataParsed = userMetadata.parse(user.metadata);
  // Attach the new email and verify
  if (userMetadataParsed?.emailChangeWaitingForVerification) {
    // Ensure this email isn't in use
    const existingUser = await prisma.user.findUnique({
      where: { email: userMetadataParsed?.emailChangeWaitingForVerification },
      select: {
        id: true,
      },
    });
    if (existingUser) {
      return res.status(401).json({ message: USER_ALREADY_EXISTING_MESSAGE });
    }

    // Ensure this email isn't being added by another user as secondary email
    const existingSecondaryUser = await prisma.secondaryEmail.findUnique({
      where: {
        email: userMetadataParsed?.emailChangeWaitingForVerification,
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (existingSecondaryUser && existingSecondaryUser.userId !== user.id) {
      return res.status(401).json({ message: USER_ALREADY_EXISTING_MESSAGE });
    }

    const oldEmail = user.email;
    const updatedEmail = userMetadataParsed.emailChangeWaitingForVerification;
    delete userMetadataParsed.emailChangeWaitingForVerification;

    // Update and re-verify
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        email: updatedEmail,
        metadata: userMetadataParsed,
      },
    });

    // The user is trying to update the email to an already existing unverified secondary email of his
    // so we swap the emails and its verified status
    if (existingSecondaryUser?.userId === user.id) {
      await prisma.secondaryEmail.update({
        where: {
          id: existingSecondaryUser.id,
          userId: user.id,
        },
        data: {
          email: oldEmail,
          emailVerified: user.emailVerified,
        },
      });
    }

    await cleanUpVerificationTokens(foundToken.id);

    return res.status(200).json({
      updatedEmail,
    });
  }

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      emailVerified: new Date(),
    },
  });

  const hasCompletedOnboarding = user.completedOnboarding;

  await moveUserToMatchingOrg({ email: user.email });

  const gettingStartedPath = await OnboardingPathService.getGettingStartedPath();

  return res.redirect(`${WEBAPP_URL}${hasCompletedOnboarding ? "/event-types" : gettingStartedPath}`);
}

export async function cleanUpVerificationTokens(id: number) {
  // Delete token from DB after it has been used
  await prisma.verificationToken.delete({
    where: {
      id,
    },
  });
}
