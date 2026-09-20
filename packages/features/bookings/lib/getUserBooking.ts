import prisma from "@calcom/prisma";

const getUserBooking = async (uid: string) => {
  const bookingInfo = await prisma.booking.findUnique({
    where: {
      uid: uid,
    },
    select: {
      title: true,
      id: true,
      uid: true,
      description: true,
      customInputs: true,
      smsReminderNumber: true,
      recurringEventId: true,
      startTime: true,
      endTime: true,
      location: true,
      status: true,
      metadata: true,
      cancellationReason: true,
      cancelledBy: true,
      responses: true,
      rejectionReason: true,
      userPrimaryEmail: true,
      fromReschedule: true,
      rootBookingUid: true,
      rescheduled: true,
      rescheduledBy: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          timeZone: true,
          avatarUrl: true,
        },
      },
      attendees: {
        select: {
          name: true,
          email: true,
          timeZone: true,
          phoneNumber: true,
        },
        orderBy: {
          id: "asc",
        },
      },
      eventTypeId: true,
      eventType: {
        select: {
          eventName: true,
          slug: true,
          timeZone: true,
          schedulingType: true,
          hideOrganizerEmail: true,
        },
      },
      seatsReferences: {
        select: {
          referenceUid: true,
        },
      },
      tracking: {
        select: {
          utm_source: true,
          utm_medium: true,
          utm_campaign: true,
          utm_term: true,
          utm_content: true,
        },
      },
      assignmentReason: {
        select: {
          reasonEnum: true,
          reasonString: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
  });

  return bookingInfo;
};

export default getUserBooking;
