import { Alert, AlertDescription } from "@coss/ui/components/alert";
import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import QRCode from "qrcode";
import { type FormEvent, useState } from "react";
import { FormError } from "~/components/AuthCard";
import { HydratedFieldset } from "~/components/HydratedFieldset";
import { TextField } from "~/components/TextField";
import { authClient } from "~/lib/auth-client";
import { AUTH_ERROR_MESSAGE_KEYS, AUTH_ERROR_VALUES, authErrorKey } from "~/lib/auth-errors";
import { useT } from "~/lib/i18n";
import { loadMessages } from "~/lib/messages";
import { getSecurity } from "~/server/profile/functions";

const MESSAGE_KEYS = [
  "two_factor_auth",
  "add_an_extra_layer_of_security",
  "enabled",
  "disabled",
  "enable_2fa",
  "disable_2fa",
  "2fa_disabled",
  "2fa_confirm_current_password",
  "2fa_scan_image_or_use_code",
  "2fa_enter_six_digit_code",
  "two_factor_auth_qr_code",
  "2fa_code",
  "password",
  "continue",
  "cancel",
  "done",
  "backup_codes",
  "backup_code_instructions",
  "copy",
  "copied",
  "download",
  "admin_needs_two_factor",
  ...AUTH_ERROR_MESSAGE_KEYS,
];

type Step =
  | { kind: "idle" }
  | { kind: "password"; action: "enable" | "disable" }
  | { kind: "scan"; qrDataUrl: string; secret: string; backupCodes: string[] }
  | { kind: "backup-codes"; backupCodes: string[] };

function secretFromTotpUri(uri: string): string {
  return new URL(uri).searchParams.get("secret") ?? "";
}

function TwoFactorPage() {
  const { security } = Route.useLoaderData();
  const { adminRequired } = Route.useSearch();
  const t = useT();
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  function reset() {
    setStep({ kind: "idle" });
    setErrorKey(null);
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.kind !== "password") return;
    const password = String(new FormData(event.currentTarget).get("password"));
    setPending(true);
    setErrorKey(null);
    if (step.action === "disable") {
      const { error } = await authClient.twoFactor.disable({ password });
      setPending(false);
      if (error) return setErrorKey(authErrorKey(error));
      reset();
      await router.invalidate();
      return;
    }
    const { data, error } = await authClient.twoFactor.enable({ password });
    // Only TOTP is configured, so an "otp" answer would mean the server config changed underneath us.
    if (error || !data || data.method !== "totp") {
      setPending(false);
      return setErrorKey(authErrorKey(error));
    }
    const qrDataUrl = await QRCode.toDataURL(data.totpURI);
    setPending(false);
    setStep({
      kind: "scan",
      qrDataUrl,
      secret: secretFromTotpUri(data.totpURI),
      backupCodes: data.backupCodes,
    });
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.kind !== "scan") return;
    const code = String(new FormData(event.currentTarget).get("code")).trim();
    setPending(true);
    setErrorKey(null);
    // 2FA only switches on once a code proves the authenticator was set up correctly.
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (error) return setErrorKey(authErrorKey(error));
    setStep({ kind: "backup-codes", backupCodes: step.backupCodes });
  }

  async function copyCodes(codes: string[]) {
    await navigator.clipboard.writeText(codes.join("\n"));
    setCopied(true);
  }

  function downloadCodes(codes: string[]) {
    const url = URL.createObjectURL(new Blob([codes.join("\n")], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "cal-diy-backup-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  const error = <FormError message={errorKey && t(errorKey, AUTH_ERROR_VALUES)} />;

  return (
    <HydratedFieldset className="flex max-w-lg flex-col gap-4">
      {adminRequired && !security.twoFactorEnabled && (
        <Alert variant="warning">
          <AlertDescription>{t("admin_needs_two_factor")}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-lg">
            {t("two_factor_auth")}
            <Badge variant={security.twoFactorEnabled ? "success" : "secondary"}>
              {security.twoFactorEnabled ? t("enabled") : t("disabled")}
            </Badge>
          </h2>
          <p className="text-muted-foreground text-sm">{t("add_an_extra_layer_of_security")}</p>
        </div>
        {step.kind === "idle" && security.hasPassword && (
          <Button
            variant={security.twoFactorEnabled ? "outline" : "default"}
            onClick={() =>
              setStep({ kind: "password", action: security.twoFactorEnabled ? "disable" : "enable" })
            }>
            {security.twoFactorEnabled ? t("disable_2fa") : t("enable_2fa")}
          </Button>
        )}
      </div>

      {!security.hasPassword && <p className="text-muted-foreground text-sm">{t("2fa_disabled")}</p>}

      {step.kind === "password" && (
        <form method="post" onSubmit={submitPassword} className="flex flex-col gap-4 rounded-lg border p-4">
          <p className="text-sm">{t("2fa_confirm_current_password")}</p>
          <TextField
            label={t("password")}
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          {error}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={reset}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {t("continue")}
            </Button>
          </div>
        </form>
      )}

      {step.kind === "scan" && (
        <form method="post" onSubmit={submitCode} className="flex flex-col gap-4 rounded-lg border p-4">
          <p className="text-sm">{t("2fa_scan_image_or_use_code")}</p>
          {/* biome-ignore lint/performance/noImgElement: a generated data URL; there is nothing to optimize */}
          <img src={step.qrDataUrl} alt={t("two_factor_auth_qr_code")} className="size-48 self-center" />
          <code
            className="break-all rounded bg-muted px-2 py-1 text-center text-sm"
            data-testid="totp-secret">
            {step.secret}
          </code>
          <TextField
            label={t("2fa_code")}
            hint={t("2fa_enter_six_digit_code")}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
          {error}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={reset}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {t("enable_2fa")}
            </Button>
          </div>
        </form>
      )}

      {step.kind === "backup-codes" && (
        <div className="flex flex-col gap-4 rounded-lg border p-4">
          <h3 className="font-medium">{t("backup_codes")}</h3>
          <p className="text-muted-foreground text-sm">{t("backup_code_instructions")}</p>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm" data-testid="backup-codes">
            {step.backupCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => copyCodes(step.backupCodes)}>
              {copied ? t("copied") : t("copy")}
            </Button>
            <Button variant="outline" onClick={() => downloadCodes(step.backupCodes)}>
              {t("download")}
            </Button>
            <Button
              onClick={async () => {
                reset();
                await router.invalidate();
              }}>
              {t("done")}
            </Button>
          </div>
        </div>
      )}
    </HydratedFieldset>
  );
}

export const Route = createFileRoute("/_authed/settings/security/two-factor-auth")({
  validateSearch: (search: Record<string, unknown>): { adminRequired?: true } =>
    search.adminRequired === true || search.adminRequired === "true" ? { adminRequired: true } : {},
  loader: async ({ context }) => {
    const [messages, security] = await Promise.all([loadMessages(context, MESSAGE_KEYS), getSecurity()]);
    return { messages, security };
  },
  component: TwoFactorPage,
});
