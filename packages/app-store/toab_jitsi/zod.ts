// Zod runtime validation and inferred types: https://zod.dev/
import { z } from "zod";

type AppData = { userId?: number; serverId?: number; serverUrl?: string };
type AppKeys = {
  moderatorHost?: string;
  auth0Domain?: string;
  auth0Audience?: string;
  auth0TokenUrl?: string;
  auth0ClientId?: string;
  auth0ClientSecret?: string;
};
type SetupResponse = {
  userId: number;
  servers: Array<{ id: number; name: string; serverUrl: string; serverType: "CUSTOM" | "DEFAULT" }>;
};
type LocationResponse = { moderatorLocationEnabled: boolean };

export const appDataSchema: z.ZodType<AppData> = z.object({
  userId: z.number().int().positive().optional(),
  serverId: z.number().int().positive().optional(),
  serverUrl: z.string().min(1).optional(),
});

export const appKeysSchema: z.ZodType<AppKeys> = z.object({
  moderatorHost: z.string().min(1).optional(),
  auth0Domain: z.string().min(1).optional(),
  auth0Audience: z.string().min(1).optional(),
  auth0TokenUrl: z.string().url().optional(),
  auth0ClientId: z.string().min(1).optional(),
  auth0ClientSecret: z.string().min(1).optional(),
});

export const setupResponseSchema: z.ZodType<SetupResponse> = z.object({
  userId: z.number().int().positive(),
  servers: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      serverUrl: z.string(),
      serverType: z.enum(["CUSTOM", "DEFAULT"]),
    })
  ),
});

export const locationResponseSchema: z.ZodType<LocationResponse> = z.object({
  moderatorLocationEnabled: z.boolean(),
});
