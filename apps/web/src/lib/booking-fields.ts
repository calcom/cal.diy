import { z } from "zod";

/**
 * Booking questions, stored in EventType.bookingFields in Cal's format so existing data and the
 * public API keep working. Shared by the questions editor, the booker form and the server, which
 * all validate responses with validateBookingResponses().
 */

const BOOKING_FIELD_TYPES = [
  "name",
  "email",
  "phone",
  "address",
  "text",
  "number",
  "textarea",
  "select",
  "multiselect",
  "multiemail",
  "checkbox",
  "radio",
  "radioInput",
  "boolean",
  "url",
] as const;

type BookingFieldType = (typeof BOOKING_FIELD_TYPES)[number];

/** Types a host can pick for their own questions, with their Cal labels as translation keys. */
const USER_FIELD_TYPES: { type: BookingFieldType; labelKey: string }[] = [
  { type: "text", labelKey: "short_text" },
  { type: "textarea", labelKey: "long_text" },
  { type: "number", labelKey: "number" },
  { type: "email", labelKey: "email" },
  { type: "phone", labelKey: "phone" },
  { type: "address", labelKey: "address" },
  { type: "url", labelKey: "url" },
  { type: "select", labelKey: "select_field" },
  { type: "multiselect", labelKey: "multiselect_field" },
  { type: "multiemail", labelKey: "multiple_emails" },
  { type: "checkbox", labelKey: "checkbox_group" },
  { type: "radio", labelKey: "radio_group" },
  { type: "boolean", labelKey: "checkbox" },
];

const OPTION_FIELD_TYPES: ReadonlySet<BookingFieldType> = new Set([
  "select",
  "multiselect",
  "checkbox",
  "radio",
]);

const LENGTH_FIELD_TYPES: ReadonlySet<BookingFieldType> = new Set(["text", "textarea"]);

const MAX_TEXT_LENGTH = 5000;
// Cal's textarea limit; names are capped like the attendee name column's other writers.
const DEFAULT_MAX_LENGTH: Partial<Record<BookingFieldType, number>> = { textarea: 1000, name: 200 };

/** Cal's identifier rule: the name becomes a response key and a workflow/redirect variable. */
const FIELD_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

const optionSchema = z.object({
  label: z.string().trim().min(1).max(500),
  value: z.string().trim().min(1).max(500),
});

const optionInputSchema = z.object({
  type: z.enum(["address", "phone", "text"]),
  required: z.boolean().optional(),
  placeholder: z.string().max(500).optional(),
});

const bookingFieldShape = z.object({
  name: z.string().regex(FIELD_NAME_PATTERN),
  type: z.enum(BOOKING_FIELD_TYPES),
  label: z.string().max(1000).optional(),
  defaultLabel: z.string().max(200).optional(),
  placeholder: z.string().max(500).optional(),
  defaultPlaceholder: z.string().max(200).optional(),
  required: z.boolean().optional(),
  hidden: z.boolean().optional(),
  editable: z
    .enum(["system", "system-but-optional", "system-but-hidden", "user", "user-readonly"])
    .optional(),
  options: z.array(optionSchema).max(100).optional(),
  getOptionsAt: z.string().max(100).optional(),
  optionsInputs: z.record(z.string(), optionInputSchema).optional(),
  hideWhenJustOneOption: z.boolean().optional(),
  minLength: z.number().int().min(0).max(MAX_TEXT_LENGTH).optional(),
  maxLength: z.number().int().min(1).max(MAX_TEXT_LENGTH).optional(),
  excludeEmails: z.string().max(5000).optional(),
  requireEmails: z.string().max(5000).optional(),
  views: z.array(z.object({ id: z.string(), label: z.string().optional() })).optional(),
  /** Where a field came from (default, user, a workflow); Cal shows it in the editor. */
  sources: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))).optional(),
});

/** One question. Unknown Cal properties (variants, sources) are kept as they are. */
const bookingFieldSchema = bookingFieldShape.passthrough();

type BookingField = z.infer<typeof bookingFieldShape>;

/** What the questions editor may set on a field; anything else comes from the stored field or defaults. */
const bookingFieldInputSchema = z
  .object({
    name: z.string().regex(FIELD_NAME_PATTERN),
    type: z.enum(BOOKING_FIELD_TYPES),
    label: z.string().trim().max(1000).optional(),
    placeholder: z.string().trim().max(500).optional(),
    required: z.boolean(),
    hidden: z.boolean(),
    options: z.array(optionSchema).max(100).optional(),
    minLength: z.number().int().min(0).max(MAX_TEXT_LENGTH).optional(),
    maxLength: z.number().int().min(1).max(MAX_TEXT_LENGTH).optional(),
    excludeEmails: z.string().trim().max(5000).optional(),
    requireEmails: z.string().trim().max(5000).optional(),
    // Shown by the editor; the server takes these from the stored field instead.
    defaultLabel: z.string().max(200).optional(),
    defaultPlaceholder: z.string().max(200).optional(),
    editable: z
      .enum(["system", "system-but-optional", "system-but-hidden", "user", "user-readonly"])
      .optional(),
  })
  .refine((field) => !OPTION_FIELD_TYPES.has(field.type) || (field.options?.length ?? 0) > 0, {
    message: "booking_question_options_required",
  })
  .refine(
    (field) =>
      field.minLength === undefined || field.maxLength === undefined || field.minLength <= field.maxLength,
    { message: "booking_question_length_error" }
  );

type BookingFieldInput = z.infer<typeof bookingFieldInputSchema>;

const DEFAULT_SOURCE = [{ label: "Default", id: "default", type: "default" }];

/** Cal's default location inputs, kept for compatibility even where Cal.diy has no such location. */
const LOCATION_OPTION_INPUTS = {
  attendeeInPerson: { type: "address" as const, required: true, placeholder: "" },
  somewhereElse: { type: "text" as const, required: true, placeholder: "" },
  phone: { type: "phone" as const, required: true, placeholder: "" },
};

function systemFieldsBefore(): BookingField[] {
  const fields: BookingField[] = [
    { name: "name", type: "name", defaultLabel: "your_name", required: true, editable: "system" },
    // Cal lets hosts make email optional and identify bookers by phone; Cal.diy needs an email for
    // every attendee, so it stays required.
    { name: "email", type: "email", defaultLabel: "email_address", required: true, editable: "system" },
    {
      name: "attendeePhoneNumber",
      type: "phone",
      defaultLabel: "phone_number",
      required: false,
      hidden: true,
      editable: "system-but-optional",
    },
    {
      name: "location",
      type: "radioInput",
      defaultLabel: "location",
      required: false,
      editable: "system",
      getOptionsAt: "locations",
      optionsInputs: LOCATION_OPTION_INPUTS,
      hideWhenJustOneOption: true,
    },
  ];
  return fields.map((field) => ({ ...field, sources: DEFAULT_SOURCE }));
}

function systemFieldsAfter(disableGuests: boolean): BookingField[] {
  const fields: BookingField[] = [
    {
      name: "title",
      type: "text",
      defaultLabel: "what_is_this_meeting_about",
      defaultPlaceholder: "",
      required: true,
      hidden: true,
      editable: "system-but-optional",
    },
    {
      name: "notes",
      type: "textarea",
      defaultLabel: "additional_notes",
      defaultPlaceholder: "share_additional_notes",
      required: false,
      editable: "system-but-optional",
    },
    {
      name: "guests",
      type: "multiemail",
      defaultLabel: "additional_guests",
      defaultPlaceholder: "email",
      required: false,
      hidden: disableGuests,
      editable: "system-but-optional",
    },
    {
      name: "rescheduleReason",
      type: "textarea",
      defaultLabel: "reason_for_reschedule",
      defaultPlaceholder: "reschedule_placeholder",
      required: false,
      editable: "system-but-optional",
      views: [{ id: "reschedule", label: "Reschedule View" }],
    },
  ];
  return fields.map((field) => ({ ...field, sources: DEFAULT_SOURCE }));
}

/** Stored fields that parse; anything else (corrupt or from a newer writer) is left out. */
function parseBookingFields(value: unknown): BookingField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = bookingFieldSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Port of Cal's ensureBookingInputsHaveSystemFields: the event's questions with the system ones in
 * their default places, stored settings winning over defaults. Name, email, phone and location go
 * first, then the host's own questions, then title, notes, guests and the reschedule reason.
 */
function withSystemFields(stored: BookingField[], options: { disableGuests?: boolean } = {}): BookingField[] {
  const before = systemFieldsBefore();
  const after = systemFieldsAfter(options.disableGuests ?? false);
  if (!stored.length) return [...before, ...after];
  const systemByName = new Map([...before, ...after].map((field) => [field.name, field]));

  // Keep the stored order (hosts can reorder), only adding system fields that are missing. The type
  // and role of a system field never change; a host only edits its wording and visibility.
  const result = stored.map((field) => {
    const system = systemByName.get(field.name);
    if (!system) return field;
    const merged = { ...system, ...field, type: system.type, editable: system.editable };
    return system.editable === "system"
      ? { ...merged, required: system.required, hidden: system.hidden }
      : merged;
  });
  const present = new Set(result.map((field) => field.name));
  const missingBefore = before.filter((field) => !present.has(field.name));
  const missingAfter = after.filter((field) => !present.has(field.name));
  return [...missingBefore, ...result, ...missingAfter];
}

/**
 * Applies the editor's fields to what is stored: system fields keep their role and only take wording
 * and visibility (and required, where Cal lets hosts change it); host fields are taken as sent.
 */
function applyBookingFieldInputs(
  stored: BookingField[],
  inputs: BookingFieldInput[],
  options: { disableGuests?: boolean } = {}
): BookingField[] {
  const current = new Map(withSystemFields(stored, options).map((field) => [field.name, field]));
  const seen = new Set<string>();
  const result: BookingField[] = [];
  for (const input of inputs) {
    if (seen.has(input.name)) throw new BookingFieldsError("form_builder_field_already_exists");
    seen.add(input.name);
    const existing = current.get(input.name);
    const wording = {
      label: input.label || undefined,
      placeholder: input.placeholder || undefined,
    };
    if (existing?.editable && existing.editable !== "user") {
      const optional = existing.editable === "system-but-optional";
      result.push({
        ...existing,
        ...wording,
        required: optional ? input.required : existing.required,
        hidden: optional ? input.hidden : existing.hidden,
        ...(existing.type === "email" ? emailRules(input) : {}),
        ...(LENGTH_FIELD_TYPES.has(existing.type) ? lengthRules(input) : {}),
      });
      continue;
    }
    if (input.type === "name" || input.type === "radioInput")
      throw new BookingFieldsError("booking_question_type_not_allowed");
    result.push({
      ...(existing ?? {}),
      name: input.name,
      type: input.type,
      ...wording,
      required: input.required,
      hidden: input.hidden,
      editable: "user",
      options: OPTION_FIELD_TYPES.has(input.type) ? input.options : undefined,
      ...(input.type === "email" ? emailRules(input) : {}),
      ...(LENGTH_FIELD_TYPES.has(input.type) ? lengthRules(input) : {}),
      sources: [{ label: "User", id: "user", type: "user" }],
    });
  }
  for (const field of current.values()) {
    // System fields can be hidden but never removed.
    if (field.editable && field.editable !== "user" && !seen.has(field.name))
      throw new BookingFieldsError("booking_question_system_field_removed");
  }
  return result;
}

function emailRules(input: BookingFieldInput) {
  return { excludeEmails: input.excludeEmails || undefined, requireEmails: input.requireEmails || undefined };
}

function lengthRules(input: BookingFieldInput) {
  return { minLength: input.minLength, maxLength: input.maxLength };
}

/** Thrown with a translation key when the editor's fields can't be applied. */
class BookingFieldsError extends Error {}

/** A stored field as the questions editor works with it. */
function toBookingFieldInput(field: BookingField): BookingFieldInput {
  return {
    name: field.name,
    type: field.type,
    label: field.label,
    placeholder: field.placeholder,
    required: Boolean(field.required),
    hidden: Boolean(field.hidden),
    options: field.options,
    minLength: field.minLength,
    maxLength: field.maxLength,
    excludeEmails: field.excludeEmails,
    requireEmails: field.requireEmails,
    defaultLabel: field.defaultLabel,
    defaultPlaceholder: field.defaultPlaceholder,
    editable: field.editable,
  };
}

type BookingView = "booking" | "reschedule";

function isFieldInView(field: BookingField, view: BookingView): boolean {
  return !field.views || field.views.some((candidate) => candidate.id === view);
}

/** Hidden fields are neither shown nor required; a one-option location has nothing to choose. */
function isFieldHidden(field: BookingField, optionCount?: number): boolean {
  if (field.hidden) return true;
  const count = optionCount ?? field.options?.length ?? 0;
  return Boolean(field.hideWhenJustOneOption) && count <= 1;
}

type LocationResponse = { value: string; optionValue: string };
type BookingResponseValue = string | string[] | boolean | LocationResponse;
type BookingResponses = Record<string, BookingResponseValue>;

/** A failed check, as a translation key and values, for the field it belongs to. */
type BookingFieldError = { field: string; key: string; values?: Record<string, number> };

type ValidateOptions = {
  view: BookingView;
  /** Location types the event offers; the location field's options. */
  locationTypes: string[];
};

const emailSchema = z.string().email().max(320);
const PHONE_PATTERN = /^\+?[\d\s().-]{6,20}$/;

/**
 * Cal's matching for "exclude/require emails": a full address matches exactly, "@domain" or a bare
 * domain matches any address there.
 */
function doesEmailMatchEntry(email: string, entry: string): boolean {
  const lower = email.toLowerCase();
  const target = entry.toLowerCase();
  if (target.startsWith("@")) return lower.endsWith(target);
  if (target.includes("@")) return lower === target;
  return lower.endsWith(`@${target}`);
}

function splitEntries(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalize(field: BookingField, value: unknown): BookingResponseValue | undefined {
  if (value === undefined || value === null) return undefined;
  switch (field.type) {
    case "boolean":
      return value === true || value === "true";
    case "multiemail":
    case "checkbox":
    case "multiselect": {
      const list = (Array.isArray(value) ? value : [value]).map((item) => String(item).trim());
      return list.filter(Boolean);
    }
    case "radioInput": {
      if (typeof value !== "object" || Array.isArray(value)) return undefined;
      const record = value as Record<string, unknown>;
      return {
        value: typeof record.value === "string" ? record.value : "",
        optionValue: typeof record.optionValue === "string" ? record.optionValue.trim() : "",
      };
    }
    default:
      // Cal stores every other answer, numbers included, as a string.
      return typeof value === "string" ? value.trim() : String(value);
  }
}

function isEmpty(value: BookingResponseValue | undefined): boolean {
  if (value === undefined || value === "" || value === false) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return !value.value;
  return false;
}

function checkUrl(value: string): boolean {
  if (/^https?:\/[^/]/.test(value)) return false;
  if (z.string().url().safeParse(value).success) return true;
  return (
    /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(value) && z.string().url().safeParse(`https://${value}`).success
  );
}

function checkField(
  field: BookingField,
  value: BookingResponseValue,
  options: ValidateOptions
): Omit<BookingFieldError, "field"> | null {
  switch (field.type) {
    case "email": {
      const email = String(value);
      if (!emailSchema.safeParse(email).success) return { key: "email_validation_error" };
      if (splitEntries(field.excludeEmails).some((entry) => doesEmailMatchEntry(email, entry)))
        return { key: "exclude_emails_match_found_error_message" };
      const required = splitEntries(field.requireEmails);
      if (required.length && !required.some((entry) => doesEmailMatchEntry(email, entry)))
        return { key: "require_emails_no_match_found_error_message" };
      return null;
    }
    case "multiemail": {
      const emails = value as string[];
      if (emails.length > 10) return { key: "booking_question_too_many_emails", values: { count: 10 } };
      if (!emails.every((email) => emailSchema.safeParse(email).success))
        return { key: "email_validation_error" };
      const lower = emails.map((email) => email.toLowerCase());
      if (new Set(lower).size !== lower.length) return { key: "duplicate_email" };
      return null;
    }
    case "phone":
      return PHONE_PATTERN.test(String(value)) ? null : { key: "invalid_number" };
    case "url":
      return checkUrl(String(value)) ? null : { key: "url_validation_error" };
    case "number":
      return Number.isFinite(Number(value)) ? null : { key: "booking_question_number_error" };
    case "select":
    case "radio":
      return field.options?.some((option) => option.value === value) ? null : { key: "error_required_field" };
    case "multiselect":
    case "checkbox": {
      const allowed = new Set(field.options?.map((option) => option.value));
      return (value as string[]).every((item) => allowed.has(item)) ? null : { key: "error_required_field" };
    }
    case "radioInput": {
      const location = value as LocationResponse;
      if (!options.locationTypes.includes(location.value)) return { key: "error_required_field" };
      const input = field.optionsInputs?.[location.value];
      if (input?.required && !location.optionValue) return { key: "error_required_field" };
      if (input?.type === "phone" && location.optionValue && !PHONE_PATTERN.test(location.optionValue))
        return { key: "invalid_number" };
      return null;
    }
    case "text":
    case "textarea":
    case "address":
    case "name": {
      const text = String(value);
      const max = field.maxLength ?? DEFAULT_MAX_LENGTH[field.type] ?? MAX_TEXT_LENGTH;
      if (text.length > max) return { key: "max_characters_allowed", values: { count: max } };
      if (field.minLength && text.length < field.minLength)
        return { key: "min_characters_required", values: { count: field.minLength } };
      return null;
    }
    default:
      return null;
  }
}

/**
 * Normalizes and checks a booker's answers against the event's questions (with system fields).
 * Answers to questions that are hidden or not in this view are dropped, as are unknown keys, so
 * nothing the host didn't ask for is stored.
 */
function validateBookingResponses(
  fields: BookingField[],
  raw: Record<string, unknown>,
  options: ValidateOptions
): { responses: BookingResponses; errors: BookingFieldError[] } {
  const responses: BookingResponses = {};
  const errors: BookingFieldError[] = [];
  for (const field of fields) {
    if (!isFieldInView(field, options.view)) continue;
    const optionCount = field.type === "radioInput" ? options.locationTypes.length : undefined;
    const hidden = isFieldHidden(field, optionCount);
    let value = normalize(field, raw[field.name]);
    // With nothing to choose, the event's only location is the answer.
    if (field.type === "radioInput" && hidden && options.locationTypes.length === 1) {
      const location = value as LocationResponse | undefined;
      value = {
        value: options.locationTypes[0],
        optionValue: location?.value === options.locationTypes[0] ? location.optionValue : "",
      };
      const error = checkField(field, value, options);
      if (error) errors.push({ field: field.name, ...error });
      responses[field.name] = value;
      continue;
    }
    if (hidden) continue;
    if (isEmpty(value)) {
      if (field.required) errors.push({ field: field.name, key: "error_required_field" });
      continue;
    }
    const error = checkField(field, value as BookingResponseValue, options);
    if (error) errors.push({ field: field.name, ...error });
    else responses[field.name] = value as BookingResponseValue;
  }
  return { responses, errors };
}

/** The label a booker sees: the host's own wording, else the translated default. */
function fieldLabel(field: BookingField, t: (key: string) => string): string {
  return field.label || (field.defaultLabel ? t(field.defaultLabel) : field.name);
}

function fieldPlaceholder(field: BookingField, t: (key: string) => string): string {
  return field.placeholder || (field.defaultPlaceholder ? t(field.defaultPlaceholder) : "");
}

/** Formats an answer for emails, webhooks and the booking page. */
function formatResponse(value: unknown, t: (key: string) => string): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return t(value ? "yes" : "no");
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return String(record.optionValue || record.value || "");
  }
  return String(value);
}

type CalEventResponse = { label: string; value: unknown; isHidden?: boolean };

/**
 * Port of Cal's getCalEventResponses: answers labelled as the host wrote them (or by the default
 * label's key), all of them and the host's own questions separately. Webhooks carry both.
 */
function calEventResponses(
  fields: BookingField[] | null,
  responses: Record<string, unknown>
): { responses: Record<string, CalEventResponse>; userFieldsResponses: Record<string, CalEventResponse> } {
  const all: Record<string, CalEventResponse> = {};
  const userFields: Record<string, CalEventResponse> = {};
  if (!fields) {
    // The event type is gone, so labels are unknown; Cal falls back to the names.
    for (const [name, value] of Object.entries(responses)) {
      all[name] = { label: name, value };
      if (!SYSTEM_FIELD_NAMES.has(name)) userFields[name] = { label: name, value };
    }
    return { responses: all, userFieldsResponses: userFields };
  }
  for (const field of fields) {
    const label = field.label || field.defaultLabel;
    if (!label) continue;
    const entry = { label, value: responses[field.name], isHidden: Boolean(field.hidden) };
    all[field.name] = entry;
    if (field.editable === "user" || field.editable === "user-readonly") userFields[field.name] = entry;
  }
  return { responses: all, userFieldsResponses: userFields };
}

const SYSTEM_FIELD_NAMES = new Set([
  "name",
  "email",
  "attendeePhoneNumber",
  "location",
  "title",
  "notes",
  "guests",
  "rescheduleReason",
  "smsReminderNumber",
]);

/** Answers worth showing back (booking page, emails): the host's questions that were answered. */
function userFieldAnswers(fields: BookingField[], responses: Record<string, unknown>) {
  return fields.flatMap((field) => {
    const value = responses[field.name];
    if (SYSTEM_FIELD_NAMES.has(field.name) || value === undefined || value === "" || value === null)
      return [];
    if (Array.isArray(value) && !value.length) return [];
    return [{ field, value: value as BookingResponseValue }];
  });
}

const LIST_FIELD_TYPES: ReadonlySet<BookingFieldType> = new Set(["multiemail", "checkbox", "multiselect"]);

/**
 * Cal's URL prefill: `?name=Ada&email=ada@example.com&guests=a@x.com&guests=b@x.com` fills the
 * booking form, by question name. Only the form's starting values; answers are validated as usual.
 */
function prefillFromSearch(fields: BookingField[], search: URLSearchParams): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === "radioInput") continue;
    const given = search.getAll(field.name).filter(Boolean);
    if (!given.length) continue;
    if (LIST_FIELD_TYPES.has(field.type)) values[field.name] = given;
    else if (field.type === "boolean") values[field.name] = given[0] === "true";
    else values[field.name] = given[0];
  }
  return values;
}

export type {
  BookingFieldType,
  BookingField,
  BookingFieldInput,
  BookingView,
  LocationResponse,
  BookingResponseValue,
  BookingResponses,
  BookingFieldError,
  ValidateOptions,
  CalEventResponse,
};

export {
  BOOKING_FIELD_TYPES,
  USER_FIELD_TYPES,
  OPTION_FIELD_TYPES,
  LENGTH_FIELD_TYPES,
  FIELD_NAME_PATTERN,
  bookingFieldSchema,
  bookingFieldInputSchema,
  parseBookingFields,
  withSystemFields,
  applyBookingFieldInputs,
  BookingFieldsError,
  toBookingFieldInput,
  isFieldInView,
  isFieldHidden,
  doesEmailMatchEntry,
  validateBookingResponses,
  fieldLabel,
  fieldPlaceholder,
  formatResponse,
  calEventResponses,
  userFieldAnswers,
  prefillFromSearch,
};
