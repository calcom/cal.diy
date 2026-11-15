import { auth, Client, webln } from "@getalby/sdk";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import { Toaster } from "sonner";

import AppNotInstalledMessage from "@calcom/app-store/_components/AppNotInstalledMessage";
import { albyCredentialKeysSchema } from "@calcom/app-store/alby/lib/albyCredentialKeysSchema";
import type { IAlbySetupProps } from "@calcom/app-store/alby/pages/setup/_getServerSideProps";
import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { showToast } from "@calcom/ui/components/toast";
import { InfoIcon } from "@coss/ui/icons";

export default function AlbySetup(props: IAlbySetupProps) {
  const params = useCompatSearchParams();
  if (params?.get("callback") === "true") {
    return <AlbySetupCallback />;
  }

  return <AlbySetupPage {...props} />;
}

function AlbySetupCallback() {
  const [error, setError] = useState<string | null>(null);
  const searchParams = useCompatSearchParams();

  useEffect(() => {
    if (!searchParams) {
      return;
    }

    if (!window.opener) {
      setError("Something went wrong. Opener not available. Please contact support@getalby.com");
      return;
    }

    const code = searchParams?.get("code");
    const error = searchParams?.get("error");

    if (!code) {
      setError("declined");
    }
    if (error) {
      setError(error);
      alert(error);
      return;
    }

    window.opener.postMessage({
      type: "alby:oauth:success",
      payload: { code },
    });
    window.close();
  }, [searchParams]);

  return (
    <div>
      {error && <p>Authorization failed: {error}</p>}
      {!error && <p>Connecting...</p>}
    </div>
  );
}

function AlbySetupPage(props: IAlbySetupProps) {
  const router = useRouter();
  const { t } = useLocale();
  const integrations = trpc.viewer.apps.integrations.useQuery({ variant: "payment", appId: "alby" });
  const [albyPaymentAppCredentials] = integrations.data?.items || [];
  const [credentialId] = albyPaymentAppCredentials?.userCredentialIds || [-1];
  const showContent = !!integrations.data && integrations.isSuccess && !!credentialId;
  const saveKeysMutation = trpc.viewer.apps.updateAppCredentials.useMutation({
    onSuccess: () => {
      showToast(t("keys_have_been_saved"), "success");
      router.push("/event-types");
    },
    onError: (error) => {
      showToast(error.message, "error");
    },
  });

  const connectWithAlby = useCallback(async () => {
    const authClient = new auth.OAuth2User({
      client_id: props.clientId,
      client_secret: props.clientSecret,
      callback: `${process.env.NEXT_PUBLIC_WEBAPP_URL}/apps/alby/setup?callback=true`,
      scopes: ["invoices:read", "account:read"],
      user_agent: "cal.com",
    });

    const weblnOAuthProvider = new webln.OauthWeblnProvider({
      auth: authClient,
    });
    await weblnOAuthProvider.enable();

    const client = new Client(authClient);
    const accountInfo = await client.accountInformation({});
    // TODO: add a way to delete the endpoint when the app is uninstalled
    const webhookEndpoint = await client.createWebhookEndpoint({
      filter_types: ["invoice.incoming.settled"],
      url: `${process.env.NEXT_PUBLIC_WEBAPP_URL}/api/integrations/alby/webhook`,
      description: "horium.dev",
    });

    saveKeysMutation.mutate({
      credentialId,
      key: albyCredentialKeysSchema.parse({
        account_id: accountInfo.identifier,
        account_email: accountInfo.email,
        account_lightning_address: accountInfo.lightning_address,
        webhook_endpoint_id: webhookEndpoint.id,
        webhook_endpoint_secret: webhookEndpoint.endpoint_secret,
      }),
    });
  }, [credentialId, props.clientId, props.clientSecret, saveKeysMutation]);

  if (integrations.isPending) {
    return <div className="absolute z-50 flex h-screen w-full items-center bg-gray-200" />;
  }

  const albyIcon = (
    <>
      <img className="h-12 w-12 dark:hidden" src="/api/app-store/alby/icon-borderless.svg" alt="Alby Icon" />
      <img
        className="hidden h-12 w-12 dark:block"
        src="/api/app-store/alby/icon-borderless-dark.svg"
        alt="Alby Icon"
      />
    </>
  );

  return (
    <div className="bg-default flex h-screen">
      {showContent ? (
        <div className="flex w-full items-center justify-center p-4">
          <div className="bg-default border-subtle m-auto flex max-w-[43em] flex-col items-center justify-center gap-4 overflow-auto rounded border p-4 md:p-10">
            {!props.lightningAddress ? (
              <>
                <p className="text-default">
                  Create or connect to an existing Alby account to receive lightning payments for your paid
                  bookings.
                </p>
                <button
                  className="font-body flex h-10 w-56 items-center justify-center gap-2 rounded-md font-bold text-black shadow transition-all hover:brightness-90 active:scale-95"
                  style={{
                    background: "linear-gradient(180deg, #FFDE6E 63.72%, #F8C455 95.24%)",
                  }}
                  type="button"
                  onClick={connectWithAlby}>
                  {albyIcon}
                  <span className="mr-2">Connect with Alby</span>
                </button>
              </>
            ) : (
              <>
                {albyIcon}
                <p>Alby Connected!</p>
                <Badge>Email: {props.email}</Badge>
                <Badge>Lightning Address: {props.lightningAddress}</Badge>
              </>
            )}

            {/* TODO: remove when invoices are generated using user identifier */}
            <div className="mt-4 rounded bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              <InfoIcon className="mb-0.5 inline-flex h-4 w-4" /> Your Alby lightning address will be
              used to generate invoices. If you update your lightning address, please disconnect and setup the
              Alby app again.
            </div>
            <Link href="/apps/alby">
              <Button color="secondary">Go to App Store Listing</Button>
            </Link>
          </div>
        </div>
      ) : (
        <AppNotInstalledMessage appName="alby" />
      )}
      <Toaster position="bottom-right" />
    </div>
  );
}
