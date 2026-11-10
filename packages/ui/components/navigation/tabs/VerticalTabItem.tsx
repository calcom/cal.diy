import Link from "next/link";
import { Fragment } from "react";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { useUrlMatchesCurrentUrl } from "@calcom/lib/hooks/useUrlMatchesCurrentUrl";
import classNames from "@calcom/ui/classNames";

import { Icon } from "../../icon";
import type { IconName } from "../../icon";

export type VerticalTabItemProps = {
  name: string;
  info?: string;
  icon?: IconName;
  disabled?: boolean;
  children?: VerticalTabItemProps[];
  textClassNames?: string;
  className?: string;
  isChild?: boolean;
  hidden?: boolean;
  disableChevron?: boolean;
  href: string;
  isExternalLink?: boolean;
  linkShallow?: boolean;
  linkScroll?: boolean;
  avatar?: string;
  iconClassName?: string;
  onClick?: (name: string) => void;
  isActive?: boolean;
  isBadged?: boolean;
  "data-testid"?: string;
};

const VerticalTabItem = ({
  name,
  href,
  info,
  isChild,
  disableChevron,
  linkShallow,
  linkScroll,
  ...props
}: VerticalTabItemProps) => {
  const isCurrent = useUrlMatchesCurrentUrl(href) || props?.isActive;
  const { t } = useLocale();

  return (
    <Fragment key={name}>
      {!props.hidden && (
        <>
          <Link
            onClick={(e) => {
              if (props.onClick) {
                e.preventDefault();
                props.onClick(name);
              }
            }}
            key={name}
            href={href}
            shallow={linkShallow}
            scroll={linkScroll}
            aria-disabled={props.disabled ? "true" : undefined}
            target={props.isExternalLink ? "_blank" : "_self"}
            className={classNames(
              props.textClassNames || "text-default text-sm font-medium leading-none",
              "hover:bg-subtle [&[aria-current='page']]:bg-subtle [&[aria-current='page']]:text-emphasis group-hover:text-default group flex w-full flex-row items-center rounded-md p-2 transition ",
              props.disabled && "pointer-events-none opacity-30!",
              (isChild || !props.icon) && "ml-7",
              props.className
            )}
            data-testid={`vertical-tab-${props["data-testid"]}`}
            aria-current={isCurrent ? "page" : undefined}>
            {props.icon && (
              <Icon
                name={props.icon}
                className={classNames("me-2 h-4 w-4", props.iconClassName)}
                data-testid="icon-component"
              />
            )}
            <div className="h-fit min-w-0 flex-1">
              <span className="flex items-center gap-2">
                {t(name)}
                {props.isExternalLink ? <Icon name="external-link" data-testid="external-link" /> : null}
              </span>
              {info && (
                // TODO: I don't think having apps-info as a data-test-id is right here as this is meant to be dumb component.
                <p data-testid="apps-info" className="mt-1 text-xs font-normal">
                  {info}
                </p>
              )}
            </div>
            {!disableChevron && isCurrent && (
              <div className="ml-auto self-center">
                <Icon
                  name="chevron-right"
                  width={20}
                  height={20}
                  className="text-default h-auto w-[20px] stroke-[1.5px]"
                  data-testid="chevron-right"
                />
              </div>
            )}
          </Link>
          {props.children?.map((child) => (
            <VerticalTabItem key={child.name} {...child} isChild />
          ))}
        </>
      )}
    </Fragment>
  );
};

export default VerticalTabItem;
