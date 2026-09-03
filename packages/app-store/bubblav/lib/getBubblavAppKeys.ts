import getAppKeysFromSlug from "../../_utils/getAppKeysFromSlug";
import { appKeysSchema } from "../zod";

export const getBubblavAppKeys = async () => {
  const appKeys = await getAppKeysFromSlug("bubblav");
  return appKeysSchema.parse(appKeys);
};
