import { getTranslate } from "app/_utils";
import type { Metadata } from "next";

import { IS_DUB_REFERRALS_ENABLED } from "@calcom/lib/constants";

import Shell from "~/shell/Shell";

import { DubReferralsPage } from "./DubReferralsPage";

export const metadata: Metadata = {
  title: "horium.dev referral program - Earn money by sharing your link",
  description:
    "Earn 20% recurring commissions for a full year by referring others to horium.dev, while giving your referrals 20% off for 12 months. Share your link and start earning today!",
};

// Export the appropriate component based on the feature flag
export default async function ReferralsPage() {
  const t = await getTranslate();

  return (
    <Shell withoutMain={true}>
      {IS_DUB_REFERRALS_ENABLED ? (
        <div className="-m-4 sm:-mt-6 md:-mt-4">
          <DubReferralsPage />
        </div>
      ) : (
        <div className="mx-auto max-w-4xl p-8 text-center">
          <h2 className="mb-4 text-xl font-semibold">{t("referral_program")}</h2>
          <p>{t("dub_disabled_error_message")}</p>
        </div>
      )}
    </Shell>
  );
}
