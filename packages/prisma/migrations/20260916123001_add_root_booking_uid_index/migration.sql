DROP INDEX CONCURRENTLY IF EXISTS "Booking_rootBookingUid_idx";
CREATE INDEX CONCURRENTLY "Booking_rootBookingUid_idx" ON "Booking"("rootBookingUid");
