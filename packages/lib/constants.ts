/**
 * Ensures URL has a protocol prefix. If the URL doesn't start with http:// or https://,
 * prepends https:// to make it valid for URL parsing.
 * This handles cases where environment variables have their protocol stripped
 */
function ensureProtocol(url: string | undefined): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `https://${url}`;
}

const VERCEL_URL = process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : "";
const RAILWAY_STATIC_URL = process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : "";
const HEROKU_URL = process.env.HEROKU_APP_NAME ? `https://${process.env.HEROKU_APP_NAME}.herokuapp.com` : "";
const RENDER_URL = process.env.RENDER_EXTERNAL_URL ? `https://${process.env.RENDER_EXTERNAL_URL}` : "";
export const CALCOM_ENV = process.env.CALCOM_ENV || process.env.NODE_ENV;
export const IS_PRODUCTION = CALCOM_ENV === "production";
export const IS_PRODUCTION_BUILD = process.env.NODE_ENV === "production";
export const ORGANIZER_EMAIL_EXEMPT_DOMAINS = process.env.ORGANIZER_EMAIL_EXEMPT_DOMAINS || "";
const IS_DEV = CALCOM_ENV === "development";
export const SINGLE_ORG_SLUG = process.env.NEXT_PUBLIC_SINGLE_ORG_SLUG;
/** https://app.cal.com */
export const WEBAPP_URL =
  ensureProtocol(process.env.NEXT_PUBLIC_WEBAPP_URL) ||
  VERCEL_URL ||
  RAILWAY_STATIC_URL ||
  HEROKU_URL ||
  RENDER_URL ||
  "http://localhost:3000";

export const WEBAPP_URL_INTERNAL = process.env.WEBAPP_URL_INTERNAL
  ? ensureProtocol(process.env.WEBAPP_URL_INTERNAL)
  : undefined;

// OAuth needs to have HTTPS(which is not generally setup locally) and a valid tld(*.local isn't a valid tld)
// So for development purpose, we would stick to localhost only
export const WEBAPP_URL_FOR_OAUTH = IS_PRODUCTION || IS_DEV ? WEBAPP_URL : "http://localhost:3000";

/** @deprecated use `WEBAPP_URL` */
export const BASE_URL = WEBAPP_URL;
export const WEBSITE_URL = ensureProtocol(process.env.NEXT_PUBLIC_WEBSITE_URL) || "https://cal.com";
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Cal.diy";
export const SUPPORT_MAIL_ADDRESS = process.env.NEXT_PUBLIC_SUPPORT_MAIL_ADDRESS || "help@cal.com";
export const COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME || "Cal.com, Inc.";
export const SENDER_ID = process.env.NEXT_PUBLIC_SENDER_ID || "Cal";
export const SENDER_NAME = process.env.NEXT_PUBLIC_SENDGRID_SENDER_NAME || "Cal.diy";
export const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || APP_NAME;

// This is the URL from which all Cal Links and their assets are served.
// Use website URL to make links shorter(cal.com and not app.cal.com)
// As website isn't setup for preview environments, use the webapp url instead
// If it's a .vercel.app domain, keep it.
// Else use the website url if defined and finally fallback to the webapp url
export const CAL_URL = new URL(WEBAPP_URL).hostname.endsWith(".vercel.app")
  ? WEBAPP_URL
  : ensureProtocol(process.env.NEXT_PUBLIC_WEBSITE_URL) || WEBAPP_URL;

export const IS_CALCOM =
  WEBAPP_URL &&
  (new URL(WEBAPP_URL).hostname.endsWith("cal.com") ||
    new URL(WEBAPP_URL).hostname.endsWith("cal.dev") ||
    new URL(WEBAPP_URL).hostname.endsWith("cal.qa") ||
    new URL(WEBAPP_URL).hostname.endsWith("cal-staging.com") ||
    new URL(WEBAPP_URL).hostname.endsWith("cal.eu"));

export const CONSOLE_URL =
  new URL(WEBAPP_URL).hostname.endsWith(".cal.dev") ||
  new URL(WEBAPP_URL).hostname.endsWith(".cal.qa") ||
  new URL(WEBAPP_URL).hostname.endsWith(".cal-staging.com") ||
  process.env.NODE_ENV !== "production"
    ? `https://console.cal.dev`
    : `https://console.cal.com`;
const CAL_DOMAINS = [".cal.com", ".cal.dev", ".cal.eu", ".cal.qa"];
const WEBAPP_HOSTNAME = new URL(WEBAPP_URL).hostname;
export const IS_SELF_HOSTED = !CAL_DOMAINS.some((domain) => WEBAPP_HOSTNAME.endsWith(domain));
export const EMBED_LIB_URL = process.env.NEXT_PUBLIC_EMBED_LIB_URL || `${WEBAPP_URL}/embed/embed.js`;
export const TRIAL_LIMIT_DAYS = 14;
export const MAX_SEATS_PER_TIME_SLOT = 1000;

/** Maximum duration allowed for an event in minutes (24 hours) */
export const MAX_EVENT_DURATION_MINUTES = 1440;

/** Minimum duration allowed for an event in minutes */
export const MIN_EVENT_DURATION_MINUTES = 1;

export const HOSTED_CAL_FEATURES = process.env.NEXT_PUBLIC_HOSTED_CAL_FEATURES || !IS_SELF_HOSTED;

export const PUBLIC_QUERY_RESERVATION_INTERVAL_SECONDS =
  parseInt(process.env.NEXT_PUBLIC_QUERY_RESERVATION_INTERVAL_SECONDS ?? "", 10) || 30;

// Must be lower than PUBLIC_QUERY_RESERVATION_INTERVAL_SECONDS
export const PUBLIC_QUERY_RESERVATION_STALE_TIME_SECONDS =
  parseInt(process.env.NEXT_PUBLIC_QUERY_RESERVATION_STALE_TIME_SECONDS ?? "", 10) || 20;
export const PUBLIC_QUERY_AVAILABLE_SLOTS_INTERVAL_SECONDS =
  parseInt(process.env.NEXT_PUBLIC_QUERY_AVAILABLE_SLOTS_INTERVAL_SECONDS ?? "", 10) || 5 * 60;
export const PUBLIC_INVALIDATE_AVAILABLE_SLOTS_ON_BOOKING_FORM =
  process.env.NEXT_PUBLIC_INVALIDATE_AVAILABLE_SLOTS_ON_BOOKING_FORM === "1";

// Enables a feature for x% of all visitors. Takes a number between 0 and 100.
export const PUBLIC_QUICK_AVAILABILITY_ROLLOUT =
  parseInt(process.env.NEXT_PUBLIC_QUICK_AVAILABILITY_ROLLOUT ?? "", 10) || 0;

/** @deprecated use `WEBAPP_URL` */
export const NEXT_PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_WEBAPP_URL || `https://${process.env.VERCEL_URL}`;
export const LOGO = "/calcom-logo-white-word.svg";
export const LOGO_DARK = "/cal-logo-word-black.svg";
export const LOGO_ICON = "/cal-com-icon-white.svg";
export const AVATAR_FALLBACK = "/avatar.svg";
export const FAVICON_16 = "/favicon-16x16.png";
export const FAVICON_32 = "/favicon-32x32.png";
export const APPLE_TOUCH_ICON = "/apple-touch-icon.png";
export const MSTILE_ICON = "/mstile-150x150.png";
export const ANDROID_CHROME_ICON_192 = "/android-chrome-192x192.png";
export const ANDROID_CHROME_ICON_256 = "/android-chrome-256x256.png";
export const ROADMAP = "https://cal.com/roadmap";
export const DESKTOP_APP_LINK = "https://cal.com/download";
export const JOIN_COMMUNITY = "https://github.com/calcom/cal.diy/discussions";
export const POWERED_BY_URL = "https://go.cal.com/booking";
export const DOCS_URL = "https://cal.com/docs";
export const DEVELOPER_DOCS = "https://developer.cal.com";
export const SEO_IMG_DEFAULT = `${CAL_URL}/og-image.png`;
// The Dynamic OG Image is passed through Next's Image API to further optimize it.
// This results in a 80% smaller image 🤯. It is however important that for the query
// parameters you pass to the /api/social/og/image endpoint, you wrap them in encodeURIComponent
// as well, otherwise the URL won't be valid.
export const SEO_IMG_OGIMG = `${CAL_URL}/_next/image?w=1200&q=100&url=`;
export const SEO_IMG_OGIMG_VIDEO = `${CAL_URL}/video-og-image.png`;
export const IS_STRIPE_ENABLED = !!(
  process.env.STRIPE_CLIENT_ID &&
  process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY &&
  process.env.STRIPE_PRIVATE_KEY
);
/** This has correct value only server side. When you want to use client side, go for IS_TEAM_BILLING_ENABLED_CLIENT. I think we should use the _CLIENT one only everywhere so that it works reliably everywhere on client as well as server  */
export const IS_TEAM_BILLING_ENABLED = !!(IS_STRIPE_ENABLED && HOSTED_CAL_FEATURES);

export const IS_TEAM_BILLING_ENABLED_CLIENT =
  !!process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY && HOSTED_CAL_FEATURES;

export const FULL_NAME_LENGTH_MAX_LIMIT = 50;
export const API_NAME_LENGTH_MAX_LIMIT = 80;
export const MINUTES_TO_BOOK = process.env.NEXT_PUBLIC_MINUTES_TO_BOOK || "5";
export const ENABLE_PROFILE_SWITCHER = process.env.NEXT_PUBLIC_ENABLE_PROFILE_SWITCHER === "1";
// Needed for orgs
export const ALLOWED_HOSTNAMES = JSON.parse(`[${process.env.ALLOWED_HOSTNAMES || ""}]`) as string[];
export const RESERVED_SUBDOMAINS = JSON.parse(`[${process.env.RESERVED_SUBDOMAINS || ""}]`) as string[];

export const ORGANIZATION_SELF_SERVE_PRICE = parseFloat(
  process.env.NEXT_PUBLIC_ORGANIZATIONS_SELF_SERVE_PRICE_NEW || "37"
);

// Needed for emails in E2E
export const IS_MAILHOG_ENABLED = process.env.E2E_TEST_MAILHOG_ENABLED === "1";
export const CALCOM_VERSION = process.env.NEXT_PUBLIC_CALCOM_VERSION as string;

export const APP_CREDENTIAL_SHARING_ENABLED =
  !!process.env.CALCOM_CREDENTIAL_SYNC_SECRET && !!process.env.CALCOM_APP_CREDENTIAL_ENCRYPTION_KEY;
export const CREDENTIAL_SYNC_SECRET = process.env.CALCOM_CREDENTIAL_SYNC_SECRET;
export const CREDENTIAL_SYNC_SECRET_HEADER_NAME =
  process.env.CALCOM_CREDENTIAL_SYNC_HEADER_NAME || "calcom-credential-sync-secret";

export const CREDENTIAL_SYNC_ENDPOINT = process.env.CALCOM_CREDENTIAL_SYNC_ENDPOINT;

// Service Account Encryption Key for encrypting/decrypting service account keys
export const SERVICE_ACCOUNT_ENCRYPTION_KEY = process.env.CALCOM_SERVICE_ACCOUNT_ENCRYPTION_KEY;

export const DEFAULT_LIGHT_BRAND_COLOR = "#292929";
export const DEFAULT_DARK_BRAND_COLOR = "#fafafa";

export const TOP_BANNER_HEIGHT = 40;

export const IS_PREMIUM_USERNAME_ENABLED =
  (IS_CALCOM || (process.env.NEXT_PUBLIC_IS_E2E && IS_STRIPE_ENABLED)) &&
  process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PLAN_PRICE_MONTHLY;

// Max number of invites to join a team/org that can be sent at once
export const MAX_NB_INVITES = 100;

export const URL_PROTOCOL_REGEX = /(^\w+:|^)\/\//;

export const IS_VISUAL_REGRESSION_TESTING = Boolean(globalThis.window?.Meticulous?.isRunningAsTest);

export const BOOKER_NUMBER_OF_DAYS_TO_LOAD = parseInt(
  process.env.NEXT_PUBLIC_BOOKER_NUMBER_OF_DAYS_TO_LOAD ?? "0",
  10
);

export const CLOUDFLARE_SITE_ID = process.env.NEXT_PUBLIC_CLOUDFLARE_SITEKEY;
export const CLOUDFLARE_USE_TURNSTILE_IN_BOOKER = process.env.NEXT_PUBLIC_CLOUDFLARE_USE_TURNSTILE_IN_BOOKER;
export const ORG_SELF_SERVE_ENABLED = process.env.NEXT_PUBLIC_ORG_SELF_SERVE_ENABLED === "1";
export const ORG_MINIMUM_PUBLISHED_TEAMS_SELF_SERVE = 0;
export const ORG_MINIMUM_PUBLISHED_TEAMS_SELF_SERVE_HELPER_DIALOGUE = 1;

export const CALCOM_PRIVATE_API_ROUTE = process.env.CALCOM_PRIVATE_API_ROUTE || "https://goblin.cal.com";
export const WEBSITE_PRIVACY_POLICY_URL =
  process.env.NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL || "https://cal.com/privacy";
export const WEBSITE_TERMS_URL = process.env.NEXT_PUBLIC_WEBSITE_TERMS_URL || "https://cal.com/terms";
export const LINGO_DOT_DEV_API_KEY = process.env.LINGO_DOT_DEV_API_KEY;

/**
 * The maximum number of days we should check for if we don't find all required bookable days
 * Counter start from current day and we would like to not go beyond 2 months(max days possible) from current day.
 */
export const ROLLING_WINDOW_PERIOD_MAX_DAYS_TO_CHECK = 30 + 31;

export const TRANSCRIPTION_STARTED_ICON = IS_PRODUCTION
  ? `${WEBAPP_URL}/sparkles-red.svg`
  : `https://app.cal.com/sparkles-red.svg`;

export const TRANSCRIPTION_STOPPED_ICON = IS_PRODUCTION
  ? `${WEBAPP_URL}/sparkles.svg`
  : `https://app.cal.com/sparkles.svg`;

export const RECORDING_DEFAULT_ICON = IS_PRODUCTION
  ? `${WEBAPP_URL}/start-recording.svg`
  : `https://app.cal.com/start-recording.svg`;

export const RECORDING_IN_PROGRESS_ICON = IS_PRODUCTION
  ? `${WEBAPP_URL}/stop-recording.svg`
  : `https://app.cal.com/stop-recording.svg`;

export const SCOPE_USERINFO_PROFILE = "https://www.googleapis.com/auth/userinfo.profile";
export const SCOPE_USERINFO_EMAIL = "https://www.googleapis.com/auth/userinfo.email";
export const GOOGLE_OAUTH_SCOPES = [SCOPE_USERINFO_PROFILE, SCOPE_USERINFO_EMAIL];
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];
export const DIRECTORY_IDS_TO_LOG = process.env.DIRECTORY_IDS_TO_LOG?.split(",") || [];
export const SCANNING_WORKFLOW_STEPS = !!(!IS_SELF_HOSTED && process.env.IFFY_API_KEY);

// Cloudflare URL Scanner - checks URLs for malicious content in workflows and event types
export const URL_SCANNING_ENABLED =
  !!process.env.CLOUDFLARE_URL_SCANNER_API_TOKEN && !!process.env.CLOUDFLARE_ACCOUNT_ID;

export const IS_DUB_REFERRALS_ENABLED =
  !!process.env.NEXT_PUBLIC_DUB_PROGRAM_ID && process.env.NEXT_PUBLIC_DUB_PROGRAM_ID !== "";

export const DUB_SMS_DOMAIN = process.env.DUB_SMS_DOMAIN;
export const DUB_SMS_FOLDER_ID = process.env.DUB_SMS_FOLDER_ID;

export const CAL_VIDEO_MEETING_LINK_FOR_TESTING = process.env.CAL_VIDEO_MEETING_LINK_FOR_TESTING;

export const IS_SMS_CREDITS_ENABLED =
  !!process.env.NEXT_PUBLIC_STRIPE_CREDITS_PRICE_ID || !!process.env.NEXT_PUBLIC_IS_E2E;
export const DATABASE_CHUNK_SIZE = parseInt(process.env.DATABASE_CHUNK_SIZE || "25", 10);

export const NEXTJS_CACHE_TTL = 3600; // 1 hour

export const DEFAULT_GROUP_ID = "default_group_id";

const _rawCalAiPrice = process.env.NEXT_PUBLIC_CAL_AI_PHONE_NUMBER_MONTHLY_PRICE;
export const CAL_AI_PHONE_NUMBER_MONTHLY_PRICE = (() => {
  const parsed = _rawCalAiPrice && _rawCalAiPrice.trim() !== "" ? Number(_rawCalAiPrice) : NaN;
  return Number.isFinite(parsed) ? parsed : 5;
})();

// Retell AI test mode configuration
export const RETELL_AI_TEST_MODE = process.env.RETELL_AI_TEST_MODE === "true";
export const RETELL_AI_TEST_EVENT_TYPE_MAP = (() => {
  if (!process.env.RETELL_AI_TEST_EVENT_TYPE_MAP) return null;
  try {
    return JSON.parse(process.env.RETELL_AI_TEST_EVENT_TYPE_MAP);
  } catch (e) {
    console.warn("Failed to parse RETELL_AI_TEST_EVENT_TYPE_MAP", e);
    return null;
  }
})();

// Environment variable for configuring past booking reschedule behavior per team. A comma separated list of team IDs(e.g. '1,2,3')
/* This is an internal environment variable and is not meant to be used by the self-hosters. It is planned to be removed later by either having it as an option in Event Type or by some other customer configurable approaches*/
export const ENV_PAST_BOOKING_RESCHEDULE_CHANGE_TEAM_IDS =
  process.env._CAL_INTERNAL_PAST_BOOKING_RESCHEDULE_CHANGE_TEAM_IDS;

// Cal Video (Daily) app identifiers
export const CAL_VIDEO = "daily-video";
export const CAL_VIDEO_TYPE = "daily_video";

export const ORG_TRIAL_DAYS = process.env.STRIPE_ORG_TRIAL_DAYS
  ? Math.max(0, parseInt(process.env.STRIPE_ORG_TRIAL_DAYS, 10))
  : null;

export const IS_API_V2_E2E = process.env.IS_E2E === "true";

export const ENABLE_ASYNC_TASKER =
  process.env.ENABLE_ASYNC_TASKER === "true" && !process.env.NEXT_PUBLIC_IS_E2E && !IS_API_V2_E2E;

export const MICROSOFT_CALENDAR_SCOPES = [
  "User.Read",
  "Calendars.Read",
  "Calendars.ReadWrite",
  "offline_access",
];
