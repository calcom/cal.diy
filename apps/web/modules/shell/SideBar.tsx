import { ENABLE_PROFILE_SWITCHER, IS_VISUAL_REGRESSION_TESTING, WEBAPP_URL } from "@calcom/lib/constants";
import { getPlaceholderAvatar } from "@calcom/lib/defaultAvatarImage";
import { useIsStandalone } from "@calcom/lib/hooks/useIsStandalone";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import { Avatar } from "@calcom/ui/components/avatar";
import { Credits } from "@calcom/ui/components/credits";
import { ButtonOrLink } from "@calcom/ui/components/dropdown";
import { Icon } from "@calcom/ui/components/icon";
import { Logo } from "@calcom/ui/components/logo";
import { SkeletonText } from "@calcom/ui/components/skeleton";
import { Tooltip } from "@calcom/ui/components/tooltip";
import { ArrowLeftIcon, ArrowRightIcon } from "@coss/ui/icons";
import { PanelLeftIcon } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import type { User as UserAuth } from "next-auth";
import { useSession } from "next-auth/react";
import { KBarTrigger } from "./Kbar";
import { Navigation } from "./navigation/Navigation";
import { useBottomNavItems } from "./useBottomNavItems";
import { ProfileDropdown } from "./user-dropdown/ProfileDropdown";
import { UserDropdown } from "./user-dropdown/UserDropdown";

export type SideBarContainerProps = {
  bannersHeight: number;
};

export type SideBarProps = {
  bannersHeight: number;
  user?: UserAuth | null;
};

export function SideBarContainer({ bannersHeight }: SideBarContainerProps) {
  const { status, data } = useSession();
  const isStandalone = useIsStandalone();

  // Make sure that Sidebar is rendered optimistically so that a refresh of pages when logged in have SideBar from the beginning.
  // This improves the experience of refresh on app store pages(when logged in) which are SSG.
  // Though when logged out, app store pages would temporarily show SideBar until session status is confirmed.
  if (status !== "loading" && status !== "authenticated") return null;
  if (isStandalone) return null;
  return <SideBar bannersHeight={bannersHeight} user={data?.user} />;
}

export function SideBar({ bannersHeight, user }: SideBarProps) {
  const { t, isLocaleReady } = useLocale();

  const [isCollapsed, setIsCollapsed] = useState(false);

  const publicPageUrl = `${WEBAPP_URL}/${user?.orgAwareUsername}`;

  const bottomNavItems = useBottomNavItems({
    publicPageUrl,
  });

  const sidebarStylingAttributes = {
    maxHeight: `calc(100vh - ${bannersHeight}px)`,
    top: `${bannersHeight}px`,
  };

  return (
    <div className="relative">
      <aside
        id="app-sidebar"
        style={sidebarStylingAttributes}
        className={classNames(
          "fixed left-0 hidden h-full w-14 flex-col overflow-y-auto overflow-x-hidden border-muted border-r bg-cal-muted transition-[width] duration-200 md:sticky md:flex",
          "max-h-screen",
          isCollapsed ? "lg:w-14 lg:px-0" : "lg:w-56 lg:px-3"
        )}>
        <div className="flex h-full flex-col justify-between py-3 lg:pt-4">
          {/* Tablet sidebar header */}
          <div className="hidden flex-col items-center gap-2 md:flex lg:hidden">
            <Link href="/event-types" className="text-center">
              <Logo small icon />
            </Link>

            {!user?.org && <UserDropdown iconOnly />}
          </div>
          

          {/* Logo for collapsed desktop */}
          {isCollapsed && (
            <Link href="/event-types" className="hidden text-center lg:inline">
              <Logo small icon />
            </Link>
          )}
          <header className={classNames(
            "todesktop:-mt-3 todesktop:flex-col-reverse items-center justify-between todesktop:[-webkit-app-region:drag] md:hidden lg:flex",
            isCollapsed && "lg:flex-col lg:gap-1"
          )}>
            {user?.org ? (
              !ENABLE_PROFILE_SWITCHER ? (
                <Link href="/settings/organizations/profile" className="w-full px-1.5">
                  <div className="flex items-center gap-2 font-medium">
                    <Avatar
                      alt={`${user.org.name} logo`}
                      imageSrc={getPlaceholderAvatar(user.org.logoUrl, user.org.name)}
                      size="xsm"
                    />
                    <p className="text line-clamp-1 text-sm">
                      <span>{user.org.name}</span>
                    </p>
                  </div>
                </Link>
              ) : (
                <ProfileDropdown />
              )
            ) : (
              <div
                data-testid="user-dropdown-trigger"
                className={classNames(
                  "todesktop:mt-4 w-full",
                  isCollapsed && "lg:mt-0 lg:flex lg:justify-center"
                )}>
                <div className={classNames("hidden lg:block", isCollapsed && "lg:flex lg:justify-center")}>
                  <UserDropdown iconOnly={isCollapsed} />
                </div>
              </div>
            )}
            <div className={classNames(
              "flex w-full justify-end rtl:space-x-reverse",
              isCollapsed && "lg:justify-center"
            )}>
              <button
                color="minimal"
                onClick={() => window.history.back()}
                className="group todesktop:block hidden font-medium text-sm text-subtle hover:text-emphasis">
                <ArrowLeftIcon className="h-4 w-4 shrink-0 text-subtle group-hover:text-emphasis" />
              </button>
              <button
                color="minimal"
                onClick={() => window.history.forward()}
                className="group todesktop:block hidden font-medium text-sm text-subtle hover:text-emphasis">
                <ArrowRightIcon className="h-4 w-4 shrink-0 text-subtle group-hover:text-emphasis" />
              </button>
              {!!user?.org && (
                <div data-testid="user-dropdown-trigger" className="flex items-center">
                  <UserDropdown small />
                </div>
              )}
              <KBarTrigger />
              
            </div>
          </header>
          
          <Navigation isCollapsed={isCollapsed} />
        </div>

        <div
          className={classNames(
            "md:px-2 md:pb-4",
            !isCollapsed && "lg:p-0"
          )}>
          {bottomNavItems.map((item, index) => (
            <Tooltip
              side="right"
              content={t(item.name)}
              className={classNames(!isCollapsed && "lg:hidden")}
              key={item.name}>
              <span className="flex w-full">
                <ButtonOrLink
                  id={item.name}
                  href={item.href || undefined}
                  aria-label={t(item.name)}
                  target={item.target}
                  className={classNames(
                    "text-left",
                    "justify-right group flex items-center rounded-md px-2 py-1.5 font-medium text-default text-sm transition [&[aria-current='page']]:bg-emphasis",
                    "mt-0.5 w-full text-sm [&[aria-current='page']]:text-emphasis",
                    isLocaleReady ? "hover:bg-subtle hover:text-emphasis" : "",
                    index === 0 && "mt-3"
                  )}
                  onClick={item.onClick}>
                  {!!item.icon && (
                    <Icon
                      name={item.isLoading ? "rotate-cw" : item.icon}
                      className={classNames(
                        "h-4 w-4 shrink-0 aria-[aria-current='page']:text-inherit",
                        "md:mx-auto",
                        !isCollapsed && "lg:mx-0 lg:ltr:mr-2 lg:rtl:ml-2",
                        item.isLoading && "animate-spin"
                      )}
                      aria-hidden="true"
                    />
                  )}

                  {isLocaleReady ? (
                    <span
                      className={classNames(
                        "hidden w-full justify-between",
                        !isCollapsed && "lg:flex"
                      )}>
                      <div className="flex">{t(item.name)}</div>
                    </span>
                  ) : (
                    <SkeletonText className="h-[20px] w-full" />
                  )}
                </ButtonOrLink>
              </span>
            </Tooltip>
          ))}
          <Tooltip
            side="right"
            content={isCollapsed ? t("expand_sidebar") : t("collapse_sidebar")}
            className={classNames(!isCollapsed && "lg:hidden")}>
            <button
              type="button"
              onClick={() => setIsCollapsed((collapsed) => !collapsed)}
              aria-label={isCollapsed ? t("expand_sidebar") : t("collapse_sidebar")}
              aria-expanded={!isCollapsed}
              aria-controls="app-sidebar"
              className={classNames(
              "hidden w-full items-center rounded-md px-2 py-1.5 font-medium text-default text-sm transition hover:bg-subtle hover:text-emphasis focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 lg:flex",
              isCollapsed ? "justify-center" : "justify-start gap-2"
            )}>
              <PanelLeftIcon className="h-4 w-4 shrink-0" />

              {!isCollapsed && <span>{t("collapse_sidebar")}</span>}
            </button>
          </Tooltip>

          {!IS_VISUAL_REGRESSION_TESTING && !isCollapsed && <Credits />}
        </div>
      </aside>
    </div>
  );
}
