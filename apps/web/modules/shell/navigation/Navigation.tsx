import { useIsEmbed } from "@calcom/embed-core/embed-iframe";
import { useIsStandalone } from "@calcom/lib/hooks/useIsStandalone";
import classNames from "@calcom/ui/classNames";
import { useSession } from "next-auth/react";
import { useMemo } from "react";
import UnconfirmedBookingBadge from "../../bookings/components/UnconfirmedBookingBadge";
import { KBarTrigger } from "../Kbar";
import type { NavigationItemType } from "./NavigationItem";
import { MobileNavigationItem, MobileNavigationMoreItem, NavigationItem } from "./NavigationItem";
import { useMobileMoreItems } from "./useMobileMoreItems";

export const MORE_SEPARATOR_NAME = "more";

const getNavigationItems = (): NavigationItemType[] => [
  {
    name: "event_types_page_title",
    href: "/event-types",
    icon: "link",
  },
  {
    name: "bookings",
    href: "/bookings/upcoming",
    icon: "calendar",
    badge: <UnconfirmedBookingBadge />,
    isCurrent: ({ pathname }) => pathname?.startsWith("/bookings") ?? false,
  },
  {
    name: "availability",
    href: "/availability",
    icon: "clock",
  },
  {
    name: "apps",
    href: "/apps",
    icon: "grid-3x3",
    moreOnMobile: true,
    isCurrent: ({ pathname: path, item }) => {
      // During Server rendering path is /v2/apps but on client it becomes /apps(weird..)
      return path?.startsWith(item.href) ?? false;
    },
    child: [
      {
        name: "app_store",
        href: "/apps",
        isCurrent: ({ pathname: path, item }) => {
          // During Server rendering path is /v2/apps but on client it becomes /apps(weird..)
          return (path?.startsWith(item.href) ?? false) && !(path?.includes("/installed") ?? false);
        },
      },
      {
        name: "installed_apps",
        href: "/apps/installed/calendar",
        isCurrent: ({ pathname: path }) =>
          (path?.startsWith("/apps/installed/") ?? false) ||
          (path?.startsWith("/v2/apps/installed/") ?? false),
      },
    ],
  },
  {
    name: MORE_SEPARATOR_NAME,
    href: "/more",
    icon: "ellipsis",
  },
];

const useNavigationItems = () => {
  return useMemo(() => {
    const items = getNavigationItems();

    const desktopNavigationItems = items.filter((item) => item.name !== MORE_SEPARATOR_NAME);
    const mobileNavigationBottomItems = items.filter(
      (item) => (!item.moreOnMobile && !item.onlyDesktop) || item.name === MORE_SEPARATOR_NAME
    );
    const mobileNavigationMoreItems = items.filter(
      (item) => item.moreOnMobile && !item.onlyDesktop && item.name !== MORE_SEPARATOR_NAME
    );

    return {
      desktopNavigationItems,
      mobileNavigationBottomItems,
      mobileNavigationMoreItems,
    };
  }, []);
};

type NavigationProps = {
  isCollapsed: boolean;
};

export const Navigation = ({ isCollapsed }: NavigationProps) => {
  const { desktopNavigationItems } = useNavigationItems();

  return (
    <nav className="mt-2 flex-1 md:px-2 lg:mt-4 lg:px-0">
      {desktopNavigationItems.map((item) => (
        <NavigationItem
          key={item.name}
          item={item}
          isCollapsed={isCollapsed}
        />
      ))}
      <div className="mt-0.5 text-subtle lg:hidden">
        <KBarTrigger />
      </div>
    </nav>
  );
};

export function MobileNavigationContainer() {
  const { status } = useSession();
  const isStandalone = useIsStandalone();
  if (status !== "authenticated" || isStandalone) return null;
  return <MobileNavigation />;
}

const MobileNavigation = () => {
  const isEmbed = useIsEmbed();
  const { mobileNavigationBottomItems } = useNavigationItems();

  return (
    <>
      <nav
        className={classNames(
          "fixed bottom-0 left-0 z-30 pwa:-mx-2 flex w-full border-subtle border-t bg-cal-muted/40 px-1 pwa:pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow backdrop-blur-md md:hidden",
          isEmbed && "hidden"
        )}>
        {mobileNavigationBottomItems.map((item) => (
          <MobileNavigationItem key={item.name} item={item} />
        ))}
      </nav>
      {/* add padding to content for mobile navigation*/}
      <div className="block pt-12 md:hidden" />
    </>
  );
};

export const MobileNavigationMoreItems = () => {
  const { mobileNavigationMoreItems } = useNavigationItems();
  const bottomItems = useMobileMoreItems();

  const allItems = [...mobileNavigationMoreItems, ...bottomItems];

  return (
    <ul className="mt-2 rounded-md border border-subtle">
      {allItems.map((item) => (
        <MobileNavigationMoreItem key={item.name} item={item} />
      ))}
    </ul>
  );
};
