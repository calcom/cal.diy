import type { PageProps } from "app/_types";
import { _generateMetadata, getTranslate } from "app/_utils";
import Link from "next/link";
import { z } from "zod";

import { IdentityProvider } from "@calcom/prisma/enums";
import { Button } from "@calcom/ui/components/button";
import { XIcon } from "@coss/ui/icons";

import AuthContainer from "@components/ui/AuthContainer";

export const generateMetadata = async () => {
  return await _generateMetadata(
    (t) => t("error"),
    () => "",
    undefined,
    undefined,
    "/auth/error"
  );
};

const querySchema = z.object({
  error: z.string().optional(),
  provider: z.string().optional(),
});

const ServerPage = async ({ searchParams }: PageProps) => {
  const t = await getTranslate();

  const { error, provider } = querySchema.parse({
    error: (await searchParams)?.error || undefined,
    provider: (await searchParams)?.provider || undefined,
  });

  // generate error message based on different errors
  const getErrorMessage = (error: string | undefined, provider: string | undefined) => {
    if (error === "user-creation-error") {
      return t("user_creation_error");
    } else if (error === "wrong-provider") {
      // showing user their original identity provider by which account is managed.
      const providerName =
        provider === IdentityProvider.GOOGLE
          ? "Google"
          : provider === IdentityProvider.CAL
            ? "Email and Password"
            : provider === IdentityProvider.SAML
              ? "SAML (like Okta)"
              : "your original login method";
      return t("account_managed_by_identity_provider_error", { provider: providerName });
    } else if (error === "saml-idp-not-authoritative") {
      return t("saml_idp_not_authoritative_error");
    } else if (error === "unverified-email") {
      return t("unverified_email_oauth_error");
    } else if (error === "no-account") {
      return t("aim_no_account_error");
    }
    return t("error_during_login") + (error ? ` Error code: ${error}` : "");
  };

  const errorMsg = getErrorMessage(error, provider);

  return (
    <AuthContainer>
      <div>
        <div className="bg-error mx-auto flex h-12 w-12 items-center justify-center rounded-full">
          <XIcon className="h-6 w-6 text-red-600" />
        </div>
        <div className="mt-3 text-center sm:mt-5">
          <h3 className="text-emphasis text-lg font-medium leading-6" id="modal-title">
            {errorMsg}
          </h3>
        </div>
      </div>
      <div className="mt-5 sm:mt-6">
        <Link href="/auth/login">
          <Button className="flex w-full justify-center">{t("go_back_login")}</Button>
        </Link>
      </div>
    </AuthContainer>
  );
};

export default ServerPage;
