import { z } from "zod";

export const listUsersSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.number().int().positive().nullable().default(null),
    searchTerm: z.string().trim().max(100).nullish(),
  })
  .default({});
