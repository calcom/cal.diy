/**
 * Resolves app integrations on-demand to prevent Next.js compilation slowness (#23104).
 */
export const getApp = async (slug: string) => {
  return import(`@calcom/app-store/${slug}`);
};

export * from "./appStoreMetaData";
export * from "./server";
