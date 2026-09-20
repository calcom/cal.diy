import type { ReactElement, Ref } from "react";
import React, { forwardRef, useState } from "react";
import type { FieldValues, SubmitHandler, UseFormReturn } from "react-hook-form";
import { FormProvider } from "react-hook-form";

import { getErrorFromUnknown } from "@calcom/lib/errors";

import { showToast } from "../../toast";
import { Alert } from "../../alert";

type FormProps<T extends object> = { form: UseFormReturn<T>; handleSubmit: SubmitHandler<T> } & Omit<
  JSX.IntrinsicElements["form"],
  "onSubmit"
>;

const PlainForm = <T extends FieldValues>(props: FormProps<T>, ref: Ref<HTMLFormElement>) => {
  const { form, handleSubmit, ...passThrough } = props;
  const [globalError, setGlobalError] = useState<string | null>(null);

  return (
    <FormProvider {...form}>
      <form
        ref={ref}
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setGlobalError(null);

          form
            .handleSubmit(handleSubmit)(event)
            .catch((err) => {
              const errorMessage = getErrorFromUnknown(err).message;
              setGlobalError(errorMessage);
              // FIXME: Booking Pages don't have toast, so this error is never shown
              showToast(errorMessage, "error");
            });
        }}
        {...passThrough}>
        {globalError && (
          <div className="mb-4">
            <Alert severity="error" message={globalError} />
          </div>
        )}
        {props.children}
      </form>
    </FormProvider>
  );
};

export const Form = forwardRef(PlainForm) as <T extends FieldValues>(
  p: FormProps<T> & { ref?: Ref<HTMLFormElement> }
) => ReactElement;
