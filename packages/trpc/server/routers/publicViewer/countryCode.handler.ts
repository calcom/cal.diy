import type { CreateInnerContextOptions } from "../../createContext";

type CountryCodeOptions = {
  ctx: CreateInnerContextOptions;
};

export const countryCodeHandler = async ({ ctx }: CountryCodeOptions) => {
  const { req } = ctx;

  const headerCandidates = [
    req?.headers?.["x-vercel-ip-country"],
    req?.headers?.["cf-ipcountry"],
    req?.headers?.["cloudfront-viewer-country"],
    req?.headers?.["x-country-code"],
  ];

  let countryCode = "";
  for (const candidate of headerCandidates) {
    const val = Array.isArray(candidate) ? candidate[0] : candidate;
    if (typeof val === "string" && val.trim().length > 0) {
      countryCode = val.trim();
      break;
    }
  }

  return { countryCode: countryCode.toUpperCase() };
};

export default countryCodeHandler;
