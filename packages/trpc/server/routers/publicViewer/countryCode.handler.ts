import type { CreateInnerContextOptions } from "../../createContext";

type CountryCodeOptions = {
  ctx: CreateInnerContextOptions;
};

export const countryCodeHandler = async ({ ctx }: CountryCodeOptions) => {
  const { req } = ctx;

  const headerCountry =
    req?.headers?.["x-vercel-ip-country"] ??
    req?.headers?.["cf-ipcountry"] ??
    req?.headers?.["cloudfront-viewer-country"] ??
    req?.headers?.["x-country-code"] ??
    "";

  const countryCode = Array.isArray(headerCountry) ? headerCountry[0] : headerCountry;
  return { countryCode: (countryCode || "").toUpperCase() };
};

export default countryCodeHandler;
