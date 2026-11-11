import logger from "@calcom/lib/logger";

import { IS_PRODUCTION } from "./constants";
import { safeStringify } from "./safeStringify";

const log = logger.getSubLogger({ prefix: [`[redactError]`] });

// Prisma error codes are always "P" followed by exactly four digits (P1001, P2002, P6100...).
// Matching on the "P" prefix alone would also swallow unrelated codes such as PARSE_ERROR or
// PERMISSION_DENIED and report them to the caller as database failures.
const PRISMA_ERROR_CODE = /^P\d{4}$/;

function shouldRedact(error: Error): boolean {
  if (/Prisma/i.test(error.name || "")) {
    return true;
  }
  const { code } = error as { code?: unknown };
  return typeof code === "string" && PRISMA_ERROR_CODE.test(code);
}

/**
 * Redacts sensitive database errors (such as Prisma errors) in production environments
 * to prevent leaking internal database schema, connection strings, or query details to end users,
 * while safely serializing and logging the full error details to server logs.
 *
 * @param error - The error or unknown value caught in server handlers.
 * @returns A generic safe Error if redacted in production, or the original error/value otherwise.
 */
export const redactError = <T extends Error | unknown>(error: T): T | Error => {
  if (!(error instanceof Error)) {
    return error;
  }
  log.debug("Type of Error: ", error.constructor);
  if (shouldRedact(error) && IS_PRODUCTION) {
    log.error("Error: ", safeStringify(error));
    return new Error("An error occurred while querying the database.");
  }
  return error;
};
