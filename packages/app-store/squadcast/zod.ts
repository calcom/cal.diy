import { z } from "zod";

export const appKeysSchema = z.object({
  api_token: z.string().min(1),
});

export const appDataSchema = z.object({});
