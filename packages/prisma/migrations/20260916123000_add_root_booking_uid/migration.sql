-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "rootBookingUid" TEXT;

-- Backfill originals and every booking in a reschedule chain.
WITH RECURSIVE booking_roots AS (
  SELECT
    "uid",
    "uid" AS "rootBookingUid"
  FROM "Booking"
  WHERE "fromReschedule" IS NULL

  UNION ALL

  SELECT
    child."uid",
    parent."rootBookingUid"
  FROM "Booking" child
  INNER JOIN booking_roots parent ON child."fromReschedule" = parent."uid"
)
UPDATE "Booking" AS b
SET "rootBookingUid" = br."rootBookingUid"
FROM booking_roots br
WHERE b."uid" = br."uid";

-- Bookings whose previous uid was deleted never joined the recursive walk.
UPDATE "Booking"
SET "rootBookingUid" = COALESCE("fromReschedule", "uid")
WHERE "rootBookingUid" IS NULL;
