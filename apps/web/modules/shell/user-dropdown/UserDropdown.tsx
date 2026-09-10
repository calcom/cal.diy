import { ROADMAP } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import useMeQuery from "@calcom/trpc/react/hooks/useMeQuery";
import classNames from "@calcom/ui/classNames";
import { Avatar } from "@calcom/ui/components/avatar";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "@coss/ui/components/menu";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CircleHelpIcon,
  LogOutIcon,
  MapIcon,
  MoonIcon,
  SettingsIcon,
  UserIcon,
} from "@coss/ui/icons";
import Link from "next/link";
import { signOut } from "next-auth/react";
import type { MouseEvent } from "react";
import { useEffect, useState } from "react";

declare global {
  interface Window {
    Support?: {
      open: () => void;
      shouldShowTriggerButton: (showTrigger: boolean) => void;
    };
    Beacon?: BeaconFunction;
  }
}

type BeaconFunction = {
  (command: "session-data", data: Record<string, string | number>): void;
  // Catch-all for other methods - add explicit types above if using new commands
  (...args: unknown[]): void;
};

interface UserDropdownProps {
  small?: boolean;
  iconOnly?: boolean;
}

export function UserDropdown({ small, iconOnly }: UserDropdownProps) {
  const { t } = useLocale();
  const { data: user, isPending } = useMeQuery();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const sendSessionData = () => {
      const Beacon = window.Beacon;
      if (Beacon) {
        Beacon("session-data", {
          username: user?.username || "Unknown",
          screenResolution: `${screen.width}x${screen.height}`,
        });
        return true;
      }
      return false;
    };

    // Try immediately, then poll if Beacon isn't loaded yet
    if (!sendSessionData()) {
      const intervalId = setInterval(() => {
        if (sendSessionData()) {
          clearInterval(intervalId);
        }
      }, 1000);

      return () => clearInterval(intervalId);
    }
  }, [user?.username]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [openSupportAfterClose, setOpenSupportAfterClose] = useState(false);

  const handleHelpClick = (e?: MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    setOpenSupportAfterClose(true);
    setMenuOpen(false);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!menuOpen && openSupportAfterClose) {
      setTimeout(() => {
        window.Support?.open();
      }, 0);
      setOpenSupportAfterClose(false);
    }
  }, [menuOpen, openSupportAfterClose]);

  // Prevent rendering dropdown if user isn't available.
  // We don't want to show nameless user.
  if (!user && !isPending) {
    return null;
  }

  return (
    <Menu open={menuOpen} onOpenChange={setMenuOpen}>
      <MenuTrigger
        disabled={isPending}
        render={
          <button
            data-testid="user-dropdown-trigger-button"
            className={classNames(
              "todesktop:!bg-transparent group flex cursor-pointer appearance-none items-center text-left outline-none transition focus:outline-none focus:ring-0",
              iconOnly
                ? "mx-auto size-9 justify-center rounded-full p-0 hover:bg-transparent"
                : "hover:bg-emphasis mx-0 w-full rounded-full md:rounded-none lg:rounded",
              !iconOnly && (small ? "p-2" : "px-2 py-1.5")
            )}
          />
        }>
        <span
          className={classNames(
            iconOnly
              ? "h-6 w-6"
              : small
                ? "h-4 w-4"
                : "h-5 w-5 ltr:mr-2 rtl:ml-2",
            "relative shrink-0 rounded-full"
          )}>
          <Avatar
            size={iconOnly ? "sm" : small ? "xs" : "xsm"}
            imageSrc={user?.avatarUrl ?? user?.avatar}
            alt={user?.username ? `${user.username} Avatar` : "Nameless User Avatar"}
            className="overflow-hidden"
          />
          <span
            className={classNames(
              "border-muted absolute -bottom-1 -right-1 rounded-full border bg-green-500",
              small ? "-bottom-0.5 -right-0.5 h-2.5 w-2.5" : "-bottom-0.5 right-0 h-2 w-2"
            )}
          />
        </span>
        {!small && !iconOnly && (
          <span className="flex grow items-center gap-2">
            <span className="w-24 shrink-0 text-sm leading-none">
              <span className="text-emphasis block truncate py-0.5 font-medium leading-normal">
                {isPending ? "Loading..." : (user?.name ?? "Nameless User")}
              </span>
            </span>
            {menuOpen ? (
              <ChevronUpIcon
                className="group-hover:text-subtle text-muted h-4 w-4 shrink-0 transition rtl:mr-4"
                aria-hidden="true"
              />
            ) : (
              <ChevronDownIcon
                className="group-hover:text-subtle text-muted h-4 w-4 shrink-0 transition rtl:mr-4"
                aria-hidden="true"
              />
            )}
          </span>
        )}
      </MenuTrigger>

      <>
        <MenuPopup align="start">
          <>
            <MenuItem render={<Link href="/settings/my-account/profile" />}>
              <UserIcon />
              {t("my_profile")}
            </MenuItem>
            <MenuItem render={<Link href="/settings/my-account/general" />}>
              <SettingsIcon />
              {t("my_settings")}
            </MenuItem>
            <MenuItem render={<Link href="/settings/my-account/out-of-office" />}>
              <MoonIcon />
              {t("out_of_office")}
            </MenuItem>
            <MenuSeparator />
          </>

          <MenuItem render={<a href={ROADMAP} target="_blank" rel="noreferrer" />}>
            <MapIcon />
            {t("visit_roadmap")}
          </MenuItem>
          <MenuItem onClick={handleHelpClick}>
            <CircleHelpIcon />
            {t("help")}
          </MenuItem>
          <MenuSeparator />

          <MenuItem
            variant="destructive"
            onClick={() => {
              signOut({ callbackUrl: "/auth/logout" });
            }}>
            <LogOutIcon />
            {t("sign_out")}
          </MenuItem>
        </MenuPopup>
      </>
    </Menu>
  );
}
