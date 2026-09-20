/**
 * @deprecated
 * This file is deprecated. The only use of this file is to seed the database for E2E tests. Each test should take care of seeding it's own data going forward.
 */
import dotEnv from "dotenv";
import path from "node:path"

import { appStoreMetadata } from "@calcom/app-store/appStoreMetaData";
import { shouldEnableApp } from "@calcom/app-store/_utils/validateAppKeys";
import prisma from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { AppCategories } from "@calcom/prisma/enums";

dotEnv.config({ path: path.resolve(__dirname, "../.env") });
dotEnv.config({ path: path.resolve(__dirname, "../.env.appStore") });

async function createApp(
  /** The App identifier in the DB also used for public page in `/apps/[slug]` */
  slug: Prisma.AppCreateInput["slug"],
  /** The directory name for `/packages/app-store/[dirName]` */
  dirName: Prisma.AppCreateInput["dirName"],
  categories: Prisma.AppCreateInput["categories"],
  /** This is used so credentials gets linked to the correct app */
  type: Prisma.CredentialCreateInput["type"],
  keys?: Prisma.AppCreateInput["keys"],
  isTemplate?: boolean
) {
  try {
    const foundApp = await prisma.app.findFirst({
      /**
       * slug and dirName both are unique and any of them can be used to find the app uniquely
       * Using both here allows us to rename(after the app has been seeded already) `slug` or `dirName` while still finding the app to apply the change on.
       * Note: dirName is legacy and it is same as slug for all apps created through App-Store Cli.
       * - Take the case there was an app with slug `myvideo` and dirName `dirName-1` and that got seeded. Now, someone wants to rename the slug to `my-video`(more readable) for the app keeping dirName same.
       *    This would make this fn to be called with slug `my-video` and dirName `dirName-1`.
       *    Now, we can find the app because dirName would still match.
       * - Similar, if someone changes dirName keeping slug same, we can find the app because slug would still match.
       * - If both dirName and slug are changed, it will be added as a new entry in the DB.
       */
      where: {
        OR: [
          {
            slug,
          },
          {
            dirName,
          },
        ],
      },
    });

    // Only enable apps if they have valid keys (or don't require keys)
    const keysToValidate = (keys ?? foundApp?.keys) as Prisma.JsonValue | undefined;
    const enabled = shouldEnableApp(dirName, keysToValidate);
    const data = {
      slug,
      dirName,
      categories,
      ...(keys !== undefined && { keys }),
      enabled,
    };

    if (!foundApp) {
      await prisma.app.create({
        data,
      });
      console.log(`📲 Created ${isTemplate ? "template" : "app"}: '${slug}'`);
    } else {
      // We know that the app exists, so either it would have the same slug or dirName
      // Because update query can't have both slug and dirName, try to find the app to update by slug and dirName one by one
      // if there would have been a unique App.uuid, that never changes, we could have used that in update query.
      await prisma.app.update({
        where: { slug: foundApp.slug },
        data,
      });
      await prisma.app.update({
        where: { dirName: foundApp.dirName },
        data,
      });
      console.log(`📲 Updated ${isTemplate ? "template" : "app"}: '${slug}'`);
    }

    await prisma.credential.updateMany({
      // Credential should stop using type and instead use an App.uuid to refer to app deterministically. That uuid would never change even if slug/dirName changes.
      // This would allow credentials to be not orphaned when slug(appId) changes.
      where: { type },
      data: { appId: slug },
    });
  } catch (e) {
    console.log(`Could not upsert app: ${slug}. Error:`, e);
  }
}

export default async function main() {
  // Calendar apps
  await createApp("apple-calendar", "applecalendar", ["calendar"], "apple_calendar");
  if (
    process.env.BASECAMP3_CLIENT_ID &&
    process.env.BASECAMP3_CLIENT_SECRET &&
    process.env.BASECAMP3_USER_AGENT
  ) {
    await createApp("basecamp3", "basecamp3", ["other"], "basecamp3_other", {
      client_id: process.env.BASECAMP3_CLIENT_ID,
      client_secret: process.env.BASECAMP3_CLIENT_SECRET,
      user_agent: process.env.BASECAMP3_USER_AGENT,
    });
  }
  await createApp("caldav-calendar", "caldavcalendar", ["calendar"], "caldav_calendar");
  try {
    const { client_secret, client_id, redirect_uris } = JSON.parse(
      process.env.GOOGLE_API_CREDENTIALS || ""
    ).web;
    await createApp("google-calendar", "googlecalendar", ["calendar"], "google_calendar", {
      client_id,
      client_secret,
      redirect_uris,
    });
    await createApp("google-meet", "googlevideo", ["conferencing"], "google_video", {
      client_id,
      client_secret,
      redirect_uris,
    });
  } catch (e) {
    if (e instanceof Error) console.error("Error adding google credentials to DB:", e.message);
  }
  if (process.env.MS_GRAPH_CLIENT_ID && process.env.MS_GRAPH_CLIENT_SECRET) {
    await createApp("office365-calendar", "office365calendar", ["calendar"], "office365_calendar", {
      client_id: process.env.MS_GRAPH_CLIENT_ID,
      client_secret: process.env.MS_GRAPH_CLIENT_SECRET,
    });
    await createApp("msteams", "office365video", ["conferencing"], "office365_video", {
      client_id: process.env.MS_GRAPH_CLIENT_ID,
      client_secret: process.env.MS_GRAPH_CLIENT_SECRET,
    });
  }
  if (
    process.env.LARK_OPEN_APP_ID &&
    process.env.LARK_OPEN_APP_SECRET &&
    process.env.LARK_OPEN_VERIFICATION_TOKEN
  ) {
    await createApp("lark-calendar", "larkcalendar", ["calendar"], "lark_calendar", {
      app_id: process.env.LARK_OPEN_APP_ID,
      app_secret: process.env.LARK_OPEN_APP_SECRET,
      open_verification_token: process.env.LARK_OPEN_VERIFICATION_TOKEN,
    });
  }
  // Video apps
  if (process.env.DAILY_API_KEY) {
    await createApp("daily-video", "dailyvideo", ["conferencing"], "daily_video", {
      api_key: process.env.DAILY_API_KEY,
      scale_plan: process.env.DAILY_SCALE_PLAN,
    });
  }
  if (process.env.TANDEM_CLIENT_ID && process.env.TANDEM_CLIENT_SECRET) {
    await createApp("tandem", "tandemvideo", ["conferencing"], "tandem_video", {
      client_id: process.env.TANDEM_CLIENT_ID as string,
      client_secret: process.env.TANDEM_CLIENT_SECRET as string,
      base_url: (process.env.TANDEM_BASE_URL as string) || "https://tandem.chat",
    });
  }
  if (process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET) {
    await createApp("zoom", "zoomvideo", ["conferencing"], "zoom_video", {
      client_id: process.env.ZOOM_CLIENT_ID,
      client_secret: process.env.ZOOM_CLIENT_SECRET,
    });
  }
  await createApp("jitsi", "jitsivideo", ["conferencing"], "jitsi_video");
  // Other apps
  if (process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET) {
    await createApp("hubspot", "hubspot", ["crm"], "hubspot_other_calendar", {
      client_id: process.env.HUBSPOT_CLIENT_ID,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET,
    });
  }
  if (process.env.SALESFORCE_CONSUMER_KEY && process.env.SALESFORCE_CONSUMER_SECRET) {
    await createApp("salesforce", "salesforce", ["crm"], "salesforce_other_calendar", {
      consumer_key: process.env.SALESFORCE_CONSUMER_KEY,
      consumer_secret: process.env.SALESFORCE_CONSUMER_SECRET,
    });
  }
  if (process.env.ZOHOCRM_CLIENT_ID && process.env.ZOHOCRM_CLIENT_SECRET) {
    await createApp("zohocrm", "zohocrm", ["crm"], "zohocrm_other_calendar", {
      client_id: process.env.ZOHOCRM_CLIENT_ID,
      client_secret: process.env.ZOHOCRM_CLIENT_SECRET,
    });
  }

  await createApp("wipe-my-cal", "wipemycalother", ["automation"], "wipemycal_other");
  if (process.env.GIPHY_API_KEY) {
    await createApp("giphy", "giphy", ["other"], "giphy_other", {
      api_key: process.env.GIPHY_API_KEY,
    });
  }

  if (process.env.VITAL_API_KEY && process.env.VITAL_WEBHOOK_SECRET) {
    await createApp("vital-automation", "vital", ["automation"], "vital_other", {
      mode: process.env.VITAL_DEVELOPMENT_MODE || "sandbox",
      region: process.env.VITAL_REGION || "us",
      api_key: process.env.VITAL_API_KEY,
      webhook_secret: process.env.VITAL_WEBHOOK_SECRET,
    });
  }

  if (process.env.ZAPIER_INVITE_LINK) {
    await createApp("zapier", "zapier", ["automation"], "zapier_automation", {
      invite_link: process.env.ZAPIER_INVITE_LINK,
    });
  }
  await createApp("make", "make", ["automation"], "make_automation", {
    invite_link: "https://make.com/en/hq/app-invitation/6cb2772b61966508dd8f414ba3b44510",
  });

  if (process.env.HUDDLE01_API_TOKEN) {
    await createApp("huddle01", "huddle01video", ["conferencing"], "huddle01_video", {
      apiKey: process.env.HUDDLE01_API_TOKEN,
    });
  }

  if (
    process.env.KYZONSPACE_CLIENT_ID &&
    process.env.KYZONSPACE_CLIENT_SECRET &&
    process.env.KYZONSPACE_API_KEY
  ) {
    await createApp("kyzonspacevideo", "kyzonspacevideo", ["conferencing"], "kyzonspacevideo_video", {
      client_id: process.env.KYZONSPACE_CLIENT_ID,
      client_secret: process.env.KYZONSPACE_CLIENT_SECRET,
      api_key: process.env.KYZONSPACE_API_KEY,
    });
  }

  // Payment apps
  if (
    process.env.STRIPE_CLIENT_ID &&
    process.env.STRIPE_PRIVATE_KEY &&
    process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.PAYMENT_FEE_FIXED &&
    process.env.PAYMENT_FEE_PERCENTAGE
  ) {
    await createApp("stripe", "stripepayment", ["payment"], "stripe_payment", {
      client_id: process.env.STRIPE_CLIENT_ID,
      client_secret: process.env.STRIPE_PRIVATE_KEY,
      payment_fee_fixed: Number(process.env.PAYMENT_FEE_FIXED),
      payment_fee_percentage: Number(process.env.PAYMENT_FEE_PERCENTAGE),
      public_key: process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY,
      webhook_secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
  }

  if (process.env.CLOSECOM_CLIENT_ID && process.env.CLOSECOM_CLIENT_SECRET) {
    await createApp("closecom", "closecom", ["crm"], "closecom_crm", {
      client_id: process.env.CLOSECOM_CLIENT_ID,
      client_secret: process.env.CLOSECOM_CLIENT_SECRET,
    });
  }

  for (const [, app] of Object.entries(appStoreMetadata)) {
    if (app.isTemplate && process.argv[2] !== "seed-templates") {
      continue;
    }

    const validatedCategories = app.categories.filter(
      (category): category is AppCategories => category in AppCategories
    );

    await createApp(
      app.slug,
      app.dirName ?? app.slug,
      validatedCategories,
      app.type,
      undefined,
      app.isTemplate
    );
  }
}

if (require.main === module) {
  (async () => {
    await main();
  })()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
