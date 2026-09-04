import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Toaster } from "sonner";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Alert } from "@calcom/ui/components/alert";
import { Button } from "@calcom/ui/components/button";
import { Form, TextField } from "@calcom/ui/components/form";
import { Icon } from "@calcom/ui/components/icon";

interface FormData {
  authMethod: "bunker" | "nsec";
  bunkerUri?: string;
  nsec?: string;
}

export default function NostrSetup() {
  const { t } = useLocale();
  const router = useRouter();
  const form = useForm<FormData>({
    defaultValues: {
      authMethod: "bunker", // Default to bunker as recommended
      bunkerUri: "",
      nsec: "",
    },
  });

  const [errorMessage, setErrorMessage] = useState("");
  const authMethod = form.watch("authMethod");

  return (
    <div className="bg-emphasis flex h-screen">
      <div className="bg-default m-auto rounded p-5 md:w-[560px] md:p-10">
        <div className="flex flex-col space-y-5 md:flex-row md:space-x-5 md:space-y-0">
          <div>
            <Image
              src="/api/app-store/nostrcalendar/icon.svg"
              alt="Nostr"
              width={48}
              height={48}
              className="h-12 w-12 max-w-2xl"
            />
          </div>
          <div className="flex w-10/12 flex-col">
            <h1 className="text-default">Connect to Nostr</h1>
            <div className="mt-1 text-sm">
              Choose how you want to authenticate with Nostr for managing your calendar events.
            </div>

            <div className="my-2 mt-3">
              <Form
                form={form}
                handleSubmit={async (values) => {
                  setErrorMessage("");

                  const res = await fetch("/api/integrations/nostrcalendar/add", {
                    method: "POST",
                    body: JSON.stringify({
                      authMethod: values.authMethod,
                      bunkerUri: values.bunkerUri,
                      nsec: values.nsec,
                    }),
                    headers: {
                      "Content-Type": "application/json",
                    },
                  });

                  const json = await res.json();
                  if (!res.ok) {
                    setErrorMessage(json?.message || t("something_went_wrong"));
                  } else {
                    router.push(json.url);
                  }
                }}>
                <fieldset className="space-y-4" disabled={form.formState.isSubmitting}>
                  {/* Authentication Method Selection */}
                  <div className="space-y-3">
                    <label className="text-default text-sm font-medium">Authentication Method</label>

                    <label className="border-default hover:bg-emphasis flex cursor-pointer items-start space-x-3 rounded-md border p-3 transition-colors">
                      <input type="radio" value="bunker" {...form.register("authMethod")} className="mt-1" />
                      <div className="flex-1">
                        <div className="text-default font-medium">
                          Bunker Connection{" "}
                          <span className="bg-success text-success ml-2 rounded px-2 py-0.5 text-xs font-medium">
                            Recommended
                          </span>
                        </div>
                        <div className="text-subtle mt-1 text-sm">
                          Keep your keys secure in a remote signer. Supports all features including private
                          events.
                        </div>
                      </div>
                    </label>

                    <label className="border-default hover:bg-emphasis flex cursor-pointer items-start space-x-3 rounded-md border p-3 transition-colors">
                      <input type="radio" value="nsec" {...form.register("authMethod")} className="mt-1" />
                      <div className="flex-1">
                        <div className="text-default font-medium">Private Key (nsec)</div>
                        <div className="text-subtle mt-1 text-sm">
                          Store encrypted key locally. Supports all features including private events.
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* Conditional Input Fields */}
                  {authMethod === "bunker" ? (
                    <>
                      <TextField
                        required
                        {...form.register("bunkerUri")}
                        label="Bunker URI"
                        placeholder="bunker://... or user@domain.com"
                        autoComplete="off"
                      />

                      <div className="rounded bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        <Icon name="info" className="mb-0.5 inline-flex h-4 w-4" /> Your keys stay secure in
                        the bunker. You&apos;ll need to approve the connection in your bunker app.
                      </div>

                      <details className="text-subtle text-sm">
                        <summary className="cursor-pointer font-medium">
                          What permissions will be requested?
                        </summary>
                        <ul className="mt-2 space-y-1 pl-5">
                          <li>• Sign calendar events (kinds 31922, 31923, 31927)</li>
                          <li>• Sign seals for private events (kind 13)</li>
                          <li>• Sign deletion events (kind 5)</li>
                          <li>• Encrypt/decrypt content (NIP-44)</li>
                        </ul>
                      </details>
                    </>
                  ) : (
                    <>
                      <TextField
                        required
                        type="password"
                        {...form.register("nsec")}
                        label="Nostr Private Key (nsec)"
                        placeholder="nsec1..."
                        autoComplete="off"
                      />

                      <div className="rounded bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        <Icon name="info" className="mb-0.5 inline-flex h-4 w-4" /> Your nsec key will be
                        encrypted before storage. Never share this key with anyone.
                      </div>
                    </>
                  )}

                  <div className="rounded bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                    <Icon name="info" className="mb-0.5 inline-flex h-4 w-4" /> Your relay list will be
                    automatically discovered from your kind 10002 relay list metadata.
                  </div>
                </fieldset>

                {errorMessage && <Alert severity="error" title={errorMessage} className="my-4" />}

                <div className="mt-5 justify-end space-x-2 rtl:space-x-reverse sm:mt-4 sm:flex">
                  <Button type="button" color="secondary" onClick={() => router.back()}>
                    {t("cancel")}
                  </Button>
                  <Button type="submit" loading={form.formState.isSubmitting}>
                    {t("save")}
                  </Button>
                </div>
              </Form>
            </div>
          </div>
        </div>
      </div>
      <Toaster position="bottom-right" />
    </div>
  );
}
