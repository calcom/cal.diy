declare namespace NodeJS {
  interface ProcessEnv {
    readonly CALCOM_TELEMETRY_DISABLED: string | undefined;
    readonly CALENDSO_ENCRYPTION_KEY: string | undefined;
    readonly DATABASE_URL: string | undefined;
    readonly GOOGLE_API_CREDENTIALS: string | undefined;
    /** Google Calendar API key for fetching public holiday calendars */
    readonly GOOGLE_CALENDAR_API_KEY: string | undefined;
    /** @deprecated use `NEXT_PUBLIC_WEBAPP_URL` */
    readonly BASE_URL: string | undefined;
    /** @deprecated use `NEXT_PUBLIC_WEBAPP_URL` */
    readonly NEXT_PUBLIC_BASE_URL: string | undefined;
    /** @deprecated use `NEXT_PUBLIC_WEBSITE_URL` */
    readonly NEXT_PUBLIC_APP_URL: string | undefined;
    readonly NEXTAUTH_SECRET: string | undefined;
    readonly NEXT_PUBLIC_AVAILABILITY_SCHEDULE_INTERVAL: string | undefined;
    readonly MS_GRAPH_CLIENT_ID: string | undefined;
    readonly MS_GRAPH_CLIENT_SECRET: string | undefined;
    readonly ZOOM_CLIENT_ID: string | undefined;
    readonly ZOOM_CLIENT_SECRET: string | undefined;
    readonly EMAIL_FROM: string | undefined;
    readonly EMAIL_FROM_NAME: string | undefined;
    readonly EMAIL_SERVER_HOST: string | undefined;
    readonly EMAIL_SERVER_PORT: string | undefined;
    readonly EMAIL_SERVER_USER: string | undefined;
    readonly EMAIL_SERVER_PASSWORD: string | undefined;
    readonly CRON_API_KEY: string | undefined;
    readonly CRON_ENABLE_APP_SYNC: string | undefined;
    readonly NEXT_PUBLIC_STRIPE_PUBLIC_KEY: string | undefined;
    readonly STRIPE_PRIVATE_KEY: string | undefined;
    readonly STRIPE_CLIENT_ID: string | undefined;
    readonly STRIPE_WEBHOOK_SECRET: string | undefined;
    readonly STRIPE_WEBHOOK_SECRET_APPS: string | undefined;
    readonly STRIPE_TEAM_PRODUCT_ID: `prod_${string}` | undefined;
    readonly PAYMENT_FEE_PERCENTAGE: number | undefined;
    readonly PAYMENT_FEE_FIXED: number | undefined;
    readonly AWAITING_PAYMENT_EMAIL_DELAY_MINUTES: number | undefined;
    readonly NEXT_PUBLIC_INTERCOM_APP_ID: string | undefined;
    readonly NEXT_PUBLIC_POSTHOG_KEY: string | undefined;
    readonly NEXT_PUBLIC_POSTHOG_HOST: string | undefined;
    readonly TANDEM_CLIENT_ID: string | undefined;
    readonly TANDEM_CLIENT_SECRET: string | undefined;
    readonly TANDEM_BASE_URL: string | undefined;
    readonly WEBSITE_BASE_URL: string | undefined;
    /** @deprecated use `NEXT_PUBLIC_WEBSITE_URL` */
    readonly NEXT_PUBLIC_WEBSITE_BASE_URL: string;
    readonly NEXT_PUBLIC_WEBSITE_URL: string;
    readonly APP_BASE_URL: string | undefined;
    /** @deprecated use `NEXT_PUBLIC_WEBAPP_URL` */
    readonly NEXT_PUBLIC_APP_BASE_URL: string;
    readonly NEXT_PUBLIC_WEBAPP_URL: string;
    readonly WEBAPP_URL_INTERNAL: string | undefined;
    /** The Environment that the app is deployed an running on. */
    readonly VERCEL_ENV: "production" | "preview" | "development" | undefined;
    /** The URL of the deployment. Example: my-site-7q03y4pi5.vercel.app. */
    readonly VERCEL_URL: string | undefined;
    /**
     * Set it to "1" if you need to run E2E tests locally
     **/
    readonly NEXT_PUBLIC_IS_E2E: "1" | undefined;
    /**
     * This is used so we can enable Mailhog in E2E tests.
     */
    readonly E2E_TEST_MAILHOG_ENABLED: "1" | undefined;
    readonly NEXT_PUBLIC_APP_NAME: string | "Cal";
    readonly NEXT_PUBLIC_SUPPORT_MAIL_ADDRESS: string | "help@cal.com";
    readonly NEXT_PUBLIC_COMPANY_NAME: string | "Cal.com, Inc.";
    readonly NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL: string | undefined;
    readonly NEXT_PUBLIC_WEBSITE_TERMS_URL: string | undefined;
    /**
     *  "strict" -> Strict CSP
     *  "non-strict" -> Strict CSP except the usage of unsafe-inline for `style-src`
     */
    readonly CSP_POLICY: "strict" | "non-strict";
  }
}
