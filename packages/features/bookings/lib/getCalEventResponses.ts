import type z from "zod";

import type { bookingResponsesDbSchema } from "@calcom/features/bookings/lib/getBookingResponsesSchema";
import { SystemField } from "@calcom/lib/bookings/SystemField";
import { contructEmailFromPhoneNumber } from "@calcom/lib/contructEmailFromPhoneNumber";
import { getBookingWithResponses } from "@calcom/lib/getBooking";
import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import type { EventType, Prisma } from "@calcom/prisma/client";
import { eventTypeBookingFields } from "@calcom/prisma/zod-utils";
import type { CalendarEvent } from "@calcom/types/Calendar";

const log = logger.getSubLogger({ prefix: ["[getCalEventResponses]"] });

export const getCalEventResponses = ({
  bookingFields,
  booking,
  responses,
  seatsEnabled,
}: {
  // If the eventType has been deleted and a booking is Accepted later on, then bookingFields will be null and we can't know the label of fields. So, we should store the label as well in the DB
  // Also, it is no longer straightforward to identify if a field is system field or not
  bookingFields: z.infer<typeof eventTypeBookingFields> | EventType["bookingFields"] | null;
  booking?: Prisma.BookingGetPayload<{
    select: {
      description: true;
      customInputs: true;
      attendees: {
        select: {
          email: true;
          name: true;
        };
      };
      location: true;
      responses: true;
    };
  }>;
  responses?: z.infer<typeof bookingResponsesDbSchema>;
  seatsEnabled?: boolean;
}) => {
  const calEventUserFieldsResponses = {} as NonNullable<CalendarEvent["userFieldsResponses"]>;
  const calEventResponses = {} as NonNullable<CalendarEvent["responses"]>;
  const parsedBookingFields = bookingFields ? eventTypeBookingFields.parse(bookingFields) : null;

  const backwardCompatibleResponses =
    responses ?? (booking ? getBookingWithResponses(booking).responses : null);
  if (!backwardCompatibleResponses) throw new Error("Couldn't get responses");

  // To set placeholder email for the booking
  if (!backwardCompatibleResponses.email) {
    const emailFromPhoneNumber =
      typeof backwardCompatibleResponses["attendeePhoneNumber"] === "string"
        ? contructEmailFromPhoneNumber(backwardCompatibleResponses["attendeePhoneNumber"])
        : "";

    // An optional phone field left empty, or one holding no digits, leaves nothing to identify the
    // attendee by — the same situation as the field being absent altogether.
    if (!emailFromPhoneNumber) {
      log.error(`backwardCompatibleResponses: ${JSON.stringify(backwardCompatibleResponses)}`, {
        responses,
        bookingResponses: booking?.responses,
      });
      throw new HttpError({
        statusCode: 400,
        message: "Both Phone and Email are missing",
      });
    }

    backwardCompatibleResponses.email = emailFromPhoneNumber;
  }

  if (parsedBookingFields) {
    parsedBookingFields.forEach((field) => {
      const label = field.label || field.defaultLabel;
      if (!label) {
        //TODO: This error must be thrown while saving event-type so that such an event-type can't be saved
        log.error(`Missing label for booking field "${field.name}"`);
        return;
      }

      if (field.name == "guests" && !!seatsEnabled) {
        backwardCompatibleResponses[field.name] = [];
      }

      if (field.editable === "user" || field.editable === "user-readonly") {
        calEventUserFieldsResponses[field.name] = {
          label,
          value: backwardCompatibleResponses[field.name],
          isHidden: !!field.hidden,
        };
      }

      calEventResponses[field.name] = {
        label,
        value: backwardCompatibleResponses[field.name],
        isHidden: !!field.hidden,
      };
    });
  } else {
    // Alternative way to generate for a booking of whose eventType has been deleted
    for (const [name, value] of Object.entries(backwardCompatibleResponses)) {
      const isSystemField = SystemField.safeParse(name);

      // Use name for Label because we don't have access to the label. This will not be needed once we start storing the label along with the response
      const label = name;

      if (!isSystemField.success) {
        calEventUserFieldsResponses[name] = {
          label,
          value,
        };
      }

      calEventResponses[name] = {
        label,
        value,
      };
    }
  }
  return { userFieldsResponses: calEventUserFieldsResponses, responses: calEventResponses };
};
