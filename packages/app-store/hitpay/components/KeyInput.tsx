"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { InputFieldProps } from "@calcom/ui/components/form";
import { Input, Label } from "@calcom/ui/components/form";
import { Icon } from "@calcom/ui/components/icon";
import { Skeleton } from "@calcom/ui/components/skeleton";
import classNames from "classnames";
import type React from "react";
import type { FormEvent } from "react";
import { forwardRef, useCallback, useEffect, useId, useState } from "react";

type AddonProps = {
  children: React.ReactNode;
  className?: string;
  error?: boolean;
  onClickAddon?: () => void;
};

const Addon = ({ children, className, error }: AddonProps) => (
  <div
    className={classNames(
      "addon-wrapper border-default [input:hover_+_&]:border-emphasis [input:hover_+_&]:border-l-default [&:has(+_input:hover)]:border-emphasis [&:has(+_input:hover)]:border-r-default h-9 border px-3 transition disabled:hover:cursor-not-allowed",
      className
    )}>
    <div
      className={classNames(
        "min-h-9 flex flex-col justify-center text-sm leading-7",
        error ? "text-error" : "text-default"
      )}>
      <span
        className="flex max-w-2xl overflow-y-auto whitespace-nowrap"
        style={{
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          overflow: "-ms-scroll-chaining",
          msOverflowStyle: "-ms-autohiding-scrollbar",
        }}>
        {children}
      </span>
    </div>
  </div>
);

export const KeyField: React.FC<InputFieldProps & { defaultValue: string }> = forwardRef<
  HTMLInputElement,
  InputFieldProps & { defaultValue: string }
>(function KeyField(props, ref) {
  const id = useId();
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [currentValue, setCurrentValue] = useState<string>("");
  const toggleIsPasswordVisible = useCallback(
    () => setIsPasswordVisible(!isPasswordVisible),
    [isPasswordVisible, setIsPasswordVisible]
  );

  const { t: _t, isLocaleReady, i18n } = useLocale();
  const t = props.t || _t;
  const name = props.name || "";
  const {
    label = t(name),
    labelProps,
    labelClassName,
    LockedIcon,
    placeholder = isLocaleReady && i18n.exists(`${name}_placeholder`) ? t(`${name}_placeholder`) : "",
    className,
    addOnLeading,
    addOnClassname,
    inputIsFullWidth,
    labelSrOnly,
    noLabel,
    containerClassName,
    readOnly,
    showAsteriskIndicator,
    defaultValue,
    ...passThrough
  } = props;

  useEffect(() => {
    if (currentValue.trim().length === 0) {
      setIsPasswordVisible(true);
    }
  }, [currentValue]);

  useEffect(() => {
    setCurrentValue(defaultValue);
    if (defaultValue.length > 0) {
      setIsPasswordVisible(false);
    }
  }, [defaultValue]);

  const getHiddenKey = (): string => {
    let hiddenKey = currentValue;
    const length = currentValue.length;
    if (length > 6) {
      const start = currentValue.slice(0, 3);
      const end = currentValue.slice(length - 3);
      hiddenKey = `${start}${"*".repeat(length - 6)}${end}`;
    }

    return hiddenKey;
  };

  const onInput = (event: FormEvent<HTMLInputElement>) => {
    const target = event.target as HTMLInputElement;
    const fullValue = target.value;
    setCurrentValue(fullValue);
    target.value = fullValue;
  };

  return (
    <div className={classNames(containerClassName)}>
      {!!label && !noLabel && (
        <Skeleton
          as={Label}
          htmlFor={id}
          loadingClassName="w-16"
          {...labelProps}
          className={classNames(labelClassName, labelSrOnly && "sr-only", props.error && "text-error")}>
          {label}
          {showAsteriskIndicator && !readOnly && passThrough.required ? (
            <span className="text-default ml-1 font-medium">*</span>
          ) : null}
          {LockedIcon}
        </Skeleton>
      )}

      <div
        dir="ltr"
        className="focus-within:ring-brand-default group relative mb-1 flex items-center rounded-md transition focus-within:outline-none focus-within:ring-2">
        {addOnLeading && (
          <Addon className={classNames("ltr:rounded-l-md rtl:rounded-r-md", addOnClassname)}>
            {addOnLeading}
          </Addon>
        )}
        <Input
          id={id}
          type="text"
          placeholder={placeholder}
          isFullWidth={inputIsFullWidth}
          className={classNames(
            className,
            "disabled:bg-subtle disabled:hover:border-subtle mb-0 rounded-r-none border-r-0 disabled:cursor-not-allowed",
            addOnLeading && "rounded-l-none border-l-0",
            isPasswordVisible && "inline-block",
            !isPasswordVisible && "hidden",
            "my-0! ring-0!"
          )}
          {...passThrough}
          ref={ref}
          onInput={onInput}
        />
        <Input
          type="text"
          isFullWidth={inputIsFullWidth}
          className={classNames(
            className,
            "disabled:bg-subtle disabled:hover:border-subtle mb-0 rounded-r-none border-r-0 disabled:cursor-not-allowed",
            addOnLeading && "rounded-l-none border-l-0",
            !isPasswordVisible && "inline-block",
            isPasswordVisible && "hidden",
            "my-0! ring-0!"
          )}
          disabled
          value={getHiddenKey()}
        />
        <Addon className={classNames("ltr:rounded-r-md rtl:rounded-l-md", addOnClassname)}>
          <button
            className="text-emphasis h-9"
            tabIndex={-1}
            type="button"
            onClick={() => toggleIsPasswordVisible()}>
            {isPasswordVisible ? (
              <Icon name="eye-off" className="h-4 w-4 stroke-[2.5px]" />
            ) : (
              <Icon name="eye" className="h-4 w-4 stroke-[2.5px]" />
            )}
          </button>
        </Addon>
      </div>
    </div>
  );
});

export default KeyField;
