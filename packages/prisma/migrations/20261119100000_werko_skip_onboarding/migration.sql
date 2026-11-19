-- Werk|0: nobody goes through Cal's onboarding (clients book right away, admins are set up by devx)
ALTER TABLE "users" ALTER COLUMN "completedOnboarding" SET DEFAULT true;

UPDATE "users" SET "completedOnboarding" = true WHERE "completedOnboarding" = false;
