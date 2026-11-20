export const isENVProd = process.env.NODE_ENV === "production";
export const isENVDev = process.env.NODE_ENV === "development";
export const isENVE2E = !!process.env.NEXT_PUBLIC_IS_E2E;
