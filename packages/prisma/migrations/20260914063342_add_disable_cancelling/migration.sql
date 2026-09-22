/*
  Warnings:

  - The `disableCancelling` column on the `EventType` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "public"."DisableCancelling" AS ENUM ('GUESTS', 'BOTH_HOST_GUESTS', 'NOBODY');

-- AlterTable
ALTER TABLE "public"."EventType"
  ALTER COLUMN "disableCancelling" DROP DEFAULT,
  ALTER COLUMN "disableCancelling" TYPE "public"."DisableCancelling"
    USING CASE
      WHEN "disableCancelling" THEN 'BOTH_HOST_GUESTS'::"public"."DisableCancelling"
      ELSE 'NOBODY'::"public"."DisableCancelling"
    END,
  ALTER COLUMN "disableCancelling" SET DEFAULT 'NOBODY';
