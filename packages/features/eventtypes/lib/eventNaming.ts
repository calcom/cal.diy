import { guessEventLocationType } from "@calcom/app-store/locations";
import type { Prisma } from "@calcom/prisma/client";
import type { TFunction } from "i18next";
import z from "zod";

export const nameObjectSchema = z.object({
  firstName: z.string(),
  lastName: z.string().optional(),
});

function parseName(name: z.infer<typeof nameObjectSchema> | string | undefined) {
  if (typeof name === "string") return name;
  else if (typeof name === "object" && nameObjectSchema.parse(name))
    return `${name.firstName} ${name.lastName}`.trim();
  else return "Nameless";
}

export type EventNameObjectType = {
  attendeeName: z.infer<typeof nameObjectSchema> | string;
  eventType: string;
  eventName?: string | null;
  teamName?: string | null;
  host: string;
  location?: string | null;
  eventDuration: number;
  bookingFields?: Prisma.JsonObject | null;
  t: TFunction;
};

export function getEventName(eventNameObj: EventNameObjectType, forAttendeeView = false) {
  const attendeeName = parseName(eventNameObj.attendeeName);

  if (!eventNameObj.eventName)
    return eventNameObj.t("event_between_users", {
      eventName: eventNameObj.eventType,
      host: eventNameObj.teamName || eventNameObj.host,
      attendeeName,
      interpolation: {
        escapeValue: false,
      },
    });

  let eventName = eventNameObj.eventName;
  let locationString = eventNameObj.location || "";

  if (eventNameObj.eventName.includes("{Location}") || eventNameObj.eventName.includes("{LOCATION}")) {
    const eventLocationType = guessEventLocationType(eventNameObj.location);
    if (eventLocationType) {
      locationString = eventLocationType.label;
    }
    eventName = eventName.replace("{Location}", locationString);
    eventName = eventName.replace("{LOCATION}", locationString);
  }

  let dynamicEventName = eventName
    // Need this for compatibility with older event names
    .replaceAll("{Event type title}", eventNameObj.eventType)
    .replaceAll("{Scheduler}", attendeeName)
    .replaceAll("{Organiser}", eventNameObj.host)
    .replaceAll("{Organiser first name}", eventNameObj.host.split(" ")[0])
    .replaceAll("{USER}", attendeeName)
    .replaceAll("{ATTENDEE}", attendeeName)
    .replaceAll("{HOST}", eventNameObj.host)
    .replaceAll("{HOST/ATTENDEE}", forAttendeeView ? eventNameObj.host : attendeeName)
    .replaceAll("{Event duration}", `${String(eventNameObj.eventDuration)} mins`)
    .replaceAll(
      "{Scheduler first name}",
      attendeeName === eventNameObj.t("scheduler") ? "{Scheduler first name}" : attendeeName.split(" ")[0]
    );

  const { bookingFields } = eventNameObj || {};
  const { name } = bookingFields || {};

  if (name && typeof name === "object" && !Array.isArray(name) && typeof name.lastName === "string") {
    dynamicEventName = dynamicEventName.replaceAll("{Scheduler last name}", name.lastName.toString());
  }

  return replaceCustomInputVariables(dynamicEventName, eventNameObj.bookingFields);
}

export function replaceCustomInputVariables(text: string, bookingFields?: Prisma.JsonObject | null): string {
  if (!text || !bookingFields) return text;
  let dynamicText = text;
  const customInputVariables = dynamicText.match(/\{(.+?)}/g)?.map((variable) => {
    return variable.replace("{", "").replace("}", "");
  });

  customInputVariables?.forEach((variable) => {
    const bookingFieldValue = bookingFields[variable as keyof typeof bookingFields];

    if (bookingFieldValue !== undefined && bookingFieldValue !== null) {
      let fieldValue: string | undefined;

      if (typeof bookingFieldValue === "object" && !Array.isArray(bookingFieldValue)) {
        if ("value" in bookingFieldValue) {
          const valueAsString = bookingFieldValue.value?.toString();
          fieldValue =
            variable === "location"
              ? guessEventLocationType(valueAsString)?.label || valueAsString
              : valueAsString;
        } else if (variable === "name" && "firstName" in bookingFieldValue) {
          const lastName = "lastName" in bookingFieldValue ? bookingFieldValue.lastName : "";
          fieldValue = `${bookingFieldValue.firstName} ${lastName}`.trim();
        }
      } else {
        fieldValue = bookingFieldValue.toString();
      }

      dynamicText = dynamicText.replace(`{${variable}}`, fieldValue || "");
    } else {
      dynamicText = dynamicText.replace(`{${variable}}`, "");
    }
  });

  return dynamicText;
}

export function updateHostInEventName(eventName: string, oldHost: string, newHost: string) {
  const oldParts = oldHost.trim().split(/\s+/);
  const newParts = newHost.trim().split(/\s+/);

  // Handle cases where names might have different number of parts
  const oldFirst = oldParts[0];
  const oldLast = oldParts.slice(1).join(" ");
  const newFirst = newParts[0];
  const newLast = newParts.slice(1).join(" ");

  const formats = [
    // Full name patterns (prioritize these first)
    ...(oldLast
      ? [
          {
            pattern: `${oldFirst}.${oldLast}`,
            replacement: newLast ? `${newFirst}.${newLast}` : newFirst,
          },
          {
            pattern: `${oldFirst}-${oldLast}`,
            replacement: newLast ? `${newFirst}-${newLast}` : newFirst,
          },
          {
            pattern: `${oldFirst}_${oldLast}`,
            replacement: newLast ? `${newFirst}_${newLast}` : newFirst,
          },
          {
            pattern: `${oldFirst} ${oldLast}`,
            replacement: newLast ? `${newFirst} ${newLast}` : newFirst,
          },
        ]
      : []),
    // First name only (last to avoid partial matches)
    {
      pattern: oldFirst,
      replacement: newFirst,
    },
  ];

  let updatedEventName = eventName;

  for (const { pattern, replacement } of formats) {
    // Escape special regex characters in the pattern
    const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedPattern}\\b`, "gi");

    if (regex.test(updatedEventName)) {
      updatedEventName = updatedEventName.replace(regex, replacement);
      return updatedEventName;
    }
  }

  return updatedEventName;
}

export const validateCustomEventName = (value: string, bookingFields?: Prisma.JsonObject | null) => {
  let customInputVariables: string[] = [];
  if (bookingFields) {
    customInputVariables = Object.keys(bookingFields).map((customInput) => {
      return `{${customInput}}`;
    });
  }

  const validVariables = customInputVariables.concat([
    "{Event type title}",
    "{Organiser}",
    "{Scheduler}",
    "{Location}",
    "{Organiser first name}",
    "{Scheduler first name}",
    "{Scheduler last name}",
    "{Event duration}",
    //allowed for fallback reasons
    "{LOCATION}",
    "{HOST/ATTENDEE}",
    "{HOST}",
    "{ATTENDEE}",
    "{USER}",
  ]);
  const matches = value.match(/\{([^}]+)\}/g);
  if (matches?.length) {
    for (const item of matches) {
      if (!validVariables.includes(item)) {
        return item;
      }
    }
  }

  return true;
};
