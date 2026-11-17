import getAppKeysFromSlug from "../../_utils/getAppKeysFromSlug";

export const getBubblavAppKeys = async () => {
  const appKeys = await getAppKeysFromSlug("bubblav");
  return appKeys;
};
