import process from "node:process";
import type { NextApiRequest } from "next";
import { z } from "zod";

const utmTrackingDataSchema = z.object({
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_term: z.string().optional(),
  utm_content: z.string().optional(),
  utm_id: z.string().optional(),
  utm_referral: z.string().optional(),
  landing_page: z.string().optional(),
});

export type GoogleAdsTrackingData = {
  gclid: string;
  campaignId?: string;
};

export type LinkedInAdsTrackingData = {
  liFatId: string;
  campaignId?: string;
};

export type UtmTrackingData = z.infer<typeof utmTrackingDataSchema>;

export type TrackingData = {
  googleAds?: GoogleAdsTrackingData;
  linkedInAds?: LinkedInAdsTrackingData;
  utmData?: UtmTrackingData;
};

export function getTrackingFromCookies(
  cookies?: NextApiRequest["cookies"],
  query?: NextApiRequest["query"]
): TrackingData {
  const tracking: TrackingData = {};

  if (process.env.GOOGLE_ADS_ENABLED === "1" && cookies?.gclid) {
    tracking.googleAds = {
      gclid: cookies.gclid,
      ...(cookies.gad_campaignId && { campaignId: cookies.gad_campaignId }),
    };
  }

  if (process.env.LINKEDIN_ADS_ENABLED === "1" && cookies?.li_fat_id) {
    tracking.linkedInAds = {
      liFatId: cookies.li_fat_id,
      ...(cookies.li_campaignId && { campaignId: cookies.li_campaignId }),
    };
  }

  const parseUtm = (input: unknown): UtmTrackingData | null => {
    const parsed = utmTrackingDataSchema.safeParse(input);
    if (!parsed.success) return null;

    return Object.fromEntries(
      Object.entries(parsed.data).filter(([_, value]) => value !== undefined)
    ) as UtmTrackingData;
  };

  let utmData: UtmTrackingData | null = null;

  if (query && Object.keys(query).length > 0) {
    utmData = parseUtm(query);
  }

  if (!utmData && cookies?.utm_data) {
    try {
      utmData = parseUtm(JSON.parse(cookies.utm_data));
    } catch {
      console.debug("Failed to parse utm_data cookie");
    }
  }

  if (utmData) {
    tracking.utmData = utmData;
  }

  return tracking;
}
