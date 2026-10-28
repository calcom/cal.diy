"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import { InfoIcon } from "@coss/ui/icons";
import { cva } from "class-variance-authority";
import type React from "react";
import { forwardRef, useId, useState } from "react";
import { Icon } from "../../icon";
import { HintsOrErrors } from "./HintOrErrors";
import { Label } from "./Label";
import type { InputFieldProps, InputProps } from "./types";

export const inputStyles = cva(
  [
    // Base styles
    "rounded-[10px] border",
    "leading-none font-normal",

    // Colors
    "bg-default",
    "border-default",
    "text-default",
    "placeholder:text-muted",

    // States
    "hover:border-emphasis",
    "focus:border-emphasis",
    "focus:ring-0",
    "focus:shadow-outline-gray-focused",

    // Disabled state
    "disabled:bg-subtle",
    "disabled:hover:border-default",
    "disabled:cursor-not-allowed",

    // Shadow
    "shadow-outline-gray-rested",

    // Transitions
    "transition-all",
  ],
  {
    variants: {
      size: {
        sm: "h-7 px-2 py-1 text-xs",
        md: "h-8 px-3 py-2 text-sm",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
);

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { isFullWidth = true, size = "md", className, ...props },
  ref
) {
  return (
    <input
      {...props}
      ref={ref}
      className={classNames(inputStyles({ size }), isFullWidth && "w-full", className)}
    />
  );
});

type AddonProps = {
  children: React.ReactNode;
  className?: string;
  error?: boolean;
  onClickAddon?: (e: React.MouseEvent<HTMLDivElement>) => void;
  size?: "sm" | "md";
  position?: "start" | "end";
};

const Addon = ({
  children,
  className,
  error,
  onClickAddon,
  size: _size = "md",
  position: _position = "start",
}: AddonProps) => (
  <div
    onClick={onClickAddon && onClickAddon}
    className={classNames(
      "flex shrink-0 items-center justify-center whitespace-nowrap",
      onClickAddon && "pointer-events-auto cursor-pointer disabled:hover:cursor-not-allowed",
      className
    )}>
    <span
      className={classNames(
        "text-sm font-medium leading-none",
        error ? "text-error" : "text-muted peer-disabled:opacity-50"
      )}>
      {children}
    </span>
  </div>
);

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(function InputField(props, ref) {
  const generatedId = useId();
  const id = props.id || generatedId;
  const { t: _t, isLocaleReady, i18n } = useLocale();
  const t = props.t || _t;
  const name = props.name || "";
  const {
    label = t(name),
    labelProps,
    labelClassName,
    disabled,
    LockedIcon,
    placeholder = isLocaleReady && i18n.exists(`${name}_placeholder`) ? t(`${name}_placeholder`) : "",
    className,
    addOnLeading,
    addOnSuffix,
    addOnClassname,
    inputIsFullWidth,
    hint,
    type,
    hintErrors,
    labelSrOnly,
    noLabel,
    containerClassName,
    readOnly,
    showAsteriskIndicator,
    onClickAddon,

    t: __t,
    dataTestid,
    size,
    id: _id,
    ...passThrough
  } = props;

  const [inputValue, setInputValue] = useState<string>("");

  const handleFocusInput = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.parentElement?.querySelector("input")?.focus();
  };

  return (
    <div className={classNames(containerClassName)}>
      {!!name && !noLabel && (
        <Label
          htmlFor={id}
          {...labelProps}
          className={classNames(labelClassName, labelSrOnly && "sr-only", props.error && "text-error")}>
          {label}
          {showAsteriskIndicator && !readOnly && passThrough.required ? (
            <span className="text-default ml-1 font-medium">*</span>
          ) : null}
          {LockedIcon}
        </Label>
      )}
      {addOnLeading || addOnSuffix ? (
        <div
          dir="ltr"
          className={classNames(
            inputStyles({ size }),
            "group relative mb-1 flex min-w-0 items-center gap-1",
            "focus-within:shadow-outline-gray-focused focus-within:border-emphasis",
            "[&:has(:disabled)]:bg-subtle [&:has(:disabled)]:hover:border-default [&:has(:disabled)]:cursor-not-allowed",
            inputIsFullWidth && "w-full"
          )}>
          {addOnLeading && (
            <Addon
              size={size ?? "md"}
              position="start"
              className={classNames(addOnClassname)}
              onClickAddon={handleFocusInput}>
              {addOnLeading}
            </Addon>
          )}
          <input
            {...passThrough}
            data-testid={dataTestid ? `${dataTestid}-input` : "input-field"}
            id={id}
            type={type}
            placeholder={placeholder}
            className={classNames(
              "w-full min-w-0 truncate border-0 bg-transparent focus:outline-none focus:ring-0",
              "text-default rounded-lg text-sm font-medium leading-none",
              "placeholder:text-muted disabled:cursor-not-allowed disabled:bg-transparent",
              addOnLeading && "rounded-none pl-0.5 pr-0",
              addOnSuffix && "pl-0",
              className
            )}
            {...(type == "search" && {
              onChange: (e) => {
                setInputValue(e.target.value);
                props.onChange?.(e);
              },
              value: inputValue,
            })}
            disabled={readOnly || disabled}
            ref={ref}
          />
          {addOnSuffix && (
            <Addon
              size={size ?? "md"}
              position="end"
              onClickAddon={(e) => {
                handleFocusInput(e);
                onClickAddon?.(e);
              }}
              className={classNames(addOnClassname)}>
              {addOnSuffix}
            </Addon>
          )}
          {type === "search" && inputValue?.toString().length > 0 && (
            <Icon
              name="x"
              className="text-subtle absolute top-1.75 h-4 w-4 cursor-pointer ltr:right-2 rtl:left-2"
              onClick={(e) => {
                setInputValue("");
                props.onChange?.(e as unknown as React.ChangeEvent<HTMLInputElement>);
              }}
            />
          )}
        </div>
      ) : (
        <Input
          {...passThrough}
          id={id}
          type={type}
          placeholder={placeholder}
          size={size}
          className={classNames(
            "w-full min-w-0 truncate focus:outline-none focus:ring-0",
            "text-default rounded-lg text-sm font-medium leading-none",
            "placeholder:text-muted disabled:cursor-not-allowed",
            addOnLeading && "rounded-none pl-0.5 pr-0",
            addOnSuffix && !addOnLeading && "pl-0.5",
            className
          )}
          readOnly={readOnly}
          ref={ref}
          isFullWidth={inputIsFullWidth}
          disabled={readOnly || disabled}
        />
      )}
      <HintsOrErrors hintErrors={hintErrors} fieldName={name} t={t} />
      {hint && (
        <div className="text-muted mt-2 flex items-center text-sm">
          <InfoIcon className="text-muted h-4 w-4 mr-1" />
          {hint}
        </div>
      )}
    </div>
  );
});

export const TextField = forwardRef<HTMLInputElement, InputFieldProps>(function TextField(props, ref) {
  return <InputField ref={ref} {...props} />;
});
