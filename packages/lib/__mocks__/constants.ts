import type * as constants from "@calcom/lib/constants";
import { beforeEach, vi } from "vitest";

const initialConstants = {
  IS_PRODUCTION: false,
  IS_TEAM_BILLING_ENABLED: false,
  WEBSITE_URL: "",
  PUBLIC_INVALIDATE_AVAILABLE_SLOTS_ON_BOOKING_FORM: true,
  CLOUDFLARE_SITE_ID: "test-site-id",
  CLOUDFLARE_USE_TURNSTILE_IN_BOOKER: "1",
  DEFAULT_LIGHT_BRAND_COLOR: "#292929",
  DEFAULT_DARK_BRAND_COLOR: "#fafafa",
  CALCOM_VERSION: "0.0.0",
  IS_SELF_HOSTED: false,
  SEO_IMG_DEFAULT: "https://cal.com/og-image.png",
  SEO_IMG_OGIMG: "https://cal.com/og-image-wide.png",
  CURRENT_TIMEZONE: "Europe/London",
  APP_NAME: "Cal.diy",
  BOOKER_NUMBER_OF_DAYS_TO_LOAD: 14,
  PUBLIC_QUICK_AVAILABILITY_ROLLOUT: 100,
  SINGLE_ORG_SLUG: "",
  DEFAULT_GROUP_ID: "default_group_id",
} as Partial<typeof constants>;

export const mockedConstants = { ...initialConstants };

vi.mock("@calcom/lib/constants", () => mockedConstants);

beforeEach(() => {
  Object.assign(mockedConstants, initialConstants);
});

export const constantsScenarios = {
  enableTeamBilling: () => {
    mockedConstants.IS_TEAM_BILLING_ENABLED = true;
  },
  setWebsiteUrl: (url: string) => {
    mockedConstants.WEBSITE_URL = url;
  },
  set: (envVariables: Record<string, string>) => {
    Object.entries(envVariables).forEach(([key, value]) => {
      // @ts-expect-error - dynamic key access on Partial type
      mockedConstants[key] = value;
    });
  },
};
