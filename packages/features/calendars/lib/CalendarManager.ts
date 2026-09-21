import { getCalendar } from "@calcom/app-store/_utils/getCalendar";
import { MeetLocationType } from "@calcom/app-store/locations";
import getApps from "@calcom/app-store/utils";
import dayjs from "@calcom/dayjs";
import getCalendarsEvents, {
  getCalendarsEventsWithTimezones,
} from "@calcom/features/calendars/lib/getCalendarsEvents";
import { getRichDescription, getUid } from "@calcom/lib/CalEventParser";
import { CalendarAppDelegationCredentialError } from "@calcom/lib/CalendarAppError";
import { ORGANIZER_EMAIL_EXEMPT_DOMAINS } from "@calcom/lib/constants";
import { buildNonDelegationCredentials } from "@calcom/lib/delegationCredential";
import { formatCalEvent } from "@calcom/lib/formatCalendarEvent";
import logger from "@calcom/lib/logger";
import { getPiiFreeCalendarEvent, getPiiFreeCredential } from "@calcom/lib/piiFreeData";
import { safeStringify } from "@calcom/lib/safeStringify";
import type {
  CalendarEvent,
  CalendarFetchMode,
  CalendarServiceEvent,
  EventBusyDate,
  IntegrationCalendar,
  NewCalendarEventType,
  SelectedCalendar,
} from "@calcom/types/Calendar";
import type { CredentialForCalendarService, CredentialPayload } from "@calcom/types/Credential";
import type { EventResult } from "@calcom/types/EventManager";
import { sortBy } from "lodash";

const log = logger.getSubLogger({ prefix: ["CalendarManager"] });

/**
 * Process the calendar event by generating description and removing attendees if needed
 */
export const processEvent = (calEvent: CalendarEvent): CalendarServiceEvent => {
  if (calEvent.seatsPerTimeSlot) {
    calEvent.responses = null;
    calEvent.userFieldsResponses = null;
    calEvent.additionalNotes = null;
    calEvent.customInputs = null;
  }
  // Generate the calendar event description
  const calendarEvent: CalendarServiceEvent = {
    ...calEvent,
    calendarDescription: getRichDescription(calEvent),
  };

  const isMeetLocationType = calEvent.location === MeetLocationType;

  // Determine if the calendar event should include attendees
  const isOrganizerExempt = ORGANIZER_EMAIL_EXEMPT_DOMAINS?.split(",")
    .filter((domain) => domain.trim() !== "")
    .some((domain) => calEvent.organizer.email.toLowerCase().endsWith(domain.toLowerCase()));

  // Zoho Calendar requires at least one attendee, so don't empty attendees array for Zoho Calendar
  const hasZohoCalendar =
    calEvent.destinationCalendar?.some((cal) => cal.integration === "zoho_calendar") ?? false;

  if (calEvent.hideOrganizerEmail && !isOrganizerExempt && !isMeetLocationType && !hasZohoCalendar) {
    calendarEvent.attendees = [];
  }

  return calendarEvent;
};

type IntegrationWithCredentials = Awaited<
  ReturnType<typeof getCalendarCredentials>
>[number]["integration"] & {
  credentials?: CredentialPayload[];
  credential?: CredentialPayload;
};

type CleanIntegration = Omit<IntegrationWithCredentials, "credentials" | "credential">;

/**
 * Important function to prevent leaking credentials to the client
 * @param appIntegration
 * @returns App
 */
export const cleanIntegrationKeys = (appIntegration: IntegrationWithCredentials): CleanIntegration => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { credentials, credential, ...rest } = appIntegration;
  return rest;
};

export const getCalendarCredentials = (credentials: Array<CredentialForCalendarService>) => {
  const calendarCredentials = getApps(credentials, true)
    .filter((app) => app.type.endsWith("_calendar"))
    .flatMap((app) => {
      const credentials = app.credentials.flatMap((credential) => {
        const calendar = () => getCalendar(credential, "slots");
        return app.variant === "calendar" ? [{ integration: app, credential, calendar }] : [];
      });

      return credentials.length ? credentials : [];
    });

  return calendarCredentials;
};

export const getCalendarCredentialsWithoutDelegation = (credentials: CredentialPayload[]) => {
  return getCalendarCredentials(buildNonDelegationCredentials(credentials));
};

export type ConnectedCalendar = Omit<IntegrationCalendar, "primary"> & {
  primary: boolean | null;
  isSelected: boolean;
  readOnly: boolean;
  credentialId: number;
  delegationCredentialId: string | null;
};

export const getConnectedCalendars = async (
  calendarCredentials: ReturnType<typeof getCalendarCredentials>,
  selectedCalendars: { externalId: string }[],
  destinationCalendarExternalId?: string
): Promise<{
  connectedCalendars: {
    integration: CleanIntegration;
    calendars?: ConnectedCalendar[];
    credentialId: number;
    delegationCredentialId?: string | null;
    error?: {
      message: string;
    };
    primary?: ConnectedCalendar;
  }[];
  destinationCalendar: IntegrationCalendar | undefined;
}> => {
  const connectedCalendars = await Promise.all(
    calendarCredentials.map(async (item) => {
      try {
        const { integration, credential } = item;
        const safeToSendIntegration = cleanIntegrationKeys(integration);
        const calendar = await item.calendar;
        // Don't leak credentials to the client
        const credentialId = credential.id;
        const delegationCredentialId = credential.delegatedToId ?? null;
        if (!calendar) {
          return {
            integration: safeToSendIntegration,
            credentialId,
            delegationCredentialId,
          };
        }
        const calendarInstance = await calendar();
        if (!calendarInstance) {
          return {
            integration: safeToSendIntegration,
            credentialId,
            delegationCredentialId,
            error: {
              message: "Could not get calendar instance",
            },
          };
        }
        const cals = await calendarInstance.listCalendars();
        const calendars: ConnectedCalendar[] = sortBy(
          cals.map((cal: IntegrationCalendar) => {
            return {
              ...cal,
              readOnly: cal.readOnly || false,
              primary: cal.primary || null,
              isSelected: selectedCalendars.some((selected) => selected.externalId === cal.externalId),
              credentialId,
              delegationCredentialId,
            };
          }),
          ["primary"]
        );
        const primary = calendars.find((item) => item.primary) ?? calendars.find((cal) => cal !== undefined);
        if (!primary) {
          return {
            integration: safeToSendIntegration,
            credentialId,
            error: {
              message: "No primary calendar found",
            },
          };
        }

        return {
          integration: safeToSendIntegration,
          credentialId,
          delegationCredentialId,
          primary,
          calendars,
        };
      } catch (error) {
        let errorMessage = "Could not get connected calendars";

        // Here you can expect for specific errors
        if (error instanceof Error) {
          if (error.message === "invalid_grant") {
            errorMessage = "Access token expired or revoked";
          }
        }

        if (error instanceof CalendarAppDelegationCredentialError) {
          errorMessage = error.message;
        }

        log.error("getConnectedCalendars failed", error, safeStringify({ credentialId: item.credential.id }));

        return {
          integration: cleanIntegrationKeys(item.integration),
          credentialId: item.credential.id,
          delegationCredentialId: item.credential.delegatedToId,
          error: {
            message: errorMessage,
          },
        };
      }
    })
  );

  let destinationCalendar: IntegrationCalendar | undefined;
  if (destinationCalendarExternalId) {
    for (const connectedCalendar of connectedCalendars) {
      if (!("calendars" in connectedCalendar) || !connectedCalendar.calendars) {
        continue;
      }
      const calendar = connectedCalendar.calendars.find(
        (cal) => cal.externalId === destinationCalendarExternalId
      );
      if (calendar) {
        destinationCalendar = {
          ...calendar,
          primary: calendar.primary ?? undefined,
          primaryEmail: connectedCalendar.primary?.email,
          integrationTitle: connectedCalendar.integration.name,
        };
        break;
      }
    }
  }

  return { connectedCalendars, destinationCalendar };
};

/**
 * This function deduplicates credentials based on selected calendars
 * It removes regular credentials for which corresponding delegation credentials exist which can be identified only associating them with selected calendars
 *
 * This is important to prevent unnecessary/duplicate calls to calendar APIs
 */
export const deduplicateCredentialsBasedOnSelectedCalendars = ({
  credentials,
  selectedCalendars,
}: {
  credentials: CredentialForCalendarService[];
  selectedCalendars: SelectedCalendar[];
}) => {
  // Only proceed if we have credentials
  if (credentials.length === 0) {
    return credentials;
  }

  // Get the user email from the first credential
  const userEmail = credentials[0].user?.email;

  // If no email, we can't identify which credential is duplicate
  if (!userEmail) {
    return credentials;
  }

  // Check if there are delegation credentials for the same integration types
  const delegationCredentials = credentials.filter((credential) => credential.delegatedToId);

  // Find all selected calendars with externalId matching the user's email and having a regular credential
  const selectedCalendarsWithUserEmailConnectedWithRegularCredential = selectedCalendars.filter(
    (calendar) => calendar.externalId === userEmail && calendar.credentialId && calendar.credentialId > 0
  );

  // If no delegation credentials or no regular credentials connected selected calendars, return original credentials
  if (
    delegationCredentials.length === 0 ||
    selectedCalendarsWithUserEmailConnectedWithRegularCredential.length === 0
  ) {
    return credentials;
  }

  const deduplicatedCredentials = [...credentials];

  // For each selected calendar with user email, check if a delegation credential exists for the same integration.
  // If yes, we remove such a regular credential as that is a duplicate
  const credentialIdsToRemove = selectedCalendarsWithUserEmailConnectedWithRegularCredential
    .filter((calendar) =>
      delegationCredentials.some((credential) => credential.type === calendar.integration)
    )
    .map((calendar) => calendar.credentialId);

  // Remove the regular credentials that are now handled by delegation credentials
  return deduplicatedCredentials.filter((credential) => !credentialIdsToRemove.includes(credential.id));
};

export const getBusyCalendarTimes = async (
  /**
   * withCredentials can possibly have duplicate credential in case DelegationCredential is enabled.
   * There is no way to deduplicate that at the moment because a `credential` doesn't directly know to which external_id(or email it is connected to).
   * So, there could be multiple credentials for the same user.
   * 1. Delegated Credential - that fetches events for john@acme.com
   * 2. Regular Credential - that fetches events for john@personal.com
   *
   */
  withCredentials: CredentialForCalendarService[],
  dateFrom: string,
  dateTo: string,
  selectedCalendars: SelectedCalendar[],
  mode?: CalendarFetchMode,
  includeTimeZone?: boolean
) => {
  let results: (EventBusyDate & { timeZone?: string })[][] = [];

  const deduplicatedCredentials = deduplicateCredentialsBasedOnSelectedCalendars({
    credentials: withCredentials,
    selectedCalendars,
  });

  if (deduplicatedCredentials.length !== withCredentials.length) {
    log.info(
      "Deduplicated credentials and removed",
      withCredentials.length - deduplicatedCredentials.length,
      "duplicates. Total number of credentials now is",
      deduplicatedCredentials.length
    );
  }

  // const months = getMonths(dateFrom, dateTo);
  // Subtract 11 hours from the start date to avoid problems in UTC- time zones.
  const startDate = dayjs(dateFrom).subtract(11, "hours").format();
  // Add 14 hours from the start date to avoid problems in UTC+ time zones.
  const endDate = dayjs(dateTo).add(14, "hours").format();
  try {
    if (includeTimeZone) {
      results = await getCalendarsEventsWithTimezones(
        deduplicatedCredentials,
        startDate,
        endDate,
        selectedCalendars
      );
    } else {
      results = await getCalendarsEvents(
        deduplicatedCredentials,
        startDate,
        endDate,
        selectedCalendars,
        mode ?? "slots"
      );
    }
  } catch (e) {
    log.warn(`Error getting calendar availability`, {
      selectedCalendarIds: selectedCalendars.map((calendar) => calendar.externalId),
      error: safeStringify(e),
    });
    return { success: false, data: [{ start: startDate, end: endDate, source: "error-placeholder" }] };
  }
  return { success: true, data: results.reduce((acc, availability) => acc.concat(availability), []) };
};

export const createEvent = async (
  credential: CredentialForCalendarService,
  originalEvent: CalendarEvent,
  externalId?: string
): Promise<EventResult<NewCalendarEventType>> => {
  // Some calendar libraries may edit the original event so let's clone it
  const formattedEvent = formatCalEvent(originalEvent);
  const uid: string = getUid(formattedEvent.uid);
  const calendar = await getCalendar(credential, "booking");
  let success = true;
  let calError: string | undefined;

  log.debug(
    "Creating calendar event",
    safeStringify({
      calEvent: getPiiFreeCalendarEvent(formattedEvent),
    })
  );
  // Check if the disabledNotes flag is set to true
  if (formattedEvent.hideCalendarNotes) {
    formattedEvent.additionalNotes = "Notes have been hidden by the organizer"; // TODO: i18n this string?
  }

  const calEvent = processEvent(formattedEvent);

  const externalCalendarIdWhenDelegationCredentialIsChosen = credential.delegatedToId
    ? externalId
    : undefined;

  // TODO: Surface success/error messages coming from apps to improve end user visibility
  const creationResult = calendar
    ? await calendar
        // Ideally we should pass externalId always, but let's start with DelegationCredential case first as in that case, CalendarService need to handle a special case for DelegationCredential to determine the selectedCalendar.
        // Such logic shouldn't exist in CalendarService as it would be same for all calendar apps.
        .createEvent(calEvent, credential.id, externalCalendarIdWhenDelegationCredentialIsChosen)
        .catch(async (error: { code: number; calError: string }) => {
          success = false;
          /**
           * There is a time when selectedCalendar externalId doesn't match witch certain credential
           * so google returns 404.
           * */
          if (error?.code === 404) {
            return undefined;
          }
          if (error?.calError) {
            calError = error.calError;
          }
          log.error(
            "createEvent failed",
            safeStringify(error),
            safeStringify({ calEvent: getPiiFreeCalendarEvent(calEvent) })
          );
          // @TODO: This code will be off till we can investigate an error with it
          //https://github.com/calcom/cal.diy/issues/3949
          // await sendBrokenIntegrationEmail(calEvent, "calendar");
          return undefined;
        })
    : undefined;
  if (!creationResult) {
    logger.error(
      "createEvent failed",
      safeStringify({
        success,
        uid,
        creationResult,
        originalEvent: getPiiFreeCalendarEvent(calEvent),
        calError,
      })
    );
  }
  log.debug(
    "Created calendar event",
    safeStringify({
      calEvent: getPiiFreeCalendarEvent(calEvent),
      creationResult,
    })
  );
  return {
    appName: credential.appName || credential.appId || "",
    type: credential.type,
    success,
    uid,
    iCalUID: creationResult?.iCalUID || undefined,
    createdEvent: creationResult,
    originalEvent: calEvent,
    calError,
    calWarnings: creationResult?.additionalInfo?.calWarnings || [],
    externalId,
    credentialId: credential.id,
    delegatedToId: credential.delegatedToId ?? undefined,
  };
};

export const updateEvent = async (
  credential: CredentialForCalendarService,
  rawCalEvent: CalendarEvent,
  bookingRefUid: string | null,
  externalCalendarId: string | null
): Promise<EventResult<NewCalendarEventType>> => {
  const formattedEvent = formatCalEvent(rawCalEvent);

  if (formattedEvent.hideCalendarNotes) {
    formattedEvent.additionalNotes = "Notes have been hidden by the organizer"; // TODO: i18n this string?
  }

  const calEvent = processEvent(formattedEvent);
  const uid = getUid(calEvent.uid);
  const calendar = await getCalendar(credential, "booking");
  let success = false;
  let calError: string | undefined;
  let calWarnings: string[] | undefined = [];
  log.debug(
    "Updating calendar event",
    safeStringify({
      bookingRefUid,
      calEvent: getPiiFreeCalendarEvent(calEvent),
    })
  );
  if (bookingRefUid === "") {
    log.error(
      "updateEvent failed",
      "bookingRefUid is empty",
      safeStringify({ calEvent: getPiiFreeCalendarEvent(calEvent) })
    );
  }
  const updatedResult: NewCalendarEventType | NewCalendarEventType[] | undefined =
    calendar && bookingRefUid
      ? await calendar
          .updateEvent(bookingRefUid, calEvent, externalCalendarId)
          .then((event: NewCalendarEventType | NewCalendarEventType[]) => {
            success = true;
            return event;
          })
          .catch(async (e: { calError: string }) => {
            // @TODO: This code will be off till we can investigate an error with it
            // @see https://github.com/calcom/cal.diy/issues/3949
            // await sendBrokenIntegrationEmail(calEvent, "calendar");
            log.error(
              "updateEvent failed",
              safeStringify({ e, calEvent: getPiiFreeCalendarEvent(calEvent) })
            );
            if (e?.calError) {
              calError = e.calError;
            }
            return undefined;
          })
      : undefined;

  if (!updatedResult) {
    logger.error(
      "updateEvent failed",
      safeStringify({
        success,
        bookingRefUid,
        credential: getPiiFreeCredential(credential),
        originalEvent: getPiiFreeCalendarEvent(calEvent),
        calError,
      })
    );
  }

  if (Array.isArray(updatedResult)) {
    calWarnings = updatedResult.flatMap((res) => res.additionalInfo?.calWarnings ?? []);
  } else {
    calWarnings = updatedResult?.additionalInfo?.calWarnings || [];
  }

  return {
    appName: credential.appName || credential.appId || "",
    type: credential.type,
    success,
    uid,
    updatedEvent: updatedResult,
    originalEvent: calEvent,
    calError,
    calWarnings,
  };
};

export const deleteEvent = async ({
  credential,
  bookingRefUid,
  event,
  externalCalendarId,
}: {
  credential: CredentialForCalendarService;
  bookingRefUid: string;
  event: CalendarEvent;
  externalCalendarId?: string | null;
}): Promise<unknown> => {
  if (!bookingRefUid) {
    log.error(
      "deleteEvent failed - bookingRefUid is empty, skipping calendar deletion to prevent malformed API request",
      safeStringify({
        credential: getPiiFreeCredential(credential),
        event: getPiiFreeCalendarEvent(event),
      })
    );
    return Promise.resolve({});
  }
  const calendar = await getCalendar(credential, "booking");
  log.debug(
    "Deleting calendar event",
    safeStringify({
      bookingRefUid,
      event: getPiiFreeCalendarEvent(event),
    })
  );
  if (calendar) {
    return calendar.deleteEvent(bookingRefUid, event, externalCalendarId);
  } else {
    log.error(
      "Could not do deleteEvent - No calendar adapter found",
      safeStringify({
        credential: getPiiFreeCredential(credential),
        event,
      })
    );
  }

  return Promise.resolve({});
};
