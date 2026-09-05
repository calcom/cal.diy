"use client";

import { useState } from "react";

import { isDelegationCredential } from "@calcom/lib/delegationCredential";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import type { ButtonProps } from "@calcom/ui/components/button";
import { DisconnectIntegrationComponent } from "@calcom/ui/components/disconnect-calendar-integration";
import { showToast } from "@calcom/ui/components/toast";

export default function DisconnectIntegration(props: {
  credentialId: number;
  teamId?: number | null;
  label?: string;
  onSuccess?: () => void;
  buttonProps?: ButtonProps;
}) {
  const { t } = useLocale();
  const { onSuccess, credentialId, teamId } = props;
  const [modalOpen, setModalOpen] = useState(false);
  const utils = trpc.useUtils();

  const mutation = trpc.viewer.credentials.delete.useMutation({
    onSuccess: () => {
      showToast(t("app_removed_successfully"), "success");
      setModalOpen(false);
      onSuccess && onSuccess();
    },
    onError: () => {
      showToast(t("error_removing_app"), "error");
      setModalOpen(false);
    },
    async onSettled() {
      await utils.viewer.calendars.connectedCalendars.invalidate();
      await utils.viewer.apps.integrations.invalidate();
    },
  });

  // Such a credential is added in-memory and removed when Delegation credential is disabled.
  const disableDisconnect = isDelegationCredential({ credentialId });
  return (
    <DisconnectIntegrationComponent
      onDeletionConfirmation={() => mutation.mutate({ id: credentialId, ...(teamId ? { teamId } : {}) })}
      isModalOpen={modalOpen}
      onModalOpen={() => setModalOpen((prevValue) => !prevValue)}
      disabled={disableDisconnect}
      {...props}
    />
  );
}
