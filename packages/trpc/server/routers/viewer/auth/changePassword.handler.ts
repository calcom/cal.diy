import { validPassword } from "@calcom/features/auth/lib/validPassword";
import { verifyPassword } from "@calcom/features/auth/lib/verifyPassword";
import { hashPassword } from "@calcom/lib/auth/hashPassword";
import { isPasswordValid } from "@calcom/lib/auth/isPasswordValid";
import { prisma } from "@calcom/prisma";
import { IdentityProvider } from "@calcom/prisma/enums";

import { TRPCError } from "@trpc/server";

import type { TrpcSessionUser } from "../../../types";
import type { TChangePasswordInputSchema } from "./changePassword.schema";

type ChangePasswordOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TChangePasswordInputSchema;
};

export const changePasswordHandler = async ({ input, ctx }: ChangePasswordOptions) => {
  const { oldPassword, newPassword } = input;

  const { user } = ctx;

  if (user.identityProvider !== IdentityProvider.CAL) {
    const userWithPassword = await prisma.user.findUnique({
      where: {
        id: user.id,
      },
      select: {
        password: true,
      },
    });
    if (!userWithPassword?.password?.hash) {
      throw new TRPCError({ code: "FORBIDDEN", message: "THIRD_PARTY_IDENTITY_PROVIDER_ENABLED" });
    }
  }

  const currentPasswordQuery = await prisma.userPassword.findUnique({
    where: { userId: user.id },
  });

  const currentPassword = currentPasswordQuery?.hash;

  if (!currentPassword) {
    throw new TRPCError({ code: "NOT_FOUND", message: "MISSING_PASSWORD" });
  }

  const passwordsMatch = await verifyPassword(oldPassword, currentPassword);
  if (!passwordsMatch) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "incorrect_password" });
  }

  if (oldPassword === newPassword) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "new_password_matches_old_password" });
  }

  if (!validPassword(newPassword)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "password_hint_min" });
  }

  const hashedPassword = await hashPassword(newPassword);
  const adminPasswordMeetsRequirements = isPasswordValid(newPassword, false, true);
  await prisma.userPassword.upsert({
    where: {
      userId: user.id,
    },
    create: {
      hash: hashedPassword,
      userId: user.id,
      adminPasswordMeetsRequirements,
    },
    update: {
      hash: hashedPassword,
      adminPasswordMeetsRequirements,
    },
  });
};
