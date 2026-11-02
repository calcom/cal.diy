import { Button } from "@coss/ui/components/button";
import { createFileRoute, Link, redirect, useHydrated, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthCard, FormError } from "~/components/AuthCard";
import { SOCIAL_SIGN_IN_MESSAGE_KEYS, SocialSignIn } from "~/components/SocialSignIn";
import { TextField } from "~/components/TextField";
import { authClient } from "~/lib/auth-client";
import { AUTH_ERROR_MESSAGE_KEYS, AUTH_ERROR_VALUES, authErrorKey, safeCallbackUrl } from "~/lib/auth-errors";
import { normalizeBackupCode } from "~/lib/backup-codes";
import { useT } from "~/lib/i18n";
import { loadMessages } from "~/lib/messages";
import { getAuthProviders } from "~/server/auth/providers";

const MESSAGE_KEYS = [
  "welcome_back",
  "sign_in_account",
  "email_address",
  "password",
  "sign_in",
  "continue_with_google",
  "dont_have_an_account",
  "create_account",
  "loading",
  "forgot_password",
  "2fa_code",
  "2fa_enter_six_digit_code",
  "backup_code",
  "lost_access",
  "back",
  ...SOCIAL_SIGN_IN_MESSAGE_KEYS,
  ...AUTH_ERROR_MESSAGE_KEYS,
];

function LoginPage() {
  const { providers } = Route.useLoaderData();
  const { callbackUrl } = Route.useSearch();
  const navigate = useNavigate();
  const t = useT();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [secondFactor, setSecondFactor] = useState<"totp" | "backup" | null>(null);
  // Until React hydrates, a click would fall back to a native form submit and post the
  // credentials to this page instead of the auth API, so the button stays disabled.
  const hydrated = useHydrated();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setErrorKey(null);
    const { data, error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (error) {
      setErrorKey(authErrorKey(error));
      return;
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      setSecondFactor("totp");
      return;
    }
    await navigate({ href: callbackUrl });
  }

  async function onSubmitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code")).trim();
    setPending(true);
    setErrorKey(null);
    const { error } =
      secondFactor === "backup"
        ? await authClient.twoFactor.verifyBackupCode({ code: normalizeBackupCode(code) })
        : await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (error) {
      setErrorKey(authErrorKey(error));
      return;
    }
    await navigate({ href: callbackUrl });
  }

  if (secondFactor) {
    return (
      <AuthCard
        title={t("2fa_code")}
        subtitle={secondFactor === "totp" ? t("2fa_enter_six_digit_code") : undefined}>
        <form method="post" onSubmit={onSubmitCode} className="flex flex-col gap-4">
          <TextField
            key={secondFactor}
            label={secondFactor === "totp" ? t("2fa_code") : t("backup_code")}
            name="code"
            autoComplete="one-time-code"
            inputMode={secondFactor === "totp" ? "numeric" : "text"}
            autoFocus
            required
          />
          <FormError message={errorKey && t(errorKey, AUTH_ERROR_VALUES)} />
          <Button type="submit" disabled={pending || !hydrated}>
            {pending ? t("loading") : t("sign_in")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setErrorKey(null);
              setSecondFactor(secondFactor === "totp" ? "backup" : "totp");
            }}>
            {secondFactor === "totp" ? t("lost_access") : t("back")}
          </Button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t("welcome_back")}
      subtitle={t("sign_in_account")}
      footer={
        <>
          {t("dont_have_an_account")}{" "}
          <Link to="/auth/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            {t("create_account")}
          </Link>
        </>
      }>
      <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField label={t("email_address")} name="email" type="email" autoComplete="email" required />
        <TextField
          label={t("password")}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        {providers.email && (
          <Link
            to="/auth/forgot-password"
            className="-mt-2 self-end text-muted-foreground text-sm underline-offset-4 hover:underline">
            {t("forgot_password")}
          </Link>
        )}
        <FormError message={errorKey && t(errorKey, AUTH_ERROR_VALUES)} />
        <Button type="submit" disabled={pending || !hydrated}>
          {pending ? t("loading") : t("sign_in")}
        </Button>
      </form>
      <SocialSignIn providers={providers} callbackURL={callbackUrl} googleLabelKey="continue_with_google" />
    </AuthCard>
  );
}

export const Route = createFileRoute("/auth/login")({
  validateSearch: (search: Record<string, unknown>) => ({ callbackUrl: safeCallbackUrl(search.callbackUrl) }),
  beforeLoad: ({ context, search }) => {
    if (context.user) throw redirect({ href: search.callbackUrl });
  },
  loader: async ({ context }) => {
    const [messages, providers] = await Promise.all([
      loadMessages(context, MESSAGE_KEYS),
      getAuthProviders(),
    ]);
    return { messages, providers };
  },
  component: LoginPage,
});
