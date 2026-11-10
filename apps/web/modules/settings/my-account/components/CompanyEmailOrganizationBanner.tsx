"use client";

import { useRouter } from "next/navigation";

import { useFlagMap } from "@calcom/features/flags/context/provider";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";

import { MailIcon } from "./MailIcon";

type CompanyEmailOrganizationBannerProps = {
  onDismissAction: () => void;
};

export const CompanyEmailOrganizationBanner = ({ onDismissAction }: CompanyEmailOrganizationBannerProps) => {
  const { t } = useLocale();
  const router = useRouter();
  const flags = useFlagMap();

  const handleLearnMore = () => {
    const redirectPath = flags["onboarding-v3"]
      ? "/onboarding/organization/details?migrate=true"
      : "/settings/organizations/new";

    router.push(redirectPath);
  };

  const handleDismiss = () => {
    onDismissAction();
  };

  if (!flags["onboarding-v3"]) {
    return null;
  }

  return (
    <div className="border-subtle from-muted relative mb-6 overflow-hidden rounded-lg border bg-gradient-to-r to-transparent p-4">
      {/* Dot grid background with fade */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* Dot pattern - 12px spacing */}
          <pattern id="banner-dot-pattern" x="0" y="0" width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill="currentColor" className="text-subtle" opacity="0.3" />
          </pattern>
          {/* Fade mask from left to right */}
          <linearGradient id="banner-fade-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="10%" stopColor="white" stopOpacity="0.4" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id="banner-fade-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="url(#banner-fade-gradient)" />
          </mask>
        </defs>
        {/* Apply pattern with mask */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="url(#banner-dot-pattern)"
          mask="url(#banner-fade-mask)"
        />
      </svg>

      <div className="relative z-10 flex gap-4">
        <div>
          <MailIcon />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-col">
            <h3 className="text-default text-sm font-semibold">
              {t("it_appears_you_are_using_company_email")}
            </h3>
            <p className="text-default text-sm">{t("explore_organizational_plan_description")}</p>
          </div>
          <div className="mt-2 flex gap-2">
            <Button color="secondary" onClick={handleDismiss}>
              {t("dismiss")}
            </Button>
            <Button color="primary" EndIcon="external-link" onClick={handleLearnMore}>
              {t("upgrade")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
