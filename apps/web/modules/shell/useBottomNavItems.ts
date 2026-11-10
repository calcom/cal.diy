import { IS_DUB_REFERRALS_ENABLED } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { showToast } from "@calcom/ui/components/toast";
import type { NavigationItemType } from "./navigation/NavigationItem";

type BottomNavItemsProps = {
  publicPageUrl: string;
};

export function useBottomNavItems({ publicPageUrl }: BottomNavItemsProps): NavigationItemType[] {
  const { t } = useLocale();
  const utils = trpc.useUtils();

  return [
    {
      name: "view_public_page",
      href: publicPageUrl,
      icon: "external-link",
      target: "__blank",
    },
    {
      name: "copy_public_page_link",
      href: "",
      onClick: (e: { preventDefault: () => void }) => {
        e.preventDefault();
        navigator.clipboard.writeText(publicPageUrl);
        showToast(t("link_copied"), "success");
      },
      icon: "copy",
    },
    IS_DUB_REFERRALS_ENABLED
      ? {
          name: "referral_text",
          href: "/refer",
          icon: "gift",
        }
      : null,

    {
      name: "settings",
      href: "/settings/my-account/profile",
      icon: "settings",
    },
  ].filter(Boolean) as NavigationItemType[];
}
