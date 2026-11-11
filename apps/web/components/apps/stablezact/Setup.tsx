"use client";

import AppNotInstalledMessage from "@calcom/app-store/_components/AppNotInstalledMessage";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function StablezactSetup() {
  const router = useRouter();
  const { t } = useLocale();
  const [publicKey, setPublicKey] = useState("");

  const integrations = trpc.viewer.apps.integrations.useQuery({ variant: "payment", appId: "stablezact" });
  const [stablezactCredential] = integrations.data?.items || [];
  const [credentialId] = stablezactCredential?.userCredentialIds || [-1];
  const showContent = !!integrations.data && integrations.isSuccess && !!credentialId;

  const saveKeysMutation = trpc.viewer.apps.updateAppCredentials.useMutation({
    onSuccess: () => {
      showToast(t("stablezact_installed_successfully"), "success");
      router.push("/apps/installed/payment");
    },
    onError: (error) => {
      showToast(error.message, "error");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!credentialId || credentialId === -1) return;
    const trimmed = publicKey.trim();
    if (!trimmed.startsWith("pk_")) {
      showToast(t("stablezact_starts_with_pk"), "error");
      return;
    }
    saveKeysMutation.mutate({ credentialId, key: { public_key: trimmed } });
  };

  if (integrations.isPending) {
    return <div className="bg-emphasis absolute z-50 flex h-screen w-full items-center" />;
  }

  return (
    <div className="bg-default flex h-screen items-center justify-center">
      {showContent ? (
        <div className="border-subtle bg-default m-auto max-w-[43em] overflow-auto rounded border p-4 sm:p-10">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/app-store/stablezact/icon.png" alt="Stablezact" className="h-12 w-12 rounded" />
            <div>
              <h1 className="text-emphasis text-xl font-semibold">{t("stablezact_connect_title")}</h1>
              <p className="text-subtle text-sm">{t("stablezact_connect_description")}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <TextField
                label={t("stablezact_public_key")}
                type="text"
                placeholder="pk_your_public_key_here"
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
                required
              />
              <p className="text-subtle mt-1 text-xs">
                {t("stablezact_get_public_key")}{" "}
                <a
                  href="https://merchant.stablezact.com/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline">
                  {t("stablezact_settings")}
                </a>{" "}
                ({t("stablezact_starts_with_pk")})
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="submit" loading={saveKeysMutation.isPending} disabled={!publicKey.trim()}>
                {t("stablezact_connect_button")}
              </Button>
            </div>
          </form>

          <div className="bg-subtle mt-6 rounded-md p-4">
            <h3 className="text-emphasis font-medium">{t("stablezact_before_connecting")}</h3>
            <ul className="text-subtle mt-2 space-y-1 text-sm">
              <li>
                ✓ {t("stablezact_configure_wallets")}{" "}
                <a
                  href="https://merchant.stablezact.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline">
                  {t("stablezact_dashboard")}
                </a>
              </li>
              <li>✓ {t("stablezact_add_wallet_addresses")}</li>
              <li>✓ {t("stablezact_generate_public_key")}</li>
            </ul>
          </div>
        </div>
      ) : (
        <AppNotInstalledMessage appName="stablezact" />
      )}
    </div>
  );
}
