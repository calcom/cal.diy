import { Button } from "@coss/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { FormError } from "~/components/AuthCard";
import { HydratedFieldset } from "~/components/HydratedFieldset";
import { TextField } from "~/components/TextField";
import { authClient } from "~/lib/auth-client";
import { AUTH_ERROR_MESSAGE_KEYS, AUTH_ERROR_VALUES, authErrorKey } from "~/lib/auth-errors";
import { useT } from "~/lib/i18n";
import { loadMessages } from "~/lib/messages";
import { OIDC_PROVIDER_ID } from "~/lib/oidc";
import { getAuthProviders } from "~/server/auth/providers";
import { getSecurity } from "~/server/profile/functions";

const MESSAGE_KEYS = [
  "change_password",
  "current_password",
  "new_password",
  "invalid_password_hint",
  "update",
  "password_has_been_changed",
  "account_managed_by_identity_provider",
  "account_managed_by_identity_provider_description",
  ...AUTH_ERROR_MESSAGE_KEYS,
];

function PasswordPage() {
  const { security, providers } = Route.useLoaderData();
  const t = useT();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [pending, setPending] = useState(false);

  if (!security.hasPassword) {
    const provider = security.identityProviderId === OIDC_PROVIDER_ID ? (providers.oidc ?? "SSO") : "Google";
    return (
      <div className="flex max-w-lg flex-col gap-1 text-sm">
        <p className="font-medium">{t("account_managed_by_identity_provider", { provider })}</p>
        <p className="text-muted-foreground">
          {t("account_managed_by_identity_provider_description", { provider })}
        </p>
      </div>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setErrorKey(null);
    setChanged(false);
    const { error } = await authClient.changePassword({
      currentPassword: String(form.get("currentPassword")),
      newPassword: String(form.get("newPassword")),
      // Anyone who learned the old password loses access with it.
      revokeOtherSessions: true,
    });
    setPending(false);
    if (error) {
      setErrorKey(authErrorKey(error));
      return;
    }
    formElement.reset();
    setChanged(true);
  }

  return (
    <HydratedFieldset>
      <form method="post" onSubmit={onSubmit} className="flex max-w-lg flex-col gap-4">
        <h2 className="font-heading text-lg">{t("change_password")}</h2>
        <TextField
          label={t("current_password")}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
        <TextField
          label={t("new_password")}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          hint={t("invalid_password_hint", AUTH_ERROR_VALUES)}
          required
        />
        <FormError message={errorKey && t(errorKey, AUTH_ERROR_VALUES)} />
        {changed && (
          <p role="status" className="text-sm text-success-foreground">
            {t("password_has_been_changed")}
          </p>
        )}
        <Button type="submit" className="self-start" disabled={pending}>
          {t("update")}
        </Button>
      </form>
    </HydratedFieldset>
  );
}

export const Route = createFileRoute("/_authed/settings/security/password")({
  loader: async ({ context }) => {
    const [messages, security, providers] = await Promise.all([
      loadMessages(context, MESSAGE_KEYS),
      getSecurity(),
      getAuthProviders(),
    ]);
    return { messages, security, providers };
  },
  component: PasswordPage,
});
