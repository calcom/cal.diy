import { getCalendar } from "@calcom/app-store/_utils/getCalendar";
import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import type { BookingRepository } from "@calcom/features/bookings/repositories/BookingRepository";
import {
  getBusyTimesFromLimits,
  getBusyTimesFromTeamLimits,
} from "@calcom/features/busyTimes/lib/getBusyTimesFromLimits";
import { getBusyTimesService } from "@calcom/features/di/containers/BusyTimes";
import type { EventTypeRepository } from "@calcom/features/eventtypes/repositories/eventTypeRepository";
import type { PrismaHolidayRepository } from "@calcom/features/holidays/repositories/PrismaHolidayRepository";
import type { PrismaOOORepository } from "@calcom/features/ooo/repositories/PrismaOOORepository";
import type { IRedisService } from "@calcom/features/redis/IRedisService";
import type { DateOverride, WorkingHours } from "@calcom/features/schedules/lib/date-ranges";
import { buildDateRanges, subtract } from "@calcom/features/schedules/lib/date-ranges";
import { getWorkingHours } from "@calcom/lib/availability";
import { stringToDayjsZod } from "@calcom/lib/dayjs";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { getHolidayService } from "@calcom/lib/holidays";
import { getHolidayEmoji } from "@calcom/lib/holidays/getHolidayEmoji";
import { HttpError } from "@calcom/lib/http-error";
import { parseBookingLimit } from "@calcom/lib/intervalLimits/isBookingLimits";
import { parseDurationLimit } from "@calcom/lib/intervalLimits/isDurationLimits";
import { getPeriodStartDatesBetween as getPeriodStartDatesBetweenUtil } from "@calcom/lib/intervalLimits/utils/getPeriodStartDatesBetween";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import { withReporting } from "@calcom/lib/sentryWrapper";
import type {
  Availability,
  Booking,
  OutOfOfficeEntry,
  OutOfOfficeReason,
  EventType as PrismaEventType,
  SelectedCalendar,
  TravelSchedule,
  User,
} from "@calcom/prisma/client";
import { SchedulingType } from "@calcom/prisma/enums";
import { EventTypeMetaDataSchema } from "@calcom/prisma/zod-utils";
import type { CalendarFetchMode, EventBusyDetails, IntervalLimitUnit } from "@calcom/types/Calendar";
import type { CredentialForCalendarService } from "@calcom/types/Credential";
import type { TimeRange, WorkingHours as WorkingHoursWithUserId } from "@calcom/types/schedule";
import type { Ensure, Optional } from "@calcom/types/utils";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { detectEventTypeScheduleForUser } from "./detectEventTypeScheduleForUser";

const log = logger.getSubLogger({ prefix: ["getUserAvailability"] });

/** Normalize busy times to UTC for subtract(); used by getUserAvailability and tests. */
export function formatBusyTimesToUtc(
  busyTimes: { start: Date | string; end: Date | string }[]
): { start: Dayjs; end: Dayjs }[] {
  return busyTimes.map((busy) => ({
    start: dayjs(busy.start).utc(),
    end: dayjs(busy.end).utc(),
  }));
}

type GetUsersAvailabilityQuery = {
  dateFrom: string;
  dateTo: string;
  eventTypeId?: number;
  afterEventBuffer?: number;
  beforeEventBuffer?: number;
  duration?: number;
  withSource?: boolean;
  returnDateOverrides: boolean;
  bypassBusyCalendarTimes?: boolean;
  silentlyHandleCalendarFailures?: boolean;
  mode?: string;
};

const availabilitySchema: z.ZodType<GetUserAvailabilityParams, z.ZodTypeDef, unknown> = z.object({
  dateFrom: stringToDayjsZod,
  dateTo: stringToDayjsZod,
  eventTypeId: z.number().optional(),
  afterEventBuffer: z.number().optional(),
  beforeEventBuffer: z.number().optional(),
  duration: z.number().optional(),
  withSource: z.boolean().optional(),
  returnDateOverrides: z.boolean(),
  bypassBusyCalendarTimes: z.boolean().optional(),
  silentlyHandleCalendarFailures: z.boolean().optional(),
  shouldServeCache: z.boolean().optional(),
  mode: z.enum(["slots", "overlay", "booking", "none"]).default("none"),
});

type GetUserAvailabilityParams = {
  withSource?: boolean;
  username?: string;
  userId?: number;
  dateFrom: Dayjs;
  dateTo: Dayjs;
  eventTypeId?: number;
  afterEventBuffer?: number;
  beforeEventBuffer?: number;
  duration?: number;
  returnDateOverrides: boolean;
  bypassBusyCalendarTimes?: boolean;
  silentlyHandleCalendarFailures?: boolean;
  mode?: CalendarFetchMode;
};

interface GetUserAvailabilityParamsDTO {
  availability: (DateOverride | WorkingHours)[];
}

type GetUsersAvailabilityProps = {
  users: (GetAvailabilityUser & {
    currentBookings?: GetUserAvailabilityInitialData["currentBookings"];
    outOfOfficeDays?: GetUserAvailabilityInitialData["outOfOfficeDays"];
  })[];
  query: GetUsersAvailabilityQuery;
  initialData?: Omit<GetUserAvailabilityInitialData, "user">;
};

export type EventType = Awaited<ReturnType<(typeof UserAvailabilityService)["prototype"]["_getEventType"]>>;

export type GetUserAvailabilityInitialData = {
  user: {
    isFixed?: boolean;
    groupId?: string | null;
    username: string | null;
    id: number;
    email: string;
    bufferTime: number;
    timeZone: string;
    availability: Availability[];
    timeFormat: number | null;
    defaultScheduleId: number | null;
    isPlatformManaged: boolean;
    schedules: {
      availability: { days: number[]; startTime: Date; endTime: Date; date: Date | null }[];
      timeZone: string | null;
      id: number;
    }[];
    credentials: CredentialForCalendarService[];
    allSelectedCalendars: SelectedCalendar[];
    userLevelSelectedCalendars: SelectedCalendar[];
    travelSchedules: TravelSchedule[];
  } | null;
  eventType?: EventType;
  currentSeats?: CurrentSeats;
  rescheduleUid?: string | null;
  currentBookings?: (Pick<Booking, "id" | "uid" | "userId" | "startTime" | "endTime" | "title"> & {
    eventType: Pick<
      PrismaEventType,
      "id" | "beforeEventBuffer" | "afterEventBuffer" | "seatsPerTimeSlot"
    > | null;
    _count?: {
      seatsReferences: number;
    };
  })[];
  outOfOfficeDays?: (Pick<OutOfOfficeEntry, "id" | "start" | "end" | "notes" | "showNotePublicly"> & {
    user: Pick<User, "id" | "name">;
    toUser: Pick<User, "id" | "username" | "name"> | null;
    reason: Pick<OutOfOfficeReason, "id" | "emoji" | "reason"> | null;
  })[];
  busyTimesFromLimitsBookings?: EventBusyDetails[];
  busyTimesFromLimits?: Map<number, EventBusyDetails[]>;
  eventTypeForLimits?: {
    id: number;
    bookingLimits?: unknown;
    durationLimits?: unknown;
  } | null;
  teamBookingLimits?: Map<number, EventBusyDetails[]>;
  teamForBookingLimits?: {
    id: number;
    bookingLimits?: unknown;
    includeManagedEventsInLimits: boolean;
  } | null;
};

export type GetAvailabilityUser = GetUserAvailabilityInitialData["user"];

export type CurrentSeats = Awaited<
  ReturnType<(typeof UserAvailabilityService)["prototype"]["_getCurrentSeats"]>
>;

type UserAvailabilityBusyDetails = Optional<EventBusyDetails, "source">;

export type GetUserAvailabilityResult = {
  busy: UserAvailabilityBusyDetails[];
  timeZone: string;
  dateRanges: {
    start: dayjs.Dayjs;
    end: dayjs.Dayjs;
  }[];
  oooExcludedDateRanges: {
    start: dayjs.Dayjs;
    end: dayjs.Dayjs;
  }[];
  workingHours: WorkingHoursWithUserId[];
  dateOverrides: TimeRange[];
  currentSeats:
    | {
        uid: string;
        startTime: Date;
        _count: {
          attendees: number;
        };
      }[]
    | null;
  datesOutOfOffice?: IOutOfOfficeData;
};

export interface IFromUser {
  id: number;
  displayName: string | null;
}

export interface IToUser {
  id: number;
  username: string | null;
  displayName: string | null;
}

export interface IOutOfOfficeData {
  [key: string]: {
    fromUser: IFromUser | null;
    toUser?: IToUser | null;
    reason?: string | null;
    emoji?: string | null;
    notes?: string | null;
    showNotePublicly?: boolean;
  };
}

export interface IUserAvailabilityService {
  eventTypeRepo: EventTypeRepository;
  oooRepo: PrismaOOORepository;
  bookingRepo: BookingRepository;
  redisClient: IRedisService;
  holidayRepo: PrismaHolidayRepository;
}

export class UserAvailabilityService {
  constructor(public readonly dependencies: IUserAvailabilityService) {}

  // Fetch timezones from outlook or google using delegated credentials (formely known as domain wide delegatiion)
  async getTimezoneFromDelegatedCalendars(user: NonNullable<GetAvailabilityUser>): Promise<string | null> {
    if (!user.credentials || user.credentials.length === 0) {
      return null;
    }

    const delegatedCredentials = user.credentials.filter(
      (credential) => credential.type.endsWith("_calendar") && Boolean(credential.delegatedToId)
    );

    if (!delegatedCredentials || delegatedCredentials.length === 0) {
      return null;
    }

    const cacheKey = `user-timezone:${user.id}`;

    try {
      const cachedTimezone = await this.dependencies.redisClient.get<string>(cacheKey);

      if (cachedTimezone) {
        log.debug(`Got timezone ${cachedTimezone} from Redis cache for user ${user.id}`);
        return cachedTimezone;
      }
    } catch (error) {
      log.warn(`Failed to get timezone from Redis cache for user ${user.id}:`, error);
    }

    if (delegatedCredentials.length === 0) {
      return null;
    }

    for (const credential of delegatedCredentials) {
      try {
        const calendar = await getCalendar(credential, "slots");
        if (calendar && "getMainTimeZone" in calendar && typeof calendar.getMainTimeZone === "function") {
          const timezone = await calendar.getMainTimeZone();
          if (timezone && timezone !== "UTC") {
            log.debug(`Got timezone ${timezone} from calendar service ${credential.type}`);

            try {
              await this.dependencies.redisClient.set<string>(cacheKey, timezone, { ttl: 3600 * 6 * 1000 }); // 6 hours ttl in ms;
              log.debug(`Cached timezone ${timezone} in Redis for user ${user.id}`);
            } catch (error) {
              log.warn(`Failed to set timezone in Redis cache for user ${user.id}:`, error);
            }

            return timezone;
          }
        }
      } catch (error) {
        log.warn(`Failed to get timezone from calendar service ${credential.type}:`, error);
      }
    }

    return null;
  }

  async _getEventType(id: number) {
    const eventType = await this.dependencies.eventTypeRepo.findByIdForUserAvailability({ id });
    if (!eventType) {
      return eventType;
    }
    return {
      ...eventType,
      metadata: EventTypeMetaDataSchema.parse(eventType.metadata),
    };
  }

  getEventType = withReporting(this._getEventType.bind(this), "getEventType");

  async _getCurrentSeats(
    eventType: {
      id?: number;
      schedulingType?: SchedulingType | null;
      hosts?: {
        user: {
          email: string;
        };
      }[];
    },
    dateFrom: Dayjs,
    dateTo: Dayjs
  ) {
    const { schedulingType, hosts, id } = eventType;
    const hostEmails = hosts?.map((host) => host.user.email);
    const isTeamEvent =
      schedulingType === SchedulingType.MANAGED ||
      schedulingType === SchedulingType.ROUND_ROBIN ||
      schedulingType === SchedulingType.COLLECTIVE;

    const bookings = await this.dependencies.bookingRepo.findAcceptedBookingByEventTypeId({
      eventTypeId: id,
      dateFrom: dateFrom.format(),
      dateTo: dateTo.format(),
    });

    return bookings.map((booking) => {
      const attendees = isTeamEvent
        ? booking.attendees.filter((attendee) => !hostEmails?.includes(attendee.email))
        : booking.attendees;

      return {
        uid: booking.uid,
        startTime: booking.startTime,
        _count: {
          attendees: attendees.length,
        },
      };
    });
  }

  getCurrentSeats = withReporting(this._getCurrentSeats.bind(this), "getCurrentSeats");

  private async parseLimits(eventType: { durationLimits?: unknown; bookingLimits?: unknown } | null) {
    const bookingLimits =
      eventType?.bookingLimits &&
      typeof eventType.bookingLimits === "object" &&
      Object.keys(eventType.bookingLimits).length > 0
        ? parseBookingLimit(eventType.bookingLimits)
        : null;
    const durationLimits =
      eventType?.durationLimits &&
      typeof eventType.durationLimits === "object" &&
      Object.keys(eventType.durationLimits).length > 0
        ? parseDurationLimit(eventType.durationLimits)
        : null;
    return { bookingLimits, durationLimits };
  }

  /** This should be called getUsersWorkingHoursAndBusySlots (...and remaining seats, and final timezone) */
  async _getUserAvailability(
    params: GetUserAvailabilityParams,
    initialData?: GetUserAvailabilityInitialData
  ): Promise<GetUserAvailabilityResult> {
    const {
      username,
      userId,
      dateFrom,
      dateTo,
      eventTypeId,
      afterEventBuffer,
      beforeEventBuffer,
      duration,
      returnDateOverrides,
      bypassBusyCalendarTimes = false,
      silentlyHandleCalendarFailures = false,
      mode = "none",
      withSource = false,
    } = params;

    log.debug(
      `EventType: ${eventTypeId} | User: ${username} (ID: ${userId}) - Called with: ${safeStringify({
        params,
      })}`
    );

    const user = initialData?.user || null;
    if (!user) {
      throw new HttpError({ statusCode: 404, message: "No user found in getUserAvailability" });
    }

    let eventType: EventType | null = initialData?.eventType || null;
    if (!eventType && eventTypeId) eventType = await this.getEventType(eventTypeId);
    /* Current logic is if a booking is in a time slot mark it as busy, but seats can have more than one attendee so grab
    current bookings with a seats event type and display them on the calendar, even if they are full */
    let currentSeats: CurrentSeats | null = initialData?.currentSeats || null;
    if (!currentSeats && eventType?.seatsPerTimeSlot) {
      currentSeats = await this.getCurrentSeats(eventType, dateFrom, dateTo);
    }

    const { isDefaultSchedule, isTimezoneSet, schedule } = detectEventTypeScheduleForUser({
      eventType,
      user,
    });

    if (
      !(
        schedule?.availability ||
        (eventType?.availability.length ? eventType.availability : user.availability)
      )
    ) {
      throw new HttpError({ statusCode: 400, message: ErrorCode.AvailabilityNotFoundInSchedule });
    }

    const availability = (
      schedule?.availability || (eventType?.availability.length ? eventType.availability : user.availability)
    ).map((a) => ({
      ...a,
      userId: user.id,
    }));

    let calendarTimezone: string | null = null;
    let finalTimezone: string | null = null;

    if (!isTimezoneSet) {
      calendarTimezone = await this.getTimezoneFromDelegatedCalendars(user);
      if (calendarTimezone) {
        finalTimezone = calendarTimezone;
      }
    }

    if (!finalTimezone) {
      finalTimezone = schedule.timeZone;
    }

    const workingHours = getWorkingHours({ timeZone: finalTimezone }, availability);

    const dateOverrides: TimeRange[] = [];
    // NOTE: getSchedule is currently calling this function for every user in a team event
    // but not using these values at all, wasting CPU. Adding this check here temporarily to avoid a larger refactor
    // since other callers do using this data.
    if (returnDateOverrides) {
      const calculateDateOverridesSpan = Sentry.startInactiveSpan({ name: "calculateDateOverrides" });
      const availabilityWithDates = availability.filter((availability) => !!availability.date);

      for (let i = 0; i < availabilityWithDates.length; i++) {
        const override = availabilityWithDates[i];
        const startTime = dayjs.utc(override.startTime);
        const endTime = dayjs.utc(override.endTime);
        const overrideStartDate = dayjs.utc(override.date).hour(startTime.hour()).minute(startTime.minute());
        const overrideEndDate = dayjs.utc(override.date).hour(endTime.hour()).minute(endTime.minute());
        if (
          overrideStartDate.isBetween(dateFrom, dateTo, null, "[]") ||
          overrideEndDate.isBetween(dateFrom, dateTo, null, "[]")
        ) {
          dateOverrides.push({
            start: overrideStartDate.toDate(),
            end: overrideEndDate.toDate(),
          });
        }
      }

      calculateDateOverridesSpan.end();
    }

    const outOfOfficeDays =
      initialData?.outOfOfficeDays ??
      (await this.dependencies.oooRepo.findUserOOODays({
        userId: user.id,
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
      }));

    const datesOutOfOffice: IOutOfOfficeData = this.calculateOutOfOfficeRanges(outOfOfficeDays, availability);

    const holidayBlockedDates = await this.calculateHolidayBlockedDates(
      user.id,
      dateFrom.toDate(),
      dateTo.toDate(),
      availability
    );

    for (const [date, holidayData] of Object.entries(holidayBlockedDates)) {
      if (!datesOutOfOffice[date]) {
        datesOutOfOffice[date] = holidayData;
      }
    }

    const travelSchedules: {
      startDate: Dayjs;
      endDate?: Dayjs;
      timeZone: string;
    }[] = [];

    if (isDefaultSchedule) {
      travelSchedules.push(
        ...user.travelSchedules.map((schedule) => {
          let endDate: Dayjs | undefined;
          if (schedule.endDate) {
            endDate = dayjs(schedule.endDate);
          }
          return {
            startDate: dayjs(schedule.startDate),
            endDate,
            timeZone: schedule.timeZone,
          };
        })
      );
    }

    const { dateRanges, oooExcludedDateRanges } = buildDateRanges({
      dateFrom,
      dateTo,
      availability,
      timeZone: finalTimezone,
      travelSchedules,
      outOfOffice: datesOutOfOffice,
    });

    if (dateRanges.length === 0)
      return {
        busy: [],
        timeZone: finalTimezone,
        dateRanges: [],
        oooExcludedDateRanges: [],
        workingHours: [],
        dateOverrides: [],
        currentSeats: [],
        datesOutOfOffice: undefined,
      };

    const { bookingLimits, durationLimits } = await this.parseLimits(eventType);

    // TODO: only query what we need after applying limits (shrink date range)
    const getBusyTimesStart = dateFrom.toISOString();
    const getBusyTimesEnd = dateTo.toISOString();

    const selectedCalendars = eventType?.useEventLevelSelectedCalendars
      ? user.allSelectedCalendars.filter((calendar) => calendar.eventTypeId === eventType.id)
      : user.userLevelSelectedCalendars;

    let busyTimesFromLimits: EventBusyDetails[] = [];
    if (initialData?.busyTimesFromLimits && initialData?.eventTypeForLimits) {
      busyTimesFromLimits = initialData.busyTimesFromLimits.get(user.id) || [];
    } else if (eventType && (bookingLimits || durationLimits)) {
      busyTimesFromLimits = await getBusyTimesFromLimits(
        bookingLimits,
        durationLimits,
        dateFrom.tz(finalTimezone),
        dateTo.tz(finalTimezone),
        duration,
        eventType,
        initialData?.busyTimesFromLimitsBookings ?? [],
        finalTimezone,
        initialData?.rescheduleUid ?? undefined
      );
    }

    const teamForBookingLimits =
      initialData?.teamForBookingLimits ??
      eventType?.team ??
      (eventType?.parent?.team?.includeManagedEventsInLimits ? eventType?.parent?.team : null);

    const teamBookingLimits = parseBookingLimit(teamForBookingLimits?.bookingLimits);

    let busyTimesFromTeamLimits: EventBusyDetails[] = [];

    if (initialData?.teamBookingLimits && teamForBookingLimits) {
      busyTimesFromTeamLimits = initialData.teamBookingLimits.get(user.id) || [];
    } else if (teamForBookingLimits && teamBookingLimits) {
      // Fall back to individual query if not available in initialData
      busyTimesFromTeamLimits = await getBusyTimesFromTeamLimits(
        user,
        teamBookingLimits,
        dateFrom.tz(finalTimezone),
        dateTo.tz(finalTimezone),
        teamForBookingLimits.id,
        teamForBookingLimits.includeManagedEventsInLimits,
        finalTimezone,
        initialData?.rescheduleUid ?? undefined
      );
    }

    let busyTimes = [];
    try {
      const busyTimesService = getBusyTimesService();
      busyTimes = await busyTimesService.getBusyTimes({
        credentials: user.credentials,
        startTime: getBusyTimesStart,
        endTime: getBusyTimesEnd,
        eventTypeId,
        userId: user.id,
        userEmail: user.email,
        username: `${user.username}`,
        beforeEventBuffer,
        afterEventBuffer,
        selectedCalendars,
        seatedEvent: !!eventType?.seatsPerTimeSlot,
        rescheduleUid: initialData?.rescheduleUid || null,
        duration,
        currentBookings: initialData?.currentBookings,
        bypassBusyCalendarTimes,
        silentlyHandleCalendarFailures,
        mode,
      });
    } catch (error) {
      log.error(`Error fetching busy times for user ${username}:`, error);
      return {
        busy: [],
        timeZone: finalTimezone,
        dateRanges: [],
        oooExcludedDateRanges: [],
        workingHours: [],
        dateOverrides: [],
        currentSeats: [],
        datesOutOfOffice: undefined,
      };
    }

    const detailedBusyTimesWithSource: EventBusyDetails[] = [
      ...busyTimes.map((a) => ({
        ...a,
        start: dayjs(a.start).toISOString(),
        end: dayjs(a.end).toISOString(),
        title: a.title,
        source: a.source,
      })),
      ...busyTimesFromLimits,
      ...busyTimesFromTeamLimits,
    ];

    const detailedBusyTimes: UserAvailabilityBusyDetails[] = withSource
      ? detailedBusyTimesWithSource
      : detailedBusyTimesWithSource.map(({ source, ...rest }) => rest);

    log.debug(
      `EventType: ${eventTypeId} | User: ${username} (ID: ${userId}) - usingSchedule: ${safeStringify({
        chosenSchedule: schedule,
        eventTypeSchedule: eventType?.schedule,
      })}`
    );

    const formattedBusyTimes = formatBusyTimesToUtc(detailedBusyTimes);

    const dateRangesInWhichUserIsAvailable = subtract(dateRanges, formattedBusyTimes);
    const dateRangesInWhichUserIsAvailableWithoutOOO = subtract(oooExcludedDateRanges, formattedBusyTimes);

    const result = {
      busy: detailedBusyTimes,
      timeZone: finalTimezone,
      dateRanges: dateRangesInWhichUserIsAvailable,
      oooExcludedDateRanges: dateRangesInWhichUserIsAvailableWithoutOOO,
      workingHours,
      dateOverrides,
      currentSeats,
      datesOutOfOffice,
    };

    log.debug(
      `EventType: ${eventTypeId} | User: ${username} (ID: ${userId}) - Result: ${safeStringify(result)}`
    );

    return result;
  }

  /**
   * This fn mainly uses _getUserAvailability but sends busy times from limits too to _getUserAvailability as expected by _getUserAvailability.
   */
  async getUserAvailabilityIncludingBusyTimesFromLimits(
    params: GetUserAvailabilityParams,
    initialData: Ensure<GetUserAvailabilityInitialData, "user">
  ): Promise<GetUserAvailabilityResult> {
    const { user } = initialData || {};
    const { dateFrom, dateTo, eventTypeId } = params;
    let eventType: EventType | null = initialData?.eventType || null;
    if (!eventType && eventTypeId) eventType = await this.getEventType(eventTypeId);

    const { bookingLimits, durationLimits } = await this.parseLimits(eventType);

    let busyTimesFromLimitsBookings: EventBusyDetails[] | undefined =
      initialData?.busyTimesFromLimitsBookings;
    if (!busyTimesFromLimitsBookings && eventType && (bookingLimits || durationLimits)) {
      const busyTimesService = getBusyTimesService();
      const { limitDateFrom, limitDateTo } = busyTimesService.getStartEndDateforLimitCheck(
        dateFrom.toISOString(),
        dateTo.toISOString(),
        bookingLimits,
        durationLimits
      );

      // For team events with booking/duration limits, fetch bookings for all team members
      // to accurately calculate if limits are reached for the event
      const userIdsForLimitCheck =
        eventType.hosts && eventType.hosts.length > 0
          ? eventType.hosts.map((host) => host.user.id)
          : [user.id];

      busyTimesFromLimitsBookings = await busyTimesService.getBusyTimesForLimitChecks({
        userIds: userIdsForLimitCheck,
        eventTypeId: eventType.id,
        startDate: limitDateFrom.format(),
        endDate: limitDateTo.format(),
        rescheduleUid: initialData?.rescheduleUid ?? undefined,
        bookingLimits,
        durationLimits,
      });
    }
    const result = await this._getUserAvailability(params, {
      ...initialData,
      ...(eventType ? { eventType } : {}),
      ...(busyTimesFromLimitsBookings ? { busyTimesFromLimitsBookings } : {}),
    });
    return result;
  }

  getUserAvailability = withReporting(this._getUserAvailability.bind(this), "getUserAvailability");

  getPeriodStartDatesBetween = withReporting(
    (dateFrom: Dayjs, dateTo: Dayjs, period: IntervalLimitUnit, timeZone?: string) =>
      getPeriodStartDatesBetweenUtil(dateFrom, dateTo, period, timeZone),
    "getPeriodStartDatesBetween"
  );

  calculateOutOfOfficeRanges(
    outOfOfficeDays: GetUserAvailabilityInitialData["outOfOfficeDays"],
    availability: GetUserAvailabilityParamsDTO["availability"]
  ): IOutOfOfficeData {
    if (!outOfOfficeDays || outOfOfficeDays.length === 0) {
      return {};
    }

    return outOfOfficeDays.reduce(
      (acc: IOutOfOfficeData, { start, end, toUser, user, reason, notes, showNotePublicly }) => {
        // here we should use startDate or today if start is before today
        // consider timezone in start and end date range
        const startDateRange = dayjs(start).utc().isBefore(dayjs().startOf("day").utc())
          ? dayjs().utc().startOf("day")
          : dayjs(start).utc().startOf("day");

        // get number of day in the week and see if it's on the availability
        const flattenDays = Array.from(
          new Set(availability.flatMap((a) => ("days" in a ? a.days : [])))
        ).sort((a, b) => a - b);

        const endDateRange = dayjs(end).utc().endOf("day");

        for (let date = startDateRange; date.isBefore(endDateRange); date = date.add(1, "day")) {
          const dayNumberOnWeek = date.day();

          if (!flattenDays?.includes(dayNumberOnWeek)) {
            continue; // Skip to the next iteration if day not found in flattenDays
          }
          // null notes if not to be shown publicly
          if (!showNotePublicly) {
            notes = null;
          }

          let toUserData = null;
          if (toUser) {
            toUserData = { id: toUser.id, displayName: toUser.name, username: toUser.username };
          }

          acc[date.format("YYYY-MM-DD")] = {
            // @TODO:  would be good having start and end availability time here, but for now should be good
            // you can obtain that from user availability defined outside of here
            fromUser: { id: user.id, displayName: user.name },
            // optional chaining destructuring toUser
            toUser: toUserData,
            reason: reason?.reason || null,
            emoji: reason?.emoji || null,
            notes,
            showNotePublicly,
          };
        }

        return acc;
      },
      {}
    );
  }

  async _getUsersAvailability({ users, query, initialData }: GetUsersAvailabilityProps) {
    if (users.length >= 50) {
      const userIds = users.map(({ id }) => id).join(", ");
      log.warn(
        `High-load warning: Attempting to fetch availability for ${users.length} users. User IDs: [${userIds}], EventTypeId: [${query.eventTypeId}]`
      );
    }

    const params = availabilitySchema.parse(query);

    if (!params.dateFrom.isValid() || !params.dateTo.isValid()) {
      throw new HttpError({ statusCode: 400, message: "Invalid time range given." });
    }

    return await Promise.all(
      users.map((user) =>
        this._getUserAvailability(
          {
            ...params,
            userId: user.id,
            username: user.username || "",
          },
          initialData
            ? {
                ...initialData,
                user,
                currentBookings: user.currentBookings,
                outOfOfficeDays: user.outOfOfficeDays,
              }
            : undefined
        )
      )
    );
  }

  getUsersAvailability = withReporting(this._getUsersAvailability.bind(this), "getUsersAvailability");

  async calculateHolidayBlockedDates(
    userId: number,
    startDate: Date,
    endDate: Date,
    availability: GetUserAvailabilityParamsDTO["availability"]
  ): Promise<IOutOfOfficeData> {
    const holidaySettings = await this.dependencies.holidayRepo.findUserSettingsSelect({
      userId,
      select: {
        countryCode: true,
        disabledIds: true,
      },
    });

    if (!holidaySettings || !holidaySettings.countryCode) {
      return {};
    }

    // Holidays are stored as midnight UTC (e.g., 2025-12-25T00:00:00Z).
    // When checking availability for a specific booking slot (e.g., 10:00-11:00),
    // we need to expand the date range to include the full day so holidays are found.
    // Otherwise, a booking at 10:00 wouldn't find a holiday stored at 00:00.
    const startOfDay = dayjs(startDate).utc().startOf("day").toDate();
    const endOfDay = dayjs(endDate).utc().endOf("day").toDate();

    const holidayService = getHolidayService();
    const holidayDates = await holidayService.getHolidayDatesInRange(
      holidaySettings.countryCode,
      holidaySettings.disabledIds,
      startOfDay,
      endOfDay
    );

    if (holidayDates.length === 0) {
      return {};
    }

    // Match OOO pattern: get working days from availability
    const flattenDays = Array.from(new Set(availability.flatMap((a) => ("days" in a ? a.days : [])))).sort(
      (a, b) => a - b
    );

    const result: IOutOfOfficeData = {};

    for (const { date, holiday } of holidayDates) {
      // Match OOO pattern: use dayjs.utc() to parse date string and get day of week
      const dayOfWeek = dayjs.utc(date).day();

      if (!flattenDays.includes(dayOfWeek)) {
        continue;
      }

      // Match OOO pattern: key by the date string (already in YYYY-MM-DD UTC format)
      result[date] = {
        fromUser: null,
        toUser: null,
        reason: holiday.name,
        emoji: getHolidayEmoji(holiday.name),
      };
    }

    return result;
  }
}
