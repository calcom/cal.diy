"use client";

import { WEBAPP_URL } from "@calcom/lib/constants";
import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { useRouterQuery } from "@calcom/lib/hooks/useRouterQuery";
import classNames from "@calcom/ui/classNames";
import { Button } from "@calcom/ui/components/button";
import { showToast } from "@calcom/ui/components/toast";
import { MailOpenIcon } from "@coss/ui/icons";
import { usePathname, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import z from "zod";

async function sendVerificationLogin(email: string, username: string, t: (key: string) => string) {
  await signIn("email", {
    email: email.toLowerCase(),
    username: username.toLowerCase(),
    redirect: false,
    callbackUrl: WEBAPP_URL || "https://app.cal.com",
  })
    .then(() => {
      showToast(t("verification_email_sent"), "success");
    })
    .catch((err) => {
      showToast(err, "error");
    });
}

function useSendFirstVerificationLogin({
  email,
  username,
}: {
  email: string | undefined;
  username: string | undefined;
}) {
  const sent = useRef(false);
  const { t } = useLocale();
  useEffect(() => {
    if (!email || !username || sent.current) {
      return;
    }
    (async () => {
      await sendVerificationLogin(email, username, t);
      sent.current = true;
    })();
  }, [email, username, t]);
}

const querySchema = z.object({
  email: z.string().optional(),
  username: z.string().optional(),
  t: z.string().optional(),
});

const MailOpenIconWrapper = () => (
  <div className="bg-default rounded-full p-3">
    <MailOpenIcon className="text-emphasis h-12 w-12 shrink-0 p-0.5 font-extralight" />
  </div>
);

export default function Verify({ EMAIL_FROM }: { EMAIL_FROM?: string }) {
  const searchParams = useCompatSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const routerQuery = useRouterQuery();
  const { email, username } = querySchema.parse(routerQuery);
  const { t } = useLocale();
  const [secondsLeft, setSecondsLeft] = useState(30);

  useSendFirstVerificationLogin({ email, username });
  // @note: check for t=timestamp and apply disabled state and secondsLeft accordingly
  // to avoid refresh to skip waiting 30 seconds to re-send email
  useEffect(() => {
    const lastSent = new Date(parseInt(`${t}`));
    // @note: This double round() looks ugly but it's the only way I came up to get the time difference in seconds
    const difference = Math.round(Math.round(new Date().getTime() - lastSent.getTime()) / 1000);
    if (difference < 30) {
      // If less than 30 seconds, set the seconds left to 30 - difference
      setSecondsLeft(30 - difference);
    } else {
      // else set the seconds left to 0 and disabled false
      setSecondsLeft(0);
    }
  }, [t]);
  // @note: here we make sure each second is decremented if disabled up to 0.
  useEffect(() => {
    if (secondsLeft > 0) {
      const interval = setInterval(() => {
        if (secondsLeft > 0) {
          setSecondsLeft(secondsLeft - 1);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [secondsLeft]);

  if (!email) {
    return <div>{t("invalid_link")}</div>;
  }

  return (
    <div className="text-default bg-cal-muted/90 backdrop-blur-md backdrop-grayscale backdrop-filter">
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="border-subtle bg-default m-10 flex max-w-2xl flex-col items-center rounded-xl border px-8 py-14 text-left">
          <MailOpenIconWrapper />
          <h3 className="font-cal text-emphasis my-6 text-2xl font-normal leading-none">
            {t("check_your_inbox")}
          </h3>
          <p className="text-muted dark:text-subtle text-base font-normal">
            {t("email_sent_with_activation_link", { email })}
          </p>
          <div className="mt-7">
            <Button
              color="secondary"
              href={
                EMAIL_FROM
                  ? encodeURIComponent(`https://mail.google.com/mail/u/0/#search/from:${EMAIL_FROM}`)
                  : "https://mail.google.com/mail/u/0/"
              }
              target="_blank"
              EndIcon="external-link">
              {t("open_in_gmail")}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-subtle text-base font-normal ">{t("dont_see_email")}</p>
          <button
            className={classNames(
              "font-light",
              secondsLeft > 0 ? "text-muted" : "underline underline-offset-2 hover:font-normal"
            )}
            disabled={secondsLeft > 0}
            onClick={async (e) => {
              if (!email || !username) {
                return;
              }
              e.preventDefault();
              setSecondsLeft(30);
              // Update query params with t:timestamp, shallow: true doesn't re-render the page
              const _searchParams = new URLSearchParams(searchParams?.toString());
              _searchParams.set("t", `${Date.now()}`);
              router.replace(`${pathname}?${_searchParams.toString()}`);
              return await sendVerificationLogin(email, username, t);
            }}>
            {secondsLeft > 0 ? t("resend_in_seconds", { seconds: secondsLeft }) : t("resend")}
          </button>
        </div>
      </div>
    </div>
  );
}
