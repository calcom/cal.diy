"use client";

import { WEBAPP_URL } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Avatar } from "@calcom/ui/components/avatar";
import { Button } from "@calcom/ui/components/button";
import { Icon, type IconName } from "@calcom/ui/components/icon";
import classNames from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";

type OnboardingBrowserViewProps = {
  avatar?: string | null;
  name?: string;
  bio?: string;
  username?: string | null;
};

const getDisplayUrl = (
  orgSlug: string | null | undefined,
  username: string | null | undefined
): string => {
  if (orgSlug) {
    return `${orgSlug}.${""}/${username || ""}`;
  }

  const webappUrl = WEBAPP_URL.replace(/^https?:\/\//, "");
  return `${webappUrl}/${username || ""}`;
};

export const OnboardingBrowserView = ({
  avatar,
  name,
  bio,
  username,
}: OnboardingBrowserViewProps) => {
  const { t } = useLocale();
  const pathname = usePathname();
  const orgBranding = null as { slug: string } | null;

  const displayUrl = getDisplayUrl(orgBranding?.slug, username);

  // Animation variants for entry and exit
  const containerVariants = {
    initial: {
      opacity: 0,
      y: -20,
    },
    animate: {
      opacity: 1,
      y: 0,
    },
    exit: {
      opacity: 0,
      y: 20,
    },
  };

  const events: Array<{
    title: string;
    description: string;
    duration: number;
    icon: IconName;
  }> = [
    {
      title: t("onboarding_browser_view_demo"),
      description: t("onboarding_browser_view_demo_description"),
      duration: 15,
      icon: "bell",
    },
    {
      title: t("onboarding_browser_view_quick_meeting"),
      description: t("onboarding_browser_view_quick_meeting_description"),
      duration: 15,
      icon: "bell",
    },
    {
      title: t("onboarding_browser_view_longer_meeting"),
      description: t("onboarding_browser_view_longer_meeting_description"),
      duration: 30,
      icon: "clock",
    },
    {
      title: t("in_person_meeting"),
      description: t("onboarding_browser_view_in_person_description"),
      duration: 120,
      icon: "map-pin",
    },
    {
      title: t("onboarding_browser_view_ask_question"),
      description: t("onboarding_browser_view_ask_question_description"),
      duration: 15,
      icon: "message-circle",
    },
  ];
  return (
    <div className="hidden h-full w-full flex-col overflow-hidden rounded-l-2xl border-subtle border-y border-s bg-default xl:flex">
      {/* Browser header */}
      <div className="flex min-w-0 shrink-0 items-center gap-3 rounded-t-2xl border-subtle border-b bg-default p-3">
        {/* Navigation buttons */}
        <div className="flex shrink-0 items-center gap-4 opacity-50">
          <Icon name="arrow-left" className="h-4 w-4 text-subtle" />
          <Icon name="arrow-right" className="h-4 w-4 text-subtle" />
          <Icon name="rotate-cw" className="h-4 w-4 text-subtle" />
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 rounded-[32px] bg-cal-muted px-3 py-2">
          <Icon name="lock" className="h-4 w-4 text-subtle" />
          <p className="truncate font-medium text-default text-sm leading-tight">{displayUrl}</p>
        </div>
        <Icon name="ellipsis-vertical" className="h-4 w-4 text-subtle" />
      </div>
      {/* Content */}
      <div className="h-full bg-cal-muted pt-11 pl-11">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            className="flex h-full w-full flex-col overflow-hidden rounded-l-xl border-muted border-y border-s bg-default"
            variants={containerVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{
              duration: 0.5,
              ease: "backOut",
            }}>
            {/* Profile Header */}
            <div className="flex flex-col gap-4 border-subtle border-b p-4">
              <div className="flex flex-col items-start gap-4">
                {avatar && (
                  <Avatar size="lg" imageSrc={avatar} alt={name || ""} className="border-2 border-white" />
                )}
                <div className="flex w-full flex-col gap-2">
                  <h2 className="w-full truncate font-semibold text-emphasis text-xl leading-tight">
                    {name || t("your_name")}
                  </h2>
                  <p
                    className={classNames("text-sm leading-normal", {
                      "text-default": bio,
                      "text-subtle italic": !bio,
                    })}>
                    {bio || t("onboarding_browser_view_default_bio")}
                  </p>
                </div>
              </div>
            </div>

            {/* Events List */}
            <div className="flex flex-col overflow-y-auto">
              {events.map((event, index) => (
                <div key={event.title} className="opacity-30">
                  {index > 0 && <div className="h-px border-subtle border-t" />}
                  <div className="flex items-center justify-between gap-3 px-5 py-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-center gap-1">
                        <h3 className="font-semibold text-default text-sm leading-none">{event.title}</h3>
                        <div className="flex h-4 items-center justify-center gap-1 rounded-md bg-emphasis px-1">
                          <Icon name={event.icon} className="h-3 w-3 text-emphasis" />
                          <span className="font-medium text-emphasis text-xs leading-none">
                            {event.duration} {t("minute_timeUnit")}
                          </span>
                        </div>
                      </div>
                      <p className="font-medium text-sm text-subtle leading-tight">{event.description}</p>
                    </div>
                    <Button color="secondary" size="sm" EndIcon="arrow-right" tabIndex={-1}>
                      {t("book_now")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
