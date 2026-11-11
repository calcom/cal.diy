import { withBotId } from "botid/next/config";
import { config as dotenvConfig } from "dotenv";
import type { NextConfig } from "next";
import type { RouteHas } from "next/dist/lib/load-custom-routes";
import { withAxiom } from "next-axiom";
import i18nConfig from "@calcom/i18n/next-i18next.config";
import packageJson from "./package.json";
import {
  nextJsOrgRewriteConfig,
  orgUserRoutePath,
  orgUserTypeEmbedRoutePath,
  orgUserTypeRoutePath,
} from "./pagesAndRewritePaths";
import { TRIGGER_VERSION } from "./trigger.version"; // adjust path as needed

dotenvConfig({ path: "../../.env" });

const { version } = packageJson;
const {
  i18n: { locales },
} = i18nConfig;

type NextConfigPlugin = (config: NextConfig) => NextConfig;

// Type guard to filter out null/undefined values with proper type narrowing
function isNotNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function adjustEnvVariables(): void {
  // Type-safe way to modify process.env (which is typed as readonly in environment.d.ts)
  const envMutable = process.env as Record<string, string | undefined>;
  if (process.env.NEXT_PUBLIC_SINGLE_ORG_SLUG) {
    if (process.env.RESERVED_SUBDOMAINS) {
      console.warn(
        `⚠️  WARNING: RESERVED_SUBDOMAINS is ignored when SINGLE_ORG_SLUG is set. Single org mode doesn't need to use reserved subdomain validation.`
      );
      delete envMutable.RESERVED_SUBDOMAINS;
    }

    if (!process.env.ORGANIZATIONS_ENABLED) {
      console.log("Auto-enabling ORGANIZATIONS_ENABLED because SINGLE_ORG_SLUG is set");
      envMutable.ORGANIZATIONS_ENABLED = "1";
    }
  }
}

adjustEnvVariables();

if (!process.env.NEXTAUTH_SECRET) throw new Error("Please set NEXTAUTH_SECRET");
if (!process.env.CALENDSO_ENCRYPTION_KEY) throw new Error("Please set CALENDSO_ENCRYPTION_KEY");

const isOrganizationsEnabled =
  process.env.ORGANIZATIONS_ENABLED === "1" || process.env.ORGANIZATIONS_ENABLED === "true";

// Type-safe way to assign to process.env (which is typed as readonly in environment.d.ts)
const env = process.env as Record<string, string | undefined>;

env.NEXT_PUBLIC_CALCOM_VERSION = version;

if (process.env.NODE_ENV === "production" || process.env.CALCOM_ENV === "production") {
  env.TRIGGER_VERSION = TRIGGER_VERSION;
}

if (process.env.VERCEL_URL && !process.env.NEXT_PUBLIC_WEBAPP_URL) {
  env.NEXT_PUBLIC_WEBAPP_URL = `https://${process.env.VERCEL_URL}`;
}

if (!process.env.NEXTAUTH_URL && process.env.NEXT_PUBLIC_WEBAPP_URL) {
  env.NEXTAUTH_URL = `${process.env.NEXT_PUBLIC_WEBAPP_URL}/api/auth`;
}

if (!process.env.NEXT_PUBLIC_WEBSITE_URL) {
  env.NEXT_PUBLIC_WEBSITE_URL = process.env.NEXT_PUBLIC_WEBAPP_URL;
}

if (
  process.env.CSP_POLICY === "strict" &&
  (process.env.CALCOM_ENV === "production" || process.env.NODE_ENV === "production")
) {
  throw new Error(
    "Strict CSP policy(for style-src) is not yet supported in production. You can experiment with it in Dev Mode"
  );
}

if (!process.env.EMAIL_FROM) {
  console.warn(
    "\x1b[33mwarn",
    "\x1b[0m",
    "EMAIL_FROM environment variable is not set, this may indicate mailing is currently disabled. Please refer to the .env.example file."
  );
}

if (!process.env.NEXTAUTH_URL) throw new Error("Please set NEXTAUTH_URL");

function getHttpsUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  if (url.startsWith("http://")) {
    return url.replace("http://", "https://");
  }
  return url;
}

if (process.argv.includes("--experimental-https")) {
  env.NEXT_PUBLIC_WEBAPP_URL = getHttpsUrl(process.env.NEXT_PUBLIC_WEBAPP_URL);
  env.NEXTAUTH_URL = getHttpsUrl(process.env.NEXTAUTH_URL);
  env.NEXT_PUBLIC_EMBED_LIB_URL = getHttpsUrl(process.env.NEXT_PUBLIC_EMBED_LIB_URL);
}

function validJson(jsonString: string): object | false {
  try {
    const o = JSON.parse(jsonString);
    if (o && typeof o === "object") {
      return o;
    }
  } catch (e) {
    console.error(e);
  }
  return false;
}

if (process.env.GOOGLE_API_CREDENTIALS && !validJson(process.env.GOOGLE_API_CREDENTIALS)) {
  console.warn(
    "\x1b[33mwarn",
    "\x1b[0m",
    '- Disabled \'Google Calendar\' integration. Reason: Invalid value for GOOGLE_API_CREDENTIALS environment variable. When set, this value needs to contain valid JSON like {"web":{"client_id":"<clid>","client_secret":"<secret>","redirect_uris":["<yourhost>/api/integrations/googlecalendar/callback>"]}. You can download this JSON from your OAuth Client @ https://console.cloud.google.com/apis/credentials.'
  );
}

const plugins: NextConfigPlugin[] = [];

if (process.env.ANALYZE === "true") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const withBundleAnalyzer = require("@next/bundle-analyzer")({
    enabled: true,
  });
  plugins.push(withBundleAnalyzer);
}

plugins.push(withAxiom);

if (process.env.NEXT_PUBLIC_VERCEL_USE_BOTID_IN_BOOKER === "1") {
  plugins.push(withBotId);
}

interface OrgDomainMatcher {
  has: RouteHas[];
  source: string;
}

const orgDomainMatcherConfig: {
  root: OrgDomainMatcher | null;
  rootEmbed: OrgDomainMatcher | null;
  user: OrgDomainMatcher;
  userType: OrgDomainMatcher;
  userTypeEmbed: OrgDomainMatcher;
} = {
  root: nextJsOrgRewriteConfig.disableRootPathRewrite
    ? null
    : {
        has: [
          {
            type: "host",
            value: nextJsOrgRewriteConfig.orgHostPath,
          },
        ],
        source: "/",
      },

  rootEmbed: nextJsOrgRewriteConfig.disableRootEmbedPathRewrite
    ? null
    : {
        has: [
          {
            type: "host",
            value: nextJsOrgRewriteConfig.orgHostPath,
          },
        ],
        source: "/embed",
      },

  user: {
    has: [
      {
        type: "host",
        value: nextJsOrgRewriteConfig.orgHostPath,
      },
    ],
    source: orgUserRoutePath,
  },

  userType: {
    has: [
      {
        type: "host",
        value: nextJsOrgRewriteConfig.orgHostPath,
      },
    ],
    source: orgUserTypeRoutePath,
  },

  userTypeEmbed: {
    has: [
      {
        type: "host",
        value: nextJsOrgRewriteConfig.orgHostPath,
      },
    ],
    source: orgUserTypeEmbedRoutePath,
  },
};

const nextConfig = (phase: string): NextConfig => {
  if (isOrganizationsEnabled) {
    console.log(
      `[Phase: ${phase}] Adding rewrite config for organizations - orgHostPath: ${nextJsOrgRewriteConfig.orgHostPath}, orgSlug: ${nextJsOrgRewriteConfig.orgSlug}, disableRootPathRewrite: ${nextJsOrgRewriteConfig.disableRootPathRewrite}`
    );
  } else {
    console.log(
      `[Phase: ${phase}] Skipping rewrite config for organizations because ORGANIZATIONS_ENABLED is not set`
    );
  }

  return {
    output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
    serverExternalPackages: [
      "deasync",
      "http-cookie-agent",
      "rest-facade",
      "superagent-proxy",
      "superagent",
      "formidable",
      "@boxyhq/saml-jackson",
      "jose",
    ],
    experimental: {
      optimizePackageImports: ["@calcom/ui"],
    },
    productionBrowserSourceMaps: true,
    transpilePackages: [
      "@calcom/app-store",
      "@calcom/dayjs",
      "@calcom/emails",
      "@calcom/embed-core",
      "@calcom/features",
      "@calcom/lib",
      "@calcom/prisma",
      "@calcom/trpc",
      "@coss/ui",
    ],
    modularizeImports: {
      lodash: {
        transform: "lodash/{{member}}",
      },
    },
    images: {
      unoptimized: true,
    },
    turbopack: {},
    async rewrites() {
      const { orgSlug } = nextJsOrgRewriteConfig;
      const beforeFiles = [
        {
          source: `/(${locales.join("|")})/:path*`,
          destination: "/:path*",
        },
        {
          source: "/forms/:formQuery*",
          destination: "/apps/routing-forms/routing-link/:formQuery*",
        },
        {
          source: "/routing-forms",
          destination: "/apps/routing-forms/forms",
        },
        {
          source: "/success/:path*",
          has: [
            {
              type: "query" as const,
              key: "uid",
              value: "(?<uid>.*)",
            },
          ],
          destination: "/booking/:uid/:path*",
        },
        {
          source: "/cancel/:path*",
          destination: "/booking/:path*",
        },
        {
          source: "/embed.js",
          destination: "/embed/embed.js",
        },
        {
          source: "/login",
          destination: "/auth/login",
        },
        ...(isOrganizationsEnabled
          ? [
              orgDomainMatcherConfig.root
                ? {
                    ...orgDomainMatcherConfig.root,
                    destination: `/team/${orgSlug}?isOrgProfile=1`,
                  }
                : null,
              orgDomainMatcherConfig.rootEmbed
                ? {
                    ...orgDomainMatcherConfig.rootEmbed,
                    destination: `/team/${orgSlug}/embed?isOrgProfile=1`,
                  }
                : null,
              {
                ...orgDomainMatcherConfig.user,
                destination: `/org/${orgSlug}/:user`,
              },
              {
                ...orgDomainMatcherConfig.userType,
                destination: `/org/${orgSlug}/:user/:type`,
              },
              {
                ...orgDomainMatcherConfig.userTypeEmbed,
                destination: `/org/${orgSlug}/:user/:type/embed`,
              },
            ]
          : []),
      ].filter(isNotNull);

      const afterFiles = [
        {
          source: "/routing/:path*",
          destination: "/apps/routing-forms/:path*",
        },
        {
          source: "/org/:slug",
          destination: "/team/:slug",
        },
        {
          source: "/org/:orgSlug/avatar.png",
          destination: "/api/user/avatar?orgSlug=:orgSlug",
        },
        {
          source: "/team/:teamname/avatar.png",
          destination: "/api/user/avatar?teamname=:teamname",
        },
        {
          source: "/icons/sprite.svg",
          destination: `${process.env.NEXT_PUBLIC_WEBAPP_URL}/icons/sprite.svg`,
        },
        {
          source: "/_proxy/dub/track/:path",
          destination: "https://api.dub.co/track/:path",
        },
        {
          source: "/:user/avatar.png",
          destination: "/api/user/avatar?username=:user",
        },
      ];

      if (process.env.NEXT_PUBLIC_API_V2_URL) {
        afterFiles.push({
          source: "/api/v2/:path*",
          destination: `${process.env.NEXT_PUBLIC_API_V2_URL}/:path*`,
        });
      }

      return {
        beforeFiles,
        afterFiles,
      };
    },
    async headers() {
      const { orgSlug } = nextJsOrgRewriteConfig;
      const CORP_CROSS_ORIGIN_HEADER = {
        key: "Cross-Origin-Resource-Policy",
        value: "cross-origin",
      };

      const ACCESS_CONTROL_ALLOW_ORIGIN_HEADER = {
        key: "Access-Control-Allow-Origin",
        value: "*",
      };

      return [
        {
          source: "/auth/:path*",
          headers: [
            {
              key: "X-Frame-Options",
              value: "DENY",
            },
          ],
        },
        {
          source: "/signup",
          headers: [
            {
              key: "X-Frame-Options",
              value: "DENY",
            },
          ],
        },
        {
          source: "/:path*",
          headers: [
            {
              key: "X-Content-Type-Options",
              value: "nosniff",
            },
            {
              key: "Referrer-Policy",
              value: "strict-origin-when-cross-origin",
            },
            {
              key: "Content-Security-Policy",
              value:
                "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http:; font-src 'self' data:; connect-src 'self' https: wss:; frame-ancestors 'none';",
            },
          ],
        },
        {
          source: "/embed/embed.js",
          headers: [CORP_CROSS_ORIGIN_HEADER],
        },
        {
          source: "/:path*/embed",
          headers: [CORP_CROSS_ORIGIN_HEADER],
        },
        {
          source: "/:path*",
          has: [
            {
              type: "host" as const,
              value: "cal.com",
            },
          ],
          headers: [
            {
              key: "Referrer-Policy",
              value: "no-referrer-when-downgrade",
            },
          ],
        },
        {
          source: "/api/avatar/:path*",
          headers: [CORP_CROSS_ORIGIN_HEADER],
        },
        {
          source: "/avatar.svg",
          headers: [CORP_CROSS_ORIGIN_HEADER],
        },
        {
          source: "/icons/sprite.svg(\\?v=[0-9a-zA-Z\\-\\.]+)?",
          headers: [
            CORP_CROSS_ORIGIN_HEADER,
            ACCESS_CONTROL_ALLOW_ORIGIN_HEADER,
            {
              key: "Cache-Control",
              value: "public, max-age=31536000, immutable",
            },
          ],
        },
        ...(isOrganizationsEnabled
          ? [
              orgDomainMatcherConfig.root
                ? {
                    ...orgDomainMatcherConfig.root,
                    headers: [
                      {
                        key: "X-Cal-Org-path",
                        value: `/team/${orgSlug}`,
                      },
                    ],
                  }
                : null,
              {
                ...orgDomainMatcherConfig.user,
                headers: [
                  {
                    key: "X-Cal-Org-path",
                    value: `/org/${orgSlug}/:user`,
                  },
                ],
              },
              {
                ...orgDomainMatcherConfig.userType,
                headers: [
                  {
                    key: "X-Cal-Org-path",
                    value: `/org/${orgSlug}/:user/:type`,
                  },
                ],
              },
              {
                ...orgDomainMatcherConfig.userTypeEmbed,
                headers: [
                  {
                    key: "X-Cal-Org-path",
                    value: `/org/${orgSlug}/:user/:type/embed`,
                  },
                ],
              },
            ]
          : []),
      ].filter(isNotNull);
    },
    async redirects() {
      const redirects = [
        {
          source: "/settings/organizations",
          destination: "/settings/organizations/profile",
          permanent: false,
        },
        {
          source: "/apps/routing-forms",
          destination: "/apps/routing-forms/forms",
          permanent: false,
        },
        {
          source: "/api/app-store/:path*",
          destination: "/app-store/:path*",
          permanent: true,
        },
        {
          source: "/auth/new",
          destination: process.env.NEXT_PUBLIC_WEBAPP_URL || "https://app.cal.com",
          permanent: true,
        },
        {
          source: "/auth/signup",
          destination: "/signup",
          permanent: true,
        },
        {
          source: "/auth",
          destination: "/auth/login",
          permanent: false,
        },
        {
          source: "/settings",
          destination: "/settings/my-account/profile",
          permanent: true,
        },
        {
          source: "/settings/teams",
          destination: "/teams",
          permanent: true,
        },
        {
          source: "/settings/admin",
          destination: "/settings/admin/flags",
          permanent: true,
        },
        {
          source: "/settings/profile",
          destination: "/settings/my-account/profile",
          permanent: false,
        },
        {
          source: "/settings/security",
          destination: "/settings/security/password",
          permanent: false,
        },
        {
          source: "/bookings",
          destination: "/bookings/upcoming",
          permanent: true,
        },
        {
          source: "/call/:path*",
          destination: "/video/:path*",
          permanent: false,
        },
        {
          source: "/api/auth/:path*",
          has: [
            {
              type: "query" as const,
              key: "callbackUrl",
              value: "^(?!https?://).*$",
            },
          ],
          destination: "/404",
          permanent: false,
        },
        {
          source: "/booking/direct/:action/:email/:bookingUid/:oldToken",
          destination: "/api/link?action=:action&email=:email&bookingUid=:bookingUid&oldToken=:oldToken",
          permanent: true,
        },
        {
          source: "/support",
          missing: [
            {
              type: "header" as const,
              key: "host",
              value: nextJsOrgRewriteConfig.orgHostPath,
            },
          ],
          destination: "/event-types?openSupport=true",
          permanent: true,
        },
        {
          source: "/apps/categories/video",
          destination: "/apps/categories/conferencing",
          permanent: true,
        },
        {
          source: "/apps/installed/video",
          destination: "/apps/installed/conferencing",
          permanent: true,
        },
        {
          source: "/apps/installed",
          destination: "/apps/installed/calendar",
          permanent: true,
        },
        {
          source: "/settings/organizations/members",
          destination: "/members",
          permanent: true,
        },
        {
          source: "/settings/admin/apps",
          destination: "/settings/admin/apps/calendar",
          permanent: true,
        },
        ...(process.env.NODE_ENV === "development" &&
        isOrganizationsEnabled &&
        process.env.NEXT_PUBLIC_WEBAPP_URL !== "http://localhost:3000"
          ? [
              {
                has: [
                  {
                    type: "header" as const,
                    key: "host",
                    value: "localhost:3000",
                  },
                ],
                source: "/api/integrations/:args*",
                destination: `${process.env.NEXT_PUBLIC_WEBAPP_URL}/api/integrations/:args*`,
                permanent: false,
              },
            ]
          : []),
      ];

      if (process.env.NEXT_PUBLIC_WEBAPP_URL === "https://app.cal.com") {
        redirects.push(
          {
            source: "/apps/dailyvideo",
            destination: "/apps/daily-video",
            permanent: true,
          },
          {
            source: "/apps/huddle01_video",
            destination: "/apps/huddle01",
            permanent: true,
          },
          {
            source: "/apps/jitsi_video",
            destination: "/apps/jitsi",
            permanent: true,
          }
        );
      }

      return redirects;
    },
  };
};

export default (phase: string): NextConfig => plugins.reduce((acc, plugin) => plugin(acc), nextConfig(phase));
