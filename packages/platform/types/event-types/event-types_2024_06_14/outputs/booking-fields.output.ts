import { Logger } from "@nestjs/common";
import {
  ApiProperty,
  ApiProperty as DocsProperty,
  ApiPropertyOptional as DocsPropertyOptional,
} from "@nestjs/swagger";
import { plainToInstance } from "class-transformer";
import { IsBoolean, IsOptional, IsString } from "class-validator";
import type { ValidationOptions, ValidatorConstraintInterface } from "class-validator";
import { registerDecorator, validate, ValidatorConstraint } from "class-validator";

import {
  PhoneFieldInput_2024_06_14,
  AddressFieldInput_2024_06_14,
  TextFieldInput_2024_06_14,
  NumberFieldInput_2024_06_14,
  TextAreaFieldInput_2024_06_14,
  SelectFieldInput_2024_06_14,
  MultiSelectFieldInput_2024_06_14,
  MultiEmailFieldInput_2024_06_14,
  CheckboxGroupFieldInput_2024_06_14,
  RadioGroupFieldInput_2024_06_14,
  BooleanFieldInput_2024_06_14,
  NameDefaultFieldInput_2024_06_14,
  EmailDefaultFieldInput_2024_06_14,
  GuestsDefaultFieldInput_2024_06_14,
  NotesDefaultFieldInput_2024_06_14,
  RescheduleReasonDefaultFieldInput_2024_06_14,
  TitleDefaultFieldInput_2024_06_14,
  SplitNameDefaultFieldInput_2024_06_14,
  UrlFieldInput_2024_06_14,
} from "../inputs";

export class NameDefaultFieldOutput_2024_06_14 extends NameDefaultFieldInput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always true because it's a default field",
    example: true,
    default: true,
  })
  isDefault = true;

  @IsString()
  @DocsProperty({
    default: "name",
  })
  slug!: "name";

  @IsString()
  @DocsProperty({
    default: "name",
  })
  type!: "name";

  @IsBoolean()
  @DocsProperty()
  required!: boolean;
}

export class SplitNameDefaultFieldOutput_2024_06_14 extends SplitNameDefaultFieldInput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always true because it's a default field",
    example: true,
    default: true,
  })
  isDefault = true;

  @IsString()
  @DocsProperty({
    default: "splitName",
  })
  slug!: "splitName";

  @IsString()
  @DocsProperty({
    default: "splitName",
  })
  type!: "splitName";
}

export class EmailDefaultFieldOutput_2024_06_14 extends EmailDefaultFieldInput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always true because it's a default field",
    example: true,
    default: true,
  })
  isDefault = true;

  @IsString()
  @DocsProperty({
    default: "email",
  })
  slug!: "email";

  @IsString()
  @DocsProperty({
    default: "email",
  })
  type!: "email";

  @IsBoolean()
  @DocsProperty()
  required!: boolean;

  @IsBoolean()
  @DocsProperty({
    description: `If true show under event type settings but don't show this booking field in the Booker. If false show in both. Can only be hidden
      for organization team event types when also providing attendee phone number booking field.`,
  })
  hidden!: boolean;
}

export class LocationDefaultFieldOutput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always true because it's a default field",
    example: true,
    default: true,
  })
  isDefault = true;

  @IsString()
  @DocsProperty({
    default: "location",
    description:
      "This booking field is returned only if the event type has more than one location. The purpose of this field is to allow the user to select the location where the event will take place.",
  })
  slug!: "location";

  @IsString()
  @DocsProperty({
    default: "radioInput",
  })
  type!: "radioInput";

  @IsBoolean()
  @DocsProperty()
  required!: boolean;

  @IsBoolean()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden!: boolean;

  @IsString()
  @IsOptional()
  @DocsProperty()
  label?: string;
}

export class RescheduleReasonDefaultFieldOutput_2024_06_14 extends RescheduleReasonDefaultFieldInput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always true because it's a default field",
    example: true,
    default: true,
  })
  isDefault = true;

  @IsString()
  @DocsProperty({
    default: "rescheduleReason",
  })
  slug!: "rescheduleReason";

  @IsString()
  @DocsProperty({
    default: "textarea",
  })
  type!: "textarea";

  @IsBoolean()
  @DocsProperty()
  required!: boolean;

  @IsBoolean()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden!: boolean;

  @IsString()
  @IsOptional()
  @DocsProperty()
  label?: string;

  @IsString()
  @IsOptional()
  @DocsProperty()
  placeholder?: string;

  @IsBoolean()
  @ApiProperty({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if URL contains query parameter `&rescheduleReason=busy`,\
      the reschedule reason field will be prefilled with this value and disabled.",
  })
  disableOnPrefill!: boolean;
}

export class TitleDefaultFieldOutput_2024_06_14 extends TitleDefaultFieldInput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always true because it's a default field",
    example: true,
    default: true,
  })
  isDefault = true;

  @IsString()
  @DocsProperty({
    default: "title",
  })
  slug!: "title";

  @IsString()
  @DocsProperty({
    default: "text",
  })
  type!: "text";

  @IsBoolean()
  @DocsProperty()
  required!: boolean;

  @IsBoolean()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden!: boolean;

  @IsString()
  @IsOptional()
  @DocsProperty()
  label?: string;

  @IsString()
  @IsOptional()
  @DocsProperty()
  placeholder?: string;

  @IsBoolean()
  @ApiProperty({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if URL contains query parameter `&title=masterclass`,\
      the title field will be prefilled with this value and disabled.",
  })
  disableOnPrefill!: boolean;
}

export class NotesDefaultFieldOutput_2024_06_14 extends NotesDefaultFieldInput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always true because it's a default field",
    example: true,
    default: true,
  })
  isDefault = true;

  @IsString()
  @DocsProperty({
    default: "notes",
  })
  slug!: "notes";

  @IsString()
  @DocsProperty({
    default: "textarea",
  })
  type!: "textarea";

  @IsBoolean()
  @DocsProperty()
  required!: boolean;

  @IsBoolean()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden!: boolean;

  @IsString()
  @IsOptional()
  @DocsProperty()
  label?: string;

  @IsString()
  @IsOptional()
  @DocsProperty()
  placeholder?: string;

  @IsBoolean()
  @ApiProperty({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if URL contains query parameter `&notes=hello`,\
      the notes field will be prefilled with this value and disabled.",
  })
  disableOnPrefill!: boolean;
}

export class GuestsDefaultFieldOutput_2024_06_14 extends GuestsDefaultFieldInput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always true because it's a default field",
    example: true,
    default: true,
  })
  isDefault = true;

  @IsString()
  @DocsProperty({
    default: "guests",
  })
  slug!: "guests";

  @IsString()
  @DocsProperty({
    default: "multiemail",
  })
  type!: "multiemail";

  @IsBoolean()
  @DocsProperty()
  required!: boolean;

  @IsBoolean()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden!: boolean;

  @IsString()
  @IsOptional()
  @DocsProperty()
  label?: string;

  @IsString()
  @IsOptional()
  @DocsProperty()
  placeholder?: string;

  @IsBoolean()
  @ApiProperty({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if URL contains query parameter `&guests=lauris@cal.com`,\
      the guests field will be prefilled with this value and disabled.",
  })
  disableOnPrefill!: boolean;
}

export class PhoneDefaultFieldOutput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always true because it's a default field",
    example: true,
    default: true,
  })
  isDefault = true;

  @IsString()
  @DocsProperty({
    default: "attendeePhoneNumber",
  })
  slug!: "attendeePhoneNumber";

  @IsString()
  @DocsProperty({
    default: "phone",
  })
  type!: "phone";

  @IsBoolean()
  @DocsProperty()
  required!: boolean;

  @IsBoolean()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden!: boolean;

  @IsString()
  @IsOptional()
  @DocsProperty()
  label?: string;

  @IsString()
  @IsOptional()
  @DocsProperty()
  placeholder?: string;

  @IsBoolean()
  @ApiProperty({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.\
      For example, if URL contains query parameter `&attendeePhoneNumber=+37122222222`,\
      the guests field will be prefilled with this value and disabled.",
  })
  disableOnPrefill!: boolean;
}

export class PhoneFieldOutput_2024_06_14 extends PhoneFieldInput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always false because it's not default field but custom field",
    example: false,
    default: false,
  })
  isDefault = false;

  @IsBoolean()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden!: boolean;
}

export class AddressFieldOutput_2024_06_14 extends AddressFieldInput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always false because it's not default field but custom field",
    example: false,
    default: false,
  })
  isDefault = false;

  @IsBoolean()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden!: boolean;
}

export class TextFieldOutput_2024_06_14 extends TextFieldInput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always false because it's not default field but custom field",
    example: false,
    default: false,
  })
  isDefault = false;

  @IsBoolean()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden!: boolean;
}

export class UrlFieldOutput_2024_06_14 extends UrlFieldInput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always false because it's not default field but custom field",
    example: false,
    default: false,
  })
  isDefault = false;

  @IsBoolean()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden!: boolean;
}

export class NumberFieldOutput_2024_06_14 extends NumberFieldInput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always false because it's not default field but custom field",
    example: false,
    default: false,
  })
  isDefault = false;

  @IsBoolean()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden!: boolean;
}

export class TextAreaFieldOutput_2024_06_14 extends TextAreaFieldInput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always false because it's not default field but custom field",
    example: false,
    default: false,
  })
  isDefault = false;

  @IsBoolean()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden!: boolean;
}

export class SelectFieldOutput_2024_06_14 extends SelectFieldInput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always false because it's not default field but custom field",
    example: false,
    default: false,
  })
  isDefault = false;

  @IsBoolean()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden!: boolean;
}

export class MultiSelectFieldOutput_2024_06_14 extends MultiSelectFieldInput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always false because it's not default field but custom field",
    example: false,
    default: false,
  })
  isDefault = false;

  @IsBoolean()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden!: boolean;
}

export class MultiEmailFieldOutput_2024_06_14 extends MultiEmailFieldInput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always false because it's not default field but custom field",
    example: false,
    default: false,
  })
  isDefault = false;

  @IsBoolean()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden!: boolean;
}

export class EmailFieldOutput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always false because it's not default field but custom field",
    example: false,
    default: false,
  })
  isDefault = false;

  @IsString()
  @DocsProperty({ example: "email", description: "only allowed value for type is `email`" })
  type!: "email";

  @IsString()
  @DocsProperty({
    description:
      "Unique identifier for the field in format `some-slug`. It is used to access response to this booking field during the booking",
    example: "some-slug",
  })
  slug!: string;

  @IsString()
  @DocsProperty({ example: "Please enter your email" })
  label!: string;

  @IsBoolean()
  @DocsProperty()
  required!: boolean;

  @IsString()
  @IsOptional()
  @DocsProperty({ example: "e.g., example@example.com" })
  placeholder?: string;

  @IsBoolean()
  @IsOptional()
  @DocsPropertyOptional({
    type: Boolean,
    description:
      "Disable this booking field if the URL contains query parameter with key equal to the slug and prefill it with the provided value.",
  })
  disableOnPrefill?: boolean;

  @IsBoolean()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden!: boolean;
}

export class CheckboxGroupFieldOutput_2024_06_14 extends CheckboxGroupFieldInput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always false because it's not default field but custom field",
    example: false,
    default: false,
  })
  isDefault = false;

  @IsBoolean()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden!: boolean;
}

export class RadioGroupFieldOutput_2024_06_14 extends RadioGroupFieldInput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always false because it's not default field but custom field",
    example: false,
    default: false,
  })
  isDefault = false;

  @IsBoolean()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden!: boolean;
}

export class BooleanFieldOutput_2024_06_14 extends BooleanFieldInput_2024_06_14 {
  @IsBoolean()
  @DocsProperty({
    description: "This property is always false because it's not default field but custom field",
    example: false,
    default: false,
  })
  isDefault = false;

  @IsBoolean()
  @DocsProperty({
    description:
      "If true show under event type settings but don't show this booking field in the Booker. If false show in both.",
  })
  hidden!: boolean;
}

export class OutputUnknownBookingField_2024_06_14 {
  @DocsProperty({ example: "unknown", description: "only allowed value for type is `unknown`" })
  type!: "unknown";

  @DocsProperty({ example: "unknown", description: "only allowed value for type is `unknown`" })
  slug!: "unknown";

  @IsString()
  bookingField!: string;
}

export type DefaultFieldOutput_2024_06_14 =
  | NameDefaultFieldOutput_2024_06_14
  | SplitNameDefaultFieldOutput_2024_06_14
  | EmailDefaultFieldOutput_2024_06_14
  | LocationDefaultFieldOutput_2024_06_14
  | RescheduleReasonDefaultFieldOutput_2024_06_14
  | TitleDefaultFieldOutput_2024_06_14
  | NotesDefaultFieldOutput_2024_06_14
  | GuestsDefaultFieldOutput_2024_06_14
  | PhoneDefaultFieldOutput_2024_06_14;

export type CustomFieldOutput_2024_06_14 =
  | PhoneFieldOutput_2024_06_14
  | AddressFieldOutput_2024_06_14
  | TextFieldOutput_2024_06_14
  | NumberFieldOutput_2024_06_14
  | TextAreaFieldOutput_2024_06_14
  | SelectFieldOutput_2024_06_14
  | MultiSelectFieldOutput_2024_06_14
  | MultiEmailFieldOutput_2024_06_14
  | EmailFieldOutput_2024_06_14
  | CheckboxGroupFieldOutput_2024_06_14
  | RadioGroupFieldOutput_2024_06_14
  | BooleanFieldOutput_2024_06_14
  | UrlFieldOutput_2024_06_14;

export type KnownBookingField_2024_06_14 = DefaultFieldOutput_2024_06_14 | CustomFieldOutput_2024_06_14;

export type OutputBookingField_2024_06_14 =
  | DefaultFieldOutput_2024_06_14
  | CustomFieldOutput_2024_06_14
  | OutputUnknownBookingField_2024_06_14;

@ValidatorConstraint({ async: true })
class OutputBookingFieldValidator_2024_06_14 implements ValidatorConstraintInterface {
  private readonly logger = new Logger("OutputBookingFieldValidator_2024_06_14");

  private defaultOutputNameMap: { [key: string]: new () => DefaultFieldOutput_2024_06_14 } = {
    name: NameDefaultFieldOutput_2024_06_14,
    splitName: SplitNameDefaultFieldOutput_2024_06_14,
    email: EmailDefaultFieldOutput_2024_06_14,
    location: LocationDefaultFieldOutput_2024_06_14,
    rescheduleReason: RescheduleReasonDefaultFieldOutput_2024_06_14,
    title: TitleDefaultFieldOutput_2024_06_14,
    notes: NotesDefaultFieldOutput_2024_06_14,
    guests: GuestsDefaultFieldOutput_2024_06_14,
    attendeePhoneNumber: PhoneDefaultFieldOutput_2024_06_14,
  };

  private customOutputTypeMap: { [key: string]: new () => CustomFieldOutput_2024_06_14 } = {
    phone: PhoneFieldOutput_2024_06_14,
    address: AddressFieldOutput_2024_06_14,
    text: TextFieldOutput_2024_06_14,
    number: NumberFieldOutput_2024_06_14,
    textarea: TextAreaFieldOutput_2024_06_14,
    select: SelectFieldOutput_2024_06_14,
    multiselect: MultiSelectFieldOutput_2024_06_14,
    multiemail: MultiEmailFieldOutput_2024_06_14,
    email: EmailFieldOutput_2024_06_14,
    checkbox: CheckboxGroupFieldOutput_2024_06_14,
    radio: RadioGroupFieldOutput_2024_06_14,
    boolean: BooleanFieldOutput_2024_06_14,
    url: UrlFieldOutput_2024_06_14,
  };

  async validate(bookingFields: OutputBookingField_2024_06_14[]) {
    for (const field of bookingFields) {
      if (this.isUnknownField(field)) {
        await this.validateUnknownField(field);
      } else if (this.isDefaultField(field)) {
        await this.validateDefaultField(field);
      } else {
        await this.validateCustomField(field);
      }
    }

    return true;
  }

  isDefaultField(field: OutputBookingField_2024_06_14): field is DefaultFieldOutput_2024_06_14 {
    return field.type !== "unknown" && "isDefault" in field && field.isDefault === true;
  }

  isUnknownField(field: OutputBookingField_2024_06_14): field is OutputUnknownBookingField_2024_06_14 {
    return field.type === "unknown";
  }

  async validateUnknownField(field: OutputUnknownBookingField_2024_06_14) {
    const instance = plainToInstance(OutputUnknownBookingField_2024_06_14, field);
    const errors = await validate(instance);
    if (errors.length > 0) {
      const message = errors.flatMap((error) => Object.values(error.constraints || {})).join(", ");
      this.logger.error(
        `OutputBookingFieldValidator_2024_06_14: Validation failed for unknown booking field: ${message}`
      );
    }
  }

  async validateDefaultField(field: DefaultFieldOutput_2024_06_14) {
    const ClassType = this.defaultOutputNameMap[field.slug];
    if (!ClassType) {
      this.logger.error(
        `OutputBookingFieldValidator_2024_06_14: Unsupported default booking field slug '${field.slug}'.`
      );
    }

    const instance = plainToInstance(ClassType, field);
    const errors = await validate(instance);
    if (errors.length > 0) {
      const message = errors.flatMap((error) => Object.values(error.constraints || {})).join(", ");
      this.logger.error(
        `OutputBookingFieldValidator_2024_06_14: Validation failed for ${field.slug} booking field: ${message}`
      );
    }
  }

  async validateCustomField(field: CustomFieldOutput_2024_06_14) {
    const ClassType = this.customOutputTypeMap[field.type];
    if (!ClassType) {
      this.logger.error(
        `OutputBookingFieldValidator_2024_06_14: Unsupported custom booking field type '${field.type}'.`
      );
    }

    const instance = plainToInstance(ClassType, field);
    const errors = await validate(instance);
    if (errors.length > 0) {
      const message = errors.flatMap((error) => Object.values(error.constraints || {})).join(", ");
      this.logger.error(
        `OutputBookingFieldValidator_2024_06_14: Validation failed for ${field.type} booking field: ${message}`
      );
    }
  }

  defaultMessage() {
    return `Validation failed for one or more booking fields.`;
  }
}

export function ValidateOutputBookingFields_2024_06_14(validationOptions?: ValidationOptions) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (object: any, propertyName: string) {
    registerDecorator({
      name: "ValidateOutputBookingFields",
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: new OutputBookingFieldValidator_2024_06_14(),
    });
  };
}
