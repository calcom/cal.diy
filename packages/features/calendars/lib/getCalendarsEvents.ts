import process from "node:process";
import { getCalendar } from "@calcom/app-store/_utils/getCalendar";
import { symmetricDecrypt } from "@calcom/lib/crypto";
import { decryptSecret } from "@calcom/lib/crypto/keyring";
import { isDelegationCredential } from "@calcom/lib/delegationCredential";
import logger from "@calcom/lib/logger";
import { getPiiFreeCredential, getPiiFreeSelectedCalendar } from "@calcom/lib/piiFreeData";
import { safeStringify } from "@calcom/lib/safeStringify";
import { performance } from "@calcom/lib/server/perfObserver";
import type { CalendarFetchMode, EventBusyDate, SelectedCalendar } from "@calcom/types/Calendar";
import type { CredentialForCalendarService } from "@calcom/types/Credential";
import { normalizeTimezone } from "./timezone-conversion";

const log = logger.getSubLogger({ prefix: ["getCalendarsEvents"] });

const CALENDSO_ENCRYPTION_KEY = process.env.CALENDSO_ENCRYPTION_KEY || "";

// only for Google Calendar for now
export const getCalendarsEventsWithTimezones = async (
  withCredentials: CredentialForCalendarService[],
  dateFrom: string,
  dateTo: string,
  selectedCalendars: SelectedCalendar[]
): Promise<(EventBusyDate & { timeZone: string })[][]> => {
  const calendarCredentials = withCredentials
    .filter((credential) => credential.type === "google_calendar")
    // filter out invalid credentials - these won't work.
    .filter((credential) => !credential.invalid);

  const calendarAndCredentialPairs = await Promise.all(
    calendarCredentials.map(async (credential) => {
      const calendar = await getCalendar(credential, "slots");
      return [calendar, credential] as const;
    })
  );

  const calendars = calendarAndCredentialPairs.map(([calendar]) => calendar);
  const calendarToCredentialMap = new Map(calendarAndCredentialPairs);

  const results = calendars.map(async (c, i) => {
    /** Filter out nulls */
    if (!c) return [];
    /** We rely on the index so we can match credentials with calendars */
    const { type } = calendarCredentials[i];
    const credential = calendarToCredentialMap.get(c);
    /** We just pass the calendars that matched the credential type,
     * TODO: Migrate credential type or appId
     */
    const passedSelectedCalendars = credential
      ? filterSelectedCalendarsForCredential(selectedCalendars, credential)
      : selectedCalendars
          .filter((sc) => sc.integration === type)
          // Needed to ensure cache keys are consistent
          .sort((a, b) => (a.externalId < b.externalId ? -1 : a.externalId > b.externalId ? 1 : 0));
    const isADelegationCredential = credential && isDelegationCredential({ credentialId: credential.id });
    // We want to fallback to primary calendar when no selectedCalendars are passed
    // Default behaviour for Google Calendar is to use all available calendars, which isn't good default.
    const allowFallbackToPrimary = isADelegationCredential;
    if (!passedSelectedCalendars.length) {
      if (!isADelegationCredential) {
        // It was done to fix the secondary calendar connections from always checking the conflicts even if intentional no calendars are selected.
        // https://github.com/calcom/cal.diy/issues/8929
        log.error(
          `No selected calendars for non DWD credential: Skipping getAvailability call for credential ${credential?.id}`
        );
        return [];
      }
      // For delegation credential, we should allow getAvailability even without any selected calendars. It ensures that enabling Delegation Credential at Organization level always ensure one selected calendar for conflicts checking, without requiring any manual action from organization members
      // This is also, similar to how Google Calendar connect flow(through /googlecalendar/api/callback) sets the primary calendar as the selected calendar automatically.
      log.info("Allowing getAvailability even without any selected calendars for Delegation Credential");
    }
    /** We extract external Ids so we don't cache too much */
    const eventBusyDates =
      (await c.getAvailabilityWithTimeZones?.({
        dateFrom,
        dateTo,
        selectedCalendars: passedSelectedCalendars,
        mode: "slots",
        fallbackToPrimary: allowFallbackToPrimary,
      })) || [];

    return eventBusyDates.map((event) => ({
      ...event,
      timeZone: normalizeTimezone(event.timeZone),
    }));
  });
  const awaitedResults = await Promise.all(results);
  return awaitedResults;
};

const getCalendarsEvents = async (
  withCredentials: CredentialForCalendarService[],
  dateFrom: string,
  dateTo: string,
  selectedCalendars: SelectedCalendar[],
  mode: CalendarFetchMode
): Promise<EventBusyDate[][]> => {
  const calendarCredentials = withCredentials
    .filter((credential) => credential.type.endsWith("_calendar"))
    // filter out invalid credentials - these won't work.
    .filter((credential) => !credential.invalid);

  const calendarAndCredentialPairs = await Promise.all(
    calendarCredentials.map(async (credential) => {
      let key: typeof credential.key;
      try {
        if (credential.encryptedKey) {
          key = JSON.parse(
            decryptSecret({
              envelope: JSON.parse(credential.encryptedKey),
              aad: { type: credential.type },
            })
          );
        } else {
          key = credential.key;
        }
      } catch {
        log.warn("Failed to decrypt credential key, falling back to legacy key", {
          credentialId: credential.id,
        });
        key = credential.key;
      }

      const calendar = await getCalendar(
        {
          ...credential,
          // use encrypted secret to get unencrypted calendar creds
          key,
        },
        mode
      );
      return [calendar, credential] as const;
    })
  );

  const calendars = calendarAndCredentialPairs.map(([calendar]) => calendar);
  const calendarToCredentialMap = new Map(calendarAndCredentialPairs);
  performance.mark("getBusyCalendarTimesStart");
  const results = calendars.map(async (calendarService, i) => {
    /** Filter out nulls */
    if (!calendarService) return [];
    /** We rely on the index so we can match credentials with calendars */
    const { type, appId } = calendarCredentials[i];
    const credential = calendarToCredentialMap.get(calendarService);
    /** We just pass the calendars that matched the credential type,
     * TODO: Migrate credential type or appId
     */
    // Important to have them unique so that
    const passedSelectedCalendars = credential
      ? filterSelectedCalendarsForCredential(selectedCalendars, credential)
      : selectedCalendars
          .filter((sc) => sc.integration === type)
          // Needed to ensure cache keys are consistent
          .sort((a, b) => (a.externalId < b.externalId ? -1 : a.externalId > b.externalId ? 1 : 0));
    const isADelegationCredential = credential && isDelegationCredential({ credentialId: credential.id });
    // We want to fallback to primary calendar when no selectedCalendars are passed
    // Default behaviour for Google Calendar is to use all available calendars, which isn't good default.
    const allowFallbackToPrimary = isADelegationCredential;
    if (!passedSelectedCalendars.length) {
      if (!isADelegationCredential) {
        // It was done to fix the secondary calendar connections from always checking the conflicts even if intentional no calendars are selected.
        // https://github.com/calcom/cal.diy/issues/8929
        log.error(
          `No selected calendars for non DWD credential: Skipping getAvailability call for credential ${credential?.id}`
        );
        return [];
      }
      // For delegation credential, we should allow getAvailability even without any selected calendars. It ensures that enabling Delegation Credential at Organization level always ensure one selected calendar for conflicts checking, without requiring any manual action from organization members
      // This is also, similar to how Google Calendar connect flow(through /googlecalendar/api/callback) sets the primary calendar as the selected calendar automatically.
      log.info("Allowing getAvailability even without any selected calendars for Delegation Credential");
    }
    /** We extract external Ids so we don't cache too much */

    const selectedCalendarIds = passedSelectedCalendars.map((sc) => sc.externalId);
    /** If we don't then we actually fetch external calendars (which can be very slow) */
    performance.mark("eventBusyDatesStart");
    log.debug(
      `Getting availability for`,
      safeStringify({
        calendarService: calendarService.constructor.name,
        selectedCalendars: passedSelectedCalendars.map(getPiiFreeSelectedCalendar),
      })
    );
    const availabilityParams = {
      dateFrom,
      dateTo,
      selectedCalendars: passedSelectedCalendars,
      mode,
      fallbackToPrimary: allowFallbackToPrimary,
    };
    // "overlay" mode is only used when the calendar owner looks at their own calendars, so titles can be included.
    // Titles are a nice-to-have, losing them must never cost the owner their busy times.
    const eventBusyDates =
      mode === "overlay" && calendarService.getAvailabilityWithTitles
        ? await calendarService.getAvailabilityWithTitles(availabilityParams).catch((error) => {
            log.warn(
              "getAvailabilityWithTitles failed, falling back to getAvailability",
              safeStringify({ credentialId: credential?.id, error })
            );
            return calendarService.getAvailability(availabilityParams);
          })
        : await calendarService.getAvailability(availabilityParams);
    performance.mark("eventBusyDatesEnd");
    performance.measure(
      `[getAvailability for ${selectedCalendarIds.join(", ")}][$1]'`,
      "eventBusyDatesStart",
      "eventBusyDatesEnd"
    );

    return eventBusyDates.map((a) => ({
      ...a,
      source: `${appId}`,
    }));
  });
  const awaitedResults = await Promise.all(results);
  performance.mark("getBusyCalendarTimesEnd");
  performance.measure(
    `getBusyCalendarTimes took $1 for creds ${calendarCredentials.map((cred) => cred.id)}`,
    "getBusyCalendarTimesStart",
    "getBusyCalendarTimesEnd"
  );
  log.debug(
    "Result",
    safeStringify({
      calendarCredentials: calendarCredentials.map(getPiiFreeCredential),
      selectedCalendars: selectedCalendars.map(getPiiFreeSelectedCalendar),
      calendarEvents: awaitedResults,
    })
  );
  return awaitedResults;
};

export default getCalendarsEvents;

/**
 * Extract server URL from CalDAV calendar externalId
 */
function getServerUrlFromCalendarExternalId(externalId: string): string | null {
  try {
    const url = new URL(externalId);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * Extract server URL from CalDAV credential
 */
function getServerUrlFromCredential(credential: CredentialForCalendarService): string | null {
  try {
    if (credential.type !== "caldav_calendar") {
      return null;
    }

    const decryptedData = JSON.parse(symmetricDecrypt(credential.key as string, CALENDSO_ENCRYPTION_KEY));

    if (!decryptedData.url) {
      return null;
    }

    const url = new URL(decryptedData.url);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * Filter selected calendars for the specific credential, handling CalDAV server URL matching
 */
export function filterSelectedCalendarsForCredential(
  selectedCalendars: SelectedCalendar[],
  credential: CredentialForCalendarService
): SelectedCalendar[] {
  const { type } = credential;

  // For all other calendar types, use the existing logic
  if (type !== "caldav_calendar") {
    return selectedCalendars.filter((sc) => sc.integration === type);
  }

  const credentialServerUrl = getServerUrlFromCredential(credential);

  if (!credentialServerUrl) {
    log.warn("Could not extract server URL from CalDAV credential", {
      credentialId: credential.id,
    });
    return [];
  }

  return selectedCalendars.filter((sc) => {
    if (sc.integration !== type) {
      return false;
    }

    const calendarServerUrl = getServerUrlFromCalendarExternalId(sc.externalId);

    if (!calendarServerUrl) {
      log.warn("Could not extract server URL from calendar externalId", {
        externalId: sc.externalId,
        integration: sc.integration,
      });
      return false;
    }

    const matches = credentialServerUrl === calendarServerUrl;

    if (!matches) {
      log.debug("CalDAV calendar server URL does not match credential server URL", {
        credentialId: credential.id,
        credentialServerUrl,
        calendarServerUrl,
        calendarExternalId: sc.externalId,
      });
    }

    return matches;
  });
}
