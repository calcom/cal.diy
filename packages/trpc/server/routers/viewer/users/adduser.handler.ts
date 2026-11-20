import { getUserRepository } from "@calcom/features/di/containers/UserRepository";
import { CreationSource } from "@calcom/prisma/enums";
import { isPrismaError } from "@calcom/lib/server/getServerErrorFromUnknown";
import type { TrpcSessionUser } from "../../../types";
import { userBodySchema } from "./_router";
import { SIGNUP_ERROR_CODES } from "@calcom/features/auth/signup/constants";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

type GetOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: z.infer<typeof userBodySchema>;
};

function getConstraintFields(error: unknown): string[] {
  const prismaError = error as {
    meta?: {
      target?: string[];
      driverAdapterError?: {
        cause?: {
          constraint?: {
            fields?: string[];
          };
        };
      };
    };
  };

  return prismaError.meta?.target ?? prismaError.meta?.driverAdapterError?.cause?.constraint?.fields ?? [];
}

const addUserHandler = async ({ input }: GetOptions) => {
  const userRepository = getUserRepository();
  try {
    const user = await userRepository.create({
      ...input,
      creationSource: CreationSource.WEBAPP,
      organizationId: null,
      locked: false,
    });

    return {
      user,
      message: `User with id: ${user.id} added successfully`,
    };
  } catch (error) {
    if (isPrismaError(error) && error.code === "P2002") {
      const constraintFields = getConstraintFields(error);
      throw new TRPCError({
        code: "CONFLICT",
        message: SIGNUP_ERROR_CODES.USER_ALREADY_EXISTS,
        cause: {
          fields: constraintFields,
        },
      });
    }
    throw error;
  }
};
export default addUserHandler;
