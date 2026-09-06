import { useLocale } from "@calcom/lib/hooks/useLocale";
import { localStorage } from "@calcom/lib/webstorage";
import classNames from "@calcom/ui/classNames";
import { useEffect, useState } from "react";

type LoginType = "saml" | "google" | "microsoft" | "oidc" | "credentials";

export function useLastUsed() {
  const [lastUsed, setLastUsed] = useState<LoginType>();

  useEffect(() => {
    const storedValue = localStorage.getItem("last_cal_login");
    if (storedValue) {
      setLastUsed(storedValue as LoginType);
    }
  }, []);

  useEffect(() => {
    if (lastUsed) {
      localStorage.setItem("last_cal_login", lastUsed);
    } else {
      localStorage.removeItem("last_cal_login");
    }
  }, [lastUsed]);

  return [lastUsed, setLastUsed] as const;
}

export const LastUsed = ({ className }: { className?: string }) => {
  const { t } = useLocale();
  return (
    <span className={classNames("text-subtle absolute right-3 text-xs", className)}>{t("last_used")}</span>
  );
};
