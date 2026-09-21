-- CreateIndex for optimized BookingReference queries with Booking join
-- This composite index supports queries filtering by type, externalCalendarId, and credentialId
-- Used by findByTypeWithBookingStatusAndDateRange in BookingReferenceRepository
CREATE INDEX CONCURRENTLY IF NOT EXISTS "BookingReference_type_externalCalendarId_credentialId_idx" ON "BookingReference"("type", "externalCalendarId", "credentialId") WHERE "externalCalendarId" IS NOT NULL AND "credentialId" IS NOT NULL;
