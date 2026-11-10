import { useLocale } from "@calcom/lib/hooks/useLocale";
import useMediaQuery from "@calcom/lib/hooks/useMediaQuery";
import { sessionStorage } from "@calcom/lib/webstorage";
import classNames from "@calcom/ui/classNames";
import { Badge } from "@calcom/ui/components/badge";
import type { IconName } from "@calcom/ui/components/icon";
import { Icon } from "@calcom/ui/components/icon";
import { SkeletonText } from "@calcom/ui/components/skeleton";
import { Tooltip } from "@calcom/ui/components/tooltip";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";
import { Fragment, useEffect, useState } from "react";
import { useShouldDisplayNavigationItem } from "./useShouldDisplayNavigationItem";

const usePersistedExpansionState = (itemName: string) => {
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(`nav-expansion-${itemName}`);
    if (stored !== null) {
      setIsExpanded(JSON.parse(stored));
    }
  }, [itemName]);

  const setPersistedExpansion = (expanded: boolean) => {
    setIsExpanded(expanded);
    sessionStorage.setItem(`nav-expansion-${itemName}`, JSON.stringify(expanded));
  };

  return [isExpanded, setPersistedExpansion] as const;
};

export type NavigationItemType = {
  name: string;
  href: string;
  isLoading?: boolean;
  onClick?: React.MouseEventHandler<HTMLAnchorElement | HTMLButtonElement>;
  target?: HTMLAnchorElement["target"];
  badge?: React.ReactNode;
  icon?: IconName;
  child?: NavigationItemType[];
  pro?: true;
  onlyMobile?: boolean;
  onlyDesktop?: boolean;
  moreOnMobile?: boolean;
  isCurrent?: ({
    item,
    isChild,
    pathname,
  }: {
    item: Pick<NavigationItemType, "href">;
    isChild?: boolean;
    pathname: string | null;
  }) => boolean;
};

const defaultIsCurrent: NavigationItemType["isCurrent"] = ({ isChild, item, pathname }) => {
  return isChild ? item.href === pathname : item.href ? (pathname?.startsWith(item.href) ?? false) : false;
};

export const NavigationItem: React.FC<{
  index?: number;
  item: NavigationItemType;
  isChild?: boolean;
}> = (props) => {
  const { item, isChild } = props;
  const { t, isLocaleReady } = useLocale();
  const pathname = usePathname();
  const isCurrent: NavigationItemType["isCurrent"] = item.isCurrent || defaultIsCurrent;
  const current = isCurrent({ isChild: !!isChild, item, pathname });
  const shouldDisplayNavigationItem = useShouldDisplayNavigationItem(props.item);
  const [isExpanded, setIsExpanded] = usePersistedExpansionState(item.name);

  const isTablet = useMediaQuery("(max-width: 1024px)");
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);

  if (!shouldDisplayNavigationItem) return null;

  const hasChildren = item.child && item.child.length > 0;
  const hasActiveChild =
    hasChildren && item.child?.some((child) => isCurrent({ isChild: true, item: child, pathname }));
  const shouldShowChildren = isExpanded || hasActiveChild || isCurrent({ pathname, isChild, item });
  const shouldShowChevron = hasChildren && !hasActiveChild;
  const isParentNavigationItem = hasChildren && !isChild;

  return (
    <Fragment>
      {isParentNavigationItem ? (
        <Tooltip
          side="right"
          open={isTooltipOpen}
          content={
            hasChildren ? (
              <div className="stack-y-1 pointer-events-auto flex flex-col p-1">
                <span className="text-subtle px-2 text-xs font-semibold uppercase tracking-wide">
                  {t(item.name)}
                </span>
                <div className="flex flex-col gap-1">
                  {item.child?.map((childItem) => {
                    const childIsCurrent =
                      typeof childItem.isCurrent === "function"
                        ? childItem.isCurrent({
                            isChild: true,
                            item: childItem,
                            pathname,
                          })
                        : defaultIsCurrent({
                            isChild: true,
                            item: childItem,
                            pathname,
                          });
                    return (
                      <Link
                        key={childItem.name}
                        href={childItem.href}
                        aria-current={childIsCurrent ? "page" : undefined}
                        onClick={() => {
                          setIsTooltipOpen(false);
                        }}
                        className={classNames(
                          "group relative block rounded-md px-3 py-1 text-sm font-medium",
                          childIsCurrent
                            ? "bg-emphasis text-white"
                            : "hover:bg-emphasis text-mute hover:text-emphasis"
                        )}>
                        {t(childItem.name)}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : (
              t(item.name)
            )
          }
          className="lg:hidden">
          <button
            data-test-id={item.name}
            aria-label={t(item.name)}
            aria-expanded={isExpanded}
            aria-current={current ? "page" : undefined}
            onClick={() => {
              if (isTablet && hasChildren) {
                setIsTooltipOpen(!isTooltipOpen);
              } else {
                setIsExpanded(!isExpanded);
              }
            }}
            className={classNames(
              "todesktop:py-[7px] text-default group relative flex w-full items-center rounded-md px-2 py-1.5 text-sm font-medium transition",
              "aria-[aria-current='page']:bg-transparent!",
              "[&[aria-current='page']]:text-emphasis mt-0.5 text-sm",
              "md:justify-center lg:justify-start",
              isLocaleReady
                ? "hover:bg-subtle todesktop:[&[aria-current='page']]:bg-emphasis todesktop:hover:bg-transparent hover:text-emphasis"
                : ""
            )}>
            {item.icon && (
              <div className="relative">
                <Icon
                  name={item.isLoading ? "rotate-cw" : item.icon}
                  className={classNames(
                    "todesktop:!text-blue-500 h-4 w-4 shrink-0 lg:ltr:mr-2 lg:rtl:ml-2",
                    item.isLoading && "animate-spin"
                  )}
                  aria-hidden="true"
                />
                {shouldShowChevron && (
                  <Icon
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-subtle p-0.5 lg:hidden"
                  />
                )}
              </div>
            )}
            {isLocaleReady ? (
              <span
                className="hidden w-full justify-between truncate text-ellipsis lg:flex"
                data-testid={`${item.name}-test`}>
                {t(item.name)}
                {item.badge && item.badge}
              </span>
            ) : (
              <SkeletonText className="h-[20px] w-full" />
            )}
            {shouldShowChevron && (
              <Icon
                name={isExpanded ? "chevron-up" : "chevron-down"}
                className="ml-auto hidden h-4 w-4 lg:block"
              />
            )}
          </button>
        </Tooltip>
      ) : (
        <Tooltip side="right" content={t(item.name)} className="lg:hidden">
          <Link
            data-test-id={item.name}
            href={item.href}
            aria-label={t(item.name)}
            target={item.target}
            className={classNames(
              "todesktop:py-[7px] text-default group flex items-center rounded-md px-2 py-1.5 text-sm font-medium transition",
              item.child
                ? `aria-[aria-current='page']:bg-transparent!`
                : `[&[aria-current='page']]:bg-emphasis`,
              isChild
                ? `[&[aria-current='page']]:text-emphasis [&[aria-current='page']]:bg-emphasis hidden h-8 pl-16 lg:flex lg:pl-11 ${
                    props.index === 0 ? "mt-0" : "mt-1  hover:mt-1 [&[aria-current='page']]:mt-1"
                  }`
                : "[&[aria-current='page']]:text-emphasis mt-0.5 text-sm md:justify-center lg:justify-start",
              isLocaleReady
                ? "hover:bg-subtle todesktop:[&[aria-current='page']]:bg-emphasis todesktop:hover:bg-transparent hover:text-emphasis"
                : ""
            )}
            aria-current={current ? "page" : undefined}>
            {item.icon && (
              <Icon
                name={item.isLoading ? "rotate-cw" : item.icon}
                className={classNames(
                  "todesktop:!text-blue-500 h-4 w-4 shrink-0 aria-[aria-current='page']:text-inherit lg:ltr:mr-2 lg:rtl:ml-2",
                  item.isLoading && "animate-spin"
                )}
                aria-hidden="true"
                aria-current={current ? "page" : undefined}
              />
            )}
            {isLocaleReady ? (
              <span
                className="hidden w-full justify-between truncate text-ellipsis lg:flex"
                data-testid={`${item.name}-test`}>
                {t(item.name)}
                {item.badge && item.badge}
              </span>
            ) : (
              <SkeletonText className="h-[20px] w-full" />
            )}
          </Link>
        </Tooltip>
      )}
      {hasChildren && (
        <div
          className={classNames(
            "grid transition-all duration-300 ease-in-out",
            shouldShowChildren ? "grid-rows-[1fr] opacity-100 visible" : "grid-rows-[0fr] opacity-0 invisible"
          )}
          aria-hidden={!shouldShowChildren}>
          <div className="overflow-hidden">
            {item.child?.map((item, index) => (
              <NavigationItem index={index} key={item.name} item={item} isChild />
            ))}
          </div>
        </div>
      )}
    </Fragment>
  );
};

export const MobileNavigationItem: React.FC<{
  item: NavigationItemType;
  isChild?: boolean;
}> = (props) => {
  const { item, isChild } = props;
  const pathname = usePathname();
  const { t, isLocaleReady } = useLocale();
  const isCurrent: NavigationItemType["isCurrent"] = item.isCurrent || defaultIsCurrent;
  const current = isCurrent({ isChild: !!isChild, item, pathname });
  const shouldDisplayNavigationItem = useShouldDisplayNavigationItem(props.item);

  if (!shouldDisplayNavigationItem) return null;
  return (
    <Link
      key={item.name}
      href={item.href}
      target={item.target}
      className="[&[aria-current='page']]:text-emphasis hover:text-default text-muted bg-transparent! relative my-2 min-w-0 flex-1 overflow-hidden rounded-md p-1 text-center text-xs font-medium focus:z-10 sm:text-sm"
      aria-current={current ? "page" : undefined}>
      {item.badge && <div className="absolute right-1 top-1">{item.badge}</div>}
      {item.icon && (
        <Icon
          name={item.icon}
          className="[&[aria-current='page']]:text-emphasis  mx-auto mb-1 block h-5 w-5 shrink-0 text-center text-inherit"
          aria-hidden="true"
          aria-current={current ? "page" : undefined}
        />
      )}
      {isLocaleReady ? <span className="block truncate">{t(item.name)}</span> : <SkeletonText />}
    </Link>
  );
};

export const MobileNavigationMoreItem: React.FC<{
  item: NavigationItemType;
  isChild?: boolean;
}> = (props) => {
  const { item } = props;
  const { t, isLocaleReady } = useLocale();
  const shouldDisplayNavigationItem = useShouldDisplayNavigationItem(props.item);
  const [isExpanded, setIsExpanded] = usePersistedExpansionState(item.name);

  if (!shouldDisplayNavigationItem) return null;

  const hasChildren = item.child && item.child.length > 0;
  const isActionItem = !item.href && item.onClick;

  const itemContent = (
    <>
      <span className="text-default flex items-center font-semibold ">
        {item.icon && (
          <Icon name={item.icon} className="h-5 w-5 shrink-0 ltr:mr-3 rtl:ml-3" aria-hidden="true" />
        )}
        {isLocaleReady ? t(item.name) : <SkeletonText />}
      </span>
      {!isActionItem && <Icon name="arrow-right" className="text-subtle h-5 w-5" />}
    </>
  );

  return (
    <li className="border-subtle border-b last:border-b-0" key={item.name}>
      {hasChildren ? (
        <>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="hover:bg-subtle flex w-full items-center justify-between p-5 text-left transition">
            <span className="text-default flex items-center font-semibold">
              {item.icon && (
                <Icon name={item.icon} className="h-5 w-5 shrink-0 ltr:mr-3 rtl:ml-3" aria-hidden="true" />
              )}
              {isLocaleReady ? t(item.name) : <SkeletonText />}
            </span>
            <Icon name={isExpanded ? "chevron-up" : "chevron-down"} className="text-subtle h-5 w-5" />
          </button>
          <div
            className={classNames(
              "grid transition-all duration-300 ease-in-out",
              isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            )}>
            <div className="overflow-hidden">
              {item.child && (
                <ul className="bg-subtle">
                  {item.child.map((childItem) => (
                    <li key={childItem.name} className="border-subtle border-t">
                      <Link
                        href={childItem.href}
                        className="hover:bg-cal-muted flex items-center p-4 pl-12 transition">
                        <span className="text-default font-medium">
                          {isLocaleReady ? t(childItem.name) : <SkeletonText />}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : isActionItem ? (
        <button
          onClick={item.onClick}
          className="hover:bg-subtle flex w-full items-center justify-between p-5 text-left transition">
          {itemContent}
        </button>
      ) : (
        <Link
          href={item.href}
          target={item.target}
          className="hover:bg-subtle flex items-center justify-between p-5 transition">
          {itemContent}
        </Link>
      )}
    </li>
  );
};
