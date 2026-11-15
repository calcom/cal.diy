import { ShellMainAppDirBackButton } from "app/(use-page-wrapper)/(main-nav)/ShellMainAppDirBackButton";
import classNames from "classnames";

import type { LayoutProps } from "~/shell/Shell";

type ShellMainAppDirProps = Pick<
  LayoutProps,
  | "heading"
  | "subtitle"
  | "headerClassName"
  | "CTA"
  | "actions"
  | "beforeCTAactions"
  | "afterHeading"
  | "backPath"
  | "HeadingLeftIcon"
  | "smallHeading"
  | "large"
  | "flexChildrenContainer"
  | "children"
>;

// Copied from `ShellMain` but with a different `ShellMainAppDirBackButton` import
// for client/server component separation
export function ShellMainAppDir(props: ShellMainAppDirProps) {
  return (
    <>
      {(props.heading || !!props.backPath) && (
        <div
          className={classNames(
            "flex items-center md:mb-6 md:mt-0",
            props.smallHeading ? "lg:mb-7" : "lg:mb-8"
          )}>
          {!!props.backPath && <ShellMainAppDirBackButton backPath={props.backPath} />}
          {props.heading && (
            <header
              className={classNames(
                props.large && "py-8",
                "flex w-full max-w-full items-center flex-wrap md:flex-nowrap gap-2 md:gap-0"
              )}>
              {props.HeadingLeftIcon && <div className="ltr:mr-4">{props.HeadingLeftIcon}</div>}
              <div
                className={classNames(
                  "hidden min-w-0 flex-1 ltr:mr-4 rtl:ml-4 md:block",
                  props.headerClassName
                )}>
                {props.heading && (
                  <h3
                    className={classNames(
                      "font-cal text-emphasis max-w-28 sm:max-w-72 md:max-w-80 inline truncate text-lg font-semibold tracking-wide sm:text-xl md:block xl:max-w-full",
                      props.smallHeading ? "text-base" : "text-xl"
                    )}>
                    {props.heading}
                  </h3>
                )}
                {props.subtitle && (
                  <p className="text-default hidden text-sm md:block" data-testid="subtitle">
                    {props.subtitle}
                  </p>
                )}
              </div>
              {props.beforeCTAactions}
              {props.CTA && (
                <div
                  className={classNames(
                    props.backPath
                      ? "relative"
                      : "pwa:bottom-[max(7rem,_calc(5rem_+_env(safe-area-inset-bottom)))] fixed bottom-20 z-40 ltr:right-4 rtl:left-4 md:z-auto md:ltr:right-0 md:rtl:left-0",
                    "shrink-0 [-webkit-app-region:no-drag] md:relative md:bottom-auto md:right-auto"
                  )}>
                  {props.CTA}
                </div>
              )}
              {props.actions && props.actions}
            </header>
          )}
        </div>
      )}
      {props.afterHeading && <>{props.afterHeading}</>}

      <div className={classNames(props.flexChildrenContainer && "flex flex-1 flex-col")}>
        {props.children}
      </div>
    </>
  );
}
