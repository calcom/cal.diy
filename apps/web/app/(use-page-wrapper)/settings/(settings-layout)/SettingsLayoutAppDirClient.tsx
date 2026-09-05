"use client";

import { HAS_ORG_OPT_IN_FEATURES } from "@calcom/features/feature-opt-in/config";
import type { TeamFeatures } from "@calcom/features/flags/config";
import { IS_CALCOM, WEBAPP_URL } from "@calcom/lib/constants";
import { getPlaceholderAvatar } from "@calcom/lib/defaultAvatarImage";
import { getUserAvatarUrl } from "@calcom/lib/getAvatarUrl";
import { useIsStandalone } from "@calcom/lib/hooks/useIsStandalone";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { IdentityProvider, UserPermissionRole } from "@calcom/prisma/enums";
import { trpc } from "@calcom/trpc/react";
import classNames from "@calcom/ui/classNames";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { ErrorBoundary } from "@calcom/ui/components/errorBoundary";
import { Icon } from "@calcom/ui/components/icon";
import type { VerticalTabItemProps } from "@calcom/ui/components/navigation";
import { VerticalTabItem } from "@calcom/ui/components/navigation";
import { Skeleton } from "@calcom/ui/components/skeleton";
import { ArrowLeftIcon } from "@coss/ui/icons";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { ComponentProps } from "react";
import React, { useEffect, useMemo, useState } from "react";
import Shell from "~/shell/Shell";

const getTabs = (
  orgBranding: {
    id?: number;
    slug?: string;
    name?: string;
    logoUrl?: string | null;
  } | null
) => {
  const tabs: VerticalTabItemProps[] = [
    {
      name: "my_account",
      href: "/settings/my-account",
      icon: "user",
      children: [
        {
          name: "profile",
          href: "/settings/my-account/profile",
          trackingMetadata: { section: "my_account", page: "profile" },
        },
        {
          name: "general",
          href: "/settings/my-account/general",
          trackingMetadata: { section: "my_account", page: "general" },
        },
        {
          name: "calendars",
          href: "/settings/my-account/calendars",
          trackingMetadata: { section: "my_account", page: "calendars" },
        },
        {
          name: "conferencing",
          href: "/settings/my-account/conferencing",
          trackingMetadata: { section: "my_account", page: "conferencing" },
        },
        {
          name: "appearance",
          href: "/settings/my-account/appearance",
          trackingMetadata: { section: "my_account", page: "appearance" },
        },
        {
          name: "out_of_office",
          href: "/settings/my-account/out-of-office",
          trackingMetadata: { section: "my_account", page: "out_of_office" },
        },
        {
          name: "push_notifications",
          href: "/settings/my-account/push-notifications",
          trackingMetadata: { section: "my_account", page: "push_notifications" },
        },
        // TODO
        // { name: "referrals", href: "/settings/my-account/referrals" },
      ],
    },
    {
      name: "security",
      href: "/settings/security",
      icon: "key",
      children: [
        {
          name: "password",
          href: "/settings/security/password",
          trackingMetadata: { section: "security", page: "password" },
        },
        {
          name: "2fa_auth",
          href: "/settings/security/two-factor-auth",
          trackingMetadata: { section: "security", page: "2fa_auth" },
        },
      ],
    },
    {
      name: "developer",
      href: "/settings/developer",
      icon: "terminal",
      children: [
        //
        {
          name: "webhooks",
          href: "/settings/developer/webhooks",
          trackingMetadata: { section: "developer", page: "webhooks" },
        },
        {
          name: "oAuth",
          href: "/settings/developer/oauth",
          trackingMetadata: { section: "developer", page: "oauth_clients" },
        },
        {
          name: "api_keys",
          href: "/settings/developer/api-keys",
          trackingMetadata: { section: "developer", page: "api_keys" },
        },
        {
          name: "api_docs",
          href: "/docs",
          trackingMetadata: { section: "developer", page: "api_docs" },
        },
        // TODO: Add profile level for embeds
        // { name: "embeds", href: "/v2/settings/developer/embeds" },
      ],
    },
    {
      name: "organization",
      href: "/settings/organizations",
      children: [
        {
          name: "profile",
          href: "/settings/organizations/profile",
          trackingMetadata: { section: "organization", page: "profile" },
        },
        {
          name: "general",
          href: "/settings/organizations/general",
          trackingMetadata: { section: "organization", page: "general" },
        },
        {
          name: "guest_notifications",
          href: "/settings/organizations/guest-notifications",
        },
        ...(orgBranding
          ? [
              {
                name: "members",
                href: `${WEBAPP_URL}/settings/organizations/${orgBranding?.slug}/members`,
                isExternalLink: true,
                trackingMetadata: { section: "organization", page: "members" },
              },
            ]
          : []),
        {
          name: "privacy_and_security",
          href: "/settings/organizations/privacy",
          trackingMetadata: { section: "organization", page: "privacy_and_security" },
        },
        {
          name: "SSO",
          href: "/settings/organizations/sso",
          trackingMetadata: { section: "organization", page: "sso" },
        },
        {
          name: "directory_sync",
          href: "/settings/organizations/dsync",
          trackingMetadata: { section: "organization", page: "directory_sync" },
        },
        {
          name: "api_docs",
          href: "/docs",
          trackingMetadata: { section: "organization", page: "api_docs" },
        },
        ...(HAS_ORG_OPT_IN_FEATURES
          ? [
              {
                name: "features",
                href: "/settings/organizations/features",
                trackingMetadata: { section: "organization", page: "features" },
              },
            ]
          : []),
      ],
    },
    {
      name: "admin",
      href: "/settings/admin",
      icon: "lock",
      children: [
        //
        {
          name: "features",
          href: "/settings/admin/flags",
          trackingMetadata: { section: "admin", page: "features" },
        },
        {
          name: "license",
          href: "/auth/setup?step=1",
          trackingMetadata: { section: "admin", page: "license" },
        },
        {
          name: "apps",
          href: "/settings/admin/apps/calendar",
          trackingMetadata: { section: "admin", page: "apps" },
        },
        {
          name: "users",
          href: "/settings/admin/users",
          trackingMetadata: { section: "admin", page: "users" },
        },
        {
          name: "lockedSMS",
          href: "/settings/admin/lockedSMS",
          trackingMetadata: { section: "admin", page: "locked_sms" },
        },
        {
          name: "oAuth",
          href: "/settings/admin/oauth",
          trackingMetadata: { section: "admin", page: "oauth" },
        },
        {
          name: "Playground",
          href: "/settings/admin/playground",
          trackingMetadata: { section: "admin", page: "playground" },
        },
      ],
    },
  ];

  for (const tab of tabs) {
    if (tab.name === "admin" && IS_CALCOM) {
      tab.children?.push({
        name: "create_org",
        href: "/settings/organizations/new",
        trackingMetadata: { section: "admin", page: "create_org" },
      });

      tab.children?.push({
        name: "create_license_key",
        href: "/settings/license-key/new",
        trackingMetadata: { section: "admin", page: "create_license_key" },
      });
    }
  }

  return tabs;
};

// The following keys are assigned to admin only
const adminRequiredKeys = ["admin"];
const organizationRequiredKeys = ["organization"];
const organizationAdminKeys = [
  "privacy",
  "privacy_and_security",
  "SSO",
  "directory_sync",
  "delegation_credential",
];

interface SettingsPermissions {
  canViewRoles?: boolean;
  canViewOrganizationBilling?: boolean;
  canUpdateOrganization?: boolean;
}

const useTabs = ({
  isDelegationCredentialEnabled,
  isPbacEnabled,
  permissions,
}: {
  isDelegationCredentialEnabled: boolean;
  isPbacEnabled: boolean;
  permissions?: SettingsPermissions;
}) => {
  const session = useSession();
  const { data: user } = trpc.viewer.me.get.useQuery({ includePasswordAdded: true });
  const orgBranding = null as { id?: number; slug?: string; name?: string; logoUrl?: string | null } | null;
  const isAdmin = session.data?.user.role === UserPermissionRole.ADMIN;

  const processTabsMemod = useMemo(() => {
    const processedTabs = getTabs(orgBranding).map((tab) => {
      if (tab.href === "/settings/my-account") {
        return {
          ...tab,
          name: user?.name || "my_account",
          icon: undefined,
          avatar: getUserAvatarUrl(user),
        };
      } else if (tab.href === "/settings/organizations") {
        const newArray = (tab?.children ?? []).filter(
          (child) => permissions?.canUpdateOrganization || !organizationAdminKeys.includes(child.name)
        );

        // Add delegation-credential menu item only if feature flag is enabled
        if (isDelegationCredentialEnabled) {
          newArray.push({
            name: "delegation_credential",
            href: "/settings/organizations/delegation-credential",
            trackingMetadata: { section: "organization", page: "delegation_credential" },
          });
        }

        // Add pbac menu item - show opt-in page if not enabled, regular page if enabled
        if (isPbacEnabled) {
          if (permissions?.canViewRoles) {
            newArray.push({
              name: "roles_and_permissions",
              href: "/settings/organizations/roles",
              trackingMetadata: { section: "organization", page: "roles_and_permissions" },
            });
          }

          if (permissions?.canViewOrganizationBilling) {
            newArray.push({
              name: "billing",
              href: "/settings/organizations/billing",
              trackingMetadata: { section: "organization", page: "billing" },
            });
          }
        } else {
          if (permissions?.canUpdateOrganization) {
            newArray.push({
              name: "billing",
              href: "/settings/organizations/billing",
              trackingMetadata: { section: "organization", page: "billing" },
            });
          }
          // Show roles page (modal will appear if PBAC not enabled)
          if (permissions?.canUpdateOrganization) {
            newArray.push({
              name: "roles",
              href: "/settings/organizations/roles",
              isBadged: true, // Show "New" badge,
              trackingMetadata: { section: "organization", page: "roles" },
            });
          }
        }

        return {
          ...tab,
          children: newArray,
          name: orgBranding?.name || "organization",
          avatar: getPlaceholderAvatar(orgBranding?.logoUrl, orgBranding?.name),
        };
      } else if (
        tab.href === "/settings/security" &&
        user?.identityProvider === IdentityProvider.GOOGLE &&
        !user?.twoFactorEnabled &&
        !user?.passwordAdded
      ) {
        const filtered = tab?.children?.filter(
          (childTab) => childTab.href !== "/settings/security/two-factor-auth"
        );
        return { ...tab, children: filtered };
      } else if (tab.href === "/settings/developer") {
        const filtered = tab?.children?.filter(
          (childTab) => permissions?.canUpdateOrganization || childTab.name !== "api_docs"
        );
        return { ...tab, children: filtered };
      }
      return tab;
    });

    // check if name is in adminRequiredKeys
    return processedTabs.filter((tab) => {
      if (organizationRequiredKeys.includes(tab.name)) return !!orgBranding;
      if (tab.name === "other_teams" && !permissions?.canUpdateOrganization) return false;

      if (isAdmin) return true;
      return !adminRequiredKeys.includes(tab.name);
    });
  }, [isAdmin, orgBranding, user, isDelegationCredentialEnabled, isPbacEnabled, permissions]);

  return processTabsMemod;
};

const BackButtonInSidebar = ({ name }: { name: string }) => {
  return (
    <Link
      href="/event-types"
      className="group my-6 todesktop:mt-10 flex h-6 max-h-6 w-full flex-row items-center rounded-md px-3 py-2 font-medium text-emphasis text-sm leading-4 transition hover:bg-subtle group-hover:text-default [&[aria-current='page']]:bg-emphasis [&[aria-current='page']]:text-emphasis"
      data-testid={`vertical-tab-${name}`}>
      <ArrowLeftIcon className="h-4 w-4 stroke-[2px] md:mt-0 ltr:mr-[10px] rtl:ml-[10px] rtl:rotate-180" />
      <Skeleton title={name} as="p" className="min-h-4 max-w-36 truncate" loadingClassName="ms-3">
        {name}
      </Skeleton>
    </Link>
  );
};

interface SettingsSidebarContainerProps {
  className?: string;
  navigationIsOpenedOnMobile?: boolean;
  bannersHeight?: number;
  teamFeatures?: Record<number, TeamFeatures>;
  permissions?: SettingsPermissions;
}

const SettingsSidebarContainer = ({
  className = "",
  navigationIsOpenedOnMobile,
  bannersHeight,
  teamFeatures,
  permissions,
}: SettingsSidebarContainerProps) => {
  const { t } = useLocale();

  const tabsWithPermissions = useTabs({
    isDelegationCredentialEnabled: false,
    isPbacEnabled: false,
    permissions,
  });

  return (
    <nav
      style={{ maxHeight: `calc(100vh - ${bannersHeight}px)`, top: `${bannersHeight}px` }}
      className={classNames(
        "no-scrollbar stack-y-1 fixed top-0 bottom-0 left-0 z-20 flex max-h-screen w-56 flex-col overflow-x-hidden overflow-y-scroll bg-cal-muted px-2 pb-3 transition-transform max-lg:z-10 lg:sticky lg:flex",
        className,
        navigationIsOpenedOnMobile
          ? "translate-x-0 opacity-100"
          : "-translate-x-full opacity-0 lg:translate-x-0 lg:opacity-100"
      )}
      aria-label={t("settings_navigation")}>
      <BackButtonInSidebar name={t("back")} />
      {tabsWithPermissions.map((tab) => {
        return (
          <React.Fragment key={tab.href}>
            <div className={`${!tab.children?.length ? "mb-3!" : ""}`}>
              <div className="group flex h-7 w-full flex-row items-center rounded-md px-2 font-medium text-default text-sm leading-none [&[aria-current='page']]:bg-emphasis [&[aria-current='page']]:text-emphasis">
                {tab?.icon && (
                  <Icon
                    name={tab.icon}
                    className="h-[16px] w-[16px] stroke-[2px] text-subtle md:mt-0 ltr:mr-3 rtl:ml-3"
                  />
                )}
                {}
                {!tab.icon && tab?.avatar && (
                  <Image
                    width={16}
                    height={16}
                    className="rounded-full ltr:mr-3 rtl:ml-3"
                    src={tab?.avatar}
                    alt="Organization Logo"
                  />
                )}
                <Skeleton
                  title={tab.name}
                  as="p"
                  className="truncate font-medium text-sm text-subtle leading-5"
                  loadingClassName="ms-3">
                  {t(tab.name)}
                </Skeleton>
              </div>
            </div>
            <div className="flex flex-col space-y-1">
              {tab.children?.map((child, index) => (
                <div key={child.href} className="flex items-start gap-2">
                  <VerticalTabItem
                    name={t(child.name)}
                    isExternalLink={child.isExternalLink}
                    href={child.href || "/"}
                    trackingMetadata={child.trackingMetadata}
                    textClassNames="text-emphasis font-medium text-sm"
                    className={`h-auto min-h-7 w-fit px-2! py-1! ${
                      tab.children && index === tab.children?.length - 1 && "mb-3!"
                    }`}
                    disableChevron
                  />
                  {child.isBadged && (
                    <Badge variant="blue" className="mt-0.5 text-xs">
                      New
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </React.Fragment>
        );
      })}
    </nav>
  );
};

const MobileSettingsContainer = (props: { onSideContainerOpen?: () => void }) => {
  const { t } = useLocale();
  const router = useRouter();
  const isStandalone = useIsStandalone();

  if (isStandalone) return null;

  return (
    <nav className="sticky top-0 z-20 flex w-full items-center justify-between border-muted border-b bg-cal-muted px-2 py-2 sm:relative lg:hidden">
      <div className="flex items-center space-x-3">
        <Button StartIcon="menu" color="minimal" variant="icon" onClick={props.onSideContainerOpen}>
          <span className="sr-only">{t("show_navigation")}</span>
        </Button>

        <button
          className="flex items-center space-x-2 rounded-md px-3 py-1 hover:bg-emphasis rtl:space-x-reverse"
          onClick={() => router.back()}>
          <ArrowLeftIcon className="h-4 w-4 text-default" />
          <p className="font-semibold text-emphasis">{t("settings")}</p>
        </button>
      </div>
    </nav>
  );
};

type SettingsLayoutProps = {
  children: React.ReactNode;
  containerClassName?: string;
  teamFeatures?: Record<number, TeamFeatures>;
  permissions?: SettingsPermissions;
} & ComponentProps<typeof Shell>;

function SettingsLayoutAppDirClient({ children, teamFeatures, permissions, ...rest }: SettingsLayoutProps) {
  const _pathname = usePathname();
  const state = useState(false);
  const [sideContainerOpen, setSideContainerOpen] = state;

  useEffect(() => {
    const closeSideContainer = () => {
      if (window.innerWidth >= 1024) {
        setSideContainerOpen(false);
      }
    };

    window.addEventListener("resize", closeSideContainer);
    return () => {
      window.removeEventListener("resize", closeSideContainer);
    };
  }, [setSideContainerOpen]);

  useEffect(() => {
    setSideContainerOpen((prev) => (prev ? false : prev));
  }, [setSideContainerOpen]);

  return (
    <Shell
      flexChildrenContainer
      {...rest}
      SidebarContainer={
        <SidebarContainerElement
          sideContainerOpen={sideContainerOpen}
          setSideContainerOpen={setSideContainerOpen}
          teamFeatures={teamFeatures}
          permissions={permissions}
        />
      }
      drawerState={state}
      MobileNavigationContainer={null}
      TopNavContainer={
        <MobileSettingsContainer onSideContainerOpen={() => setSideContainerOpen(!sideContainerOpen)} />
      }>
      <div className="flex flex-1 *:flex-1">
        <div
          className={classNames("mx-auto max-w-full justify-center lg:max-w-3xl", rest.containerClassName)}>
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </div>
    </Shell>
  );
}

type SidebarContainerElementProps = {
  sideContainerOpen: boolean;
  bannersHeight?: number;
  setSideContainerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  teamFeatures?: Record<number, TeamFeatures>;
  permissions?: SettingsPermissions;
};

const SidebarContainerElement = ({
  sideContainerOpen,
  bannersHeight,
  setSideContainerOpen,
  teamFeatures,
  permissions,
}: SidebarContainerElementProps) => {
  const { t } = useLocale();
  return (
    <>
      {/* Mobile backdrop */}
      {sideContainerOpen && (
        <button
          onClick={() => setSideContainerOpen(false)}
          className="fixed top-0 left-0 z-10 h-full w-full bg-black/50">
          <span className="sr-only">{t("hide_navigation")}</span>
        </button>
      )}
      <SettingsSidebarContainer
        navigationIsOpenedOnMobile={sideContainerOpen}
        bannersHeight={bannersHeight}
        teamFeatures={teamFeatures}
        permissions={permissions}
      />
    </>
  );
};

export type { SettingsLayoutProps, SettingsPermissions };
export default SettingsLayoutAppDirClient;
