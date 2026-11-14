import CalendarManagerMock from "@calcom/features/calendars/lib/__mocks__/CalendarManager";
import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";

import { expect, it, describe, vi, beforeAll } from "vitest";

import dayjs from "@calcom/dayjs";
import { getLuckyUserService } from "@calcom/features/di/containers/LuckyUser";
import { buildUser, buildBooking } from "@calcom/lib/test/builder";
import { RRResetInterval, RRTimestampBasis } from "@calcom/prisma/enums";

import { getIntervalStartDate, getIntervalEndDate } from "./getLuckyUser";

const luckyUserService = getLuckyUserService();

type NonEmptyArray<T> = [T, ...T[]];
type GetLuckyUserAvailableUsersType = NonEmptyArray<ReturnType<typeof buildUser>>;

beforeAll(() => {
  vi.setSystemTime(new Date("2021-06-20T11:59:59Z"));
});

it("can find lucky user with maximize availability", async () => {
  const users: GetLuckyUserAvailableUsersType = [
    buildUser({
      id: 1,
      username: "test1",
      name: "Test User 1",
      email: "test1@example.com",
      bookings: [
        {
          createdAt: new Date("2022-01-25T05:30:00.000Z"),
        },
        {
          createdAt: new Date("2022-01-25T06:30:00.000Z"),
        },
      ],
    }),
    buildUser({
      id: 2,
      username: "test2",
      name: "Test User 2",
      email: "test2@example.com",
      bookings: [
        {
          createdAt: new Date("2022-01-25T04:30:00.000Z"),
        },
      ],
    }),
  ];

  CalendarManagerMock.getBusyCalendarTimes.mockResolvedValue({ success: true, data: [] });
  prismaMock.outOfOfficeEntry.findMany.mockResolvedValue([]);

  prismaMock.user.findMany.mockResolvedValue(users);
  prismaMock.host.findMany.mockResolvedValue([]);
  prismaMock.booking.findMany.mockResolvedValue([]);

  await expect(
    luckyUserService.getLuckyUser({
      availableUsers: users,
      eventType: {
        id: 1,
        isRRWeightsEnabled: false,
        team: { rrResetInterval: RRResetInterval.MONTH, rrTimestampBasis: RRTimestampBasis.CREATED_AT },
        includeNoShowInRRCalculation: false,
      },
      allRRHosts: [],
          })
  ).resolves.toStrictEqual(users[1]);
});

it("can find lucky user with maximize availability and priority ranking", async () => {
  const users: GetLuckyUserAvailableUsersType = [
    buildUser({
      id: 1,
      username: "test1",
      name: "Test User 1",
      email: "test1@example.com",
      priority: 2,
      bookings: [
        {
          createdAt: new Date("2022-01-25T05:30:00.000Z"),
        },
        {
          createdAt: new Date("2022-01-25T06:30:00.000Z"),
        },
      ],
    }),
    buildUser({
      id: 2,
      username: "test2",
      name: "Test User 2",
      email: "test2@example.com",
      bookings: [
        {
          createdAt: new Date("2022-01-25T04:30:00.000Z"),
        },
      ],
    }),
  ];

  CalendarManagerMock.getBusyCalendarTimes.mockResolvedValue({ success: true, data: [] });
  prismaMock.outOfOfficeEntry.findMany.mockResolvedValue([]);

  prismaMock.user.findMany.mockResolvedValue(users);
  prismaMock.host.findMany.mockResolvedValue([]);
  prismaMock.booking.findMany.mockResolvedValue([]);

  // both users have medium priority (one user has no priority set, default to medium) so pick least recently booked
  await expect(
    luckyUserService.getLuckyUser({
      availableUsers: users,
      eventType: {
        id: 1,
        isRRWeightsEnabled: false,
        team: {
          rrResetInterval: RRResetInterval.MONTH,
          rrTimestampBasis: RRTimestampBasis.CREATED_AT,
        },
        includeNoShowInRRCalculation: false,
      },
      allRRHosts: [],
          })
  ).resolves.toStrictEqual(users[1]);

  const userLowest = buildUser({
    id: 1,
    username: "test1",
    name: "Test User 1",
    email: "test1@example.com",
    priority: 0,
    bookings: [
      {
        createdAt: new Date("2022-01-25T03:30:00.000Z"),
      },
    ],
  });
  const userMedium = buildUser({
    id: 2,
    username: "test2",
    name: "Test User 2",
    email: "test2@example.com",
    priority: 2,
    bookings: [
      {
        createdAt: new Date("2022-01-25T04:30:00.000Z"),
      },
    ],
  });

  const userHighest = buildUser({
    id: 2,
    username: "test2",
    name: "Test User 2",
    email: "test2@example.com",
    priority: 4,
    bookings: [
      {
        createdAt: new Date("2022-01-25T05:30:00.000Z"),
      },
    ],
  });

  const usersWithPriorities: GetLuckyUserAvailableUsersType = [userLowest, userMedium, userHighest];
  prismaMock.user.findMany.mockResolvedValue(usersWithPriorities);
  prismaMock.booking.findMany.mockResolvedValue([]);
  prismaMock.host.findMany.mockResolvedValue([]);
  // pick the user with the highest priority
  await expect(
    luckyUserService.getLuckyUser({
      availableUsers: usersWithPriorities,
      eventType: {
        id: 1,
        isRRWeightsEnabled: false,
        team: { rrResetInterval: RRResetInterval.MONTH, rrTimestampBasis: RRTimestampBasis.CREATED_AT },
        includeNoShowInRRCalculation: false,
      },
      allRRHosts: [],
          })
  ).resolves.toStrictEqual(usersWithPriorities[2]);

  const userLow = buildUser({
    id: 1,
    username: "test1",
    name: "Test User 1",
    email: "test1@example.com",
    priority: 0,
    bookings: [
      {
        createdAt: new Date("2022-01-25T02:30:00.000Z"),
      },
    ],
  });
  const userHighLeastRecentBooking = buildUser({
    id: 2,
    username: "test2",
    name: "Test User 2",
    email: "tes2t@example.com",
    priority: 3,
    bookings: [
      {
        createdAt: new Date("2022-01-25T03:30:00.000Z"),
      },
    ],
  });

  const userHighRecentBooking = buildUser({
    id: 3,
    username: "test3",
    name: "Test User 3",
    email: "test3@example.com",
    priority: 3,
    bookings: [
      {
        createdAt: new Date("2022-01-25T04:30:00.000Z"),
      },
    ],
  });

  const usersWithSamePriorities: GetLuckyUserAvailableUsersType = [
    userLow,
    userHighLeastRecentBooking,
    userHighRecentBooking,
  ];
  prismaMock.user.findMany.mockResolvedValue(usersWithSamePriorities);
  prismaMock.booking.findMany.mockResolvedValue([]);
  prismaMock.host.findMany.mockResolvedValue([]);

  // pick the least recently booked user of the two with the highest priority
  await expect(
    luckyUserService.getLuckyUser({
      availableUsers: usersWithSamePriorities,
      eventType: {
        id: 1,
        isRRWeightsEnabled: false,
        team: { rrResetInterval: RRResetInterval.MONTH, rrTimestampBasis: RRTimestampBasis.CREATED_AT },
        includeNoShowInRRCalculation: false,
      },
      allRRHosts: [],
          })
  ).resolves.toStrictEqual(usersWithSamePriorities[1]);
});

describe("maximize availability and weights", () => {
  it("can find lucky user if hosts have same weights", async () => {
    const users: GetLuckyUserAvailableUsersType = [
      buildUser({
        id: 1,
        username: "test1",
        name: "Test User 1",
        email: "test1@example.com",
        priority: 3,
        weight: 100,
        bookings: [
          {
            createdAt: new Date("2022-01-25T06:30:00.000Z"),
          },
          {
            createdAt: new Date("2022-01-25T03:30:00.000Z"),
          },
        ],
      }),
      buildUser({
        id: 2,
        username: "test2",
        name: "Test User 2",
        email: "test2@example.com",
        priority: 3,
        weight: 100,
        bookings: [
          {
            createdAt: new Date("2022-01-25T05:30:00.000Z"),
          },
          {
            createdAt: new Date("2022-01-25T04:30:00.000Z"),
          },
        ],
      }),
    ];

    CalendarManagerMock.getBusyCalendarTimes.mockResolvedValue({ success: true, data: [] });
    prismaMock.outOfOfficeEntry.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue(users);
    prismaMock.host.findMany.mockResolvedValue([]);
    prismaMock.booking.findMany.mockResolvedValue([
      buildBooking({
        id: 1,
        userId: 1,
        createdAt: new Date("2022-01-25T06:30:00.000Z"),
      }),
      buildBooking({
        id: 2,
        userId: 1,
        createdAt: new Date("2022-01-25T03:30:00.000Z"),
      }),
      buildBooking({
        id: 3,
        userId: 2,
        createdAt: new Date("2022-01-25T05:30:00.000Z"),
      }),
      buildBooking({
        id: 4,
        userId: 2,
        createdAt: new Date("2022-01-25T04:30:00.000Z"),
      }),
    ]);

    const allRRHosts = [
      {
        user: {
          id: users[0].id,
          email: users[0].email,
          credentials: [],
          userLevelSelectedCalendars: [],
        },
        weight: users[0].weight,
        createdAt: new Date(0),
      },
      {
        user: {
          id: users[1].id,
          email: users[1].email,
          credentials: [],
          userLevelSelectedCalendars: [],
        },
        weight: users[1].weight,
        createdAt: new Date(0),
      },
    ];

    await expect(
      luckyUserService.getLuckyUser({
        availableUsers: users,
        eventType: {
          id: 1,
          isRRWeightsEnabled: true,
          team: { rrResetInterval: RRResetInterval.MONTH, rrTimestampBasis: RRTimestampBasis.CREATED_AT },
          includeNoShowInRRCalculation: false,
        },
        allRRHosts,
              })
    ).resolves.toStrictEqual(users[1]);

    const queryArgs = prismaMock.booking.findMany.mock.calls[0][0];

    // Today: 2021-06-20T11:59:59Z, monthly interval
    expect(queryArgs.where?.createdAt).toEqual(
      expect.objectContaining({
        gte: new Date("2021-06-01T00:00:00Z"),
        lte: new Date("2021-06-20T11:59:59.000Z"),
      })
    );
  });

  it("can find lucky user if hosts have different weights", async () => {
    const users: GetLuckyUserAvailableUsersType = [
      buildUser({
        id: 1,
        username: "test1",
        name: "Test User 1",
        email: "test1@example.com",
        priority: 3,
        weight: 200,
        bookings: [
          {
            createdAt: new Date("2022-01-25T08:30:00.000Z"),
          },
          {
            createdAt: new Date("2022-01-25T07:30:00.000Z"),
          },
          {
            createdAt: new Date("2022-01-25T05:30:00.000Z"),
          },
        ],
      }),
      buildUser({
        id: 2,
        username: "test2",
        name: "Test User 2",
        email: "test2@example.com",
        priority: 3,
        weight: 100,
        bookings: [
          {
            createdAt: new Date("2022-01-25T06:30:00.000Z"),
          },
          {
            createdAt: new Date("2022-01-25T03:30:00.000Z"),
          },
        ],
      }),
    ];

    CalendarManagerMock.getBusyCalendarTimes.mockResolvedValue({ success: true, data: [] });
    prismaMock.outOfOfficeEntry.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue(users);
    prismaMock.host.findMany.mockResolvedValue([]);
    prismaMock.booking.findMany.mockResolvedValue([
      buildBooking({
        id: 1,
        userId: 1,
        createdAt: new Date("2022-01-25T08:30:00.000Z"),
      }),
      buildBooking({
        id: 2,
        userId: 1,
        createdAt: new Date("2022-01-25T07:30:00.000Z"),
      }),
      buildBooking({
        id: 3,
        userId: 1,
        createdAt: new Date("2022-01-25T05:30:00.000Z"),
      }),
      buildBooking({
        id: 4,
        userId: 2,
        createdAt: new Date("2022-01-25T06:30:00.000Z"),
      }),
      buildBooking({
        id: 4,
        userId: 2,
        createdAt: new Date("2022-01-25T03:30:00.000Z"),
      }),
    ]);

    const allRRHosts = [
      {
        user: {
          id: users[0].id,
          email: users[0].email,
          credentials: [],
          userLevelSelectedCalendars: [],
        },
        weight: users[0].weight,
        createdAt: new Date(0),
      },
      {
        user: {
          id: users[1].id,
          email: users[1].email,
          credentials: [],
          userLevelSelectedCalendars: [],
        },
        weight: users[1].weight,
        createdAt: new Date(0),
      },
    ];

    await expect(
      luckyUserService.getLuckyUser({
        availableUsers: users,
        eventType: {
          id: 1,
          isRRWeightsEnabled: true,
          team: { rrResetInterval: RRResetInterval.DAY, rrTimestampBasis: RRTimestampBasis.CREATED_AT },
          includeNoShowInRRCalculation: false,
        },
        allRRHosts,
              })
    ).resolves.toStrictEqual(users[0]);

    const queryArgs = prismaMock.booking.findMany.mock.calls[0][0];

    // Today: 2021-06-20T11:59:59Z, daily interval
    expect(queryArgs.where?.createdAt).toEqual(
      expect.objectContaining({
        gte: new Date("2021-06-20T00:00:00Z"),
        lte: new Date("2021-06-20T11:59:59.000Z"),
      })
    );
  });

  it("can find lucky user with weights and adjusted weights", async () => {
    const users: GetLuckyUserAvailableUsersType = [
      buildUser({
        id: 1,
        username: "test1",
        name: "Test User 1",
        email: "test1@example.com",
        priority: 3,
        weight: 150,
        bookings: [
          {
            createdAt: new Date("2022-01-25T07:30:00.000Z"),
          },
          {
            createdAt: new Date("2022-01-25T05:30:00.000Z"),
          },
          {
            createdAt: new Date("2022-01-25T03:30:00.000Z"),
          },
        ],
      }),
      buildUser({
        id: 2,
        username: "test2",
        name: "Test User 2",
        email: "test2@example.com",
        priority: 3,
        weight: 100,
        bookings: [
          {
            createdAt: new Date("2022-01-25T06:30:00.000Z"),
          },
          {
            createdAt: new Date("2022-01-25T03:30:00.000Z"),
          },
        ],
      }),
    ];

    CalendarManagerMock.getBusyCalendarTimes.mockResolvedValue({ success: true, data: [] });
    prismaMock.outOfOfficeEntry.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue(users);
    prismaMock.host.findMany.mockResolvedValue([]);
    prismaMock.booking.findMany.mockResolvedValue([
      buildBooking({
        id: 1,
        userId: 1,
        createdAt: new Date("2022-01-25T05:30:00.000Z"),
      }),
      buildBooking({
        id: 2,
        userId: 1,
        createdAt: new Date("2022-01-25T03:30:00.000Z"),
      }),
      buildBooking({
        id: 3,
        userId: 1,
        createdAt: new Date("2022-01-25T07:30:00.000Z"),
      }),
      buildBooking({
        id: 4,
        userId: 2,
        createdAt: new Date("2022-01-25T06:30:00.000Z"),
      }),
      buildBooking({
        id: 4,
        userId: 2,
        createdAt: new Date("2022-01-25T03:30:00.000Z"),
      }),
    ]);

    const allRRHosts = [
      {
        user: {
          id: users[0].id,
          email: users[0].email,
          credentials: [],
          userLevelSelectedCalendars: [],
        },
        weight: users[0].weight,
        createdAt: new Date(0),
      },
      {
        user: {
          id: users[1].id,
          email: users[1].email,
          credentials: [],
          userLevelSelectedCalendars: [],
        },
        weight: users[1].weight,
        createdAt: new Date(0),
      },
    ];

    await expect(
      luckyUserService.getLuckyUser({
        availableUsers: users,
        eventType: {
          id: 1,
          isRRWeightsEnabled: true,
          team: { rrResetInterval: RRResetInterval.DAY, rrTimestampBasis: RRTimestampBasis.CREATED_AT },
          includeNoShowInRRCalculation: false,
        },
        allRRHosts,
              })
    ).resolves.toStrictEqual(users[0]);

    const queryArgs = prismaMock.booking.findMany.mock.calls[0][0];

    // Today: 2021-06-20T11:59:59Z, daily interval
    expect(queryArgs.where?.createdAt).toEqual(
      expect.objectContaining({
        gte: new Date("2021-06-20T00:00:00Z"),
        lte: new Date("2021-06-20T11:59:59.000Z"),
      })
    );
  });

  it("applies calibration when user had OOO entries this month", async () => {
    const users: GetLuckyUserAvailableUsersType = [
      buildUser({
        id: 1,
        username: "test1",
        name: "Test User 1",
        email: "test1@example.com",
        bookings: [],
      }),
      buildUser({
        id: 2,
        username: "test2",
        name: "Test User 2",
        email: "test2@example.com",
        bookings: [],
      }),
    ];

    const allRRHosts = [
      {
        user: {
          id: users[0].id,
          email: users[0].email,
          credentials: [],
          userLevelSelectedCalendars: [],
        },
        weight: users[0].weight,
        createdAt: new Date(0),
      },
      {
        user: {
          id: users[1].id,
          email: users[1].email,
          credentials: [],
          userLevelSelectedCalendars: [],
        },
        weight: users[1].weight,
        createdAt: new Date(0),
      },
    ];

    CalendarManagerMock.getBusyCalendarTimes.mockResolvedValue({ success: true, data: [] });

    prismaMock.outOfOfficeEntry.findMany.mockResolvedValue([
      {
        start: dayjs().subtract(10, "day").toDate(),
        end: dayjs().subtract(5, "day").toDate(),
        userId: users[0].id,
      },
    ]);

    prismaMock.user.findMany.mockResolvedValue(users);
    prismaMock.host.findMany.mockResolvedValue([
      {
        userId: allRRHosts[0].user.id,
        weight: allRRHosts[0].weight,
        createdAt: allRRHosts[0].createdAt,
      },
    ]);

    // bookings of current month
    prismaMock.booking.findMany.mockResolvedValue([
      buildBooking({
        id: 4,
        userId: 1,
        createdAt: dayjs().subtract(2, "days").toDate(),
      }),
      // happened during OOO of userId 1
      buildBooking({
        id: 4,
        userId: 2,
        createdAt: dayjs().subtract(6, "days").toDate(),
      }),
      // happened during OOO of userId 1
      buildBooking({
        id: 5,
        userId: 2,
        createdAt: dayjs().subtract(7, "days").toDate(),
      }),
    ]);

    await expect(
      luckyUserService.getLuckyUser({
        availableUsers: users,
        eventType: {
          id: 1,
          isRRWeightsEnabled: true,
          team: { rrResetInterval: RRResetInterval.MONTH, rrTimestampBasis: RRTimestampBasis.CREATED_AT },
          includeNoShowInRRCalculation: false,
        },
        allRRHosts,
              })
    ).resolves.toStrictEqual(users[1]);

    const queryArgs = prismaMock.booking.findMany.mock.calls[0][0];

    // Today: 2021-06-20T11:59:59Z, monthly interval
    expect(queryArgs.where?.createdAt).toEqual(
      expect.objectContaining({
        gte: new Date("2021-06-01T00:00:00Z"),
        lte: new Date("2021-06-20T11:59:59.000Z"),
      })
    );
  });

  it("applies calibration when user had full day calendar events this month", async () => {
    const users: GetLuckyUserAvailableUsersType = [
      buildUser({
        id: 1,
        username: "test1",
        name: "Test User 1",
        email: "test1@example.com",
        bookings: [
          {
            createdAt: new Date("2022-01-25T05:30:00.000Z"),
          },
          {
            createdAt: new Date("2022-01-25T06:30:00.000Z"),
          },
        ],
      }),
      buildUser({
        id: 2,
        username: "test2",
        name: "Test User 2",
        email: "test2@example.com",
        bookings: [
          {
            createdAt: new Date("2022-01-25T04:30:00.000Z"),
          },
        ],
      }),
    ];

    const allRRHosts = [
      {
        user: {
          id: users[0].id,
          email: users[0].email,
          credentials: [],
          userLevelSelectedCalendars: [],
        },
        weight: users[0].weight,
        createdAt: new Date(0),
      },
      {
        user: {
          id: users[1].id,
          email: users[1].email,
          credentials: [],
          userLevelSelectedCalendars: [],
        },
        weight: users[1].weight,
        createdAt: new Date(0),
      },
    ];

    CalendarManagerMock.getBusyCalendarTimes
      .mockResolvedValueOnce({
        success: true,
        data: [
          {
            start: dayjs().utc().startOf("month").toDate(),
            end: dayjs().utc().startOf("month").add(3, "day").toDate(),
            timeZone: "UTC",
          },
        ],
      })
      .mockResolvedValue([]);

    prismaMock.outOfOfficeEntry.findMany.mockResolvedValue([]);

    prismaMock.user.findMany.mockResolvedValue(users);
    prismaMock.host.findMany.mockResolvedValue([
      {
        userId: allRRHosts[0].user.id,
        weight: allRRHosts[0].weight,
        createdAt: allRRHosts[0].createdAt,
      },
    ]);

    prismaMock.booking.findMany.mockResolvedValue([
      buildBooking({
        id: 1,
        userId: 1,
        createdAt: dayjs().startOf("month").add(10, "day").toDate(),
      }),
      // happened during OOO
      buildBooking({
        id: 2,
        userId: 2,
        createdAt: dayjs().startOf("month").add(5, "hour").toDate(),
      }),
      // happened during OOO
      buildBooking({
        id: 3,
        userId: 2,
        createdAt: dayjs().startOf("month").add(20, "hour").toDate(),
      }),
    ]);

    await expect(
      luckyUserService.getLuckyUser({
        availableUsers: users,
        eventType: {
          id: 1,
          isRRWeightsEnabled: true,
          team: { rrResetInterval: RRResetInterval.MONTH, rrTimestampBasis: RRTimestampBasis.CREATED_AT },
          includeNoShowInRRCalculation: false,
        },
        allRRHosts,
              })
    ).resolves.toStrictEqual(users[1]);

    const queryArgs = prismaMock.booking.findMany.mock.calls[0][0];

    // Today: 2021-06-20T11:59:59Z, monthly interval
    expect(queryArgs.where?.createdAt).toEqual(
      expect.objectContaining({
        gte: new Date("2021-06-01T00:00:00Z"),
        lte: new Date("2021-06-20T11:59:59.000Z"),
      })
    );
  });

  describe("full day calendar events in non-UTC calendars", () => {
    const getLuckyUserWithFullDayBusyTime = async ({
      now,
      busyTime,
      bookingsDuringBusyTime,
    }: {
      now: Date;
      busyTime: { start: Date; end: Date; timeZone: string };
      bookingsDuringBusyTime: Date[];
    }) => {
      vi.setSystemTime(now);

      const users: GetLuckyUserAvailableUsersType = [
        buildUser({ id: 1, username: "test1", name: "Test User 1", email: "test1@example.com" }),
        buildUser({ id: 2, username: "test2", name: "Test User 2", email: "test2@example.com" }),
      ];

      const allRRHosts = users.map((user) => ({
        user: { id: user.id, email: user.email, credentials: [], userLevelSelectedCalendars: [] },
        weight: user.weight,
        createdAt: new Date(0),
      }));

      CalendarManagerMock.getBusyCalendarTimes
        .mockResolvedValueOnce({ success: true, data: [busyTime] })
        .mockResolvedValue({ success: true, data: [] });
      prismaMock.outOfOfficeEntry.findMany.mockResolvedValue([]);
      prismaMock.user.findMany.mockResolvedValue(users);
      prismaMock.host.findMany.mockResolvedValue([]);
      prismaMock.booking.findMany.mockResolvedValue([
        buildBooking({ id: 1, userId: 1, createdAt: new Date("2021-06-05T10:00:00Z") }),
        ...bookingsDuringBusyTime.map((createdAt, index) =>
          buildBooking({ id: index + 2, userId: 2, createdAt })
        ),
      ]);

      try {
        return await luckyUserService.getLuckyUser({
          availableUsers: users,
          eventType: {
            id: 1,
            isRRWeightsEnabled: true,
            team: { rrResetInterval: RRResetInterval.MONTH, rrTimestampBasis: RRTimestampBasis.CREATED_AT },
            includeNoShowInRRCalculation: false,
          },
          allRRHosts,
        });
      } finally {
        vi.setSystemTime(new Date("2021-06-20T11:59:59Z"));
      }
    };

    it("applies calibration for a full day event east of UTC that has already ended", async () => {
      // June 20 in Asia/Kathmandu (UTC+5:45), ended 1h45m before now
      const luckyUser = await getLuckyUserWithFullDayBusyTime({
        now: new Date("2021-06-20T20:00:00Z"),
        busyTime: {
          start: new Date("2021-06-19T18:15:00Z"),
          end: new Date("2021-06-20T18:15:00Z"),
          timeZone: "Asia/Kathmandu",
        },
        bookingsDuringBusyTime: [new Date("2021-06-20T03:00:00Z"), new Date("2021-06-20T08:00:00Z")],
      });

      expect(luckyUser.id).toBe(2);
    });

    it("does not apply calibration for a full day event west of UTC that is still in progress", async () => {
      // June 20 in America/New_York (UTC-4), still running for another 2 hours
      const luckyUser = await getLuckyUserWithFullDayBusyTime({
        now: new Date("2021-06-21T02:00:00Z"),
        busyTime: {
          start: new Date("2021-06-20T04:00:00Z"),
          end: new Date("2021-06-21T04:00:00Z"),
          timeZone: "America/New_York",
        },
        bookingsDuringBusyTime: [new Date("2021-06-20T14:00:00Z"), new Date("2021-06-20T18:00:00Z")],
      });

      expect(luckyUser.id).toBe(1);
    });

    it("applies calibration for a full day UTC event that has already ended", async () => {
      const luckyUser = await getLuckyUserWithFullDayBusyTime({
        now: new Date("2021-06-21T02:00:00Z"),
        busyTime: {
          start: new Date("2021-06-20T00:00:00Z"),
          end: new Date("2021-06-21T00:00:00Z"),
          timeZone: "UTC",
        },
        bookingsDuringBusyTime: [new Date("2021-06-20T03:00:00Z"), new Date("2021-06-20T08:00:00Z")],
      });

      expect(luckyUser.id).toBe(2);
    });
  });

  it("skips OOO calibration when there is only one host", async () => {
    const users: GetLuckyUserAvailableUsersType = [
      buildUser({
        id: 1,
        username: "test1",
        name: "Test User 1",
        email: "test1@example.com",
        bookings: [],
      }),
    ];

    const allRRHosts = [
      {
        user: {
          id: users[0].id,
          email: users[0].email,
          credentials: [],
          userLevelSelectedCalendars: [],
        },
        weight: users[0].weight,
        createdAt: new Date(0),
      },
    ];

    CalendarManagerMock.getBusyCalendarTimes.mockResolvedValue({ success: true, data: [] });

    // Mock OOO entry for the single host
    prismaMock.outOfOfficeEntry.findMany.mockResolvedValue([
      {
        start: dayjs().subtract(10, "day").toDate(),
        end: dayjs().subtract(5, "day").toDate(),
        userId: users[0].id,
      },
    ]);

    prismaMock.user.findMany.mockResolvedValue(users);
    prismaMock.host.findMany.mockResolvedValue([
      {
        userId: allRRHosts[0].user.id,
        weight: allRRHosts[0].weight,
        createdAt: allRRHosts[0].createdAt,
      },
    ]);

    // Mock some bookings during the OOO period (though there's only one host)
    prismaMock.booking.findMany.mockResolvedValue([
      buildBooking({
        id: 1,
        userId: 1,
        createdAt: dayjs().subtract(7, "days").toDate(),
      }),
    ]);

    // Should return the only available user without throwing division by zero error
    await expect(
      luckyUserService.getLuckyUser({
        availableUsers: users,
        eventType: {
          id: 1,
          isRRWeightsEnabled: true,
          team: { rrResetInterval: RRResetInterval.MONTH, rrTimestampBasis: RRTimestampBasis.CREATED_AT },
          includeNoShowInRRCalculation: false,
        },
        allRRHosts,
              })
    ).resolves.toStrictEqual(users[0]);
  });

  it("applies calibration to newly added hosts so they are not penalized unfairly compared to their peers", async () => {
    const users: GetLuckyUserAvailableUsersType = [
      buildUser({
        id: 1,
        username: "test1",
        name: "Test User 1",
        email: "test1@example.com",
        bookings: [
          {
            createdAt: new Date("2022-01-25T05:30:00.000Z"),
          },
          {
            createdAt: new Date("2022-01-25T06:30:00.000Z"),
          },
        ],
      }),
      buildUser({
        id: 2,
        username: "test2",
        name: "Test User 2",
        email: "test2@example.com",
        bookings: [
          {
            createdAt: new Date("2022-01-25T04:30:00.000Z"),
          },
        ],
      }),
    ];

    const middleOfMonth = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 14, 12, 0, 0)
    );

    const allRRHosts = [
      {
        user: {
          id: users[0].id,
          email: users[0].email,
          credentials: [],
          userLevelSelectedCalendars: [],
        },
        weight: users[0].weight,
        createdAt: middleOfMonth,
      },
      {
        user: {
          id: users[1].id,
          email: users[1].email,
          credentials: [],
          userLevelSelectedCalendars: [],
        },
        weight: users[1].weight,
        createdAt: new Date(0),
      },
    ];

    CalendarManagerMock.getBusyCalendarTimes.mockResolvedValue({ success: true, data: [] });
    prismaMock.outOfOfficeEntry.findMany.mockResolvedValue([]);

    prismaMock.user.findMany.mockResolvedValue(users);
    prismaMock.host.findMany.mockResolvedValue([
      {
        userId: allRRHosts[0].user.id,
        weight: allRRHosts[0].weight,
        createdAt: allRRHosts[0].createdAt,
      },
    ]);
    prismaMock.booking.findMany.mockResolvedValueOnce([]);
    prismaMock.booking.findMany.mockResolvedValueOnce([]);
    prismaMock.booking.findMany.mockResolvedValueOnce([]);
    prismaMock.booking.findMany.mockResolvedValueOnce([
      buildBooking({
        id: 4,
        userId: 2,
        createdAt: dayjs(middleOfMonth).subtract(2, "days").toDate(),
      }),
      buildBooking({
        id: 5,
        userId: 2,
        createdAt: dayjs(middleOfMonth).subtract(5, "days").toDate(),
      }),
    ]);
    await expect(
      luckyUserService.getLuckyUser({
        availableUsers: users,
        eventType: {
          id: 1,
          isRRWeightsEnabled: true,
          team: { rrResetInterval: RRResetInterval.MONTH, rrTimestampBasis: RRTimestampBasis.CREATED_AT },
          includeNoShowInRRCalculation: false,
        },
        allRRHosts,
              })
    ).resolves.toStrictEqual(users[1]);

    prismaMock.booking.findMany.mockResolvedValueOnce([]);
    prismaMock.booking.findMany.mockResolvedValueOnce([]);
    prismaMock.booking.findMany.mockResolvedValueOnce([]);
    prismaMock.booking.findMany.mockResolvedValueOnce([
      // Mock 6: All hosts
      buildBooking({
        id: 4,
        userId: 2,
        createdAt: dayjs(middleOfMonth).add(2, "days").toDate(),
      }),
      buildBooking({
        id: 5,
        userId: 2,
        createdAt: dayjs(middleOfMonth).add(5, "days").toDate(),
      }),
    ]);
    await expect(
      luckyUserService.getLuckyUser({
        availableUsers: users,
        eventType: {
          id: 1,
          isRRWeightsEnabled: true,
          team: { rrResetInterval: RRResetInterval.MONTH, rrTimestampBasis: RRTimestampBasis.CREATED_AT },
          includeNoShowInRRCalculation: false,
        },
        allRRHosts,
              })
    ).resolves.toStrictEqual(users[0]);

    const queryArgs = prismaMock.booking.findMany.mock.calls[0][0];

    // Today: 2021-06-20T11:59:59Z, monthly interval
    expect(queryArgs.where?.createdAt).toEqual(
      expect.objectContaining({
        gte: new Date("2021-06-01T00:00:00Z"),
        lte: new Date("2021-06-20T11:59:59.000Z"),
      })
    );
  });
});

describe("attribute weights and virtual queues", () => {
  it("prepareQueuesAndAttributesData returns undefined attributeWeights and virtualQueuesData when stubbed", async () => {
    const queuesAndAttributesData = await luckyUserService.prepareQueuesAndAttributesData({
      eventType: {
        id: 1,
        isRRWeightsEnabled: true,
        team: {
          parentId: 1,
          rrResetInterval: RRResetInterval.DAY,
          rrTimestampBasis: RRTimestampBasis.CREATED_AT,
        },
        includeNoShowInRRCalculation: false,
      },
      allRRHosts: [
        {
          user: {
            id: 1,
            email: "test1@example.com",
            credentials: [],
            userLevelSelectedCalendars: [],
          },
          createdAt: new Date(),
          weight: 10,
        },
        {
          user: {
            id: 2,
            email: "test2@example.com",
            credentials: [],
            userLevelSelectedCalendars: [],
          },
          createdAt: new Date(),
          weight: 150,
        },
      ],
    });

    expect(queuesAndAttributesData).toEqual({
      attributeWeights: undefined,
      virtualQueuesData: undefined,
    });
  });

  it("uses attribute weights and counts only bookings within virtual queue", async () => {
    const users: GetLuckyUserAvailableUsersType = [
      buildUser({
        id: 1,
        username: "test1",
        name: "Test User 1",
        email: "test1@example.com",
        priority: 1,
        weight: 150,
        bookings: [
          {
            createdAt: new Date("2022-01-25T06:30:00.000Z"),
          },
        ],
      }),
      buildUser({
        id: 2,
        username: "test2",
        name: "Test User 2",
        email: "test2@example.com",
        priority: 3,
        weight: 50,
        bookings: [
          {
            createdAt: new Date("2022-01-25T05:30:00.000Z"),
          },
        ],
      }),
    ];

    CalendarManagerMock.getBusyCalendarTimes.mockResolvedValue({ success: true, data: [] });
    prismaMock.outOfOfficeEntry.findMany.mockResolvedValue([]);

    prismaMock.user.findMany.mockResolvedValue(users);
    prismaMock.host.findMany.mockResolvedValue([]);
    prismaMock.booking.findMany.mockResolvedValue([
      buildBooking({
        id: 1,
        userId: 1,
        createdAt: new Date("2022-01-25T06:30:00.000Z"),
      }),
      buildBooking({
        id: 3,
        userId: 2,
        createdAt: new Date("2022-01-25T05:30:00.000Z"),
      }),
      buildBooking({
        id: 4,
        userId: 2,
        createdAt: new Date("2022-01-25T05:30:00.000Z"),
      }),
    ]);

    const allRRHosts = [
      {
        user: {
          id: users[0].id,
          email: users[0].email,
          credentials: [],
          userLevelSelectedCalendars: [],
        },
        weight: users[0].weight,
        createdAt: new Date(0),
      },
      {
        user: {
          id: users[1].id,
          email: users[1].email,
          credentials: [],
          userLevelSelectedCalendars: [],
        },
        weight: users[1].weight,
        createdAt: new Date(0),
      },
    ];

    await expect(
      luckyUserService.getLuckyUser({
        availableUsers: users,
        eventType: {
          id: 1,
          isRRWeightsEnabled: true,
          team: {
            parentId: 1,
            rrResetInterval: RRResetInterval.DAY,
            rrTimestampBasis: RRTimestampBasis.CREATED_AT,
          },
          includeNoShowInRRCalculation: false,
        },
        allRRHosts,
      })
    ).resolves.toStrictEqual(users[0]);

    const queryArgs = prismaMock.booking.findMany.mock.calls[0][0];

    // Today: 2021-06-20T11:59:59Z, daily interval
    expect(queryArgs.where?.createdAt).toEqual(
      expect.objectContaining({
        gte: new Date("2021-06-20T00:00:00Z"),
        lte: new Date("2021-06-20T11:59:59.000Z"),
      })
    );
  });
});

describe("get interval times", () => {
  it("should get correct interval start time with meeting started timestamp basis and DAY interval", () => {
    const meetingStartTime = new Date("2024-03-15T14:30:00Z");
    const result = getIntervalStartDate({
      interval: RRResetInterval.DAY,
      rrTimestampBasis: RRTimestampBasis.START_TIME,
      meetingStartTime,
    });
    expect(result).toEqual(new Date("2024-03-15T00:00:00Z"));
  });

  it("should get correct interval start time with meeting started timestamp basis and MONTH interval", () => {
    const meetingStartTime = new Date("2024-03-15T14:30:00Z");
    const result = getIntervalStartDate({
      interval: RRResetInterval.MONTH,
      rrTimestampBasis: RRTimestampBasis.START_TIME,
      meetingStartTime,
    });
    expect(result).toEqual(new Date("2024-03-01T00:00:00Z"));
  });

  it("should get correct interval start time with created at timestamp basis and DAY interval", () => {
    const result = getIntervalStartDate({
      interval: RRResetInterval.DAY,
      rrTimestampBasis: RRTimestampBasis.CREATED_AT,
    });
    expect(result).toEqual(new Date("2021-06-20T00:00:00Z")); // Based on the mocked system time
  });

  it("should get correct interval start time with created at timestamp basis and MONTH interval", () => {
    const result = getIntervalStartDate({
      interval: RRResetInterval.MONTH,
      rrTimestampBasis: RRTimestampBasis.CREATED_AT,
    });
    expect(result).toEqual(new Date("2021-06-01T00:00:00Z")); // Based on the mocked system time
  });

  it("should get correct interval end time with meeting started timestamp basis and DAY interval", () => {
    const meetingStartTime = new Date("2024-03-15T14:30:00Z");
    const result = getIntervalEndDate({
      interval: RRResetInterval.DAY,
      rrTimestampBasis: RRTimestampBasis.START_TIME,
      meetingStartTime,
    });
    expect(result).toEqual(new Date("2024-03-15T23:59:59.999Z"));
  });

  it("should get correct interval end time with meeting started timestamp basis and MONTH interval", () => {
    const meetingStartTime = new Date("2024-03-15T14:30:00Z");
    const result = getIntervalEndDate({
      interval: RRResetInterval.MONTH,
      rrTimestampBasis: RRTimestampBasis.START_TIME,
      meetingStartTime,
    });
    expect(result).toEqual(new Date("2024-03-31T23:59:59.999Z"));
  });

  it("should get correct interval end time with created at timestamp basis", () => {
    const result = getIntervalEndDate({
      interval: RRResetInterval.DAY,
      rrTimestampBasis: RRTimestampBasis.CREATED_AT,
    });
    expect(result).toEqual(new Date("2021-06-20T11:59:59Z")); // Based on the mocked system time
  });
});

it("returns the single user correctly without fetching data when only one user available", async () => {
  const singleUser = buildUser({
    id: 42,
    username: "singleuser",
    name: "Single User",
    email: "singleuser@example.com",
    bookings: [],
  });

  // Create spies to verify no data fetching occurs
  const spyCalendar = vi.spyOn(CalendarManagerMock, "getBusyCalendarTimes");
  const spyPrismaUser = vi.spyOn(prismaMock.user, "findMany");
  const spyPrismaHost = vi.spyOn(prismaMock.host, "findMany");
  const spyPrismaBooking = vi.spyOn(prismaMock.booking, "findMany");
  const spyPrismaOOO = vi.spyOn(prismaMock.outOfOfficeEntry, "findMany");

  await expect(
    luckyUserService.getLuckyUser({
      availableUsers: [singleUser],
      eventType: {
        id: 1,
        isRRWeightsEnabled: false,
        team: { rrResetInterval: RRResetInterval.MONTH, rrTimestampBasis: RRTimestampBasis.CREATED_AT },
        includeNoShowInRRCalculation: false,
      },
      allRRHosts: [],
          })
  ).resolves.toStrictEqual(singleUser);

  // Verify no expensive operations were called
  expect(spyCalendar).not.toHaveBeenCalled();
  expect(spyPrismaUser).not.toHaveBeenCalled();
  expect(spyPrismaHost).not.toHaveBeenCalled();
  expect(spyPrismaBooking).not.toHaveBeenCalled();
  expect(spyPrismaOOO).not.toHaveBeenCalled();
});
