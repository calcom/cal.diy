-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE';
