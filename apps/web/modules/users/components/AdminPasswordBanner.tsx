import type { SessionContextValue } from "next-auth/react";
import Link from "next/link";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { TopBanner } from "@calcom/ui/components/top-banner";

export type AdminPasswordBannerProps = { data: SessionContextValue["data"] };

function getBannerMessageKey(reason: "both" | "password" | "2fa" | undefined): string {
  switch (reason) {
    case "password":
      return "invalid_admin_password_password_only";
    case "2fa":
      return "invalid_admin_password_2fa_only";
    case "both":
    default:
      return "invalid_admin_password_requirements";
  }
}

function getBannerAction(reason: "both" | "password" | "2fa" | undefined): {
  href: string;
  labelKey: string;
} {
  switch (reason) {
    case "2fa":
      return { href: "/settings/security/two-factor-auth", labelKey: "enable_2fa" };
    case "password":
    case "both":
    default:
      return { href: "/settings/security/password", labelKey: "change_password_admin" };
  }
}

function AdminPasswordBanner({ data }: AdminPasswordBannerProps) {
  const { t } = useLocale();

  if (data?.user.role !== "INACTIVE_ADMIN") return null;

  const messageKey = getBannerMessageKey(data.user.inactiveAdminReason);
  const { href, labelKey } = getBannerAction(data.user.inactiveAdminReason);

  return (
    <>
      <TopBanner
        text={t(messageKey, { user: data.user.username })}
        variant="warning"
        actions={
          <Link href={href} className="border-b border-b-black">
            {t(labelKey)}
          </Link>
        }
      />
    </>
  );
}

export default AdminPasswordBanner;
