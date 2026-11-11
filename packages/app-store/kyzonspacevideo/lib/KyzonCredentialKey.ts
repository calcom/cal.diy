import { z } from "zod";

export const kyzonCredentialKeySchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  token_type: z
    .string()
    .regex(/^bearer$/i)
    .transform(() => "Bearer" as const)
    .optional(),
  scope: z.string().optional(),
  /* store ms since epoch, > now */
  expiry_date: z.number().int().positive(),
  user_id: z
    .union([z.string(), z.number()])
    .transform((val) => String(val))
    .pipe(z.string().min(1)),
  team_id: z
    .union([z.string(), z.number()])
    .transform((val) => String(val))
    .pipe(z.string().min(1)),
});

export type KyzonCredentialKey = z.infer<typeof kyzonCredentialKeySchema>;

export function getKyzonCredentialKey(payload: {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
  user_id: string;
  team_id: string;
}): KyzonCredentialKey {
  const { expires_in, ...rest } = payload;
  const skewMs = 60_000; // refresh 1 min early
  const ms = Math.max(5_000, expires_in * 1000 - skewMs); // clamp to ≥5 s
  const candidate = {
    ...rest,
    expiry_date: Date.now() + ms,
  };
  // Ensure shape is valid at runtime
  return kyzonCredentialKeySchema.parse(candidate);
}
