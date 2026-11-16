import { verifyCodeUnAuthenticated } from "@calcom/features/auth/lib/verifyCodeUnAuthenticated";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { extractBaseEmail } from "@calcom/lib/extract-base-email";
import { getBlacklistedGuestEmails } from "@calcom/lib/getBlacklistedGuestEmails";
import prisma from "@calcom/prisma";

export const checkIfBookerEmailIsBlocked = async ({
  bookerEmail,
  loggedInUserId,
  verificationCode,
  isReschedule,
}: {
  bookerEmail: string;
  loggedInUserId?: number;
  verificationCode?: string;
  isReschedule: boolean;
}) => {
  const baseEmail = extractBaseEmail(bookerEmail);

  const blacklistedByEnv = getBlacklistedGuestEmails().includes(baseEmail.toLowerCase());

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        {
          email: baseEmail,
          emailVerified: {
            not: null,
          },
        },
        {
          secondaryEmails: {
            some: {
              email: baseEmail,
              emailVerified: {
                not: null,
              },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      email: true,
      requiresBookerEmailVerification: true,
    },
  });

  const blockedByUserSetting = user?.requiresBookerEmailVerification ?? false;
  const shouldBlock = !!blacklistedByEnv || (blockedByUserSetting && !isReschedule);

  if (!shouldBlock) {
    return false;
  }

  if (!user) {
    throw new ErrorWithCode(ErrorCode.BookerEmailBlocked, "Cannot use this email to create the booking.");
  }

  if (user.id !== loggedInUserId) {
    // If a verification code is provided, validate it
    if (verificationCode) {
      let isValid = false;

      try {
        isValid = await verifyCodeUnAuthenticated(baseEmail, verificationCode);
      } catch {
        throw new ErrorWithCode(
          ErrorCode.UnableToValidateVerificationCode,
          "There was an error validating the verification code"
        );
      }

      if (!isValid) {
        throw new ErrorWithCode(ErrorCode.InvalidVerificationCode, "Invalid verification code");
      }

      return false;
    }

    throw new ErrorWithCode(
      ErrorCode.BookerEmailRequiresLogin,
      `Attendee email has been blocked. Make sure to login as ${bookerEmail} to use this email for creating a booking.`,
      { email: bookerEmail }
    );
  }
};
