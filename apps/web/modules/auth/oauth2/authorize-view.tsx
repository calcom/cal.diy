"use client";

/* eslint-disable react-hooks/exhaustive-deps */
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

import { APP_NAME } from "@calcom/lib/constants";
import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import useMeQuery from "@calcom/trpc/react/hooks/useMeQuery";
import { Avatar } from "@calcom/ui/components/avatar";
import { Button } from "@calcom/ui/components/button";
import { Select } from "@calcom/ui/components/form";
import { InfoIcon, PlusIcon } from "@coss/ui/icons";
import { Tooltip } from "@calcom/ui/components/tooltip";

export function Authorize() {
  const { t } = useLocale();
  const { status } = useSession();
  const { data: user } = useMeQuery();

  const router = useRouter();
  const searchParams = useCompatSearchParams();

  const client_id = (searchParams?.get("client_id") as string) || "";
  const redirect_uri = searchParams?.get("redirect_uri") as string;
  const state = searchParams?.get("state") as string;
  const scope = searchParams?.get("scope") as string;
  const code_challenge = searchParams?.get("code_challenge") as string;
  const code_challenge_method = searchParams?.get("code_challenge_method") as string;
  const show_account_selector = searchParams?.get("show_account_selector") === "true";

  const queryString = searchParams?.toString();

  const [selectedAccount, setSelectedAccount] = useState<{
    value: string;
    label: string;
  } | null>();
  const scopes = parseOAuthScopes(scope);

  const {
    data: client,
    error: getClientError,
    isPending: isPendingGetClient,
  } = trpc.viewer.oAuth.getClientForAuthorization.useQuery(
    {
      clientId: client_id as string,
      redirectUri: redirect_uri,
    },
    {
      enabled: status === "authenticated" && !!redirect_uri,
    }
  );

  const { data, isPending: isPendingProfiles } =
    trpc.viewer.loggedInViewerRouter.teamsAndUserProfilesQuery.useQuery(undefined, {
      enabled: show_account_selector,
    });

  const generateAuthCodeMutation = trpc.viewer.oAuth.generateAuthCode.useMutation({
    onSuccess: (data) => {
      window.location.href =
        data.redirectUrl ?? `${client?.redirectUri}?code=${data.authorizationCode}&state=${state}`;
    },
    onError: (error) => {
      if (client?.redirectUri) {
        redirectToOAuthError({
          redirectUri: client.redirectUri,
          trpcError: error,
          state,
        });
      }
    },
  });

  const mappedProfiles = data
    ? data
        .filter((profile) => !profile.readOnly)
        .map((profile) => ({
          label: profile.name || profile.slug || "",
          value: profile.slug || "",
        }))
    : [];

  useEffect(() => {
    if (show_account_selector && mappedProfiles.length > 0) {
      setSelectedAccount(mappedProfiles[0]);
    }
  }, [isPendingProfiles, show_account_selector]);

  // Auto-authorize trusted clients
  useEffect(() => {
    if (client?.isTrusted) {
      generateAuthCodeMutation.mutate({
        clientId: client_id as string,
        redirectUri: client.redirectUri,
        scopes,
        codeChallenge: code_challenge || undefined,
        codeChallengeMethod: (code_challenge_method as "S256") || undefined,
        state,
      });
    }
  }, [client?.isTrusted]);

  useEffect(() => {
    if (status === "unauthenticated") {
      const urlSearchParams = new URLSearchParams({
        callbackUrl: `auth/oauth2/authorize?${queryString}`,
      });
      // Pass register param directly so login page can hide "Don't have an account" link
      const registerParam = searchParams?.get("register");
      if (registerParam) {
        urlSearchParams.set("register", registerParam);
      }
      router.replace(`/auth/login?${urlSearchParams.toString()}`);
    }
  }, [status]);

  if (getClientError) {
    return <div>{getClientError.message}</div>;
  }

  if (isPendingGetClient || (show_account_selector && isPendingProfiles) || status !== "authenticated") {
    return <></>;
  }

  if (!client) {
    return <div>{t("unauthorized")}</div>;
  }

  // Don't show UI for trusted clients, they'll auto-authorize
  if (client.isTrusted) {
    return (
      <div className="flex justify-center pt-32">
        <div className="flex items-center space-x-3">
          <span className="text-lg font-medium text-gray-700">{t("authorizing")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center min-h-screen">
      <div className="px-9 pt-2 pb-3 mt-2 max-w-xl rounded-md border bg-default border-subtle">
        <div className="flex justify-center items-center">
          <Avatar
            alt=""
            fallback={<PlusIcon className="w-6 h-6 text-subtle" />}
            className="items-center"
            imageSrc={client.logo}
            size="lg"
          />
          <div className="relative -ml-6 w-24 h-24">
            <div className="flex absolute inset-0 justify-center items-center">
              <div className="bg-default flex h-[70px] w-[70px] items-center  justify-center rounded-full">
                <img src="/cal-com-icon.svg" alt="Logo" className="w-16 h-16 rounded-full" />
              </div>
            </div>
          </div>
        </div>
        <h1 className="px-5 pt-3 pb-3 text-2xl font-semibold tracking-tight text-center">
          {t("access_cal_account", {
            clientName: client.name,
            appName: APP_NAME,
          })}
        </h1>
        {!show_account_selector && (
          <div className="flex flex-col justify-center items-center mb-6 text-sm text-gray-600">
            <div className="flex gap-2 items-center" data-testid="signed-in-user">
              <Avatar
                size="sm"
                alt={user?.username ? t("avatar_of_username", { username: user.username }) : t("avatar")}
                imageSrc={user?.avatarUrl ?? user?.avatar}
              />
              <Tooltip content={user?.email} side="bottom">
                <span className="cursor-default">
                  {t("signed_in_as", { name: user?.name || user?.email })}
                </span>
              </Tooltip>
            </div>
          </div>
        )}
        {show_account_selector && (
          <>
            <div className="mb-1 text-sm font-medium">{t("select_account_team")}</div>
            <Select
              isSearchable={true}
              id="account-select"
              onChange={(value) => {
                setSelectedAccount(value);
              }}
              className="w-52"
              defaultValue={selectedAccount || mappedProfiles[0]}
              options={mappedProfiles}
            />
          </>
        )}
        <div className="mt-8 mb-4 text-sm font-semibold">
          {t("allow_client_to", { clientName: client.name })}
        </div>
        <ul className="text-sm stack-y-3">
          <li className="relative pl-5">
            <span className="absolute left-0">&#10003;</span>{" "}
            {t("associate_with_cal_account", { clientName: client.name })}
          </li>
          <li className="relative pl-5">
            <span className="absolute left-0">&#10003;</span>
            {t("see_personal_info")}
          </li>
          <li className="relative pl-5">
            <span className="absolute left-0">&#10003;</span>
            {t("see_primary_email_address")}
          </li>
          <li className="relative pl-5">
            <span className="absolute left-0">&#10003;</span>
          </li>
          <li className="relative pl-5">
            <span className="absolute left-0">&#10003;</span>
            {t("access_event_type")}
          </li>
          <li className="relative pl-5">
            <span className="absolute left-0">&#10003;</span>
            {t("access_availability")}
          </li>
          <li className="relative pl-5">
            <span className="absolute left-0">&#10003;</span>
            {t("access_bookings")}
          </li>
        </ul>
        <div className="flex p-3 mt-8 mb-8 rounded-md bg-subtle">
          <div>
            <InfoIcon className="mr-1 mt-0.5 h-4 w-4" />
          </div>
          <div className="ml-1">
            <div className="mb-1 text-sm font-medium">
              {t("allow_client_to_do", { clientName: client.name })}
            </div>
            <div className="text-sm">{t("oauth_access_information", { appName: APP_NAME })}</div>{" "}
          </div>
        </div>
        <div className="-mx-9 mb-4 border-b border-subtle border-" />
        <div className="flex justify-end">
          <Button
            className="mr-2"
            color="minimal"
            onClick={() => {
              const separator = client.redirectUri.includes("?") ? "&" : "?";
              const params = new URLSearchParams();
              params.set("error", "access_denied");
              if (state) {
                params.set("state", state);
              }
              window.location.href = `${client.redirectUri}${separator}${params.toString()}`;
            }}>
            {t("go_back")}
          </Button>
          <Button
            onClick={() => {
              generateAuthCodeMutation.mutate({
                clientId: client_id as string,
                scopes,
                redirectUri: client.redirectUri,
                teamSlug: selectedAccount?.value.startsWith("team/")
                  ? selectedAccount?.value.substring(5)
                  : undefined, // team account starts with /team/<slug>
                codeChallenge: code_challenge || undefined,
                codeChallengeMethod: (code_challenge_method as "S256") || undefined,
                state,
              });
            }}
            data-testid="allow-button">
            {t("allow")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function mapTrpcCodeToOAuthError(code: string | undefined) {
  if (code === "BAD_REQUEST") return "invalid_request";
  if (code === "UNAUTHORIZED") return "unauthorized_client";
  return "server_error";
}

function buildOAuthErrorRedirectUrl({
  redirectUri,
  error,
  errorDescription,
  state,
}: {
  redirectUri: string;
  error: string;
  errorDescription?: string;
  state?: string;
}) {
  const errorParams = new URLSearchParams({
    error,
  });

  if (errorDescription) {
    errorParams.append("error_description", errorDescription);
  }

  if (state) {
    errorParams.append("state", state);
  }

  return `${redirectUri}${redirectUri.includes("?") ? "&" : "?"}${errorParams.toString()}`;
}

function redirectToOAuthError({
  redirectUri,
  trpcError,
  state,
}: {
  redirectUri: string;
  trpcError: { data?: { code?: string } | null; message: string };
  state?: string;
}) {
  const redirectUrl = buildOAuthErrorRedirectUrl({
    redirectUri,
    error: mapTrpcCodeToOAuthError(trpcError.data?.code),
    errorDescription: trpcError.message,
    state,
  });

  window.location.href = redirectUrl;
}

export function parseOAuthScopes(scope: string | null | undefined): string[] {
  if (!scope) return [];
  return scope.toString().split(/[,\s]+/).filter(Boolean);
}

export default Authorize;
