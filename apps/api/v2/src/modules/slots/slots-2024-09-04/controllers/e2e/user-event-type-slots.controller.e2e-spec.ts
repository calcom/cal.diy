import { CAL_API_VERSION_HEADER, SUCCESS_STATUS, VERSION_2024_09_04 } from "@calcom/platform-constants";
import type {
  CreateScheduleInput_2024_06_11,
  ReserveSlotOutput_2024_09_04 as ReserveSlotOutputData_2024_09_04,
} from "@calcom/platform-types";
import type { EventType, Team, User } from "@calcom/prisma/client";
import { INestApplication } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { advanceTo, clear } from "jest-date-mock";
import { DateTime } from "luxon";
import request from "supertest";
import { ApiKeysRepositoryFixture } from "test/fixtures/repository/api-keys.repository.fixture";
import { AttendeeRepositoryFixture } from "test/fixtures/repository/attendee.repository.fixture";
import { BookingSeatRepositoryFixture } from "test/fixtures/repository/booking-seat.repository.fixture";
import { BookingsRepositoryFixture } from "test/fixtures/repository/bookings.repository.fixture";
import { EventTypesRepositoryFixture } from "test/fixtures/repository/event-types.repository.fixture";
import { MembershipRepositoryFixture } from "test/fixtures/repository/membership.repository.fixture";
import { OOORepositoryFixture } from "test/fixtures/repository/ooo.repository.fixture";
import { SelectedSlotRepositoryFixture } from "test/fixtures/repository/selected-slot.repository.fixture";
import { TeamRepositoryFixture } from "test/fixtures/repository/team.repository.fixture";
import { UserRepositoryFixture } from "test/fixtures/repository/users.repository.fixture";
import { randomString } from "test/utils/randomString";
import { AppModule } from "@/app.module";
import { bootstrap } from "@/bootstrap";
import { SchedulesModule_2024_06_11 } from "@/platform/schedules/schedules_2024_06_11/schedules.module";
import { SchedulesService_2024_06_11 } from "@/platform/schedules/schedules_2024_06_11/services/schedules.service";
import { PermissionsGuard } from "@/modules/auth/guards/permissions/permissions.guard";
import { PrismaModule } from "@/modules/prisma/prisma.module";
import {
  expectedSlotsRome,
  expectedSlotsRomeRange,
  expectedSlotsUTC,
  expectedSlotsUTCRange,
} from "@/modules/slots/slots-2024-09-04/controllers/e2e/expected-slots";
import { GetReservedSlotOutput_2024_09_04 } from "@/modules/slots/slots-2024-09-04/outputs/get-reserved-slot.output";
import { GetSlotsOutput_2024_09_04 } from "@/modules/slots/slots-2024-09-04/outputs/get-slots.output";
import { ReserveSlotOutputResponse_2024_09_04 } from "@/modules/slots/slots-2024-09-04/outputs/reserve-slot.output";
import { SlotsModule_2024_09_04 } from "@/modules/slots/slots-2024-09-04/slots.module";
import { TokensModule } from "@/modules/tokens/tokens.module";
import { UsersModule } from "@/modules/users/users.module";

describe("Slots 2024-09-04 Endpoints", () => {
  describe("User event type slots", () => {
    let app: INestApplication;

    let userRepositoryFixture: UserRepositoryFixture;
    let schedulesService: SchedulesService_2024_06_11;
    let eventTypesRepositoryFixture: EventTypesRepositoryFixture;
    let selectedSlotRepositoryFixture: SelectedSlotRepositoryFixture;
    let bookingsRepositoryFixture: BookingsRepositoryFixture;
    let bookingSeatsRepositoryFixture: BookingSeatRepositoryFixture;
    let attendeesRepositoryFixture: AttendeeRepositoryFixture;
    let apiKeysRepositoryFixture: ApiKeysRepositoryFixture;
    let apiKeyString: string;
    let membershipsRepositoryFixture: MembershipRepositoryFixture;
    let teamRepositoryFixture: TeamRepositoryFixture;
    let oooRepositoryFixture: OOORepositoryFixture;

    const userEmail = `slots-2024-09-04-user-${randomString()}@example.com`;
    let user: User;
    let eventTypeId: number;
    let eventTypeSlug: string;
    let eventTypeLength: number;

    let team: Team;
    const teammateUserEmail = `slots-2024-09-04-teammate-user-${randomString()}@example.com`;
    let teammateUser: User;
    let teammateUserApiKeyString: string;

    const unrelatedUserEmail = `slots-2024-09-04-unrelated-user-${randomString()}@example.com`;
    let unrelatedUser: User;
    let unrelatedUserApiKeyString: string;

    const seatedEventTypeSlug = `slots-2024-09-04-seated-event-type-${randomString()}`;
    let seatedEventType: EventType;

    let variableLengthEventType: EventType;
    let customScheduledEventType: EventType;

    let reservedSlot: ReserveSlotOutputData_2024_09_04;

    const oooTestUserEmail = `oooTestUser-${randomString()}@cal.com`;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          AppModule,
          PrismaModule,
          UsersModule,
          TokensModule,
          SchedulesModule_2024_06_11,
          SlotsModule_2024_09_04,
        ],
      })
        .overrideGuard(PermissionsGuard)
        .useValue({
          canActivate: () => true,
        })
        .compile();

      userRepositoryFixture = new UserRepositoryFixture(moduleRef);
      schedulesService = moduleRef.get<SchedulesService_2024_06_11>(SchedulesService_2024_06_11);
      eventTypesRepositoryFixture = new EventTypesRepositoryFixture(moduleRef);
      selectedSlotRepositoryFixture = new SelectedSlotRepositoryFixture(moduleRef);
      bookingsRepositoryFixture = new BookingsRepositoryFixture(moduleRef);
      bookingSeatsRepositoryFixture = new BookingSeatRepositoryFixture(moduleRef);
      attendeesRepositoryFixture = new AttendeeRepositoryFixture(moduleRef);
      apiKeysRepositoryFixture = new ApiKeysRepositoryFixture(moduleRef);
      membershipsRepositoryFixture = new MembershipRepositoryFixture(moduleRef);
      teamRepositoryFixture = new TeamRepositoryFixture(moduleRef);
      oooRepositoryFixture = new OOORepositoryFixture(moduleRef);

      user = await userRepositoryFixture.create({
        email: userEmail,
        name: userEmail,
        username: userEmail,
      });

      unrelatedUser = await userRepositoryFixture.create({
        email: unrelatedUserEmail,
        name: unrelatedUserEmail,
        username: unrelatedUserEmail,
      });

      teammateUser = await userRepositoryFixture.create({
        email: teammateUserEmail,
        name: teammateUserEmail,
        username: teammateUserEmail,
      });

      const { keyString } = await apiKeysRepositoryFixture.createApiKey(user.id, null);
      apiKeyString = keyString;

      const { keyString: unrelatedUserKeyString } = await apiKeysRepositoryFixture.createApiKey(
        unrelatedUser.id,
        null
      );
      unrelatedUserApiKeyString = unrelatedUserKeyString;

      const { keyString: teammateUserKeyString } = await apiKeysRepositoryFixture.createApiKey(
        teammateUser.id,
        null
      );
      teammateUserApiKeyString = teammateUserKeyString;

      const userSchedule: CreateScheduleInput_2024_06_11 = {
        name: `slots-2024-09-04-schedule-${randomString()}`,
        timeZone: "Europe/Rome",
        isDefault: true,
      };
      // note(Lauris): this creates default schedule monday to friday from 9AM to 5PM in Europe/Rome timezone
      await schedulesService.createUserSchedule(user.id, userSchedule);

      const event = await eventTypesRepositoryFixture.create(
        { title: "frisbee match", slug: `slots-2024-09-04-event-type-${randomString()}`, length: 60 },
        user.id
      );
      eventTypeId = event.id;
      eventTypeSlug = event.slug;
      eventTypeLength = event.length;

      const seatedEvent = await eventTypesRepositoryFixture.create(
        {
          title: "peer coding",
          slug: seatedEventTypeSlug,
          length: 60,
          seatsPerTimeSlot: 5,
          seatsShowAttendees: true,
          seatsShowAvailabilityCount: true,
          locations: [{ type: "inPerson", address: "via 10, rome, italy" }],
        },
        user.id
      );
      seatedEventType = seatedEvent;

      const variableLengthEvent = await eventTypesRepositoryFixture.create(
        {
          title: "frisbee match",
          slug: `slots-2024-09-04-variable-length-event-type-${randomString()}`,
          length: 15,
          metadata: { multipleDuration: [15, 30, 45, 60, 180] },
        },
        user.id
      );
      variableLengthEventType = variableLengthEvent;

      const customSchedule = await schedulesService.createUserSchedule(user.id, {
        name: `slots-2024-09-04-custom-schedule-${randomString()}`,
        timeZone: "Europe/Rome",
        isDefault: false,
        schedule: [
          {
            days: ["Tuesday", "Thursday"],
            startTime: "10:00",
            endTime: "13:00",
          },
        ],
      });

      customScheduledEventType = await eventTypesRepositoryFixture.create(
        {
          title: "custom schedule match",
          slug: `slots-2024-09-04-custom-sched-${randomString()}`,
          length: 60,
          schedule: {
            connect: {
              id: customSchedule.id,
            },
          },
        },
        user.id
      );

      team = await teamRepositoryFixture.create({
        name: `slots-2024-09-04-team-${randomString()}`,
        isOrganization: false,
      });

      await membershipsRepositoryFixture.create({
        role: "MEMBER",
        user: { connect: { id: user.id } },
        team: { connect: { id: team.id } },
        accepted: true,
      });

      await membershipsRepositoryFixture.create({
        role: "MEMBER",
        user: { connect: { id: teammateUser.id } },
        team: { connect: { id: team.id } },
        accepted: true,
      });

      app = moduleRef.createNestApplication();
      bootstrap(app as NestExpressApplication);

      await app.init();
    });

    it("should get slots in UTC by event type id", async () => {
      return request(app.getHttpServer())
        .get(`/v2/slots?eventTypeId=${eventTypeId}&start=2050-09-05&end=2050-09-09`)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200)
        .then(async (response) => {
          const responseBody: GetSlotsOutput_2024_09_04 = response.body;
          expect(responseBody.status).toEqual(SUCCESS_STATUS);
          const slots = responseBody.data;

          expect(slots).toBeDefined();
          const days = Object.keys(slots);
          expect(days.length).toEqual(5);
          expect(slots).toEqual(expectedSlotsUTC);
        });
    });

    it("should get slots in specified time zone by event type id", async () => {
      return request(app.getHttpServer())
        .get(`/v2/slots?eventTypeId=${eventTypeId}&start=2050-09-05&end=2050-09-09&timeZone=Europe/Rome`)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200)
        .then(async (response) => {
          const responseBody: GetSlotsOutput_2024_09_04 = response.body;
          expect(responseBody.status).toEqual(SUCCESS_STATUS);
          const slots = responseBody.data;

          expect(slots).toBeDefined();
          const days = Object.keys(slots);
          expect(days.length).toEqual(5);
          expect(slots).toEqual(expectedSlotsRome);
        });
    });

    it("should get slots by event type id configured with custom non-default availability schedule", async () => {
      return request(app.getHttpServer())
        .get(
          `/v2/slots?eventTypeId=${customScheduledEventType.id}&start=2050-09-05&end=2050-09-09&timeZone=Europe/Rome`
        )
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200)
        .then(async (response) => {
          const responseBody: GetSlotsOutput_2024_09_04 = response.body;
          const slots = responseBody.data;

          expect(responseBody.status).toEqual(SUCCESS_STATUS);
          expect(slots).toBeDefined();
          const days = Object.keys(slots);
          expect(days.length).toEqual(2);
          expect(slots).toEqual({
            "2050-09-06": [
              { start: "2050-09-06T10:00:00.000+02:00" },
              { start: "2050-09-06T11:00:00.000+02:00" },
              { start: "2050-09-06T12:00:00.000+02:00" },
            ],
            "2050-09-08": [
              { start: "2050-09-08T10:00:00.000+02:00" },
              { start: "2050-09-08T11:00:00.000+02:00" },
              { start: "2050-09-08T12:00:00.000+02:00" },
            ],
          });
        });
    });

    it("should get slots in UTC by event type slug", async () => {
      return request(app.getHttpServer())
        .get(
          `/v2/slots?eventTypeSlug=${eventTypeSlug}&username=${user.username}&start=2050-09-05&end=2050-09-09`
        )
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200)
        .then(async (response) => {
          const responseBody: GetSlotsOutput_2024_09_04 = response.body;
          expect(responseBody.status).toEqual(SUCCESS_STATUS);
          const slots = responseBody.data;

          expect(slots).toBeDefined();
          const days = Object.keys(slots);
          expect(days.length).toEqual(5);
          expect(slots).toEqual(expectedSlotsUTC);
        });
    });

    it("should get slots in specified time zone by event type slug", async () => {
      return request(app.getHttpServer())
        .get(
          `/v2/slots?eventTypeSlug=${eventTypeSlug}&username=${user.username}&start=2050-09-05&end=2050-09-09&timeZone=Europe/Rome`
        )
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200)
        .then(async (response) => {
          const responseBody: GetSlotsOutput_2024_09_04 = response.body;
          expect(responseBody.status).toEqual(SUCCESS_STATUS);
          const slots = responseBody.data;

          expect(slots).toBeDefined();
          const days = Object.keys(slots);
          expect(days.length).toEqual(5);

          expect(slots).toEqual(expectedSlotsRome);
        });
    });

    it("should get slots by event type id and with start hours specified", async () => {
      return request(app.getHttpServer())
        .get(`/v2/slots?eventTypeId=${eventTypeId}&start=2050-09-05T09:00:00.000Z&end=2050-09-09`)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200)
        .then(async (response) => {
          const responseBody: GetSlotsOutput_2024_09_04 = response.body;
          expect(responseBody.status).toEqual(SUCCESS_STATUS);
          const slots = responseBody.data;

          expect(slots).toBeDefined();
          const days = Object.keys(slots);
          expect(days.length).toEqual(5);

          const expectedSlotsUTC2050_09_05 = expectedSlotsUTC["2050-09-05"].slice(2);
          expect(slots).toEqual({ ...expectedSlotsUTC, "2050-09-05": expectedSlotsUTC2050_09_05 });
        });
    });

    it("should get slots by event type id and with end hours specified", async () => {
      return request(app.getHttpServer())
        .get(`/v2/slots?eventTypeId=${eventTypeId}&start=2050-09-05&end=2050-09-09T12:00:00.000Z`)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200)
        .then(async (response) => {
          const responseBody: GetSlotsOutput_2024_09_04 = response.body;
          expect(responseBody.status).toEqual(SUCCESS_STATUS);
          const slots = responseBody.data;

          expect(slots).toBeDefined();
          const days = Object.keys(slots);
          expect(days.length).toEqual(5);

          const expectedSlotsUTC2050_09_09 = expectedSlotsUTC["2050-09-09"].slice(0, 5);
          expect(slots).toEqual({ ...expectedSlotsUTC, "2050-09-09": expectedSlotsUTC2050_09_09 });
        });
    });

    it("should get slots in specified time zone by event type id and with start hours specified", async () => {
      return request(app.getHttpServer())
        .get(
          `/v2/slots?eventTypeId=${eventTypeId}&start=2050-09-05T09:00:00.000Z&end=2050-09-09&timeZone=Europe/Rome`
        )
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200)
        .then(async (response) => {
          const responseBody: GetSlotsOutput_2024_09_04 = response.body;
          expect(responseBody.status).toEqual(SUCCESS_STATUS);
          const slots = responseBody.data;

          expect(slots).toBeDefined();
          const days = Object.keys(slots);
          expect(days.length).toEqual(5);

          const expectedSlotsRome2050_09_05 = expectedSlotsRome["2050-09-05"].slice(2);
          expect(slots).toEqual({ ...expectedSlotsRome, "2050-09-05": expectedSlotsRome2050_09_05 });
        });
    });

    it("should get slots in specified time zone by event type id and with end hours specified", async () => {
      return request(app.getHttpServer())
        .get(
          `/v2/slots?eventTypeId=${eventTypeId}&start=2050-09-05&end=2050-09-09T12:00:00.000Z&timeZone=Europe/Rome`
        )
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200)
        .then(async (response) => {
          const responseBody: GetSlotsOutput_2024_09_04 = response.body;
          expect(responseBody.status).toEqual(SUCCESS_STATUS);
          const slots = responseBody.data;

          expect(slots).toBeDefined();
          const days = Object.keys(slots);
          expect(days.length).toEqual(5);

          const expectedSlotsRome2050_09_09 = expectedSlotsRome["2050-09-09"].slice(0, 5);
          expect(slots).toEqual({ ...expectedSlotsRome, "2050-09-09": expectedSlotsRome2050_09_09 });
        });
    });

    it("should get slots in UTC by event type id in range format", async () => {
      return request(app.getHttpServer())
        .get(`/v2/slots?eventTypeId=${eventTypeId}&start=2050-09-05&end=2050-09-10&format=range`)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual({
            status: SUCCESS_STATUS,
            data: expectedSlotsUTCRange,
          });
        });
    });

    it("should get slots in specified time zone by event type id in range format", async () => {
      return request(app.getHttpServer())
        .get(
          `/v2/slots?eventTypeId=${eventTypeId}&start=2050-09-05&end=2050-09-10&timeZone=Europe/Rome&format=range`
        )
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual({
            status: SUCCESS_STATUS,
            data: expectedSlotsRomeRange,
          });
        });
    });

    it("should get slots in UTC by event type slug in range format", async () => {
      return request(app.getHttpServer())
        .get(
          `/v2/slots?eventTypeSlug=${eventTypeSlug}&username=${user.username}&start=2050-09-05&end=2050-09-09&format=range`
        )
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200)
        .then(async (response) => {
          const responseBody: GetSlotsOutput_2024_09_04 = response.body;
          expect(responseBody.status).toEqual(SUCCESS_STATUS);
          const slots = responseBody.data;

          expect(slots).toBeDefined();
          const days = Object.keys(slots);
          expect(days.length).toEqual(5);
          expect(slots).toEqual(expectedSlotsUTCRange);
        });
    });

    it("should get slots in specified time zone by event type slug in range format", async () => {
      return request(app.getHttpServer())
        .get(
          `/v2/slots?eventTypeSlug=${eventTypeSlug}&username=${user.username}&start=2050-09-05&end=2050-09-09&timeZone=Europe/Rome&format=range`
        )
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200)
        .then(async (response) => {
          const responseBody: GetSlotsOutput_2024_09_04 = response.body;
          expect(responseBody.status).toEqual(SUCCESS_STATUS);
          const slots = responseBody.data;

          expect(slots).toBeDefined();
          const days = Object.keys(slots);
          expect(days.length).toEqual(5);
          expect(slots).toEqual(expectedSlotsRomeRange);
        });
    });

    it("should reserve a slot and it should not appear in available slots", async () => {
      // note(Lauris): mock current date to test slots release time
      const now = "2049-09-05T12:00:00.000Z";
      const newDate = DateTime.fromISO(now, { zone: "UTC" }).toJSDate();
      advanceTo(newDate);

      const slotStartTime = "2050-09-05T10:00:00.000Z";
      const reserveResponse = await request(app.getHttpServer())
        .post(`/v2/slots/reservations`)
        .send({
          eventTypeId,
          slotStart: slotStartTime,
        })
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(201);

      const reserveResponseBody: ReserveSlotOutputResponse_2024_09_04 = reserveResponse.body;
      expect(reserveResponseBody.status).toEqual(SUCCESS_STATUS);
      const responseReservedSlot: ReserveSlotOutputData_2024_09_04 = reserveResponseBody.data;
      expect(responseReservedSlot.reservationUid).toBeDefined();
      expect(responseReservedSlot.eventTypeId).toEqual(eventTypeId);
      expect(responseReservedSlot.slotStart).toEqual(slotStartTime);
      expect(responseReservedSlot.slotDuration).toEqual(eventTypeLength);
      expect(responseReservedSlot.slotEnd).toEqual(
        DateTime.fromISO(slotStartTime, { zone: "UTC" }).plus({ minutes: eventTypeLength }).toISO()
      );
      expect(responseReservedSlot.reservationDuration).toEqual(5);

      if (!responseReservedSlot.reservationUid) {
        throw new Error("Reserved slot uid is undefined");
      }

      reservedSlot = responseReservedSlot;

      const response = await request(app.getHttpServer())
        .get(`/v2/slots?eventTypeId=${eventTypeId}&start=2050-09-05&end=2050-09-09`)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200);

      const responseBody: GetSlotsOutput_2024_09_04 = response.body;
      expect(responseBody.status).toEqual(SUCCESS_STATUS);
      const slots = responseBody.data;

      expect(slots).toBeDefined();
      const days = Object.keys(slots);
      expect(days.length).toEqual(5);

      const expectedSlotsUTC2050_09_05 = expectedSlotsUTC["2050-09-05"].filter(
        (slot) => slot.start !== slotStartTime
      );
      expect(slots).toEqual({ ...expectedSlotsUTC, "2050-09-05": expectedSlotsUTC2050_09_05 });

      const dbSlot = await selectedSlotRepositoryFixture.getByUid(reservedSlot.reservationUid);
      expect(dbSlot).toBeDefined();
      if (dbSlot) {
        const dbReleaseAt = DateTime.fromJSDate(dbSlot.releaseAt, { zone: "UTC" }).toISO();
        const expectedReleaseAt = DateTime.fromISO(now, { zone: "UTC" }).plus({ minutes: 5 }).toISO();
        expect(dbReleaseAt).toEqual(expectedReleaseAt);
        expect(responseReservedSlot.reservationUntil).toEqual(expectedReleaseAt);
      }
      clear();
    });

    it("should get reserved slot", async () => {
      const reserveResponse = await request(app.getHttpServer())
        .get(`/v2/slots/reservations/${reservedSlot.reservationUid}`)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200);

      const reserveResponseBody: GetReservedSlotOutput_2024_09_04 = reserveResponse.body;
      expect(reserveResponseBody.status).toEqual(SUCCESS_STATUS);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { reservationDuration: _1, ...rest } = reservedSlot;
      expect(reserveResponseBody.data).toEqual(rest);
    });

    describe("overlapping slot reservations", () => {
      it("start of request slot overlaps already existing reserved slot", async () => {
        // Try to reserve 10:15-11:15 when 10:00-11:00 is taken (60 min event)
        const newSlotStart = DateTime.fromISO(reservedSlot.slotStart).plus({ minutes: 15 }).toISO();

        await request(app.getHttpServer())
          .post(`/v2/slots/reservations`)
          .send({
            eventTypeId,
            slotStart: newSlotStart,
          })
          .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
          .expect(422)
          .then((response) => {
            expect(response.body.error.message).toEqual(
              "This time slot is already reserved by another user. Please choose a different time."
            );
          });
      });

      it("end of request slot overlaps already existing reserved slot", async () => {
        // Try to reserve 9:45-10:45 when 10:00-11:00 is taken (60 min event)
        const newSlotStart = DateTime.fromISO(reservedSlot.slotStart).minus({ minutes: 15 }).toISO();

        await request(app.getHttpServer())
          .post(`/v2/slots/reservations`)
          .send({
            eventTypeId,
            slotStart: newSlotStart,
          })
          .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
          .expect(422)
          .then((response) => {
            expect(response.body.error.message).toEqual(
              "This time slot is already reserved by another user. Please choose a different time."
            );
          });
      });

      it("request slot is inside already existing reserved slot", async () => {
        // Try to reserve 10:10-11:10 when 10:00-11:00 is taken (60 min event)
        const newSlotStart = DateTime.fromISO(reservedSlot.slotStart).plus({ minutes: 10 }).toISO();

        await request(app.getHttpServer())
          .post(`/v2/slots/reservations`)
          .send({
            eventTypeId,
            slotStart: newSlotStart,
          })
          .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
          .expect(422)
          .then((response) => {
            expect(response.body.error.message).toEqual(
              "This time slot is already reserved by another user. Please choose a different time."
            );
          });
      });
    });

    it("should update a reserved slot and it should not appear in available slots", async () => {
      // note(Lauris): mock current date to test slots release time
      const now = "2049-09-05T14:00:00.000Z";
      const newDate = DateTime.fromISO(now, { zone: "UTC" }).toJSDate();
      advanceTo(newDate);

      const slotStartTime = "2050-09-05T13:00:00.000Z";
      const reserveResponse = await request(app.getHttpServer())
        .patch(`/v2/slots/reservations/${reservedSlot.reservationUid}`)
        .send({
          eventTypeId,
          slotStart: slotStartTime,
        })
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200);

      const reserveResponseBody: ReserveSlotOutputResponse_2024_09_04 = reserveResponse.body;
      expect(reserveResponseBody.status).toEqual(SUCCESS_STATUS);
      const responseReservedSlot: ReserveSlotOutputData_2024_09_04 = reserveResponseBody.data;
      expect(responseReservedSlot.reservationUid).toBeDefined();
      expect(responseReservedSlot.eventTypeId).toEqual(eventTypeId);
      expect(responseReservedSlot.slotStart).toEqual(slotStartTime);
      expect(responseReservedSlot.slotDuration).toEqual(eventTypeLength);
      expect(responseReservedSlot.slotEnd).toEqual(
        DateTime.fromISO(slotStartTime, { zone: "UTC" }).plus({ minutes: eventTypeLength }).toISO()
      );
      expect(responseReservedSlot.reservationDuration).toEqual(5);

      if (!responseReservedSlot.reservationUid) {
        throw new Error("Reserved slot uid is undefined");
      }

      reservedSlot = responseReservedSlot;

      const response = await request(app.getHttpServer())
        .get(`/v2/slots?eventTypeId=${eventTypeId}&start=2050-09-05&end=2050-09-09`)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200);

      const responseBody: GetSlotsOutput_2024_09_04 = response.body;
      expect(responseBody.status).toEqual(SUCCESS_STATUS);
      const slots = responseBody.data;

      expect(slots).toBeDefined();
      const days = Object.keys(slots);
      expect(days.length).toEqual(5);

      const expectedSlotsUTC2050_09_05 = expectedSlotsUTC["2050-09-05"].filter(
        (slot) => slot.start !== slotStartTime
      );
      expect(slots).toEqual({ ...expectedSlotsUTC, "2050-09-05": expectedSlotsUTC2050_09_05 });

      const dbSlot = await selectedSlotRepositoryFixture.getByUid(reservedSlot.reservationUid);
      expect(dbSlot).toBeDefined();
      if (dbSlot) {
        const dbReleaseAt = DateTime.fromJSDate(dbSlot.releaseAt, { zone: "UTC" }).toISO();
        const expectedReleaseAt = DateTime.fromISO(now, { zone: "UTC" }).plus({ minutes: 5 }).toISO();
        expect(dbReleaseAt).toEqual(expectedReleaseAt);
        expect(responseReservedSlot.reservationUntil).toEqual(expectedReleaseAt);
      }
      clear();
    });

    it("should delete reserved slot and it should not appear in available slots", async () => {
      await request(app.getHttpServer())
        .delete(`/v2/slots/reservations/${reservedSlot.reservationUid}`)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/v2/slots?eventTypeId=${eventTypeId}&start=2050-09-05&end=2050-09-09`)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200);

      const responseBody: GetSlotsOutput_2024_09_04 = response.body;
      expect(responseBody.status).toEqual(SUCCESS_STATUS);
      const slots = responseBody.data;

      expect(slots).toBeDefined();
      const days = Object.keys(slots);
      expect(days.length).toEqual(5);
      expect(slots).toEqual({ ...expectedSlotsUTC });
    });

    it("should not be able reserve a slot with custom duration if no auth is provided", async () => {
      await request(app.getHttpServer())
        .post(`/v2/slots/reservations`)
        .send({
          eventTypeId,
          slotStart: "2050-09-05T10:00:00.000Z",
          reservationDuration: 10,
        })
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(401);
    });

    it("should not be able reserve a slot with custom duration if provided auth user is not owner of event type nor shares team membership with owner", async () => {
      await request(app.getHttpServer())
        .post(`/v2/slots/reservations`)
        .send({
          eventTypeId,
          slotStart: "2050-09-05T10:00:00.000Z",
          reservationDuration: 10,
        })
        .set({ Authorization: `Bearer cal_test_${unrelatedUserApiKeyString}` })
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(403);
    });

    it("should reserve a slot as event type owner with custom duration and it should not appear in available slots", async () => {
      // note(Lauris): mock current date to test slots release time
      const now = "2049-09-05T12:00:00.000Z";
      const newDate = DateTime.fromISO(now, { zone: "UTC" }).toJSDate();
      advanceTo(newDate);

      const slotStartTime = "2050-09-05T10:00:00.000Z";
      const reserveResponse = await request(app.getHttpServer())
        .post(`/v2/slots/reservations`)
        .set({ Authorization: `Bearer cal_test_${apiKeyString}` })
        .send({
          eventTypeId,
          slotStart: slotStartTime,
          reservationDuration: 10,
        })
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(201);

      const reserveResponseBody: ReserveSlotOutputResponse_2024_09_04 = reserveResponse.body;
      expect(reserveResponseBody.status).toEqual(SUCCESS_STATUS);
      const responseReservedSlot: ReserveSlotOutputData_2024_09_04 = reserveResponseBody.data;
      expect(responseReservedSlot.reservationUid).toBeDefined();
      if (!responseReservedSlot.reservationUid) {
        throw new Error("Reserved slot uid is undefined");
      }
      reservedSlot = responseReservedSlot;

      const response = await request(app.getHttpServer())
        .get(`/v2/slots?eventTypeId=${eventTypeId}&start=2050-09-05&end=2050-09-09`)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200);

      const responseBody: GetSlotsOutput_2024_09_04 = response.body;
      expect(responseBody.status).toEqual(SUCCESS_STATUS);
      const slots = responseBody.data;

      expect(slots).toBeDefined();
      const days = Object.keys(slots);
      expect(days.length).toEqual(5);

      const expectedSlotsUTC2050_09_05 = expectedSlotsUTC["2050-09-05"].filter(
        (slot) => slot.start !== slotStartTime
      );
      expect(slots).toEqual({ ...expectedSlotsUTC, "2050-09-05": expectedSlotsUTC2050_09_05 });

      const dbSlot = await selectedSlotRepositoryFixture.getByUid(reservedSlot.reservationUid);
      expect(dbSlot).toBeDefined();
      if (dbSlot) {
        const dbReleaseAt = DateTime.fromJSDate(dbSlot.releaseAt, { zone: "UTC" }).toISO();
        const expectedReleaseAt = DateTime.fromISO(now, { zone: "UTC" }).plus({ minutes: 10 }).toISO();
        expect(dbReleaseAt).toEqual(expectedReleaseAt);
      }
      await selectedSlotRepositoryFixture.deleteByUId(reservedSlot.reservationUid);
      clear();
    });

    it("should reserve a slot as someone who shares team with event type owner with custom duration and it should not appear in available slots", async () => {
      // note(Lauris): mock current date to test slots release time
      const now = "2049-09-05T12:00:00.000Z";
      const newDate = DateTime.fromISO(now, { zone: "UTC" }).toJSDate();
      advanceTo(newDate);

      const slotStartTime = "2050-09-05T10:00:00.000Z";
      const reserveResponse = await request(app.getHttpServer())
        .post(`/v2/slots/reservations`)
        .set({ Authorization: `Bearer cal_test_${teammateUserApiKeyString}` })
        .send({
          eventTypeId,
          slotStart: slotStartTime,
          reservationDuration: 10,
        })
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(201);

      const reserveResponseBody: ReserveSlotOutputResponse_2024_09_04 = reserveResponse.body;
      expect(reserveResponseBody.status).toEqual(SUCCESS_STATUS);
      const responseReservedSlot: ReserveSlotOutputData_2024_09_04 = reserveResponseBody.data;
      expect(responseReservedSlot.reservationUid).toBeDefined();
      if (!responseReservedSlot.reservationUid) {
        throw new Error("Reserved slot uid is undefined");
      }
      reservedSlot = responseReservedSlot;

      const response = await request(app.getHttpServer())
        .get(`/v2/slots?eventTypeId=${eventTypeId}&start=2050-09-05&end=2050-09-09`)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200);

      const responseBody: GetSlotsOutput_2024_09_04 = response.body;
      expect(responseBody.status).toEqual(SUCCESS_STATUS);
      const slots = responseBody.data;

      expect(slots).toBeDefined();
      const days = Object.keys(slots);
      expect(days.length).toEqual(5);

      const expectedSlotsUTC2050_09_05 = expectedSlotsUTC["2050-09-05"].filter(
        (slot) => slot.start !== slotStartTime
      );
      expect(slots).toEqual({ ...expectedSlotsUTC, "2050-09-05": expectedSlotsUTC2050_09_05 });

      const dbSlot = await selectedSlotRepositoryFixture.getByUid(reservedSlot.reservationUid);
      expect(dbSlot).toBeDefined();
      if (dbSlot) {
        const dbReleaseAt = DateTime.fromJSDate(dbSlot.releaseAt, { zone: "UTC" }).toISO();
        const expectedReleaseAt = DateTime.fromISO(now, { zone: "UTC" }).plus({ minutes: 10 }).toISO();
        expect(dbReleaseAt).toEqual(expectedReleaseAt);
      }
      await selectedSlotRepositoryFixture.deleteByUId(reservedSlot.reservationUid);
      clear();
    });

    it("should do a booking and slot should not be available at that time", async () => {
      const startTime = "2050-09-05T11:00:00.000Z";
      const booking = await bookingsRepositoryFixture.create({
        uid: `booking-uid-${eventTypeId}`,
        title: "booking title",
        startTime,
        endTime: "2050-09-05T12:00:00.000Z",
        eventType: {
          connect: {
            id: eventTypeId,
          },
        },
        metadata: {},
        responses: {
          name: "tester",
          email: "tester@example.com",
          guests: [],
        },
        user: {
          connect: {
            id: user.id,
          },
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/v2/slots?eventTypeId=${eventTypeId}&start=2050-09-05&end=2050-09-09`)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200);

      const responseBody: GetSlotsOutput_2024_09_04 = response.body;
      expect(responseBody.status).toEqual(SUCCESS_STATUS);
      const slots = responseBody.data;

      expect(slots).toBeDefined();
      const days = Object.keys(slots);
      expect(days.length).toEqual(5);

      const expectedSlotsUTC2050_09_05 = expectedSlotsUTC["2050-09-05"].filter(
        (slot) => slot.start !== startTime
      );
      expect(slots).toEqual({ ...expectedSlotsUTC, "2050-09-05": expectedSlotsUTC2050_09_05 });
      await bookingsRepositoryFixture.deleteById(booking.id);
    });

    it("should do a booking for seated event and slot should show attendees count and bookingUid", async () => {
      await selectedSlotRepositoryFixture.deleteAllByUserId(user.id);

      const startTime = "2050-09-05T11:00:00.000Z";
      const booking = await bookingsRepositoryFixture.create({
        uid: `booking-uid-seated-${seatedEventType.id}-${randomString()}`,
        title: "booking title",
        startTime,
        endTime: "2050-09-05T12:00:00.000Z",
        eventType: {
          connect: {
            id: seatedEventType.id,
          },
        },
        metadata: {},
        responses: {
          name: "tester",
          email: "tester@example.com",
          guests: [],
        },
        user: {
          connect: {
            id: user.id,
          },
        },
      });

      const attendee = await attendeesRepositoryFixture.create({
        name: "tester",
        email: "tester@example.com",
        timeZone: "Europe/London",
        booking: {
          connect: {
            id: booking.id,
          },
        },
      });

      await bookingSeatsRepositoryFixture.create({
        referenceUid: `seat-${randomString()}`,
        data: {},
        booking: {
          connect: {
            id: booking.id,
          },
        },
        attendee: {
          connect: {
            id: attendee.id,
          },
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v2/slots?eventTypeId=${seatedEventType.id}&start=2050-09-05&end=2050-09-10`)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200);

      const responseBody: GetSlotsOutput_2024_09_04 = response.body;
      expect(responseBody.status).toEqual(SUCCESS_STATUS);
      const slots = responseBody.data;

      expect(slots).toBeDefined();
      const days = Object.keys(slots);
      expect(days.length).toEqual(5);

      const expectedSlotsUTC = {
        "2050-09-05": [
          { start: "2050-09-05T07:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-05T08:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-05T09:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-05T10:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          // note(Lauris): this is when booking was made
          {
            start: "2050-09-05T11:00:00.000Z",
            seatsBooked: 1,
            seatsRemaining: 4,
            seatsTotal: 5,
            bookingUid: booking.uid,
          },
          { start: "2050-09-05T12:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-05T13:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-05T14:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
        ],
        "2050-09-06": [
          { start: "2050-09-06T07:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-06T08:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-06T09:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-06T10:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-06T11:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-06T12:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-06T13:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-06T14:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
        ],
        "2050-09-07": [
          { start: "2050-09-07T07:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-07T08:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-07T09:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-07T10:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-07T11:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-07T12:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-07T13:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-07T14:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
        ],
        "2050-09-08": [
          { start: "2050-09-08T07:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-08T08:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-08T09:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-08T10:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-08T11:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-08T12:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-08T13:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-08T14:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
        ],
        "2050-09-09": [
          { start: "2050-09-09T07:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-09T08:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-09T09:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-09T10:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-09T11:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-09T12:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-09T13:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
          { start: "2050-09-09T14:00:00.000Z", seatsBooked: 0, seatsRemaining: 5, seatsTotal: 5 },
        ],
      };

      expect(slots).toEqual(expectedSlotsUTC);

      await bookingsRepositoryFixture.deleteById(booking.id);
    });

    it("should do a booking for seated event and slot should show attendees count and bookingUid and return range format", async () => {
      await selectedSlotRepositoryFixture.deleteAllByUserId(user.id);

      const startTime = "2050-09-05T11:00:00.000Z";
      const booking = await bookingsRepositoryFixture.create({
        uid: `booking-uid-seated-range-${seatedEventType.id}-${randomString()}`,
        title: "booking title",
        startTime,
        endTime: "2050-09-05T12:00:00.000Z",
        eventType: {
          connect: {
            id: seatedEventType.id,
          },
        },
        metadata: {},
        responses: {
          name: "tester",
          email: "tester@example.com",
          guests: [],
        },
        user: {
          connect: {
            id: user.id,
          },
        },
      });

      const attendee = await attendeesRepositoryFixture.create({
        name: "tester",
        email: "tester@example.com",
        timeZone: "Europe/London",
        booking: {
          connect: {
            id: booking.id,
          },
        },
      });

      await bookingSeatsRepositoryFixture.create({
        referenceUid: `seat-${randomString()}`,
        data: {},
        booking: {
          connect: {
            id: booking.id,
          },
        },
        attendee: {
          connect: {
            id: attendee.id,
          },
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v2/slots?eventTypeId=${seatedEventType.id}&start=2050-09-05&end=2050-09-10&format=range`)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
        .expect(200);

      const responseBody: GetSlotsOutput_2024_09_04 = response.body;
      expect(responseBody.status).toEqual(SUCCESS_STATUS);
      const slots = responseBody.data;

      expect(slots).toBeDefined();
      const days = Object.keys(slots);
      expect(days.length).toEqual(5);

      const expectedSlotsUTC = {
        "2050-09-05": [
          {
            start: "2050-09-05T07:00:00.000Z",
            end: "2050-09-05T08:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-05T08:00:00.000Z",
            end: "2050-09-05T09:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-05T09:00:00.000Z",
            end: "2050-09-05T10:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-05T10:00:00.000Z",
            end: "2050-09-05T11:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          // note(Lauris): this is when booking was made
          {
            start: "2050-09-05T11:00:00.000Z",
            end: "2050-09-05T12:00:00.000Z",
            seatsBooked: 1,
            seatsRemaining: 4,
            seatsTotal: 5,
            bookingUid: booking.uid,
          },
          {
            start: "2050-09-05T12:00:00.000Z",
            end: "2050-09-05T13:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-05T13:00:00.000Z",
            end: "2050-09-05T14:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-05T14:00:00.000Z",
            end: "2050-09-05T15:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
        ],
        "2050-09-06": [
          {
            start: "2050-09-06T07:00:00.000Z",
            end: "2050-09-06T08:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-06T08:00:00.000Z",
            end: "2050-09-06T09:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-06T09:00:00.000Z",
            end: "2050-09-06T10:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-06T10:00:00.000Z",
            end: "2050-09-06T11:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-06T11:00:00.000Z",
            end: "2050-09-06T12:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-06T12:00:00.000Z",
            end: "2050-09-06T13:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-06T13:00:00.000Z",
            end: "2050-09-06T14:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-06T14:00:00.000Z",
            end: "2050-09-06T15:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
        ],
        "2050-09-07": [
          {
            start: "2050-09-07T07:00:00.000Z",
            end: "2050-09-07T08:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-07T08:00:00.000Z",
            end: "2050-09-07T09:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-07T09:00:00.000Z",
            end: "2050-09-07T10:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-07T10:00:00.000Z",
            end: "2050-09-07T11:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-07T11:00:00.000Z",
            end: "2050-09-07T12:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-07T12:00:00.000Z",
            end: "2050-09-07T13:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-07T13:00:00.000Z",
            end: "2050-09-07T14:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-07T14:00:00.000Z",
            end: "2050-09-07T15:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
        ],
        "2050-09-08": [
          {
            start: "2050-09-08T07:00:00.000Z",
            end: "2050-09-08T08:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-08T08:00:00.000Z",
            end: "2050-09-08T09:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-08T09:00:00.000Z",
            end: "2050-09-08T10:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-08T10:00:00.000Z",
            end: "2050-09-08T11:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-08T11:00:00.000Z",
            end: "2050-09-08T12:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-08T12:00:00.000Z",
            end: "2050-09-08T13:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-08T13:00:00.000Z",
            end: "2050-09-08T14:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-08T14:00:00.000Z",
            end: "2050-09-08T15:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
        ],
        "2050-09-09": [
          {
            start: "2050-09-09T07:00:00.000Z",
            end: "2050-09-09T08:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-09T08:00:00.000Z",
            end: "2050-09-09T09:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-09T09:00:00.000Z",
            end: "2050-09-09T10:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-09T10:00:00.000Z",
            end: "2050-09-09T11:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-09T11:00:00.000Z",
            end: "2050-09-09T12:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-09T12:00:00.000Z",
            end: "2050-09-09T13:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-09T13:00:00.000Z",
            end: "2050-09-09T14:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
          {
            start: "2050-09-09T14:00:00.000Z",
            end: "2050-09-09T15:00:00.000Z",
            seatsBooked: 0,
            seatsRemaining: 5,
            seatsTotal: 5,
          },
        ],
      };

      expect(slots).toEqual(expectedSlotsUTC);

      await bookingsRepositoryFixture.deleteById(booking.id);
    });

    describe("variable length", () => {
      let responseReservedVariableSlot: ReserveSlotOutputData_2024_09_04;

      beforeAll(async () => {
        await selectedSlotRepositoryFixture.deleteAllByUserId(user.id);
      });

      it("should not be able to reserve a slot for variable length event type with invalid duration", async () => {
        const slotStartTime = "2050-09-05T10:00:00.000Z";
        const reserveResponse = await request(app.getHttpServer())
          .post(`/v2/slots/reservations`)
          .send({
            eventTypeId: variableLengthEventType.id,
            slotStart: slotStartTime,
            slotDuration: 1000,
          })
          .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
          .expect(400);

        expect(reserveResponse.body.error.message).toEqual(
          "Provided 'slotDuration' is not one of the possible lengths for the event type. The possible lengths for this variable length event type are: 15, 30, 45, 60, 180"
        );
      });

      it("should reserve a slot with slot duration for variable event type length", async () => {
        // note(Lauris): mock current date to test slots release time
        const now = "2049-09-05T12:00:00.000Z";
        const newDate = DateTime.fromISO(now, { zone: "UTC" }).toJSDate();
        advanceTo(newDate);

        const slotDuration = 60;
        // Use 2050-09-06 to avoid overlap with other tests that reserve 2050-09-05
        const slotStartTime = "2050-09-06T09:00:00.000Z";
        const reserveResponse = await request(app.getHttpServer())
          .post(`/v2/slots/reservations`)
          .send({
            eventTypeId: variableLengthEventType.id,
            slotStart: slotStartTime,
            slotDuration,
          })
          .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
          .expect(201);

        const reserveResponseBody: ReserveSlotOutputResponse_2024_09_04 = reserveResponse.body;
        expect(reserveResponseBody.status).toEqual(SUCCESS_STATUS);
        responseReservedVariableSlot = reserveResponseBody.data;
        expect(responseReservedVariableSlot.reservationUid).toBeDefined();
        expect(responseReservedVariableSlot.eventTypeId).toEqual(variableLengthEventType.id);
        expect(responseReservedVariableSlot.slotStart).toEqual(slotStartTime);
        expect(responseReservedVariableSlot.slotDuration).toEqual(slotDuration);
        expect(responseReservedVariableSlot.slotEnd).toEqual(
          DateTime.fromISO(slotStartTime, { zone: "UTC" }).plus({ minutes: slotDuration }).toISO()
        );
        expect(responseReservedVariableSlot.reservationDuration).toEqual(5);

        if (!responseReservedVariableSlot.reservationUid) {
          throw new Error("Reserved slot uid is undefined");
        }

        const response = await request(app.getHttpServer())
          .get(
            `/v2/slots?eventTypeId=${variableLengthEventType.id}&start=2050-09-05&end=2050-09-10&duration=60`
          )
          .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
          .expect(200);

        const responseBody: GetSlotsOutput_2024_09_04 = response.body;
        expect(responseBody.status).toEqual(SUCCESS_STATUS);
        const slots = responseBody.data;

        expect(slots).toBeDefined();
        const days = Object.keys(slots);
        expect(days.length).toEqual(5);

        const expectedSlotsUTC2050_09_06 = expectedSlotsUTC["2050-09-06"].filter(
          (slot) => slot.start !== slotStartTime
        );
        expect(slots).toEqual({ ...expectedSlotsUTC, "2050-09-06": expectedSlotsUTC2050_09_06 });

        const dbSlot = await selectedSlotRepositoryFixture.getByUid(
          responseReservedVariableSlot.reservationUid
        );
        expect(dbSlot).toBeDefined();
        if (dbSlot) {
          const dbReleaseAt = DateTime.fromJSDate(dbSlot.releaseAt, { zone: "UTC" }).toISO();
          const expectedReleaseAt = DateTime.fromISO(now, { zone: "UTC" }).plus({ minutes: 5 }).toISO();
          expect(dbReleaseAt).toEqual(expectedReleaseAt);
          expect(responseReservedVariableSlot.reservationUntil).toEqual(expectedReleaseAt);
        }
        clear();
      });

      it("request slot contains already existing reserved slot", async () => {
        // Try to reserve 8:45-11:45 when 09:00-10:00 on 2050-09-06 is taken
        const newSlotStart = DateTime.fromISO(responseReservedVariableSlot.slotStart)
          .minus({ minutes: 15 })
          .toISO();

        await request(app.getHttpServer())
          .post(`/v2/slots/reservations`)
          .send({
            eventTypeId: variableLengthEventType.id,
            slotStart: newSlotStart,
            slotDuration: 180,
          })
          .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
          .set("Authorization", `Bearer cal_test_${apiKeyString}`)
          .expect(422)
          .then((response) => {
            expect(response.body.error.message).toEqual(
              "This time slot is already reserved by another user. Please choose a different time."
            );
          });
      });
    });

    describe("out of office", () => {
      let oooTestUser: User;
      let oooTestUserEventType: EventType;

      let oooEntryId: number;

      beforeAll(async () => {
        oooTestUser = await userRepositoryFixture.create({
          email: oooTestUserEmail,
          name: oooTestUserEmail,
          username: oooTestUserEmail,
        });

        const oooUserSchedule: CreateScheduleInput_2024_06_11 = {
          name: `slots-2024-09-04-schedule-${randomString()}`,
          timeZone: "Europe/Rome",
          isDefault: true,
        };
        // note(Lauris): this creates default schedule monday to friday from 9AM to 5PM in Europe/Rome timezone
        await schedulesService.createUserSchedule(oooTestUser.id, oooUserSchedule);

        const event = await eventTypesRepositoryFixture.create(
          { title: "frisbee match", slug: `slots-2024-09-04-event-type-${randomString()}`, length: 60 },
          oooTestUser.id
        );
        oooTestUserEventType = event;
      });

      it("should not returns slots for ooo days", async () => {
        const oooStart = new Date("2050-09-06T00:00:00.000Z");
        const oooEnd = new Date("2050-09-09T23:59:59.999Z");

        const oooEntry = await oooRepositoryFixture.create({
          uuid: randomString(),
          start: oooStart,
          end: oooEnd,
          user: { connect: { id: oooTestUser.id } },
          toUser: { connect: { id: oooTestUser.id } },
          createdAt: new Date(),
          reason: {
            connect: {
              id: 1,
            },
          },
        });
        oooEntryId = oooEntry.id;

        const response = await request(app.getHttpServer())
          .get(`/v2/slots?eventTypeId=${oooTestUserEventType.id}&start=2050-09-05&end=2050-09-09&duration=60`)
          .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
          .expect(200);

        const responseBody: GetSlotsOutput_2024_09_04 = response.body;
        expect(responseBody.status).toEqual(SUCCESS_STATUS);
        const slots = responseBody.data;

        expect(slots).toBeDefined();
        const days = Object.keys(slots);
        expect(days.length).toBe(1);
        expect(slots).toEqual({
          "2050-09-05": expectedSlotsUTC["2050-09-05"],
        });

        await oooRepositoryFixture.delete(oooEntryId);
      });
    });

    describe("booking status", () => {
      const startTime = "2050-09-12T11:00:00.000Z";
      const testBookingUid = `booking-uid-${eventTypeId}-booking-status-test`;

      describe("cant reserve", () => {
        it("should not be able to reserve a slot if booking is accepted during that time", async () => {
          const booking = await bookingsRepositoryFixture.create({
            status: "ACCEPTED",
            uid: testBookingUid,
            title: "booking title",
            startTime,
            endTime: "2050-09-12T12:00:00.000Z",
            eventType: {
              connect: {
                id: eventTypeId,
              },
            },
            metadata: {},
            responses: {
              name: "tester",
              email: "tester@example.com",
              guests: [],
            },
            user: {
              connect: {
                id: user.id,
              },
            },
          });

          const reserveResponse = await request(app.getHttpServer())
            .post(`/v2/slots/reservations`)
            .send({
              eventTypeId,
              slotStart: startTime,
            })
            .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
            .expect(422);

          expect(reserveResponse.body.error.message).toEqual(
            `Can't reserve a slot if the event is already booked.`
          );
          await bookingsRepositoryFixture.deleteById(booking.id);
        });

        it("should not be able to reserve a slot if booking is pending during that time", async () => {
          const booking = await bookingsRepositoryFixture.create({
            status: "PENDING",
            uid: testBookingUid,
            title: "booking title",
            startTime,
            endTime: "2050-09-12T12:00:00.000Z",
            eventType: {
              connect: {
                id: eventTypeId,
              },
            },
            metadata: {},
            responses: {
              name: "tester",
              email: "tester@example.com",
              guests: [],
            },
            user: {
              connect: {
                id: user.id,
              },
            },
          });

          const reserveResponse = await request(app.getHttpServer())
            .post(`/v2/slots/reservations`)
            .send({
              eventTypeId,
              slotStart: startTime,
            })
            .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
            .expect(422);

          expect(reserveResponse.body.error.message).toEqual(
            `Can't reserve a slot if the event is already booked.`
          );
          await bookingsRepositoryFixture.deleteById(booking.id);
        });

        it("should not be able to reserve a slot if booking is awaiting host during that time", async () => {
          const booking = await bookingsRepositoryFixture.create({
            status: "AWAITING_HOST",
            uid: testBookingUid,
            title: "booking title",
            startTime,
            endTime: "2050-09-12T12:00:00.000Z",
            eventType: {
              connect: {
                id: eventTypeId,
              },
            },
            metadata: {},
            responses: {
              name: "tester",
              email: "tester@example.com",
              guests: [],
            },
            user: {
              connect: {
                id: user.id,
              },
            },
          });

          const reserveResponse = await request(app.getHttpServer())
            .post(`/v2/slots/reservations`)
            .send({
              eventTypeId,
              slotStart: startTime,
            })
            .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
            .expect(422);

          expect(reserveResponse.body.error.message).toEqual(
            `Can't reserve a slot if the event is already booked.`
          );
          await bookingsRepositoryFixture.deleteById(booking.id);
        });
      });

      describe("can reserve", () => {
        it("should be able to reserve a slot if booking is cancelled during that time", async () => {
          const booking = await bookingsRepositoryFixture.create({
            status: "CANCELLED",
            uid: testBookingUid,
            title: "booking title",
            startTime,
            endTime: "2050-09-12T12:00:00.000Z",
            eventType: {
              connect: {
                id: eventTypeId,
              },
            },
            metadata: {},
            responses: {
              name: "tester",
              email: "tester@example.com",
              guests: [],
            },
            user: {
              connect: {
                id: user.id,
              },
            },
          });

          const reserveResponse = await request(app.getHttpServer())
            .post(`/v2/slots/reservations`)
            .send({
              eventTypeId,
              slotStart: startTime,
            })
            .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
            .expect(201);

          const reserveResponseBody: ReserveSlotOutputResponse_2024_09_04 = reserveResponse.body;
          expect(reserveResponseBody.status).toEqual(SUCCESS_STATUS);
          const responseReservedSlot: ReserveSlotOutputData_2024_09_04 = reserveResponseBody.data;
          expect(responseReservedSlot.reservationUid).toBeDefined();
          expect(responseReservedSlot.eventTypeId).toEqual(eventTypeId);
          expect(responseReservedSlot.slotStart).toEqual(startTime);
          expect(responseReservedSlot.slotDuration).toEqual(eventTypeLength);
          expect(responseReservedSlot.slotEnd).toEqual(
            DateTime.fromISO(startTime, { zone: "UTC" }).plus({ minutes: eventTypeLength }).toISO()
          );
          expect(responseReservedSlot.reservationDuration).toEqual(5);
          await bookingsRepositoryFixture.deleteById(booking.id);
          await selectedSlotRepositoryFixture.deleteByUId(responseReservedSlot.reservationUid);
        });

        it("should be able to reserve a slot if booking is rejected during that time", async () => {
          const booking = await bookingsRepositoryFixture.create({
            status: "REJECTED",
            uid: testBookingUid,
            title: "booking title",
            startTime,
            endTime: "2050-09-12T12:00:00.000Z",
            eventType: {
              connect: {
                id: eventTypeId,
              },
            },
            metadata: {},
            responses: {
              name: "tester",
              email: "tester@example.com",
              guests: [],
            },
            user: {
              connect: {
                id: user.id,
              },
            },
          });

          const reserveResponse = await request(app.getHttpServer())
            .post(`/v2/slots/reservations`)
            .send({
              eventTypeId,
              slotStart: startTime,
            })
            .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
            .expect(201);

          const reserveResponseBody: ReserveSlotOutputResponse_2024_09_04 = reserveResponse.body;
          expect(reserveResponseBody.status).toEqual(SUCCESS_STATUS);
          const responseReservedSlot: ReserveSlotOutputData_2024_09_04 = reserveResponseBody.data;
          expect(responseReservedSlot.reservationUid).toBeDefined();
          expect(responseReservedSlot.eventTypeId).toEqual(eventTypeId);
          expect(responseReservedSlot.slotStart).toEqual(startTime);
          expect(responseReservedSlot.slotDuration).toEqual(eventTypeLength);
          expect(responseReservedSlot.slotEnd).toEqual(
            DateTime.fromISO(startTime, { zone: "UTC" }).plus({ minutes: eventTypeLength }).toISO()
          );
          expect(responseReservedSlot.reservationDuration).toEqual(5);
          await bookingsRepositoryFixture.deleteById(booking.id);
        });
      });
    });

    describe("booking overlap", () => {
      const T0901 = DateTime.fromISO("2055-01-01T10:00:00.000Z").minus({ minutes: 59 }).toISO();
      const T0930 = "2055-01-01T09:30:00.000Z";
      const T1000 = "2055-01-01T10:00:00.000Z";
      const T1015 = "2055-01-01T10:15:00.000Z";
      const T1029 = DateTime.fromISO("2055-01-01T10:30:00.000Z").minus({ minutes: 1 }).toISO();
      const T1030 = "2055-01-01T10:30:00.000Z";
      const T1045 = "2055-01-01T10:45:00.000Z";
      const T1100 = "2055-01-01T11:00:00.000Z";
      const T1130 = "2055-01-01T11:30:00.000Z";
      const T1200 = "2055-01-01T12:00:00.000Z";

      const getBookingPayload = (startTime: string, endTime: string) => ({
        status: "ACCEPTED" as const,
        uid: `test-booking-overlap-${randomString()}`,
        title: "Overlap Test Booking",
        startTime,
        endTime,
        eventType: { connect: { id: eventTypeId } },
        metadata: {},
        responses: { name: "Tester", email: `tester-overlap-${randomString()}@example.com`, guests: [] },
        user: { connect: { id: user.id } },
      });

      const expectedErrorMessage = "Can't reserve a slot if the event is already booked.";
      describe("slot overlaps booking", () => {
        it("should fail if slot reservation (10:00-11:00) starts during an existing booking (09:30-10:30)", async () => {
          const booking = await bookingsRepositoryFixture.create(getBookingPayload(T0930, T1030));

          const reserveResponse = await request(app.getHttpServer())
            .post(`/v2/slots/reservations`)
            .send({ eventTypeId, slotStart: T1000 })
            .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
            .expect(422);

          expect(reserveResponse.body.error.message).toEqual(expectedErrorMessage);
          await bookingsRepositoryFixture.deleteById(booking.id);
        });

        it("should fail if slot reservation (10:00-11:00) ends during an existing booking (10:30-11:30)", async () => {
          const booking = await bookingsRepositoryFixture.create(getBookingPayload(T1030, T1130));

          const reserveResponse = await request(app.getHttpServer())
            .post(`/v2/slots/reservations`)
            .send({ eventTypeId, slotStart: T1000 })
            .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
            .expect(422);

          expect(reserveResponse.body.error.message).toEqual(expectedErrorMessage);
          await bookingsRepositoryFixture.deleteById(booking.id);
        });

        it("should fail if slot reservation (10:15-11:15) is entirely contained within an existing booking (10:00-11:30)", async () => {
          const booking = await bookingsRepositoryFixture.create(getBookingPayload(T1000, T1130));

          const reserveResponse = await request(app.getHttpServer())
            .post(`/v2/slots/reservations`)
            .send({ eventTypeId, slotStart: T1015 })
            .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
            .expect(422);

          expect(reserveResponse.body.error.message).toEqual(expectedErrorMessage);
          await bookingsRepositoryFixture.deleteById(booking.id);
        });

        it("should fail if slot reservation (10:00-11:00) entirely contains an existing booking (10:15-10:45)", async () => {
          const booking = await bookingsRepositoryFixture.create(getBookingPayload(T1015, T1045));

          const reserveResponse = await request(app.getHttpServer())
            .post(`/v2/slots/reservations`)
            .send({ eventTypeId, slotStart: T1000 })
            .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
            .expect(422);

          expect(reserveResponse.body.error.message).toEqual(expectedErrorMessage);
          await bookingsRepositoryFixture.deleteById(booking.id);
        });

        it("should fail if slot reservation (10:00-11:00) starts at the same time as an existing booking (10:00-11:00)", async () => {
          const booking = await bookingsRepositoryFixture.create(getBookingPayload(T1000, T1100));

          const reserveResponse = await request(app.getHttpServer())
            .post(`/v2/slots/reservations`)
            .send({ eventTypeId, slotStart: T1000 })
            .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
            .expect(422);

          expect(reserveResponse.body.error.message).toEqual(expectedErrorMessage);
          await bookingsRepositoryFixture.deleteById(booking.id);
        });

        it("should fail if slot reservation (10:00-11:00) ends at the same time as an existing booking (09:30-11:00)", async () => {
          const booking = await bookingsRepositoryFixture.create(getBookingPayload(T0930, T1100));

          const reserveResponse = await request(app.getHttpServer())
            .post(`/v2/slots/reservations`)
            .send({ eventTypeId, slotStart: T1000 })
            .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
            .expect(422);

          expect(reserveResponse.body.error.message).toEqual(expectedErrorMessage);
          await bookingsRepositoryFixture.deleteById(booking.id);
        });

        it("should fail if slot reservation (10:29-11:29) starts just before existing booking (09:30-10:30) ends", async () => {
          const booking = await bookingsRepositoryFixture.create(getBookingPayload(T0930, T1030));

          const reserveResponse = await request(app.getHttpServer())
            .post(`/v2/slots/reservations`)
            .send({ eventTypeId, slotStart: T1029 })
            .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
            .expect(422);

          expect(reserveResponse.body.error.message).toEqual(expectedErrorMessage);
          await bookingsRepositoryFixture.deleteById(booking.id);
        });

        it("should fail if slot reservation (09:01-10:01) ends just after existing booking (10:00-11:00) starts", async () => {
          const booking = await bookingsRepositoryFixture.create(getBookingPayload(T1000, T1100));
          const slotStartForEarlyOverlap = T0901;

          const reserveResponse = await request(app.getHttpServer())
            .post(`/v2/slots/reservations`)
            .send({ eventTypeId, slotStart: slotStartForEarlyOverlap })
            .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
            .expect(422);

          expect(reserveResponse.body.error.message).toEqual(expectedErrorMessage);
          await bookingsRepositoryFixture.deleteById(booking.id);
        });
      });

      describe("slot does not overlap booking", () => {
        it("should succeed if slot reservation (09:00-10:00) is immediately before an existing booking (10:00-11:00)", async () => {
          const existingBooking = await bookingsRepositoryFixture.create(getBookingPayload(T1000, T1100));
          const slotStartForNoOverlap = "2055-01-01T09:00:00.000Z";

          const reserveResponse = await request(app.getHttpServer())
            .post(`/v2/slots/reservations`)
            .send({ eventTypeId, slotStart: slotStartForNoOverlap })
            .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
            .expect(201);

          expect(reserveResponse.body.data.reservationUid).toBeDefined();

          await selectedSlotRepositoryFixture.deleteByUId(reserveResponse.body.data.reservationUid);
          await bookingsRepositoryFixture.deleteById(existingBooking.id);
        });

        it("should succeed if slot reservation (08:00-09:00) is before an existing booking (10:00-11:00)", async () => {
          const existingBooking = await bookingsRepositoryFixture.create(getBookingPayload(T1000, T1100));
          const slotStartForNoOverlap = "2055-01-01T08:00:00.000Z";

          const reserveResponse = await request(app.getHttpServer())
            .post(`/v2/slots/reservations`)
            .send({ eventTypeId, slotStart: slotStartForNoOverlap })
            .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
            .expect(201);

          expect(reserveResponse.body.data.reservationUid).toBeDefined();

          await selectedSlotRepositoryFixture.deleteByUId(reserveResponse.body.data.reservationUid);
          await bookingsRepositoryFixture.deleteById(existingBooking.id);
        });

        it("should succeed if slot reservation (11:00-12:00) is immediately after an existing booking (10:00-11:00)", async () => {
          const existingBooking = await bookingsRepositoryFixture.create(getBookingPayload(T1000, T1100));
          const slotStartForNoOverlap = T1100;

          const reserveResponse = await request(app.getHttpServer())
            .post(`/v2/slots/reservations`)
            .send({ eventTypeId, slotStart: slotStartForNoOverlap })
            .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
            .expect(201);

          expect(reserveResponse.body.data.reservationUid).toBeDefined();
          await selectedSlotRepositoryFixture.deleteByUId(reserveResponse.body.data.reservationUid);
          await bookingsRepositoryFixture.deleteById(existingBooking.id);
        });

        it("should succeed if slot reservation (12:00-13:00) is after an existing booking (10:00-11:00)", async () => {
          const existingBooking = await bookingsRepositoryFixture.create(getBookingPayload(T1000, T1100));
          const slotStartForNoOverlap = T1200;

          const reserveResponse = await request(app.getHttpServer())
            .post(`/v2/slots/reservations`)
            .send({ eventTypeId, slotStart: slotStartForNoOverlap })
            .set(CAL_API_VERSION_HEADER, VERSION_2024_09_04)
            .expect(201);

          expect(reserveResponse.body.data.reservationUid).toBeDefined();
          await selectedSlotRepositoryFixture.deleteByUId(reserveResponse.body.data.reservationUid);
          await bookingsRepositoryFixture.deleteById(existingBooking.id);
        });
      });
    });

    afterAll(async () => {
      await userRepositoryFixture.deleteByEmail(user.email);
      await userRepositoryFixture.deleteByEmail(oooTestUserEmail);
      await userRepositoryFixture.deleteByEmail(unrelatedUser.email);
      await selectedSlotRepositoryFixture.deleteByUId(reservedSlot.reservationUid);
      await bookingsRepositoryFixture.deleteAllBookings(user.id, user.email);
      await teamRepositoryFixture.delete(team.id);
      clear();

      await app.close();
    });
  });
});
