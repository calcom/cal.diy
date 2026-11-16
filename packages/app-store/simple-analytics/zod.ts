import { eventTypeAppCardZod } from "@calcom/app-store/eventTypeAppCardZod";
import { z } from "zod";

const toggle = z.enum(["true", "false"]).optional();

export const appDataSchema = eventTypeAppCardZod
  .merge(
    z.object({
      HOSTNAME: z.string().optional(),
      COLLECT_DNT: toggle,
      BOOKING_EVENTS: toggle,
    })
  )
  .refine((data) => !data.enabled || data.HOSTNAME?.trim(), {
    message: "A hostname is required to enable Simple Analytics",
    path: ["HOSTNAME"],
  });

export const appKeysSchema = z.object({});
