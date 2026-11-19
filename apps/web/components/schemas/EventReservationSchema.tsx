import type { Attendee, Booking, User } from "@calcom/prisma/client";
import type { FC } from "react";
import { JsonLd } from "react-schemaorg";
import type { EventReservation, Person, ReservationStatusType } from "schema-dts";

type EventSchemaUser = Pick<User, "name" | "email">;
type EventSchemaAttendee = Pick<Attendee, "name" | "email">;

interface EventReservationSchemaInterface {
  reservationId: Booking["uid"];
  eventName: Booking["title"];
  startTime: Booking["startTime"];
  endTime: Booking["endTime"];
  organizer: EventSchemaUser | null;
  attendees: EventSchemaAttendee[];
  location: Booking["location"];
  description: Booking["description"];
  status: Booking["status"];
}

const EventReservationSchema: FC<EventReservationSchemaInterface> = ({
  reservationId,
  eventName,
  startTime,
  endTime,
  organizer,
  attendees,
  location,
  description,
  status,
}) => {
  const reservationStatus: ReservationStatusType = (() => {
    switch (status) {
      case "ACCEPTED":
        return "ReservationConfirmed";
      case "REJECTED":
      case "CANCELLED":
        return "ReservationCancelled";
      case "PENDING":
        return "ReservationPending";
      default:
        return "ReservationHold";
    }
  })();

  return (
    <JsonLd<EventReservation>
      item={{
        "@context": "https://schema.org",
        "@type": "EventReservation",
        reservationId,
        reservationStatus,
        reservationFor: {
          "@type": "Event",
          name: eventName,
          startDate: startTime.toString(),
          endDate: endTime.toString(),
          organizer: organizer
            ? ({ "@type": "Person", name: organizer.name, email: organizer.email } as Person)
            : undefined,
          attendee: attendees?.map(
            (person) => ({ "@type": "Person", name: person.name, email: person.email }) as Person
          ),
          location: location || undefined,
          description: description || undefined,
        },
      }}
    />
  );
};

export default EventReservationSchema;
