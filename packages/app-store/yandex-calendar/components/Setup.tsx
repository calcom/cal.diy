import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { Toaster, toast } from "sonner";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { Form, PasswordField, TextField } from "@calcom/ui/components/form";
import { Icon } from "@calcom/ui/components/icon";

const defaultValues = {
  username: "",
  password: "",
} as const;

export default function YandexSetup() {
  const [isConnected, setIsConnected] = useState(false);
  const form = useForm({
    defaultValues,
  });
  const router = useRouter();
  const { t } = useLocale();

  const submit: SubmitHandler<typeof defaultValues> = useCallback(async (values) => {
    try {
      const res = await fetch("/api/integrations/yandex-calendar/add", {
        method: "POST",
        body: JSON.stringify(values),
        headers: {
          "Content-Type": "application/json",
        },
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.message || t("something_went_wrong"));
        return;
      } else {
        setIsConnected(true);
        toast.success("Yandex Calendar connected successfully");
        router.push(json.url);
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      toast.error(t("unable_to_add_yandex_calendar"));
    }
  }, []);

  return (
    <div className="bg-default flex h-screen">
      <div className="bg-default border-subtle m-auto max-w-[43em] overflow-auto rounded border pb-10 md:p-10">
        <div className="ml-2 ltr:mr-2 rtl:ml-2 md:ml-5">
          <div className="invisible md:visible">
            <img className="h-11" src="/api/app-store/yandex-calendar/icon.svg" alt="Yandex Calendar Logo" />
            <p className="text-default mt-5 text-lg">Yandex Calendar</p>
          </div>
          <div>
            <p className="text-lgf text-default mt-5 font-bold">Setting up Yandex Calendar</p>
            <p className="text-default font-semi mt-2">
              When using Yandex Calendar through other apps like Cal.com, you should never use your main
              Yandex account password. Instead, create a new app password specifically for Cal.com.
            </p>
            <ol className="text-default ml-1 mt-5 list-decimal pl-2">
              <li>
                Enter your Yandex account email in the{" "}
                <a className="underline decoration-dashed" href="#yandex-email-field">
                  Email
                </a>{" "}
                field.
              </li>
              <li>
                Go to{" "}
                <a
                  className="text-orange-600 underline"
                  href="https://passport.yandex.com/auth"
                  target="_blank"
                  rel="noopener noreferrer">
                  Yandex Passport <Icon name="external-link" className="inline-block" />
                </a>{" "}
                and log in with your Yandex account.
              </li>
              <li>
                Click on the{" "}
                <a
                  className="text-orange-600 underline"
                  href="https://id.yandex.com/security"
                  target="_blank"
                  rel="noopener noreferrer">
                  Security <Icon name="external-link" className="inline-block" />
                </a>{" "}
                tab in the left sidebar.
              </li>
              <li>
                In the "Access to your data" section, click on{" "}
                <a
                  className="text-orange-600 underline"
                  href="https://id.yandex.com/security/app-passwords"
                  target="_blank"
                  rel="noopener noreferrer">
                  App Passwords <Icon name="external-link" className="inline-block" />
                </a>
                .
              </li>
              <li>Scroll down to "Create an app password" and click on "Calendar".</li>
              <li>Enter a name for your app password (ex: Cal.com).</li>
              <li>
                Copy the app password and paste it into the{" "}
                <a className="underline decoration-dashed" href="#yandex-app-password-field">
                  App Password
                </a>{" "}
                field.
              </li>
              <li>Click on Save.</li>
            </ol>
          </div>

          <Form className="mt-5 space-y-4" form={form} handleSubmit={submit}>
            <fieldset
              className="space-y-4"
              disabled={form.formState.isSubmitting || isConnected}
              data-testid="yandex-calendar-form">
              <TextField
                required
                id="yandex-email-field"
                type="text"
                {...form.register("username")}
                label="Email"
                placeholder="example@yandex.com"
                data-testid="yandex-calendar-email"
              />
              <PasswordField
                required
                id="yandex-app-password-field"
                {...form.register("password")}
                label="App Password"
                placeholder="•••••••••••••"
                autoComplete="password"
                data-testid="yandex-calendar-password"
              />
            </fieldset>

            <div className="mt-5 justify-end space-x-2 rtl:space-x-reverse sm:mt-4 sm:flex">
              <Button type="button" color="secondary" onClick={() => router.back()}>
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                loading={form.formState.isSubmitting || isConnected}
                data-testid="yandex-calendar-login-button">
                {t("save")}
              </Button>
            </div>
          </Form>
        </div>
      </div>
      <Toaster position="bottom-right" />
    </div>
  );
}
