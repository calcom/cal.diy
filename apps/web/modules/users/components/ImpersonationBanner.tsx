import { useLocale } from "@calcom/lib/hooks/useLocale";
import { TopBanner } from "@calcom/ui/components/top-banner";
import type { SessionContextValue } from "next-auth/react";
import { signOut } from "next-auth/react";

export type ImpersonationBannerProps = { data: SessionContextValue["data"] };

function ImpersonationBanner({ data }: ImpersonationBannerProps) {
  const { t } = useLocale();

  if (!data?.user.impersonatedBy) return null;

  const displayName = data.user.username ?? data.user.email ?? "";

  return (
    <TopBanner
      text={t("impersonating_user_warning", { user: displayName })}
      variant="warning"
      actions={
        <button
          className="border-b border-b-black"
          onClick={() => signOut({ callbackUrl: "/settings/admin/users" })}>
          {t("impersonating_stop_instructions")}
        </button>
      }
    />
  );
}

export default ImpersonationBanner;
