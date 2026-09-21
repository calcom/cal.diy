import logger from "@calcom/lib/logger";
import type {
  Calendar,
  CalendarEvent,
  CalendarFetchMode,
  CalendarServiceEvent,
  EventBusyDate,
  GetAvailabilityParams,
  IntegrationCalendar,
  NewCalendarEventType,
} from "@calcom/types/Calendar";
import { metrics } from "@sentry/nextjs";

const log = logger.getSubLogger({ prefix: ["CalendarTelemetryWrapper"] });

/**
 * A wrapper to add telemetry to all calendar services.
 * This provides consistent metrics for comparing performance between cached and non-cached calendar loading.
 *
 * @see Calendar
 */
export class CalendarTelemetryWrapper implements Calendar {
  constructor(
    private deps: {
      originalCalendar: Calendar;
      calendarType: string;
      cacheSupported: boolean;
      cacheEnabled: boolean;
      credentialId: number;
      mode: CalendarFetchMode;
    }
  ) {}

  getCredentialId?(): number {
    return this.deps.originalCalendar.getCredentialId ? this.deps.originalCalendar.getCredentialId() : -1;
  }

  createEvent(
    event: CalendarServiceEvent,
    credentialId: number,
    externalCalendarId?: string
  ): Promise<NewCalendarEventType> {
    return this.deps.originalCalendar.createEvent(event, credentialId, externalCalendarId);
  }

  updateEvent(
    uid: string,
    event: CalendarServiceEvent,
    externalCalendarId?: string | null
  ): Promise<NewCalendarEventType | NewCalendarEventType[]> {
    return this.deps.originalCalendar.updateEvent(uid, event, externalCalendarId);
  }

  deleteEvent(uid: string, event: CalendarEvent, externalCalendarId?: string | null): Promise<unknown> {
    return this.deps.originalCalendar.deleteEvent(uid, event, externalCalendarId);
  }

  async getAvailability(params: GetAvailabilityParams): Promise<EventBusyDate[]> {
    const { dateFrom, dateTo, selectedCalendars } = params;

    if (!selectedCalendars?.length) return [];

    log.debug("getAvailability", {
      dateFrom,
      dateTo,
      calendarCount: selectedCalendars.length,
      cacheSupported: this.deps.cacheSupported,
      cacheEnabled: this.deps.cacheEnabled,
      mode: this.deps.mode,
    });

    const startTime = performance.now();

    const results = await this.deps.originalCalendar.getAvailability({
      dateFrom,
      dateTo,
      selectedCalendars,
      mode: params.mode,
      fallbackToPrimary: params.fallbackToPrimary,
    });

    const totalFetchDurationMs = performance.now() - startTime;

    metrics.count("calendar.getAvailability.calls", 1, {
      attributes: {
        cache: this.deps.cacheEnabled ? "on" : "off",
        calendarType: this.deps.calendarType,
        mode: String(this.deps.mode),
      },
    });

    metrics.distribution("calendar.getAvailability.duration_ms", totalFetchDurationMs, {
      attributes: {
        cache: this.deps.cacheEnabled ? "on" : "off",
        calendarType: this.deps.calendarType,
        mode: String(this.deps.mode),
      },
    });

    metrics.distribution("calendar.getAvailability.events_count", results.length, {
      attributes: {
        cache: this.deps.cacheEnabled ? "on" : "off",
        calendarType: this.deps.calendarType,
      },
    });

    log.debug("Calendar fetch completed", {
      calendarCount: selectedCalendars.length,
      totalFetchDurationMs,
      totalEventsCount: results.length,
      cacheSupported: this.deps.cacheSupported,
      cacheEnabled: this.deps.cacheEnabled,
      mode: this.deps.mode,
    });

    return results;
  }

  async getAvailabilityWithTimeZones(params: GetAvailabilityParams): Promise<EventBusyDate[]> {
    const { dateFrom, dateTo, selectedCalendars } = params;

    if (!this.deps.originalCalendar.getAvailabilityWithTimeZones) {
      return [];
    }

    if (!selectedCalendars?.length) return [];

    log.debug("getAvailabilityWithTimeZones", {
      dateFrom,
      dateTo,
      calendarCount: selectedCalendars.length,
      cacheSupported: this.deps.cacheSupported,
      cacheEnabled: this.deps.cacheEnabled,
      mode: this.deps.mode,
    });

    const startTime = performance.now();

    const results = await this.deps.originalCalendar.getAvailabilityWithTimeZones({
      dateFrom,
      dateTo,
      selectedCalendars,
      mode: params.mode,
      fallbackToPrimary: params.fallbackToPrimary,
    });

    const totalFetchDurationMs = performance.now() - startTime;

    metrics.count("calendar.getAvailabilityWithTimeZones.calls", 1, {
      attributes: {
        cache: this.deps.cacheEnabled ? "on" : "off",
        calendarType: this.deps.calendarType,
        mode: String(this.deps.mode),
      },
    });

    metrics.distribution("calendar.getAvailabilityWithTimeZones.duration_ms", totalFetchDurationMs, {
      attributes: {
        cache: this.deps.cacheEnabled ? "on" : "off",
        calendarType: this.deps.calendarType,
        mode: String(this.deps.mode),
      },
    });

    metrics.distribution("calendar.getAvailabilityWithTimeZones.events_count", results?.length ?? 0, {
      attributes: {
        cache: this.deps.cacheEnabled ? "on" : "off",
        calendarType: this.deps.calendarType,
      },
    });

    log.debug("Calendar fetch with timezones completed", {
      calendarCount: selectedCalendars.length,
      totalFetchDurationMs,
      totalEventsCount: results?.length ?? 0,
      cacheSupported: this.deps.cacheSupported,
      cacheEnabled: this.deps.cacheEnabled,
      mode: this.deps.mode,
    });

    return results ?? [];
  }

  fetchAvailabilityAndSetCache?(selectedCalendars: IntegrationCalendar[]): Promise<unknown> {
    return this.deps.originalCalendar.fetchAvailabilityAndSetCache?.(selectedCalendars) || Promise.resolve();
  }

  listCalendars(event?: CalendarEvent): Promise<IntegrationCalendar[]> {
    return this.deps.originalCalendar.listCalendars(event);
  }

  testDelegationCredentialSetup?(): Promise<void> {
    return this.deps.originalCalendar.testDelegationCredentialSetup?.() || Promise.resolve();
  }
}
