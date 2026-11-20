"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Alert } from "@calcom/ui/components/alert";
import { Badge } from "@calcom/ui/components/badge";
import { SettingsToggle } from "@calcom/ui/components/form";
import { SkeletonButton, SkeletonContainer, SkeletonText } from "@calcom/ui/components/skeleton";
import DisableTwoFactorModal from "@components/settings/DisableTwoFactorModal";
import EnableTwoFactorModal from "@components/settings/EnableTwoFactorModal";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { refreshSessionOrSignOut } from "./refreshSessionOrSignOut";

const SkeletonLoader = () => {
  return (
    <SkeletonContainer>
      <div className="mb-8 mt-6 stack-y-6">
        <div className="flex items-center">
          <SkeletonButton className="mr-6 h-8 w-20 rounded-md p-5" />
          <SkeletonText className="h-8 w-full" />
        </div>
      </div>
    </SkeletonContainer>
  );
};

const TwoFactorAuthView = () => {
  const utils = trpc.useUtils();
  const { update } = useSession();

  const { t } = useLocale();
  const { data: user, isPending } = trpc.viewer.me.get.useQuery({ includePasswordAdded: true });

  const [enableModalOpen, setEnableModalOpen] = useState<boolean>(false);
  const [disableModalOpen, setDisableModalOpen] = useState<boolean>(false);

  if (isPending) return <SkeletonLoader />;

  const isCalProvider = user?.identityProvider === "CAL";
  const canSetupTwoFactor = !isCalProvider && !user?.twoFactorEnabled && !user?.passwordAdded;
  return (
    <>
      {canSetupTwoFactor && <Alert severity="neutral" message={t("2fa_disabled")} />}
      <SettingsToggle
        toggleSwitchAtTheEnd={true}
        data-testid="two-factor-switch"
        title={t("two_factor_auth")}
        description={t("add_an_extra_layer_of_security")}
        checked={user?.twoFactorEnabled ?? false}
        onCheckedChange={() =>
          user?.twoFactorEnabled ? setDisableModalOpen(true) : setEnableModalOpen(true)
        }
        Badge={
          <Badge className="mx-2 text-xs" variant={user?.twoFactorEnabled ? "success" : "gray"}>
            {user?.twoFactorEnabled ? t("enabled") : t("disabled")}
          </Badge>
        }
        switchContainerClassName="rounded-t-none border-t-0"
      />

      <EnableTwoFactorModal
        open={enableModalOpen}
        onOpenChange={() => setEnableModalOpen(!enableModalOpen)}
        onEnable={() => {
          setEnableModalOpen(false);
          void refreshSessionOrSignOut(update);
          utils.viewer.me.invalidate();
        }}
        onCancel={() => {
          setEnableModalOpen(false);
        }}
      />

      <DisableTwoFactorModal
        open={disableModalOpen}
        disablePassword={!isCalProvider}
        onOpenChange={() => setDisableModalOpen(!disableModalOpen)}
        onDisable={() => {
          setDisableModalOpen(false);
          void refreshSessionOrSignOut(update);
          utils.viewer.me.invalidate();
        }}
        onCancel={() => {
          setDisableModalOpen(false);
        }}
      />
    </>
  );
};

export default TwoFactorAuthView;
