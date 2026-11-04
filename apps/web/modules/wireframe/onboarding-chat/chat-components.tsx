"use client";

import { ScheduleComponent } from "@calcom/features/schedules/components/ScheduleComponent";
import { weekdayToWeekIndex } from "@calcom/lib/dayjs";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import useMeQuery from "@calcom/trpc/react/hooks/useMeQuery";
import type { TimeRange } from "@calcom/types/schedule";
import { Avatar } from "@calcom/ui/components/avatar";
import { Button } from "@calcom/ui/components/button";
import { Icon } from "@calcom/ui/components/icon";
import { SkeletonText } from "@calcom/ui/components/skeleton";
import { showToast } from "@calcom/ui/components/toast";
import type { ReactNode } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { InstallableAppCard } from "~/onboarding/personal/_components/InstallableAppCard";
import { OnboardingCard } from "~/onboarding/personal/_components/OnboardingCard";
import { OnboardingLayout } from "~/onboarding/personal/_components/OnboardingLayout";
import { useAppInstallation } from "~/onboarding/personal/_components/useAppInstallation";

type ChatStep = "usage" | "calendar" | "availability" | "complete";

const STEP_ORDER: ChatStep[] = ["usage", "calendar", "availability", "complete"];

const STEP_NUMBER: Record<ChatStep, 1 | 2 | 3 | 4> = {
  usage: 1,
  calendar: 2,
  availability: 3,
  complete: 4,
};

const STEP_MESSAGE_KEY: Record<ChatStep, string> = {
  usage: "onboarding_chat_usage_question",
  calendar: "onboarding_chat_calendar_question",
  availability: "onboarding_chat_availability_question",
  complete: "onboarding_chat_complete_message",
};

type UsageOption = "freelancer" | "team_lead" | "growing_business" | "enterprise";

const USAGE_OPTIONS: { value: UsageOption; labelKey: string }[] = [
  { value: "freelancer", labelKey: "onboarding_chat_usage_freelancer" },
  { value: "team_lead", labelKey: "onboarding_chat_usage_team_lead" },
  { value: "growing_business", labelKey: "onboarding_chat_usage_growing_business" },
  { value: "enterprise", labelKey: "onboarding_chat_usage_enterprise" },
];

type StepAnswer = {
  userBubble?: ReactNode;
  systemNote?: ReactNode;
};

const ChatAvatar = () => (
  <Avatar size="xs" alt="Cal" fallback={<span className="font-bold text-[10px]">C</span>} />
);

const BotBubble = ({ children }: { children: ReactNode }) => (
  <div className="flex items-end gap-2">
    <ChatAvatar />
    <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-subtle px-4 py-2.5 text-default text-sm">
      {children}
    </div>
  </div>
);

const UserBubble = ({ children }: { children: ReactNode }) => (
  <div className="flex justify-end pl-8">
    <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-default px-4 py-2.5 font-medium text-brand text-sm">
      {children}
    </div>
  </div>
);

const SystemPill = ({ children }: { children: ReactNode }) => (
  <div className="flex justify-center pl-8">
    <span className="rounded-full border border-subtle bg-cal-muted px-3 py-1 text-subtle text-xs">
      {children}
    </span>
  </div>
);

const UsageStep = ({ onSelect }: { onSelect: (label: string) => void }) => {
  const { t } = useLocale();
  return (
    <div className="flex flex-wrap justify-end gap-2 pl-8">
      {USAGE_OPTIONS.map((option) => (
        <Button key={option.value} color="secondary" size="sm" onClick={() => onSelect(t(option.labelKey))}>
          {t(option.labelKey)}
        </Button>
      ))}
    </div>
  );
};

const CalendarStep = ({ onDone }: { onDone: (connectedAppName: string | null) => void }) => {
  const { t } = useLocale();
  const { installingAppSlug, setInstallingAppSlug, createInstallHandlers } = useAppInstallation();
  const queryIntegrations = trpc.viewer.apps.integrations.useQuery({
    variant: "calendar",
    onlyInstalled: false,
    sortByMostPopular: true,
    sortByInstalledFirst: true,
  });

  if (queryIntegrations.isPending) {
    return (
      <div className="grid grid-cols-1 gap-3 pl-8 sm:grid-cols-2">
        <SkeletonText className="h-28 w-full" />
        <SkeletonText className="h-28 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pl-8">
      <div className="grid max-h-64 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
        {(queryIntegrations.data?.items ?? []).map((app) => (
          <InstallableAppCard
            key={app.slug}
            app={app}
            isInstalling={installingAppSlug === app.slug}
            onInstallClick={setInstallingAppSlug}
            installOptions={createInstallHandlers(app.slug, () => onDone(app.name))}
          />
        ))}
      </div>
      <div className="flex justify-end">
        <Button color="minimal" size="sm" onClick={() => onDone(null)}>
          {t("onboarding_skip_for_now")}
        </Button>
      </div>
    </div>
  );
};

const AvailabilityStep = ({
  scheduleId,
  initialAvailability,
  onSaved,
}: {
  scheduleId: number | null;
  initialAvailability: TimeRange[][];
  onSaved: () => void;
}) => {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const meQuery = useMeQuery();
  const { control, handleSubmit } = useForm<{ availability: TimeRange[][] }>({
    defaultValues: { availability: initialAvailability },
  });

  const onMutationSuccess = () => {
    utils.viewer.availability.list.invalidate();
    showToast(t("onboarding_chat_availability_saved_toast"), "success");
    onSaved();
  };

  const onMutationError = (error: { message: string }) => {
    showToast(error.message, "error");
  };

  const updateMutation = trpc.viewer.availability.schedule.update.useMutation({
    onSuccess: onMutationSuccess,
    onError: onMutationError,
  });

  const createMutation = trpc.viewer.availability.schedule.create.useMutation({
    onSuccess: onMutationSuccess,
    onError: onMutationError,
  });

  const isSaving = updateMutation.isPending || createMutation.isPending;

  const onSubmit = ({ availability }: { availability: TimeRange[][] }) => {
    if (scheduleId) {
      updateMutation.mutate({ scheduleId, schedule: availability });
      return;
    }
    // Brand-new accounts may not have a default schedule provisioned yet -
    // create one from the chat flow instead of failing the update.
    createMutation.mutate({ name: t("working_hours"), schedule: availability });
  };

  return (
    <div className="ml-8 rounded-xl border border-subtle bg-default">
      <ScheduleComponent
        name="availability"
        control={control}
        userTimeFormat={meQuery.data?.timeFormat ?? null}
        weekStart={weekdayToWeekIndex(meQuery.data?.weekStart)}
      />
      <div className="flex justify-end border-subtle border-t p-3">
        <Button color="primary" size="sm" loading={isSaving} onClick={handleSubmit(onSubmit)}>
          {t("continue")}
        </Button>
      </div>
    </div>
  );
};

const CompleteStep = () => {
  const { t } = useLocale();
  return (
    <div className="flex items-center justify-end gap-3 pl-8">
      <Icon name="circle-check-big" className="h-5 w-5 text-semantic-success" />
      <Button color="primary" href="/event-types">
        {t("onboarding_chat_go_to_dashboard")}
      </Button>
    </div>
  );
};

export type OnboardingChatViewProps = {
  userEmail: string;
  scheduleId: number | null;
  initialAvailability: TimeRange[][];
};

export const OnboardingChatView = ({
  userEmail,
  scheduleId,
  initialAvailability,
}: OnboardingChatViewProps) => {
  const { t } = useLocale();
  const [step, setStep] = useState<ChatStep>("usage");
  const [answers, setAnswers] = useState<Partial<Record<ChatStep, StepAnswer>>>({});

  const advance = (current: ChatStep, answer: StepAnswer) => {
    setAnswers((prev) => ({ ...prev, [current]: answer }));
    const nextStep = STEP_ORDER[STEP_ORDER.indexOf(current) + 1];
    if (nextStep) setStep(nextStep);
  };

  const visibleSteps = STEP_ORDER.slice(0, STEP_ORDER.indexOf(step) + 1);

  return (
    <OnboardingLayout userEmail={userEmail} currentStep={STEP_NUMBER[step]}>
      <OnboardingCard
        title={t("onboarding_chat_title")}
        subtitle={t("onboarding_chat_subtitle")}
        footer={null}>
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-5 py-4">
          {visibleSteps.map((s) => {
            const answer = answers[s];
            const isCurrent = s === step;

            return (
              <div key={s} className="flex flex-col gap-2">
                <BotBubble>{t(STEP_MESSAGE_KEY[s])}</BotBubble>
                {answer?.userBubble && <UserBubble>{answer.userBubble}</UserBubble>}
                {answer?.systemNote && <SystemPill>{answer.systemNote}</SystemPill>}

                {isCurrent && s === "usage" && (
                  <UsageStep onSelect={(label) => advance("usage", { userBubble: label })} />
                )}

                {isCurrent && s === "calendar" && (
                  <CalendarStep
                    onDone={(appName) =>
                      advance("calendar", {
                        systemNote: appName
                          ? t("onboarding_chat_calendar_connected", { appName })
                          : t("onboarding_chat_calendar_skipped"),
                      })
                    }
                  />
                )}

                {isCurrent && s === "availability" && (
                  <AvailabilityStep
                    scheduleId={scheduleId}
                    initialAvailability={initialAvailability}
                    onSaved={() =>
                      advance("availability", { userBubble: t("onboarding_chat_availability_saved") })
                    }
                  />
                )}

                {isCurrent && s === "complete" && <CompleteStep />}
              </div>
            );
          })}
        </div>
      </OnboardingCard>
    </OnboardingLayout>
  );
};
