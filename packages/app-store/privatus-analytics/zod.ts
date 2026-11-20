import { z } from "zod";
import { eventTypeAppCardZod } from "../eventTypeAppCardZod";

// Privatus Analytics site IDs look like "pa_" followed by letters and numbers, e.g. pa_7Q2K9XH3AB
export const PRIVATUS_SITE_ID_REGEX = /^pa_[A-Za-z0-9]+$/;

export const appDataSchema = eventTypeAppCardZod.merge(
  z.object({
    trackingId: z
      .string()
      .regex(PRIVATUS_SITE_ID_REGEX, "Site ID must start with pa_ followed by letters and numbers")
      .or(z.literal(""))
      .default("")
      .optional(),
  })
);

export const appKeysSchema = z.object({});
