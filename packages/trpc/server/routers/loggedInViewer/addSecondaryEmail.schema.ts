import { z } from "zod";

export type TAddSecondaryEmailInputSchema = {
  email: string;
  makePrimary?: boolean;
  redirectTo?: string;
};

export const ZAddSecondaryEmailInputSchema: z.ZodType<TAddSecondaryEmailInputSchema> = z.object({
  email: z.string().toLowerCase(),
  makePrimary: z.boolean().optional(),
  redirectTo: z.string().optional(),
});
