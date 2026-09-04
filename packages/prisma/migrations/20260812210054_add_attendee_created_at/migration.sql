-- AlterTable
ALTER TABLE "public"."Attendee" ADD COLUMN "createdAt" TIMESTAMP(3);
ALTER TABLE "public"."Attendee" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
