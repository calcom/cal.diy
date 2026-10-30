import logger from "@calcom/lib/logger";

import { IS_PRODUCTION } from "./constants";

const log = logger.getSubLogger({ prefix: [`[redactError]`] });

function shouldRedact(error: Error) {
  const n = error.name || "";
  return /Prisma/i.test(n);
}

export interface RedactedPrismaError extends Error {
  code?: string;
}

export const redactError = <T extends Error | unknown>(error: T) => {
  if (!(error instanceof Error)) {
    return error;
  }
  log.debug("Type of Error: ", error.constructor);
  if (shouldRedact(error) && IS_PRODUCTION) {
    log.error("Error: ", JSON.stringify(error));
    const redacted: RedactedPrismaError = new Error("An error occurred while querying the database.");
    if ("code" in error && typeof error.code === "string") {
      redacted.code = error.code;
    }
    return redacted;
  }
  return error;
};
