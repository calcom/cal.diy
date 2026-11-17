import logger from "@calcom/lib/logger";
import { IS_PRODUCTION } from "./constants";

const log = logger.getSubLogger({ prefix: [`[redactError]`] });

/**
 * Determines whether a given error originated from Prisma and should be redacted in production.
 *
 * @param error - The error instance to evaluate.
 * @returns True if the error is identified as a Prisma error by name or error code prefix.
 */
function shouldRedact(error: Error) {
  const n = error.name || "";
  return (
    /Prisma/i.test(n) || ("code" in error && typeof error.code === "string" && error.code.startsWith("P"))
  );
}

/**
 * Redacts database error details in production environments to avoid leaking internal query
 * or schema details, while preserving machine-readable error codes (e.g. Prisma P2002) for downstream handling.
 *
 * @param error - The caught error which may be an Error instance or unknown value.
 * @returns A sanitized Error in production, or the original error in non-production environments.
 */
export const redactError = <T extends Error | unknown>(error: T) => {
  if (!(error instanceof Error)) {
    return error;
  }
  log.debug("Type of Error: ", error.constructor);
  if (shouldRedact(error) && IS_PRODUCTION) {
    let code = "unknown";
    if ("code" in error && typeof error.code === "string" && error.code.startsWith("P")) {
      code = error.code;
    }
    log.error("Error code: ", code);
    const redacted = new Error("An error occurred while querying the database.");
    if ("code" in error && typeof error.code === "string") {
      (redacted as Error & { code?: string }).code = error.code;
    }
    return redacted;
  }
  return error;
};
