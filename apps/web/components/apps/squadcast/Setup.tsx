import { validateToken } from "@calcom/app-store/squadcast/lib/squadcastApi";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Alert } from "@calcom/ui/components/alert";
import { Button } from "@calcom/ui/components/button";
import { Form, TextField } from "@calcom/ui/components/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Toaster } from "sonner";
import z from "zod";

const formSchema = z.object({
  api_token: z.string().min(1, "API token is required"),
});

export default function SquadCastSetup() {
  const { t } = useLocale();
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");
  const [testPassed, setTestPassed] = useState<boolean | undefined>(undefined);
  const [testLoading, setTestLoading] = useState(false);

  const form = useForm<{
    api_token: string;
  }>({
    resolver: zodResolver(formSchema),
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      if (testPassed === false) {
        setTestPassed(undefined);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [testPassed]);

  return (
    <div className="bg-emphasis flex h-screen">
      <div className="bg-default m-auto rounded p-5 md:w-[520px] md:p-10">
        <div className="flex flex-col stack-y-5 md:flex-row md:space-x-5 md:stack-y-0">
          <div>
            <img src="/api/app-store/squadcast/icon.svg" alt="SquadCast" className="h-12 w-12 max-w-2xl" />
          </div>
          <div>
            <h1 className="text-default">{t("provide_api_key")}</h1>
            <div className="mt-1 text-sm">
              {t("generate_api_key_description", { appName: "SquadCast" })}{" "}
              <a
                className="text-indigo-400"
                href="https://app.squadcast.fm/settings/api"
                target="_blank"
                rel="noopener noreferrer">
                SquadCast
              </a>
              . {t("it_stored_encrypted")}
            </div>
            <div className="my-2 mt-3">
              <Form
                form={form}
                handleSubmit={async (values) => {
                  setErrorMessage("");
                  const res = await fetch("/api/integrations/squadcast/add", {
                    method: "POST",
                    body: JSON.stringify(values),
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
                <fieldset className="stack-y-2" disabled={form.formState.isSubmitting}>
                  <Controller
                    name="api_token"
                    control={form.control}
                    render={({ field: { onBlur, onChange } }) => (
                      <TextField
                        className="my-0"
                        onBlur={onBlur}
                        disabled={testPassed === true}
                        name={t("api_token")}
                        placeholder={t("enter_token", {
                          appName: "SquadCast"
                        })}
                        type="password"
                        onChange={async (e) => {
                          onChange(e.target.value);
                          form.setValue("api_token", e.target.value);
                          await form.trigger("api_token");
                        }}
                      />
                    )}
                  />
                </fieldset>
                {errorMessage && <Alert severity="error" title={errorMessage} className="my-4" />}
                <div className="mt-5 justify-end space-x-2 rtl:space-x-reverse sm:mt-4 sm:flex">
                  <Button type="button" color="secondary" onClick={() => router.back()}>
                    {t("cancel")}
                  </Button>
                  <Button
                    type="button"
                    color="secondary"
                    loading={testLoading}
                    disabled={testPassed === true}
                    StartIcon={testPassed === undefined ? undefined : testPassed ? "check" : "x"}
                    className={
                      testPassed !== undefined
                        ? testPassed
                          ? " bg-cal-success! hover:bg-cal-success text-green-700!"
                          : "bg-error hover:bg-error border-red-700! text-red-700!"
                        : "secondary"
                    }
                    onClick={async () => {
                      const check = await form.trigger("api_token");
                      if (!check) return;
                      const api_token = form.getValues("api_token");
                      setTestLoading(true);
                      const isValid = await validateToken(api_token);
                      setTestPassed(isValid);
                      setTestLoading(false);
                    }}>
                    {t(
                      testPassed !== undefined ? (testPassed ? "test_passed" : "test_failed") : "test_api_key"
                    )}
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
