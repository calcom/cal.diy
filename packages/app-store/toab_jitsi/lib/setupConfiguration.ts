// Next.js API route reference: https://nextjs.org/docs/pages/building-your-application/routing/api-routes
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { locationResponseSchema, setupResponseSchema } from "../zod";

type SetupConfiguration = ReturnType<typeof setupResponseSchema.parse>;
type LocationConfiguration = ReturnType<typeof locationResponseSchema.parse>;

const CACHE_TTL_MS: number = 5 * 60 * 1000;
const cachedConfigurations: Map<number, { value: SetupConfiguration; expiresAt: number }> = new Map();
const pendingRequests: Map<number, Promise<SetupConfiguration>> = new Map();

/** Load and cache server configuration for an event type for up to five minutes. */
export function loadSetupConfiguration(eventTypeId: number): Promise<SetupConfiguration> {
  const cached = cachedConfigurations.get(eventTypeId);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
  if (cached) cachedConfigurations.delete(eventTypeId);

  const pendingRequest = pendingRequests.get(eventTypeId);
  if (pendingRequest) return pendingRequest;

  const request = fetch(`/api/integrations/toab_jitsi/config?eventTypeId=${eventTypeId}`).then(
    async (response) => {
      if (!response.ok) throw new Error("Could not load TOAB Jitsi configuration");
      return setupResponseSchema.parse(await response.json());
    }
  );

  pendingRequests.set(eventTypeId, request);
  const clearPendingRequest = (): void => {
    if (pendingRequests.get(eventTypeId) === request) pendingRequests.delete(eventTypeId);
  };
  void request.then((value) => {
    cachedConfigurations.set(eventTypeId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    clearPendingRequest();
  }, clearPendingRequest);

  return request;
}

/** Fetch and validate whether TOAB Jitsi is enabled for an event type. */
export async function loadLocationConfiguration(eventTypeId: number): Promise<LocationConfiguration> {
  try {
    const response = await fetch(`/api/integrations/toab_jitsi/location?eventTypeId=${eventTypeId}`);
    if (!response.ok) throw new Error("Could not check the TOAB Jitsi event type location");
    return locationResponseSchema.parse(await response.json());
  } catch {
    throw new ErrorWithCode(
      ErrorCode.InternalServerError,
      "Could not check the TOAB Jitsi event type location"
    );
  }
}

export type { LocationConfiguration, SetupConfiguration };
