import { z } from "zod";

export const appDataSchema = z.object({});

export const appKeysSchema = z.object({
  client_id: z.string(),
  client_secret: z.string(),
});
