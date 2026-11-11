import { eventTypeColor as eventTypeColorSchema } from "@calcom/prisma/zod-utils";
import type { z } from "zod";

type EventTypeColor = z.infer<typeof eventTypeColorSchema>;
export function isEventTypeColor(obj: unknown): obj is EventTypeColor {
  return eventTypeColorSchema.safeParse(obj).success;
}

export function parseEventTypeColor(obj: unknown): EventTypeColor {
  let eventTypeColor: EventTypeColor = null;
  if (isEventTypeColor(obj)) eventTypeColor = obj;

  return eventTypeColor;
}
