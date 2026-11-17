import { z } from "zod";
import slugify from "../slugify";

/**
 * Type definition for event type location
 * Moved from @calcom/prisma/zod-utils to avoid prisma imports in non-repository code
 */
export type EventTypeLocation = {
  type: string;
  address?: string;
  link?: string;
  displayLocationPublicly?: boolean;
  hostPhoneNumber?: string;
  credentialId?: number;
  teamName?: string;
  customLabel?: string;
};

/**
 * Schema for event type locations
 * Validates an array of location objects for event types
 */
export const eventTypeLocations: z.ZodType<EventTypeLocation[]> = z.array(
  z.object({
    // TODO: Couldn't find a way to make it a union of types from App Store locations
    // Creating a dynamic union by iterating over the object doesn't seem to make TS happy
    type: z.string(),
    address: z.string().optional(),
    link: z.string().url().optional(),
    displayLocationPublicly: z.boolean().optional(),
    hostPhoneNumber: z.string().optional(),
    credentialId: z.number().optional(),
    teamName: z.string().optional(),
    customLabel: z.string().optional(),
  })
);

/**
 * Schema for event type slug
 * Transforms and validates slugs for event types
 */
export const eventTypeSlug = z
  .string()
  .trim()
  .transform((val) => slugify(val))
  .refine((val) => val.length >= 1, {
    message: "Please enter at least one character",
  });
