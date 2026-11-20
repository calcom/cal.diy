import type z from "zod";

import type { FieldType } from "@calcom/prisma/zod-utils";

import { propsTypes } from "./propsTypes";
import type { fieldTypeConfigSchema } from "./schema";

const configMap: Record<FieldType, Omit<z.infer<typeof fieldTypeConfigSchema>, "propsType">> = {
  // This won't be stored in DB. It allows UI to be configured from the codebase for all existing booking fields stored in DB as well
  // Candidates for this are:
  // - Anything that you want to show in App UI only.
  // - Default values that are shown in UI that are supposed to be changed for existing bookingFields as well if user is using default values
  name: {
    label: "Name",
    value: "name",
    isTextType: true,
    systemOnly: true,
    variantsConfig: {
      toggleLabel: 'Split "Full name" into "First name" and "Last name"',
      defaultVariant: "fullName",
      variants: {
        firstAndLastName: {
          label: "first_last_name",
          fieldsMap: {
            firstName: {
              defaultLabel: "first_name",
              canChangeRequirability: false,
            },
            lastName: {
              defaultLabel: "last_name",
              canChangeRequirability: true,
            },
          },
        },
        fullName: {
          label: "your_name",
          fieldsMap: {
            fullName: {
              defaultLabel: "your_name",
              defaultPlaceholder: "example_name",
              canChangeRequirability: false,
            },
          },
        },
      },
      defaultValue: {
        variants: {
          firstAndLastName: {
            // Configures variant fields
            // This array form(in comparison to a generic component form) has the benefit that we can allow configuring placeholder, label, required etc. for each variant
            // Doing this in a generic component form would require a lot of work in terms of supporting variables maybe that would be read by the component.
            fields: [
              {
                // This name won't be configurable by user. User can always configure the main field name
                name: "firstName",
                type: "text",
                required: true,
              },
              {
                name: "lastName",
                type: "text",
                required: false,
              },
            ],
          },
          fullName: {
            fields: [
              {
                name: "fullName",
                type: "text",
                label: "",
                required: true,
              },
            ],
          },
        },
      },
    },
  },
  email: {
    label: "Email",
    value: "email",
    isTextType: true,
  },
  phone: {
    label: "Phone",
    value: "phone",
    isTextType: true,
  },
  address: {
    label: "Address",
    value: "address",
    isTextType: true,
  },
  text: {
    label: "Short Text",
    value: "text",
    isTextType: true,
  },
  number: {
    label: "Number",
    value: "number",
    isTextType: true,
    supportsPricing: true,
  },
  textarea: {
    label: "Long Text",
    value: "textarea",
    isTextType: true,
    supportsLengthCheck: {
      // Keep it as small as possible. It is easier to change to a higher value but coming back to a lower value(due to any reason) would be problematic for users who have saved higher value.
      maxLength: 1000,
    },
  },
  select: {
    label: "Select",
    value: "select",
    needsOptions: true,
    isTextType: true,
    optionsSupportPricing: true,
  },
  multiselect: {
    label: "MultiSelect",
    value: "multiselect",
    needsOptions: true,
    isTextType: false,
    optionsSupportPricing: true,
  },
  multiemail: {
    label: "Multiple Emails",
    value: "multiemail",
    isTextType: true,
  },
  radioInput: {
    label: "Radio Input",
    value: "radioInput",
    isTextType: false,
    systemOnly: true,

    // This is false currently because we don't want to show the options for Location field right now. It is the only field with type radioInput.
    // needsOptions: true,
  },
  checkbox: {
    label: "Checkbox Group",
    value: "checkbox",
    needsOptions: true,
    isTextType: false,
    optionsSupportPricing: true,
  },
  radio: {
    label: "Radio Group",
    value: "radio",
    needsOptions: true,
    isTextType: false,
    optionsSupportPricing: true,
  },
  boolean: {
    label: "Checkbox",
    value: "boolean",
    isTextType: false,
    supportsPricing: true,
  },
  url: {
    label: "URL",
    value: "url",
    isTextType: true,
  },
  date: {
    label: "Date",
    value: "date",
    isTextType: false,
    supportsDateConfig: true,
  },
};

export const fieldTypesConfigMap = configMap as Record<FieldType, z.infer<typeof fieldTypeConfigSchema>>;

Object.entries(fieldTypesConfigMap).forEach(([fieldType, config]) => {
  config.propsType = propsTypes[fieldType as keyof typeof fieldTypesConfigMap];
});
