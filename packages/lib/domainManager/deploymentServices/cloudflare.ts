import process from "node:process";
import { HttpError } from "@calcom/lib/http-error";
import { safeStringify } from "@calcom/lib/safeStringify";
import z from "zod";
import logger from "../../logger";

const log = logger.getSubLogger({ prefix: ["cloudflare/deploymentService"] });

// TODO: This and other settings should really come from DB when admin allows configuring which deployment services to use for the organization
const IS_RECORD_PROXIED = true;
const AUTOMATIC_TTL = 1;

const ERROR_CODE_CNAME_ALREADY_EXISTS = 81053;
const ERROR_CODE_RECORD_ALREADY_EXISTS = 81057;
const ERROR_CODE_RECORD_DOES_NOT_EXIST = 81044;

const cloudflareApiForZoneUrl = `https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}`;
const cloudflareDnsRecordApiResponseSchema = z
  .object({
    success: z.boolean().optional(),
    errors: z
      .array(
        z
          .object({
            code: z.number(),
          })
          .passthrough()
      )
      .nullish(),
    result: z
      .object({
        id: z.string(),
      })
      .nullish(),
  })
  .passthrough();

export const addDnsRecord = async (domain: string) => {
  assertCloudflareEnvVars(process.env);
  log.info(`Creating dns-record in Cloudflare: ${domain}`);
  const data = await api(
    `${cloudflareApiForZoneUrl}/dns_records`,
    {
      method: "POST",
      body: JSON.stringify({
        type: "CNAME",
        proxied: IS_RECORD_PROXIED,
        name: domain,
        content: process.env.CLOUDFLARE_VERCEL_CNAME,
        ttl: AUTOMATIC_TTL,
      }),
    },
    cloudflareDnsRecordApiResponseSchema
  );

  if (!data.success) {
    if (isRecordAlreadyExistError(data.errors)) {
      log.info(`CNAME already exists in Cloudflare: ${domain}`);
      return true;
    }
    const errorMessage = `Failed to create dns-record in Cloudflare: ${domain}`;
    log.error(
      safeStringify({
        errorMessage,
        response: data,
      })
    );
    throw new HttpError({
      message: errorMessage,
      statusCode: 400,
    });
  }
  log.info(`Created dns-record in Cloudflare: ${domain}`);
  return true;
};

export const deleteDnsRecord = async (domain: string) => {
  log.info(`Deleting dns-record in Cloudflare: ${domain}`);
  assertCloudflareEnvVars(process.env);

  const dnsRecordToDelete = await getDnsRecordToDelete();
  if (dnsRecordToDelete) {
    await deleteDnsRecord(dnsRecordToDelete);
    log.info(`Deleted dns-record in Cloudflare: ${domain}`);
  } else {
    log.info(`CNAME not found in Cloudflare: ${domain}. Nothing to delete`);
  }

  return true;

  async function getDnsRecordToDelete() {
    // Get the dns-record id from dns_records list API
    const searchResult = await api(
      `${cloudflareApiForZoneUrl}/dns_records?name=${domain}`,
      {
        method: "GET",
      },
      z
        .object({
          success: z.boolean().optional(),
          result: z
            .array(
              z
                .object({
                  id: z.string(),
                })
                .passthrough()
            )
            .nullish(),
        })
        .passthrough()
    );

    if (!searchResult.success || !searchResult.result) {
      log.error(
        safeStringify({
          errorMessage: `Failed to search for dns-record in Cloudflare for ${domain}`,
          searchData: searchResult,
        })
      );
      throw new HttpError({
        message: `Something went wrong.`,
        statusCode: 500,
      });
    }

    if (searchResult.result.length > 1) {
      log.error(
        safeStringify({
          errorMessage: `Found more than one dns-record in Cloudflare for ${domain}`,
          searchData: searchResult,
        })
      );
      throw new HttpError({
        message: `Something went wrong.`,
        statusCode: 400,
      });
    }

    return searchResult.result[0] as (typeof searchResult.result)[0] | null;
  }

  async function deleteDnsRecord(dnsRecordToDelete: { id: string }) {
    const deletionResult = await api(
      `${cloudflareApiForZoneUrl}/dns_records/${dnsRecordToDelete.id}`,
      {
        method: "DELETE",
      },
      cloudflareDnsRecordApiResponseSchema
    );

    if (!deletionResult.success) {
      if (isRecordNotExistingError(deletionResult.errors)) {
        log.info(`CNAME already deleted: ${domain}`);
        return true;
      }
      log.error(
        `Failed to delete dns-record in Cloudflare: ${domain}`,
        safeStringify({
          deletionResult,
        })
      );
      throw new HttpError({
        message: "Something went wrong.",
        statusCode: 400,
      });
    }

    log.info(`Deleted dns-record in Cloudflare: ${domain}`);
    return true;
  }
};

async function api<T extends z.ZodType<unknown>>(
  url: string,
  {
    method,
    body,
  }: {
    body?: string;
    method: "POST" | "GET" | "DELETE";
  },
  responseSchema: T
): Promise<z.infer<T>> {
  const response = await fetch(url, {
    method: method,
    headers: {
      Authorization: `Bearer ${process.env.AUTH_BEARER_TOKEN_CLOUDFLARE}`,
      "Content-Type": "application/json",
    },
    body,
  });

  const result = await response.json();
  const dataParsed = responseSchema.safeParse(result);

  if (!dataParsed.success) {
    log.error(
      "Error parsing",
      safeStringify({
        dnsAddResult: result,
      })
    );
    throw new HttpError({
      message: "Something went wrong",
      statusCode: 500,
    });
  }
  return dataParsed.data;
}

function assertCloudflareEnvVars(env: typeof process.env): asserts env is {
  CLOUDFLARE_VERCEL_CNAME: string;
  CLOUDFLARE_ZONE_ID: string;
  AUTH_BEARER_TOKEN_CLOUDFLARE: string;
} & typeof process.env {
  if (!env.CLOUDFLARE_VERCEL_CNAME) {
    throw new Error("Missing env var: CLOUDFLARE_VERCEL_CNAME");
  }

  if (!env.CLOUDFLARE_ZONE_ID) {
    throw new Error("Missing env var: CLOUDFLARE_ZONE_ID");
  }

  if (!env.AUTH_BEARER_TOKEN_CLOUDFLARE) {
    throw new Error("Missing env var: AUTH_BEARER_TOKEN_CLOUDFLARE");
  }
}

const isRecordAlreadyExistError = (errors: { code: number }[] | undefined | null) =>
  errors?.every(
    (error) =>
      error.code === ERROR_CODE_CNAME_ALREADY_EXISTS || error.code === ERROR_CODE_RECORD_ALREADY_EXISTS
  );

const isRecordNotExistingError = (errors: { code: number }[] | undefined | null) =>
  errors?.every((error) => error.code === ERROR_CODE_RECORD_DOES_NOT_EXIST);
