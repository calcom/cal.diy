-- Without a default, creating a user directly (e.g. in Prisma Studio) fails when metadata is left empty.
ALTER TABLE "public"."users" ALTER COLUMN "metadata" SET DEFAULT '{}';
