import { useEffect } from "react";
import type { z } from "zod";

import type {
  SelectLikeComponentProps,
  TextLikeComponentProps,
} from "@calcom/features/form-builder/widget-types";
import Widgets from "@calcom/features/form-builder/widgets";
import PhoneInput from "@calcom/web/components/phone-input";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { fieldSchema, variantsConfigSchema, FieldType } from "@calcom/prisma/zod-utils";
import { AddressInput } from "@calcom/ui/components/address";
import { InfoBadge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { Label, CheckboxField, EmailField, InputField, Checkbox } from "@calcom/ui/components/form";
import { RadioGroup, RadioField } from "@calcom/ui/components/radio";
import { Tooltip } from "@calcom/ui/components/tooltip";
import { XIcon } from "@coss/ui/icons";

import { ComponentForField } from "./FormBuilderField";
import { propsTypes } from "@calcom/features/form-builder/propsTypes";
import { preprocessNameFieldDataWithVariant } from "@calcom/features/form-builder/utils";

export const isValidValueProp: Record<Component["propsType"], (val: unknown) => boolean> = {
  boolean: (val) => typeof val === "boolean",
  multiselect: (val) => val instanceof Array && val.every((v) => typeof v === "string"),
  objectiveWithInput: (val) => (typeof val === "object" && val !== null ? "value" in val : false),
  select: (val) => typeof val === "string",
  text: (val) => typeof val === "string",
  textList: (val) => val instanceof Array && val.every((v) => typeof v === "string"),
  variants: (val) => (typeof val === "object" && val !== null) || typeof val === "string",
};

type Component =
  | {
      propsType: "text";
      factory: <TProps extends TextLikeComponentProps>(props: TProps) => JSX.Element;
    }
  | {
      propsType: "textList";
      factory: <TProps extends TextLikeComponentProps<string[]>>(props: TProps) => JSX.Element;
    }
  | {
      propsType: "select";
      factory: <TProps extends SelectLikeComponentProps>(props: TProps) => JSX.Element;
    }
  | {
      propsType: "boolean";
      factory: <TProps extends TextLikeComponentProps<boolean>>(props: TProps) => JSX.Element;
    }
  | {
      propsType: "multiselect";
      factory: <TProps extends SelectLikeComponentProps<string[]>>(props: TProps) => JSX.Element;
    }
  | {
      // Objective type question with option having a possible input
      propsType: "objectiveWithInput";
      factory: <
        TProps extends SelectLikeComponentProps<{
          value: string;
          optionValue: string;
        }> & {
          optionsInputs: NonNullable<z.infer<typeof fieldSchema>["optionsInputs"]>;
          value: { value: string; optionValue: string };
        } & {
          name?: string;
          required?: boolean;
          translatedDefaultLabel?: string;
        },
      >(
        props: TProps
      ) => JSX.Element;
    }
  | {
      propsType: "variants";
      factory: <
        TProps extends Omit<TextLikeComponentProps, "value" | "setValue"> & {
          variant: string | undefined;
          variants: z.infer<typeof variantsConfigSchema>["variants"];
          value: Record<string, string> | string | undefined;
          setValue: (value: string | Record<string, string>) => void;
        },
      >(
        props: TProps
      ) => JSX.Element;
    };

// TODO: Share FormBuilder components across react-query-awesome-builder(for Routing Forms) widgets.
// There are certain differences b/w two. Routing Forms expect label to be provided by the widget itself and FormBuilder adds label itself and expect no label to be added by component.
// Routing Form approach is better as it provides more flexibility to show the label in complex components. But that can't be done right now because labels are missing consistent asterisk required support across different components
export const Components: Record<FieldType, Component> = {
  text: {
    propsType: propsTypes.text,
    factory: (props) => <Widgets.TextWidget id={props.name} noLabel={true} {...props} />,
  },
  textarea: {
    propsType: propsTypes.textarea,
    // TODO: Make rows configurable in the form builder
    factory: (props) => <Widgets.TextAreaWidget id={props.name} rows={3} {...props} />,
  },
  number: {
    propsType: propsTypes.number,
    factory: (props) => <Widgets.NumberWidget id={props.name} noLabel={true} {...props} />,
  },
  name: {
    propsType: propsTypes.name,
    // Keep special "name" type field and later build split(FirstName and LastName) variant of it.
    factory: (props) => {
      const { variant: variantName = "fullName" } = props;
      const onChange = (name: string, value: string) => {
        let currentValue = props.value;
        if (typeof currentValue !== "object") {
          currentValue = {};
        }
        props.setValue({
          ...currentValue,
          [name]: value,
        });
      };

      if (!props.variants) {
        throw new Error("'variants' is required for 'name' type of field");
      }

      if (variantName !== "firstAndLastName" && variantName !== "fullName") {
        throw new Error(`Invalid variant name '${variantName}' for 'name' type of field`);
      }

      const value = preprocessNameFieldDataWithVariant(variantName, props.value);

      if (variantName === "fullName") {
        if (typeof value !== "string") {
          throw new Error("Invalid value for 'fullName' variant");
        }
        const variant = props.variants[variantName];
        const variantField = variant.fields[0];
        return (
          <InputField
            name="name"
            showAsteriskIndicator={true}
            placeholder={variantField.placeholder}
            label={variantField.label}
            containerClassName="w-full"
            readOnly={props.readOnly}
            value={value}
            required={variantField.required}
            type="text"
            autoComplete="name"
            onChange={(e) => {
              props.setValue(e.target.value);
            }}
          />
        );
      }

      const variant = props.variants[variantName];

      if (typeof value !== "object") {
        throw new Error("Invalid value for 'fullName' variant");
      }

      return (
        <div className="flex space-x-4">
          {variant.fields.map((variantField) => (
            <InputField
              // Because the container is flex(and thus margin is being computed towards container height), I need to explicitly ensure that margin-bottom for the input becomes 0, which is mb-2 otherwise
              className="mb-0!"
              showAsteriskIndicator={true}
              key={variantField.name}
              name={variantField.name}
              readOnly={props.readOnly}
              placeholder={variantField.placeholder}
              label={variantField.label}
              containerClassName={`w-full testid-${variantField.name}`}
              value={value[variantField.name as keyof typeof value]}
              required={variantField.required}
              type="text"
              autoComplete={
                variantField.name === "firstName"
                  ? "given-name"
                  : variantField.name === "lastName"
                    ? "family-name"
                    : undefined
              }
              onChange={(e) => onChange(variantField.name, e.target.value)}
            />
          ))}
        </div>
      );
    },
  },
  phone: {
    propsType: propsTypes.phone,
    factory: ({ setValue, readOnly, ...props }) => {
      if (!props) {
        return <div />;
      }

      return (
        <PhoneInput
          disabled={readOnly}
          onChange={(val: string) => {
            setValue(val);
          }}
          {...props}
        />
      );
    },
  },
  email: {
    propsType: propsTypes.email,
    factory: ({ setValue, ...props }) => {
      if (!props) {
        return <div />;
      }

      return (
        <InputField
          type="email"
          id={props.name}
          noLabel={true}
          autoComplete="email"
          {...props}
          onChange={(e) => setValue(e.target.value)}
        />
      );
    },
  },
  address: {
    propsType: propsTypes.address,
    factory: ({ setValue, ...props }) => {
      return (
        <AddressInput
          id={props.name}
          onChange={(val) => {
            setValue(val);
          }}
          {...props}
          disabled={props.readOnly}
        />
      );
    },
  },
  multiemail: {
    propsType: propsTypes.multiemail,
    //TODO: Make it a ui component
    factory: function MultiEmail({ value, readOnly, label, setValue, ...props }) {
      const placeholder = props.placeholder;
      const { t } = useLocale();
      value = value || [];
      return (
        <>
          {value.length ? (
            <div>
              <label htmlFor="guests" className="text-default  mb-1 block text-sm font-medium">
                {label}
              </label>
              <ul>
                {value.map((field, index) => (
                  <li key={index}>
                    <EmailField
                      id={`${props.name}.${index}`}
                      disabled={readOnly}
                      value={value[index]}
                      onChange={(e) => {
                        value[index] = e.target.value.toLowerCase();
                        setValue(value);
                      }}
                      placeholder={placeholder}
                      label={<></>}
                      required
                      onClickAddon={() => {
                        value.splice(index, 1);
                        setValue(value);
                      }}
                      addOnSuffix={
                        !readOnly ? (
                          <Tooltip content="Remove email">
                            <button className="m-1" type="button">
                              <XIcon size={12} className="text-default" />
                            </button>
                          </Tooltip>
                        ) : null
                      }
                    />
                  </li>
                ))}
              </ul>
              {!readOnly && (
                <Button
                  data-testid="add-another-guest"
                  type="button"
                  color="minimal"
                  StartIcon="user-plus"
                  className="my-2.5"
                  onClick={() => {
                    value.push("");
                    setValue(value);
                  }}>
                  {t("add_another")}
                </Button>
              )}
            </div>
          ) : (
            <></>
          )}

          {!value.length && !readOnly && (
            <Button
              data-testid="add-guests"
              color="minimal"
              variant="button"
              StartIcon="user-plus"
              onClick={() => {
                value.push("");
                setValue(value);
              }}
              className="mr-auto h-fit whitespace-normal text-left">
              <span className="flex-1">{label}</span>
            </Button>
          )}
        </>
      );
    },
  },
  multiselect: {
    propsType: propsTypes.multiselect,
    factory: (props) => {
      const newProps = {
        ...props,
        listValues: props.options.map((o) => ({ title: o.label, value: o.value })),
      };
      return <Widgets.MultiSelectWidget id={props.name} {...newProps} />;
    },
  },
  select: {
    propsType: propsTypes.select,
    factory: (props) => {
      const newProps = {
        ...props,
        listValues: props.options.map((o) => ({ title: o.label, value: o.value })),
      };
      return <Widgets.SelectWidget id={props.name} {...newProps} />;
    },
  },
  checkbox: {
    propsType: propsTypes.checkbox,
    factory: ({ options, readOnly, setValue, value }) => {
      value = value || [];
      return (
        <div>
          {options.map((option, i) => {
            return (
              <label key={i} className="block">
                <Checkbox
                  disabled={readOnly}
                  onCheckedChange={(checked) => {
                    const newValue = value.filter((v) => v !== option.value);
                    if (checked) {
                      newValue.push(option.value);
                    }
                    setValue(newValue);
                  }}
                  value={option.value}
                  checked={value.includes(option.value)}
                />
                <span className="text-emphasis me-2 ms-2 text-sm">{option.label ?? ""}</span>
              </label>
            );
          })}
        </div>
      );
    },
  },
  radio: {
    propsType: propsTypes.radio,
    factory: ({ setValue, name, value, options, readOnly }) => {
      return (
        <RadioGroup
          disabled={readOnly}
          value={value}
          onValueChange={(e) => {
            setValue(e);
          }}>
          <>
            {options.map((option, i) => (
              <RadioField
                label={option.label}
                key={`option.${i}.radio`}
                value={option.label}
                id={`${name}.option.${i}.radio`}
              />
            ))}
          </>
        </RadioGroup>
      );
    },
  },
  radioInput: {
    propsType: propsTypes.radioInput,
    factory: function RadioInputWithLabel({
      name,
      label,
      options,
      optionsInputs,
      value,
      setValue,
      readOnly,
      translatedDefaultLabel,
    }) {
      useEffect(() => {
        if (!value) {
          setValue({
            value: options[0]?.value,
            optionValue: "",
          });
        }
      }, [options, setValue, value]);

      const { t } = useLocale();

      const didUserProvideLabel = (
        label: string | undefined,
        translatedDefaultLabel: string | undefined
      ): label is string => {
        return label && translatedDefaultLabel ? translatedDefaultLabel !== label : false;
      };

      const getCleanLabel = (label: string): string | JSX.Element => {
        if (!label) {
          return "";
        }

        return label.search(/^https?:\/\//) !== -1 ? (
          <a href={label} target="_blank">
            <span className="underline">{label}</span>
          </a>
        ) : (
          label
        );
      };

      return (
        <div>
          <div>
            <div className="mb-2">
              {options.length > 1 ? (
                options.map((option, i) => {
                  return (
                    <label key={i} className="mb-1 flex items-center">
                      <input
                        type="radio"
                        disabled={readOnly}
                        name={name}
                        className="bg-default after:bg-default border-emphasis hover:bg-subtle hover:after:bg-subtle checked:bg-brand-default checked:hover:bg-brand-default checked:after:bg-default dark:checked:bg-brand-default dark:checked:after:bg-brand-accent dark:hover:bg-subtle dark:checked:hover:bg-brand-default text-(--cal-brand) flex h-4 w-4 cursor-pointer items-center justify-center transition after:h-[6px] after:w-[6px] after:rounded-full after:content-[''] after:hover:block focus:ring-0 focus:ring-offset-0 focus:outline-none ltr:mr-2 rtl:ml-2"
                        value={option.value}
                        onChange={(e) => {
                          setValue({
                            value: e.target.value,
                            optionValue: "",
                          });
                        }}
                        checked={value?.value === option.value}
                      />
                      <span className="text-emphasis me-2 ms-2 text-sm">
                        {option.value === "somewhereElse"
                          ? t("somewhere_else")
                          : (getCleanLabel(option.label) ?? "")}
                      </span>
                      <span>
                        {option.value === "phone" && (
                          <InfoBadge content={t("number_in_international_format")} />
                        )}
                      </span>
                    </label>
                  );
                })
              ) : (
                // Use the only option itself to determine if the field is required or not.
                <>
                  <Label className="flex items-center">
                    {/* We still want to show the label of the field if it is changed by the user otherwise the best label would be the option label */}
                    {options[0].value === "somewhereElse"
                      ? translatedDefaultLabel
                      : getCleanLabel(
                          didUserProvideLabel(label, translatedDefaultLabel) ? label : options[0].label
                        )}
                    {!readOnly && optionsInputs[options[0].value]?.required ? (
                      <span className="text-default -mb-2 ml-1 text-sm font-medium">*</span>
                    ) : null}
                    {options[0].value === "phone" && (
                      <InfoBadge content={t("number_in_international_format")} />
                    )}
                  </Label>
                </>
              )}
            </div>
          </div>
          {(() => {
            const optionField = optionsInputs[value?.value];
            if (!optionField) {
              return null;
            }
            return (
              <div>
                <ComponentForField
                  readOnly={!!readOnly}
                  field={{
                    ...optionField,
                    name: "optionField",
                  }}
                  value={value?.optionValue}
                  setValue={(val: string | undefined) => {
                    setValue({
                      value: value?.value,
                      optionValue: val || "",
                    });
                  }}
                />
              </div>
            );
          })()}
        </div>
      );
    },
  },
  boolean: {
    propsType: propsTypes.boolean,
    factory: ({ readOnly, name, label, value, setValue }) => {
      return (
        <div className="flex">
          <CheckboxField
            name={name}
            onChange={(e) => {
              if (e.target.checked) {
                setValue(true);
              } else {
                setValue(false);
              }
            }}
            placeholder=""
            checked={value}
            disabled={readOnly}
            description=""
            // Form Builder ensures that it would be safe HTML in here if the field type supports it. So, we can safely use label value in `descriptionAsSafeHtml`
            descriptionAsSafeHtml={label ?? ""}
          />
        </div>
      );
    },
  },
  url: {
    propsType: propsTypes.url,
    factory: (props) => {
      return <Widgets.TextWidget type="url" autoComplete="url" noLabel={true} {...props} />;
    },
  },
} as const;
// Should use `satisfies` to check if the `type` is from supported types. But satisfies doesn't work with Next.js config
