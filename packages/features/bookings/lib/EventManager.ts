import process from "node:process";
import { getCalendar } from "@calcom/app-store/_utils/getCalendar";
import { FAKE_DAILY_CREDENTIAL } from "@calcom/app-store/dailyvideo/lib/VideoApiAdapter";
import { appKeysSchema as calVideoKeysSchema } from "@calcom/app-store/dailyvideo/zod";
import { getLocationFromApp, MeetLocationType, MSTeamsLocationType } from "@calcom/app-store/locations";
import getApps from "@calcom/app-store/utils";
import { createEvent, deleteEvent, updateEvent } from "@calcom/features/calendars/lib/CalendarManager";
import { createMeeting, deleteMeeting, updateMeeting } from "@calcom/features/conferencing/lib/videoClient";
import { CredentialRepository } from "@calcom/features/credentials/repositories/CredentialRepository";
import CrmManager from "@calcom/features/crmManager/crmManager";
import CRMScheduler from "@calcom/features/crmManager/crmScheduler";
import { FeaturesRepository } from "@calcom/features/flags/features.repository";
import { getUid } from "@calcom/lib/CalEventParser";
import { symmetricDecrypt } from "@calcom/lib/crypto";
import { isDelegationCredential } from "@calcom/lib/delegationCredential";
import logger from "@calcom/lib/logger";
import {
  getPiiFreeCalendarEvent,
  getPiiFreeCredential,
  getPiiFreeDestinationCalendar,
  getPiiFreeUser,
} from "@calcom/lib/piiFreeData";
import { safeStringify } from "@calcom/lib/safeStringify";
import { prisma } from "@calcom/prisma";
import type { DestinationCalendar } from "@calcom/prisma/client";
import { createdEventSchema } from "@calcom/prisma/zod-utils";
import type { AdditionalInformation, CalendarEvent, NewCalendarEventType } from "@calcom/types/Calendar";
import type { CredentialForCalendarService } from "@calcom/types/Credential";
import type { Event } from "@calcom/types/Event";
import type {
  CreateUpdateResult,
  EventResult,
  PartialBooking,
  PartialReference,
} from "@calcom/types/EventManager";
import { cloneDeep, merge } from "lodash";
import { v5 as uuidv5 } from "uuid";
import type { z } from "zod";
import { OFFICE365_CALENDAR_TYPE } from "./handleSeats/lib/seatCalendarReferences";

const log = logger.getSubLogger({ prefix: ["EventManager"] });
const CALENDSO_ENCRYPTION_KEY = process.env.CALENDSO_ENCRYPTION_KEY || "";
const CALDAV_CALENDAR_TYPE = "caldav_calendar";
const isOffice365CalendarCredential = (
  credential: Pick<CredentialForCalendarService, "type"> | null | undefined
): boolean => credential?.type === OFFICE365_CALENDAR_TYPE;
export const isDedicatedIntegration = (location: string): boolean => {
  return location !== MeetLocationType && location.includes("integrations:");
};

interface HasId {
  id: number;
}

const latestCredentialFirst = <T extends HasId>(a: T, b: T) => {
  return b.id - a.id;
};

const delegatedCredentialFirst = <T extends { delegatedToId?: string | null }>(a: T, b: T) => {
  return (b.delegatedToId ? 1 : 0) - (a.delegatedToId ? 1 : 0);
};

const delegatedCredentialLast = <T extends { delegatedToId?: string | null }>(a: T, b: T) => {
  return (a.delegatedToId ? 1 : 0) - (b.delegatedToId ? 1 : 0);
};

export const getLocationRequestFromIntegration = (location: string) => {
  const eventLocationType = getLocationFromApp(location);
  if (eventLocationType) {
    const requestId = uuidv5(location, uuidv5.URL);

    return {
      conferenceData: {
        createRequest: {
          requestId: requestId,
        },
      },
      location,
    };
  }

  return null;
};

const getCredential = ({
  id,
  allCredentials,
}: {
  id: {
    delegationCredentialId: string | null;
    credentialId: number | null;
  };
  allCredentials: CredentialForCalendarService[];
}) => {
  return id.delegationCredentialId
    ? allCredentials.find((c) => c.delegatedToId === id.delegationCredentialId)
    : allCredentials.find((c) => c.id === id.credentialId);
};

export const processLocation = (event: CalendarEvent): CalendarEvent => {
  // If location is set to an integration location
  // Build proper transforms for evt object
  // Extend evt object with those transformations

  // TODO: Rely on linkType:"dynamic" here. static links don't send their type. They send their URL directly.
  if (event.location?.includes("integration")) {
    const maybeLocationRequestObject = getLocationRequestFromIntegration(event.location);

    event = merge(event, maybeLocationRequestObject);
  }

  return event;
};

/**
 * Builds a safe credential payload for storing calendar references.
 *
 * @param result - Calendar event result carrying credential identifiers.
 * @returns Credential identifiers with invalid regular credential IDs removed.
 */
function getCredentialPayload(result: Pick<EventResult<unknown>, "credentialId" | "delegatedToId">) {
  return {
    credentialId: result?.credentialId && result.credentialId > 0 ? result.credentialId : undefined,
    delegationCredentialId: result?.delegatedToId || undefined,
  };
}

export type EventManagerUser = {
  credentials: CredentialForCalendarService[];
  destinationCalendar: DestinationCalendar | null;
};

type createdEventSchema = z.infer<typeof createdEventSchema>;

export type EventManagerInitParams = {
  user: EventManagerUser;
  eventTypeAppMetadata?: Record<string, any>;
};

export default class EventManager {
  calendarCredentials: CredentialForCalendarService[];
  videoCredentials: CredentialForCalendarService[];
  crmCredentials: CredentialForCalendarService[];
  appOptions?: Record<string, any>;
  /**
   * Takes an array of credentials and initializes a new instance of the EventManager.
   *
   * @param user
   */
  constructor(user: EventManagerUser, eventTypeAppMetadata?: Record<string, any>) {
    log.silly("Initializing EventManager", safeStringify({ user: getPiiFreeUser(user) }));
    const appCredentials = getApps(user.credentials, true).flatMap((app) =>
      app.credentials.map((creds) => ({ ...creds, appName: app.name }))
    );
    // This includes all calendar-related apps, traditional calendars such as Google Calendar
    this.calendarCredentials = appCredentials
      .filter(
        // Backwards compatibility until CRM manager is implemented
        (cred) => cred.type.endsWith("_calendar") && !cred.type.includes("other_calendar")
      )
      // see https://github.com/calcom/cal.diy/issues/11671#issue-1923600672
      // This sorting is mostly applicable for fallback which happens when there is no explicit destinationCalendar set.
      // That could be true for really old accounts but not for new
      .sort(latestCredentialFirst)
      // Keep Delegation Credentials first so because those credentials never expire and are preferred.
      // Also, those credentials have consistent permission for all the members avoiding the scenario where user doesn't give all permissions
      .sort(delegatedCredentialFirst);

    this.videoCredentials = appCredentials
      .filter((cred) => cred.type.endsWith("_video") || cred.type.endsWith("_conferencing"))
      // Whenever a new video connection is added, latest credentials are added with the highest ID.
      // Because you can't rely on having them in the highest first order here, ensure this by sorting in DESC order
      // We also don't have updatedAt or createdAt dates on credentials so this is the best we can do
      .sort(latestCredentialFirst);
    this.crmCredentials = appCredentials.filter(
      (cred) => cred.type.endsWith("_crm") || cred.type.endsWith("_other_calendar")
    );

    this.appOptions = eventTypeAppMetadata;
  }

  private extractServerUrlFromCredential(credential: CredentialForCalendarService): string | null {
    try {
      if (credential.type !== CALDAV_CALENDAR_TYPE) {
        return null;
      }

      const decryptedData = JSON.parse(symmetricDecrypt(credential.key as string, CALENDSO_ENCRYPTION_KEY));

      if (!decryptedData.url) {
        return null;
      }

      const url = new URL(decryptedData.url);
      return `${url.protocol}//${url.host}`;
    } catch (error) {
      log.warn("Failed to extract server URL from CalDAV credential", {
        credentialId: credential.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  }

  private extractServerUrlFromDestination(destination: DestinationCalendar): string | null {
    try {
      if (destination.integration !== CALDAV_CALENDAR_TYPE || !destination.externalId) {
        return null;
      }

      const url = new URL(destination.externalId);
      return `${url.protocol}//${url.host}`;
    } catch (error) {
      log.warn("Failed to extract server URL from destination calendar", {
        destinationId: destination.id,
        externalId: destination.externalId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  }

  private credentialMatchesDestination(
    credential: CredentialForCalendarService,
    destination: DestinationCalendar
  ): boolean {
    if (credential.type !== CALDAV_CALENDAR_TYPE || destination.integration !== CALDAV_CALENDAR_TYPE) {
      return true;
    }

    const credentialServerUrl = this.extractServerUrlFromCredential(credential);
    const destinationServerUrl = this.extractServerUrlFromDestination(destination);

    if (!credentialServerUrl || !destinationServerUrl) {
      log.warn("Could not extract server URLs for CalDAV credential validation", {
        credentialId: credential.id,
        destinationId: destination.id,
        credentialServerUrl,
        destinationServerUrl,
      });
      return false;
    }

    const matches = credentialServerUrl === destinationServerUrl;

    if (!matches) {
      log.warn("CalDAV credential server URL does not match destination calendar server URL", {
        credentialId: credential.id,
        destinationId: destination.id,
        credentialServerUrl,
        destinationServerUrl,
      });
    }

    return matches;
  }

  private updateMSTeamsVideoCallData(
    evt: CalendarEvent,
    results: Array<EventResult<Exclude<Event, AdditionalInformation>>>
  ) {
    const office365CalendarWithTeams = results.find(
      (result) => result.type === "office365_calendar" && result.success && result.createdEvent?.url
    );
    if (office365CalendarWithTeams) {
      evt.videoCallData = {
        type: "office365_video",
        id: office365CalendarWithTeams.createdEvent?.id,
        password: "",
        url: office365CalendarWithTeams.createdEvent?.url,
      };
      if (evt.location && evt.responses) {
        evt.responses["location"] = {
          ...(evt.responses["location"] ?? {}),
          value: {
            optionValue: "",
            value: evt.location,
          },
        };
      }
    }
  }

  /**
   * Takes a CalendarEvent and creates all necessary integration entries for it.
   * When a video integration is chosen as the event's location, a video integration
   * event will be scheduled for it as well.
   *
   * @param event
   * @param options.skipCalendarEvent - When true, skips calendar event creation but still creates video meetings.
   *   This is useful for platform customers who manage their own calendar events but still want Cal.diy to create
   *   video meetings for third-party video apps like Daily.co.
   */
  public async create(
    event: CalendarEvent,
    options?: { skipCalendarEvent?: boolean }
  ): Promise<CreateUpdateResult> {
    const { skipCalendarEvent = false } = options ?? {};
    // TODO this method shouldn't be modifying the event object that's passed in
    const evt = processLocation(event);

    // Fallback to cal video if no location is set
    if (!evt.location) {
      // See if cal video is enabled & has keys
      const calVideo = await prisma.app.findUnique({
        where: {
          slug: "daily-video",
        },
        select: {
          keys: true,
          enabled: true,
        },
      });

      const calVideoKeys = calVideoKeysSchema.safeParse(calVideo?.keys);

      if (calVideo?.enabled && calVideoKeys.success) evt["location"] = "integrations:daily";
      log.warn("Falling back to cal video as no location is set");
    }

    const [mainHostDestinationCalendar] =
      (evt.destinationCalendar as [undefined | NonNullable<typeof evt.destinationCalendar>[number]]) ?? [];

    // Fallback to Cal Video if Google Meet is selected w/o a Google Calendar connection
    if (evt.location === MeetLocationType && mainHostDestinationCalendar?.integration !== "google_calendar") {
      const [googleCalendarCredential] = this.calendarCredentials.filter(
        (cred) => cred.type === "google_calendar"
      );
      // Delegation Credential case won't normally have DestinationCalendar set and thus fallback of using Google Calendar credential would be used. Identify that case.
      // TODO: We could extend this logic to Regular Credentials also. Having a Google Calendar credential would cause fallback to use that credential to create calendar and thus we could have Google Meet link
      if (!isDelegationCredential({ credentialId: googleCalendarCredential?.id })) {
        log.warn(
          "Falling back to Cal Video integration for Regular Credential as Google Calendar is not set as destination calendar"
        );
        evt["location"] = "integrations:daily";
        evt["conferenceCredentialId"] = undefined;
      }
    }

    const isDedicated = evt.location ? isDedicatedIntegration(evt.location) : null;
    const isMSTeamsWithOutlookCalendar =
      evt.location === MSTeamsLocationType &&
      mainHostDestinationCalendar?.integration === "office365_calendar";

    const results: Array<EventResult<Exclude<Event, AdditionalInformation>>> = [];

    // If and only if event type is a dedicated meeting, create a dedicated video meeting.
    // If the event is a Microsoft Teams meeting with Outlook Calendar, do not create a MSTeams video event, create calendar event will take care.
    if (isDedicated && !isMSTeamsWithOutlookCalendar) {
      const result = await this.createVideoEvent(evt);

      if (result?.createdEvent) {
        evt.videoCallData = result.createdEvent;
        evt.location = result.originalEvent.location;
        result.type = result.createdEvent.type;
        //responses data is later sent to webhook
        if (evt.location && evt.responses) {
          evt.responses["location"] = {
            ...(evt.responses["location"] ?? {}),
            value: {
              optionValue: "",
              value: evt.location,
            },
          };
        }
      }

      results.push(result);
    }

    // Some calendar libraries may edit the original event so let's clone it
    const clonedCalEvent = cloneDeep(event);
    // Create the calendar event with the proper video call data
    if (!skipCalendarEvent) {
      results.push(...(await this.createAllCalendarEvents(clonedCalEvent)));
    }

    if (evt.location === MSTeamsLocationType) {
      this.updateMSTeamsVideoCallData(evt, results);
    }

    // Since the result can be a new calendar event or video event, we have to create a type guard
    // https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates
    const isCalendarResult = (
      result: (typeof results)[number]
    ): result is EventResult<NewCalendarEventType> => {
      return result.type.includes("_calendar");
    };

    const createdCRMEvents = skipCalendarEvent ? [] : await this.createAllCRMEvents(evt);

    results.push(...createdCRMEvents);

    // References can be any type: calendar/video
    const referencesToCreate = results.map((result) => {
      let thirdPartyRecurringEventId;
      let createdEventObj: createdEventSchema | null = null;
      if (typeof result?.createdEvent === "string") {
        createdEventObj = createdEventSchema.parse(JSON.parse(result.createdEvent));
      }
      const isCalendarType = isCalendarResult(result);
      if (isCalendarType) {
        evt.iCalUID = result.iCalUID || event.iCalUID || undefined;
        thirdPartyRecurringEventId = result.createdEvent?.thirdPartyRecurringEventId;
      }

      return {
        type: result.type,
        uid: createdEventObj ? createdEventObj.id : (result.createdEvent?.id?.toString() ?? ""),
        thirdPartyRecurringEventId: isCalendarType ? thirdPartyRecurringEventId : undefined,
        meetingId: createdEventObj ? createdEventObj.id : result.createdEvent?.id?.toString(),
        meetingPassword: createdEventObj ? createdEventObj.password : result.createdEvent?.password,
        meetingUrl: createdEventObj ? createdEventObj.onlineMeetingUrl : result.createdEvent?.url,
        externalCalendarId: isCalendarType ? result.externalId : undefined,
        ...getCredentialPayload(result),
      };
    });

    return {
      results,
      referencesToCreate,
    };
  }

  public async updateLocation(event: CalendarEvent, booking: PartialBooking): Promise<CreateUpdateResult> {
    const evt = processLocation(event);
    const isDedicated = evt.location ? isDedicatedIntegration(evt.location) : null;

    const results: Array<EventResult<Exclude<Event, AdditionalInformation>>> = [];
    // If and only if event type is a dedicated meeting, create a dedicated video meeting.
    if (isDedicated) {
      const result = await this.createVideoEvent(evt);
      if (result.createdEvent) {
        evt.videoCallData = result.createdEvent;
        evt.location = result.originalEvent.location;
        result.type = result.createdEvent.type;
        //responses data is later sent to webhook
        if (evt.location && evt.responses) {
          evt.responses["location"] = {
            ...(evt.responses["location"] ?? {}),
            value: {
              optionValue: "",
              value: evt.location,
            },
          };
        }
      }

      results.push(result);
    }

    // Update the calendar event with the proper video call data
    const calendarReference = booking.references.find((reference) => reference.type.includes("_calendar"));
    if (calendarReference) {
      results.push(...(await this.updateAllCalendarEvents(evt, booking)));

      if (evt.location === MSTeamsLocationType) {
        this.updateMSTeamsVideoCallData(evt, results);
      }
    }

    const referencesToCreate = results.map((result) => {
      // For update operations, check updatedEvent first, then fall back to createdEvent
      const updatedEvent = Array.isArray(result.updatedEvent) ? result.updatedEvent[0] : result.updatedEvent;
      const createdEvent = result.createdEvent;
      let event = updatedEvent;
      if (!event) {
        log.warn(
          "updateLocation: No updatedEvent when doing updateLocation. Falling back to createdEvent but this is probably not what we want",
          safeStringify({ bookingId: booking.id })
        );
        event = createdEvent;
      }

      const uid = event?.id?.toString() ?? "";
      const meetingId = event?.id?.toString();

      if (!uid) {
        log.error(
          "updateLocation: No uid for booking reference. The corresponding record in third party if created is orphan now",
          safeStringify({ result })
        );
      }

      return {
        type: result.type,
        uid,
        meetingId,
        meetingPassword: event?.password,
        meetingUrl: event?.url,
        externalCalendarId: result.externalId,
        ...(result.credentialId && result.credentialId > 0 ? { credentialId: result.credentialId } : {}),
      };
    });

    return {
      results,
      referencesToCreate,
    };
  }

  private async deleteCalendarEventForBookingReference({
    reference,
    event,
    isBookingInRecurringSeries,
  }: {
    reference: PartialReference;
    event: CalendarEvent;
    isBookingInRecurringSeries?: boolean;
  }) {
    log.debug(
      "deleteCalendarEventForBookingReference",
      safeStringify({ bookingCalendarReference: reference, event: getPiiFreeCalendarEvent(event) })
    );

    const {
      // uid: bookingRefUid,
      externalCalendarId: bookingExternalCalendarId,
      credentialId,
      type: credentialType,
    } = reference;

    const bookingRefUid =
      isBookingInRecurringSeries && reference?.thirdPartyRecurringEventId
        ? reference.thirdPartyRecurringEventId
        : reference.uid;

    const calendarCredential = await this.getCalendarCredential(
      credentialId,
      credentialType,
      reference.delegationCredentialId
    );

    if (calendarCredential) {
      await deleteEvent({
        credential: calendarCredential,
        bookingRefUid,
        event,
        externalCalendarId: bookingExternalCalendarId,
      });
    }
  }

  private async deleteVideoEventForBookingReference({ reference }: { reference: PartialReference }) {
    log.debug("deleteVideoEventForBookingReference", safeStringify({ bookingVideoReference: reference }));
    const { uid: bookingRefUid, credentialId } = reference;

    const videoCredential = await this.getVideoCredential(credentialId, reference.type);

    if (videoCredential) {
      await deleteMeeting(videoCredential, bookingRefUid);
    }
  }

  private async getVideoCredential(
    credentialId: number | null | undefined,
    type: string
  ): Promise<CredentialForCalendarService | null | undefined> {
    const credential = this.videoCredentials.find((cred) => cred.id === credentialId);
    if (credential) {
      return credential;
    }

    const foundCredential =
      typeof credentialId === "number" && credentialId > 0
        ? await CredentialRepository.findCredentialForCalendarServiceById({ id: credentialId })
        : // Fallback for zero or nullish credentialId which could be the case of Global App e.g. dailyVideo
          this.videoCredentials.find((cred) => cred.type === type) || null;

    if (!foundCredential) {
      log.error(
        "getVideoCredential: Could not find video credential",
        safeStringify({
          credentialId,
          type,
          videoCredentialIds: this.videoCredentials.map((cred) => cred.id),
        })
      );
    }

    return foundCredential;
  }

  private async getCalendarCredential(
    credentialId: number | null | undefined,
    type: string,
    delegationCredentialId?: string | null
  ): Promise<CredentialForCalendarService | null | undefined> {
    if (delegationCredentialId) {
      return this.calendarCredentials.find((cred) => cred.delegatedToId === delegationCredentialId);
    }
    const credential = this.calendarCredentials.find((cred) => cred.id === credentialId);
    if (credential) {
      return credential;
    }

    const foundCredential =
      typeof credentialId === "number" && credentialId > 0
        ? await CredentialRepository.findCredentialForCalendarServiceById({ id: credentialId })
        : this.calendarCredentials.find((cred) => cred.type === type) || null;

    if (!foundCredential) {
      log.error(
        "getCalendarCredential: Could not find calendar credential",
        safeStringify({
          credentialId,
          type,
          calendarCredentialIds: this.calendarCredentials.map((cred) => cred.id),
        })
      );
    }

    return foundCredential;
  }

  /**
   * Takes a calendarEvent and a rescheduleUid and updates the event that has the
   * given uid using the data delivered in the given CalendarEvent.
   *
   * @param event
   */
  public async reschedule(
    event: CalendarEvent,
    rescheduleUid: string,
    newBookingId?: number,
    changedOrganizer?: boolean,
    previousHostDestinationCalendar?: DestinationCalendar[] | null,
    isBookingRequestedReschedule?: boolean,
    skipDeleteEventsAndMeetings?: boolean
  ): Promise<CreateUpdateResult> {
    const originalEvt = processLocation(event);
    const evt = cloneDeep(originalEvt);
    if (!rescheduleUid) {
      throw new Error("You called eventManager.update without an `rescheduleUid`. This should never happen.");
    }

    // Get details of existing booking.
    const booking = await prisma.booking.findUnique({
      where: {
        uid: rescheduleUid,
      },
      select: {
        id: true,
        userId: true,
        attendees: true,
        location: true,
        endTime: true,
        references: {
          where: {
            deleted: null,
          },
          // NOTE: id field removed from select as we don't require for deletingMany
          // but was giving error on recreate for reschedule, probably because promise.all() didn't finished
          select: {
            type: true,
            uid: true,
            meetingId: true,
            meetingPassword: true,
            meetingUrl: true,
            externalCalendarId: true,
            credentialId: true,
          },
        },
        destinationCalendar: true,
        payment: true,
        eventType: {
          select: {
            seatsPerTimeSlot: true,
            seatsShowAttendees: true,
            seatsShowAvailabilityCount: true,
          },
        },
      },
    });

    if (!booking) {
      throw new Error("booking not found");
    }

    const results: Array<EventResult<Event>> = [];
    const updatedBookingReferences: Array<PartialReference> = [];
    const isLocationChanged = !!evt.location && !!booking.location && evt.location !== booking.location;

    let isDailyVideoRoomExpired = false;

    if (evt.location === "integrations:daily") {
      const originalBookingEndTime = new Date(booking.endTime);
      const roomExpiryTime = new Date(originalBookingEndTime.getTime() + 14 * 24 * 60 * 60 * 1000);
      const now = new Date();
      isDailyVideoRoomExpired = now > roomExpiryTime;
    }

    const shouldUpdateBookingReferences =
      !!changedOrganizer || isLocationChanged || !!isBookingRequestedReschedule || isDailyVideoRoomExpired;

    if (evt.requiresConfirmation) {
      if (!skipDeleteEventsAndMeetings) {
        log.debug("RescheduleRequiresConfirmation: Deleting Event and Meeting for previous booking");
        // As the reschedule requires confirmation, we can't update the events and meetings to new time yet. So, just delete them and let it be handled when organizer confirms the booking.
        await this.deleteEventsAndMeetings({
          event: {
            ...event,
            destinationCalendar: previousHostDestinationCalendar,
          },
          bookingReferences: booking.references,
        });
      } else {
        log.debug(
          "RescheduleRequiresConfirmation: Skipping deletion of Event and Meeting due to skipDeleteEventsAndMeetings flag"
        );
      }
    } else {
      if (changedOrganizer) {
        if (!skipDeleteEventsAndMeetings) {
          log.debug("RescheduleOrganizerChanged: Deleting Event and Meeting for previous booking");
          await this.deleteEventsAndMeetings({
            event: { ...event, destinationCalendar: previousHostDestinationCalendar },
            bookingReferences: booking.references,
          });
        }

        log.debug("RescheduleOrganizerChanged: Creating Event and Meeting for for new booking");
        const createdEvent = await this.create(originalEvt);
        results.push(...createdEvent.results);
        updatedBookingReferences.push(...createdEvent.referencesToCreate);
      } else {
        // If the reschedule doesn't require confirmation, we can "update" the events and meetings to new time.
        if (isLocationChanged || isBookingRequestedReschedule || isDailyVideoRoomExpired) {
          const updatedLocation = await this.updateLocation(evt, booking);
          results.push(...updatedLocation.results);
          updatedBookingReferences.push(...updatedLocation.referencesToCreate);
        } else {
          const isDedicated = evt.location ? isDedicatedIntegration(evt.location) : null;
          // If and only if event type is a dedicated meeting, update the dedicated video meeting.
          if (isDedicated) {
            const result = await this.updateVideoEvent(evt, booking);
            const [updatedEvent] = Array.isArray(result.updatedEvent)
              ? result.updatedEvent
              : [result.updatedEvent];

            if (updatedEvent) {
              evt.videoCallData = updatedEvent;
              evt.location = updatedEvent.url;
            }
            results.push(result);
          }

          const bookingCalendarReference = booking.references.find((reference) =>
            reference.type.includes("_calendar")
          );
          // There was a case that booking didn't had any reference and we don't want to throw error on function
          if (bookingCalendarReference) {
            // Update all calendar events.
            results.push(...(await this.updateAllCalendarEvents(evt, booking, newBookingId)));
          }
        }

        results.push(...(await this.updateAllCRMEvents(evt, booking)));
      }
    }
    const bookingPayment = booking?.payment;

    // Updating all payment to new
    if (bookingPayment && newBookingId) {
      const paymentIds = bookingPayment.map((payment) => payment.id);
      await prisma.payment.updateMany({
        where: {
          id: {
            in: paymentIds,
          },
        },
        data: {
          bookingId: newBookingId,
        },
      });
    }

    return {
      results,
      referencesToCreate: shouldUpdateBookingReferences ? updatedBookingReferences : [...booking.references],
    };
  }

  /**
   * Deletes external calendar, video, and CRM records for booking references.
   *
   * @param event - Calendar event associated with the booking cancellation.
   * @param bookingReferences - Integration references to delete.
   * @param isBookingInRecurringSeries - Whether the booking belongs to a recurring series.
   * @returns A promise that resolves after deletion attempts complete.
   */
  public async cancelEvent(
    event: CalendarEvent,
    bookingReferences: PartialReference[],
    isBookingInRecurringSeries?: boolean
  ) {
    await this.deleteEventsAndMeetings({
      event,
      bookingReferences,
      isBookingInRecurringSeries,
    });
  }

  public async deleteEventsAndMeetings({
    event,
    bookingReferences,
    isBookingInRecurringSeries,
  }: {
    event: CalendarEvent;
    bookingReferences: PartialReference[];
    isBookingInRecurringSeries?: boolean;
  }) {
    const log = logger.getSubLogger({ prefix: [`[deleteEventsAndMeetings]: ${event?.uid}`] });
    const calendarReferences = [],
      videoReferences = [],
      crmReferences = [],
      allPromises = [];

    for (const reference of bookingReferences) {
      if (reference.type.includes("_calendar") && !reference.type.includes("other_calendar")) {
        calendarReferences.push(reference);
        allPromises.push(
          this.deleteCalendarEventForBookingReference({
            reference,
            event,
            isBookingInRecurringSeries,
          })
        );
      }

      if (reference.type.includes("_video")) {
        videoReferences.push(reference);
        allPromises.push(
          this.deleteVideoEventForBookingReference({
            reference,
          })
        );
      }

      if (reference.type.includes("_crm") || reference.type.includes("other_calendar")) {
        crmReferences.push(reference);
        allPromises.push(this.deleteCRMEvent({ reference, event }));
      }
    }

    log.debug("deleteEventsAndMeetings", safeStringify({ calendarReferences, videoReferences }));

    // Using allSettled to ensure that if one of the promises rejects, the others will still be executed.
    // Because we are just cleaning up the events and meetings, we don't want to throw an error if one of them fails.
    (await Promise.allSettled(allPromises)).some((result) => {
      if (result.status === "rejected") {
        // Make it a soft error because in case a PENDING booking is rescheduled there would be no calendar events or video meetings.
        log.warn(
          "Error deleting calendar event or video meeting for booking",
          safeStringify({ error: result.reason })
        );
      }
    });

    if (!allPromises.length) {
      log.warn("No calendar or video references found for booking - Couldn't delete events or meetings");
    }
  }

  /**
   * Updates attendee lists across calendar references for a booking.
   *
   * @param event - Calendar event containing the latest attendee list.
   * @param booking - Booking whose calendar references should be updated.
   * @param options - Optional calendar types to exclude from attendee updates.
   * @returns A promise that resolves after matching calendar events are updated.
   */
  public async updateCalendarAttendees(
    event: CalendarEvent,
    booking: PartialBooking,
    options?: { excludedCalendarTypes?: string[] }
  ) {
    if (booking.references.length === 0) {
      console.error("Tried to update references but there wasn't any.");
      return;
    }
    await this.updateAllCalendarEvents(
      { ...event, onlyUpdateCalendarAttendees: true },
      booking,
      undefined,
      options
    );
  }

  /**
   * Creates Office365 calendar events scoped to a single seated attendee.
   *
   * @param event - Calendar event containing the seated attendee to invite.
   * @returns Calendar creation results and references for the seated attendee.
   */
  public async createCalendarEventForSeatedAttendee(event: CalendarEvent): Promise<CreateUpdateResult> {
    const eventForSeat = cloneDeep(event);
    const office365DestinationCalendars = eventForSeat.destinationCalendar?.filter(
      /**
       * Keeps only Office365 destination calendars for seated attendee event creation.
       *
       * @param destination - Destination calendar configured for the event.
       * @returns Whether the destination calendar is Office365.
       */
      (destination) => destination.integration === OFFICE365_CALENDAR_TYPE
    );
    const hasExplicitDestinationCalendar = !!eventForSeat.destinationCalendar?.length;

    if (hasExplicitDestinationCalendar && !office365DestinationCalendars?.length) {
      return {
        results: [],
        referencesToCreate: [],
      };
    }

    if (office365DestinationCalendars?.length) {
      eventForSeat.destinationCalendar = office365DestinationCalendars;
    } else {
      eventForSeat.destinationCalendar = null;
    }

    const results: Array<EventResult<NewCalendarEventType>> = [];

    /**
     * Creates one Office365 event for the prepared seated attendee event.
     *
     * @param credential - Office365 calendar credential to use.
     * @param destination - Optional destination calendar for the created event.
     * @returns A promise that resolves after the created event result is stored.
     */
    const createOffice365CalendarEvent = async (
      credential: CredentialForCalendarService,
      destination?: NonNullable<CalendarEvent["destinationCalendar"]>[number]
    ) => {
      const createdEvent = await createEvent(credential, eventForSeat, destination?.externalId);
      results.push(createdEvent);
    };

    if (office365DestinationCalendars?.length) {
      for (const destination of office365DestinationCalendars) {
        if (!destination.credentialId && !destination.delegationCredentialId) {
          continue;
        }

        let credential = getCredential({
          id: {
            credentialId: destination.credentialId,
            delegationCredentialId: destination.delegationCredentialId,
          },
          allCredentials: this.calendarCredentials,
        });

        if (credential && !isOffice365CalendarCredential(credential)) {
          credential = undefined;
        }

        if (!credential) {
          if (destination.credentialId) {
            const credentialFromDB = await CredentialRepository.findCredentialForCalendarServiceById({
              id: destination.credentialId,
            });

            if (
              credentialFromDB &&
              credentialFromDB.appId &&
              isOffice365CalendarCredential(credentialFromDB)
            ) {
              credential = {
                id: credentialFromDB.id,
                type: credentialFromDB.type,
                key: credentialFromDB.key,
                userId: credentialFromDB.userId,
                teamId: credentialFromDB.teamId,
                invalid: credentialFromDB.invalid,
                appId: credentialFromDB.appId,
                user: credentialFromDB.user,
                encryptedKey: credentialFromDB.encryptedKey,
                delegatedToId: credentialFromDB.delegatedToId,
                delegatedTo: credentialFromDB.delegatedTo,
                delegationCredentialId: credentialFromDB.delegationCredentialId,
              };
            }
          } else if (destination.delegationCredentialId) {
            log.warn(
              "DelegationCredential: DelegationCredential seems to be disabled, falling back to first non-delegationCredential"
            );
            credential = this.calendarCredentials.find(
              (cred) => isOffice365CalendarCredential(cred) && !cred.delegatedToId
            );
          }
        }

        if (credential && isOffice365CalendarCredential(credential)) {
          await createOffice365CalendarEvent(credential, destination);
        }
      }
    } else {
      const credential = this.calendarCredentials.find(
        /**
         * Finds the first Office365 calendar credential for seated attendee creation.
         *
         * @param credential - Calendar credential available to the event manager.
         * @returns Whether the credential belongs to Office365.
         */
        (credential) => credential.type === OFFICE365_CALENDAR_TYPE
      );
      if (credential) {
        await createOffice365CalendarEvent(credential);
      }
    }

    const referencesToCreate = results.map(
      /**
       * Converts an Office365 creation result into a booking reference.
       *
       * @param result - Office365 calendar creation result.
       * @returns Booking reference for the created seated attendee event.
       */
      (result) => {
        const createdEvent = result.createdEvent;
        return {
          type: result.type,
          uid: createdEvent?.id?.toString() ?? "",
          thirdPartyRecurringEventId: createdEvent?.thirdPartyRecurringEventId,
          meetingId: createdEvent?.id?.toString(),
          meetingPassword: createdEvent?.password,
          meetingUrl: createdEvent?.url,
          externalCalendarId: result.externalId,
          ...getCredentialPayload(result),
        };
      }
    );

    return {
      results,
      referencesToCreate,
    };
  }

  /**
   * Creates event entries for all calendar integrations given in the credentials.
   * When noMail is true, no mails will be sent. This is used when the event is
   * a video meeting because then the mail containing the video credentials will be
   * more important than the mails created for these bare calendar events.
   *
   * When the optional uid is set, it will be used instead of the auto generated uid.
   *
   * @param event
   * @param noMail
   * @private
   */
  private async createAllCalendarEvents(event: CalendarEvent) {
    let createdEvents: EventResult<NewCalendarEventType>[] = [];

    const fallbackToFirstCalendarInTheList = async () => {
      const [credential] = this.calendarCredentials.filter((cred) => !cred.type.endsWith("other_calendar"));
      if (credential) {
        if (!isDelegationCredential({ credentialId: credential.id })) {
          log.warn("Check the User setup, it isn't normal to fallback for regular credential.");
        } else {
          // It is completely normal to fallback for delegation credential as in that case by default no destination calendar would be set.
        }
        const createdEvent = await createEvent(credential, event);
        log.silly("Created Calendar event using credential", safeStringify({ credential, createdEvent }));
        if (createdEvent) {
          createdEvents.push(createdEvent);
        }
      }
    };

    if (event.destinationCalendar && event.destinationCalendar.length > 0) {
      let eventCreated = false;
      // Since GCal pushes events to multiple calendars we only want to create one event per booking
      let gCalAdded = false;
      const destinationCalendars: DestinationCalendar[] = event.destinationCalendar.reduce(
        (destinationCals, cal) => {
          if (cal.integration === "google_calendar") {
            if (gCalAdded) {
              return destinationCals;
            } else {
              gCalAdded = true;
              destinationCals.push(cal);
            }
          } else {
            destinationCals.push(cal);
          }
          return destinationCals;
        },
        [] as DestinationCalendar[]
      );
      for (const destination of destinationCalendars) {
        if (eventCreated) break;
        log.silly("Creating Calendar event", JSON.stringify({ destination }));
        if (destination.credentialId || destination.delegationCredentialId) {
          let credential = getCredential({
            id: {
              credentialId: destination.credentialId,
              delegationCredentialId: destination.delegationCredentialId,
            },
            allCredentials: this.calendarCredentials,
          });
          if (!credential) {
            if (destination.credentialId) {
              // Fetch credential from DB
              const credentialFromDB = await CredentialRepository.findCredentialForCalendarServiceById({
                id: destination.credentialId,
              });

              if (credentialFromDB && credentialFromDB.appId) {
                credential = {
                  id: credentialFromDB.id,
                  type: credentialFromDB.type,
                  key: credentialFromDB.key,
                  userId: credentialFromDB.userId,
                  teamId: credentialFromDB.teamId,
                  invalid: credentialFromDB.invalid,
                  appId: credentialFromDB.appId,
                  user: credentialFromDB.user,
                  encryptedKey: credentialFromDB.encryptedKey,
                  delegatedToId: credentialFromDB.delegatedToId,
                  delegatedTo: credentialFromDB.delegatedTo,
                  delegationCredentialId: credentialFromDB.delegationCredentialId,
                };
              }
            } else if (destination.delegationCredentialId) {
              log.warn(
                "DelegationCredential: DelegationCredential seems to be disabled, falling back to first non-delegationCredential"
              );
              // In case DelegationCredential is disabled, we land here where the destination calendar is connected to a Delegation credential, but the credential isn't available(because DelegationCredential is disabled)
              // In this case, we fallback to the first non-delegationCredential. That would be there for all existing users before DelegationCredential was enabled
              const firstNonDelegatedCalendarCredential = this.calendarCredentials.find(
                (cred) => !cred.type.endsWith("other_calendar") && !cred.delegatedToId
              );
              credential = firstNonDelegatedCalendarCredential;
            }
          }
          if (credential) {
            const createdEvent = await createEvent(credential, event, destination.externalId);
            if (createdEvent) {
              createdEvents.push(createdEvent);
              eventCreated = true;
            }
          }
        } else {
          const destinationCalendarCredentials = this.calendarCredentials.filter((c) => {
            if (c.type !== destination.integration) return false;

            if (c.type === CALDAV_CALENDAR_TYPE) {
              return this.credentialMatchesDestination(c, destination);
            }

            return true;
          });
          // It might not be the first connected calendar as it seems that the order is not guaranteed to be ascending of credentialId.
          const firstCalendarCredential = destinationCalendarCredentials[0] as
            | (typeof destinationCalendarCredentials)[number]
            | undefined;

          if (!firstCalendarCredential) {
            if (destination.integration === CALDAV_CALENDAR_TYPE) {
              log.warn(
                "No CalDAV credentials found with matching server URL for destination calendar. This prevents credential leakage.",
                safeStringify({
                  destination: getPiiFreeDestinationCalendar(destination),
                })
              );
            } else {
              log.warn(
                "No other credentials found of the same type as the destination calendar. Falling back to first connected calendar"
              );
            }
            await fallbackToFirstCalendarInTheList();
          } else {
            log.warn(
              "No credentialId found for destination calendar, falling back to first found calendar of same type as destination calendar",
              safeStringify({
                destination: getPiiFreeDestinationCalendar(destination),
                firstConnectedCalendar: getPiiFreeCredential(firstCalendarCredential),
              })
            );
            createdEvents.push(await createEvent(firstCalendarCredential, event));
            eventCreated = true;
          }
        }
      }
    } else {
      log.warn(
        "No destination Calendar found, falling back to first connected calendar",
        safeStringify({
          calendarCredentials: this.calendarCredentials,
        })
      );
      await fallbackToFirstCalendarInTheList();
    }

    // Taking care of non-traditional calendar integrations
    createdEvents = createdEvents.concat(
      await Promise.all(
        this.calendarCredentials
          .filter((cred) => cred.type.includes("other_calendar"))
          .map(async (cred) => await createEvent(cred, event))
      )
    );

    return createdEvents;
  }

  /**
   * Checks which video integration is needed for the event's location and returns
   * credentials for that - if existing.
   * @param event
   * @private
   */

  private getVideoCredentialByCalendarEvent(event: CalendarEvent): CredentialForCalendarService | undefined {
    if (!event.location) {
      return undefined;
    }

    /** @fixme potential bug since Google Meet are saved as `integrations:google:meet` and there are no `google:meet` type in our DB */
    const integrationName = event.location.replace("integrations:", "");
    let videoCredential;
    if (event.conferenceCredentialId) {
      videoCredential = this.videoCredentials.find(
        (credential) => credential.id === event.conferenceCredentialId
      );
    } else {
      videoCredential = this.videoCredentials.find((credential: CredentialForCalendarService) =>
        credential.type.includes(integrationName)
      );
      log.warn(
        `Could not find conferenceCredentialId for event with location: ${event.location}, trying to use last added video credential`
      );
    }

    /**
     * This might happen if someone tries to use a location with a missing credential, so we fallback to Cal Video.
     * @todo remove location from event types that has missing credentials
     * */
    if (!videoCredential) {
      log.warn(
        `Falling back to "daily" video integration for event with location: ${event.location} because credential is missing for the app`
      );
      videoCredential = { ...FAKE_DAILY_CREDENTIAL };
    }

    return videoCredential;
  }

  /**
   * Creates a video event entry for the selected integration location.
   *
   * When optional uid is set, it will be used instead of the auto generated uid.
   *
   * @param event
   * @private
   */
  private async createVideoEvent(event: CalendarEvent) {
    const credential = this.getVideoCredentialByCalendarEvent(event);
    if (credential) {
      return createMeeting(credential, event);
    } else {
      return Promise.reject(
        `No suitable credentials given for the requested integration name:${event.location}`
      );
    }
  }

  /**
   * Updates calendar events for a booking and optionally skips selected calendar types.
   *
   * @param event - Calendar event data to apply to the external calendar entries.
   * @param booking - Booking whose calendar references should be updated.
   * @param newBookingId - Optional replacement booking ID to source references from.
   * @param options - Optional calendar types to exclude from updates.
   * @returns Calendar update results for all updated references.
   */
  private async updateAllCalendarEvents(
    event: CalendarEvent,
    booking: PartialBooking,
    newBookingId?: number,
    options?: { excludedCalendarTypes?: string[] }
  ): Promise<Array<EventResult<NewCalendarEventType>>> {
    let calendarReference: PartialReference[] | undefined, credential;
    log.silly("updateAllCalendarEvents", JSON.stringify({ event, booking, newBookingId }));
    try {
      // If a newBookingId is given, update that calendar event
      let newBooking;
      if (newBookingId) {
        newBooking = await prisma.booking.findUnique({
          where: {
            id: newBookingId,
          },
          select: {
            references: true,
          },
        });
      }

      calendarReference = newBooking?.references.length
        ? newBooking.references.filter((reference) => reference.type.includes("_calendar"))
        : booking.references.filter((reference) => reference.type.includes("_calendar"));
      if (options?.excludedCalendarTypes?.length) {
        calendarReference = calendarReference.filter(
          /**
           * Removes calendar references that should not receive this update.
           *
           * @param reference - Calendar reference being considered for update.
           * @returns Whether the calendar reference should still be updated.
           */
          (reference) => !options.excludedCalendarTypes?.includes(reference.type)
        );
      }

      if (calendarReference.length === 0) {
        return [];
      }
      // process all calendar references
      let result = [];
      for (const reference of calendarReference) {
        const { uid: bookingRefUid, externalCalendarId: bookingExternalCalendarId } = reference;
        let calendarExternalId: string | null = null;
        if (bookingExternalCalendarId) {
          calendarExternalId = bookingExternalCalendarId;
        }

        if (reference.credentialId) {
          credential = this.calendarCredentials.filter(
            (credential) => credential.id === reference?.credentialId
          )[0];
          if (!credential) {
            // Fetch credential from DB
            const credentialFromDB = await CredentialRepository.findCredentialForCalendarServiceById({
              id: reference.credentialId,
            });
            if (credentialFromDB && credentialFromDB.appId) {
              credential = {
                id: credentialFromDB.id,
                type: credentialFromDB.type,
                key: credentialFromDB.key,
                userId: credentialFromDB.userId,
                teamId: credentialFromDB.teamId,
                invalid: credentialFromDB.invalid,
                appId: credentialFromDB.appId,
                user: credentialFromDB.user,
                encryptedKey: credentialFromDB.encryptedKey,
                delegatedToId: credentialFromDB.delegatedToId,
                delegatedTo: credentialFromDB.delegatedTo,
                delegationCredentialId: credentialFromDB.delegationCredentialId,
              };
            }
          }
          result.push(updateEvent(credential, event, bookingRefUid, calendarExternalId));
        } else {
          const credentials = this.calendarCredentials.filter(
            (credential) => credential.type === reference?.type
          );
          for (const credential of credentials) {
            log.silly("updateAllCalendarEvents-credential", JSON.stringify({ credentials }));
            result.push(updateEvent(credential, event, bookingRefUid, calendarExternalId));
          }
        }
      }
      // If we are merging two calendar events we should delete the old calendar event
      if (newBookingId) {
        const oldCalendarEvent = booking.references.find((reference) => reference.type.includes("_calendar"));

        if (oldCalendarEvent?.credentialId) {
          const calendarCredential = await CredentialRepository.findCredentialForCalendarServiceById({
            id: oldCalendarEvent.credentialId,
          });
          const calendar = await getCalendar(calendarCredential, "booking");
          await calendar?.deleteEvent(oldCalendarEvent.uid, event, oldCalendarEvent.externalCalendarId);
        }
      }

      // Taking care of non-traditional calendar integrations
      result = result.concat(
        this.calendarCredentials
          .filter((cred) => cred.type.includes("other_calendar"))
          .map(async (cred) => {
            const calendarReference = booking.references.find((ref) => ref.type === cred.type);

            if (!calendarReference) {
              return {
                appName: cred.appName || cred.appId || "",
                type: cred.type,
                success: false,
                uid: "",
                originalEvent: event,
                credentialId: cred.id,
              };
            }
            const { externalCalendarId: bookingExternalCalendarId, meetingId: bookingRefUid } =
              calendarReference;
            return await updateEvent(cred, event, bookingRefUid ?? null, bookingExternalCalendarId ?? null);
          })
      );

      return Promise.all(result);
    } catch (error) {
      let message = `Tried to 'updateAllCalendarEvents' but there was no '{thing}' for '${credential?.type}', userId: '${credential?.userId}', bookingId: '${booking?.id}'`;
      if (error instanceof Error) {
        message = message.replace("{thing}", error.message);
      }

      return Promise.resolve(
        calendarReference?.map((reference) => {
          return {
            appName: "none",
            type: reference?.type || "calendar",
            success: false,
            uid: "",
            originalEvent: event,
            credentialId: 0,
          };
        }) ?? ([] as Array<EventResult<NewCalendarEventType>>)
      );
    }
  }

  /**
   * Updates a single video event.
   *
   * @param event
   * @param booking
   * @private
   */
  private async updateVideoEvent(event: CalendarEvent, booking: PartialBooking) {
    const credential = this.getVideoCredentialByCalendarEvent(event);

    if (credential) {
      const bookingRef = booking ? booking.references.filter((ref) => ref.type === credential.type)[0] : null;
      return updateMeeting(credential, event, bookingRef);
    } else {
      return Promise.reject(
        `No suitable credentials given for the requested integration name:${event.location}`
      );
    }
  }

  private async createAllCRMEvents(event: CalendarEvent) {
    const createdEvents = [];

    const featureRepo = new FeaturesRepository(prisma);
    const isTaskerEnabledForSalesforceCrm = event.team?.id
      ? await featureRepo.checkIfTeamHasFeature(event.team.id, "salesforce-crm-tasker")
      : false;

    const uid = getUid(event.uid);
    for (const credential of this.crmCredentials) {
      if (isTaskerEnabledForSalesforceCrm) {
        if (!event.uid) {
          console.error(
            `Missing bookingId when scheduling CRM event creation on event type ${event?.eventTypeId}`
          );
          continue;
        }

        await CRMScheduler.createEvent({ bookingUid: event.uid });
        continue;
      }

      const currentAppOption = this.getAppOptionsFromEventMetadata(credential);

      const crm = new CrmManager(credential, currentAppOption);

      let success = true;
      const createdEvent = await crm.createEvent(event).catch((error) => {
        success = false;
        // We don't know the type of the error here, so for an Error instance we can read message but otherwise we stringify the error
        const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
        log.warn(`Error creating crm event for ${credential.type} for booking ${event?.uid}`, errorMsg);
      });

      if (createdEvent) {
        createdEvents.push({
          type: credential.type,
          appName: credential.appName || credential.appId || "",
          uid,
          success,
          createdEvent: {
            id: createdEvent?.id || "",
            type: credential.type,
            credentialId: credential.id,
          },
          id: createdEvent?.id || "",
          originalEvent: event,
          credentialId: credential.id,
        });
      }
    }
    return createdEvents;
  }

  private async updateAllCRMEvents(event: CalendarEvent, booking: PartialBooking) {
    const updatedEvents = [];

    // Loop through all booking references and update the corresponding CRM event
    for (const reference of booking.references) {
      const credential = this.crmCredentials.find((cred) => cred.id === reference.credentialId);
      let success = true;
      if (credential) {
        const crm = new CrmManager(credential);
        const updatedEvent = await crm.updateEvent(reference.uid, event).catch((error) => {
          success = false;
          log.warn(`Error updating crm event for ${credential.type} for booking ${event?.uid}`, error);
        });

        updatedEvents.push({
          type: credential.type,
          appName: credential.appName || credential.appId || "",
          success,
          uid: updatedEvent?.id || "",
          originalEvent: event,
        });
      }
    }

    return updatedEvents;
  }

  private async deleteCRMEvent({ reference, event }: { reference: PartialReference; event: CalendarEvent }) {
    const credential = this.crmCredentials.find((cred) => cred.id === reference.credentialId);
    if (credential) {
      const currentAppOption = this.getAppOptionsFromEventMetadata(credential);
      const crm = new CrmManager(credential, currentAppOption);
      await crm.deleteEvent(reference.uid, event);
    }
  }

  private getAppOptionsFromEventMetadata(credential: CredentialForCalendarService) {
    if (!this.appOptions || !credential.appId) return {};

    if (credential.appId in this.appOptions)
      return this.appOptions[credential.appId as keyof typeof this.appOptions];
  }
}

export const placeholderCreatedEvent = { results: [], referencesToCreate: [] };
