import type { Prisma } from "@calcom/prisma/client";
import type { PartialReference } from "@calcom/types/EventManager";
import { z } from "zod";

/**
 * Identifies Office365 calendar references in booking seat metadata.
 *
 * @returns The Office365 calendar integration type key.
 */
export const OFFICE365_CALENDAR_TYPE = "office365_calendar";

const SEAT_CALENDAR_REFERENCES_KEY = "calcomSeatCalendarReferences";

const seatCalendarReferenceSchema = z.object({
  type: z.string(),
  uid: z.string(),
  meetingId: z.string().nullable().optional(),
  thirdPartyRecurringEventId: z.string().nullable().optional(),
  meetingPassword: z.string().nullable().optional(),
  meetingUrl: z.string().nullable().optional(),
  externalCalendarId: z.string().nullable().optional(),
  credentialId: z.number().nullable().optional(),
  delegationCredentialId: z.string().nullable().optional(),
});

const seatCalendarReferencesMetadataSchema = z
  .object({
    [SEAT_CALENDAR_REFERENCES_KEY]: z.record(z.string(), z.array(seatCalendarReferenceSchema)).optional(),
  })
  .passthrough();

/**
 * Converts booking seat metadata into a mutable Prisma JSON object.
 *
 * @param metadata - Existing metadata value from a booking seat.
 * @returns Metadata normalized as a Prisma input JSON object.
 */
const toMetadataObject = (
  metadata: Prisma.JsonValue | Prisma.InputJsonValue | Record<string, string> | null | undefined
): Prisma.InputJsonObject => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return Object.entries(metadata).reduce<Record<string, Prisma.InputJsonValue>>(
    /**
     * Copies defined metadata entries into the normalized metadata object.
     *
     * @param acc - Accumulated Prisma JSON metadata object.
     * @param entry - Metadata key and value pair to copy.
     * @returns Updated Prisma JSON metadata object.
     */
    (acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value as Prisma.InputJsonValue;
      }
      return acc;
    },
    {}
  );
};

/**
 * Converts a calendar reference into the storable seat metadata shape.
 *
 * @param reference - Calendar reference to persist on a booking seat.
 * @returns Calendar reference with nullable optional fields normalized.
 */
const toStorableSeatReference = (reference: PartialReference) => ({
  type: reference.type,
  uid: reference.uid,
  meetingId: reference.meetingId ?? null,
  thirdPartyRecurringEventId: reference.thirdPartyRecurringEventId ?? null,
  meetingPassword: reference.meetingPassword ?? null,
  meetingUrl: reference.meetingUrl ?? null,
  externalCalendarId: reference.externalCalendarId ?? null,
  credentialId: reference.credentialId ?? null,
  delegationCredentialId: reference.delegationCredentialId ?? null,
});

/**
 * Stores calendar references for a specific integration inside booking seat metadata.
 *
 * @param metadata - Existing booking seat metadata to extend.
 * @param integration - Calendar integration key to store references under.
 * @param references - Calendar references to store for the integration.
 * @returns Metadata containing the provided seat calendar references.
 */
export const withSeatCalendarReferences = ({
  metadata,
  integration,
  references,
}: {
  metadata: Prisma.JsonValue | Prisma.InputJsonValue | Record<string, string> | null | undefined;
  integration: string;
  references: PartialReference[];
}): Prisma.InputJsonObject => {
  const metadataObject = toMetadataObject(metadata);
  const parsedMetadata = seatCalendarReferencesMetadataSchema.safeParse(metadataObject);
  const referencesByIntegration = parsedMetadata.success
    ? { ...(parsedMetadata.data[SEAT_CALENDAR_REFERENCES_KEY] ?? {}) }
    : {};

  return {
    ...metadataObject,
    [SEAT_CALENDAR_REFERENCES_KEY]: {
      ...referencesByIntegration,
      [integration]: references.map(toStorableSeatReference),
    },
  };
};

/**
 * Reads calendar references for a specific integration from booking seat metadata.
 *
 * @param metadata - Booking seat metadata to inspect.
 * @param integration - Calendar integration key to read.
 * @returns Calendar references stored for the requested integration.
 */
export const getSeatCalendarReferences = (
  metadata: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined,
  integration: string
): PartialReference[] => {
  const parsedMetadata = seatCalendarReferencesMetadataSchema.safeParse(toMetadataObject(metadata));
  if (!parsedMetadata.success) {
    return [];
  }

  return parsedMetadata.data[SEAT_CALENDAR_REFERENCES_KEY]?.[integration] ?? [];
};
