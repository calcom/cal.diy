import type { Host } from "@calcom/features/bookings/lib/getHostsAndGuests";
import { AttendeeRepository } from "@calcom/features/bookings/repositories/AttendeeRepository";
import { prisma } from "@calcom/prisma";
import { WebhookTriggerEvents } from "@calcom/prisma/enums";
import {
  calculateMaxStartTime,
  log,
  prepareNoShowTrigger,
  sendWebhookPayload,
} from "./common";

type UpdatedAttendee = {
  id: number;
  email: string;
  name: string;
  locale: string | null;
  timeZone: string;
  phoneNumber: string | null;
  bookingId: number | null;
  noShow: boolean | null;
  createdAt: Date | null;
};

const markGuestAsNoshowInBooking = async ({
  bookingId,
  hostsThatJoinedTheCall,
  guestsThatDidntJoinTheCall,
}: {
  bookingId: number;
  hostsThatJoinedTheCall: Host[];
  guestsThatDidntJoinTheCall?: { email: string; name: string }[];
}): Promise<{
  updatedAttendees: UpdatedAttendee[] | null;
}> => {
  const attendeeRepository = new AttendeeRepository(prisma);

  try {
    if (guestsThatDidntJoinTheCall && guestsThatDidntJoinTheCall.length > 0) {
      const emailsToUpdate = guestsThatDidntJoinTheCall.map((g) => g.email);
      await attendeeRepository.updateManyNoShowByBookingIdAndEmails({
        where: { bookingId, emails: emailsToUpdate },
        data: { noShow: true },
      });
    } else {
      const hostsThatJoinedTheCallEmails = hostsThatJoinedTheCall.map((h) => h.email);
      await attendeeRepository.updateManyNoShowByBookingIdExcludingEmails({
        where: { bookingId, excludeEmails: hostsThatJoinedTheCallEmails },
        data: { noShow: true },
      });
    }

    const updatedAttendees = await attendeeRepository.findByBookingId(bookingId);

    return { updatedAttendees };
  } catch (err) {
    log.error("Error marking guests as no show in booking", err);
    return { updatedAttendees: null };
  }
};

export async function triggerGuestNoShow(payload: string): Promise<void> {
  const result = await prepareNoShowTrigger(payload);
  if (!result) return;
  const {
    webhook,
    booking,
    hosts,
    hostsThatJoinedTheCall,
    didGuestJoinTheCall,
    guestsThatDidntJoinTheCall,
    originalRescheduledBooking,
    participants,
  } = result;

  const hostEmails = new Set(hosts.map((h) => h.email));

  const maxStartTime = calculateMaxStartTime(booking.startTime, webhook.time, webhook.timeUnit);

  const requireEmailForGuests = booking.eventType?.calVideoSettings?.requireEmailForGuests ?? false;

  if (requireEmailForGuests) {
    if (guestsThatDidntJoinTheCall.length > 0) {
      const { updatedAttendees } = await markGuestAsNoshowInBooking({
        bookingId: booking.id,
        hostsThatJoinedTheCall,
        guestsThatDidntJoinTheCall,
      });

      const guests = updatedAttendees?.filter((a) => !hostEmails.has(a.email)) ?? [];
      const bookingWithUpdatedData = updatedAttendees
        ? { ...booking, attendees: updatedAttendees, guests }
        : booking;

      await sendWebhookPayload(
        webhook,
        WebhookTriggerEvents.AFTER_GUESTS_CAL_VIDEO_NO_SHOW,
        bookingWithUpdatedData,
        maxStartTime,
        participants,
        originalRescheduledBooking
      );
    }
  } else {
    if (!didGuestJoinTheCall) {
      const { updatedAttendees } = await markGuestAsNoshowInBooking({
        bookingId: booking.id,
        hostsThatJoinedTheCall,
      });

      const guests = updatedAttendees?.filter((a) => !hostEmails.has(a.email)) ?? [];

      const bookingWithUpdatedData = updatedAttendees
        ? { ...booking, attendees: updatedAttendees, guests }
        : booking;

      await sendWebhookPayload(
        webhook,
        WebhookTriggerEvents.AFTER_GUESTS_CAL_VIDEO_NO_SHOW,
        bookingWithUpdatedData,
        maxStartTime,
        participants,
        originalRescheduledBooking
      );
    }
  }
}
