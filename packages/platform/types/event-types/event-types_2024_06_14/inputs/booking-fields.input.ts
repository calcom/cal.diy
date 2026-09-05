import { BadRequestException } from "@nestjs/common";
import { ApiProperty as DocsProperty, ApiPropertyOptional as DocsPropertyOptional } from "@nestjs/swagger";
import { plainToInstance } from "class-transformer";
import { IsString, IsBoolean, IsArray, IsIn, IsOptional } from "class-validator";
import type { ValidationOptions, ValidatorConstraintInterface } from "class-validator";
import { registerDecorator, validate, ValidatorConstraint } from "class-validator";

const inputBookingFieldTypes = [
  "name",
  "splitName",
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
  "boolean",
  "url",
] as const;

const inputBookingFieldSlugs = ["title", "location", "notes", "guests", "rescheduleReason"] as const;

export class NameDefaultFieldInput_2024_06_14 {
  @IsIn(inputBookingFieldTypes)
  @DocsProperty({
    example: "name",
    description:
      "only allowed value for type is `name`. Used for having 1 booking field for both first name and last name.",
  })
  type!: "name";

  @IsString()
  @IsOptional()
  @DocsProperty()
  label?: string;

  @IsString()
  @IsOptional()
  @DocsProperty()
  placeholder?: string;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if URL contains query parameter `&name=bob`,\
      the name field will be prefilled with this value and disabled. In case of Booker atom need to pass 'name' to defaultFormValues prop with the desired value e.g. `defaultFormValues={{name: 'bob'}}`. See guide https://cal.com/docs/platform/guides/booking-fields",
  })
  disableOnPrefill?: boolean;
}

export class SplitNameDefaultFieldInput_2024_06_14 {
  @IsIn(inputBookingFieldTypes)
  @DocsProperty({
    example: "splitName",
    description:
      "only allowed value for type is `splitName`. Used to have 2 booking fields - 1 for first name and 1 for last name.",
  })
  type!: "splitName";

  @IsString()
  @IsOptional()
  @DocsProperty()
  firstNameLabel?: string;

  @IsString()
  @IsOptional()
  @DocsProperty()
  firstNamePlaceholder?: string;

  @IsString()
  @IsOptional()
  @DocsProperty()
  lastNameLabel?: string;

  @IsString()
  @IsOptional()
  @DocsProperty()
  lastNamePlaceholder?: string;

  @IsBoolean()
  @IsOptional()
  @DocsProperty({ description: "First name field is required but last name field is not by default." })
  lastNameRequired?: boolean;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if URL contains query parameter `&firstName=bob&lastName=jones`,\
      the first name and last name fields will be prefilled with this value and disabled. In case of Booker atom need to pass 'firstName' and 'lastName' to defaultFormValues prop e.g. `defaultFormValues={{firstName: 'bob', lastName: 'doe'}}` or pass 'name' prop but as a string containing name and surname e.g. `defaultFormValues={{name: 'bob doe'}}`.  See guide https://cal.com/docs/platform/guides/booking-fields",
  })
  disableOnPrefill?: boolean;
}

export class EmailDefaultFieldInput_2024_06_14 {
  @IsIn(inputBookingFieldTypes)
  @DocsProperty({
    example: "email",
    description: "only allowed value for type is `email`",
  })
  type!: "email";

  @IsString()
  @IsOptional()
  @DocsProperty()
  label?: string;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description: `Can be set to false only for organization team event types and if you also pass booking field {type: "phone", slug: "attendeePhoneNumber", required: true, hidden: false, label: "whatever label"} of booking field type PhoneFieldInput_2024_06_14 - this is done
      to enable phone only bookings where during the booking attendee can provide only their phone number and not provide email, so you must pass to the email booking field {hidden: true, required: false}.
      If true show under event type settings but don't show this booking field in the Booker. If false show in both.`,
  })
  required = true;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    description: `Can be set to true only for organization team event types and if you also pass booking field {type: "phone", slug: "attendeePhoneNumber", required: true, hidden: false, label: "whatever label"} of booking field type PhoneFieldInput_2024_06_14 - this is done
      to enable phone only bookings where during the booking attendee can provide only their phone number and not provide email, so you must pass to the email booking field {hidden: true, required: false}.
      If true show under event type settings but don't show this booking field in the Booker. If false show in both.`,
  })
  hidden?: boolean;

  @IsString()
  @IsOptional()
  @DocsProperty()
  placeholder?: string;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if URL contains query parameter `&email=bob@gmail.com`,\
      the email field will be prefilled with this value and disabled. In case of Booker atom need to pass 'email' to defaultFormValues prop with the desired value e.g. `defaultFormValues={{email: 'bob@gmail.com'}}`. See guide https://cal.com/docs/platform/guides/booking-field",
  })
  disableOnPrefill?: boolean;
}

export class TitleDefaultFieldInput_2024_06_14 {
  @IsIn(inputBookingFieldSlugs)
  @DocsProperty({ example: "title", description: "only allowed value for type is `title`" })
  slug!: "title";

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional()
  required?: boolean;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden?: boolean;

  @IsString()
  @IsOptional()
  @DocsPropertyOptional()
  label?: string;

  @IsString()
  @IsOptional()
  @DocsPropertyOptional()
  placeholder?: string;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if URL contains query parameter `&title=journey`,\
      the title field will be prefilled with this value and disabled. In case of Booker atom need to pass 'title' to defaultFormValues prop with the desired value e.g. `defaultFormValues={{title: 'very important meeting'}}`. See guide https://cal.com/docs/platform/guides/booking-field",
  })
  disableOnPrefill?: boolean;
}

export class LocationDefaultFieldInput_2024_06_14 {
  @IsIn(inputBookingFieldSlugs)
  @DocsProperty({
    example: "location",
    description:
      "only allowed value for type is `location`. This booking field is displayed only when event type has 2 or more locations in order to allow person doing the booking pick the location.",
  })
  slug!: "location";

  @IsString()
  @IsOptional()
  @DocsPropertyOptional()
  label?: string;
}

export class NotesDefaultFieldInput_2024_06_14 {
  @IsIn(inputBookingFieldSlugs)
  @DocsProperty({ example: "notes", description: "only allowed value for type is `notes`" })
  slug!: "notes";

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional()
  required?: boolean;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden?: boolean;

  @IsString()
  @IsOptional()
  @DocsPropertyOptional()
  label?: string;

  @IsString()
  @IsOptional()
  @DocsPropertyOptional()
  placeholder?: string;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if URL contains query parameter `&notes=journey`,\
      the notes field will be prefilled with this value and disabled. In case of Booker atom need to pass 'notes' to defaultFormValues prop with the desired value e.g. `defaultFormValues={{notes: 'bring notebook and paper'}}`. See guide https://cal.com/docs/platform/guides/booking-field",
  })
  disableOnPrefill?: boolean;
}

export class GuestsDefaultFieldInput_2024_06_14 {
  @IsIn(inputBookingFieldSlugs)
  @DocsProperty({ example: "guests", description: "only allowed value for type is `guests`" })
  slug!: "guests";

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional()
  required?: boolean;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden?: boolean;

  @IsString()
  @IsOptional()
  @DocsPropertyOptional()
  label?: string;

  @IsString()
  @IsOptional()
  @DocsPropertyOptional()
  placeholder?: string;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if URL contains query parameter `&guests=bob@cal.com`,\
      the guests field will be prefilled with this value and disabled. In case of Booker atom need to pass 'guests' to defaultFormValues prop with the desired value e.g. `defaultFormValues={{guests: ['bob@gmail.com', 'alice@gmail.com']}}`. See guide https://cal.com/docs/platform/guides/booking-field",
  })
  disableOnPrefill?: boolean;
}

export class RescheduleReasonDefaultFieldInput_2024_06_14 {
  @IsIn(inputBookingFieldSlugs)
  @DocsProperty({
    example: "rescheduleReason",
    description: "only allowed value for type is `rescheduleReason`",
  })
  slug!: "rescheduleReason";

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional()
  required?: boolean;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden?: boolean;

  @IsString()
  @IsOptional()
  @DocsPropertyOptional()
  label?: string;

  @IsString()
  @IsOptional()
  @DocsPropertyOptional()
  placeholder?: string;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if URL contains query parameter `&rescheduleReason=travel`,\
      the rescheduleReason field will be prefilled with this value and disabled. In case of Booker atom need to pass 'rescheduleReason' to defaultFormValues prop with the desired value e.g. `defaultFormValues={{rescheduleReason: 'bob'}}`. See guide https://cal.com/docs/platform/guides/booking-field",
  })
  disableOnPrefill?: boolean;
}

export class PhoneFieldInput_2024_06_14 {
  @IsIn(inputBookingFieldTypes)
  @DocsProperty({ example: "phone", description: "only allowed value for type is `phone`" })
  type!: "phone";

  @IsString()
  @DocsProperty({
    description: `Unique identifier for the field in format \`some-slug\`. It is used to access response to this booking field during the booking. Special slug is \`attendeePhoneNumber\` - if you create
      a phone input field with this slug for organization team event type you can create an organization team event type that can be booked using phone without requiring an email by setting {"type": "email", "required": false, "hidden": true} to the email booking field input in the request body.`,
    example: "some-slug",
  })
  slug!: string;

  @IsString()
  @DocsProperty()
  label!: string;

  @IsBoolean()
  @DocsProperty()
  required!: boolean;

  @IsString()
  @IsOptional()
  @DocsProperty()
  placeholder?: string;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if the slug is `phone` and the URL contains query parameter `&phone=1234567890`,\
      the phone field will be prefilled with this value and disabled. In case of Booker atom need to pass slug you used for this booking field to defaultFormValues prop with the desired value e.g. `defaultFormValues={{phone: '+37122222222'}}`. See guide https://cal.com/docs/platform/guides/booking-field",
  })
  disableOnPrefill?: boolean;

  @IsBoolean()
  @IsOptional()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden?: boolean;
}

export class AddressFieldInput_2024_06_14 {
  @IsIn(inputBookingFieldTypes)
  @DocsProperty({ example: "address", description: "only allowed value for type is `address`" })
  type!: "address";

  @IsString()
  @DocsProperty({
    description:
      "Unique identifier for the field in format `some-slug`. It is used to access response to this booking field during the booking",
    example: "some-slug",
  })
  slug!: string;

  @IsString()
  @DocsProperty({ example: "Please enter your address" })
  label!: string;

  @IsBoolean()
  @DocsProperty()
  required!: boolean;

  @IsString()
  @IsOptional()
  @DocsProperty()
  @DocsProperty({ example: "e.g., 1234 Main St" })
  placeholder?: string;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if the slug is `address` and the URL contains query parameter `&address=1234 Main St, London`,\
      the address field will be prefilled with this value and disabled.  In case of Booker atom need to pass slug you used for this booking field to defaultFormValues prop with the desired value e.g. `defaultFormValues={{address: 'mainstreat 10, new york'}}`. See guide https://cal.com/docs/platform/guides/booking-field",
  })
  disableOnPrefill?: boolean;

  @IsBoolean()
  @IsOptional()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden?: boolean;
}

export class TextFieldInput_2024_06_14 {
  @IsIn(inputBookingFieldTypes)
  @DocsProperty({ example: "text", description: "only allowed value for type is `text`" })
  type!: "text";

  @IsString()
  @DocsProperty({
    description:
      "Unique identifier for the field in format `some-slug`. It is used to access response to this booking field during the booking",
    example: "some-slug",
  })
  slug!: string;

  @IsString()
  @DocsProperty({ example: "Please enter your text" })
  label!: string;

  @IsBoolean()
  @DocsProperty()
  required!: boolean;

  @IsString()
  @DocsProperty({ example: "e.g., Enter text here" })
  @IsOptional()
  @DocsProperty()
  placeholder?: string;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if the slug is `friend` and the URL contains query parameter `&friend=bob`,\
      the text field will be prefilled with this value and disabled.  In case of Booker atom need to pass slug you used for this booking field to defaultFormValues prop with the desired value e.g. `defaultFormValues={{friend: 'bob'}}`. See guide https://cal.com/docs/platform/guides/booking-field",
  })
  disableOnPrefill?: boolean;

  @IsBoolean()
  @IsOptional()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden?: boolean;
}

export class UrlFieldInput_2024_06_14 {
  @IsIn(inputBookingFieldTypes)
  @DocsProperty({ example: "url", description: "only allowed value for type is `url`" })
  type!: "url";

  @IsString()
  @DocsProperty({
    description:
      "Unique identifier for the field in format `some-slug`. It is used to access response to this booking field during the booking",
    example: "some-slug",
  })
  slug!: string;

  @IsString()
  @DocsProperty({ example: "Please enter your text" })
  label!: string;

  @IsBoolean()
  @DocsProperty()
  required!: boolean;

  @IsString()
  @DocsProperty({ example: "e.g., Enter url here" })
  @IsOptional()
  @DocsProperty()
  placeholder?: string;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if the slug is `videourl` and the URL contains query parameter `&videourl=https://youtube.com/abc`the url field will be prefilled with this value and disabled. \
      In case of Booker atom need to pass slug you used for this booking field to defaultFormValues prop with the desired value  e.g. `defaultFormValues={{videourl: 'https://caltube.com/123'}}`. See guide https://cal.com/docs/platform/guides/booking-field",
  })
  disableOnPrefill?: boolean;

  @IsBoolean()
  @IsOptional()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden?: boolean;
}

export class NumberFieldInput_2024_06_14 {
  @IsIn(inputBookingFieldTypes)
  @DocsProperty({ example: "number", description: "only allowed value for type is `number`" })
  type!: "number";

  @IsString()
  @DocsProperty({
    description:
      "Unique identifier for the field in format `some-slug`. It is used to access response to this booking field during the booking",
    example: "some-slug",
  })
  slug!: string;

  @IsString()
  @DocsProperty({ example: "Please enter a number" })
  label!: string;

  @IsBoolean()
  @DocsProperty()
  required!: boolean;

  @IsString()
  @DocsProperty({ example: "e.g., 100" })
  @IsOptional()
  @DocsProperty()
  placeholder?: string;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if the slug is `calories` and the URL contains query parameter `&calories=3000`,\
      the number field will be prefilled with this value and disabled. In case of Booker atom need to pass slug you used for this booking field to defaultFormValues prop with the desired value  e.g. `defaultFormValues={{calories: 3000}}`. See guide https://cal.com/docs/platform/guides/booking-field",
  })
  disableOnPrefill?: boolean;

  @IsBoolean()
  @IsOptional()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden?: boolean;
}

export class TextAreaFieldInput_2024_06_14 {
  @IsIn(inputBookingFieldTypes)
  @DocsProperty({ example: "textarea", description: "only allowed value for type is `textarea`" })
  type!: "textarea";

  @IsString()
  @DocsProperty({
    description:
      "Unique identifier for the field in format `some-slug`. It is used to access response to this booking field during the booking",
    example: "some-slug",
  })
  slug!: string;

  @IsString()
  @DocsProperty({ example: "Please enter detailed information" })
  label!: string;

  @IsBoolean()
  @DocsProperty()
  required!: boolean;

  @IsString()
  @DocsProperty({ example: "e.g., Detailed description here..." })
  @IsOptional()
  @DocsProperty()
  placeholder?: string;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if the slug is `reflection` and the URL contains query parameter `&reflection=Today I shipped a feature`,\
      the text area will be prefilled with this value and disabled. In case of Booker atom need to pass slug you used for this booking field to defaultFormValues prop with the desired value  e.g. `defaultFormValues={{reflection: 'Today i shipped a feature'}}`. See guide https://cal.com/docs/platform/guides/booking-field",
  })
  disableOnPrefill?: boolean;

  @IsBoolean()
  @IsOptional()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden?: boolean;
}

export class SelectFieldInput_2024_06_14 {
  @IsIn(inputBookingFieldTypes)
  @DocsProperty({ example: "select", description: "only allowed value for type is `select`" })
  type!: "select";

  @IsString()
  @DocsProperty({
    description:
      "Unique identifier for the field in format `some-slug`. It is used to access response to this booking field during the booking",
    example: "some-slug",
  })
  slug!: string;

  @IsString()
  @DocsProperty({ example: "Please select an option" })
  label!: string;

  @IsBoolean()
  @DocsProperty()
  required!: boolean;

  @IsString()
  @DocsProperty({ example: "Select..." })
  @IsOptional()
  @DocsProperty()
  placeholder?: string;

  @IsArray()
  @DocsProperty({ type: [String], example: ["Option 1", "Option 2"] })
  options!: string[];

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if the slug is `language` and options of this select field are ['english', 'italian'] and the URL contains query parameter `&language=italian`,\
      the 'italian' will be selected and the select field will be disabled. In case of Booker atom need to pass slug you used for this booking field to defaultFormValues prop with the desired value  e.g. `defaultFormValues={{language: 'italian'}}`. See guide https://cal.com/docs/platform/guides/booking-field",
  })
  disableOnPrefill?: boolean;

  @IsBoolean()
  @IsOptional()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden?: boolean;
}

export class MultiSelectFieldInput_2024_06_14 {
  @IsIn(inputBookingFieldTypes)
  @DocsProperty({ example: "multiselect", description: "only allowed value for type is `multiselect`" })
  type!: "multiselect";

  @IsString()
  @DocsProperty({
    description:
      "Unique identifier for the field in format `some-slug`. It is used to access response to this booking field during the booking",
    example: "some-slug",
  })
  slug!: string;

  @IsString()
  @DocsProperty({ example: "Please select multiple options" })
  label!: string;

  @IsBoolean()
  @DocsProperty()
  required!: boolean;

  @IsArray()
  @DocsProperty({ type: [String], example: ["Option 1", "Option 2"] })
  options!: string[];

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if the slug is `language` and the URL contains query parameter `&language=en&language=it`,\
      the 'en' and 'it' will be selected and the select field will be disabled. In case of Booker atom need to pass slug you used for this booking field to defaultFormValues prop with the desired value  e.g. `defaultFormValues={{language: ['en', 'it']}}`. See guide https://cal.com/docs/platform/guides/booking-field",
  })
  disableOnPrefill?: boolean;

  @IsBoolean()
  @IsOptional()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden?: boolean;
}

export class MultiEmailFieldInput_2024_06_14 {
  @IsIn(inputBookingFieldTypes)
  @DocsProperty({ example: "multiemail", description: "only allowed value for type is `multiemail`" })
  type!: "multiemail";

  @IsString()
  @DocsProperty({
    description:
      "Unique identifier for the field in format `some-slug`. It is used to access response to this booking field during the booking",
    example: "some-slug",
  })
  slug!: string;

  @IsString()
  @DocsProperty({ example: "Please enter multiple emails" })
  label!: string;

  @IsBoolean()
  @DocsProperty()
  required!: boolean;

  @IsString()
  @DocsProperty({ example: "e.g., example@example.com" })
  @IsOptional()
  @DocsProperty()
  placeholder?: string;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if the slug is `consultants` and the URL contains query parameter `&consultants=alice@gmail.com&consultants=bob@gmail.com`,\
      the these emails will be added and none more can be added. In case of Booker atom need to pass slug you used for this booking field to defaultFormValues prop with the desired value  e.g. `defaultFormValues={{consultants: ['alice@gmail.com', 'bob@gmail.com']}}`. See guide https://cal.com/docs/platform/guides/booking-field",
  })
  disableOnPrefill?: boolean;

  @IsBoolean()
  @IsOptional()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden?: boolean;
}

export class CheckboxGroupFieldInput_2024_06_14 {
  @IsIn(inputBookingFieldTypes)
  @DocsProperty({ example: "checkbox", description: "only allowed value for type is `checkbox`" })
  type!: "checkbox";

  @IsString()
  @DocsProperty({
    description:
      "Unique identifier for the field in format `some-slug`. It is used to access response to this booking field during the booking",
    example: "some-slug",
  })
  slug!: string;

  @IsString()
  @DocsProperty({ example: "Select all that apply" })
  label!: string;

  @IsBoolean()
  @DocsProperty()
  required!: boolean;

  @IsArray()
  @DocsProperty({ type: [String], example: ["Checkbox 1", "Checkbox 2"] })
  options!: string[];

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if the slug is `notify` and the URL contains query parameter `&notify=true`,\
      the checkbox will be selected and the checkbox field will be disabled. In case of Booker atom need to pass slug you used for this booking field to defaultFormValues prop with the desired value  e.g. `defaultFormValues={{notify: true}}`. See guide https://cal.com/docs/platform/guides/booking-field",
  })
  disableOnPrefill?: boolean;

  @IsBoolean()
  @IsOptional()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden?: boolean;
}

export class RadioGroupFieldInput_2024_06_14 {
  @IsIn(inputBookingFieldTypes)
  @DocsProperty({ example: "radio", description: "only allowed value for type is `radio`" })
  type!: "radio";

  @IsString()
  @DocsProperty({
    description:
      "Unique identifier for the field in format `some-slug`. It is used to access response to this booking field during the booking",
    example: "some-slug",
  })
  slug!: string;

  @IsString()
  @DocsProperty({ example: "Select one option" })
  label!: string;

  @IsBoolean()
  @DocsProperty()
  required!: boolean;

  @IsArray()
  @DocsProperty({ type: [String], example: ["Radio 1", "Radio 2"] })
  options!: string[];

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if the slug is `language` and options of this select field are ['english', 'italian'] and the URL contains query parameter `&language=italian`,\
      the 'italian' radio button will be selected and the select field will be disabled. In case of Booker atom need to pass slug you used for this booking field to defaultFormValues prop with the desired value  e.g. `defaultFormValues={{language: 'italian'}}`. See guide https://cal.com/docs/platform/guides/booking-field",
  })
  disableOnPrefill?: boolean;

  @IsBoolean()
  @IsOptional()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden?: boolean;
}

export class BooleanFieldInput_2024_06_14 {
  @IsIn(inputBookingFieldTypes)
  @DocsProperty({ example: "boolean", description: "only allowed value for type is `boolean`" })
  type!: "boolean";

  @IsString()
  @DocsProperty({
    description:
      "Unique identifier for the field in format `some-slug`. It is used to access response to this booking field during the booking",
    example: "some-slug",
  })
  slug!: string;

  @IsString()
  @DocsProperty({ example: "Agree to terms?" })
  label!: string;

  @IsBoolean()
  @DocsProperty()
  required!: boolean;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if the slug is `notify` and the URL contains query parameter `&notify=true`,\
      the checkbox will be selected and the checkbox field will be disabled. In case of Booker atom need to pass slug you used for this booking field to defaultFormValues prop with the desired value  e.g. `defaultFormValues={{notify: true}}`. See guide https://cal.com/docs/platform/guides/booking-field",
  })
  disableOnPrefill?: boolean;

  @IsBoolean()
  @IsOptional()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden?: boolean;
}

type InputDefaultField_2024_06_14 =
  | NameDefaultFieldInput_2024_06_14
  | SplitNameDefaultFieldInput_2024_06_14
  | EmailDefaultFieldInput_2024_06_14
  | TitleDefaultFieldInput_2024_06_14
  | LocationDefaultFieldInput_2024_06_14
  | NotesDefaultFieldInput_2024_06_14
  | GuestsDefaultFieldInput_2024_06_14
  | RescheduleReasonDefaultFieldInput_2024_06_14;

export type InputBookingField_2024_06_14 =
  | InputDefaultField_2024_06_14
  | PhoneFieldInput_2024_06_14
  | AddressFieldInput_2024_06_14
  | TextFieldInput_2024_06_14
  | NumberFieldInput_2024_06_14
  | TextAreaFieldInput_2024_06_14
  | SelectFieldInput_2024_06_14
  | MultiSelectFieldInput_2024_06_14
  | MultiEmailFieldInput_2024_06_14
  | CheckboxGroupFieldInput_2024_06_14
  | RadioGroupFieldInput_2024_06_14
  | BooleanFieldInput_2024_06_14
  | UrlFieldInput_2024_06_14;

@ValidatorConstraint({ async: true })
class InputBookingFieldValidator_2024_06_14 implements ValidatorConstraintInterface {
  private classMap: { [key: string]: new () => InputBookingField_2024_06_14 } = {
    name: NameDefaultFieldInput_2024_06_14,
    splitName: SplitNameDefaultFieldInput_2024_06_14,
    email: EmailDefaultFieldInput_2024_06_14,
    title: TitleDefaultFieldInput_2024_06_14,
    location: LocationDefaultFieldInput_2024_06_14,
    notes: NotesDefaultFieldInput_2024_06_14,
    guests: GuestsDefaultFieldInput_2024_06_14,
    rescheduleReason: RescheduleReasonDefaultFieldInput_2024_06_14,
    phone: PhoneFieldInput_2024_06_14,
    address: AddressFieldInput_2024_06_14,
    text: TextFieldInput_2024_06_14,
    number: NumberFieldInput_2024_06_14,
    textarea: TextAreaFieldInput_2024_06_14,
    select: SelectFieldInput_2024_06_14,
    multiselect: MultiSelectFieldInput_2024_06_14,
    multiemail: MultiEmailFieldInput_2024_06_14,
    checkbox: CheckboxGroupFieldInput_2024_06_14,
    radio: RadioGroupFieldInput_2024_06_14,
    boolean: BooleanFieldInput_2024_06_14,
    url: UrlFieldInput_2024_06_14,
  };

  async validate(bookingFields: { type: string; slug: string }[]) {
    if (!Array.isArray(bookingFields)) {
      throw new BadRequestException(`'bookingFields' must be an array.`);
    }

    if (!bookingFields.length) {
      throw new BadRequestException(`'bookingFields' must contain at least 1 booking field.`);
    }

    const slugs: string[] = [];
    for (const field of bookingFields) {
      const { type, slug } = field;
      const fieldNeedsType =
        slug !== "title" &&
        slug !== "notes" &&
        slug !== "guests" &&
        slug !== "rescheduleReason" &&
        slug !== "location";

      if (fieldNeedsType && !type) {
        throw new BadRequestException(
          `All booking fields except ones with slug equal to title, notes, guests, rescheduleReason and location must have a 'type' property.`
        );
      }

      const fieldNeedsSlug = type !== "name" && type !== "splitName" && type !== "email";
      if (fieldNeedsSlug && !slug) {
        throw new BadRequestException(
          `Each booking field except ones with type equal to name, splitName, email must have a 'slug' property.`
        );
      }

      if (slugs.includes(slug)) {
        throw new BadRequestException(
          `Duplicate bookingFields slug '${slug}' found. All bookingFields slugs must be unique.`
        );
      }
      if (fieldNeedsSlug) {
        slugs.push(slug);
      }

      const ClassType = fieldNeedsType ? this.classMap[type] : this.classMap[slug];
      if (!ClassType) {
        throw new BadRequestException(
          fieldNeedsType
            ? `Unsupported booking field type '${type}'.`
            : `Unsupported booking field slug '${slug}'.`
        );
      }

      const instance = plainToInstance(ClassType, field);
      const errors = await validate(instance);
      if (errors.length > 0) {
        const message = errors.flatMap((error) => Object.values(error.constraints || {})).join(", ");
        throw new BadRequestException(`Validation failed for ${type || slug} booking field: ${message}`);
      }
    }

    return true;
  }

  defaultMessage() {
    return `Validation failed for one or more booking fields.`;
  }
}

export function ValidateInputBookingFields_2024_06_14(validationOptions?: ValidationOptions) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (object: any, propertyName: string) {
    registerDecorator({
      name: "ValidateInputBookingFields",
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: new InputBookingFieldValidator_2024_06_14(),
    });
  };
}
