import type { z } from "zod";

import getAppKeysFromSlug from "../../_utils/getAppKeysFromSlug";
import config from "../config.json";
import { appKeysSchema as kyzonSpaceAppKeysSchema } from "../zod";

type KyzonSpaceAppKeys = z.infer<typeof kyzonSpaceAppKeysSchema>;

export const getKyzonAppKeys = async (): Promise<KyzonSpaceAppKeys> => {
  const appKeys = await getAppKeysFromSlug(config.slug);
  return kyzonSpaceAppKeysSchema.parse(appKeys);
};
