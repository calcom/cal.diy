import dayjs from "@calcom/dayjs";
import type { BookingRepository } from "@calcom/features/bookings/repositories/BookingRepository";
import { getBusyCalendarTimes } from "@calcom/features/calendars/lib/CalendarManager";
import type { HostRepository } from "@calcom/features/host/repositories/HostRepository";
import type { PrismaOOORepository } from "@calcom/features/ooo/repositories/PrismaOOORepository";
import { mergeOverlappingRanges } from "@calcom/features/schedules/lib/date-ranges";
import type { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import type { Booking, SelectedCalendar, User } from "@calcom/prisma/client";
import { RRResetInterval, RRTimestampBasis } from "@calcom/prisma/enums";
import type { EventBusyDate } from "@calcom/types/Calendar";
import type { CredentialForCalendarService } from "@calcom/types/Credential";

const log = logger.getSubLogger({ prefix: ["getLuckyUser"] });

type PartialBooking = Pick<Booking, "id" | "createdAt" | "userId" | "status"> & {
  attendees: { email: string | null }[];
};

type PartialUser = Pick<User, "id" | "email">;

type VirtualQueuesDataType = {
  chosenRouteId: string;
  fieldOptionData: {
    fieldId: string;
    selectedOptionIds: string | number | string[];
  };
};

interface GetLuckyUserParams<T extends PartialUser> {
  availableUsers: [T, ...T[]]; // ensure contains at least 1
  eventType: {
    id: number;
    isRRWeightsEnabled: boolean;
    team: {
      parentId?: number | null;
      rrResetInterval: RRResetInterval | null;
      rrTimestampBasis: RRTimestampBasis;
    } | null;
    includeNoShowInRRCalculation: boolean;
  };
  // all routedTeamMemberIds or all hosts of event types
  allRRHosts: {
    user: {
      id: number;
      email: string;
      credentials: CredentialForCalendarService[];
      userLevelSelectedCalendars: SelectedCalendar[];
    };
    createdAt: Date;
    weight?: number | null;
  }[];
  meetingStartTime?: Date;
}

// === Utility Functions kept outside of the class ===
const startOfMonth = (date: Date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const startOfDay = (date: Date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const endOfDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));

const endOfMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));

export const getIntervalEndDate = ({
  interval,
  rrTimestampBasis,
  meetingStartTime,
}: {
  interval: RRResetInterval;
  rrTimestampBasis: RRTimestampBasis;
  meetingStartTime?: Date;
}) => {
  if (rrTimestampBasis === RRTimestampBasis.START_TIME) {
    if (!meetingStartTime) {
      throw new Error("Meeting start time is required");
    }
    if (interval === RRResetInterval.DAY) {
      return endOfDay(meetingStartTime);
    }
    return endOfMonth(meetingStartTime);
  }

  return new Date();
};

export const getIntervalStartDate = ({
  interval,
  rrTimestampBasis,
  meetingStartTime,
}: {
  interval: RRResetInterval;
  rrTimestampBasis: RRTimestampBasis;
  meetingStartTime?: Date;
}) => {
  if (rrTimestampBasis === RRTimestampBasis.START_TIME) {
    if (!meetingStartTime) {
      throw new Error("Meeting start time is required");
    }
    if (interval === RRResetInterval.DAY) {
      return startOfDay(meetingStartTime);
    }
    return startOfMonth(meetingStartTime);
  }

  if (interval === RRResetInterval.DAY) {
    return startOfDay();
  }
  return startOfMonth();
};

const isNonEmptyArray = <T>(arr: T[]): arr is [T, ...T[]] => arr.length > 0;

function isFullDayEvent(date1: Date, date2: Date) {
  const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;
  const difference = Math.abs(date1.getTime() - date2.getTime());

  if (difference % MILLISECONDS_IN_A_DAY === 0) return true;
}

type OOODataType = { userId: number; oooEntries: { start: Date; end: Date }[] }[];

type FetchedData = {
  bookingsOfNotAvailableUsersOfInterval: PartialBooking[];
  bookingsOfAvailableUsersOfInterval: PartialBooking[];
  allRRHostsBookingsOfInterval: PartialBooking[];
  allRRHostsCreatedInInterval: { userId: number; createdAt: Date }[];
  organizersWithLastCreated: { id: number; bookings: { createdAt: Date }[] }[];
  attributeWeights?:
    | {
        userId: number;
        weight: number;
      }[]
    | null;
  virtualQueuesData?: VirtualQueuesDataType | null;
  oooData: OOODataType;
};

type AvailableUserBase = PartialUser & {
  priority: number | null;
  weight: number | null;
};

export interface ILuckyUserService {
  bookingRepository: BookingRepository;
  hostRepository: HostRepository;
  oooRepository: PrismaOOORepository;
  userRepository: UserRepository;
}

export class LuckyUserService implements ILuckyUserService {
  public bookingRepository: BookingRepository;
  public hostRepository: HostRepository;
  public oooRepository: PrismaOOORepository;
  public userRepository: UserRepository;

  constructor(deps: ILuckyUserService) {
    this.bookingRepository = deps.bookingRepository;
    this.hostRepository = deps.hostRepository;
    this.oooRepository = deps.oooRepository;
    this.userRepository = deps.userRepository;
  }

  private leastRecentlyBookedUser<T extends PartialUser>({
    availableUsers,
    bookingsOfAvailableUsers,
    organizersWithLastCreated,
    eventType,
  }: GetLuckyUserParams<T> & {
    bookingsOfAvailableUsers: PartialBooking[];
    organizersWithLastCreated: { id: number; bookings: { createdAt: Date }[] }[];
  }) {
    const organizerIdAndAtCreatedPair = organizersWithLastCreated.reduce(
      (keyValuePair: { [userId: number]: Date }, user) => {
        keyValuePair[user.id] = user.bookings[0]?.createdAt || new Date(0);
        return keyValuePair;
      },
      {}
    );

    const attendeeUserIdAndAtCreatedPair = bookingsOfAvailableUsers.reduce(
      (aggregate: { [userId: number]: Date }, booking) => {
        availableUsers.forEach((user) => {
          if (aggregate[user.id]) return;
          if (!booking.attendees.map((attendee) => attendee.email).includes(user.email)) return;
          if (organizerIdAndAtCreatedPair[user.id] > booking.createdAt) return;
          aggregate[user.id] = booking.createdAt;
        });
        return aggregate;
      },
      {}
    );

    const userIdAndAtCreatedPair = {
      ...organizerIdAndAtCreatedPair,
      ...attendeeUserIdAndAtCreatedPair,
    };

    log.info(
      "userIdAndAtCreatedPair",
      safeStringify({
        organizerIdAndAtCreatedPair,
        attendeeUserIdAndAtCreatedPair,
        userIdAndAtCreatedPair,
      })
    );

    if (!userIdAndAtCreatedPair) {
      throw new Error("Unable to find users by availableUser ids.");
    }

    const leastRecentlyBookedUser = availableUsers.sort((a, b) => {
      if (userIdAndAtCreatedPair[a.id] > userIdAndAtCreatedPair[b.id]) return 1;
      else if (userIdAndAtCreatedPair[a.id] < userIdAndAtCreatedPair[b.id]) return -1;
      else return eventType.isRRWeightsEnabled ? 0 : a.id - b.id;
    })[0];

    return leastRecentlyBookedUser;
  }

  private getHostsWithCalibration({
    hosts,
    allRRHostsBookingsOfInterval,
    allRRHostsCreatedInInterval,
    oooData,
  }: {
    hosts: { userId: number; email: string; createdAt: Date }[];
    allRRHostsBookingsOfInterval: PartialBooking[];
    allRRHostsCreatedInInterval: { userId: number; createdAt: Date }[];
    oooData: OOODataType;
  }) {
    function calculateNewHostCalibration(newHost: { userId: number; createdAt: Date }) {
      const existingBookingsBeforeAdded = existingBookings.filter(
        (booking) => booking.userId !== newHost.userId && booking.createdAt < newHost.createdAt
      );
      const hostsAddedBefore = hosts.filter(
        (host) => host.userId !== newHost.userId && host.createdAt < newHost.createdAt
      );

      const calibration =
        existingBookingsBeforeAdded.length && hostsAddedBefore.length
          ? existingBookingsBeforeAdded.length / hostsAddedBefore.length
          : 0;
      log.debug(
        "calculateNewHostCalibration",
        safeStringify({
          newHost,
          existingBookingsBeforeAdded: existingBookingsBeforeAdded.length,
          hostsAddedBefore: hostsAddedBefore.length,
          calibration,
        })
      );
      return calibration;
    }

    const existingBookings = allRRHostsBookingsOfInterval;

    const oooCalibration = new Map<number, number>();

    oooData.forEach(({ userId, oooEntries }) => {
      // Skip OOO calibration if there's only one host (division by zero would occur)
      if (hosts.length <= 1) {
        return;
      }

      let calibration = 0;

      oooEntries.forEach((oooEntry) => {
        const bookingsInTimeframe = existingBookings.filter(
          (booking) =>
            booking.createdAt >= oooEntry.start &&
            booking.createdAt <= oooEntry.end &&
            booking.userId !== userId
        );
        calibration += bookingsInTimeframe.length / (hosts.length - 1);
      });

      oooCalibration.set(userId, calibration);
    });

    let newHostsWithCalibration: Map<
      number,
      {
        calibration: number;
        userId: number;
        createdAt: Date;
      }
    > = new Map();

    if (allRRHostsCreatedInInterval.length && existingBookings.length) {
      newHostsWithCalibration = new Map(
        allRRHostsCreatedInInterval.map((newHost) => [
          newHost.userId,
          { ...newHost, calibration: calculateNewHostCalibration(newHost) },
        ])
      );
    }

    return hosts.map((host) => ({
      ...host,
      calibration:
        (newHostsWithCalibration.get(host.userId)?.calibration ?? 0) + (oooCalibration.get(host.userId) ?? 0),
    }));
  }

  private getUsersWithHighestPriority<T extends PartialUser & { priority?: number | null }>({
    availableUsers,
  }: {
    availableUsers: T[];
  }) {
    const highestPriority = Math.max(...availableUsers.map((user) => user.priority ?? 2));
    const usersWithHighestPriority = availableUsers.filter(
      (user) => user.priority === highestPriority || (user.priority == null && highestPriority === 2)
    );
    if (!isNonEmptyArray(usersWithHighestPriority)) {
      throw new Error("Internal Error: Highest Priority filter should never return length=0.");
    }

    log.info(
      "getUsersWithHighestPriority",
      safeStringify({
        highestPriorityUsers: usersWithHighestPriority.map((user) => user.id),
      })
    );
    return usersWithHighestPriority;
  }

  private filterUsersBasedOnWeights<
    T extends PartialUser & {
      weight?: number | null;
    },
  >({
    availableUsers,
    bookingsOfAvailableUsersOfInterval,
    bookingsOfNotAvailableUsersOfInterval,
    allRRHosts,
    allRRHostsBookingsOfInterval,
    allRRHostsCreatedInInterval,
    attributeWeights,
    oooData,
  }: GetLuckyUserParams<T> & FetchedData) {
    const allBookings = bookingsOfAvailableUsersOfInterval.concat(bookingsOfNotAvailableUsersOfInterval);

    const allHostsWithCalibration = this.getHostsWithCalibration({
      hosts: allRRHosts.map((host) => {
        return { email: host.user.email, userId: host.user.id, createdAt: host.createdAt };
      }),
      allRRHostsBookingsOfInterval,
      allRRHostsCreatedInInterval,
      oooData,
    });

    let totalWeight: number;

    if (attributeWeights && attributeWeights.length > 0) {
      totalWeight = attributeWeights.reduce((totalWeight, userWeight) => {
        totalWeight += userWeight.weight ?? 100;
        return totalWeight;
      }, 0);
    } else {
      totalWeight = allRRHosts.reduce((totalWeight, host) => {
        totalWeight += host.weight ?? 100;
        return totalWeight;
      }, 0);
    }

    const totalCalibration = allHostsWithCalibration.reduce((totalCalibration, host) => {
      totalCalibration += host.calibration;
      return totalCalibration;
    }, 0);

    const usersWithBookingShortfalls = availableUsers.map((user) => {
      let userWeight = user.weight ?? 100;
      if (attributeWeights) {
        userWeight = attributeWeights.find((userWeight) => userWeight.userId === user.id)?.weight ?? 100;
      }
      const targetPercentage = userWeight / totalWeight;
      const userBookings = bookingsOfAvailableUsersOfInterval.filter(
        (booking) =>
          booking.userId === user.id || booking.attendees.some((attendee) => attendee.email === user.email)
      );

      const targetNumberOfBookings = (allBookings.length + totalCalibration) * targetPercentage;
      const userCalibration =
        allHostsWithCalibration.find((host) => host.userId === user.id)?.calibration ?? 0;

      const bookingShortfall = targetNumberOfBookings - (userBookings.length + userCalibration);

      return {
        ...user,
        calibration: userCalibration,
        weight: userWeight,
        targetNumberOfBookings,
        bookingShortfall,
        numBookings: userBookings.length,
      };
    });

    const maxShortfall = Math.max(...usersWithBookingShortfalls.map((user) => user.bookingShortfall));
    const usersWithMaxShortfall = usersWithBookingShortfalls.filter(
      (user) => user.bookingShortfall === maxShortfall
    );

    const maxWeight = Math.max(...usersWithMaxShortfall.map((user) => user.weight ?? 100));

    const userIdsWithMaxShortfallAndWeight = new Set(
      usersWithMaxShortfall
        .filter((user) => {
          const weight = user.weight ?? 100;
          return weight === maxWeight;
        })
        .map((user) => user.id)
    );

    const remainingUsersAfterWeightFilter = availableUsers.filter((user) =>
      userIdsWithMaxShortfallAndWeight.has(user.id)
    );

    log.debug(
      "filterUsersBasedOnWeights",
      safeStringify({
        userIdsWithMaxShortfallAndWeight: userIdsWithMaxShortfallAndWeight,
        usersWithMaxShortfall: usersWithMaxShortfall.map((user) => user.email),
        usersWithBookingShortfalls: usersWithBookingShortfalls.map((user) => ({
          calibration: user.calibration,
          bookingShortfall: user.bookingShortfall,
          email: user.email,
          targetNumberOfBookings: user.targetNumberOfBookings,
          weight: user.weight,
          numBookings: user.numBookings,
        })),
        remainingUsersAfterWeightFilter: remainingUsersAfterWeightFilter.map((user) => user.email),
      })
    );

    if (!isNonEmptyArray(remainingUsersAfterWeightFilter)) {
      throw new Error("Internal Error: Weight filter should never return length=0.");
    }
    return {
      remainingUsersAfterWeightFilter,
      usersAndTheirBookingShortfalls: usersWithBookingShortfalls.map((user) => ({
        id: user.id,
        calibration: user.calibration,
        bookingShortfall: user.bookingShortfall,
        weight: user.weight,
      })),
    };
  }

  private async getCalendarBusyTimesOfInterval(
    usersWithCredentials: {
      id: number;
      email: string;
      credentials: CredentialForCalendarService[];
      userLevelSelectedCalendars: SelectedCalendar[];
    }[],
    interval: RRResetInterval,
    rrTimestampBasis: RRTimestampBasis,
    meetingStartTime?: Date
  ): Promise<{ userId: number; busyTimes: (EventBusyDate & { timeZone?: string })[] }[]> {
    const usersBusyTimesQuery = await Promise.all(
      usersWithCredentials.map((user) =>
        getBusyCalendarTimes(
          user.credentials,
          getIntervalStartDate({ interval, rrTimestampBasis, meetingStartTime }).toISOString(),
          getIntervalEndDate({ interval, rrTimestampBasis, meetingStartTime }).toISOString(),
          user.userLevelSelectedCalendars,
          "slots",
          true
        )
      )
    );

    return usersBusyTimesQuery.reduce(
      (usersBusyTime, userBusyTimeQuery, index) => {
        if (userBusyTimeQuery.success) {
          usersBusyTime.push({
            userId: usersWithCredentials[index].id,
            busyTimes: userBusyTimeQuery.data,
          });
        }
        return usersBusyTime;
      },
      [] as { userId: number; busyTimes: Awaited<ReturnType<typeof getBusyCalendarTimes>>["data"] }[]
    );
  }

  private async getBookingsOfInterval({
    eventTypeId,
    users,
    interval,
    includeNoShowInRRCalculation,
    rrTimestampBasis,
    meetingStartTime,
  }: {
    eventTypeId: number;
    users: { id: number; email: string }[];
    interval: RRResetInterval;
    includeNoShowInRRCalculation: boolean;
    rrTimestampBasis: RRTimestampBasis;
    meetingStartTime?: Date;
  }) {
    return await this.bookingRepository.getAllBookingsForRoundRobin({
      eventTypeId: eventTypeId,
      users,
      startDate: getIntervalStartDate({ interval, rrTimestampBasis, meetingStartTime }),
      endDate: getIntervalEndDate({ interval, rrTimestampBasis, meetingStartTime }),
      includeNoShowInRRCalculation,
      rrTimestampBasis,
    });
  }

  private async fetchAllDataNeededForCalculations<
    T extends PartialUser & {
      priority?: number | null;
      weight?: number | null;
    },
  >(getLuckyUserParams: GetLuckyUserParams<T>): Promise<FetchedData> {
    const startTime = performance.now();

    const { availableUsers, allRRHosts, eventType, meetingStartTime } = getLuckyUserParams;
    const notAvailableHosts = (function getNotAvailableHosts() {
      const availableUserIds = new Set(availableUsers.map((user) => user.id));
      return allRRHosts.reduce(
        (
          acc: {
            id: number;
            email: string;
          }[],
          host
        ) => {
          if (!availableUserIds.has(host.user.id)) {
            acc.push({
              id: host.user.id,
              email: host.user.email,
            });
          }
          return acc;
        },
        []
      );
    })();

    const { attributeWeights, virtualQueuesData } =
      await this.prepareQueuesAndAttributesData(getLuckyUserParams);

    const interval =
      eventType.isRRWeightsEnabled && getLuckyUserParams.eventType.team?.rrResetInterval
        ? getLuckyUserParams.eventType.team?.rrResetInterval
        : RRResetInterval.MONTH;

    const rrTimestampBasis =
      eventType.isRRWeightsEnabled && getLuckyUserParams.eventType.team?.rrTimestampBasis
        ? getLuckyUserParams.eventType.team.rrTimestampBasis
        : RRTimestampBasis.CREATED_AT;

    const intervalStartDate = getIntervalStartDate({ interval, rrTimestampBasis, meetingStartTime });
    const intervalEndDate = getIntervalEndDate({ interval, rrTimestampBasis, meetingStartTime });

    const [
      userBusyTimesOfInterval,
      bookingsOfAvailableUsersOfInterval,
      bookingsOfNotAvailableUsersOfInterval,
      allRRHostsBookingsOfInterval,
      allRRHostsCreatedInInterval,
      organizersWithLastCreated,
    ] = await Promise.all([
      this.getCalendarBusyTimesOfInterval(
        allRRHosts.map((host) => host.user),
        interval,
        rrTimestampBasis,
        meetingStartTime
      ),
      this.getBookingsOfInterval({
        eventTypeId: eventType.id,
        users: availableUsers.map((user) => {
          return { id: user.id, email: user.email };
        }),
        interval,
        includeNoShowInRRCalculation: eventType.includeNoShowInRRCalculation,
        rrTimestampBasis,
        meetingStartTime,
      }),
      this.getBookingsOfInterval({
        eventTypeId: eventType.id,
        users: notAvailableHosts,
        interval,
        includeNoShowInRRCalculation: eventType.includeNoShowInRRCalculation,
        rrTimestampBasis,
        meetingStartTime,
      }),
      this.getBookingsOfInterval({
        eventTypeId: eventType.id,
        users: allRRHosts.map((host) => {
          return { id: host.user.id, email: host.user.email };
        }),
        interval,
        includeNoShowInRRCalculation: eventType.includeNoShowInRRCalculation,
        rrTimestampBasis,
        meetingStartTime,
      }),
      this.hostRepository.findHostsCreatedInInterval({
        eventTypeId: eventType.id,
        userIds: allRRHosts.map((host) => host.user.id),
        startDate: intervalStartDate,
      }),
      this.userRepository.findUsersWithLastBooking({
        userIds: availableUsers.map((user) => user.id),
        eventTypeId: eventType.id,
      }),
    ]);

    const userFullDayBusyTimes = new Map<number, { start: Date; end: Date }[]>();

    userBusyTimesOfInterval.forEach((userBusyTime) => {
      const fullDayBusyTimes = userBusyTime.busyTimes
        .filter((busyTime) => {
          if (!busyTime.timeZone) return false;
          const timezoneOffset = dayjs(busyTime.start).tz(busyTime.timeZone).utcOffset() * 60000;
          let start = new Date(new Date(busyTime.start).getTime() + timezoneOffset);
          const end = new Date(new Date(busyTime.end).getTime() + timezoneOffset);

          const earliestStartTime = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), 1));
          if (start < earliestStartTime) start = earliestStartTime;

          return end.getTime() < Date.now() && isFullDayEvent(start, end);
        })
        .map((busyTime) => ({ start: new Date(busyTime.start), end: new Date(busyTime.end) }));

      userFullDayBusyTimes.set(userBusyTime.userId, fullDayBusyTimes);
    });

    const oooEntries = await this.oooRepository.findOOOEntriesInInterval({
      userIds: allRRHosts.map((host) => host.user.id),
      startDate: intervalStartDate,
      endDate: intervalEndDate,
    });

    const oooEntriesGroupedByUserId = new Map<number, { start: Date; end: Date }[]>();

    oooEntries.forEach((entry) => {
      if (!oooEntriesGroupedByUserId.has(entry.userId)) {
        oooEntriesGroupedByUserId.set(entry.userId, []);
      }
      oooEntriesGroupedByUserId.get(entry.userId)?.push({ start: entry.start, end: entry.end });
    });

    const oooData: { userId: number; oooEntries: { start: Date; end: Date }[] }[] = [];

    userFullDayBusyTimes.forEach((fullDayBusyTimes, userId) => {
      const oooEntriesForUser = oooEntriesGroupedByUserId.get(userId) || [];
      const combinedEntries = [...oooEntriesForUser, ...fullDayBusyTimes];
      const oooEntries = mergeOverlappingRanges(combinedEntries);

      oooData.push({
        userId,
        oooEntries,
      });
    });

    const endTime = performance.now();
    log.info(`fetchAllDataNeededForCalculations took ${endTime - startTime}ms`);

    log.debug(
      "fetchAllDataNeededForCalculations",
      safeStringify({
        bookingsOfAvailableUsersOfInterval: bookingsOfAvailableUsersOfInterval.length,
        bookingsOfNotAvailableUsersOfInterval: bookingsOfNotAvailableUsersOfInterval.length,
        allRRHostsBookingsOfInterval: allRRHostsBookingsOfInterval.length,
        allRRHostsCreatedInInterval: allRRHostsCreatedInInterval.length,
        virtualQueuesData,
        attributeWeights,
        oooData,
      })
    );

    return {
      bookingsOfAvailableUsersOfInterval,
      bookingsOfNotAvailableUsersOfInterval,
      allRRHostsBookingsOfInterval,
      allRRHostsCreatedInInterval,
      organizersWithLastCreated,
      attributeWeights,
      virtualQueuesData,
      oooData,
    };
  }

  // === Public methods exposed by the service ===
  public async getLuckyUser<
    T extends PartialUser & {
      priority?: number | null;
      weight?: number | null;
    },
  >(getLuckyUserParams: GetLuckyUserParams<T>) {
    // Note: PAUSED team members are already filtered out from both `availableUsers` and `allRRHosts` 
    // upstream in `loadAndValidateUsers` and `getEventTypesFromDB.ts`. This ensures they are completely 
    // excluded from the Round Robin assignment algorithm before calculating booking shortfalls.

    // Early return if only one available user to avoid unnecessary data fetching
    if (getLuckyUserParams.availableUsers.length === 1) {
      return getLuckyUserParams.availableUsers[0];
    }

    const fetchedData = await this.fetchAllDataNeededForCalculations(getLuckyUserParams);

    const { luckyUser } = this.getLuckyUser_requiresDataToBePreFetched({
      ...getLuckyUserParams,
      ...fetchedData,
    });

    return luckyUser;
  }

  public getLuckyUser_requiresDataToBePreFetched<
    T extends PartialUser & {
      priority?: number | null;
      weight?: number | null;
    },
  >({ availableUsers, ...getLuckyUserParams }: GetLuckyUserParams<T> & FetchedData) {
    const {
      eventType,
      bookingsOfAvailableUsersOfInterval,
      bookingsOfNotAvailableUsersOfInterval,
      allRRHostsBookingsOfInterval,
      allRRHostsCreatedInInterval,
      organizersWithLastCreated,
      oooData,
    } = getLuckyUserParams;

    if (availableUsers.length === 1) {
      return { luckyUser: availableUsers[0], usersAndTheirBookingShortfalls: [] };
    }

    let usersAndTheirBookingShortfalls: {
      id: number;
      bookingShortfall: number;
      calibration: number;
      weight: number;
    }[] = [];
    if (eventType.isRRWeightsEnabled) {
      const {
        remainingUsersAfterWeightFilter,
        usersAndTheirBookingShortfalls: _usersAndTheirBookingShortfalls,
      } = this.filterUsersBasedOnWeights({
        ...getLuckyUserParams,
        availableUsers,
        bookingsOfAvailableUsersOfInterval,
        bookingsOfNotAvailableUsersOfInterval,
        allRRHostsBookingsOfInterval,
        allRRHostsCreatedInInterval,
        oooData,
      });
      availableUsers = remainingUsersAfterWeightFilter;
      usersAndTheirBookingShortfalls = _usersAndTheirBookingShortfalls;
    }

    const highestPriorityUsers = this.getUsersWithHighestPriority({ availableUsers });
    if (highestPriorityUsers.length === 1) {
      return {
        luckyUser: highestPriorityUsers[0],
        usersAndTheirBookingShortfalls,
      };
    }

    return {
      luckyUser: this.leastRecentlyBookedUser({
        ...getLuckyUserParams,
        availableUsers: highestPriorityUsers,
        bookingsOfAvailableUsers: bookingsOfAvailableUsersOfInterval,
        organizersWithLastCreated,
      }),
      usersAndTheirBookingShortfalls,
    };
  }

  public async prepareQueuesAndAttributesData<T extends PartialUser>(
    _params: Omit<GetLuckyUserParams<T>, "availableUsers">
  ) {
    return {
      attributeWeights: undefined,
      virtualQueuesData: undefined,
    };
  }

  public async getOrderedListOfLuckyUsers<AvailableUser extends AvailableUserBase>(
    getLuckyUserParams: GetLuckyUserParams<AvailableUser>
  ) {
    const { availableUsers, eventType } = getLuckyUserParams;

    const {
      bookingsOfAvailableUsersOfInterval,
      bookingsOfNotAvailableUsersOfInterval,
      allRRHostsBookingsOfInterval,
      allRRHostsCreatedInInterval,
      organizersWithLastCreated,
      attributeWeights,
      virtualQueuesData,
      oooData,
    } = await this.fetchAllDataNeededForCalculations(getLuckyUserParams);

    log.info(
      "getOrderedListOfLuckyUsers",
      safeStringify({
        availableUsers: availableUsers.map((user) => {
          return { id: user.id, email: user.email, priority: user.priority, weight: user.weight };
        }),
        bookingsOfAvailableUsersOfInterval,
        bookingsOfNotAvailableUsersOfInterval,
        allRRHostsBookingsOfInterval,
        allRRHostsCreatedInInterval,
        organizersWithLastCreated,
      })
    );

    let remainingAvailableUsers = [...availableUsers];
    let bookingsOfRemainingAvailableUsersOfInterval = [...bookingsOfAvailableUsersOfInterval];
    const orderedUsersSet = new Set<AvailableUser>();
    const perUserBookingsCount: Record<number, number> = {};

    const startTime = performance.now();
    let usersAndTheirBookingShortfalls: {
      id: number;
      bookingShortfall: number;
      calibration: number;
      weight: number;
    }[] = [];
    while (remainingAvailableUsers.length > 0) {
      const { luckyUser, usersAndTheirBookingShortfalls: _usersAndTheirBookingShortfalls } =
        this.getLuckyUser_requiresDataToBePreFetched({
          ...getLuckyUserParams,
          eventType,
          availableUsers: remainingAvailableUsers as [AvailableUser, ...AvailableUser[]],
          bookingsOfAvailableUsersOfInterval: bookingsOfRemainingAvailableUsersOfInterval,
          bookingsOfNotAvailableUsersOfInterval,
          allRRHostsBookingsOfInterval,
          allRRHostsCreatedInInterval,
          organizersWithLastCreated,
          attributeWeights,
          virtualQueuesData,
          oooData,
        });

      if (!usersAndTheirBookingShortfalls.length) {
        usersAndTheirBookingShortfalls = _usersAndTheirBookingShortfalls;
      }

      if (orderedUsersSet.has(luckyUser)) {
        throw new Error(
          `Error building ordered list of lucky users. The lucky user ${luckyUser.email} is already in the set.`
        );
      }

      orderedUsersSet.add(luckyUser);
      perUserBookingsCount[luckyUser.id] = bookingsOfAvailableUsersOfInterval.filter(
        (booking) => booking.userId === luckyUser.id
      ).length;
      remainingAvailableUsers = remainingAvailableUsers.filter((user) => user.id !== luckyUser.id);
      bookingsOfRemainingAvailableUsersOfInterval = bookingsOfRemainingAvailableUsersOfInterval.filter(
        (booking) => remainingAvailableUsers.map((user) => user.id).includes(booking.userId ?? 0)
      );
    }

    const endTime = performance.now();
    log.info(`getOrderedListOfLuckyUsers took ${endTime - startTime}ms`);

    const bookingShortfalls: Record<number, number> = {};
    const calibrations: Record<number, number> = {};
    const weights: Record<number, number> = {};

    usersAndTheirBookingShortfalls.forEach((user) => {
      bookingShortfalls[user.id] = parseFloat(user.bookingShortfall.toFixed(2));
      calibrations[user.id] = parseFloat(user.calibration.toFixed(2));
      weights[user.id] = user.weight;
    });

    return {
      users: Array.from(orderedUsersSet),
      isUsingAttributeWeights: !!attributeWeights && !!virtualQueuesData,
      perUserData: {
        bookingsCount: perUserBookingsCount,
        bookingShortfalls: eventType.isRRWeightsEnabled ? bookingShortfalls : null,
        calibrations: eventType.isRRWeightsEnabled ? calibrations : null,
        weights: eventType.isRRWeightsEnabled ? weights : null,
      },
    };
  }
}
