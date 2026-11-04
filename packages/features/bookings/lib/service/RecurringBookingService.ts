import type { CreateBookingMeta, CreateRecurringBookingData } from "@calcom/features/bookings/lib/dto/types";
import type { BookingResponse } from "@calcom/features/bookings/types";
import { type CreationSource, SchedulingType } from "@calcom/prisma/enums";
import type { AppsStatus } from "@calcom/types/Calendar";
import type { IBookingService } from "../interfaces/IBookingService";
import type { RegularBookingService } from "./RegularBookingService";
export type BookingHandlerInput = {
  bookingData: CreateRecurringBookingData;
} & CreateBookingMeta;

export const handleNewRecurringBooking = async function (
  this: RecurringBookingService,
  {
    input,
    deps,
    creationSource,
  }: {
    input: BookingHandlerInput;
    deps: IRecurringBookingServiceDependencies;
    creationSource: CreationSource;
  }
): Promise<BookingResponse[]> {
  const data = input.bookingData;
  const { regularBookingService } = deps;
  const createdBookings: BookingResponse[] = [];
  const allRecurringDates: { start: string; end: string | undefined }[] = data.map((booking) => {
    return { start: booking.start, end: booking.end };
  });
  const appsStatus: AppsStatus[] | undefined = undefined;

  const numSlotsToCheckForAvailability = 1;

  let thirdPartyRecurringEventId = null;

  // for round robin, the first slot needs to be handled first to define the lucky user
  const firstBooking = data[0];
  const isRoundRobin = firstBooking.schedulingType === SchedulingType.ROUND_ROBIN;

  let luckyUsers;

  const handleBookingMeta = {
    userId: input.userId,
    platformClientId: input.platformClientId,
    platformRescheduleUrl: input.platformRescheduleUrl,
    platformCancelUrl: input.platformCancelUrl,
    platformBookingUrl: input.platformBookingUrl,
    platformBookingLocation: input.platformBookingLocation,
    areCalendarEventsEnabled: input.areCalendarEventsEnabled,
    skipAvailabilityCheck: input.skipAvailabilityCheck,
  };

  if (isRoundRobin) {
    const recurringEventData = {
      ...firstBooking,
      appsStatus,
      allRecurringDates,
      isFirstRecurringSlot: true,
      thirdPartyRecurringEventId,
      numSlotsToCheckForAvailability,
      currentRecurringIndex: 0,
      noEmail: input.noEmail !== undefined ? input.noEmail : false,
    };

    const firstBookingResult = await regularBookingService.createBooking({
      bookingData: recurringEventData,
      bookingMeta: {
        hostname: input.hostname || "",
        forcedSlug: input.forcedSlug as string | undefined,
        ...handleBookingMeta,
      },
    });
    luckyUsers = firstBookingResult.luckyUsers;
  }

  for (let key = isRoundRobin ? 1 : 0; key < data.length; key++) {
    const booking = data[key];
    // Disable AppStatus in Recurring Booking Email as it requires us to iterate backwards to be able to compute the AppsStatus for all the bookings except the very first slot and then send that slot's email with statuses
    // It is also doubtful that how useful is to have the AppsStatus of all the bookings in the email.
    // It is more important to iterate forward and check for conflicts for only first few bookings defined by 'numSlotsToCheckForAvailability'
    // if (key === 0) {
    //   const calcAppsStatus: { [key: string]: AppsStatus } = createdBookings
    //     .flatMap((book) => (book.appsStatus !== undefined ? book.appsStatus : []))
    //     .reduce((prev, curr) => {
    //       if (prev[curr.type]) {
    //         prev[curr.type].failures += curr.failures;
    //         prev[curr.type].success += curr.success;
    //       } else {
    //         prev[curr.type] = curr;
    //       }
    //       return prev;
    //     }, {} as { [key: string]: AppsStatus });
    //   appsStatus = Object.values(calcAppsStatus);
    // }

    const recurringEventData = {
      ...booking,
      appsStatus,
      allRecurringDates,
      isFirstRecurringSlot: key == 0,
      thirdPartyRecurringEventId,
      numSlotsToCheckForAvailability,
      currentRecurringIndex: key,
      noEmail: input.noEmail !== undefined ? input.noEmail : key !== 0,
      luckyUsers,
    };

    const promiseEachRecurringBooking = regularBookingService.createBooking({
      bookingData: recurringEventData,
      bookingMeta: {
        hostname: input.hostname || "",
        forcedSlug: input.forcedSlug as string | undefined,
        ...handleBookingMeta,
      },
    });

    const eachRecurringBooking = await promiseEachRecurringBooking;

    createdBookings.push(eachRecurringBooking);

    if (!thirdPartyRecurringEventId) {
      if (eachRecurringBooking.references && eachRecurringBooking.references.length > 0) {
        for (const reference of eachRecurringBooking.references) {
          if (reference.thirdPartyRecurringEventId) {
            thirdPartyRecurringEventId = reference.thirdPartyRecurringEventId;
            break;
          }
        }
      }
    }
  }

  return createdBookings;
};

export interface IRecurringBookingServiceDependencies {
  regularBookingService: RegularBookingService;
}

/**
 * Recurring Booking Service takes care of creating/rescheduling recurring bookings.
 */
export class RecurringBookingService implements IBookingService {
  constructor(private readonly deps: IRecurringBookingServiceDependencies) {}

  async createBooking(input: {
    bookingData: CreateRecurringBookingData;
    bookingMeta?: CreateBookingMeta;
    creationSource: CreationSource;
  }): Promise<BookingResponse[]> {
    const handlerInput = {
      bookingData: input.bookingData,
      ...(input.bookingMeta || {}),
    };
    return handleNewRecurringBooking.bind(this)({
      input: handlerInput,
      deps: this.deps,
      creationSource: input.creationSource,
    });
  }

  async rescheduleBooking(input: {
    bookingData: CreateRecurringBookingData;
    bookingMeta?: CreateBookingMeta;
    creationSource: CreationSource;
  }): Promise<BookingResponse[]> {
    const handlerInput = {
      bookingData: input.bookingData,
      ...(input.bookingMeta || {}),
    };
    return handleNewRecurringBooking.bind(this)({
      input: handlerInput,
      deps: this.deps,
      creationSource: input.creationSource,
    });
  }
}
