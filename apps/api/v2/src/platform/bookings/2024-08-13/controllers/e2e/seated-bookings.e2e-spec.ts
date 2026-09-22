import { CAL_API_VERSION_HEADER, SUCCESS_STATUS, VERSION_2024_08_13 } from "@calcom/platform-constants";
import type {
  CancelBookingInput_2024_08_13,
  CancelSeatedBookingInput_2024_08_13,
  CreateBookingInput_2024_08_13,
  CreateSeatedBookingOutput_2024_08_13,
  GetBookingOutput_2024_08_13,
  GetBookingsOutput_2024_08_13,
  GetSeatedBookingOutput_2024_08_13,
  RescheduleSeatedBookingInput_2024_08_13,
} from "@calcom/platform-types";
import type { Team, User } from "@calcom/prisma/client";
import { INestApplication } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { DateTime } from "luxon";
import request from "supertest";
import { ApiKeysRepositoryFixture } from "test/fixtures/repository/api-keys.repository.fixture";
import { BookingSeatRepositoryFixture } from "test/fixtures/repository/booking-seat.repository.fixture";
import { BookingsRepositoryFixture } from "test/fixtures/repository/bookings.repository.fixture";
import { EventTypesRepositoryFixture } from "test/fixtures/repository/event-types.repository.fixture";
import { TeamRepositoryFixture } from "test/fixtures/repository/team.repository.fixture";
import { UserRepositoryFixture } from "test/fixtures/repository/users.repository.fixture";
import { randomString } from "test/utils/randomString";
import { AppModule } from "@/app.module";
import { bootstrap } from "@/bootstrap";
import { CreateBookingOutput_2024_08_13 } from "@/platform/bookings/2024-08-13/outputs/create-booking.output";
import { RescheduleBookingOutput_2024_08_13 } from "@/platform/bookings/2024-08-13/outputs/reschedule-booking.output";
import { CreateScheduleInput_2024_04_15 } from "@/platform/schedules/schedules_2024_04_15/inputs/create-schedule.input";
import { SchedulesModule_2024_04_15 } from "@/platform/schedules/schedules_2024_04_15/schedules.module";
import { SchedulesService_2024_04_15 } from "@/platform/schedules/schedules_2024_04_15/services/schedules.service";
import { PermissionsGuard } from "@/modules/auth/guards/permissions/permissions.guard";
import { PrismaModule } from "@/modules/prisma/prisma.module";
import { UsersModule } from "@/modules/users/users.module";

describe("Bookings Endpoints 2024-08-13", () => {
  describe("Seated bookings", () => {
    let app: INestApplication;
    let organization: Team;

    let userRepositoryFixture: UserRepositoryFixture;
    let bookingsRepositoryFixture: BookingsRepositoryFixture;
    let schedulesService: SchedulesService_2024_04_15;
    let eventTypesRepositoryFixture: EventTypesRepositoryFixture;
    let teamRepositoryFixture: TeamRepositoryFixture;
    let apiKeysRepositoryFixture: ApiKeysRepositoryFixture;
    let bookingSeatRepositoryFixture: BookingSeatRepositoryFixture;

    const userEmail = `seated-bookings-user-${randomString()}@api.com`;
    let user: User;
    let apiKeyString: string;

    let seatedEventTypeId: number;
    let seatedEventTypeIdAttendeesDisabledId: number;

    const seatedEventSlug = `seated-bookings-event-type-${randomString()}`;
    const seatedEventSlugAttendeesDisabled = `seated-bookings-event-type-attendees-disabled-${randomString()}`;

    let createdSeatedBooking: CreateSeatedBookingOutput_2024_08_13;
    let createdSeatedBooking2: CreateSeatedBookingOutput_2024_08_13;

    const emailAttendeeOne = `seated-bookings-attendee1-${randomString()}@api.com`;
    const nameAttendeeOne = `Attendee One ${randomString()}`;
    const emailAttendeeTwo = `seated-bookings-attendee2-${randomString()}@api.com`;
    const nameAttendeeTwo = `Attendee Two ${randomString()}`;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule, PrismaModule, UsersModule, SchedulesModule_2024_04_15],
      })
        .overrideGuard(PermissionsGuard)
        .useValue({
          canActivate: () => true,
        })
        .compile();

      userRepositoryFixture = new UserRepositoryFixture(moduleRef);
      bookingsRepositoryFixture = new BookingsRepositoryFixture(moduleRef);
      eventTypesRepositoryFixture = new EventTypesRepositoryFixture(moduleRef);
      teamRepositoryFixture = new TeamRepositoryFixture(moduleRef);
      apiKeysRepositoryFixture = new ApiKeysRepositoryFixture(moduleRef);
      schedulesService = moduleRef.get<SchedulesService_2024_04_15>(SchedulesService_2024_04_15);
      bookingSeatRepositoryFixture = new BookingSeatRepositoryFixture(moduleRef);

      organization = await teamRepositoryFixture.create({
        name: `seated-bookings-organization-${randomString()}`,
      });

      user = await userRepositoryFixture.create({
        email: userEmail,
      });

      const { keyString } = await apiKeysRepositoryFixture.createApiKey(user.id, null);
      apiKeyString = `cal_test_${keyString}`;

      const userSchedule: CreateScheduleInput_2024_04_15 = {
        name: `seated-bookings-2024-08-13-schedule-${randomString()}`,
        timeZone: "Europe/Rome",
        isDefault: true,
      };
      await schedulesService.createUserSchedule(user.id, userSchedule);
      const seatedEvent = await eventTypesRepositoryFixture.create(
        {
          title: `seated-bookings-2024-08-13-event-type-${randomString()}`,
          slug: seatedEventSlug,
          length: 60,
          seatsPerTimeSlot: 5,
          seatsShowAttendees: true,
          seatsShowAvailabilityCount: true,
          locations: [{ type: "inPerson", address: "via 10, rome, italy" }],
          metadata: {
            disableStandardEmails: {
              all: {
                attendee: true,
                host: true,
              },
            },
          },
        },
        user.id
      );
      seatedEventTypeId = seatedEvent.id;

      const seatedEventAttendeesDisabled = await eventTypesRepositoryFixture.create(
        {
          title: `seated-bookings-2024-08-13-event-type-attendees-disabled-${randomString()}`,
          slug: seatedEventSlugAttendeesDisabled,
          length: 60,
          seatsPerTimeSlot: 5,
          seatsShowAttendees: false,
          seatsShowAvailabilityCount: false,
          locations: [{ type: "inPerson", address: "via 10, rome, italy" }],
          metadata: {
            disableStandardEmails: {
              all: {
                attendee: true,
                host: true,
              },
            },
          },
        },
        user.id
      );
      seatedEventTypeIdAttendeesDisabledId = seatedEventAttendeesDisabled.id;

      app = moduleRef.createNestApplication();
      bootstrap(app as NestExpressApplication);

      await app.init();
    });

    it("should book an event type with seats for the first time", async () => {
      const body: CreateBookingInput_2024_08_13 = {
        start: new Date(Date.UTC(2030, 0, 8, 13, 0, 0)).toISOString(),
        eventTypeId: seatedEventTypeId,
        attendee: {
          name: nameAttendeeOne,
          email: emailAttendeeOne,
          timeZone: "Europe/Rome",
          language: "it",
        },
        bookingFieldsResponses: {
          codingLanguage: "TypeScript",
        },
        metadata: {
          userId: "100",
        },
      };

      return request(app.getHttpServer())
        .post("/v2/bookings")
        .send(body)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
        .expect(201)
        .then(async (response) => {
          const responseBody: CreateBookingOutput_2024_08_13 = response.body;
          expect(responseBody.status).toEqual(SUCCESS_STATUS);
          expect(responseBody.data).toBeDefined();
          expect(responseDataIsCreateSeatedBooking(responseBody.data)).toBe(true);

          if (responseDataIsCreateSeatedBooking(responseBody.data)) {
            const data: CreateSeatedBookingOutput_2024_08_13 = responseBody.data;
            expect(data.seatUid).toBeDefined();
            const seatUid = data.seatUid;
            expect(data.id).toBeDefined();
            expect(data.uid).toBeDefined();
            expect(data.hosts[0].id).toEqual(user.id);
            expect(data.status).toEqual("accepted");
            expect(data.start).toEqual(body.start);
            expect(data.end).toEqual(
              DateTime.fromISO(body.start, { zone: "utc" }).plus({ hours: 1 }).toISO()
            );
            expect(data.duration).toEqual(60);
            expect(data.eventTypeId).toEqual(seatedEventTypeId);
            expect(data.eventType).toEqual({
              id: seatedEventTypeId,
              slug: seatedEventSlug,
            });
            expect(data.attendees.length).toEqual(1);
            expect(data.attendees[0]).toEqual({
              name: body.attendee.name,
              email: body.attendee.email,
              displayEmail: body.attendee.email,
              timeZone: body.attendee.timeZone,
              language: body.attendee.language,
              absent: false,
              seatUid,
              bookingFieldsResponses: {
                guests: [],
                name: body.attendee.name,
                ...body.bookingFieldsResponses,
              },
              metadata: body.metadata,
              createdAt: expect.any(String)
            });
            expect(data.location).toBeDefined();
            expect(data.absentHost).toEqual(false);
            expect(data.attendees[0].createdAt).toBeDefined();
            createdSeatedBooking = data;
          } else {
            throw new Error(
              "Invalid response data - expected recurring booking but received non array response"
            );
          }
        });
    });

    it("should book an event type with seats for the second time", async () => {
      const body: CreateBookingInput_2024_08_13 = {
        start: new Date(Date.UTC(2030, 0, 8, 13, 0, 0)).toISOString(),
        eventTypeId: seatedEventTypeId,
        attendee: {
          name: nameAttendeeTwo,
          email: emailAttendeeTwo,
          timeZone: "Europe/Rome",
          language: "it",
        },
        bookingFieldsResponses: {
          codingLanguage: "Rust",
        },
        metadata: {
          userId: "200",
        },
      };

      return request(app.getHttpServer())
        .post("/v2/bookings")
        .send(body)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
        .expect(201)
        .then(async (response) => {
          const responseBody: CreateBookingOutput_2024_08_13 = response.body;
          expect(responseBody.status).toEqual(SUCCESS_STATUS);
          expect(responseBody.data).toBeDefined();
          expect(responseDataIsCreateSeatedBooking(responseBody.data)).toBe(true);

          if (responseDataIsCreateSeatedBooking(responseBody.data)) {
            const data: CreateSeatedBookingOutput_2024_08_13 = responseBody.data;
            expect(data.seatUid).toBeDefined();
            const seatUid = data.seatUid;
            expect(data.id).toBeDefined();
            expect(data.uid).toBeDefined();
            expect(data.hosts[0].id).toEqual(user.id);
            expect(data.status).toEqual("accepted");
            expect(data.start).toEqual(body.start);
            expect(data.end).toEqual(
              DateTime.fromISO(body.start, { zone: "utc" }).plus({ hours: 1 }).toISO()
            );
            expect(data.duration).toEqual(60);
            expect(data.eventTypeId).toEqual(seatedEventTypeId);
            expect(data.eventType).toEqual({
              id: seatedEventTypeId,
              slug: seatedEventSlug,
            });
            expect(data.attendees.length).toEqual(2);
            // note(Lauris): first attendee is from previous test request
            const firstAttendee = data.attendees.find((attendee) => attendee.name === nameAttendeeOne);
            expect(firstAttendee).toEqual({
              name: createdSeatedBooking.attendees[0].name,
              email: createdSeatedBooking.attendees[0].email,
              displayEmail: createdSeatedBooking.attendees[0].displayEmail,
              timeZone: createdSeatedBooking.attendees[0].timeZone,
              language: createdSeatedBooking.attendees[0].language,
              absent: false,
              seatUid: createdSeatedBooking.seatUid,
              bookingFieldsResponses: {
                guests: [],
                name: createdSeatedBooking.attendees[0].name,
                ...createdSeatedBooking.attendees[0].bookingFieldsResponses,
              },
              metadata: createdSeatedBooking.attendees[0].metadata,
            });
            const secondAttendee = data.attendees.find((attendee) => attendee.name === nameAttendeeTwo);
            expect(secondAttendee).toEqual({
              name: body.attendee.name,
              email: body.attendee.email,
              displayEmail: body.attendee.email,
              timeZone: body.attendee.timeZone,
              language: body.attendee.language,
              absent: false,
              seatUid,
              bookingFieldsResponses: {
                guests: [],
                name: body.attendee.name,
                ...body.bookingFieldsResponses,
              },
              metadata: body.metadata,
            });
            expect(data.location).toBeDefined();
            expect(data.absentHost).toEqual(false);
            createdSeatedBooking = data;
          } else {
            throw new Error(
              "Invalid response data - expected recurring booking but received non array response"
            );
          }
        });
    });

    it("should get a booking for an event type with seats", async () => {
      return request(app.getHttpServer())
        .get(`/v2/bookings/${createdSeatedBooking.uid}`)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
        .expect(200)
        .then(async (response) => {
          const responseBody: GetBookingOutput_2024_08_13 = response.body;
          expect(responseBody.status).toEqual(SUCCESS_STATUS);
          expect(responseBody.data).toBeDefined();
          expect(responseDataIsGetSeatedBooking(responseBody.data)).toBe(true);

          if (responseDataIsGetSeatedBooking(responseBody.data)) {
            const data: GetSeatedBookingOutput_2024_08_13 = responseBody.data;
            const expected = structuredClone(createdSeatedBooking);
            // note(Lauris): seatUid in get response resides only in each attendee object
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            delete expected.seatUid;
            expect(data).toEqual(expected);
          } else {
            throw new Error(
              "Invalid response data - expected recurring booking but received non array response"
            );
          }
        });
    });

    it("should get all seated bookings", async () => {
      return request(app.getHttpServer())
        .get("/v2/bookings?sortCreated=asc")
        .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
        .set("Authorization", `Bearer ${apiKeyString}`)
        .expect(200)
        .then(async (response) => {
          const responseBody: GetBookingsOutput_2024_08_13 = response.body;
          expect(responseBody.status).toEqual(SUCCESS_STATUS);
          expect(responseBody.data).toBeDefined();
          expect(responseBody.data.length).toEqual(1);

          const seatedBooking = responseBody.data[0];
          const seatedBookingExpected = structuredClone(createdSeatedBooking);
          // note(Lauris): seatUid in get response resides only in each attendee object
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          delete seatedBookingExpected.seatUid;
          expect(seatedBooking).toEqual(seatedBookingExpected);
        });
    });

    it("should get a booking by seatUid", async () => {
      return request(app.getHttpServer())
        .get(`/v2/bookings/by-seat/${createdSeatedBooking.seatUid}`)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
        .expect(200)
        .then(async (response) => {
          const responseBody: GetBookingOutput_2024_08_13 = response.body;
          expect(responseBody.status).toEqual(SUCCESS_STATUS);
          expect(responseBody.data).toBeDefined();
          expect(responseDataIsGetSeatedBooking(responseBody.data)).toBe(true);

          if (responseDataIsGetSeatedBooking(responseBody.data)) {
            const data: GetSeatedBookingOutput_2024_08_13 = responseBody.data;
            expect(data.id).toEqual(createdSeatedBooking.id);
            expect(data.uid).toEqual(createdSeatedBooking.uid);
            expect(data.hosts[0].id).toEqual(user.id);
            expect(data.status).toEqual("accepted");
            expect(data.eventTypeId).toEqual(seatedEventTypeId);
            expect(data.eventType).toEqual({
              id: seatedEventTypeId,
              slug: seatedEventSlug,
            });
            expect(data.attendees.length).toEqual(2);
          } else {
            throw new Error(
              "Invalid response data - expected seated booking but received non seated booking response"
            );
          }
        });
    });

    it("should return 404 when getting booking by non-existent seatUid", async () => {
      return request(app.getHttpServer())
        .get("/v2/bookings/by-seat/non-existent-seat-uid")
        .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
        .expect(404)
        .then(async (response) => {
          expect(response.body.error.message).toEqual(
            "Booking with seatUid=non-existent-seat-uid was not found in the database"
          );
        });
    });

    describe("get booking by seatUid with seatsShowAttendees disabled", () => {
      let bookingWithAttendeesDisabled: CreateSeatedBookingOutput_2024_08_13;
      let secondAttendeeSeatUid: string;
      const emailAttendeeThree = `seated-bookings-attendee3-${randomString()}@api.com`;
      const nameAttendeeThree = `Attendee Three ${randomString()}`;

      it("should book first seat on event type with seatsShowAttendees disabled", async () => {
        const body: CreateBookingInput_2024_08_13 = {
          start: new Date(Date.UTC(2030, 0, 11, 13, 0, 0)).toISOString(),
          eventTypeId: seatedEventTypeIdAttendeesDisabledId,
          attendee: {
            name: nameAttendeeOne,
            email: emailAttendeeOne,
            timeZone: "Europe/Rome",
            language: "it",
          },
          bookingFieldsResponses: {
            codingLanguage: "TypeScript",
          },
          metadata: {
            userId: "100",
          },
        };

        return request(app.getHttpServer())
          .post("/v2/bookings")
          .send(body)
          .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
          .expect(201)
          .then(async (response) => {
            const responseBody: CreateBookingOutput_2024_08_13 = response.body;
            expect(responseBody.status).toEqual(SUCCESS_STATUS);
            expect(responseBody.data).toBeDefined();
            expect(responseDataIsCreateSeatedBooking(responseBody.data)).toBe(true);

            if (responseDataIsCreateSeatedBooking(responseBody.data)) {
              const data: CreateSeatedBookingOutput_2024_08_13 = responseBody.data;
              expect(data.seatUid).toBeDefined();
              bookingWithAttendeesDisabled = data;
            } else {
              throw new Error("Invalid response data - expected seated booking");
            }
          });
      });

      it("should book second seat on same event type with seatsShowAttendees disabled", async () => {
        const body: CreateBookingInput_2024_08_13 = {
          start: new Date(Date.UTC(2030, 0, 11, 13, 0, 0)).toISOString(),
          eventTypeId: seatedEventTypeIdAttendeesDisabledId,
          attendee: {
            name: nameAttendeeThree,
            email: emailAttendeeThree,
            timeZone: "Europe/Rome",
            language: "it",
          },
          bookingFieldsResponses: {
            codingLanguage: "Rust",
          },
          metadata: {
            userId: "300",
          },
        };

        return request(app.getHttpServer())
          .post("/v2/bookings")
          .send(body)
          .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
          .expect(201)
          .then(async (response) => {
            const responseBody: CreateBookingOutput_2024_08_13 = response.body;
            expect(responseBody.status).toEqual(SUCCESS_STATUS);
            expect(responseBody.data).toBeDefined();
            expect(responseDataIsCreateSeatedBooking(responseBody.data)).toBe(true);

            if (responseDataIsCreateSeatedBooking(responseBody.data)) {
              const data: CreateSeatedBookingOutput_2024_08_13 = responseBody.data;
              expect(data.seatUid).toBeDefined();
              secondAttendeeSeatUid = data.seatUid;
            } else {
              throw new Error("Invalid response data - expected seated booking");
            }
          });
      });

      it("should return only the attendee for the specific seatUid when seatsShowAttendees is false and no auth", async () => {
        return request(app.getHttpServer())
          .get(`/v2/bookings/by-seat/${secondAttendeeSeatUid}`)
          .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
          .expect(200)
          .then(async (response) => {
            const responseBody: GetBookingOutput_2024_08_13 = response.body;
            expect(responseBody.status).toEqual(SUCCESS_STATUS);
            expect(responseBody.data).toBeDefined();
            expect(responseDataIsGetSeatedBooking(responseBody.data)).toBe(true);

            if (responseDataIsGetSeatedBooking(responseBody.data)) {
              const data: GetSeatedBookingOutput_2024_08_13 = responseBody.data;
              expect(data.id).toEqual(bookingWithAttendeesDisabled.id);
              expect(data.uid).toEqual(bookingWithAttendeesDisabled.uid);
              expect(data.eventTypeId).toEqual(seatedEventTypeIdAttendeesDisabledId);
              expect(data.attendees.length).toEqual(1);
              expect(data.attendees[0].email).toEqual(emailAttendeeThree);
              expect(data.attendees[0].name).toEqual(nameAttendeeThree);
              expect(data.attendees[0].seatUid).toEqual(secondAttendeeSeatUid);
              expect(data.attendees[0].createdAt).toBeDefined();
            } else {
              throw new Error("Invalid response data - expected seated booking");
            }
          });
      });

      it("should return all attendees when admin auth is provided", async () => {
        return request(app.getHttpServer())
          .get(`/v2/bookings/by-seat/${secondAttendeeSeatUid}`)
          .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
          .set("Authorization", `Bearer ${apiKeyString}`)
          .expect(200)
          .then(async (response) => {
            const responseBody: GetBookingOutput_2024_08_13 = response.body;
            expect(responseBody.status).toEqual(SUCCESS_STATUS);
            expect(responseBody.data).toBeDefined();
            expect(responseDataIsGetSeatedBooking(responseBody.data)).toBe(true);

            if (responseDataIsGetSeatedBooking(responseBody.data)) {
              const data: GetSeatedBookingOutput_2024_08_13 = responseBody.data;
              expect(data.id).toEqual(bookingWithAttendeesDisabled.id);
              expect(data.uid).toEqual(bookingWithAttendeesDisabled.uid);
              expect(data.eventTypeId).toEqual(seatedEventTypeIdAttendeesDisabledId);
              expect(data.attendees.length).toEqual(2);
              await bookingsRepositoryFixture.deleteById(data.id);
            } else {
              throw new Error("Invalid response data - expected seated booking");
            }
          });
      });
    });

    it("should not be able to reschedule seated booking if seatUid is not provided", async () => {
      const body = {
        start: new Date(Date.UTC(2030, 0, 8, 15, 0, 0)).toISOString(),
      };

      const response = await request(app.getHttpServer())
        .post(`/v2/bookings/${createdSeatedBooking.uid}/reschedule`)
        .send(body)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
        .expect(400);

      expect(response.body.error.message).toEqual(
        `Booking with uid=${createdSeatedBooking.uid} is a seated booking which means you have to provide seatUid in the request body to specify which seat specifically you want to reschedule. First, fetch the booking using the GET /v2/bookings/{uid} endpoint and then within the attendees array you will find the seatUid of the booking you want to reschedule. Second, provide the seatUid in the request body to specify which seat specifically you want to reschedule using the POST /v2/bookings/{uid}/reschedule endpoint.`
      );
    });

    it("should reschedule seated booking", async () => {
      const body: RescheduleSeatedBookingInput_2024_08_13 = {
        start: new Date(Date.UTC(2030, 0, 8, 15, 0, 0)).toISOString(),
        seatUid: createdSeatedBooking.seatUid,
      };

      return request(app.getHttpServer())
        .post(`/v2/bookings/${createdSeatedBooking.uid}/reschedule`)
        .send(body)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
        .expect(201)
        .then(async (response) => {
          const responseBody: RescheduleBookingOutput_2024_08_13 = response.body;
          expect(responseBody.status).toEqual(SUCCESS_STATUS);
          expect(responseBody.data).toBeDefined();
          expect(responseDataIsGetSeatedBooking(responseBody.data)).toBe(true);

          if (responseDataIsGetSeatedBooking(responseBody.data)) {
            const data: CreateSeatedBookingOutput_2024_08_13 = responseBody.data;
            expect(data.seatUid).toBeDefined();
            const seatUid = data.seatUid;
            expect(data.id).toBeDefined();
            expect(data.uid).toBeDefined();
            expect(data.hosts[0].id).toEqual(user.id);
            expect(data.status).toEqual("accepted");
            expect(data.start).toEqual(body.start);
            expect(data.end).toEqual(
              DateTime.fromISO(body.start, { zone: "utc" }).plus({ hours: 1 }).toISO()
            );
            expect(data.duration).toEqual(60);
            expect(data.eventTypeId).toEqual(seatedEventTypeId);
            expect(data.eventType).toEqual({
              id: seatedEventTypeId,
              slug: seatedEventSlug,
            });
            expect(data.attendees.length).toEqual(1);
            const attendee = createdSeatedBooking.attendees.find((a) => a.seatUid === body.seatUid);
            expect(data.attendees[0]).toEqual({
              name: attendee?.name,
              email: attendee?.email,
              displayEmail: attendee?.displayEmail,
              timeZone: attendee?.timeZone,
              language: attendee?.language,
              absent: false,
              seatUid,
              bookingFieldsResponses: {
                name: attendee?.name,
                ...attendee?.bookingFieldsResponses,
              },
              metadata: attendee?.metadata,
              createdAt: expect.any(String)
            });
            expect(data.location).toBeDefined();
            expect(data.absentHost).toEqual(false);
            expect(data.attendees[0].createdAt).toBeDefined();
            createdSeatedBooking = data;
          } else {
            throw new Error("Invalid response data - expected booking but received array response");
          }
        });
    });

    it("should return valid seatUid for subsequent reschedules", async () => {
      const createBody: CreateBookingInput_2024_08_13 = {
        start: new Date(Date.UTC(2030, 0, 10, 10, 0, 0)).toISOString(),
        eventTypeId: seatedEventTypeId,
        attendee: {
          name: `Reschedule Test ${randomString()}`,
          email: `reschedule-test-${randomString()}@api.com`,
          timeZone: "Europe/Rome",
          language: "it",
        },
        bookingFieldsResponses: {
          codingLanguage: "Go",
        },
        metadata: {
          userId: "300",
        },
      };

      const createResponse = await request(app.getHttpServer())
        .post("/v2/bookings")
        .send(createBody)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
        .expect(201);

      const createData: CreateBookingOutput_2024_08_13 = createResponse.body;
      expect(createData.status).toEqual(SUCCESS_STATUS);
      expect(responseDataIsCreateSeatedBooking(createData.data)).toBe(true);

      if (!responseDataIsCreateSeatedBooking(createData.data)) {
        throw new Error("Invalid response data - expected seated booking");
      }

      let testBooking: CreateSeatedBookingOutput_2024_08_13 = createData.data;
      expect(testBooking.seatUid).toBeDefined();
      expect(testBooking.attendees[0].seatUid).toBeDefined();

      const firstRescheduleBody: RescheduleSeatedBookingInput_2024_08_13 = {
        start: new Date(Date.UTC(2030, 0, 10, 11, 0, 0)).toISOString(),
        seatUid: testBooking.attendees[0].seatUid,
      };

      const firstRescheduleResponse = await request(app.getHttpServer())
        .post(`/v2/bookings/${testBooking.uid}/reschedule`)
        .send(firstRescheduleBody)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
        .expect(201);

      const firstRescheduleData: RescheduleBookingOutput_2024_08_13 = firstRescheduleResponse.body;
      expect(firstRescheduleData.status).toEqual(SUCCESS_STATUS);
      expect(responseDataIsGetSeatedBooking(firstRescheduleData.data)).toBe(true);

      if (!responseDataIsGetSeatedBooking(firstRescheduleData.data)) {
        throw new Error("Invalid response data - expected seated booking");
      }

      testBooking = firstRescheduleData.data;
      expect(testBooking.seatUid).toBeDefined();
      expect(testBooking.attendees[0].seatUid).toBeDefined();

      const secondRescheduleBody: RescheduleSeatedBookingInput_2024_08_13 = {
        start: new Date(Date.UTC(2030, 0, 10, 12, 0, 0)).toISOString(),
        seatUid: testBooking.attendees[0].seatUid,
      };

      const secondRescheduleResponse = await request(app.getHttpServer())
        .post(`/v2/bookings/${testBooking.uid}/reschedule`)
        .send(secondRescheduleBody)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
        .expect(201);

      const secondRescheduleData: RescheduleBookingOutput_2024_08_13 = secondRescheduleResponse.body;
      expect(secondRescheduleData.status).toEqual(SUCCESS_STATUS);
      expect(responseDataIsGetSeatedBooking(secondRescheduleData.data)).toBe(true);

      if (!responseDataIsGetSeatedBooking(secondRescheduleData.data)) {
        throw new Error("Invalid response data - expected seated booking");
      }

      testBooking = secondRescheduleData.data;
      expect(testBooking.seatUid).toBeDefined();
      expect(testBooking.attendees[0].seatUid).toBeDefined();

      const thirdRescheduleBody: RescheduleSeatedBookingInput_2024_08_13 = {
        start: new Date(Date.UTC(2030, 0, 10, 13, 0, 0)).toISOString(),
        seatUid: testBooking.attendees[0].seatUid,
      };

      const thirdRescheduleResponse = await request(app.getHttpServer())
        .post(`/v2/bookings/${testBooking.uid}/reschedule`)
        .send(thirdRescheduleBody)
        .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
        .expect(201);

      const thirdRescheduleData: RescheduleBookingOutput_2024_08_13 = thirdRescheduleResponse.body;
      expect(thirdRescheduleData.status).toEqual(SUCCESS_STATUS);
      expect(responseDataIsGetSeatedBooking(thirdRescheduleData.data)).toBe(true);

      if (!responseDataIsGetSeatedBooking(thirdRescheduleData.data)) {
        throw new Error("Invalid response data - expected seated booking");
      }

      expect(thirdRescheduleData.data.seatUid).toBeDefined();
      expect(thirdRescheduleData.data.attendees[0].seatUid).toBeDefined();
    });

    describe("book an event type with attendees disabled but auth provided", () => {
      let booking: CreateSeatedBookingOutput_2024_08_13;
      it("should book an event type with attendees disabled and no auth provided", async () => {
        const body: CreateBookingInput_2024_08_13 = {
          start: new Date(Date.UTC(2030, 0, 9, 14, 0, 0)).toISOString(),
          eventTypeId: seatedEventTypeIdAttendeesDisabledId,
          attendee: {
            name: nameAttendeeOne,
            email: emailAttendeeOne,
            timeZone: "Europe/Rome",
            language: "it",
          },
          bookingFieldsResponses: {
            codingLanguage: "TypeScript",
          },
          metadata: {
            userId: "100",
          },
        };

        return request(app.getHttpServer())
          .post("/v2/bookings")
          .send(body)
          .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
          .expect(201)
          .then(async (response) => {
            const responseBody: CreateBookingOutput_2024_08_13 = response.body;
            expect(responseBody.status).toEqual(SUCCESS_STATUS);
            expect(responseBody.data).toBeDefined();
            expect(responseDataIsCreateSeatedBooking(responseBody.data)).toBe(true);

            if (responseDataIsCreateSeatedBooking(responseBody.data)) {
              const data: CreateSeatedBookingOutput_2024_08_13 = responseBody.data;
              expect(data.seatUid).toBeDefined();
              expect(data.id).toBeDefined();
              expect(data.uid).toBeDefined();
              expect(data.hosts[0].id).toEqual(user.id);
              expect(data.status).toEqual("accepted");
              expect(data.start).toEqual(body.start);
              expect(data.end).toEqual(
                DateTime.fromISO(body.start, { zone: "utc" }).plus({ hours: 1 }).toISO()
              );
              expect(data.duration).toEqual(60);
              expect(data.eventTypeId).toEqual(seatedEventTypeIdAttendeesDisabledId);
              expect(data.eventType).toEqual({
                id: seatedEventTypeIdAttendeesDisabledId,
                slug: seatedEventSlugAttendeesDisabled,
              });
              expect(data.attendees.length).toEqual(0);
              expect(data.location).toBeDefined();
              expect(data.absentHost).toEqual(false);
              booking = data;
            } else {
              throw new Error(
                "Invalid response data - expected seated booking but received non array response"
              );
            }
          });
      });

      it("should fetch booking and not have attendees because no auth provided", async () => {
        return request(app.getHttpServer())
          .get(`/v2/bookings/${booking.uid}`)
          .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
          .expect(200)
          .then(async (response) => {
            const responseBody: GetBookingOutput_2024_08_13 = response.body;
            expect(responseBody.status).toEqual(SUCCESS_STATUS);
            expect(responseBody.data).toBeDefined();
            expect(responseDataIsGetSeatedBooking(responseBody.data)).toBe(true);

            if (responseDataIsGetSeatedBooking(responseBody.data)) {
              const data: GetSeatedBookingOutput_2024_08_13 = responseBody.data;
              expect(data.id).toBeDefined();
              expect(data.uid).toBeDefined();
              expect(data.hosts.length).toEqual(1);
              expect(data.hosts[0].id).toEqual(user.id);
              expect(data.status).toEqual("accepted");
              expect(data.start).toEqual(booking.start);
              expect(data.end).toEqual(booking.end);
              expect(data.duration).toEqual(60);
              expect(data.eventTypeId).toEqual(seatedEventTypeIdAttendeesDisabledId);
              expect(data.eventType).toEqual({
                id: seatedEventTypeIdAttendeesDisabledId,
                slug: seatedEventSlugAttendeesDisabled,
              });
              expect(data.attendees.length).toEqual(0);
              expect(data.location).toBeDefined();
              expect(data.absentHost).toEqual(false);
              await bookingsRepositoryFixture.deleteById(data.id);
            } else {
              throw new Error("Invalid response data - expected booking but received array response");
            }
          });
      });
    });

    describe("book an event type with attendees disabled but auth provided", () => {
      let booking: CreateSeatedBookingOutput_2024_08_13;

      it("should book an event type with attendees disabled and owner auth provided", async () => {
        const body: CreateBookingInput_2024_08_13 = {
          start: new Date(Date.UTC(2030, 0, 9, 14, 0, 0)).toISOString(),
          eventTypeId: seatedEventTypeIdAttendeesDisabledId,
          attendee: {
            name: nameAttendeeOne,
            email: emailAttendeeOne,
            timeZone: "Europe/Rome",
            language: "it",
          },
          bookingFieldsResponses: {
            codingLanguage: "TypeScript",
          },
          metadata: {
            userId: "100",
          },
        };

        return request(app.getHttpServer())
          .post("/v2/bookings")
          .send(body)
          .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
          .set("Authorization", apiKeyString)
          .expect(201)
          .then(async (response) => {
            const responseBody: CreateBookingOutput_2024_08_13 = response.body;
            expect(responseBody.status).toEqual(SUCCESS_STATUS);
            expect(responseBody.data).toBeDefined();
            expect(responseDataIsCreateSeatedBooking(responseBody.data)).toBe(true);

            if (responseDataIsCreateSeatedBooking(responseBody.data)) {
              const data: CreateSeatedBookingOutput_2024_08_13 = responseBody.data;
              expect(data.seatUid).toBeDefined();
              expect(data.id).toBeDefined();
              expect(data.uid).toBeDefined();
              expect(data.hosts[0].id).toEqual(user.id);
              expect(data.status).toEqual("accepted");
              expect(data.start).toEqual(body.start);
              expect(data.end).toEqual(
                DateTime.fromISO(body.start, { zone: "utc" }).plus({ hours: 1 }).toISO()
              );
              expect(data.duration).toEqual(60);
              expect(data.eventTypeId).toEqual(seatedEventTypeIdAttendeesDisabledId);
              expect(data.eventType).toEqual({
                id: seatedEventTypeIdAttendeesDisabledId,
                slug: seatedEventSlugAttendeesDisabled,
              });
              expect(data.attendees.length).toEqual(1);
              expect(data.attendees[0].email).toEqual(emailAttendeeOne);
              expect(data.attendees[0].name).toEqual(nameAttendeeOne);
              expect(data.attendees[0].language).toEqual("it");
              expect(data.attendees[0].seatUid).toBeDefined();
              expect(data.attendees[0].createdAt).toBeDefined();
              expect(data.location).toBeDefined();
              expect(data.absentHost).toEqual(false);
              booking = data;
            } else {
              throw new Error(
                "Invalid response data - expected seated booking but received non array response"
              );
            }
          });
      });

      it("should fetch booking and have attendees", async () => {
        return request(app.getHttpServer())
          .get(`/v2/bookings/${booking.uid}`)
          .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
          .set("Authorization", apiKeyString)
          .expect(200)
          .then(async (response) => {
            const responseBody: GetBookingOutput_2024_08_13 = response.body;
            expect(responseBody.status).toEqual(SUCCESS_STATUS);
            expect(responseBody.data).toBeDefined();
            expect(responseDataIsGetSeatedBooking(responseBody.data)).toBe(true);

            if (responseDataIsGetSeatedBooking(responseBody.data)) {
              const data: GetSeatedBookingOutput_2024_08_13 = responseBody.data;
              expect(data.id).toBeDefined();
              expect(data.uid).toBeDefined();
              expect(data.hosts.length).toEqual(1);
              expect(data.hosts[0].id).toEqual(user.id);
              expect(data.status).toEqual("accepted");
              expect(data.start).toEqual(booking.start);
              expect(data.end).toEqual(booking.end);
              expect(data.duration).toEqual(60);
              expect(data.eventTypeId).toEqual(seatedEventTypeIdAttendeesDisabledId);
              expect(data.eventType).toEqual({
                id: seatedEventTypeIdAttendeesDisabledId,
                slug: seatedEventSlugAttendeesDisabled,
              });
              expect(data.attendees.length).toEqual(1);
              expect(data.attendees[0].email).toEqual(emailAttendeeOne);
              expect(data.attendees[0].name).toEqual(nameAttendeeOne);
              expect(data.attendees[0].language).toEqual("it");
              expect(data.attendees[0].seatUid).toBeDefined();
              expect(data.attendees[0].createdAt).toBeDefined();
              expect(data.location).toBeDefined();
              expect(data.absentHost).toEqual(false);
              await bookingsRepositoryFixture.deleteById(data.id);
            } else {
              throw new Error("Invalid response data - expected booking but received array response");
            }
          });
      });
    });

    describe("cancel seated booking", () => {
      describe("cancel seated booking as attendee", () => {
        it("should cancel seated booking", async () => {
          const body: CancelSeatedBookingInput_2024_08_13 = {
            seatUid: createdSeatedBooking.seatUid,
          };

          return request(app.getHttpServer())
            .post(`/v2/bookings/${createdSeatedBooking.uid}/cancel`)
            .send(body)
            .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
            .expect(200)
            .then(async (response) => {
              const responseBody: RescheduleBookingOutput_2024_08_13 = response.body;
              expect(responseBody.status).toEqual(SUCCESS_STATUS);
              expect(responseBody.data).toBeDefined();
              expect(responseDataIsGetSeatedBooking(responseBody.data)).toBe(true);

              if (responseDataIsGetSeatedBooking(responseBody.data)) {
                const data: GetSeatedBookingOutput_2024_08_13 = responseBody.data;
                expect(data.id).toBeDefined();
                expect(data.uid).toBeDefined();
                expect(data.hosts[0].id).toEqual(user.id);
                expect(data.status).toEqual("cancelled");
                expect(data.start).toEqual(createdSeatedBooking.start);
                expect(data.end).toEqual(createdSeatedBooking.end);
                expect(data.duration).toEqual(60);
                expect(data.eventTypeId).toEqual(seatedEventTypeId);
                expect(data.eventType).toEqual({
                  id: seatedEventTypeId,
                  slug: seatedEventSlug,
                });
                expect(data.attendees.length).toEqual(0);
                expect(data.location).toBeDefined();
                expect(data.absentHost).toEqual(false);
              } else {
                throw new Error("Invalid response data - expected booking but received array response");
              }
            });
        });
      });

      describe("cancel seated booking as host", () => {
        it("should book an event type with seats", async () => {
          const body: CreateBookingInput_2024_08_13 = {
            start: new Date(Date.UTC(2030, 0, 8, 14, 0, 0)).toISOString(),
            eventTypeId: seatedEventTypeId,
            attendee: {
              name: nameAttendeeOne,
              email: emailAttendeeOne,
              timeZone: "Europe/Rome",
              language: "it",
            },
            bookingFieldsResponses: {
              codingLanguage: "TypeScript",
            },
            metadata: {
              userId: "100",
            },
          };

          return request(app.getHttpServer())
            .post("/v2/bookings")
            .send(body)
            .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
            .expect(201)
            .then(async (response) => {
              const responseBody: CreateBookingOutput_2024_08_13 = response.body;
              expect(responseBody.status).toEqual(SUCCESS_STATUS);
              expect(responseBody.data).toBeDefined();
              expect(responseDataIsCreateSeatedBooking(responseBody.data)).toBe(true);

              if (responseDataIsCreateSeatedBooking(responseBody.data)) {
                const data: CreateSeatedBookingOutput_2024_08_13 = responseBody.data;
                expect(data.seatUid).toBeDefined();
                const seatUid = data.seatUid;
                expect(data.id).toBeDefined();
                expect(data.uid).toBeDefined();
                expect(data.hosts[0].id).toEqual(user.id);
                expect(data.status).toEqual("accepted");
                expect(data.start).toEqual(body.start);
                expect(data.end).toEqual(
                  DateTime.fromISO(body.start, { zone: "utc" }).plus({ hours: 1 }).toISO()
                );
                expect(data.duration).toEqual(60);
                expect(data.eventTypeId).toEqual(seatedEventTypeId);
                expect(data.eventType).toEqual({
                  id: seatedEventTypeId,
                  slug: seatedEventSlug,
                });
                expect(data.attendees.length).toEqual(1);
                expect(data.attendees[0]).toEqual({
                  name: body.attendee.name,
                  email: body.attendee.email,
                  displayEmail: body.attendee.email,
                  timeZone: body.attendee.timeZone,
                  language: body.attendee.language,
                  absent: false,
                  seatUid,
                  bookingFieldsResponses: {
                    guests: [],
                    name: body.attendee.name,
                    ...body.bookingFieldsResponses,
                  },
                  metadata: body.metadata,
                  createdAt: expect.any(String)
                });
                expect(data.location).toBeDefined();
                expect(data.absentHost).toEqual(false);
                expect(data.attendees[0].createdAt).toBeDefined()
                createdSeatedBooking2 = data;
              } else {
                throw new Error(
                  "Invalid response data - expected recurring booking but received non array response"
                );
              }
            });
        });

        it("should not be able to cancel without cancellation reason", async () => {
          const response = await request(app.getHttpServer())
            .post(`/v2/bookings/${createdSeatedBooking2.uid}/cancel`)
            .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
            .set("Authorization", `Bearer ${apiKeyString}`)
            .expect(400);

          expect(response.body.message).toEqual("Cancellation reason is required");
        });

        it("should cancel seated booking", async () => {
          const body: CancelBookingInput_2024_08_13 = {
            cancellationReason: "I will be travelling without internet",
          };

          return request(app.getHttpServer())
            .post(`/v2/bookings/${createdSeatedBooking2.uid}/cancel`)
            .send(body)
            .set(CAL_API_VERSION_HEADER, VERSION_2024_08_13)
            .set("Authorization", `Bearer ${apiKeyString}`)
            .expect(200)
            .then(async (response) => {
              const responseBody: RescheduleBookingOutput_2024_08_13 = response.body;
              expect(responseBody.status).toEqual(SUCCESS_STATUS);
              expect(responseBody.data).toBeDefined();
              expect(responseDataIsGetSeatedBooking(responseBody.data)).toBe(true);

              if (responseDataIsGetSeatedBooking(responseBody.data)) {
                const data: GetSeatedBookingOutput_2024_08_13 = responseBody.data;
                expect(data.id).toBeDefined();
                expect(data.uid).toBeDefined();
                expect(data.hosts[0].id).toEqual(user.id);
                expect(data.status).toEqual("cancelled");
                expect(data.start).toEqual(createdSeatedBooking2.start);
                expect(data.end).toEqual(createdSeatedBooking2.end);
                expect(data.duration).toEqual(60);
                expect(data.eventTypeId).toEqual(seatedEventTypeId);
                expect(data.eventType).toEqual({
                  id: seatedEventTypeId,
                  slug: seatedEventSlug,
                });
                expect(data.attendees.length).toEqual(0);
                expect(data.location).toBeDefined();
                expect(data.absentHost).toEqual(false);
                expect(data.cancellationReason).toEqual("I will be travelling without internet");

                const seats = await bookingSeatRepositoryFixture.findAllByBookingId(data.id);
                expect(seats.length).toEqual(0);
              } else {
                throw new Error("Invalid response data - expected booking but received array response");
              }
            });
        });
      });
    });

    function responseDataIsCreateSeatedBooking(data: any): data is CreateSeatedBookingOutput_2024_08_13 {
      return Object.prototype.hasOwnProperty.call(data, "seatUid");
    }

    function responseDataIsGetSeatedBooking(data: any): data is GetSeatedBookingOutput_2024_08_13 {
      return data?.attendees?.every((attendee: any) =>
        Object.prototype.hasOwnProperty.call(attendee, "seatUid")
      );
    }

    afterAll(async () => {
      await teamRepositoryFixture.delete(organization.id);
      await userRepositoryFixture.deleteByEmail(user.email);
      await bookingsRepositoryFixture.deleteAllBookings(user.id, user.email);
      await app.close();
    });
  });
});
