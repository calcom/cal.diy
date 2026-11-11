import { ErrorCode } from "@calcom/lib/errorCodes";

export class ErrorWithCode extends Error {
  code: ErrorCode;
  data?: Record<string, unknown>;
  constructor(code: ErrorCode, message?: string, data?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.data = data;
  }
  static get Factory() {
    return new Proxy(ErrorWithCode, {
      get(_, prop: string) {
        if (prop in ErrorCode) {
          const code = ErrorCode[prop as keyof typeof ErrorCode];
          return (message?: string, data?: Record<string, unknown>) => new ErrorWithCode(code, message, data);
        }
        throw new Error(`Unknown error code: ${prop}`);
      },
    }) as unknown as Record<
      keyof typeof ErrorCode,
      (message?: string, data?: Record<string, unknown>) => ErrorWithCode
    >;
  }
}

/**
 * Converts unknown error types to Error objects.
 *
 * @deprecated For server-side code, use `getServerErrorFromUnknown` from `@calcom/lib/server/getServerErrorFromUnknown` instead.
 * This function should only be used in client-side or isomorphic code (React components, shared utilities).
 *
 * Use this function when:
 * - You're in a React component that runs on the client
 * - You're in shared/isomorphic code that cannot import server-only dependencies
 * - You only need a basic Error object without HTTP status code mapping
 *
 * For server-side error handling (API routes, tRPC handlers, webhooks), use `getServerErrorFromUnknown`
 * which provides proper HTTP status code mapping, error redaction, and handles Zod/Prisma/Stripe errors.
 *
 * @param cause - The unknown error to convert
 * @returns An Error object with optional statusCode and code properties
 */
export function getErrorFromUnknown(cause: unknown): Error & { statusCode?: number; code?: string } {
  if (cause instanceof Error) {
    return cause;
  }
  if (typeof cause === "string") {
    // @ts-expect-error https://github.com/tc39/proposal-error-cause - must use @ts-expect-error because different packages have different TS lib targets
    return new Error(cause, { cause });
  }

  return new Error(`Unhandled error of type '${typeof cause}''`);
}

async function getResponseBody(response: Response): Promise<string> {
  try {
    const body = await response.text();
    if (body.length > 0) {
      try {
        const parsed = JSON.parse(body);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          typeof parsed.message === "string" &&
          parsed.message.length > 0
        ) {
          return parsed.message;
        }
        return body;
      } catch {
        return body;
      }
    }
    return response.statusText;
  } catch {
    return response.statusText;
  }
}

function statusCodeToErrorCode(status: number): ErrorCode {
  if (status === 400) return ErrorCode.BadRequest;
  if (status === 401) return ErrorCode.Unauthorized;
  if (status === 403) return ErrorCode.Forbidden;
  if (status === 404) return ErrorCode.NotFound;
  return ErrorCode.InternalServerError;
}

export async function handleErrorsJson<Type>(response: Response): Promise<Type> {
  if (!response.ok) {
    const body = await getResponseBody(response);
    throw new ErrorWithCode(statusCodeToErrorCode(response.status), `HTTP error ${response.status}: ${body}`);
  }

  if (response.headers.get("content-encoding") === "gzip") {
    const responseText = await response.text();
    return JSON.parse(responseText) as Type;
  }

  if (response.status === 204) {
    return {} as Type;
  }

  try {
    return await response.json();
  } catch {
    throw new ErrorWithCode(
      ErrorCode.InternalServerError,
      `Failed to parse response as JSON: ${response.status} ${response.statusText}`
    );
  }
}

export async function handleErrorsRaw(response: Response) {
  if (response.status === 204) {
    return "{}";
  }
  if (!response.ok) {
    const body = await getResponseBody(response);
    throw new ErrorWithCode(statusCodeToErrorCode(response.status), `HTTP error ${response.status}: ${body}`);
  }
  return response.text();
}
