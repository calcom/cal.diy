import { z } from "zod";
import { CATEGORY_IDS } from "./types";

const isoInstant = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");

export const BlockInput = z
  .object({
    title: z.string().trim().max(120).default(""),
    category: z.enum(CATEGORY_IDS),
    start: isoInstant,
    end: isoInstant,
    notes: z.string().max(2000).optional(),
    location: z.string().max(200).optional(),
    seriesId: z.string().max(64).optional(),
  })
  .refine((b) => Date.parse(b.end) > Date.parse(b.start), "End must be after start");

export const BlockBatchInput = z.object({ blocks: z.array(BlockInput).min(1).max(200) });

export const BlockPatch = z
  .object({
    title: z.string().trim().max(120),
    category: z.enum(CATEGORY_IDS),
    start: isoInstant,
    end: isoInstant,
    notes: z.string().max(2000),
    location: z.string().max(200),
  })
  .partial();

export const BookingInput = z.object({
  start: isoInstant,
  end: isoInstant,
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Enter a valid email"),
  topic: z.string().trim().min(1, "Tell them what the call is about").max(140),
  notes: z.string().trim().max(2000).optional(),
});

export const TaskInput = z.object({
  title: z.string().trim().min(1).max(200),
  due: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const TaskPatch = z
  .object({
    title: z.string().trim().min(1).max(200),
    due: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    notes: z.string().max(2000).nullable(),
    done: z.boolean(),
  })
  .partial();

export const BrainDumpInput = z.object({
  text: z.string().trim().min(3).max(4000),
  now: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  weekday: z.string().max(20),
  timezone: z.string().max(64),
  busy: z
    .array(
      z.object({
        title: z.string().max(120),
        category: z.string().max(20),
        start: z.string(),
        end: z.string(),
      })
    )
    .max(300),
});

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request";
}
