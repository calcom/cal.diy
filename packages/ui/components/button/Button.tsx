import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type { LinkProps } from "next/link";
import Link from "next/link";
import React, { forwardRef } from "react";

import classNames from "@calcom/ui/classNames";

import { Icon } from "../icon/Icon";
import type { IconName } from "../icon/Icon";
import { Tooltip } from "../tooltip/Tooltip";

type InferredVariantProps = VariantProps<typeof buttonClasses>;

export type ButtonColor = NonNullable<InferredVariantProps["color"]>;
export type ButtonBaseProps = {
  /** Action that happens when the button is clicked */
  onClick?: (event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
  /**Left aligned icon*/
  CustomStartIcon?: React.ReactNode;
  StartIcon?: IconName;
  /**Right aligned icon */
  EndIcon?: IconName;
  shallow?: boolean;
  /**Tool tip used when icon size is set to small */
  tooltip?: string | React.ReactNode;
  tooltipSide?: "top" | "right" | "bottom" | "left";
  tooltipOffset?: number;
  tooltipClassName?: string;
  disabled?: boolean;
  flex?: boolean;
} & Omit<InferredVariantProps, "color"> & {
    color?: ButtonColor;
  };

export type ButtonProps = ButtonBaseProps &
  (
    | (Omit<JSX.IntrinsicElements["a"], "href" | "onClick" | "ref"> & LinkProps)
    | (Omit<JSX.IntrinsicElements["button"], "onClick" | "ref"> & { href?: never })
  );

export const buttonClasses = cva(
  "group whitespace-nowrap inline-flex items-center text-sm font-medium relative rounded-[10px] transition cursor-pointer disabled:cursor-not-allowed gap-1",
  {
    variants: {
      variant: {
        button: "",
        icon: "flex justify-center",
        fab: "min-w-14 min-h-14 md:min-w-min md:min-h-min rounded-full justify-center md:rounded-[10px] radix-state-open:rotate-45 md:radix-state-open:rotate-0 radix-state-open:shadown-none radix-state-open:ring-0",
      },
      color: {
        primary: [
          // Base colors
          "bg-brand-default",
          "text-brand",
          // Hover state
          "not-disabled:hover:bg-brand-emphasis",
          // Focus state
          "focus-visible:outline-none",
          "focus-visible:ring-0",
          "focus-visible:shadow-button-solid-brand-focused",
          // Border
          "border border-brand-default",
          // Disabled
          "disabled:opacity-30",
          // Shadows and effects
          "shadow-button-solid-brand-default",
          "not-disabled:active:shadow-button-solid-brand-active",
          "not-disabled:hover:shadow-button-solid-brand-hover",
          "transition-shadow",
          "transition-transform",
          "duration-100",
        ],

        secondary: [
          // Base colors and border
          "bg-default",
          "text-default",
          "border",
          "border-default",
          // Hover state
          "not-disabled:hover:bg-cal-muted",
          "not-disabled:hover:text-emphasis",
          // Disabled
          "disabled:opacity-30",
          // Focus state
          "focus-visible:bg-subtle",
          "focus-visible:outline-none",
          "focus-visible:ring-0",
          "focus-visible:shadow-outline-gray-focused",
          // Shadows and effects
          "shadow-outline-gray-rested",
          "not-disabled:hover:shadow-outline-gray-hover",
          "not-disabled:active:shadow-outline-gray-active",
          "transition-shadow",
          "duration-200",
        ],

        minimal: [
          // Base color
          "text-subtle",
          "border border-transparent",
          // Hover
          "not-disabled:hover:bg-subtle",
          "not-disabled:hover:text-emphasis",
          "not-disabled:hover:border-subtle hover:border",
          // Disabled
          "disabled:opacity-30",
          // Focus
          "focus-visible:bg-subtle",
          "focus-visible:outline-none",
          "focus-visible:ring-0",
          "focus-visible:border-subtle",
          "focus-visible:shadow-button-outline-gray-focused",

          // Shadows and effects
          "not-disabled:active:shadow-outline-gray-active",
          "transition-shadow",
          "duration-200",
        ],

        destructive: [
          // Base colors and border
          "border",
          "border-default",
          "text-error",
          // Hover state
          "dark:hover:text-red-400",
          "hover:border-semantic-error",
          "hover:bg-error",
          // Focus state
          "focus-visible:text-red-700",
          "focus-visible:bg-error",
          "focus-visible:outline-none",
          "focus-visible:ring-0",
          "focus-visible:shadow-button-outline-red-focused",
          // Disabled state
          "disabled:bg-red-100",
          "disabled:border-red-200",
          "disabled:text-red-700",
          "disabled:hover:border-red-200",
          "disabled:opacity-30",
          // Shadows and effects
          "shadow-outline-red-rested",
          "not-disabled:hover:shadow-outline-red-hover",
          "not-disabled:active:shadow-outline-red-active",
          "transition-shadow",
          "duration-200",
        ],
      },
      size: {
        xs: "h-6 p-2 leading-none text-xs rounded-md",
        sm: "h-7 px-2 py-1.5 leading-none text-sm" /** For backwards compatibility */,
        base: "px-2.5 py-2 text-sm leading-none",
        lg: "px-3 py-2.5 ",
      },
      loading: {
        true: "cursor-wait",
      },
    },
    compoundVariants: [
      // Primary variants
      {
        loading: true,
        color: "primary",
        className: "opacity-30",
      },
      // Secondary variants
      {
        loading: true,
        color: "secondary",
        className: "bg-subtle text-emphasis/80",
      },
      // Minimal variants
      {
        loading: true,
        color: "minimal",
        className: "bg-subtle text-emphasis/30",
      },
      // Destructive variants
      {
        loading: true,
        color: "destructive",
        className:
          "text-red-700/30 dark:text-red-700/30 hover:text-red-700/30  border border-default text-emphasis",
      },
      {
        variant: "icon",
        size: "base",
        className: "min-h-[36px] min-w-[36px] p-2! hover:border-default",
      },
      {
        variant: "icon",
        size: "xs",
        className: "h-5 w-5 p-1! rounded-md",
      },
      {
        variant: "icon",
        size: "sm",
        className: "h-6 w-6 p-1! rounded-md",
      },
      {
        variant: "icon",
        size: "lg",
        className: "h-10 w-10 p-1!",
      },
      {
        variant: "fab",
        size: "base",
        className: "md:px-4 md:py-2.5",
      },
    ],
    defaultVariants: {
      variant: "button",
      color: "primary",
      size: "base",
    },
  }
);

export const Button = forwardRef<HTMLAnchorElement | HTMLButtonElement, ButtonProps>(function Button(
  props: ButtonProps,
  forwardedRef
) {
  const {
    loading = false,
    color = "primary",
    size,
    variant = "button",
    type = "button",
    tooltipSide = "top",
    tooltipOffset = 4,
    tooltipClassName,
    StartIcon,
    CustomStartIcon,
    EndIcon,
    shallow,
    // attributes propagated from `HTMLAnchorProps` or `HTMLButtonProps`
    ...passThroughProps
  } = props;
  // Buttons are **always** disabled if we're in a `loading` state
  const disabled = props.disabled || loading || false;
  // If pass an `href`-attr is passed it's Link, otherwise it's a `<button />`
  const isLink = typeof props.href !== "undefined";
  const buttonClassName = classNames(buttonClasses({ color, size, loading, variant }), props.className);
  const handleClick = disabled
    ? (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
        e.preventDefault();
      }
    : props.onClick;

  const buttonContent = (
    <>
      {CustomStartIcon ||
        (StartIcon && (
          <>
            {variant === "fab" ? (
              <>
                <Icon name={StartIcon} className="hidden h-4 w-4 shrink-0 stroke-[1.5px]  md:inline-flex" />
                <Icon name="plus" data-testid="plus" className="inline h-6 w-6 shrink-0 md:hidden" />
              </>
            ) : (
              <Icon
                data-name="start-icon"
                name={StartIcon}
                className={classNames(
                  "shrink-0",
                  loading ? "invisible" : "visible",
                  "button-icon group-[:not(div):active]:translate-y-[0.5px]",
                  variant === "icon" && "h-4 w-4",
                  variant === "button" && "h-4 w-4 stroke-[1.5px] "
                )}
              />
            )}
          </>
        ))}
      <div
        className={classNames(
          "contents", // This makes the div behave like it doesn't exist in the layout
          loading ? "invisible" : "visible",
          variant === "fab" ? "hidden md:contents" : "",
          "group-[:not(div):active]:translate-y-[0.5px]"
        )}>
        {props.children}
      </div>
      {loading && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform">
          <svg
            className={classNames(
              "mx-4 h-5 w-5 animate-spin",
              color === "primary" ? "text-inverted" : "text-emphasis"
            )}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      )}
      {EndIcon && (
        <>
          {variant === "fab" ? (
            <>
              <Icon name={EndIcon} className="hidden h-4 w-4 shrink-0 stroke-[1.5px] md:inline-flex" />
              <Icon name="plus" data-testid="plus" className="inline h-6 w-6 shrink-0 md:hidden" />
            </>
          ) : (
            <Icon
              name={EndIcon}
              className={classNames(
                "shrink-0",
                loading ? "invisible" : "visible",
                "group-[:not(div):active]:translate-y-[0.5px]",
                variant === "icon" && "h-4 w-4",
                variant === "button" && "h-4 w-4 stroke-[1.5px] "
              )}
            />
          )}
        </>
      )}
    </>
  );

  // Render Link or button separately to avoid type conflicts
  // Link manages its own anchor element, so we don't pass ref to it
  if (isLink) {
    return (
      <Wrapper
        tooltip={props.tooltip}
        tooltipSide={tooltipSide}
        tooltipOffset={tooltipOffset}
        tooltipClassName={tooltipClassName}>
        <Link
          {...(passThroughProps as Omit<JSX.IntrinsicElements["a"], "href" | "onClick" | "ref"> & LinkProps)}
          shallow={shallow && shallow}
          className={buttonClassName}
          onClick={handleClick}>
          {buttonContent}
        </Link>
      </Wrapper>
    );
  }

  return (
    <Wrapper
      tooltip={props.tooltip}
      tooltipSide={tooltipSide}
      tooltipOffset={tooltipOffset}
      tooltipClassName={tooltipClassName}>
      <button
        {...(passThroughProps as Omit<JSX.IntrinsicElements["button"], "onClick" | "ref">)}
        ref={forwardedRef as React.Ref<HTMLButtonElement>}
        disabled={disabled}
        type={type as "button" | "submit" | "reset"}
        className={buttonClassName}
        onClick={handleClick}>
        {buttonContent}
      </button>
    </Wrapper>
  );
});

const Wrapper = ({
  children,
  tooltip,
  tooltipSide,
  tooltipOffset,
  tooltipClassName,
}: {
  tooltip?: string | React.ReactNode;
  children: React.ReactNode;
  tooltipSide?: "top" | "right" | "bottom" | "left";
  tooltipOffset?: number;
  tooltipClassName?: string;
}) => {
  if (!tooltip) {
    return <>{children}</>;
  }

  return (
    <Tooltip
      data-testid="tooltip"
      className={tooltipClassName}
      content={tooltip}
      side={tooltipSide}
      sideOffset={tooltipOffset}>
      {children}
    </Tooltip>
  );
};

Button.displayName = "Button";
