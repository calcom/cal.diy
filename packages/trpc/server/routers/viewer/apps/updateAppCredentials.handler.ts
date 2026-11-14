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

const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const sanitizeJsonValue = (value: unknown): Prisma.JsonValue | undefined => {
  if (value === null || value === undefined) {
    return value as null | undefined;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item) ?? null) as Prisma.JsonArray;
  }

  if (typeof value === "object") {
    const sanitized: Prisma.JsonObject = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (FORBIDDEN_JSON_KEYS.has(key)) {
        continue;
      }

      const sanitizedValue = sanitizeJsonValue(nestedValue);
      if (sanitizedValue !== undefined) {
        sanitized[key] = sanitizedValue;
      }
    }

    return sanitized;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return undefined;
};

export const sanitizeJsonObject = (value: unknown): Prisma.JsonObject => {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const sanitized = sanitizeJsonValue(value);
  return sanitized !== null && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? (sanitized as Prisma.JsonObject)
    : {};
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
    select: {
      id: true,
      appId: true,
      key: true,
    },
  });

  // Check if credential exists
  if (!credential) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Could not find credential ${input.credentialId}`,
    });
  }

  const validatedKeys = await handleCustomValidations({ ctx, input, appId: credential.appId || "" });

  const existingKey = sanitizeJsonObject(credential.key);
  const sanitizedValidatedKeys = sanitizeJsonObject(validatedKeys);

  const updated = await prisma.credential.update({
    where: {
      id: credential.id,
    },
    data: {
      key: {
        ...existingKey,
        ...sanitizedValidatedKeys,
      },
    },
    select: {
      id: true,
    },
  });

  return !!updated;
};
