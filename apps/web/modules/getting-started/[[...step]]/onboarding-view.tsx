"use client";

import type { TFunction } from "i18next";
import { signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useTransition } from "react";
import { Toaster } from "sonner";
import { z } from "zod";

import { APP_NAME } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { useParamsWithFallback } from "@calcom/lib/hooks/useParamsWithFallback";
import type { RouterOutputs } from "@calcom/trpc/react";
import classNames from "@calcom/ui/classNames";
import { Button } from "@calcom/ui/components/button";
import { StepCard } from "@calcom/ui/components/card";
import { Steps } from "@calcom/ui/components/form";
import { LoaderIcon } from "@coss/ui/icons";

import { ConnectedCalendars } from "@components/getting-started/steps-views/ConnectCalendars";
import { ConnectedVideoStep } from "@components/getting-started/steps-views/ConnectedVideoStep";
import { SetupAvailability } from "@components/getting-started/steps-views/SetupAvailability";
import UserProfile from "@components/getting-started/steps-views/UserProfile";
import { UserSettings } from "@components/getting-started/steps-views/UserSettings";

const INITIAL_STEP = "user-settings";
const BASE_STEPS = [
  "user-settings",
  "connected-calendar",
  "connected-video",
  "setup-availability",
  "user-profile",
] as const;

type StepType = (typeof BASE_STEPS)[number];

const getStepsAndHeadersForUser = (t: TFunction) => {
  const baseHeaders: {
    title: string;
    subtitle: string[];
    skipText?: string;
  }[] = [
    {
      title: t("welcome_to_cal_header", { appName: APP_NAME }),
      subtitle: [t("we_just_need_basic_info")],
    },
    {
      title: t("connect_your_calendar"),
      subtitle: [t("connect_your_calendar_instructions")],
      skipText: t("connect_calendar_later"),
    },
    {
      title: t("connect_your_video_app"),
      subtitle: [t("connect_your_video_app_instructions")],
      skipText: t("set_up_later"),
    },
    {
      title: t("set_availability"),
      subtitle: [
        `${t("set_availability_getting_started_subtitle_1")} ${t(
          "set_availability_getting_started_subtitle_2"
        )}`,
      ],
    },
    {
      title: t("nearly_there"),
      subtitle: [t("nearly_there_instructions")],
    },
  ];

  return {
    steps: [...BASE_STEPS],
    headers: [...baseHeaders],
  };
};

const stepRouteSchema = z.object({
  step: z
    .array(
      z.enum(["user-settings", "setup-availability", "user-profile", "connected-calendar", "connected-video"])
    )
    .default([INITIAL_STEP]),
  from: z.string().optional(),
});

type PageProps = {
  hasPendingInvites: boolean;
  user: RouterOutputs["viewer"]["me"]["get"];
};

const OnboardingPage = (props: PageProps) => {
  const pathname = usePathname();
  const params = useParamsWithFallback();
  const user = props.user;
  const router = useRouter();
  const { t } = useLocale();
  const [isNextStepLoading, startTransition] = useTransition();

  const result = stepRouteSchema.safeParse({
    ...params,
    step: Array.isArray(params.step) ? params.step : [params.step],
  });

  const currentStep = result.success ? result.data.step[0] : INITIAL_STEP;
  const from = result.success ? result.data.from : "";

  // TODO: Add this in when we have solved the ability to move to tokens accept invite and note invitedto
  // Ability to accept other pending invites if any (low priority)
  // if (props.hasPendingInvites) {
  //   headers.unshift(
  //     props.hasPendingInvites && {
  //       title: `${t("email_no_user_invite_heading", { appName: APP_NAME })}`,
  //       subtitle: [], // TODO: come up with some subtitle text here
  //     }
  //   );
  // }
  const { steps, headers } = getStepsAndHeadersForUser(t);
  const stepTransform = (step: StepType) => {
    const stepIndex = steps.indexOf(step as (typeof steps)[number]);

    if (stepIndex > -1) {
      return steps[stepIndex];
    }
    return INITIAL_STEP;
  };
  const currentStepIndex = steps.indexOf(currentStep);

  const goToStep = (step: number) => {
    const newStep = steps[step];
    startTransition(() => {
      router.push(`/getting-started/${stepTransform(newStep)}`);
    });
  };

  const goToNextStep = () => {
    const nextIndex = currentStepIndex + 1;
    const newStep = steps[nextIndex];
    startTransition(() => {
      router.push(`/getting-started/${stepTransform(newStep)}`);
    });
  };

  return (
    <div
      className={classNames(
        "text-emphasis min-h-screen [--cal-brand:#111827] dark:[--cal-brand:#FFFFFF]",
        "[--cal-brand-emphasis:#101010] dark:[--cal-brand-emphasis:#e1e1e1]",
        "[--cal-brand-subtle:#9CA3AF]",
        "[--cal-brand-text:#FFFFFF]  dark:[--cal-brand-text:#000000]",
        "[--cal-brand-accent:#FFFFFF] dark:[--cal-brand-accent:#000000]"
      )}
      data-testid="onboarding"
      key={pathname}>
      <div className="mx-auto py-6 sm:px-4 md:py-24">
        <div className="relative">
          <div className="sm:mx-auto sm:w-full sm:max-w-[600px]">
            <div className="mx-auto px-4 sm:max-w-[520px]">
              <header>
                <p className="font-cal mb-3 text-[28px] font-medium leading-7">
                  {headers[currentStepIndex]?.title || "Undefined title"}
                </p>

                {headers[currentStepIndex]?.subtitle.map((subtitle, index) => (
                  <p className="text-subtle font-sans text-sm font-normal" key={index}>
                    {subtitle}
                  </p>
                ))}
              </header>
              <Steps maxSteps={steps.length} currentStep={currentStepIndex + 1} navigateToStep={goToStep} />
            </div>
            <StepCard>
              <Suspense fallback={<LoaderIcon />}>
                {currentStep === "user-settings" && (
                  <UserSettings nextStep={goToNextStep} hideUsername={from === "signup"} user={user} />
                )}
                {currentStep === "connected-calendar" && (
                  <ConnectedCalendars nextStep={goToNextStep} isPageLoading={isNextStepLoading} />
                )}

                {currentStep === "connected-video" && (
                  <ConnectedVideoStep nextStep={goToNextStep} isPageLoading={isNextStepLoading} user={user} />
                )}

                {currentStep === "setup-availability" && (
                  <SetupAvailability nextStep={goToNextStep} defaultScheduleId={user.defaultScheduleId} />
                )}
                {currentStep === "user-profile" && <UserProfile user={user} />}
              </Suspense>
            </StepCard>

            {headers[currentStepIndex]?.skipText && (
              <div className="flex w-full flex-row justify-center">
                <Button
                  color="minimal"
                  data-testid="skip-step"
                  onClick={(event) => {
                    event.preventDefault();
                    goToNextStep();
                  }}
                  className="mt-8 cursor-pointer px-4 py-2 font-sans text-sm font-medium">
                  {headers[currentStepIndex]?.skipText}
                </Button>
              </div>
            )}
          </div>
          <div className="flex w-full flex-row justify-center">
            <Button
              color="minimal"
              data-testid="sign-out"
              onClick={() => {
                signOut({ callbackUrl: "/auth/logout" });
              }}
              className="mt-8 cursor-pointer px-4 py-2 font-sans text-sm font-medium">
              {t("sign_out")}
            </Button>
          </div>
        </div>
      </div>
      <Toaster position="bottom-right" />
    </div>
  );
};

export default OnboardingPage;
