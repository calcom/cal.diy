import { z } from "zod";

import type {
  OutputBookingField_2024_06_14,
  SplitNameDefaultFieldOutput_2024_06_14,
  NameDefaultFieldOutput_2024_06_14,
  EmailDefaultFieldOutput_2024_06_14,
  PhoneDefaultFieldOutput_2024_06_14,
  LocationDefaultFieldOutput_2024_06_14,
  RescheduleReasonDefaultFieldOutput_2024_06_14,
  TitleDefaultFieldOutput_2024_06_14,
  NotesDefaultFieldOutput_2024_06_14,
  GuestsDefaultFieldOutput_2024_06_14,
  OutputUnknownBookingField_2024_06_14,
  AddressFieldOutput_2024_06_14,
  BooleanFieldOutput_2024_06_14,
  CheckboxGroupFieldOutput_2024_06_14,
  MultiEmailFieldOutput_2024_06_14,
  EmailFieldOutput_2024_06_14,
  MultiSelectFieldOutput_2024_06_14,
  NumberFieldOutput_2024_06_14,
  PhoneFieldOutput_2024_06_14,
  RadioGroupFieldOutput_2024_06_14,
  SelectFieldOutput_2024_06_14,
  TextAreaFieldOutput_2024_06_14,
  TextFieldOutput_2024_06_14,
  UrlFieldOutput_2024_06_14,
} from "@calcom/platform-types";

export function transformBookingFieldsInternalToApi(
  databaseBookingFields: (SystemField | CustomField)[]
): OutputBookingField_2024_06_14[] {
  return databaseBookingFields.map((field) => {
    if (field.editable === "system" || field.editable === "system-but-optional") {
      switch (field.name) {
        case "name": {
          if (field.variant === "firstAndLastName") {
            const firstNameField = field.variantsConfig?.variants?.firstAndLastName?.fields?.find(
              (f) => f.name === "firstName"
            );
            const lastNameField = field.variantsConfig?.variants?.firstAndLastName?.fields?.find(
              (f) => f.name === "lastName"
            );

            return {
              isDefault: true,
              type: "splitName",
              slug: "splitName",
              firstNameLabel: firstNameField?.label,
              firstNamePlaceholder: firstNameField?.placeholder,
              lastNameLabel: lastNameField?.label,
              lastNamePlaceholder: lastNameField?.placeholder,
              lastNameRequired: !!lastNameField?.required,
              disableOnPrefill: !!field.disableOnPrefill,
            } satisfies SplitNameDefaultFieldOutput_2024_06_14;
          }

          return {
            isDefault: true,
            type: field.type,
            slug: field.name,
            required: !!field.required,
            label: field.variantsConfig?.variants?.fullName?.fields[0]?.label,
            placeholder: field.variantsConfig?.variants?.fullName?.fields[0]?.placeholder,
            disableOnPrefill: !!field.disableOnPrefill,
          } satisfies NameDefaultFieldOutput_2024_06_14;
        }
        case "email":
          return {
            isDefault: true,
            type: field.type,
            slug: field.name,
            required: !!field.required,
            label: field.label,
            placeholder: field.placeholder,
            disableOnPrefill: !!field.disableOnPrefill,
            hidden: !!field.hidden,
          } satisfies EmailDefaultFieldOutput_2024_06_14;
        case "location":
          return {
            isDefault: true,
            type: "radioInput",
            slug: "location",
            required: !!field.required,
            hidden: !!field.hidden,
            label: field.label,
          } satisfies LocationDefaultFieldOutput_2024_06_14;
        case "rescheduleReason":
          return {
            isDefault: true,
            type: "textarea",
            slug: "rescheduleReason",
            required: !!field.required,
            label: field.label,
            placeholder: field.placeholder,
            disableOnPrefill: !!field.disableOnPrefill,
            hidden: !!field.hidden,
          } satisfies RescheduleReasonDefaultFieldOutput_2024_06_14;
        case "title":
          return {
            isDefault: true,
            type: "text",
            slug: "title",
            required: !!field.required,
            label: field.label,
            placeholder: field.placeholder,
            disableOnPrefill: !!field.disableOnPrefill,
            hidden: !!field.hidden,
          } satisfies TitleDefaultFieldOutput_2024_06_14;
        case "notes":
          return {
            isDefault: true,
            type: "textarea",
            slug: "notes",
            required: !!field.required,
            label: field.label,
            placeholder: field.placeholder,
            disableOnPrefill: !!field.disableOnPrefill,
            hidden: !!field.hidden,
          } satisfies NotesDefaultFieldOutput_2024_06_14;
        case "guests":
          return {
            isDefault: true,
            type: "multiemail",
            slug: "guests",
            required: !!field.required,
            label: field.label,
            placeholder: field.placeholder,
            disableOnPrefill: !!field.disableOnPrefill,
            hidden: !!field.hidden,
          } satisfies GuestsDefaultFieldOutput_2024_06_14;
        case "attendeePhoneNumber":
          return {
            isDefault: true,
            type: field.type,
            slug: field.name,
            required: !!field.required,
            label: field.label,
            placeholder: field.placeholder,
            disableOnPrefill: !!field.disableOnPrefill,
            hidden: !!field.hidden,
          } satisfies PhoneDefaultFieldOutput_2024_06_14;
        default:
          return {
            type: "unknown",
            slug: "unknown",
            bookingField: JSON.stringify(field),
          } satisfies OutputUnknownBookingField_2024_06_14;
      }
    } else {
      switch (field.type) {
        case "phone":
          return {
            isDefault: false,
            type: field.type,
            slug: field.name,
            label: field.label || "",
            required: !!field.required,
            placeholder: field.placeholder,
            disableOnPrefill: !!field.disableOnPrefill,
            hidden: !!field.hidden,
          } satisfies PhoneFieldOutput_2024_06_14;
        case "address":
          return {
            isDefault: false,
            type: field.type,
            slug: field.name,
            label: field.label,
            required: !!field.required,
            placeholder: field.placeholder,
            disableOnPrefill: !!field.disableOnPrefill,
            hidden: !!field.hidden,
          } satisfies AddressFieldOutput_2024_06_14;
        case "text":
          return {
            isDefault: false,
            type: field.type,
            slug: field.name,
            label: field.label || "",
            required: !!field.required,
            placeholder: field.placeholder,
            disableOnPrefill: !!field.disableOnPrefill,
            hidden: !!field.hidden,
          } satisfies TextFieldOutput_2024_06_14;
        case "number":
          return {
            isDefault: false,
            type: field.type,
            slug: field.name,
            label: field.label,
            required: !!field.required,
            placeholder: field.placeholder,
            disableOnPrefill: !!field.disableOnPrefill,
            hidden: !!field.hidden,
          } satisfies NumberFieldOutput_2024_06_14;
        case "textarea":
          return {
            isDefault: false,
            type: field.type,
            slug: field.name,
            label: field.label || "",
            required: !!field.required,
            placeholder: field.placeholder,
            disableOnPrefill: !!field.disableOnPrefill,
            hidden: !!field.hidden,
          } satisfies TextAreaFieldOutput_2024_06_14;
        case "multiemail":
          return {
            isDefault: false,
            type: field.type,
            slug: field.name,
            label: field.label || "",
            required: !!field.required,
            placeholder: field.placeholder,
            disableOnPrefill: !!field.disableOnPrefill,
            hidden: !!field.hidden,
          } satisfies MultiEmailFieldOutput_2024_06_14;
        case "email":
          return {
            isDefault: false,
            type: field.type,
            slug: field.name,
            label: field.label || "",
            required: !!field.required,
            placeholder: field.placeholder,
            disableOnPrefill: !!field.disableOnPrefill,
            hidden: !!field.hidden,
          } satisfies EmailFieldOutput_2024_06_14;
        case "boolean":
          return {
            isDefault: false,
            type: field.type,
            slug: field.name,
            label: field.label,
            required: !!field.required,
            disableOnPrefill: !!field.disableOnPrefill,
            hidden: !!field.hidden,
          } satisfies BooleanFieldOutput_2024_06_14;
        case "select":
          return {
            isDefault: false,
            type: field.type,
            slug: field.name,
            label: field.label,
            required: !!field.required,
            placeholder: field.placeholder,
            disableOnPrefill: !!field.disableOnPrefill,
            options: field.options ? field.options.map((option) => option.value) : [],
            hidden: !!field.hidden,
          } satisfies SelectFieldOutput_2024_06_14;
        case "multiselect":
          return {
            isDefault: false,
            type: field.type,
            slug: field.name,
            label: field.label,
            required: !!field.required,
            disableOnPrefill: !!field.disableOnPrefill,
            options: field.options ? field.options.map((option) => option.value) : [],
            hidden: !!field.hidden,
          } satisfies MultiSelectFieldOutput_2024_06_14;
        case "checkbox":
          return {
            isDefault: false,
            type: field.type,
            slug: field.name,
            label: field.label,
            required: !!field.required,
            disableOnPrefill: !!field.disableOnPrefill,
            options: field.options ? field.options.map((option) => option.value) : [],
            hidden: !!field.hidden,
          } satisfies CheckboxGroupFieldOutput_2024_06_14;
        case "radio":
          return {
            isDefault: false,
            type: field.type,
            slug: field.name,
            label: field.label,
            required: !!field.required,
            options: field.options ? field.options.map((option) => option.value) : [],
            disableOnPrefill: !!field.disableOnPrefill,
            hidden: !!field.hidden,
          } satisfies RadioGroupFieldOutput_2024_06_14;
        case "url":
          return {
            isDefault: false,
            type: field.type,
            slug: field.name,
            label: field.label || "",
            required: !!field.required,
            placeholder: field.placeholder,
            disableOnPrefill: !!field.disableOnPrefill,
            hidden: !!field.hidden,
          } satisfies UrlFieldOutput_2024_06_14;
        default:
          return {
            type: "unknown",
            slug: "unknown",
            bookingField: JSON.stringify(field),
          } satisfies OutputUnknownBookingField_2024_06_14;
      }
    }
  });
}

const CustomFieldTypeEnum = z.enum([
  "number",
  "boolean",
  "address",
  "text",
  "textarea",
  "phone",
  "email",
  "multiemail",
  "select",
  "multiselect",
  "checkbox",
  "radio",
  "radioInput",
  "url",
]);

const CustomFieldsSchema = z.object({
  name: z.string(),
  type: CustomFieldTypeEnum,
  label: z.string(),
  labelAsSafeHtml: z.string().optional(),
  hidden: z.boolean().optional(),
  sources: z.array(
    z.object({
      id: z.literal("user"),
      type: z.literal("user"),
      label: z.literal("User"),
      fieldRequired: z.boolean().optional(),
    })
  ),
  editable: z.enum(["user", "user-readonly"]),
  required: z.boolean(),
  placeholder: z.string().optional(),
  options: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
      })
    )
    .optional(),
  disableOnPrefill: z.boolean().optional(),
});

const SystemFieldSchema = z.object({
  defaultLabel: z.string(),
  label: z.string().optional(),
  editable: z.enum(["system-but-optional", "system", "user-readonly"]),
  sources: z.array(
    z.object({
      id: z.literal("default"),
      type: z.literal("default"),
      label: z.literal("Default"),
    })
  ),
  views: z
    .array(
      z.object({
        id: z.enum(["reschedule"]),
        label: z.string(),
      })
    )
    .optional(),
  defaultPlaceholder: z.enum(["", "share_additional_notes", "email", "reschedule_placeholder"]).optional(),
  placeholder: z.string().optional(),
  hidden: z.boolean().optional(),
  required: z.boolean(),
  hideWhenJustOneOption: z.boolean().optional(),
  getOptionsAt: z.enum(["locations"]).optional(),
  optionsInputs: z
    .object({
      attendeeInPerson: z.object({
        type: z.literal("address"),
        required: z.boolean(),
        placeholder: z.string(),
      }),
      phone: z.object({
        type: z.literal("phone"),
        required: z.boolean(),
        placeholder: z.string(),
      }),
      somewhereElse: z
        .object({
          type: z.literal("text"),
          required: z.boolean(),
          placeholder: z.string(),
        })
        .optional(),
    })
    .optional(),
  disableOnPrefill: z.boolean().optional(),
});

const NameSystemFieldSchema = SystemFieldSchema.extend({
  name: z.literal("name"),
  type: z.literal("name"),
  required: z.boolean(),
  variant: z.enum(["fullName", "firstAndLastName"]).optional(),
  variantsConfig: z
    .object({
      variants: z.object({
        fullName: z.object({
          fields: z.array(
            z.object({
              name: z.literal("fullName"),
              type: z.literal("text"),
              label: z.string().optional(),
              required: z.boolean(),
              placeholder: z.string().optional(),
            })
          ),
        }),
        firstAndLastName: z
          .object({
            fields: z.array(
              z.object({
                name: z.enum(["firstName", "lastName"]),
                type: z.literal("text"),
                label: z.string().optional(),
                required: z.boolean(),
                placeholder: z.string().optional(),
              })
            ),
          })
          .optional(),
      }),
    })
    .optional(),
});

const PhoneSystemFieldSchema = SystemFieldSchema.extend({
  name: z.literal("attendeePhoneNumber"),
  type: z.literal("phone"),
  required: z.boolean(),
});

const EmailSystemFieldSchema = SystemFieldSchema.extend({
  name: z.literal("email"),
  type: z.literal("email"),
  required: z.boolean(),
});

const RescheduleReasonSystemFieldSchema = SystemFieldSchema.extend({
  name: z.literal("rescheduleReason"),
  type: z.literal("textarea"),
  required: z.boolean(),
});

const LocationReasonSystemFieldSchema = SystemFieldSchema.extend({
  name: z.literal("location"),
  type: z.literal("radioInput"),
  required: z.boolean(),
});

const TitleSystemFieldSchema = SystemFieldSchema.extend({
  name: z.literal("title"),
  type: z.literal("text"),
  required: z.boolean(),
});

const NotesSystemFieldSchema = SystemFieldSchema.extend({
  name: z.literal("notes"),
  type: z.literal("textarea"),
  required: z.boolean(),
});

const GuestsSystemFieldSchema = SystemFieldSchema.extend({
  name: z.literal("guests"),
  type: z.literal("multiemail"),
  required: z.boolean(),
});

export type NameSystemField = z.infer<typeof NameSystemFieldSchema>;
export type EmailSystemField = z.infer<typeof EmailSystemFieldSchema>;
type RescheduleReasonSystemField = z.infer<typeof RescheduleReasonSystemFieldSchema>;
type LocationReasonSystemField = z.infer<typeof LocationReasonSystemFieldSchema>;
type TitleSystemField = z.infer<typeof TitleSystemFieldSchema>;
type NotesSystemField = z.infer<typeof NotesSystemFieldSchema>;
type GuestsSystemField = z.infer<typeof GuestsSystemFieldSchema>;
type PhoneSystemField = z.infer<typeof PhoneSystemFieldSchema>;

export type SystemField =
  | NameSystemField
  | EmailSystemField
  | PhoneSystemField
  | RescheduleReasonSystemField
  | LocationReasonSystemField
  | TitleSystemField
  | NotesSystemField
  | GuestsSystemField;

export type CustomField = z.infer<typeof CustomFieldsSchema>;

const SystemFieldsSchema = z.union([
  NameSystemFieldSchema,
  EmailSystemFieldSchema,
  PhoneSystemFieldSchema,
  LocationReasonSystemFieldSchema,
  RescheduleReasonSystemFieldSchema,
  TitleSystemFieldSchema,
  NotesSystemFieldSchema,
  GuestsSystemFieldSchema,
]);

export const BookingFieldSchema = z.union([CustomFieldsSchema, SystemFieldsSchema]);
export const BookingFieldsSchema = z.array(BookingFieldSchema);

export const systemBeforeFieldName: NameSystemField = {
  type: "name",
  name: "name",
  editable: "system",
  defaultLabel: "your_name",
  required: true,
  variant: "fullName",
  sources: [
    {
      label: "Default",
      id: "default",
      type: "default",
    },
  ],
  variantsConfig: {
    variants: {
      fullName: {
        fields: [
          {
            name: "fullName",
            type: "text",
            required: true,
            label: "your_name",
          },
        ],
      },
      firstAndLastName: {
        fields: [
          {
            name: "firstName",
            type: "text",
            required: true,
            label: "",
            placeholder: "",
          },
          {
            name: "lastName",
            type: "text",
            required: false,
            label: "",
            placeholder: "",
          },
        ],
      },
    },
  },
};

export const systemBeforeFieldNameSplit: NameSystemField = {
  ...systemBeforeFieldName,
  variant: "firstAndLastName",
};

export const systemBeforeFieldEmail: EmailSystemField = {
  defaultLabel: "email_address",
  type: "email",
  name: "email",
  required: true,
  editable: "system-but-optional",
  sources: [
    {
      label: "Default",
      id: "default",
      type: "default",
    },
  ],
};

export const systemBeforeFieldPhone: PhoneSystemField = {
  defaultLabel: "phone_number",
  type: "phone",
  name: "attendeePhoneNumber",
  required: false,
  hidden: true,
  editable: "system-but-optional",
  sources: [
    {
      label: "Default",
      id: "default",
      type: "default",
    },
  ],
};

export const systemBeforeFieldLocation: LocationReasonSystemField = {
  defaultLabel: "location",
  type: "radioInput",
  name: "location",
  editable: "system",
  hideWhenJustOneOption: true,
  required: false,
  getOptionsAt: "locations",
  optionsInputs: {
    attendeeInPerson: {
      type: "address",
      required: true,
      placeholder: "",
    },
    phone: {
      type: "phone",
      required: true,
      placeholder: "",
    },
    somewhereElse: {
      type: "text",
      required: true,
      placeholder: "",
    },
  },
  sources: [
    {
      label: "Default",
      id: "default",
      type: "default",
    },
  ],
};

export const systemAfterFieldTitle: TitleSystemField = {
  defaultLabel: "what_is_this_meeting_about",
  type: "text",
  name: "title",
  editable: "system-but-optional",
  required: true,
  hidden: true,
  defaultPlaceholder: "",
  sources: [
    {
      label: "Default",
      id: "default",
      type: "default",
    },
  ],
};

export const systemAfterFieldNotes: NotesSystemField = {
  defaultLabel: "additional_notes",
  type: "textarea",
  name: "notes",
  editable: "system-but-optional",
  required: false,
  defaultPlaceholder: "share_additional_notes",
  sources: [
    {
      label: "Default",
      id: "default",
      type: "default",
    },
  ],
};

export const systemAfterFieldGuests: GuestsSystemField = {
  defaultLabel: "additional_guests",
  type: "multiemail",
  editable: "system-but-optional",
  name: "guests",
  defaultPlaceholder: "email",
  required: false,
  hidden: false,
  sources: [
    {
      label: "Default",
      id: "default",
      type: "default",
    },
  ],
};

export const systemAfterFieldRescheduleReason: RescheduleReasonSystemField = {
  defaultLabel: "reason_for_reschedule",
  type: "textarea",
  editable: "system-but-optional",
  name: "rescheduleReason",
  defaultPlaceholder: "reschedule_placeholder",
  required: false,
  views: [
    {
      id: "reschedule",
      label: "Reschedule View",
    },
  ],
  sources: [
    {
      label: "Default",
      id: "default",
      type: "default",
    },
  ],
};
