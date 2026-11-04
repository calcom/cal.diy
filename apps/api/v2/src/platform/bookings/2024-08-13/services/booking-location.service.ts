import type {
  UpdateBookingInputLocation_2024_08_13,
  UpdateBookingLocationInput_2024_08_13,
} from "@calcom/platform-types";
import type { Prisma } from "@calcom/prisma/client";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { BookingsRepository_2024_08_13 } from "@/platform/bookings/2024-08-13/repositories/bookings.repository";
import { BookingLocationCalendarSyncService_2024_08_13 } from "@/platform/bookings/2024-08-13/services/booking-location-calendar-sync.service";
import {
  type BookingForLocationUpdate,
  BookingLocationIntegrationService_2024_08_13,
  type BookingLocationResponse,
} from "@/platform/bookings/2024-08-13/services/booking-location-integration.service";
import { BookingVideoService_2024_08_13 } from "@/platform/bookings/2024-08-13/services/booking-video.service";
import { BookingsService_2024_08_13 } from "@/platform/bookings/2024-08-13/services/bookings.service";
import { InputBookingsService_2024_08_13 } from "@/platform/bookings/2024-08-13/services/input.service";
import { EventTypesRepository_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/event-types.repository";
import type { ApiAuthGuardUser } from "@/modules/auth/strategies/api-auth/api-auth.strategy";
import { EventTypeAccessService } from "@/modules/event-types/services/event-type-access.service";
import { UsersRepository } from "@/modules/users/users.repository";

@Injectable()
export class BookingLocationService_2024_08_13 {
  private readonly logger = new Logger("BookingLocationService_2024_08_13");

  constructor(
    private readonly bookingsRepository: BookingsRepository_2024_08_13,
    private readonly bookingsService: BookingsService_2024_08_13,
    private readonly usersRepository: UsersRepository,
    private readonly inputService: InputBookingsService_2024_08_13,
    private readonly eventTypesRepository: EventTypesRepository_2024_06_14,
    private readonly eventTypeAccessService: EventTypeAccessService,
    private readonly bookingVideoService: BookingVideoService_2024_08_13,
    private readonly integrationService: BookingLocationIntegrationService_2024_08_13,
    private readonly calendarSyncService: BookingLocationCalendarSyncService_2024_08_13
  ) {}

  async updateBookingLocation(
    bookingUid: string,
    input: UpdateBookingLocationInput_2024_08_13,
    user: ApiAuthGuardUser
  ): Promise<BookingLocationResponse> {
    const existingBooking = await this.bookingsRepository.getBookingByUidWithUserAndEventDetails(bookingUid);
    if (!existingBooking) {
      throw new NotFoundException(`Booking with uid=${bookingUid} not found`);
    }

    if (existingBooking.eventTypeId && existingBooking.eventType) {
      const eventType = await this.eventTypesRepository.getEventTypeByIdWithOwnerAndTeam(
        existingBooking.eventTypeId
      );
      if (eventType) {
        const isAllowed = await this.eventTypeAccessService.userIsEventTypeAdminOrOwner(user, eventType);
        if (!isAllowed) {
          throw new ForbiddenException(
            "User is not authorized to update this booking location. User must be the event type owner, host, team admin or owner, or org admin or owner."
          );
        }
      }
    }

    const { location } = input;

    if (location) {
      if (location.type !== "integration") {
        const locationValue = this.getNonIntegrationLocationValue(location);
        if (locationValue) {
          await this.calendarSyncService.syncCalendarEvent(existingBooking.id, locationValue);
        }
      }
      return await this.updateLocation(existingBooking, location, user);
    }

    return this.bookingsService.getBooking(existingBooking.uid, user);
  }

  private async updateLocation(
    existingBooking: BookingForLocationUpdate,
    inputLocation: UpdateBookingInputLocation_2024_08_13,
    user: ApiAuthGuardUser
  ): Promise<BookingLocationResponse> {
    const bookingUid = existingBooking.uid;
    const oldLocation = existingBooking.location;

    if (!existingBooking.userId) {
      throw new NotFoundException(`No user found for booking with uid=${bookingUid}`);
    }

    if (!existingBooking.eventTypeId) {
      throw new NotFoundException(`No event type found for booking with uid=${bookingUid}`);
    }

    const existingBookingHost = await this.usersRepository.findById(existingBooking.userId);

    if (!existingBookingHost) {
      throw new NotFoundException(`No user found for booking with uid=${bookingUid}`);
    }

    if (inputLocation.type === "integration") {
      return this.integrationService.handleIntegrationLocationUpdate(
        existingBooking,
        inputLocation,
        user,
        existingBookingHost
      );
    }

    const bookingLocation = this.getNonIntegrationLocationValue(inputLocation);
    if (!bookingLocation) {
      throw new BadRequestException(`Missing or invalid location value for type: ${inputLocation.type}`);
    }

    const bookingFieldsLocation = this.inputService.transformLocation(inputLocation);

    const responses = (existingBooking.responses || {}) as Record<string, unknown>;
    const { location: _existingLocation, ...rest } = responses;

    const updatedBookingResponses = {
      ...rest,
      location: bookingFieldsLocation,
    };

    const metadataWithoutVideoUrl = this.getMetadataWithoutVideoCallUrl(existingBooking.metadata);

    await this.bookingVideoService.deleteOldVideoMeetingIfNeeded(existingBooking.id);

    const updatedBooking = await this.bookingsRepository.updateBooking(bookingUid, {
      location: bookingLocation,
      responses: updatedBookingResponses,
      metadata: metadataWithoutVideoUrl as Prisma.InputJsonValue,
    });

    if (bookingLocation) {
      await this.sendLocationChangeNotifications(existingBooking.id, existingBooking.uid, bookingLocation);
    }

    return this.bookingsService.getBooking(updatedBooking.uid, user);
  }

  private async sendLocationChangeNotifications(
    bookingId: number,
    bookingUid: string,
    bookingLocation: string
  ): Promise<void> {
    const bookingWithDetails = await this.bookingsRepository.getBookingByIdWithUserAndEventDetails(bookingId);

    if (!bookingWithDetails || !bookingWithDetails.user) {
      this.logger.warn(
        `Unable to send location change notifications: ${!bookingWithDetails ? "booking details" : "user"} not found for bookingId=${bookingId}`
      );
      return;
    }

    const evt = await this.calendarSyncService.buildCalEventFromBookingData(
      bookingWithDetails,
      bookingLocation,
      null
    );
    await this.calendarSyncService.sendLocationChangeNotifications(
      evt,
      bookingUid,
      bookingLocation,
      bookingWithDetails.eventType?.metadata as Record<string, unknown> | undefined
    );
  }

  private getNonIntegrationLocationValue(loc: UpdateBookingInputLocation_2024_08_13): string | undefined {
    if (loc.type === "address") return loc.address;
    if (loc.type === "link") return loc.link;
    if (loc.type === "phone") return loc.phone;
    if (loc.type === "attendeeAddress") return loc.address;
    if (loc.type === "attendeePhone") return loc.phone;
    if (loc.type === "attendeeDefined") return loc.location;

    this.logger.log(
      `Booking location service getNonIntegrationLocationValue - unsupported type: ${loc.type}`
    );

    return undefined;
  }

  // in case of video integrations we need to clear the videoCallUrl from metadata when explicitly setting a new non-integration location
  // in case of video integrations we need to clear the videoCallUrl from metadata
  // this ensures the frontend shows the new location instead of the old integration URL
  private getMetadataWithoutVideoCallUrl(metadata: unknown): Record<string, unknown> {
    const existingMetadata = (metadata || {}) as Record<string, unknown>;
    const { videoCallUrl: _removedVideoUrl, ...metadataWithoutVideoUrl } = existingMetadata;
    return metadataWithoutVideoUrl;
  }
}

