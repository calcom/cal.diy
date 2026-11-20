import { FULL_NAME_LENGTH_MAX_LIMIT } from "@calcom/lib/constants";
import { timeZoneSchema } from "@calcom/lib/dayjs/timeZone.schema";
import { bookerLayouts, userMetadata } from "@calcom/prisma/zod-utils";
import { z } from "zod";

export type TUpdateUserMetadataAllowedKeys = {
  sessionTimeout?: number;
  defaultBookerLayouts?: z.infer<typeof bookerLayouts>;
  defaultHomeView?: "event-types" | "bookings";
};

export const updateUserMetadataAllowedKeys: z.ZodType<TUpdateUserMetadataAllowedKeys> = z.object({
  sessionTimeout: z.number().optional(), // Minutes
  defaultBookerLayouts: bookerLayouts.optional(),
  defaultHomeView: z.enum(["event-types", "bookings"]).optional(),
});

export type TUpdateProfileInputSchemaInput = {
  username?: string;
  name?: string;
  email?: string;
  bio?: string;
  avatarUrl?: string | null;
  timeZone?: string;
  weekStart?: string;
  hideBranding?: boolean;
  allowDynamicBooking?: boolean;
  allowSEOIndexing?: boolean;
  receiveMonthlyDigestEmail?: boolean;
  requiresBookerEmailVerification?: boolean;
  brandColor?: string;
  darkBrandColor?: string;
  theme?: string | null;
  appTheme?: string | null;
  completedOnboarding?: boolean;
  locale?: string;
  timeFormat?: number;
  metadata?: z.infer<typeof userMetadata>;
  travelSchedules?: {
    id?: number;
    timeZone: string;
    endDate?: Date;
    startDate: Date;
  }[];
  secondaryEmails?: {
    id: number;
    email: string;
    isDeleted?: boolean;
  }[];
};

export type TUpdateProfileInputSchema = {
  username?: string;
  name?: string;
  email?: string;
  bio?: string;
  avatarUrl?: string | null;
  timeZone?: string;
  weekStart?: string;
  hideBranding?: boolean;
  allowDynamicBooking?: boolean;
  allowSEOIndexing?: boolean;
  receiveMonthlyDigestEmail?: boolean;
  requiresBookerEmailVerification?: boolean;
  brandColor?: string;
  darkBrandColor?: string;
  theme?: string | null;
  appTheme?: string | null;
  completedOnboarding?: boolean;
  locale?: string;
  timeFormat?: number;
  metadata?: z.infer<typeof userMetadata>;
  travelSchedules?: {
    id?: number;
    timeZone: string;
    endDate?: Date;
    startDate: Date;
  }[];
  secondaryEmails?: {
    id: number;
    email: string;
    isDeleted: boolean;
  }[];
};

export const ZUpdateProfileInputSchema: z.ZodType<
  TUpdateProfileInputSchema,
  z.ZodTypeDef,
  TUpdateProfileInputSchemaInput
> = z.object({
  username: z.string().optional(),
  name: z.string().max(FULL_NAME_LENGTH_MAX_LIMIT).optional(),
  email: z.string().optional(),
  bio: z.string().optional(),
  avatarUrl: z.string().nullable().optional(),
  timeZone: timeZoneSchema.optional(),
  weekStart: z.string().optional(),
  hideBranding: z.boolean().optional(),
  allowDynamicBooking: z.boolean().optional(),
  allowSEOIndexing: z.boolean().optional(),
  receiveMonthlyDigestEmail: z.boolean().optional(),
  requiresBookerEmailVerification: z.boolean().optional(),
  brandColor: z.string().optional(),
  darkBrandColor: z.string().optional(),
  theme: z.string().optional().nullable(),
  appTheme: z.string().optional().nullable(),
  completedOnboarding: z.boolean().optional(),
  locale: z.string().optional(),
  timeFormat: z.number().optional(),
  metadata: userMetadata.optional(),
  travelSchedules: z
    .array(
      z.object({
        id: z.number().optional(),
        timeZone: timeZoneSchema,
        endDate: z.date().optional(),
        startDate: z.date(),
      })
    )
    .optional(),
  secondaryEmails: z
    .array(
      z.object({
        id: z.number(),
        email: z.string(),
        isDeleted: z.boolean().default(false),
      })
    )
    .optional(),
});
