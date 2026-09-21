import process from "node:process";
import { HttpError } from "@calcom/lib/http-error";
import { safeStringify } from "@calcom/lib/safeStringify";
import z from "zod";
import logger from "../../logger";

const log = logger.getSubLogger({ prefix: ["Vercel/DomainManager"] });
const vercelApiForProjectUrl = `https://api.vercel.com/v9/projects/${process.env.PROJECT_ID_VERCEL}`;
const vercelDomainApiResponseSchema = z.object({
  error: z
    .object({
      code: z.string().nullish(),
      domain: z.any().nullish(),
      message: z.string().nullish(),
      invalidToken: z.boolean().nullish(),
    })
    .optional(),
});

export const createDomain = async (domain: string) => {
  assertVercelEnvVars(process.env);
  log.info(`Creating domain in Vercel: ${domain}`);
  const response = await fetch(`${vercelApiForProjectUrl}/domains?teamId=${process.env.TEAM_ID_VERCEL}`, {
    body: JSON.stringify({ name: domain }),
    headers: {
      Authorization: `Bearer ${process.env.AUTH_BEARER_TOKEN_VERCEL}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const responseJson = await response.json();

  const parsedResponse = vercelDomainApiResponseSchema.safeParse(responseJson);

  if (!parsedResponse.success) {
    // Looks like Vercel changed the response format, so sometimes zod parsing fails
    log.error(
      safeStringify({
        errorMessage: "Failed to parse Vercel domain creation response",
        zodError: parsedResponse.error,
        response: responseJson,
      })
    );
    // Let's consider domain creation failed
    return false;
  }

  if (!parsedResponse.data.error) {
    return true;
  }

  return handleDomainCreationError(parsedResponse.data.error);
};

export const deleteDomain = async (domain: string) => {
  log.info(`Deleting domain in Vercel: ${domain}`);
  assertVercelEnvVars(process.env);

  const response = await fetch(
    `${vercelApiForProjectUrl}/domains/${domain}?teamId=${process.env.TEAM_ID_VERCEL}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.AUTH_BEARER_TOKEN_VERCEL}`,
      },
      method: "DELETE",
    }
  );

  const data = vercelDomainApiResponseSchema.parse(await response.json());
  if (!data.error) {
    return true;
  }

  return handleDomainDeletionError(data.error);
};

function handleDomainCreationError(error: {
  code?: string | null;
  domain?: string | null;
  message?: string | null;
  invalidToken?: boolean | null;
}) {
  // Vercel returns "forbidden" for various permission issues, not just domain ownership
  if (error.code === "forbidden") {
    const errorMessage =
      "Vercel denied permission to manage this domain. Please verify your Vercel project, team, and domain permissions.";
    log.error(
      safeStringify({
        errorMessage,
        vercelError: error,
      })
    );
    throw new HttpError({
      message: errorMessage,
      statusCode: 400,
    });
  }

  if (error.code === "domain_taken") {
    const errorMessage = "Domain is already being used by a different project";
    log.error(
      safeStringify({
        errorMessage,
        vercelError: error,
      })
    );
    throw new HttpError({
      message: errorMessage,
      statusCode: 400,
    });
  }

  if (error.code === "domain_already_in_use") {
    // Domain is already configured correctly, this is not an error when it happens during creation as it could be re-attempt to create an existing domain
    return true;
  }

  const errorMessage = `Failed to create domain on Vercel: ${error.domain}`;
  log.error(safeStringify({ errorMessage, vercelError: error }));
  throw new HttpError({
    message: errorMessage,
    statusCode: 400,
  });
}

function handleDomainDeletionError(error: {
  code?: string | null;
  domain?: string | null;
  message?: string | null;
  invalidToken?: boolean | null;
}) {
  if (error.code === "not_found") {
    // Domain is already deleted
    return true;
  }

  // Vercel returns "forbidden" for various permission issues, not just domain ownership
  if (error.code === "forbidden") {
    const errorMessage =
      "Vercel denied permission to manage this domain. Please verify your Vercel project, team, and domain permissions.";
    log.error(
      safeStringify({
        errorMessage,
        vercelError: error,
      })
    );
    throw new HttpError({
      message: errorMessage,
      statusCode: 400,
    });
  }

  const errorMessage = `Failed to take action for domain: ${error.domain}`;
  log.error(safeStringify({ errorMessage, vercelError: error }));
  throw new HttpError({
    message: errorMessage,
    statusCode: 400,
  });
}

function assertVercelEnvVars(env: typeof process.env): asserts env is {
  PROJECT_ID_VERCEL: string;
  TEAM_ID_VERCEL: string;
  AUTH_BEARER_TOKEN_VERCEL: string;
} & typeof process.env {
  if (!env.PROJECT_ID_VERCEL) {
    throw new Error("Missing env var: PROJECT_ID_VERCEL");
  }

  // TEAM_ID_VERCEL is optional

  if (!env.AUTH_BEARER_TOKEN_VERCEL) {
    throw new Error("Missing env var: AUTH_BEARER_TOKEN_VERCEL");
  }
}
