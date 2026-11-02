import { Button } from "@coss/ui/components/button";
import { createFileRoute, Link, redirect, useHydrated, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthCard, FormError } from "~/components/AuthCard";
import { SOCIAL_SIGN_IN_MESSAGE_KEYS, SocialSignIn } from "~/components/SocialSignIn";
import { TextField } from "~/components/TextField";
import { authClient } from "~/lib/auth-client";
import { AUTH_ERROR_MESSAGE_KEYS, AUTH_ERROR_VALUES, authErrorKey } from "~/lib/auth-errors";
import { useT } from "~/lib/i18n";
import { loadMessages } from "~/lib/messages";
import { getAuthProviders } from "~/server/auth/providers";

const MESSAGE_KEYS = [
  "create_your_account",
  "username",
  "email_address",
  "password",
  "password_complexity_requirement",
  "create_account",
  "signup_with_google",
  "already_have_account",
  "login_instead",
  "loading",
  ...SOCIAL_SIGN_IN_MESSAGE_KEYS,
  ...AUTH_ERROR_MESSAGE_KEYS,
];

function SignupPage() {
  const { providers } = Route.useLoaderData();
  const navigate = useNavigate();
  const t = useT();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // See login.tsx: never allow a native (pre-hydration) submit of credentials.
  const hydrated = useHydrated();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username"));
    setPending(true);
    setErrorKey(null);
    const { error } = await authClient.signUp.email({
      name: username,
      username,
      email: String(form.get("email")),
      password: String(form.get("password")),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setPending(false);
    if (error) {
      setErrorKey(authErrorKey(error));
      return;
    }
    await navigate({ to: "/getting-started/$step", params: { step: "user-settings" } });
  }

  return (
    <AuthCard
      title={t("create_your_account")}
      footer={
        <>
          {t("already_have_account")}{" "}
          <Link
            to="/auth/login"
            search={{ callbackUrl: "/event-types" }}
            className="font-medium text-foreground underline-offset-4 hover:underline">
            {t("login_instead")}
          </Link>
        </>
      }>
      <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField label={t("username")} name="username" autoComplete="username" required />
        <TextField label={t("email_address")} name="email" type="email" autoComplete="email" required />
        <TextField
          label={t("password")}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={7}
          hint={t("password_complexity_requirement")}
          required
        />
        <FormError message={errorKey && t(errorKey, AUTH_ERROR_VALUES)} />
        <Button type="submit" disabled={pending || !hydrated}>
          {pending ? t("loading") : t("create_account")}
        </Button>
      </form>
      <SocialSignIn providers={providers} callbackURL={"/event-types"} googleLabelKey="signup_with_google" />
    </AuthCard>
  );
}

export const Route = createFileRoute("/auth/signup")({
  beforeLoad: ({ context }) => {
    if (context.user) throw redirect({ to: "/event-types" });
  },
  loader: async ({ context }) => {
    const [messages, providers] = await Promise.all([
      loadMessages(context, MESSAGE_KEYS),
      getAuthProviders(),
    ]);
    return { messages, providers };
  },
  component: SignupPage,
});
