import process from "node:process";
import type { Credential, DestinationCalendar, EventType, SelectedCalendar } from "@calcom/prisma/client";
import type { CalendarEvent } from "@calcom/types/Calendar";

function getBooleanStatus(val: unknown) {
  if (process.env.NODE_ENV === "production") {
    return `PiiFree:${!!val}`;
  } else {
    return val;
  }
}

export function getPiiFreeCalendarEvent(calEvent: CalendarEvent) {
  return {
    eventTypeId: calEvent.eventTypeId,
    type: calEvent.type,
    startTime: calEvent.startTime,
    endTime: calEvent.endTime,
    schedulingType: calEvent.schedulingType,
    seatsPerTimeSlot: calEvent.seatsPerTimeSlot,
    appsStatus: calEvent.appsStatus,
    recurringEvent: calEvent.recurringEvent,
    recurrence: calEvent.recurrence,
    requiresConfirmation: calEvent.requiresConfirmation,
    uid: calEvent.uid,
    conferenceCredentialId: calEvent.conferenceCredentialId,
    iCalUID: calEvent.iCalUID,
    /**
     * Let's just get a boolean value for PII sensitive fields so that we atleast know if it's present or not
     */
    // Not okay to have title which can have Booker and Organizer names
    title: getBooleanStatus(calEvent.title),
    // .... Add all other props here that we don't want to be logged. It prevents those properties from being logged accidentally
  };
}

export function getPiiFreeBooking(booking: {
  id: number;
  uid: string;
  userId: number | null;
  startTime: Date;
  endTime: Date;
  title: string;
}) {
  return {
    id: booking.id,
    uid: booking.uid,
    userId: booking.userId,
    startTime: booking.startTime,
    endTime: booking.endTime,
    /**
     * Let's just get a boolean value for PII sensitive fields so that we atleast know if it's present or not
     */
    // Not okay to have title which can have Booker and Organizer names
    title: getBooleanStatus(booking.title),
    // .... Add all other props here that we don't want to be logged. It prevents those properties from being logged accidentally
  };
}

export function getPiiFreeCredential(credential: Partial<Credential> & { delegatedTo?: unknown }) {
  /**
   * Let's just get a boolean value for PII sensitive fields so that we atleast know if it's present or not
   */
  const booleanKeyStatus = getBooleanStatus(credential?.key);

  return {
    ...credential,
    key: booleanKeyStatus,
    delegatedTo: !!credential.delegatedTo,
  };
}

export function getPiiFreeSelectedCalendar(selectedCalendar: Partial<SelectedCalendar>) {
  return {
    integration: selectedCalendar.integration,
    userId: selectedCalendar.userId,
    // Get first 3 characters of externalId, so that we know what it could be but not the full value
    externalId: selectedCalendar.externalId?.slice(0, 3),
    credentialId: !!selectedCalendar.credentialId,
  };
}

export function getPiiFreeDestinationCalendar(destinationCalendar: Partial<DestinationCalendar>) {
  return {
    integration: destinationCalendar.integration,
    userId: destinationCalendar.userId,
    credentialId: destinationCalendar.credentialId,
    /**
     * Let's just get a boolean value for PII sensitive fields so that we atleast know if it's present or not
     */
    externalId: getBooleanStatus(destinationCalendar.externalId),
  };
}

export function getPiiFreeEventType(
  eventType: Partial<Pick<EventType, "id" | "schedulingType" | "seatsPerTimeSlot">>
) {
  return {
    id: eventType.id,
    schedulingType: eventType.schedulingType,
    seatsPerTimeSlot: eventType.seatsPerTimeSlot,
  };
}

export function getPiiFreeUser(user: {
  id?: number;
  username?: string | null;
  isFixed?: boolean;
  timeZone?: string;
  allowDynamicBooking?: boolean | null;
  defaultScheduleId?: number | null;
  organizationId?: number | null;
  credentials?: Partial<Credential>[];
  destinationCalendar?: DestinationCalendar | null;
}) {
  return {
    id: user.id,
    username: user.username,
    isFixed: user.isFixed,
    timeZone: user.timeZone,
    allowDynamicBooking: user.allowDynamicBooking,
    defaultScheduleId: user.defaultScheduleId,
    organizationId: user.organizationId,
    credentials: user.credentials?.map(getPiiFreeCredential),
    destinationCalendar: user.destinationCalendar
      ? getPiiFreeDestinationCalendar(user.destinationCalendar)
      : user.destinationCalendar,
  };
}
