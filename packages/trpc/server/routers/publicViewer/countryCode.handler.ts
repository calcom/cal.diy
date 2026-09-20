import type { CreateInnerContextOptions } from "../../createContext";

type CountryCodeOptions = {
  ctx: CreateInnerContextOptions;
};

export const countryCodeHandler = async ({ ctx }: CountryCodeOptions) => {
  const { req } = ctx;

  const raw = req?.headers?.["cf-ipcountry"] || req?.headers?.["x-vercel-ip-country"] || "";
  const value = Array.isArray(raw) ? raw[0] : raw;
  // Normalize so consumers (e.g. PhoneInput) can rely on a stable casing.
  return { countryCode: value.trim().toUpperCase() };
};

export default countryCodeHandler;
