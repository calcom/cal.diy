import {
  BookerLayoutsInputEnum_2024_06_14,
  BookerLayoutsOutputEnum_2024_06_14,
  ConfirmationPolicyEnum,
  NoticeThresholdUnitEnum,
} from "@calcom/platform-enums";
import type {
  TransformBookingLimitsSchema_2024_06_14,
  TransformFutureBookingsLimitSchema_2024_06_14,
  BookerLayoutsTransformedSchema,
  EventTypeColorsTransformedSchema,
  TransformRecurringEventSchema_2024_06_14,
  SeatOptionsTransformedSchema,
  SeatOptionsDisabledSchema,
  OutputAddressLocation_2024_06_14,
  OutputAttendeeAddressLocation_2024_06_14,
  OutputOrganizersDefaultAppLocation_2024_06_14,
  OutputAttendeeDefinedLocation_2024_06_14,
  OutputAttendeePhoneLocation_2024_06_14,
  OutputIntegrationLocation_2024_06_14,
  OutputLinkLocation_2024_06_14,
  OutputPhoneLocation_2024_06_14,
  OutputUnknownLocation_2024_06_14,
} from "@calcom/platform-types";

import {
  transformLocationsInternalToApi,
  transformBookingFieldsInternalToApi,
  transformIntervalLimitsInternalToApi,
  transformFutureBookingLimitsInternalToApi,
  transformRecurrenceInternalToApi,
  transformBookerLayoutsInternalToApi,
  transformRequiresConfirmationInternalToApi,
  transformEventTypeColorsInternalToApi,
  transformSeatsInternalToApi,
} from ".";
import {
  BookingFieldSchema,
  systemBeforeFieldEmail,
  systemBeforeFieldName,
  type CustomField,
  type SystemField,
} from "./booking-fields";

describe("transformLocationsInternalToApi", () => {
  it("should reverse transform address location", () => {
    const transformedLocation = [
      {
        type: "inPerson" as const,
        address: "1234 Main St",
        displayLocationPublicly: true,
      },
    ];

    const expectedOutput: OutputAddressLocation_2024_06_14[] = [
      {
        type: "address",
        address: "1234 Main St",
        public: true,
      },
    ];

    const result = transformLocationsInternalToApi(transformedLocation);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform link location", () => {
    const transformedLocation = [
      {
        type: "link" as const,
        link: "https://example.com",
        displayLocationPublicly: true,
      },
    ];

    const expectedOutput: OutputLinkLocation_2024_06_14[] = [
      {
        type: "link",
        link: "https://example.com",
        public: true,
      },
    ];

    const result = transformLocationsInternalToApi(transformedLocation);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform phone location", () => {
    const transformedLocation = [
      {
        type: "userPhone" as const,
        hostPhoneNumber: "123456789",
        displayLocationPublicly: true,
      },
    ];

    const expectedOutput: OutputPhoneLocation_2024_06_14[] = [
      {
        type: "phone",
        phone: "123456789",
        public: true,
      },
    ];

    const result = transformLocationsInternalToApi(transformedLocation);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform integration location", () => {
    const transformedLocation = [
      {
        type: "integrations:daily" as const,
      },
    ];

    const expectedOutput: OutputIntegrationLocation_2024_06_14[] = [
      {
        type: "integration",
        integration: "cal-video",
      },
    ];

    const result = transformLocationsInternalToApi(transformedLocation);

    expect(result).toEqual(expectedOutput);
  });

  it("should transform integration location", () => {
    const transformedLocation = [
      {
        type: "integrations:discord_video" as const,
      },
    ];

    const expectedOutput: OutputIntegrationLocation_2024_06_14[] = [
      {
        type: "integration",
        integration: "discord-video",
      },
    ];

    const result = transformLocationsInternalToApi(transformedLocation);

    expect(result).toEqual(expectedOutput);
  });

  it("should transform integration location with link and credentialId", () => {
    const transformedLocation = [
      {
        type: "integrations:discord_video" as const,
        link: "https://discord.com/users/100",
        credentialId: 100,
      },
    ];

    const expectedOutput: OutputIntegrationLocation_2024_06_14[] = [
      {
        type: "integration",
        integration: "discord-video",
        link: "https://discord.com/users/100",
        credentialId: 100,
      },
    ];

    const result = transformLocationsInternalToApi(transformedLocation);

    expect(result).toEqual(expectedOutput);
  });

  it("should transform unknown location", () => {
    const transformedLocation = [
      {
        type: "unknown" as const,
        location: "unknown location",
      },
    ];

    const expectedOutput: OutputUnknownLocation_2024_06_14[] = [
      {
        type: "unknown",
        location: JSON.stringify(transformedLocation[0]),
      },
    ];

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const result = transformLocationsInternalToApi(transformedLocation);

    expect(result).toEqual(expectedOutput);
  });

  it("should transform unknown integration location", () => {
    const transformedLocation = [
      {
        type: "integrations:unknown_video" as const,
      },
    ];

    const expectedOutput: OutputUnknownLocation_2024_06_14[] = [
      {
        type: "unknown",
        location: JSON.stringify(transformedLocation[0]),
      },
    ];

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const result = transformLocationsInternalToApi(transformedLocation);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform attendee address location", () => {
    const transformedLocation = [
      {
        type: "attendeeInPerson" as const,
      },
    ];

    const expectedOutput: OutputAttendeeAddressLocation_2024_06_14[] = [
      {
        type: "attendeeAddress",
      },
    ];

    const result = transformLocationsInternalToApi(transformedLocation);
    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform organizersDefaultApp locations", () => {
    const transformedLocation = [
      {
        type: "conferencing" as const,
      },
    ];

    const expectedOutput: OutputOrganizersDefaultAppLocation_2024_06_14[] = [
      {
        type: "organizersDefaultApp",
      },
    ];

    const result = transformLocationsInternalToApi(transformedLocation);
    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform attendee phone location", () => {
    const transformedLocation = [
      {
        type: "phone" as const,
      },
    ];

    const expectedOutput: OutputAttendeePhoneLocation_2024_06_14[] = [
      {
        type: "attendeePhone",
      },
    ];

    const result = transformLocationsInternalToApi(transformedLocation);
    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform attendee defined location", () => {
    const transformedLocation = [
      {
        type: "somewhereElse" as const,
      },
    ];

    const expectedOutput: OutputAttendeeDefinedLocation_2024_06_14[] = [
      {
        type: "attendeeDefined",
      },
    ];

    const result = transformLocationsInternalToApi(transformedLocation);
    expect(result).toEqual(expectedOutput);
  });
});

describe("transformBookingFieldsInternalToApi", () => {
  it("should reverse transform not modified name default field", () => {
    const transformedField: SystemField[] = [systemBeforeFieldName];

    const expectedOutput = [
      {
        type: "name",
        slug: "name",
        isDefault: true,
        required: true,
        disableOnPrefill: false,
        label: "your_name",
        placeholder: undefined,
      },
    ];

    const result = transformBookingFieldsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform modified name default field", () => {
    const nameField = {
      ...systemBeforeFieldName,
      placeholder: "custom placeholder",
      disableOnPrefill: true,
      label: "custom label",
      variantsConfig: {
        variants: {
          fullName: {
            fields: [
              {
                name: "fullName" as const,
                label: "custom label",
                placeholder: "custom placeholder",
                type: "text" as const,
                required: true as const,
              },
            ],
          },
        },
      },
    };

    const transformedField: SystemField[] = [nameField];

    const expectedOutput = [
      {
        type: "name",
        slug: "name",
        isDefault: true,
        required: true,
        placeholder: "custom placeholder",
        disableOnPrefill: true,
        label: "custom label",
      },
    ];

    const result = transformBookingFieldsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform not modified email default field", () => {
    const transformedField: SystemField[] = [systemBeforeFieldEmail];

    const expectedOutput = [
      {
        type: "email",
        slug: "email",
        isDefault: true,
        required: true,
        disableOnPrefill: false,
        label: undefined,
        placeholder: undefined,
        hidden: false,
      },
    ];

    const result = transformBookingFieldsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform modified email default field", () => {
    const transformedField: SystemField[] = [
      {
        ...systemBeforeFieldEmail,
        placeholder: "custom placeholder",
        disableOnPrefill: true,
        label: "custom label",
      },
    ];

    const expectedOutput = [
      {
        type: "email",
        slug: "email",
        isDefault: true,
        required: true,
        placeholder: "custom placeholder",
        disableOnPrefill: true,
        label: "custom label",
        hidden: false,
      },
    ];

    const result = transformBookingFieldsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform phone field", () => {
    const transformedField: CustomField[] = [
      {
        name: "your-phone",
        type: "phone",
        label: "Your phone number",
        sources: [
          {
            id: "user",
            type: "user",
            label: "User",
            fieldRequired: true,
          },
        ],
        editable: "user",
        required: true,
        placeholder: "123456789",
      },
    ];

    const expectedOutput = [
      {
        isDefault: false,
        type: "phone",
        slug: "your-phone",
        label: "Your phone number",
        required: true,
        placeholder: "123456789",
        hidden: false,
        disableOnPrefill: false,
      },
    ];

    const result = transformBookingFieldsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform address field", () => {
    const transformedField: CustomField[] = [
      {
        name: "your-address",
        type: "address",
        label: "Your address",
        sources: [
          {
            id: "user",
            type: "user",
            label: "User",
            fieldRequired: true,
          },
        ],
        editable: "user",
        required: true,
        placeholder: "1234 Main St",
      },
    ];

    const expectedOutput = [
      {
        isDefault: false,
        type: "address",
        slug: "your-address",
        label: "Your address",
        required: true,
        placeholder: "1234 Main St",
        hidden: false,
        disableOnPrefill: false,
      },
    ];

    const result = transformBookingFieldsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform text field", () => {
    const transformedField: CustomField[] = [
      {
        name: "your-text",
        type: "text",
        label: "Your text",
        sources: [
          {
            id: "user",
            type: "user",
            label: "User",
            fieldRequired: true,
          },
        ],
        editable: "user",
        required: true,
        placeholder: "Enter your text",
      },
    ];

    const expectedOutput = [
      {
        isDefault: false,
        type: "text",
        slug: "your-text",
        label: "Your text",
        required: true,
        placeholder: "Enter your text",
        hidden: false,
        disableOnPrefill: false,
      },
    ];

    const result = transformBookingFieldsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform number field", () => {
    const transformedField: CustomField[] = [
      {
        name: "your-number",
        type: "number",
        label: "Your number",
        sources: [
          {
            id: "user",
            type: "user",
            label: "User",
            fieldRequired: true,
          },
        ],
        editable: "user",
        required: true,
        placeholder: "100",
      },
    ];

    const expectedOutput = [
      {
        isDefault: false,
        type: "number",
        slug: "your-number",
        label: "Your number",
        required: true,
        placeholder: "100",
        hidden: false,
        disableOnPrefill: false,
      },
    ];

    const result = transformBookingFieldsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform textarea field", () => {
    const transformedField: CustomField[] = [
      {
        name: "your-textarea",
        type: "textarea",
        label: "Your detailed information",
        sources: [
          {
            id: "user",
            type: "user",
            label: "User",
            fieldRequired: true,
          },
        ],
        editable: "user",
        required: true,
        placeholder: "Detailed description here...",
        hidden: false,
        disableOnPrefill: false,
      },
    ];

    const expectedOutput = [
      {
        isDefault: false,
        type: "textarea",
        slug: "your-textarea",
        label: "Your detailed information",
        required: true,
        placeholder: "Detailed description here...",
        hidden: false,
        disableOnPrefill: false,
      },
    ];

    const result = transformBookingFieldsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform select field", () => {
    const transformedField: CustomField[] = [
      {
        name: "your-select",
        type: "select",
        label: "Your selection",
        sources: [
          {
            id: "user",
            type: "user",
            label: "User",
            fieldRequired: true,
          },
        ],
        editable: "user",
        required: true,
        placeholder: "Select...",
        options: [
          { label: "Option 1", value: "Option 1" },
          { label: "Option 2", value: "Option 2" },
        ],
      },
    ];

    const expectedOutput = [
      {
        isDefault: false,
        type: "select",
        slug: "your-select",
        label: "Your selection",
        required: true,
        placeholder: "Select...",
        options: ["Option 1", "Option 2"],
        hidden: false,
        disableOnPrefill: false,
      },
    ];

    const result = transformBookingFieldsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform multiselect field", () => {
    const transformedField: CustomField[] = [
      {
        name: "your-multiselect",
        type: "multiselect",
        label: "Your multiple selections",
        sources: [
          {
            id: "user",
            type: "user",
            label: "User",
            fieldRequired: true,
          },
        ],
        editable: "user",
        required: true,
        options: [
          { label: "Option 1", value: "Option 1" },
          { label: "Option 2", value: "Option 2" },
        ],
      },
    ];

    const expectedOutput = [
      {
        isDefault: false,
        type: "multiselect",
        slug: "your-multiselect",
        label: "Your multiple selections",
        required: true,
        options: ["Option 1", "Option 2"],
        hidden: false,
        disableOnPrefill: false,
      },
    ];

    const result = transformBookingFieldsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform multiemail field", () => {
    const transformedField: CustomField[] = [
      {
        name: "your-multiemail",
        type: "multiemail",
        label: "Your multiple emails",
        sources: [
          {
            id: "user",
            type: "user",
            label: "User",
            fieldRequired: true,
          },
        ],
        editable: "user",
        required: true,
        placeholder: "example@example.com",
        hidden: false,
        disableOnPrefill: false,
      },
    ];

    const expectedOutput = [
      {
        isDefault: false,
        type: "multiemail",
        slug: "your-multiemail",
        label: "Your multiple emails",
        required: true,
        placeholder: "example@example.com",
        hidden: false,
        disableOnPrefill: false,
      },
    ];

    const result = transformBookingFieldsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform checkbox field", () => {
    const transformedField: CustomField[] = [
      {
        name: "your-checkbox",
        type: "checkbox",
        label: "Your checkboxes",
        sources: [
          {
            id: "user",
            type: "user",
            label: "User",
            fieldRequired: true,
          },
        ],
        editable: "user",
        required: true,
        options: [
          { label: "Checkbox 1", value: "Checkbox 1" },
          { label: "Checkbox 2", value: "Checkbox 2" },
        ],
      },
    ];

    const expectedOutput = [
      {
        isDefault: false,
        type: "checkbox",
        slug: "your-checkbox",
        label: "Your checkboxes",
        required: true,
        options: ["Checkbox 1", "Checkbox 2"],
        hidden: false,
        disableOnPrefill: false,
      },
    ];

    const result = transformBookingFieldsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform radio field", () => {
    const transformedField: CustomField[] = [
      {
        name: "your-radio",
        type: "radio",
        label: "Your radio buttons",
        sources: [
          {
            id: "user",
            type: "user",
            label: "User",
            fieldRequired: true,
          },
        ],
        editable: "user",
        required: true,
        options: [
          { label: "Radio 1", value: "Radio 1" },
          { label: "Radio 2", value: "Radio 2" },
        ],
      },
    ];

    const expectedOutput = [
      {
        isDefault: false,
        type: "radio",
        slug: "your-radio",
        label: "Your radio buttons",
        required: true,
        options: ["Radio 1", "Radio 2"],
        hidden: false,
        disableOnPrefill: false,
      },
    ];

    const result = transformBookingFieldsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform boolean field", () => {
    const transformedField: CustomField[] = [
      {
        name: "agree-to-terms",
        type: "boolean",
        label: "Agree to terms?",
        sources: [
          {
            id: "user",
            type: "user",
            label: "User",
            fieldRequired: true,
          },
        ],
        editable: "user",
        required: true,
      },
    ];

    const expectedOutput = [
      {
        isDefault: false,
        type: "boolean",
        slug: "agree-to-terms",
        label: "Agree to terms?",
        required: true,
        hidden: false,
        disableOnPrefill: false,
      },
    ];

    const result = transformBookingFieldsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });

  it("should transform system phone field", () => {
    const transformedField: SystemField[] = [
      {
        name: "attendeePhoneNumber",
        type: "phone",
        hidden: true,
        sources: [
          {
            id: "default",
            type: "default",
            label: "Default",
          },
        ],
        editable: "system-but-optional",
        required: false,
        defaultLabel: "phone_number",
      },
    ];

    const expectedOutput = [
      {
        isDefault: true,
        type: "phone",
        slug: "attendeePhoneNumber",
        required: false,
        hidden: true,
        disableOnPrefill: false,
        label: undefined,
        placeholder: undefined,
      },
    ];

    const result = transformBookingFieldsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });

  it("should transform unknown field", () => {
    const transformedField = [
      {
        name: "blabla",
        type: "blabla",
        hidden: true,
        sources: [
          {
            id: "default",
            type: "default",
            label: "Default",
          },
        ],
        editable: "system-but-optional",
        required: false,
        defaultLabel: "phone_number",
      },
    ];

    const expectedOutput = [
      {
        type: "unknown",
        slug: "unknown",
        bookingField: JSON.stringify(transformedField[0]),
      },
    ];

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const result = transformBookingFieldsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform a custom email field instead of returning unknown", () => {
    // Mirrors OutputEventTypesService.transformBookingFields: a custom email field
    // stored by the form builder is first validated, then transformed.
    const databaseField = {
      name: "custom-email",
      type: "email",
      label: "Your work email",
      sources: [{ id: "user", type: "user", label: "User", fieldRequired: false }],
      editable: "user",
      required: false,
      placeholder: "you@company.com",
      hidden: true,
      disableOnPrefill: false,
    };

    const parsed = BookingFieldSchema.safeParse(databaseField);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const result = transformBookingFieldsInternalToApi([parsed.data]);

    expect(result).toEqual([
      {
        isDefault: false,
        type: "email",
        slug: "custom-email",
        label: "Your work email",
        required: false,
        placeholder: "you@company.com",
        hidden: true,
        disableOnPrefill: false,
      },
    ]);
  });

  it("should reverse transform email field", () => {
    const transformedField: CustomField[] = [
      {
        name: "your-email",
        type: "email",
        label: "Your email",
        sources: [
          {
            id: "user",
            type: "user",
            label: "User",
            fieldRequired: true,
          },
        ],
        editable: "user",
        required: true,
        placeholder: "you@example.com",
      },
    ];

    const expectedOutput = [
      {
        isDefault: false,
        type: "email",
        slug: "your-email",
        label: "Your email",
        required: true,
        placeholder: "you@example.com",
        hidden: false,
        disableOnPrefill: false,
      },
    ];

    const result = transformBookingFieldsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });
});

describe("transformIntervalLimitsInternalToApi", () => {
  it("should reverse transform booking limits count or booking limits duration", () => {
    const transformedField: TransformBookingLimitsSchema_2024_06_14 = {
      PER_DAY: 2,
      PER_WEEK: 11,
      PER_MONTH: 22,
      PER_YEAR: 33,
    };

    const expectedOutput = {
      day: 2,
      week: 11,
      month: 22,
      year: 33,
    };
    const result = transformIntervalLimitsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });
});

describe("transformFutureBookingLimitsInternalToApi", () => {
  it("should reverse transform range type", () => {
    const transformedField: TransformFutureBookingsLimitSchema_2024_06_14 = {
      periodType: "RANGE",
      periodStartDate: new Date("2024-08-06T09:14:30.000Z"),
      periodEndDate: new Date("2024-08-28T18:30:00.000Z"),
    };
    const expectedOutput = {
      type: "range",
      value: ["2024-08-06", "2024-08-28"],
    };

    const result = transformFutureBookingLimitsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });
  it("should reverse transform calendar days", () => {
    const transformedField: TransformFutureBookingsLimitSchema_2024_06_14 = {
      periodType: "ROLLING",
      periodDays: 30,
      periodCountCalendarDays: true,
    };
    const expectedOutput = {
      type: "calendarDays",
      value: 30,
      rolling: false,
    };

    const result = transformFutureBookingLimitsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });
  it("should reverse transform calendar days rolling-window", () => {
    const transformedField: TransformFutureBookingsLimitSchema_2024_06_14 = {
      periodType: "ROLLING_WINDOW",
      periodDays: 30,
      periodCountCalendarDays: true,
    };

    const expectedOutput = {
      type: "calendarDays",
      value: 30,
      rolling: true,
    };

    const result = transformFutureBookingLimitsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });
  it("should reverse transform Business days", () => {
    const transformedField: TransformFutureBookingsLimitSchema_2024_06_14 = {
      periodType: "ROLLING",
      periodDays: 30,
      periodCountCalendarDays: false,
    };

    const expectedOutput = {
      type: "businessDays",
      value: 30,
      rolling: false,
    };

    const result = transformFutureBookingLimitsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });
  it("should reverse transform Business days rolling-window", () => {
    const transformedField: TransformFutureBookingsLimitSchema_2024_06_14 = {
      periodType: "ROLLING_WINDOW",
      periodDays: 30,
      periodCountCalendarDays: false,
    };

    const expectedOutput = {
      type: "businessDays",
      value: 30,
      rolling: true,
    };

    const result = transformFutureBookingLimitsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform disabled", () => {
    const transformedField: TransformFutureBookingsLimitSchema_2024_06_14 = {
      periodType: "UNLIMITED",
    };

    const expectedOutput = {
      disabled: true,
    };

    const result = transformFutureBookingLimitsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });
});

describe("transformBookerLayoutsInternalToApi", () => {
  it("should reverse transform booker layout", () => {
    const transformedField: BookerLayoutsTransformedSchema = {
      enabledLayouts: [
        BookerLayoutsOutputEnum_2024_06_14.column_view,
        BookerLayoutsOutputEnum_2024_06_14.month_view,
        BookerLayoutsOutputEnum_2024_06_14.week_view,
      ],
      defaultLayout: BookerLayoutsOutputEnum_2024_06_14.week_view,
    };

    const expectedOutput = {
      enabledLayouts: [
        BookerLayoutsInputEnum_2024_06_14.column,
        BookerLayoutsInputEnum_2024_06_14.month,
        BookerLayoutsInputEnum_2024_06_14.week,
      ],
      defaultLayout: BookerLayoutsInputEnum_2024_06_14.week,
    };
    const result = transformBookerLayoutsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });
});

describe("transformRequiresConfirmationInternalToApi", () => {
  it("should reverse transform requires confirmation - time", () => {
    const transformedField = {
      requiresConfirmation: true,
      requiresConfirmationThreshold: {
        time: 60,
        unit: NoticeThresholdUnitEnum.MINUTES,
      },
      requiresConfirmationWillBlockSlot: true,
    };

    const expectedOutput = {
      type: ConfirmationPolicyEnum.TIME,
      noticeThreshold: {
        count: 60,
        unit: NoticeThresholdUnitEnum.MINUTES,
      },
      blockUnconfirmedBookingsInBooker: true,
    };
    const result = transformRequiresConfirmationInternalToApi(
      transformedField.requiresConfirmation,
      transformedField.requiresConfirmationWillBlockSlot,
      transformedField.requiresConfirmationThreshold
    );

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform requires confirmation - always", () => {
    const transformedField = {
      requiresConfirmation: true,
      requiresConfirmationWillBlockSlot: true,
    };

    const expectedOutput = {
      type: ConfirmationPolicyEnum.ALWAYS,
      blockUnconfirmedBookingsInBooker: true,
    };
    const result = transformRequiresConfirmationInternalToApi(
      transformedField.requiresConfirmation,
      transformedField.requiresConfirmationWillBlockSlot,
      undefined
    );

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform requires confirmation - disabled", () => {
    const transformedField = {
      requiresConfirmation: false,
    };

    const expectedOutput = {
      disabled: true,
    };
    const result = transformRequiresConfirmationInternalToApi(
      transformedField.requiresConfirmation,
      false,
      undefined
    );

    expect(result).toEqual(expectedOutput);
  });
});

describe("transformEventTypeColorsInternalToApi", () => {
  it("should reverse transform event type colors", () => {
    const transformedField: EventTypeColorsTransformedSchema = {
      darkEventTypeColor: "#292929",
      lightEventTypeColor: "#fafafa",
    };

    const expectedOutput = {
      darkThemeHex: "#292929",
      lightThemeHex: "#fafafa",
    };

    const result = transformEventTypeColorsInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });
});

describe("transformSeatsInternalToApi", () => {
  it("should reverse transform event type seats", () => {
    const transformedSeats: SeatOptionsTransformedSchema = {
      seatsPerTimeSlot: 10,
      seatsShowAttendees: true,
      seatsShowAvailabilityCount: false,
    };

    const expectedOutput = {
      seatsPerTimeSlot: 10,
      showAttendeeInfo: true,
      showAvailabilityCount: false,
    };

    const result = transformSeatsInternalToApi(transformedSeats);

    expect(result).toEqual(expectedOutput);
  });

  it("should reverse transform event type seats - disabled", () => {
    const transformedSeats: SeatOptionsDisabledSchema = {
      seatsPerTimeSlot: null,
    };

    const expectedOutput = {
      disabled: true,
    };

    const result = transformSeatsInternalToApi(transformedSeats);

    expect(result).toEqual(expectedOutput);
  });
});

describe("transformRecurrenceInternalToApi", () => {
  it("should reverse transform recurringEvent", () => {
    const transformedField: TransformRecurringEventSchema_2024_06_14 = {
      interval: 2,
      count: 10,
      freq: 2,
    };

    const expectedOutput = {
      frequency: "weekly",
      interval: 2,
      occurrences: 10,
    };
    const result = transformRecurrenceInternalToApi(transformedField);

    expect(result).toEqual(expectedOutput);
  });
});
