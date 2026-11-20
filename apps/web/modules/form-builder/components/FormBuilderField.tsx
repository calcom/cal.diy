import { ErrorMessage } from "@hookform/error-message";
import type { TFunction } from "i18next";
import { Controller, useFormContext } from "react-hook-form";
import type { z } from "zod";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { markdownToSafeHTML } from "@calcom/lib/markdownToSafeHTML";
import classNames from "@calcom/ui/classNames";
import { InfoBadge } from "@calcom/ui/components/badge";
import { Label } from "@calcom/ui/components/form";
import { InfoIcon } from "@coss/ui/icons";

import { Components, isValidValueProp } from "./Components";
import { fieldTypesConfigMap } from "@calcom/features/form-builder/fieldTypes";
import { fieldsThatSupportLabelAsSafeHtml } from "@calcom/features/form-builder/fieldsThatSupportLabelAsSafeHtml";
import type { fieldsSchema } from "@calcom/features/form-builder/schema";
import {
  useShouldBeDisabledDueToPrefill,
  getFieldNameFromErrorMessage,
} from "@calcom/features/form-builder/useShouldBeDisabledDueToPrefill";
import { getTranslatedConfig as getTranslatedVariantsConfig } from "@calcom/features/form-builder/utils/variantsConfig";

// helper to render markdown label safely
const renderLabel = (field: Partial<RhfFormField>) => {
  if (field.labelAsSafeHtml) {
    return (
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Content is sanitized via markdownToSafeHTML
      <span dangerouslySetInnerHTML={{ __html: markdownToSafeHTML(field.labelAsSafeHtml) }} />
    );
  }
  return <span>{field.label}</span>;
};

type RhfForm = {
  fields: z.infer<typeof fieldsSchema>;
};

type RhfFormFields = RhfForm["fields"];

type RhfFormField = RhfFormFields[number];

type ValueProps =
  | {
      value: string[];
      setValue: (value: string[]) => void;
    }
  | {
      value: string;
      setValue: (value: string) => void;
    }
  | {
      value: {
        value: string;
        optionValue: string;
      };
      setValue: (value: { value: string; optionValue: string }) => void;
    }
  | {
      value: boolean;
      setValue: (value: boolean) => void;
    };

export const FormBuilderField = ({
  field,
  readOnly,
  className,
  onValueChange,
}: {
  field: RhfFormFields[number];
  readOnly: boolean;
  className: string;
  onValueChange?: (args: { name: string; value: unknown; prevValue: unknown }) => void;
}) => {
  const { t } = useLocale();
  const { control, formState } = useFormContext();

  const { hidden, placeholder, label, noLabel, translatedDefaultLabel } = getAndUpdateNormalizedValues(
    field,
    t
  );

  const shouldBeDisabled = useShouldBeDisabledDueToPrefill(field);
  return (
    <div data-fob-field-name={field.name} className={classNames(className, hidden ? "hidden" : "")}>
      <Controller
        control={control}
        // Make it a variable
        name={`responses.${field.name}`}
        render={({ field: { value, onChange }, fieldState: { error } }) => {
          const setAndNotify = (val: unknown) => {
            onChange(val);
            onValueChange?.({ name: field.name, value: val, prevValue: value });
          };

          return (
            <div>
              <ComponentForField
                field={{ ...field, label, placeholder, hidden }}
                value={value}
                readOnly={readOnly || shouldBeDisabled}
                setValue={setAndNotify}
                noLabel={noLabel}
                translatedDefaultLabel={translatedDefaultLabel}
              />
              <ErrorMessage
                name="responses"
                errors={formState.errors}
                render={({ message }: { message: string | undefined }) => {
                  message = message || "";
                  // If the error comes due to parsing the `responses` object(which can have error for any field), we need to identify the field that has the error from the message
                  const name = getFieldNameFromErrorMessage(message);
                  const isResponsesErrorForThisField = name === field.name;
                  // If the error comes for the specific property of responses(Possible for system fields), then also we would go ahead and show the error
                  if (!isResponsesErrorForThisField && !error) {
                    return null;
                  }

                  message = message.replace(/\{[^}]+\}(.*)/, "$1").trim();

                  if (hidden) {
                    console.error(`Error message for hidden field:${field.name} => ${message}`);
                  }

                  return (
                    <div
                      data-testid={`error-message-${field.name}`}
                      className="mt-2 flex items-center text-sm text-red-700 ">
                      <InfoIcon className="h-3 w-3 ltr:mr-2 rtl:ml-2" />
                      <p>{t(message || "invalid_input")}</p>
                    </div>
                  );
                }}
              />
            </div>
          );
        }}
      />
    </div>
  );
};

function assertUnreachable(arg: never) {
  throw new Error(`Don't know how to handle ${JSON.stringify(arg)}`);
}

// TODO: Add consistent `label` support to all the components and then remove the usage of WithLabel.
// Label should be handled by each Component itself.
const WithLabel = ({
  field,
  children,
  readOnly,
  htmlFor,
  noLabel = false,
}: {
  field: Partial<RhfFormField>;
  readOnly: boolean;
  children: React.ReactNode;
  noLabel?: boolean;
  htmlFor: string;
}) => {
  const { t } = useLocale();

  return (
    <div>
      {/* multiemail doesnt show label initially. It is shown on clicking CTA */}
      {/* boolean type doesn't have a label overall, the radio has it's own label */}
      {/* Component itself managing it's label should remove these checks */}
      {noLabel
        ? null
        : field.type !== "boolean" &&
          field.type !== "multiemail" &&
          field.label && (
            <div className="mb-2 flex items-center">
              <Label className="mb-0! flex items-center" htmlFor={htmlFor}>
                {renderLabel(field)}
                <span className="text-emphasis -mb-1 ml-1 text-sm font-medium leading-none">
                  {!readOnly && field.required ? "*" : ""}
                </span>
                {field.type === "phone" && <InfoBadge content={t("number_in_international_format")} />}
              </Label>
            </div>
          )}
      {children}
      {field.name === "smsReminderNumber" && (
        <div className="text-sm text-gray-500">{t("sms_workflow_consent")}</div>
      )}
    </div>
  );
};

/**
 * Ensures that `labels` and `placeholders`, wherever they are, are set properly. If direct values are not set, default values from fieldTypeConfig are used.
 */
function getAndUpdateNormalizedValues(field: RhfFormFields[number], t: TFunction) {
  let noLabel = false;
  let hidden = !!field.hidden;
  if (field.type === "radioInput") {
    const options = field.options;

    // If we have only one option and it has an input, we don't show the field label because Option name acts as label.
    // e.g. If it's just Attendee Phone Number option then we don't show `Location` label
    if (options?.length === 1) {
      if (!field.optionsInputs) {
        throw new Error("radioInput must have optionsInputs");
      }
      if (field.optionsInputs[options[0].value]) {
        // We don't show the label in this case because the optionInput itself will decide what label to show
        noLabel = true;
      } else {
        // If there's only one option and it doesn't have an input, we don't show the field at all because it's visible in the left side bar
        hidden = true;
      }
    }
  }

  /**
   * Instead of passing labelAsSafeHtml props to all the components, FormBuilder components can assume that the label is safe html and use it on a case by case basis after adding checks here
   */
  if (fieldsThatSupportLabelAsSafeHtml.includes(field.type) && field.labelAsSafeHtml === undefined) {
    throw new Error(`${field.name}:${field.type} type must have labelAsSafeHtml set`);
  }

  const translatedDefaultLabel = t(field.defaultLabel || "");
  const label = field.labelAsSafeHtml || field.label || translatedDefaultLabel;
  const placeholder = field.placeholder || t(field.defaultPlaceholder || "");

  if (field.variantsConfig?.variants) {
    Object.entries(field.variantsConfig.variants).forEach(([variantName, variant]) => {
      variant.fields.forEach((variantField) => {
        const fieldTypeVariantsConfig = fieldTypesConfigMap[field.type]?.variantsConfig;
        const defaultVariantFieldLabel =
          fieldTypeVariantsConfig?.variants?.[variantName]?.fieldsMap[variantField.name]?.defaultLabel;

        variantField.label = variantField.label || t(defaultVariantFieldLabel || "");
      });
    });
  }

  return { hidden, placeholder, label, noLabel, translatedDefaultLabel };
}

export const ComponentForField = ({
  field,
  value,
  setValue,
  readOnly,
  noLabel,
  translatedDefaultLabel,
}: {
  field: Omit<RhfFormField, "editable" | "label"> & {
    // Label is optional because radioInput doesn't have a label
    label?: string;
  };
  readOnly: boolean;
  noLabel?: boolean;
  translatedDefaultLabel?: string;
} & ValueProps) => {
  const fieldType = field.type || "text";
  const componentConfig = Components[fieldType];
  const { t } = useLocale();

  const isValueOfPropsType = (val: unknown, propsType: typeof componentConfig.propsType) => {
    const isValid = isValidValueProp[propsType](val);
    return isValid;
  };

  // If possible would have wanted `isValueOfPropsType` to narrow the type of `value` and `setValue` accordingly, but can't seem to do it.
  // So, code following this uses type assertion to tell TypeScript that everything has been validated
  if (value !== undefined && !isValueOfPropsType(value, componentConfig.propsType)) {
    throw new Error(
      `Value ${value} is not valid for type ${componentConfig.propsType} for field ${field.name}`
    );
  }

  if (componentConfig.propsType === "text") {
    return (
      <WithLabel field={field} htmlFor={field.name} readOnly={readOnly} noLabel={noLabel}>
        <componentConfig.factory
          placeholder={field.placeholder}
          minLength={field.minLength}
          maxLength={field.maxLength}
          name={field.name}
          label={field.label}
          readOnly={readOnly}
          value={value as string}
          setValue={setValue as (arg: typeof value) => void}
        />
      </WithLabel>
    );
  }

  if (componentConfig.propsType === "boolean") {
    return (
      <WithLabel field={field} htmlFor={field.name} readOnly={readOnly} noLabel={noLabel}>
        <componentConfig.factory
          name={field.name}
          label={field.label}
          readOnly={readOnly}
          value={value as boolean}
          setValue={setValue as (arg: typeof value) => void}
          placeholder={field.placeholder}
        />
      </WithLabel>
    );
  }

  if (componentConfig.propsType === "textList") {
    return (
      <WithLabel field={field} htmlFor={field.name} readOnly={readOnly} noLabel={noLabel}>
        <componentConfig.factory
          placeholder={field.placeholder}
          name={field.name}
          label={field.label}
          readOnly={readOnly}
          value={value as string[]}
          setValue={setValue as (arg: typeof value) => void}
        />
      </WithLabel>
    );
  }

  if (componentConfig.propsType === "select") {
    if (!field.options) {
      throw new Error("Field options is not defined");
    }

    return (
      <WithLabel field={field} htmlFor={field.name} readOnly={readOnly} noLabel={noLabel}>
        <componentConfig.factory
          readOnly={readOnly}
          value={value as string}
          name={field.name}
          placeholder={field.placeholder}
          setValue={setValue as (arg: typeof value) => void}
          options={field.options.map((o) => ({ ...o, title: o.label }))}
        />
      </WithLabel>
    );
  }

  if (componentConfig.propsType === "multiselect") {
    if (!field.options) {
      throw new Error("Field options is not defined");
    }
    return (
      <WithLabel field={field} htmlFor={field.name} readOnly={readOnly} noLabel={noLabel}>
        <componentConfig.factory
          placeholder={field.placeholder}
          name={field.name}
          readOnly={readOnly}
          value={value as string[]}
          setValue={setValue as (arg: typeof value) => void}
          options={field.options.map((o) => ({ ...o, title: o.label }))}
        />
      </WithLabel>
    );
  }

  if (componentConfig.propsType === "objectiveWithInput") {
    if (!field.options) {
      throw new Error("Field options is not defined");
    }
    if (!field.optionsInputs) {
      throw new Error("Field optionsInputs is not defined");
    }

    const options = field.options;

    return field.options.length ? (
      <WithLabel field={field} htmlFor={field.name} readOnly={readOnly} noLabel={noLabel}>
        <componentConfig.factory
          placeholder={field.placeholder}
          readOnly={readOnly}
          name={field.name}
          label={field.label}
          value={value as { value: string; optionValue: string }}
          setValue={setValue as (arg: typeof value) => void}
          optionsInputs={field.optionsInputs}
          options={options}
          required={field.required}
          translatedDefaultLabel={translatedDefaultLabel}
        />
      </WithLabel>
    ) : null;
  }

  if (componentConfig.propsType === "variants") {
    const translatedVariantsConfig = getTranslatedVariantsConfig(field, t);
    if (!translatedVariantsConfig) {
      return null;
    }

    return (
      <componentConfig.factory
        placeholder={field.placeholder}
        readOnly={readOnly}
        name={field.name}
        variant={field.variant}
        value={value as { value: string; optionValue: string }}
        setValue={setValue as (arg: Record<string, string> | string) => void}
        variants={translatedVariantsConfig.variants}
      />
    );
  }

  if (componentConfig.propsType === "date") {
    return (
      <WithLabel field={field} htmlFor={field.name} readOnly={readOnly} noLabel={noLabel}>
        <componentConfig.factory
          name={field.name}
          placeholder={field.placeholder}
          readOnly={readOnly}
          value={(value as string | null | undefined) ?? undefined}
          setValue={setValue as (arg: string | undefined) => void}
          dateFormat={field.dateFormat}
          minDateRange={field.minDateRange}
          maxDateRange={field.maxDateRange}
        />
      </WithLabel>
    );
  }

  assertUnreachable(componentConfig);
  return null;
};
