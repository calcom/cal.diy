import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useEffect, useState } from "react";
import type { SubmitHandler, UseFormReturn } from "react-hook-form";
import { Controller, useFieldArray, useForm, useFormContext } from "react-hook-form";
import type { z } from "zod";
import { ZodError } from "zod";

import { useIsPlatform } from "@calcom/atoms/hooks/useIsPlatform";
import { Dialog } from "@calcom/features/components/controlled-dialog";
import { LearnMoreLink } from "@calcom/features/eventtypes/components/LearnMoreLink";
import { getCurrencySymbol } from "@calcom/lib/currencyConversions";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { md } from "@calcom/lib/markdownIt";
import { markdownToSafeHTMLClient } from "@calcom/lib/markdownToSafeHTMLClient";
import turndown from "@calcom/lib/turndownService";
import { excludeOrRequireEmailSchema } from "@calcom/prisma/zod-utils";
import classNames from "@calcom/ui/classNames";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { DialogContent, DialogFooter, DialogHeader, DialogClose } from "@calcom/ui/components/dialog";
import { Editor } from "@calcom/ui/components/editor";
import { ToggleGroup } from "@calcom/ui/components/form";
import {
  Switch,
  CheckboxField,
  SelectField,
  Form,
  Input,
  InputField,
  Label,
} from "@calcom/ui/components/form";
import { ArrowDownIcon, ArrowUpIcon, MailIcon, PhoneIcon } from "@coss/ui/icons";
import { showToast } from "@calcom/ui/components/toast";

import { fieldTypesConfigMap } from "@calcom/features/form-builder/fieldTypes";
import { fieldsThatSupportLabelAsSafeHtml } from "@calcom/features/form-builder/fieldsThatSupportLabelAsSafeHtml";
import type { fieldsSchema } from "@calcom/features/form-builder/schema";
import { getFieldIdentifier } from "@calcom/features/form-builder/utils/getFieldIdentifier";
import { getConfig as getVariantsConfig } from "@calcom/features/form-builder/utils/variantsConfig";

type RhfForm = {
  fields: z.infer<typeof fieldsSchema>;
};

type RhfFormFields = RhfForm["fields"];

type RhfFormField = RhfFormFields[number];

type DataStore = {
  options: Record<
    string,
    {
      source: { label: string };
      value: { label: string; value: string; inputPlaceholder?: string }[];
    }
  >;
};

function getCurrentFieldType(fieldForm: UseFormReturn<RhfFormField>) {
  return fieldTypesConfigMap[fieldForm.watch("type") || "text"];
}

const getLocationFieldType = (field: RhfFormField) => {
  const baseFieldType = fieldTypesConfigMap[field.type];

  if (field.name === "location") {
    return { ...baseFieldType, label: "Location" };
  }

  return baseFieldType;
};

function isWhitespaceOnly(val: unknown): boolean {
  return typeof val === "string" && val.length > 0 && val.trim().length === 0;
}

function hasWhitespaceOnlyLabel(data: RhfFormField): boolean {
  if (isWhitespaceOnly(data.label)) return true;
  const variants = data.variantsConfig?.variants;
  if (!variants) return false;
  for (const variant of Object.values(variants)) {
    const fields = variant?.fields ?? [];
    for (const f of fields) {
      if (isWhitespaceOnly(f?.label)) return true;
    }
  }
  return false;
}

/**
 * It works with a react-hook-form only.
 * `formProp` specifies the name of the property in the react-hook-form that has the fields. This is where fields would be updated.
 */
export const FormBuilder = function FormBuilder({
  title,
  description,
  addFieldLabel,
  formProp,
  disabled,
  LockedIcon,
  dataStore,
  shouldConsiderRequired,
  showPriceField,
  paymentCurrency = "USD",
  showPhoneAndEmailToggle = false,
}: {
  formProp: string;
  title: string;
  description: string;
  addFieldLabel: string;
  disabled: boolean;
  LockedIcon: false | JSX.Element;
  showPhoneAndEmailToggle?: boolean;
  /**
   * A readonly dataStore that is used to lookup the options for the fields. It works in conjunction with the field.getOptionAt property which acts as the key in options
   */
  dataStore: DataStore;
  /**
   * This is kind of a hack to allow certain fields to be just shown as required when they might not be required in a strict sense
   * e.g. Location field has a default value at backend so API can send no location but formBuilder in UI doesn't allow it.
   */
  shouldConsiderRequired?: (field: RhfFormField) => boolean | undefined;
  showPriceField?: boolean;
  paymentCurrency?: string;
}) {
  // I would have liked to give Form Builder it's own Form but nested Forms aren't something that browsers support.
  // So, this would reuse the same Form as the parent form.
  const fieldsForm = useFormContext<RhfForm>();
  const [parent] = useAutoAnimate<HTMLUListElement>();
  const { t } = useLocale();

  const { fields, swap, remove, update, append } = useFieldArray({
    control: fieldsForm.control,
    // HACK: It allows any property name to be used for instead of `fields` property name
    name: formProp as unknown as "fields",
  });

  const [fieldDialog, setFieldDialog] = useState({
    isOpen: false,
    fieldIndex: -1,
    data: {} as RhfFormField | null,
  });

  const addField = () => {
    setFieldDialog({
      isOpen: true,
      fieldIndex: -1,
      data: null,
    });
  };

  const editField = (index: number, data: RhfFormField) => {
    setFieldDialog({
      isOpen: true,
      fieldIndex: index,
      data,
    });
  };

  const removeField = (index: number) => {
    remove(index);
  };

  return (
    <div>
      <div>
        <div className="text-default text-sm font-semibold leading-none ltr:mr-1 rtl:ml-1">
          {title}
          {LockedIcon}
        </div>
        <div className="flex items-start justify-between">
          <p className="text-subtle mt-1 max-w-[280px] wrap-break-word text-sm sm:max-w-[500px]">
            {description}
          </p>
          {showPhoneAndEmailToggle && (
            <ToggleGroup
              value={(() => {
                const phoneField = fields.find((field) => field.name === "attendeePhoneNumber");
                const emailField = fields.find((field) => field.name === "email");

                if (phoneField && !phoneField.hidden && phoneField.required && !emailField?.required) {
                  return "phone";
                }

                return "email";
              })()}
              options={[
                {
                  value: "email",
                  label: "Email",
                  iconLeft: <MailIcon className="h-4 w-4" />,
                },
                {
                  value: "phone",
                  label: "Phone",
                  iconLeft: <PhoneIcon className="h-4 w-4" />,
                },
              ]}
              onValueChange={(value) => {
                const phoneFieldIndex = fields.findIndex((field) => field.name === "attendeePhoneNumber");
                const emailFieldIndex = fields.findIndex((field) => field.name === "email");
                if (value === "email") {
                  update(emailFieldIndex, {
                    ...fields[emailFieldIndex],
                    hidden: false,
                    required: true,
                  });
                  update(phoneFieldIndex, {
                    ...fields[phoneFieldIndex],
                    hidden: true,
                    required: false,
                  });
                } else if (value === "phone") {
                  update(emailFieldIndex, {
                    ...fields[emailFieldIndex],
                    hidden: true,
                    required: false,
                  });
                  update(phoneFieldIndex, {
                    ...fields[phoneFieldIndex],
                    hidden: false,
                    required: true,
                  });
                }
              }}
            />
          )}
        </div>
        <p className="text-default mt-5 text-sm font-semibold leading-none ltr:mr-1 rtl:ml-1">
          {t("questions")}
        </p>
        <p className="text-subtle mt-1 max-w-[280px] wrap-break-word text-sm sm:max-w-[500px]">
          {t("all_info_your_booker_provide")}
        </p>
        <ul ref={parent} className="border-subtle divide-subtle mt-4 divide-y rounded-md border">
          {fields.map((field, index) => {
            let options = field.options ?? null;
            const sources = [...(field.sources || [])];
            const isRequired = shouldConsiderRequired ? shouldConsiderRequired(field) : field.required;
            if (!options && field.getOptionsAt) {
              const {
                source: { label: sourceLabel },
                value,
              } = dataStore.options[field.getOptionsAt as keyof typeof dataStore] ?? [];
              options = value;
              options.forEach((option) => {
                sources.push({
                  id: option.value,
                  label: sourceLabel,
                  type: "system",
                });
              });
            }

            if (fieldsThatSupportLabelAsSafeHtml.includes(field.type)) {
              field = { ...field, labelAsSafeHtml: markdownToSafeHTMLClient(field.label ?? "") };
            }
            const numOptions = options?.length ?? 0;
            const firstOptionInput =
              field.optionsInputs?.[options?.[0]?.value as keyof typeof field.optionsInputs];
            const doesFirstOptionHaveInput = !!firstOptionInput;
            // If there is only one option and it doesn't have an input required, we don't show the Field for it.
            // Because booker doesn't see this in UI, there is no point showing it in FormBuilder to configure it.
            if (field.hideWhenJustOneOption && numOptions <= 1 && !doesFirstOptionHaveInput) {
              return null;
            }

            const fieldType = getLocationFieldType(field);
            const isFieldEditableSystemButOptional = field.editable === "system-but-optional";
            const isFieldEditableSystemButHidden = field.editable === "system-but-hidden";
            const isFieldEditableSystem = field.editable === "system";
            const isUserField =
              !isFieldEditableSystem && !isFieldEditableSystemButOptional && !isFieldEditableSystemButHidden;

            if (!fieldType) {
              throw new Error(`Invalid field type - ${field.type}`);
            }
            const groupedBySourceLabel = sources.reduce(
              (groupBy, source) => {
                const item = groupBy[source.label] || [];
                if (source.type === "user" || source.type === "default") {
                  return groupBy;
                }
                item.push(source);
                groupBy[source.label] = item;
                return groupBy;
              },
              {} as Record<string, NonNullable<(typeof field)["sources"]>>
            );

            return (
              <li
                key={field.name}
                data-testid={`field-${field.name}`}
                className="hover:bg-cal-muted group relative flex items-center justify-between p-4 transition">
                {!disabled && (
                  <>
                    {index >= 1 && (
                      <button
                        type="button"
                        className="bg-default text-muted hover:text-emphasis disabled:hover:text-muted border-subtle hover:border-emphasis invisible absolute -left-[12px] -ml-4 -mt-4 mb-4 hidden h-6 w-6 scale-0 items-center justify-center rounded-md border p-1 transition-all hover:shadow disabled:hover:border-inherit disabled:hover:shadow-none group-hover:visible group-hover:scale-100 sm:ml-0 sm:flex"
                        onClick={() => swap(index, index - 1)}>
                        <ArrowUpIcon className="h-5 w-5" />
                      </button>
                    )}
                    {index < fields.length - 1 && (
                      <button
                        type="button"
                        className="bg-default text-muted hover:border-emphasis border-subtle hover:text-emphasis disabled:hover:text-muted invisible absolute -left-[12px] -ml-4 mt-8 hidden h-6 w-6 scale-0 items-center justify-center rounded-md border p-1 transition-all hover:shadow disabled:hover:border-inherit disabled:hover:shadow-none group-hover:visible group-hover:scale-100 sm:ml-0 sm:flex"
                        onClick={() => swap(index, index + 1)}>
                        <ArrowDownIcon className="h-5 w-5" />
                      </button>
                    )}
                  </>
                )}
                <div>
                  <div className="mr-4 flex flex-col lg:flex-row lg:items-center">
                    <div className="text-default text-sm font-semibold ltr:mr-2 rtl:ml-2">
                      <FieldLabel field={field} />
                    </div>
                    <div className="flex items-center space-x-2">
                      {field.hidden ? (
                        // Hidden field can't be required, so we don't need to show the Optional badge
                        <Badge variant="grayWithoutHover">{t("hidden")}</Badge>
                      ) : (
                        <Badge variant="grayWithoutHover" data-testid={isRequired ? "required" : "optional"}>
                          {isRequired ? t("required") : t("optional")}
                        </Badge>
                      )}
                      {Object.entries(groupedBySourceLabel).map(([sourceLabel, sources], key) => (
                        // We don't know how to pluralize `sourceLabel` because it can be anything
                        <Badge key={key} variant="blue">
                          {sources.length} {sources.length === 1 ? sourceLabel : `${sourceLabel}s`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <p className="text-subtle max-w-[280px] wrap-break-word pt-1 text-sm sm:max-w-[500px]">
                    {fieldType.label}
                  </p>
                </div>
                {field.editable !== "user-readonly" && !disabled && (
                  <div className="flex items-center space-x-2">
                    {!isFieldEditableSystem && !isFieldEditableSystemButHidden && !disabled && (
                      <Switch
                        data-testid="toggle-field"
                        disabled={isFieldEditableSystem}
                        checked={!field.hidden}
                        onCheckedChange={(checked) => {
                          update(index, { ...field, hidden: !checked });
                        }}
                        tooltip={t("show_on_booking_page")}
                      />
                    )}
                    {isUserField && (
                      <Button
                        data-testid="delete-field-action"
                        color="destructive"
                        disabled={!isUserField}
                        variant="icon"
                        onClick={() => {
                          removeField(index);
                        }}
                        StartIcon="trash-2"
                      />
                    )}
                    <Button
                      data-testid="edit-field-action"
                      color="secondary"
                      onClick={() => {
                        editField(index, field);
                      }}>
                      {t("edit")}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {!disabled && (
          <Button
            color="minimal"
            data-testid="add-field"
            onClick={addField}
            className="mt-4"
            StartIcon="plus">
            {addFieldLabel}
          </Button>
        )}
      </div>
      {/* Move this Dialog in another component and it would take with it fieldForm */}
      {fieldDialog.isOpen && (
        <FieldEditDialog
          dialog={fieldDialog}
          onOpenChange={(isOpen) =>
            setFieldDialog({
              isOpen,
              fieldIndex: -1,
              data: null,
            })
          }
          handleSubmit={(data: Parameters<SubmitHandler<RhfFormField>>[0]) => {
            const type = data.type || "text";
            const isNewField = !fieldDialog.data;

            if (hasWhitespaceOnlyLabel(data)) {
              showToast(t("label_cannot_be_whitespace"), "error");
              return;
            }

            if (data.name === "guests" && type !== "multiemail") {
              showToast(t("guests_field_must_be_multiemail"), "error");
              return;
            }

            if (isNewField && fields.some((f) => f.name === data.name)) {
              showToast(t("form_builder_field_already_exists"), "error");
              return;
            }
            if (fieldDialog.data) {
              update(fieldDialog.fieldIndex, data);
            } else {
              const field: RhfFormField = {
                ...data,
                type,
                sources: [
                  {
                    label: "User",
                    type: "user",
                    id: "user",
                    fieldRequired: data.required,
                  },
                ],
              };
              field.editable = field.editable || "user";
              append(field);
            }
            setFieldDialog({
              isOpen: false,
              fieldIndex: -1,
              data: null,
            });
          }}
          shouldConsiderRequired={shouldConsiderRequired}
          showPriceField={showPriceField}
          paymentCurrency={paymentCurrency}
        />
      )}
    </div>
  );
};

function Options({
  value,

  onChange = () => { },
  className = "",
  showPrice = false,
  paymentCurrency,
}: {
  value: { label: string; value: string; price?: number }[];
  onChange?: (value: { label: string; value: string; price?: number }[]) => void;
  className?: string;
  showPrice?: boolean;
  paymentCurrency: string;
}) {
  const { t } = useLocale();

  const [animationRef] = useAutoAnimate<HTMLUListElement>();
  if (!value) {
    onChange([
      {
        label: "Option 1",
        value: "Option 1",
      },
      {
        label: "Option 2",
        value: "Option 2",
      },
    ]);
  }
  return (
    <div className={className}>
      <div className="bg-cal-muted rounded-md p-4" data-testid="options-container">
        <ul ref={animationRef} className="flex flex-col gap-3">
          {value?.map((option, index) => (
            <li key={index}>
              <div className="flex items-center gap-2">
                <div className="relative grow">
                  <Input
                    required
                    value={option.label}
                    onChange={(e) => {
                      // Right now we use label of the option as the value of the option. It allows use to not separately lookup the optionId to know the optionValue
                      // It has the same drawback that if the label is changed, the value of the option will change. It is not a big deal for now.
                      const newOptions = [...(value || [])];
                      newOptions.splice(index, 1, {
                        label: e.target.value,
                        value: e.target.value.trim(),
                      });
                      onChange(newOptions);
                    }}
                    placeholder={t("enter_option", { index: index + 1 })}
                    className={value.length > 2 ? "pr-8" : ""}
                  />
                  {value.length > 2 && (
                    <Button
                      type="button"
                      className="absolute right-1 top-1/2 -translate-y-1/2 hover:bg-transparent! focus:bg-transparent! focus:outline-none! focus:ring-0!"
                      size="sm"
                      color="minimal"
                      StartIcon="x"
                      onClick={() => {
                        if (!value) return;
                        const newOptions = [...(value || [])];
                        newOptions.splice(index, 1);
                        onChange(newOptions);
                      }}
                    />
                  )}
                </div>
                {showPrice && (
                  <div className="w-24">
                    <InputField
                      type="number"
                      min={0}
                      step="0.01"
                      value={option.price}
                      onChange={(e) => {
                        const val = e.target.value;
                        const numValue = val === "" ? undefined : Number(val);
                        const updatedOptions = [...(value || [])];
                        updatedOptions[index] = {
                          ...option,
                          price: numValue,
                        };
                        onChange(updatedOptions);
                      }}
                      placeholder="0"
                      addOnLeading={getCurrencySymbol(paymentCurrency)}
                    />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
        <Button
          color="minimal"
          data-testid="add-option"
          className="mt-3"
          onClick={() => {
            const newOptions = [...(value || [])];
            newOptions.push({ label: "", value: "", price: 0 });
            onChange(newOptions);
          }}
          StartIcon="plus">
          Add an Option
        </Button>
      </div>
    </div>
  );
}

const CheckboxFieldLabel = ({ fieldForm }: { fieldForm: UseFormReturn<RhfFormField> }) => {
  const { t } = useLocale();
  const [firstRender, setFirstRender] = useState(true);
  return (
    <div className="mt-6">
      <Label>{t("label")}</Label>
      <Editor
        getText={() => md.render(fieldForm.getValues("label") || "")}
        setText={(value: string) => {
          fieldForm.setValue("label", turndown(value), { shouldDirty: true });
        }}
        excludedToolbarItems={["blockType", "bold", "italic"]}
        disableLists
        firstRender={firstRender}
        setFirstRender={setFirstRender}
        placeholder={t(fieldForm.getValues("defaultLabel") || "")}
      />
    </div>
  );
};

function FieldEditDialog({
  dialog,
  onOpenChange,
  handleSubmit,
  shouldConsiderRequired,
  showPriceField,
  paymentCurrency,
}: {
  dialog: { isOpen: boolean; fieldIndex: number; data: RhfFormField | null };
  onOpenChange: (isOpen: boolean) => void;
  handleSubmit: SubmitHandler<RhfFormField>;
  shouldConsiderRequired?: (field: RhfFormField) => boolean | undefined;
  showPriceField?: boolean;
  paymentCurrency: string;
}) {
  const { t } = useLocale();
  const isPlatform = useIsPlatform();
  const fieldForm = useForm<RhfFormField>({
    defaultValues: dialog.data || {},
    //resolver: zodResolver(fieldSchema),
  });
  const formFieldType = fieldForm.getValues("type");

  useEffect(() => {
    if (!formFieldType) {
      return;
    }

    const variantsConfig = getVariantsConfig({
      type: formFieldType,
      variantsConfig: fieldForm.getValues("variantsConfig"),
    });

    // We need to set the variantsConfig in the RHF instead of using a derived value because RHF won't have the variantConfig for the variant that's not rendered yet.
    fieldForm.setValue("variantsConfig", variantsConfig);
  }, [fieldForm]);

  const isFieldEditMode = !!dialog.data;
  const fieldType = getCurrentFieldType(fieldForm);

  const variantsConfig = fieldForm.watch("variantsConfig");

  const fieldTypes = Object.values(fieldTypesConfigMap);

  return (
    <Dialog open={dialog.isOpen} onOpenChange={onOpenChange} modal={false}>
      <DialogContent className="max-h-none" data-testid="edit-field-dialog" forceOverlayWhenNoModal={true}>
        <Form id="form-builder" form={fieldForm} handleSubmit={handleSubmit}>
          <div className="h-auto max-h-[85vh]">
            <DialogHeader
              title={t("add_a_booking_question")}
              subtitle={
                <LearnMoreLink
                  t={t}
                  i18nKey="booking_questions_description"
                  href="https://cal.com/help/event-types/booking-questions"
                />
              }
            />
            <SelectField
              defaultValue={fieldTypesConfigMap.text}
              data-testid="test-field-type"
              id="test-field-type"
              isDisabled={
                fieldForm.getValues("editable") === "system" ||
                fieldForm.getValues("editable") === "system-but-optional"
              }
              onChange={(e) => {
                const value = e?.value;
                if (!value) {
                  return;
                }
                fieldForm.setValue("type", value, { shouldDirty: true });
              }}
              value={fieldTypesConfigMap[formFieldType]}
              options={fieldTypes.filter((f) => !f.systemOnly)}
              label={t("input_type")}
            />
            {(() => {
              if (!variantsConfig) {
                return (
                  <>
                    <InputField
                      required
                      {...fieldForm.register("name")}
                      containerClassName="mt-6"
                      onChange={(e) => {
                        fieldForm.setValue("name", getFieldIdentifier(e.target.value || ""), {
                          shouldDirty: true,
                        });
                      }}
                      disabled={
                        fieldForm.getValues("editable") === "system" ||
                        fieldForm.getValues("editable") === "system-but-optional"
                      }
                      label={t("identifier")}
                    />
                    <CheckboxField
                      description={t("disable_input_if_prefilled")}
                      {...fieldForm.register("disableOnPrefill", { setValueAs: Boolean })}
                    />
                    <div>
                      {formFieldType === "boolean" && !isPlatform ? (
                        <CheckboxFieldLabel fieldForm={fieldForm} />
                      ) : (
                        <InputField
                          {...fieldForm.register("label")}
                          // System fields have a defaultLabel, so there a label is not required
                          required={
                            !["system", "system-but-optional"].includes(fieldForm.getValues("editable") || "")
                          }
                          placeholder={t(fieldForm.getValues("defaultLabel") || "")}
                          containerClassName="mt-6"
                          label={t("label")}
                        />
                      )}
                    </div>

                    {fieldType?.isTextType ? (
                      <InputField
                        {...fieldForm.register("placeholder")}
                        containerClassName="mt-6"
                        label={t("placeholder")}
                        placeholder={t(fieldForm.getValues("defaultPlaceholder") || "")}
                      />
                    ) : null}
                    {fieldType?.needsOptions && !fieldForm.getValues("getOptionsAt") ? (
                      <Controller
                        name="options"
                        render={({ field: { value, onChange } }) => {
                          return (
                            <Options
                              onChange={onChange}
                              value={value}
                              className="mt-6"
                              showPrice={showPriceField && fieldType.optionsSupportPricing}
                              paymentCurrency={paymentCurrency}
                            />
                          );
                        }}
                      />
                    ) : null}

                    {fieldType?.supportsLengthCheck ? (
                      <FieldWithLengthCheckSupport containerClassName="mt-6" fieldForm={fieldForm} />
                    ) : null}

                    {formFieldType === "email" && (
                      <InputField
                        {...fieldForm.register("requireEmails")}
                        containerClassName="mt-6"
                        onChange={(e) => {
                          try {
                            excludeOrRequireEmailSchema.parse(e.target.value);
                            fieldForm.clearErrors("requireEmails");
                          } catch (err) {
                            if (err instanceof ZodError) {
                              fieldForm.setError("requireEmails", {
                                message: err.errors[0]?.message || "Invalid input",
                              });
                            }
                          }
                        }}
                        label={t("require_emails_that_contain")}
                        placeholder="gmail.com, hotmail.com, ..."
                      />
                    )}

                    {formFieldType === "email" && (
                      <InputField
                        {...fieldForm.register("excludeEmails")}
                        containerClassName="mt-6"
                        onChange={(e) => {
                          try {
                            excludeOrRequireEmailSchema.parse(e.target.value);
                            fieldForm.clearErrors("excludeEmails");
                          } catch (err) {
                            if (err instanceof ZodError) {
                              fieldForm.setError("excludeEmails", {
                                message: err.errors[0]?.message || "Invalid input",
                              });
                            }
                          }
                        }}
                        label={t("exclude_emails_that_contain")}
                        placeholder="gmail.com, hotmail.com, ..."
                      />
                    )}

                    {/* Add price field only for fields that support pricing */}
                    {showPriceField && fieldType.supportsPricing && (
                      <InputField
                        {...fieldForm.register("price")}
                        containerClassName="mt-6"
                        label={t("price")}
                        type="number"
                        min={0}
                        placeholder="0"
                        addOnLeading={getCurrencySymbol(paymentCurrency)}
                      />
                    )}

                    <div className="mt-6">
                      <Controller
                        name="required"
                        control={fieldForm.control}
                        render={({ field: { value, onChange } }) => {
                          let isRequired = shouldConsiderRequired
                            ? shouldConsiderRequired(fieldForm.getValues())
                            : value;
                          //by default question should be required
                          if (isRequired === undefined) {
                            isRequired = true;
                            onChange(isRequired);
                          }
                          return (
                            <CheckboxField
                              data-testid="field-required"
                              disabled={fieldForm.getValues("editable") === "system"}
                              checked={isRequired}
                              onChange={(e) => {
                                onChange(e.target.checked);
                              }}
                              description={t("make_field_required")}
                            />
                          );
                        }}
                      />
                    </div>
                  </>
                );
              }

              if (!fieldType.isTextType) {
                throw new Error("Variants are currently supported only with text type");
              }

              return <VariantFields variantsConfig={variantsConfig} fieldForm={fieldForm} />;
            })()}
          </div>

          <DialogFooter className="relative">
            <DialogClose color="secondary">{t("cancel")}</DialogClose>
            <Button data-testid="field-add-save" type="submit">
              {isFieldEditMode ? t("save") : t("add")}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function FieldWithLengthCheckSupport({
  fieldForm,
  containerClassName = "",
  className,
  ...rest
}: {
  fieldForm: UseFormReturn<RhfFormField>;
  containerClassName?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const { t } = useLocale();
  const fieldType = getCurrentFieldType(fieldForm);
  if (!fieldType.supportsLengthCheck) {
    return null;
  }
  const supportsLengthCheck = fieldType.supportsLengthCheck;
  const maxAllowedMaxLength = supportsLengthCheck.maxLength;

  return (
    <div className={classNames("grid grid-cols-2 gap-4", className)} {...rest}>
      <InputField
        {...fieldForm.register("minLength", {
          valueAsNumber: true,
        })}
        defaultValue={0}
        containerClassName={containerClassName}
        label={t("min_characters")}
        type="number"
        onChange={(e) => {
          fieldForm.setValue("minLength", parseInt(e.target.value ?? 0));
          // Ensure that maxLength field adjusts its restrictions
          fieldForm.trigger("maxLength");
        }}
        min={0}
        max={fieldForm.getValues("maxLength") || maxAllowedMaxLength}
      />
      <InputField
        {...fieldForm.register("maxLength", {
          valueAsNumber: true,
        })}
        defaultValue={maxAllowedMaxLength}
        containerClassName={containerClassName}
        label={t("max_characters")}
        type="number"
        onChange={(e) => {
          if (!supportsLengthCheck) {
            return;
          }
          fieldForm.setValue("maxLength", parseInt(e.target.value ?? maxAllowedMaxLength));
          // Ensure that minLength field adjusts its restrictions
          fieldForm.trigger("minLength");
        }}
        min={fieldForm.getValues("minLength") || 0}
        max={maxAllowedMaxLength}
      />
    </div>
  );
}

/**
 * Shows the label of the field, taking into account the current variant selected
 */
function FieldLabel({ field }: { field: RhfFormField }) {
  const { t } = useLocale();
  const fieldTypeConfig = fieldTypesConfigMap[field.type];
  const fieldTypeConfigVariantsConfig = fieldTypeConfig?.variantsConfig;
  const fieldTypeConfigVariants = fieldTypeConfigVariantsConfig?.variants;
  const variantsConfig = field.variantsConfig;
  const variantsConfigVariants = variantsConfig?.variants;
  const defaultVariant = fieldTypeConfigVariantsConfig?.defaultVariant;
  if (!fieldTypeConfigVariants || !variantsConfig) {
    if (fieldsThatSupportLabelAsSafeHtml.includes(field.type)) {
      return (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Content is sanitized via markdownToSafeHTMLClient
        <span
          dangerouslySetInnerHTML={{
            // Derive from field.label because label might change in b/w and field.labelAsSafeHtml will not be updated.
            __html: markdownToSafeHTMLClient(field.label?.trim() || t(field.defaultLabel || "") || ""),
          }}
        />
      );
    } else {
      return <span>{field.label?.trim() || t(field.defaultLabel || "")}</span>;
    }
  }
  const variant = field.variant || defaultVariant;
  if (!variant) {
    throw new Error(
      `Field has \`variantsConfig\` but no \`defaultVariant\`${JSON.stringify(fieldTypeConfigVariantsConfig)}`
    );
  }
  const variantData = variantsConfigVariants?.[variant as keyof typeof fieldTypeConfigVariants];
  const firstField = variantData?.fields?.[0];
  const label = firstField?.label?.trim() ? firstField.label : "";
  const firstFieldName = firstField?.name;
  const defaultLabelFromTypeConfig =
    fieldTypeConfigVariants?.[variant as keyof typeof fieldTypeConfigVariants]?.fieldsMap?.[
      firstFieldName as keyof (typeof fieldTypeConfigVariants)[typeof variant]["fieldsMap"]
    ]?.defaultLabel || "";
  return <span>{t(label || defaultLabelFromTypeConfig)}</span>;
}

function VariantSelector() {
  // Implement a Variant selector for cases when there are more than 2 variants
  return null;
}

function VariantFields({
  fieldForm,
  variantsConfig,
}: {
  fieldForm: UseFormReturn<RhfFormField>;
  variantsConfig: RhfFormField["variantsConfig"];
}) {
  const { t } = useLocale();
  if (!variantsConfig) {
    throw new Error("VariantFields component needs variantsConfig");
  }
  const fieldTypeConfigVariantsConfig = fieldTypesConfigMap[fieldForm.getValues("type")]?.variantsConfig;

  if (!fieldTypeConfigVariantsConfig) {
    throw new Error("Configuration Issue: FieldType doesn't have `variantsConfig`");
  }

  const variantToggleLabel = t(fieldTypeConfigVariantsConfig.toggleLabel || "");

  const defaultVariant = fieldTypeConfigVariantsConfig.defaultVariant;

  const variantNames = Object.keys(variantsConfig.variants);
  const otherVariants = variantNames.filter((v) => v !== defaultVariant);
  if (otherVariants.length > 1 && variantToggleLabel) {
    throw new Error("More than one other variant. Remove toggleLabel ");
  }
  const otherVariant = otherVariants[0];
  const variantName = fieldForm.watch("variant") || defaultVariant;
  const variantFields = variantsConfig.variants[variantName as keyof typeof variantsConfig].fields;
  /**
   * A variant that has just one field can be shown in a simpler way in UI.
   */
  const isSimpleVariant = variantFields.length === 1;
  const isDefaultVariant = variantName === defaultVariant;
  const supportsVariantToggle = variantNames.length === 2;
  return (
    <>
      {supportsVariantToggle ? (
        <Switch
          classNames={{ container: "mt-1" }}
          checked={!isDefaultVariant}
          label={variantToggleLabel}
          data-testid="variant-toggle"
          onCheckedChange={(checked) => {
            fieldForm.setValue("variant", checked ? otherVariant : defaultVariant);
          }}
          tooltip={t("Toggle Variant")}
        />
      ) : (
        <VariantSelector />
      )}

      <InputField
        required
        {...fieldForm.register("name")}
        containerClassName="mt-6"
        disabled={
          fieldForm.getValues("editable") === "system" ||
          fieldForm.getValues("editable") === "system-but-optional"
        }
        label={t("identifier")}
      />

      <div className="mt-2">
        <CheckboxField
          description={t("disable_input_if_prefilled")}
          {...fieldForm.register("disableOnPrefill", { setValueAs: Boolean })}
        />
      </div>

      <ul
        className={classNames(
          !isSimpleVariant ? "border-subtle divide-subtle mt-2 divide-y rounded-md border" : ""
        )}>
        {variantFields.map((f, index) => {
          const rhfVariantFieldPrefix = `variantsConfig.variants.${variantName}.fields.${index}` as const;
          const fieldTypeConfigVariants =
            fieldTypeConfigVariantsConfig.variants[
            variantName as keyof typeof fieldTypeConfigVariantsConfig.variants
            ];
          const appUiFieldConfig =
            fieldTypeConfigVariants.fieldsMap[f.name as keyof typeof fieldTypeConfigVariants.fieldsMap];

          return (
            <li className={classNames(!isSimpleVariant ? "p-4" : "")} key={f.name}>
              {!isSimpleVariant && (
                <Label className="flex justify-between">
                  <span>{`Field ${index + 1}`}</span>
                  <span className="text-muted">{t(appUiFieldConfig?.defaultLabel || "")}</span>
                </Label>
              )}
              <InputField
                {...fieldForm.register(`${rhfVariantFieldPrefix}.label`)}
                value={f.label || ""}
                placeholder={t(appUiFieldConfig?.defaultLabel || "")}
                containerClassName="mt-6"
                label={t("label")}
              />
              <InputField
                {...fieldForm.register(`${rhfVariantFieldPrefix}.placeholder`)}
                key={f.name}
                value={f.placeholder || ""}
                containerClassName="mt-6"
                label={t("placeholder")}
                placeholder={t(appUiFieldConfig?.defaultPlaceholder || "")}
              />

              <div className="mt-6">
                <Controller
                  name={`${rhfVariantFieldPrefix}.required`}
                  control={fieldForm.control}
                  render={({ field: { onChange } }) => {
                    return (
                      <CheckboxField
                        data-testid="field-required"
                        disabled={!appUiFieldConfig?.canChangeRequirability}
                        checked={f.required}
                        onChange={(e) => {
                          onChange(e.target.checked);
                        }}
                        description={t("make_field_required")}
                      />
                    );
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
