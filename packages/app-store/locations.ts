/**
 * TODO: Consolidate this file with BookingLocationService and add tests
 */

import { appStoreMetadata } from "@calcom/app-store/bookerAppsMetaData";
import logger from "@calcom/lib/logger";
import { BookingStatus } from "@calcom/prisma/enums";
import type { Ensure, Optional } from "@calcom/types/utils";
import type { TFunction } from "i18next";
import { isValidPhoneNumber } from "libphonenumber-js/max";
import { z } from "zod";
import type { EventLocationTypeFromAppMeta } from "../types/App";
import {
  DailyLocationType as importedDailyLocationType,
  MeetLocationType as importedMeetLocationType,
  MSTeamsLocationType as importedMSTeamsLocationType,
} from "./constants";

export const MeetLocationType = importedMeetLocationType;
export const MSTeamsLocationType = importedMSTeamsLocationType;
export const DailyLocationType = importedDailyLocationType;

export type DefaultEventLocationType = {
  default: true;
  type: DefaultEventLocationTypeEnum;
  label: string;
  messageForOrganizer: string;
  category: "in_person_category" | "conferencing" | "other" | "phone";
  linkType: "static";
  supportsCustomLabel?: boolean;

  iconUrl: string;
  urlRegExp?: string;
  // HACK: `variable` and `defaultValueVariable` are required due to legacy reason where different locations were stored in different places.
  variable:
    | "locationType"
    | "locationAddress"
    | "address"
    | "locationLink"
    | "locationPhoneNumber"
    | "phone"
    | "hostDefault";
  defaultValueVariable:
    | "address"
    | "attendeeAddress"
    | "link"
    | "hostPhoneNumber"
    | "hostDefault"
    | "phone"
    | "somewhereElse";
} & (
  | {
      organizerInputType: "phone" | "text" | null;
      organizerInputPlaceholder?: string | null;
      organizerInputLabel?: string | null;
      attendeeInputType?: null;
      attendeeInputPlaceholder?: null;
    }
  | {
      attendeeInputType: "phone" | "attendeeAddress" | "somewhereElse" | null;
      attendeeInputPlaceholder: string;
      organizerInputType?: null;
      organizerInputPlaceholder?: null;
    }
);

export type EventLocationTypeFromApp = Ensure<
  EventLocationTypeFromAppMeta,
  "defaultValueVariable" | "variable"
> & { supportsCustomLabel?: boolean; organizerInputLabel?: string };

export type EventLocationType = DefaultEventLocationType | EventLocationTypeFromApp;

export const CalVideoLocationType = DailyLocationType;

/**
 * This isn't an actual location app type. It is a special value that informs to use the Organizer's default conferencing app during booking
 */
export const OrganizerDefaultConferencingAppType = "conferencing";

export enum DefaultEventLocationTypeEnum {
  /**
   * Booker Address
   */
  AttendeeInPerson = "attendeeInPerson",
  /**
   * Organizer Address
   */
  InPerson = "inPerson",
  /**
   * Booker Phone
   */
  Phone = "phone",
  /**
   * Organizer Phone
   */
  UserPhone = "userPhone",
  Link = "link",
  // Same as `OrganizerDefaultConferencingAppType`
  Conferencing = "conferencing",
  SomewhereElse = "somewhereElse",
}

export const defaultLocations: DefaultEventLocationType[] = [
  {
    default: true,
    type: DefaultEventLocationTypeEnum.AttendeeInPerson,
    label: "in_person_attendee_address",
    variable: "address",
    organizerInputType: null,
    messageForOrganizer: "Cal will ask your invitee to enter an address before scheduling.",
    attendeeInputType: "attendeeAddress",
    attendeeInputPlaceholder: "enter_address",
    defaultValueVariable: "attendeeAddress",
    iconUrl: "/map-pin-dark.svg",
    category: "in_person_category",
    linkType: "static",
    supportsCustomLabel: true,
  },
  {
    default: true,
    type: DefaultEventLocationTypeEnum.SomewhereElse,
    label: "custom_attendee_location",
    variable: "address",
    organizerInputType: null,
    messageForOrganizer: "Cal will ask your invitee to enter any location before scheduling.",
    attendeeInputType: "somewhereElse",
    attendeeInputPlaceholder: "any_location",
    defaultValueVariable: "somewhereElse",
    iconUrl: "/message-pin.svg",
    category: "other",
    linkType: "static",
    supportsCustomLabel: true,
  },
  {
    default: true,
    type: DefaultEventLocationTypeEnum.InPerson,
    label: "in_person",
    organizerInputType: "text",
    messageForOrganizer: "Provide an Address or Place",
    // HACK:
    variable: "locationAddress",
    defaultValueVariable: "address",
    iconUrl: "/map-pin-dark.svg",
    category: "in_person_category",
    linkType: "static",
  },
  {
    default: true,
    type: DefaultEventLocationTypeEnum.Conferencing,
    iconUrl: "/link.svg",
    organizerInputType: null,
    label: "organizer_default_conferencing_app",
    variable: "hostDefault",
    defaultValueVariable: "hostDefault",
    category: "conferencing",
    messageForOrganizer: "",
    linkType: "static",
    supportsCustomLabel: true,
  },
  {
    default: true,
    type: DefaultEventLocationTypeEnum.Link,
    label: "link_meeting",
    organizerInputType: "text",
    organizerInputLabel: "meeting_link",
    variable: "locationLink",
    messageForOrganizer: "Provide a Meeting Link",
    defaultValueVariable: "link",
    iconUrl: "/link.svg",
    category: "other",
    linkType: "static",
    supportsCustomLabel: true,
  },
  {
    default: true,
    type: DefaultEventLocationTypeEnum.Phone,
    label: "attendee_phone_number",
    variable: "phone",
    organizerInputType: null,
    attendeeInputType: "phone",
    attendeeInputPlaceholder: `enter_phone_number`,
    defaultValueVariable: "phone",
    messageForOrganizer: "Cal will ask your invitee to enter a phone number before scheduling.",
    // This isn't inputType phone because organizer doesn't need to provide it.
    // inputType: "phone"
    iconUrl: "/phone.svg",
    category: "phone",
    linkType: "static",
  },
  {
    default: true,
    type: DefaultEventLocationTypeEnum.UserPhone,
    label: "phone_call",
    messageForOrganizer: "Provide your phone number",
    organizerInputType: "phone",
    organizerInputLabel: "phone_number",
    variable: "locationPhoneNumber",
    defaultValueVariable: "hostPhoneNumber",
    iconUrl: "/phone.svg",
    category: "phone",
    linkType: "static",
  },
];

const translateAbleKeys = [
  "in_person_attendee_address",
  "in_person",
  "attendee_phone_number",
  "link_meeting",
  "phone_call",
  "organizer_default_conferencing_app",
  "somewhere_else",
  "custom_attendee_location",
];

export type LocationObject = {
  type: string;
  address?: string;
  displayLocationPublicly?: boolean;
  credentialId?: number;
  customLabel?: string;
} & Partial<
  Record<
    "address" | "attendeeAddress" | "link" | "hostPhoneNumber" | "hostDefault" | "phone" | "somewhereElse",
    string
  >
>;

// integrations:jitsi | 919999999999 | Delhi | https://manual.meeting.link | Around Video
export type BookingLocationValue = string;

export const AppStoreLocationType: Record<string, string> = {};

const locationsFromApps: EventLocationTypeFromApp[] = [];

for (const [appName, meta] of Object.entries(appStoreMetadata)) {
  const location = meta.appData?.location;
  if (location) {
    // TODO: This template variable replacement should happen once during app-store:build.
    for (const [key, value] of Object.entries(location)) {
      if (typeof value === "string") {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        location[key] = value.replace(/{SLUG}/g, meta.slug).replace(/{TITLE}/g, meta.name);
      }
    }
    const newLocation = {
      ...location,
      messageForOrganizer: location.messageForOrganizer || `Set ${location.label} link`,
      iconUrl: meta.logo,
      // For All event location apps, locationLink is where we store the input
      // TODO: locationLink and link seems redundant. We can modify the code to keep just one of them.
      variable: location.variable || "locationLink",
      defaultValueVariable: location.defaultValueVariable || "link",
    };

    // Static links always require organizer to input
    if (newLocation.linkType === "static") {
      newLocation.organizerInputType = location.organizerInputType || "text";
      if (newLocation.organizerInputPlaceholder?.match(/https?:\/\//)) {
        // HACK: Translation ends up removing https? if it's in the beginning :(
        newLocation.organizerInputPlaceholder = ` ${newLocation.organizerInputPlaceholder}`;
      }
    } else {
      newLocation.organizerInputType = null;
    }

    AppStoreLocationType[appName] = newLocation.type;

    locationsFromApps.push({
      ...newLocation,
    });
  }
}

const locations = [...defaultLocations, ...locationsFromApps];

export const getLocationFromApp = (locationType: string) =>
  locationsFromApps.find((l) => l.type === locationType);

export const getLocationByType = (locationType: string | undefined | null) =>
  locations.find((l) => l.type === locationType);

const getStaticLinkLocationByValue = (value: string | undefined | null) => {
  if (!value) {
    return null;
  }
  return locations.find((l) => {
    if (l.default || l.linkType == "dynamic" || !l.urlRegExp) {
      return;
    }
    return new RegExp(l.urlRegExp).test(value);
  });
};

export const guessEventLocationType = (locationTypeOrValue: string | undefined | null) =>
  getLocationByType(locationTypeOrValue) || getStaticLinkLocationByValue(locationTypeOrValue);

export const LocationType = { ...DefaultEventLocationTypeEnum, ...AppStoreLocationType };

export const isStaticLocationType = (locationType: string): boolean => {
  return Object.values(DefaultEventLocationTypeEnum).includes(locationType as DefaultEventLocationTypeEnum);
};

export const isCalVideoLocation = (locationType: string): boolean => {
  return locationType === DailyLocationType;
};

export const getAppSlugFromLocationType = (locationType: string): string | null => {
  for (const [, meta] of Object.entries(appStoreMetadata)) {
    if (meta.appData?.location?.type === locationType) {
      return meta.slug;
    }
  }
  return null;
};

type PrivacyFilteredLocationObject = Optional<LocationObject, "address" | "link" | "customLabel">;

export const privacyFilteredLocations = (locations: LocationObject[]): PrivacyFilteredLocationObject[] => {
  const locationsAfterPrivacyFilter = locations.map((location) => {
    const eventLocationType = getLocationByType(location.type);
    if (!eventLocationType) {
      logger.debug(`Couldn't find location type. App might be uninstalled: ${location.type} `);
    }
    // Filter out locations that are not to be displayed publicly
    // Display if the location can be set to public - and also display all locations like google meet etc
    if (location.displayLocationPublicly || !eventLocationType) {
      return location;
    } else {
      const { address: _1, link: _2, hostPhoneNumber: _3, ...privacyFilteredLocation } = location;
      logger.debug("Applied Privacy Filter", location, privacyFilteredLocation);
      return privacyFilteredLocation;
    }
  });
  return locationsAfterPrivacyFilter;
};

/**
 * Use this function for translating event location to a readable string
 * @param location
 * @param t
 * @returns string
 */
export const getMessageForOrganizer = (location: string, t: TFunction) => {
  const videoLocation = getLocationFromApp(location);
  const defaultLocation = defaultLocations.find((l) => l.type === location);
  if (defaultLocation) {
    return t(defaultLocation.messageForOrganizer);
  }
  if (videoLocation && videoLocation.linkType !== "static" && videoLocation.type !== "integrations:zoom") {
    return t(`Cal will provide a ${videoLocation.label} URL.`);
  }
  return "";
};

/**
 * Use this function to translate booking location value to a readable string
 * @param linkValue
 * @param translationFunction
 * @returns
 */
export const getHumanReadableLocationValue = (
  linkValue: string | undefined | null,
  translationFunction: TFunction
): string => {
  if (!linkValue) {
    return translationFunction("no_location");
  }

  // Just in case linkValue is a `locationType.type`(for old bookings)
  const eventLocationType = getLocationByType(linkValue);
  const isDefault = eventLocationType?.default;
  if (eventLocationType) {
    // If we can find a video location based on linkValue then it means that the linkValue is something like integrations:google-meet and in that case we don't have the meeting URL to show.
    // Show a generic message in that case.
    return isDefault ? translationFunction(eventLocationType.label) : `${eventLocationType.label}`;
  }
  // Otherwise just show the available link value.
  return linkValue || "";
};

export const locationKeyToString = (location: LocationObject) => {
  const eventLocationType = getLocationByType(location.type);
  if (!eventLocationType) {
    return null;
  }
  const defaultValueVariable = eventLocationType.defaultValueVariable;
  if (!defaultValueVariable) {
    logger.error(`defaultValueVariable not set for ${location.type}`);
    return "";
  }
  return location[defaultValueVariable] || eventLocationType.label;
};

export const getEventLocationWithType = (
  locations: LocationObject[],
  locationType: EventLocationType["type"] | undefined
) => {
  const location = locations.find((location) => location.type === locationType);
  return location;
};

/**
 * It converts a static link based video location type(e.g. integrations:campfire_video) to it's value (e.g. https://campfire.to/my_link) set in the eventType.
 * If the type provided is already a value(when displayLocationPublicly is on), it would just return that.
 * For, dynamic link based video location apps, it doesn't do anything.
 */
export const getLocationValueForDB = (
  bookingLocationTypeOrValue: EventLocationType["type"],
  eventLocations: LocationObject[]
) => {
  let bookingLocation = bookingLocationTypeOrValue;
  let conferenceCredentialId: number | undefined;

  eventLocations.forEach((location) => {
    if (location.type === bookingLocationTypeOrValue) {
      const eventLocationType = getLocationByType(bookingLocationTypeOrValue);
      conferenceCredentialId = location.credentialId;
      if (!eventLocationType) {
        return;
      }
      if (!eventLocationType.default && eventLocationType.linkType === "dynamic") {
        // Dynamic link based locations should still be saved as type. The beyond logic generates meeting URL based on the type.
        // This difference can be avoided when we start storing both type and value of a location
        return;
      }

      bookingLocation = location[eventLocationType.defaultValueVariable] || bookingLocation;
    } else {
      // Also match against the resolved value (e.g. a URL like "https://signal.me/...")
      // so that confirm.handler and other callers passing already-resolved values can
      // correctly map back to the location entry and its credentialId
      const eventLocationType = getLocationByType(location.type);
      if (
        eventLocationType?.defaultValueVariable &&
        location[eventLocationType.defaultValueVariable] === bookingLocationTypeOrValue
      ) {
        conferenceCredentialId = location.credentialId;
        bookingLocation = bookingLocationTypeOrValue;
      }
    }
  });

  if (bookingLocation.trim().length === 0) {
    bookingLocation = DailyLocationType;
  }

  return { bookingLocation, conferenceCredentialId };
};

export const getEventLocationValue = (eventLocations: LocationObject[], bookingLocation: LocationObject) => {
  const eventLocationType = getLocationByType(bookingLocation?.type);
  if (!eventLocationType) {
    return "";
  }
  const defaultValueVariable = eventLocationType.defaultValueVariable;
  if (!defaultValueVariable) {
    logger.error(`${defaultValueVariable} not set for ${bookingLocation.type}`);
    return "";
  }
  const eventLocation = getEventLocationWithType(eventLocations, bookingLocation?.type);
  if (!eventLocation) {
    logger.error(`Could not find eventLocation for ${bookingLocation}`);
    return "";
  }

  // Must send .type here if value isn't available due to privacy setting.
  // For Booker Phone Number, it would be a value always. For others, value is either autogenerated or provided by Organizer and thus it's possible that organizer doesn't want it to show
  // Backend checks for `integration` to generate link
  // TODO: use zodSchema to ensure the type of data is correct
  return (
    bookingLocation[defaultValueVariable] || eventLocation[defaultValueVariable] || eventLocationType.type
  );
};

export function getSuccessPageLocationMessage(
  location: EventLocationType["type"],
  t: TFunction,
  bookingStatus?: BookingStatus
) {
  const eventLocationType = getLocationByType(location);
  let locationToDisplay = location;
  if (eventLocationType && !eventLocationType.default && eventLocationType.linkType === "dynamic") {
    const isConfirmed = bookingStatus === BookingStatus.ACCEPTED;

    if (bookingStatus === BookingStatus.CANCELLED || bookingStatus === BookingStatus.REJECTED) {
      locationToDisplay = t("web_conference");
    } else if (isConfirmed) {
      locationToDisplay = `${getHumanReadableLocationValue(location, t)}: ${t(
        "meeting_url_in_confirmation_email"
      )}`;
    } else {
      locationToDisplay = t("web_conferencing_details_to_follow");
    }
  }
  return locationToDisplay;
}

export const getTranslatedLocation = (
  location: PrivacyFilteredLocationObject,
  eventLocationType: ReturnType<typeof getLocationByType>,
  t: TFunction
) => {
  if (!eventLocationType) return null;
  const locationKey = z.string().default("").parse(locationKeyToString(location));
  const translatedLocation = location.type.startsWith("integrations:")
    ? eventLocationType.label
    : translateAbleKeys.includes(locationKey)
      ? t(locationKey)
      : locationKey;

  return translatedLocation;
};

export const getOrganizerInputLocationTypes = () => {
  const result: DefaultEventLocationType["type"] | EventLocationTypeFromApp["type"][] = [];

  const organizerInputTypeLocations = locations.filter((location) => !!location.organizerInputType);
  organizerInputTypeLocations?.forEach((l) => result.push(l.type));

  return result;
};

export const isAttendeeInputRequired = (locationType: string) => {
  const location = locations.find((l) => l.type === locationType);
  if (!location) {
    // Consider throwing an error here. This shouldn't happen normally.
    return false;
  }
  return location.attendeeInputType;
};

export const locationsResolver = (t: TFunction) => {
  return z
    .array(
      z
        .object({
          type: z.string(),
          address: z.string().optional(),
          link: z.string().url().optional(),
          phone: z
            .string()
            .refine((val) => isValidPhoneNumber(val))
            .optional(),
          hostPhoneNumber: z
            .string()
            .refine((val) => isValidPhoneNumber(val))
            .optional(),
          displayLocationPublicly: z.boolean().optional(),
          credentialId: z.number().optional(),
          teamName: z.string().optional(),
        })
        .passthrough()
        .superRefine((val, ctx) => {
          if (val?.link) {
            const link = val.link;
            const eventLocationType = getLocationByType(val.type);
            if (
              eventLocationType &&
              !eventLocationType.default &&
              eventLocationType.linkType === "static" &&
              eventLocationType.urlRegExp
            ) {
              const valid = z.string().regex(new RegExp(eventLocationType.urlRegExp)).safeParse(link).success;

              if (!valid) {
                const sampleUrl = eventLocationType.organizerInputPlaceholder;
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  path: [eventLocationType?.defaultValueVariable ?? "link"],
                  message: t("invalid_url_error_message", {
                    label: eventLocationType.label,
                    sampleUrl: sampleUrl ?? "https://cal.com",
                  }),
                });
              }
              return;
            }

            const valid = z.string().url().optional().safeParse(link).success;

            if (!valid) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [eventLocationType?.defaultValueVariable ?? "link"],
                message: `Invalid URL`,
              });
            }
          }
          return;
        })
    )
    .optional();
};
