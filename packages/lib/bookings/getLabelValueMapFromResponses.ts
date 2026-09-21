import { SMS_REMINDER_NUMBER_FIELD, TITLE_FIELD } from "@calcom/lib/bookings/SystemField";
import type { dbReadResponseSchema as bookingResponse } from "@calcom/lib/dbReadResponseSchema";
import type { Prisma } from "@calcom/prisma/client";
import type { CalEventResponses } from "@calcom/types/Calendar";
import type z from "zod";

export default function getLabelValueMapFromResponses(
  calEvent: {
    customInputs?: Prisma.JsonObject | null;
    userFieldsResponses?: CalEventResponses | null;
    responses?: CalEventResponses | null;
    eventTypeId?: number | null;
  },
  isOrganizer = false
) {
  const { customInputs, userFieldsResponses, responses, eventTypeId } = calEvent;

  const isDynamicEvent = !eventTypeId;

  let labelValueMap: Record<string, z.infer<typeof bookingResponse>> = {};
  if (userFieldsResponses) {
    if (!!responses?.[TITLE_FIELD] && !isDynamicEvent) {
      userFieldsResponses[TITLE_FIELD] = responses[TITLE_FIELD];
    }
    if (!!responses?.[SMS_REMINDER_NUMBER_FIELD] && !isDynamicEvent) {
      userFieldsResponses[SMS_REMINDER_NUMBER_FIELD] = responses[SMS_REMINDER_NUMBER_FIELD];
    }

    for (const [, value] of Object.entries(userFieldsResponses)) {
      if (!value.label || (!isOrganizer && value.isHidden)) {
        continue;
      }
      labelValueMap[value.label] = value.value;
    }
  } else {
    labelValueMap = customInputs as Record<string, string | string[]>;
  }
  return labelValueMap;
}
