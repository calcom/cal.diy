"use client";

import process from "node:process";
import { ErrorCode } from "@calcom/features/auth/lib/ErrorCode";
import { HOSTED_CAL_FEATURES, WEBAPP_URL, WEBSITE_URL } from "@calcom/lib/constants";
import { emailRegex } from "@calcom/lib/emailSchema";
import { getSafeRedirectUrl } from "@calcom/lib/getSafeRedirectUrl";
import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Alert } from "@calcom/ui/components/alert";
import { Icon } from "@calcom/ui/components/icon";
import { LastUsed, useLastUsed } from "@calcom/web/modules/auth/hooks/useLastUsed";
import AddToHomescreen from "@components/AddToHomescreen";
import BackupCode from "@components/auth/BackupCode";
import TwoFactor from "@components/auth/TwoFactor";
import { Button } from "@coss/ui/components/button";
import { Field, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@coss/ui/components/input-group";
import { Separator } from "@coss/ui/components/separator";
import { zodResolver } from "@hookform/resolvers/zod";
import type { inferSSRProps } from "@lib/types/inferSSRProps";
import type { getServerSideProps } from "@server/lib/auth/login/getServerSideProps";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";

interface LoginValues {
  email: string;
  password: string;
  totpCode: string;
  backupCode: string;
  csrfToken: string;
}

const MicrosoftIcon = () => <img className="size-4" src="/microsoft-logo.svg" alt="" />;

const GoogleIcon = () => <img className="size-4" src="/google-icon-colored.svg" alt="" />;

function BackgroundGrid() {
  const rows = 9;
  const cols = 18;
  const size = 60;
  const gap = 8;
  const radius = 8;
  const width = cols * size + (cols - 1) * gap;
  const height = rows * size + (rows - 1) * gap;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
        className="[--grid-fill:#f7f7f7] [--grid-stroke:rgba(34,42,53,0.08)] dark:[--grid-fill:#1f1f1f] dark:[--grid-stroke:rgba(255,255,255,0.08)]">
        <defs>
          <radialGradient id="gridFade" cx="50%" cy="50%" rx="70%" ry="70%">
            <stop offset="20%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="gridMask">
            <rect width={width} height={height} fill="url(#gridFade)" />
          </mask>
          <filter id="gridShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="rgba(34,42,53,0.05)" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="rgba(19,19,22,0.03)" />
          </filter>
        </defs>
        <g mask="url(#gridMask)">
          {Array.from({ length: rows * cols }).map((_, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = col * (size + gap);
            const y = row * (size + gap);
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={size}
                height={size}
                rx={radius}
                fill="var(--grid-fill)"
                stroke="var(--grid-stroke)"
                strokeWidth="1"
                filter="url(#gridShadow)"
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
export type PageProps = inferSSRProps<typeof getServerSideProps>;
export default function Login({
  csrfToken,
  isGoogleLoginEnabled,
  isOutlookLoginEnabled,
  isOidcLoginEnabled,
  oidcProviderName,
  totpEmail,
}: PageProps) {
  const searchParams = useCompatSearchParams();
  const { t } = useLocale();
  const router = useRouter();
  const formSchema = z
    .object({
      email: z
        .string()
        .min(1, `${t("error_required_field")}`)
        .regex(emailRegex, `${t("enter_valid_email")}`),
      ...(totpEmail ? {} : { password: z.string().min(1, `${t("error_required_field")}`) }),
    })
    // Passthrough other fields like totpCode
    .passthrough();
  const methods = useForm<LoginValues>({ resolver: zodResolver(formSchema) });
  const { register, formState } = methods;
  const [twoFactorRequired, setTwoFactorRequired] = useState(!!totpEmail || false);
  const [twoFactorLostAccess, setTwoFactorLostAccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUsed, setLastUsed] = useLastUsed();
  const [showPassword, setShowPassword] = useState(false);

  const errorMessages: { [key: string]: string } = {
    // [ErrorCode.SecondFactorRequired]: t("2fa_enabled_instructions"),
    // Don't leak information about whether an email is registered or not
    [ErrorCode.IncorrectEmailPassword]: t("incorrect_email_password"),
    [ErrorCode.IncorrectTwoFactorCode]: `${t("incorrect_2fa_code")} ${t("please_try_again")}`,
    [ErrorCode.InternalServerError]: `${t("something_went_wrong")} ${t("please_try_again_and_contact_us")}`,
    [ErrorCode.ThirdPartyIdentityProviderEnabled]: t("account_created_with_identity_provider"),
  };

  let callbackUrl = searchParams?.get("callbackUrl") || "";

  if (/"\//.test(callbackUrl)) callbackUrl = callbackUrl.substring(1);

  // If not absolute URL, make it absolute
  if (!/^https?:\/\//.test(callbackUrl)) {
    callbackUrl = `${WEBAPP_URL}/${callbackUrl}`;
  }

  const safeCallbackUrl = getSafeRedirectUrl(callbackUrl);

  callbackUrl = safeCallbackUrl || "";

  const onSubmit = async (values: LoginValues) => {
    setErrorMessage(null);
    // telemetry.event(telemetryEventTypes.login, collectPageParameters());
    const res = await signIn<"credentials">("credentials", {
      ...values,
      callbackUrl,
      redirect: false,
    });
    if (!res) setErrorMessage(errorMessages[ErrorCode.InternalServerError]);
    // we're logged in! let's do a hard refresh to the desired url
    else if (!res.error) {
      setLastUsed("credentials");
      router.push(callbackUrl);
    } else if (res.error === ErrorCode.SecondFactorRequired) setTwoFactorRequired(true);
    else if (res.error === ErrorCode.IncorrectBackupCode) setErrorMessage(t("incorrect_backup_code"));
    else if (res.error === ErrorCode.MissingBackupCodes) setErrorMessage(t("missing_backup_codes"));
    // fallback if error not found
    else setErrorMessage(errorMessages[res.error] || t("something_went_wrong"));
  };

  const showSocialLogin = isGoogleLoginEnabled || isOutlookLoginEnabled || isOidcLoginEnabled;
  const showSignupLink =
    process.env.NEXT_PUBLIC_DISABLE_SIGNUP !== "true" && searchParams?.get("register") !== "false";

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-default/80 px-4 py-10">
      <BackgroundGrid />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        {/* Main Card */}
        <div className="w-full rounded-xl border border-subtle bg-default p-10 shadow-sm">
          {/* Logo */}
          <div className="mb-2 text-center">
            <h1 className="font-cal text-xl font-bold text-emphasis">Cal.diy</h1>
          </div>

          {/* Heading */}
          <p className="mb-8 text-center text-sm text-subtle" data-testid="login-subtitle">
            {twoFactorRequired ? t("2fa_code") : t("welcome_back_sign_in")}
          </p>

          <FormProvider {...methods}>
            {/* Social Login Buttons */}
            {!twoFactorRequired && showSocialLogin && (
              <>
                <div className="flex flex-col gap-2">
                  {isGoogleLoginEnabled && (
                    <Button
                      className="w-full py-1"
                      disabled={formState.isSubmitting}
                      data-testid="google"
                      onClick={async (e) => {
                        e.preventDefault();
                        setLastUsed("google");
                        await signIn("google", {
                          callbackUrl,
                        });
                      }}>
                      <GoogleIcon />
                      <span>{t("signin_with_google")}</span>
                      {lastUsed === "google" && <LastUsed />}
                    </Button>
                  )}
                  {isOutlookLoginEnabled && (
                    <Button
                      variant="outline"
                      className="w-full py-1"
                      data-testid="microsoft"
                      onClick={async (e) => {
                        e.preventDefault();
                        setLastUsed("microsoft");
                        await signIn("azure-ad", {
                          callbackUrl,
                        });
                      }}>
                      <MicrosoftIcon />
                      <span>{t("signin_with_microsoft")}</span>
                      {lastUsed === "microsoft" && <LastUsed />}
                    </Button>
                  )}
                  {isOidcLoginEnabled && (
                    <Button
                      variant="outline"
                      className="w-full py-1"
                      disabled={formState.isSubmitting}
                      data-testid="oidc"
                      onClick={async (e) => {
                        e.preventDefault();
                        setLastUsed("oidc");
                        await signIn("oidc", {
                          callbackUrl,
                        });
                      }}>
                      <Icon name="key" className="size-4" />
                      <span>{t("continue_with_oidc", { providerName: oidcProviderName })}</span>
                      {lastUsed === "oidc" && <LastUsed />}
                    </Button>
                  )}
                </div>

                {/* Divider */}
                <div className="my-6 flex items-center gap-4">
                  <Separator className="flex-1" />
                  <span className="text-sm text-zinc-400">{t("or").toLowerCase()}</span>
                  <Separator className="flex-1" />
                </div>
              </>
            )}

            <form onSubmit={methods.handleSubmit(onSubmit)} noValidate data-testid="login-form">
              <input defaultValue={csrfToken || undefined} type="hidden" hidden {...register("csrfToken")} />

              {!twoFactorRequired && (
                <div className="space-y-6">
                  {/* Email Field */}
                  <Field>
                    <FieldLabel>{t("email")}</FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      defaultValue={totpEmail || (searchParams?.get("email") as string)}
                      autoComplete="email"
                      {...register("email")}
                    />
                    {formState.errors.email && (
                      <p data-testid="field-error" className="text-destructive-foreground text-xs">
                        {formState.errors.email.message}
                      </p>
                    )}
                  </Field>

                  {/* Password Field */}
                  <Field>
                    <div className="flex w-full items-center justify-between">
                      <FieldLabel>{t("password")}</FieldLabel>
                      <Link href="/auth/forgot-password" className="text-sm text-subtle hover:text-emphasis">
                        {t("forgot")}
                      </Link>
                    </div>
                    <InputGroup className="overflow-hidden">
                      <InputGroupInput
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        {...register("password")}
                      />
                      <InputGroupAddon align="inline-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? t("hide_password") : t("show_password")}>
                          {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </Button>
                      </InputGroupAddon>
                    </InputGroup>
                    {formState.errors.password && (
                      <p data-testid="field-error" className="text-destructive-foreground text-xs">
                        {formState.errors.password.message}
                      </p>
                    )}
                  </Field>
                </div>
              )}

              {/* Two Factor */}
              {twoFactorRequired && (
                <div className="space-y-4">
                  {!twoFactorLostAccess ? <TwoFactor center /> : <BackupCode center />}
                </div>
              )}

              {/* Error Message */}
              {errorMessage && <Alert severity="error" title={errorMessage} className="mt-4" />}

              {/* Submit Button */}
              <Button
                type="submit"
                variant="outline"
                className="mt-8 w-full"
                disabled={formState.isSubmitting}>
                {twoFactorRequired ? t("submit") : t("continue")}
              </Button>
            </form>

            {/* Two Factor Footer */}
            {twoFactorRequired && (
              <div className="mt-4 flex justify-center gap-4">
                {!totpEmail ? (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (twoFactorLostAccess) {
                          setTwoFactorLostAccess(false);
                          methods.setValue("backupCode", "");
                        } else {
                          setTwoFactorRequired(false);
                          methods.setValue("totpCode", "");
                        }
                        setErrorMessage(null);
                      }}>
                      <Icon name="arrow-left" className="mr-2 size-4" />
                      {t("go_back")}
                    </Button>
                    {!twoFactorLostAccess && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setTwoFactorLostAccess(true);
                          setErrorMessage(null);
                          methods.setValue("totpCode", "");
                        }}>
                        <Icon name="lock" className="mr-2 size-4" />
                        {t("lost_access")}
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      window.location.replace("/");
                    }}>
                    {t("cancel")}
                  </Button>
                )}
              </div>
            )}
          </FormProvider>
        </div>

        {/* Footer Links */}
        {!twoFactorRequired && (
          <div className="mt-6 flex items-center justify-center gap-4 text-center">
            {showSignupLink && (
              <Link
                href={
                  callbackUrl
                    ? `${WEBSITE_URL}/signup?redirect=${encodeURIComponent(callbackUrl)}`
                    : `${WEBSITE_URL}/signup`
                }
                className="text-sm font-medium text-emphasis hover:underline">
                {t("create_account")}
              </Link>
            )}
          </div>
        )}
      </div>

      <AddToHomescreen />
    </div>
  );
}
