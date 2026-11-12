import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { TRPCError } from "@trpc/server";
import type { TrpcSessionUser } from "../../../types";
import type { TUpdateAppCredentialsInputSchema } from "./updateAppCredentials.schema";

export type UpdateAppCredentialsOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TUpdateAppCredentialsInputSchema;
};

const FORBIDDEN_KEYS: Set<string> = new Set(["__proto__", "constructor", "prototype"]);

const sanitizeJsonValue = (value: unknown): Prisma.JsonValue => {
  if (Array.isArray(value)) {
    return value.map(sanitizeJsonValue);
  }
  if (typeof value === "object" && value !== null) {
    return sanitizeJsonObject(value);
  }
  return value as Prisma.JsonValue;
};

export const sanitizeJsonObject = (value: unknown): Prisma.JsonObject => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const result: Prisma.JsonObject = {};
  for (const [key, val] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    result[key] = sanitizeJsonValue(val);
  }
  return result;
};

const validators = {
  paypal: () => import("@calcom/paypal/lib/updateAppCredentials.validator"),
};

export const handleCustomValidations = async ({
  input,
  appId,
}: UpdateAppCredentialsOptions & { appId: string }) => {
  const { key } = input;
  const validatorGetter = validators[appId as keyof typeof validators];
  // If no validator is found, return the key as is
  if (!validatorGetter) return key;
  try {
    const validator = (await validatorGetter()).default;
    return await validator({ input });
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "Validation failed",
    });
  }
};

export const updateAppCredentialsHandler = async ({ ctx, input }: UpdateAppCredentialsOptions) => {
  const { user } = ctx;

  // Find user credential
  const credential = await prisma.credential.findFirst({
    where: {
      id: input.credentialId,
      userId: user.id,
    },
    select: { id: true, appId: true, key: true },
  });
  // Check if credential exists
  if (!credential) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Could not find credential ${input.credentialId}`,
    });
  }

  const validatedKeys = await handleCustomValidations({ ctx, input, appId: credential.appId || "" });

  const updated = await prisma.credential.update({
    where: {
      id: credential.id,
    },
    data: {
      key: {
        ...sanitizeJsonObject(credential.key),
        ...sanitizeJsonObject(validatedKeys),
      },
    },
    select: { id: true },
  });

  return !!updated;
};
