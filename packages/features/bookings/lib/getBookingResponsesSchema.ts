import type { ALL_VIEWS } from "@calcom/features/form-builder/schema";
import { type FieldZodCtx, fieldTypesSchemaMap } from "@calcom/features/form-builder/schema";
import { dbReadResponseSchema } from "@calcom/lib/dbReadResponseSchema";
import logger from "@calcom/lib/logger";
import type { eventTypeBookingFields } from "@calcom/prisma/zod-utils";
import { bookingResponses, emailSchemaRefinement } from "@calcom/prisma/zod-utils";
import { isValidPhoneNumber } from "libphonenumber-js/max";
import z from "zod";

type View = ALL_VIEWS | (string & {});
type BookingFields = (z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">) | null;
type TranslationFunction = (key: string, options?: Record<string, unknown>) => string;
type CommonParams = { bookingFields: BookingFields; view: View; translateFn?: TranslationFunction };

export const bookingResponse = dbReadResponseSchema;
export const bookingResponsesDbSchema = z.record(dbReadResponseSchema);

const catchAllSchema = bookingResponsesDbSchema;

const ensureValidPhoneNumber = (value: string) => {
  if (!value) return "";
  // + in URL could be replaced with space, so we need to replace it back
  // Replace the space(s) in the beginning with + as it is supposed to be provided in the beginning only
  return value.replace(/^ +/, "+");
};

/**
 * Processes a single field's response value based on its type.
 * Returns the processed value that should be stored in newResponses[field.name].
 */
function preprocessField({
  field,
  value,
  isPartialSchema,
  log,
}: {
  field: NonNullable<BookingFields>[number];
  value: unknown;
  isPartialSchema: boolean;
  log: ReturnType<typeof logger.getSubLogger>;
}): unknown {
  const fieldTypeSchema = fieldTypesSchemaMap[field.type as keyof typeof fieldTypesSchemaMap];
  // TODO: Move all the schemas along with their respective types to fieldTypeSchema, that would make schemas shared across Routing Forms builder and Booking Question Formm builder
  if (fieldTypeSchema) {
    return fieldTypeSchema.preprocess({
      response: value,
      isPartialSchema,
      field,
    });
  }
  if (field.type === "boolean") {
    // Turn a boolean in string to a real boolean
    return value === "true" || value === true;
  }
  // Make sure that the value is an array
  else if (field.type === "multiemail" || field.type === "checkbox" || field.type === "multiselect") {
    return value instanceof Array ? value : [value];
  }
  // Parse JSON
  else if (field.type === "radioInput" && typeof value === "string") {
    let parsedValue = {
      optionValue: "",
      value: "",
    };
    try {
      parsedValue = JSON.parse(value);
    } catch (e) {
      log.error(`Failed to parse JSON for field ${field.name}`, e);
    }
    const optionsInputs = field.optionsInputs;
    const optionInputField = optionsInputs?.[parsedValue.value];
    if (optionInputField && optionInputField.type === "phone") {
      parsedValue.optionValue = ensureValidPhoneNumber(parsedValue.optionValue);
    }
    return parsedValue;
  } else if (field.type === "phone") {
    return ensureValidPhoneNumber(typeof value === "string" ? value : String(value));
  } else {
    return value;
  }
}

/**
 * Runs superRefine validation for a field's response value based on its type.
 * Handles all field type validations including email, phone, multiselect, etc.
 * Throws on configuration errors (e.g., invalid variant) - caller should wrap in try-catch for partial schemas.
 */
async function superRefineField({
  field,
  value,
  isPartialSchema,
  isRequired,
  checkOptional,
  zodCtx,
  translateFn,
  responses,
}: {
  field: NonNullable<BookingFields>[number];
  value: unknown;
  isPartialSchema: boolean;
  isRequired: boolean;
  checkOptional: boolean;
  zodCtx: FieldZodCtx;
  translateFn?: TranslationFunction;
  responses: Record<string, unknown>;
}): Promise<void> {
  const stringSchema = z.string();
  const emailSchema = isPartialSchema ? z.string() : z.string().refine(emailSchemaRefinement);
  const phoneSchema = isPartialSchema
    ? z.string()
    : z.string().refine(async (val) => {
        return isValidPhoneNumber(val);
      });
  // Tag the message with the input name so that the message can be shown at appropriate place
  const m = (message: string, options?: Record<string, unknown>) => {
    const translatedMessage = translateFn ? translateFn(message, options) : message;
    return `{${field.name}}${translatedMessage}`;
  };

  if (isRequired && !isPartialSchema && !value) {
    zodCtx.addIssue({ code: z.ZodIssueCode.custom, message: m(`error_required_field`) });
    return;
  }

  if (field.type === "email") {
    if (!field.hidden && (isRequired || (value && String(value).trim() !== ""))) {
      // Email RegExp to validate if the input is a valid email
      if (!emailSchema.safeParse(value).success) {
        zodCtx.addIssue({
          code: z.ZodIssueCode.custom,
          message: m("email_validation_error"),
        });
      }

      if (value) {
        const bookerEmail = String(value);
        const excludedEmails = field.excludeEmails?.split(",").map((domain) => domain.trim()) || [];

        const match = excludedEmails.find((excludedEntry) => doesEmailMatchEntry(bookerEmail, excludedEntry));
        if (match) {
          zodCtx.addIssue({
            code: z.ZodIssueCode.custom,
            message: m("exclude_emails_match_found_error_message"),
          });
        }
        const requiredEmails =
          field.requireEmails
            ?.split(",")
            .map((domain) => domain.trim())
            .filter(Boolean) || [];
        const requiredEmailsMatch = requiredEmails.find((requiredEntry) =>
          doesEmailMatchEntry(bookerEmail, requiredEntry)
        );
        if (requiredEmails.length > 0 && !requiredEmailsMatch) {
          zodCtx.addIssue({
            code: z.ZodIssueCode.custom,
            message: m("require_emails_no_match_found_error_message"),
          });
        }
      }
    }
    return;
  }

  const fieldTypeSchema = fieldTypesSchemaMap[field.type as keyof typeof fieldTypesSchemaMap];
  if (fieldTypeSchema) {
    fieldTypeSchema.superRefine({
      // We use `unknown` here because the response type is not trivial to know here
      // We know for sure that the value here is preprocessed(considering how we have called z.preprocess())
      // and thus the fieldTypeSchema implementation could rely on having the correct type as per its preprocess fn return value
      response: value as unknown as any,
      ctx: zodCtx,
      m,
      field,
      isPartialSchema,
    });
    return;
  }

  if (field.type === "multiemail") {
    const emailsParsed = emailSchema.array().safeParse(value);

    if (isRequired && (!value || (value as unknown[]).length === 0)) {
      zodCtx.addIssue({ code: z.ZodIssueCode.custom, message: m(`error_required_field`) });
      return;
    }

    if (!emailsParsed.success) {
      // If additional guests are shown but all inputs are empty then don't show any errors
      if (field.name === "guests" && (value as string[]).every((email: string) => email === "")) {
        // reset guests to empty array, otherwise it adds "" for every input
        responses[field.name] = [];
        return;
      }
      zodCtx.addIssue({
        code: z.ZodIssueCode.custom,
        message: m("email_validation_error"),
      });
      return;
    }

    const emails = emailsParsed.data;
    const sortedEmails = [...emails].sort();
    sortedEmails.some((item, i) => {
      if (item === sortedEmails[i + 1]) {
        zodCtx.addIssue({ code: z.ZodIssueCode.custom, message: m("duplicate_email") });
        return true;
      }
    });
    return;
  }

  if (field.type === "multiselect") {
    if (isRequired && (!value || (value as unknown[]).length === 0)) {
      zodCtx.addIssue({ code: z.ZodIssueCode.custom, message: m(`error_required_field`) });
      return;
    }
    if (!stringSchema.array().safeParse(value).success) {
      zodCtx.addIssue({ code: z.ZodIssueCode.custom, message: m("Invalid array of strings") });
    }
    return;
  }

  if (field.type === "checkbox") {
    if (!stringSchema.array().safeParse(value).success) {
      zodCtx.addIssue({ code: z.ZodIssueCode.custom, message: m("Invalid array of strings") });
    }
    return;
  }

  if (field.type === "phone") {
    // Determine if the phone field needs validation
    const needsValidation = isRequired || (value && (value as string).trim() !== "");

    // Validate phone number if the field is not hidden and requires validation
    if (!field.hidden && needsValidation) {
      if (!(await phoneSchema.safeParseAsync(value)).success) {
        zodCtx.addIssue({ code: z.ZodIssueCode.custom, message: m("invalid_number") });
      }
    }
    return;
  }

  if (field.type === "boolean") {
    const schema = z.boolean();
    if (!schema.safeParse(value).success) {
      zodCtx.addIssue({ code: z.ZodIssueCode.custom, message: m("Invalid Boolean") });
    }
    return;
  }

  if (field.type === "radioInput") {
    if (field.optionsInputs) {
      const typedValue = value as { optionValue?: string; value?: string } | undefined;
      const optionValue = typedValue?.optionValue;
      const optionField = field.optionsInputs[typedValue?.value ?? ""];
      const typeOfOptionInput = optionField?.type;
      if (
        // Either the field is required or there is a radio selected, we need to check if the optionInput is required or not.
        (isRequired || typedValue?.value) && checkOptional ? true : optionField?.required && !optionValue
      ) {
        zodCtx.addIssue({ code: z.ZodIssueCode.custom, message: m("error_required_field") });
        return;
      }

      if (optionValue) {
        // `typeOfOptionInput` can be any of the main types. So, the same validations should run for `optionValue`
        if (typeOfOptionInput === "phone") {
          if (!(await phoneSchema.safeParseAsync(optionValue)).success) {
            zodCtx.addIssue({ code: z.ZodIssueCode.custom, message: m("invalid_number") });
          }
        }
      }
    }
    return;
  }

  // Use fieldTypeConfig.propsType to validate for propsType=="text" or propsType=="select" as in those cases, the response would be a string.
  // If say we want to do special validation for 'address' that can be added to `fieldTypesSchemaMap`
  if (["address", "text", "select", "number", "radio", "textarea"].includes(field.type)) {
    const schema = stringSchema;
    if (!schema.safeParse(value).success) {
      zodCtx.addIssue({ code: z.ZodIssueCode.custom, message: m("Invalid string") });
    }
    return;
  }

  zodCtx.addIssue({
    code: z.ZodIssueCode.custom,
    message: `Can't parse unknown booking field type: ${field.type}`,
  });
}

/**
 * Checks if a booker email matches an email/domain entry.
 * Supports three formats:
 * - Full email: "user@example.com" - matches exactly
 * - Domain with @ prefix: "@example.com" - matches any email ending with "@example.com"
 * - Domain without @ prefix: "example.com" - matches any email ending with "@example.com"
 */
const doesEmailMatchEntry = (bookerEmail: string, entry: string): boolean => {
  const bookerEmailLower = bookerEmail.toLowerCase();

  if (entry.startsWith("@")) {
    const domain = entry.slice(1).toLowerCase();
    return bookerEmailLower.endsWith("@" + domain);
  }

  if (entry.includes("@")) {
    return bookerEmailLower === entry.toLowerCase();
  }

  return bookerEmailLower.endsWith("@" + entry.toLowerCase());
};
export const getBookingResponsesPartialSchema = ({ bookingFields, view, translateFn }: CommonParams) => {
  const schema = bookingResponses.unwrap().partial().and(catchAllSchema);
  return preprocess({ schema, bookingFields, isPartialSchema: true, view, translateFn });
};

// Should be used when we know that not all fields responses are present
// - Can happen when we are parsing the prefill query string
// - Can happen when we are parsing a booking's responses (which was created before we added a new required field)
export default function getBookingResponsesSchema({ bookingFields, view, translateFn }: CommonParams) {
  const schema = bookingResponses.and(z.record(z.any()));
  return preprocess({ schema, bookingFields, isPartialSchema: false, view, translateFn });
}

// Should be used when we want to check if the optional fields are entered and valid as well
export function getBookingResponsesSchemaWithOptionalChecks({
  bookingFields,
  view,
  translateFn,
}: CommonParams) {
  const schema = bookingResponses.and(z.record(z.any()));
  return preprocess({
    schema,
    bookingFields,
    isPartialSchema: false,
    view,
    checkOptional: true,
    translateFn,
  });
}

type FieldZodCtxState = {
  issues: z.IssueData[];
} | null;

const buildFieldZodCtx = ({
  zodCtx,
  isPartialSchema,
}: {
  zodCtx: z.RefinementCtx;
  isPartialSchema: boolean;
}): {
  fieldZodCtx: FieldZodCtx;
  state: FieldZodCtxState;
} => {
  if (isPartialSchema) {
    const state: FieldZodCtxState = {
      issues: [],
    };
    return {
      fieldZodCtx: {
        addIssue: (issue: z.IssueData) => {
          state.issues.push(issue);
        },
      },
      state,
    };
  }
  return {
    fieldZodCtx: zodCtx,
    state: null,
  };
};

// TODO: Move preprocess of `booking.responses` to FormBuilder schema as that is going to parse the fields supported by FormBuilder
// It allows anyone using FormBuilder to get the same preprocessing automatically
function preprocess<T extends z.ZodType>({
  schema,
  bookingFields,
  isPartialSchema,
  view: currentView,
  checkOptional = false,
  translateFn,
}: CommonParams & {
  schema: T;
  // It is useful when we want to prefill the responses with the partial values. Partial can be in 2 ways
  // - Not all required fields are need to be provided for prefill.
  // - Even a field response itself can be partial so the content isn't validated e.g. a field with type="phone" can be given a partial phone number(e.g. Specifying the country code like +91)
  isPartialSchema: boolean;
  checkOptional?: boolean;
}): z.ZodType<z.infer<T>, z.infer<T>, z.infer<T>> {
  const log = logger.getSubLogger({ prefix: ["getBookingResponsesSchema"] });
  const preprocessed = z.preprocess(
    (responses) => {
      const parsedResponses = z.record(z.any()).nullable().parse(responses) || {};
      const newResponses = {} as typeof parsedResponses;
      // if eventType has been deleted, we won't have bookingFields and thus we can't preprocess or validate them.
      if (!bookingFields) return parsedResponses;
      bookingFields.forEach((field) => {
        const value = parsedResponses[field.name];
        if (value === undefined) {
          // If there is no response for the field, then we don't need to do any processing
          return;
        }
        const views = field.views;
        const isFieldApplicableToCurrentView =
          currentView === "ALL_VIEWS" ? true : views ? views.find((view) => view.id === currentView) : true;
        if (!isFieldApplicableToCurrentView) {
          // If the field is not applicable in the current view, then we don't need to do any processing
          return;
        }

        try {
          newResponses[field.name] = preprocessField({ field, value, isPartialSchema, log });
        } catch (e) {
          if (!isPartialSchema) {
            throw e;
          }
          const errorMessage = e instanceof Error ? e.message : "preprocessing failed";
          const invalidFieldName = field.name;
          // Remove invalid field like it never existed in the first place
          delete parsedResponses[invalidFieldName];
          console.warn(`Skipped invalid field during preprocessing: ${invalidFieldName} (${errorMessage})`);
        }
      });

      return {
        ...parsedResponses,
        ...newResponses,
      };
    },
    schema.superRefine(async (responses, ctx) => {
      if (!bookingFields) {
        // if eventType has been deleted, we won't have bookingFields and thus we can't validate the responses.
        return;
      }

      const attendeePhoneNumberField = bookingFields.find((field) => field.name === "attendeePhoneNumber");
      const isAttendeePhoneNumberFieldHidden = attendeePhoneNumberField?.hidden;

      const emailField = bookingFields.find((field) => field.name === "email");
      const isEmailFieldHidden = !!emailField?.hidden;

      // To prevent using user's session email as attendee's email, we set email to empty string
      if (isEmailFieldHidden && !isAttendeePhoneNumberFieldHidden) {
        responses["email"] = "";
      }

      for (const bookingField of bookingFields) {
        const value = responses[bookingField.name];
        const views = bookingField.views;
        const isFieldApplicableToCurrentView =
          currentView === "ALL_VIEWS" ? true : views ? views.find((view) => view.id === currentView) : true;
        let hidden = bookingField.hidden;
        const numOptions = bookingField.options?.length ?? 0;
        if (bookingField.hideWhenJustOneOption) {
          hidden = hidden || numOptions <= 1;
        }
        let isRequired = false;
        // If the field is hidden, then it can never be required
        if (!hidden && isFieldApplicableToCurrentView) {
          isRequired = checkOptional || !!bookingField.required;
        }

        if ((isPartialSchema || !isRequired) && value === undefined) {
          continue;
        }

        // For partial schemas, use a proxy ctx to capture issues
        const { fieldZodCtx, state } = buildFieldZodCtx({
          zodCtx: ctx,
          isPartialSchema,
        });

        let superRefineError = false;
        try {
          await superRefineField({
            field: bookingField,
            value,
            isPartialSchema,
            isRequired,
            checkOptional,
            zodCtx: fieldZodCtx,
            translateFn,
            responses,
          });
        } catch (e) {
          if (!isPartialSchema) {
            throw e;
          }
          superRefineError = true;
        }

        // For partial schemas, remove invalid fields from responses
        const issues = state?.issues ?? [];
        if (isPartialSchema && (superRefineError || issues.length > 0)) {
          delete responses[bookingField.name];
          console.warn(
            `Partial prefill: skipped field '${bookingField.name}' due to ${issues.length} validation error(s)`
          );
        }
      }
    })
  );
  if (isPartialSchema) {
    // Query Params can be completely invalid, try to preprocess as much of it in correct format but in worst case simply don't prefill instead of crashing
    return preprocessed.catch((res?: { error?: unknown[] }) => {
      console.error("Failed to validate query params, prefilling will be skipped entirely", res?.error);
      return {};
    });
  }
  return preprocessed;
}
