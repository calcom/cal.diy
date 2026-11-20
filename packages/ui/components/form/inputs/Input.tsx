"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import { EyeIcon, EyeOffIcon, SearchIcon } from "@coss/ui/icons";
import type React from "react";
import type { ReactNode } from "react";
import { forwardRef, useCallback, useId, useState } from "react";
import { useFormContext } from "react-hook-form";
import { Alert } from "../../alert";
import { Tooltip } from "../../tooltip";
import { Input, InputField, inputStyles } from "../inputs/TextField";
import { Label } from "./Label";
import type { InputFieldProps } from "./types";

export const PasswordField = forwardRef<HTMLInputElement, InputFieldProps>(
  function PasswordField(props, ref) {
    const { t } = useLocale();
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const toggleIsPasswordVisible = useCallback(
      () => setIsPasswordVisible(!isPasswordVisible),
      [isPasswordVisible, setIsPasswordVisible]
    );
    const textLabel = isPasswordVisible ? t("hide_password") : t("show_password");

    return (
      <InputField
        type={isPasswordVisible ? "text" : "password"}
        placeholder={props.placeholder || "•••••••••••••"}
        ref={ref}
        {...props}
        className={classNames(
          "addon-wrapper mb-0 ltr:border-r-0 ltr:pr-10 rtl:border-l-0 rtl:pl-10",
          props.className
        )}
        addOnSuffix={
          <Tooltip content={textLabel}>
            <button
              className="text-emphasis h-9"
              tabIndex={-1}
              type="button"
              onClick={() => toggleIsPasswordVisible()}>
              {isPasswordVisible ? (
                <EyeOffIcon className="h-4 w-4 stroke-[2.5px]" />
              ) : (
                <EyeIcon className="h-4 w-4 stroke-[2.5px]" />
              )}
              <span className="sr-only">{textLabel}</span>
            </button>
          </Tooltip>
        }
      />
    );
  }
);

export const EmailInput = forwardRef<HTMLInputElement, InputFieldProps>(function EmailInput(props, ref) {
  return (
    <Input
      ref={ref}
      type="email"
      autoCapitalize="none"
      autoComplete="email"
      autoCorrect="off"
      inputMode="email"
      {...props}
    />
  );
});

export const EmailField = forwardRef<HTMLInputElement, InputFieldProps>(function EmailField(props, ref) {
  return (
    <InputField
      ref={ref}
      type="email"
      autoCapitalize="none"
      autoComplete="email"
      autoCorrect="off"
      inputMode="email"
      {...props}
    />
  );
});

type TextAreaProps = JSX.IntrinsicElements["textarea"];

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextAreaInput(props, ref) {
  return (
    <textarea
      {...props}
      ref={ref}
      className={classNames(inputStyles(), "min-h-[80px] w-full", props.className)}
    />
  );
});

type TextAreaFieldProps = {
  label?: ReactNode;
  t?: (key: string) => string;
} & React.ComponentProps<typeof TextArea> & {
    name: string;
    labelProps?: React.ComponentProps<typeof Label>;
  };

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  function TextField(props, ref) {
    const generatedId = useId();
    const { t: _t } = useLocale();
    const t = props.t || _t;
    const methods = useFormContext();
    const {
      label = t(props.name as string),
      labelProps,
      /** Prevents displaying untranslated placeholder keys */
      placeholder = t(`${props.name}_placeholder`) !== `${props.name}_placeholder`
        ? `${props.name}_placeholder`
        : "",
      id,
      ...passThrough
    } = props;
    const textAreaId = id ?? generatedId;
    return (
      <div>
        {!!props.name && (
          <Label htmlFor={textAreaId} {...labelProps}>
            {label}
          </Label>
        )}
        <TextArea id={textAreaId} ref={ref} placeholder={placeholder} {...passThrough} />
        {methods?.formState?.errors[props.name]?.message && (
          <Alert
            className="mt-1"
            severity="error"
            message={<>{methods.formState.errors[props.name]?.message}</>}
          />
        )}
      </div>
    );
  }
);

export const NumberInput = forwardRef<HTMLInputElement, InputFieldProps>(function NumberInput(props, ref) {
  return (
    <Input
      ref={ref}
      type="number"
      autoCapitalize="none"
      autoComplete="numeric"
      autoCorrect="off"
      inputMode="numeric"
      {...props}
    />
  );
});

export const FilterSearchField = forwardRef<HTMLInputElement, InputFieldProps>(
  function PasswordField(props, ref) {
    return (
      <InputField
        ref={ref}
        addOnLeading={<SearchIcon className="h-4 w-4 stroke-[2.5px]" data-testid="search-icon" />}
        placeholder="Search"
        containerClassName="mt-1"
        {...props}
      />
    );
  }
);
