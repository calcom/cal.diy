type BookingIdentity = {
  uid: string;
  rootBookingUid?: string | null;
};

export function getRootBookingUid(booking: BookingIdentity): string {
  return booking.rootBookingUid || booking.uid;
}
