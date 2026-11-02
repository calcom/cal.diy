import { Button } from "@coss/ui/components/button";
import { useHydrated } from "@tanstack/react-router";
import { authClient } from "~/lib/auth-client";
import { useT } from "~/lib/i18n";
import { OIDC_PROVIDER_ID } from "~/lib/oidc";
import type { getAuthProviders } from "~/server/auth/providers";

type Providers = Awaited<ReturnType<typeof getAuthProviders>>;

/** Translation keys the buttons use; add them to the page's MESSAGE_KEYS. */
export const SOCIAL_SIGN_IN_MESSAGE_KEYS = ["or", "continue_with"];

/** Sign-in buttons for the configured identity providers, below the email and password form. */
export function SocialSignIn({
  providers,
  callbackURL,
  googleLabelKey,
}: {
  providers: Providers;
  callbackURL: string;
  /** The page's own Google wording ("Continue with Google" or "Sign up with Google"). */
  googleLabelKey: string;
}) {
  const t = useT();
  const hydrated = useHydrated();
  if (!providers.google && !providers.oidc) return null;
  return (
    <>
      <div className="my-4 text-center text-muted-foreground text-xs">{t("or")}</div>
      <div className="flex flex-col gap-2">
        {providers.oidc && (
          <Button
            variant="outline"
            className="w-full"
            disabled={!hydrated}
            onClick={() => authClient.signIn.social({ provider: OIDC_PROVIDER_ID, callbackURL })}>
            {t("continue_with", { appName: providers.oidc })}
          </Button>
        )}
        {providers.google && (
          <Button
            variant="outline"
            className="w-full"
            disabled={!hydrated}
            onClick={() => authClient.signIn.social({ provider: "google", callbackURL })}>
            {t(googleLabelKey)}
          </Button>
        )}
      </div>
    </>
  );
}
