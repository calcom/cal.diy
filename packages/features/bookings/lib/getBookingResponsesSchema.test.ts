import type { eventTypeBookingFields } from "@calcom/prisma/zod-utils";
import { test } from "@calcom/testing/lib/fixtures/fixtures";
import { describe, expect } from "vitest";
import type { z } from "zod";
import getBookingResponsesSchema, { getBookingResponsesPartialSchema } from "./getBookingResponsesSchema";

const CUSTOM_REQUIRED_FIELD_ERROR_MSG = "error_required_field";
const CUSTOM_PHONE_VALIDATION_ERROR_MSG = "invalid_number";
const CUSTOM_EMAIL_VALIDATION_ERROR_MSG = "email_validation_error";
const CUSTOM_URL_VALIDATION_ERROR_MSG = "url_validation_error";
const CUSTOM_EMAIL_EXCLUDED_ERROR_MSG = "exclude_emails_match_found_error_message";
const CUSTOM_EMAIL_REQUIRED_ERROR_MSG = "require_emails_no_match_found_error_message";
const ZOD_REQUIRED_FIELD_ERROR_MSG = "Required";

function expectResponsesToBe(
  parsedResponses: z.SafeParseReturnType<typeof getBookingResponsesSchema, unknown>,
  expected: unknown
) {
  expect(parsedResponses.success).toBe(true);
  expect(parsedResponses.data).toEqual(expected);
}

function expectParsingToFail(
  parsedResponses: z.SafeParseReturnType<typeof getBookingResponsesSchema, unknown>,
  issue: unknown
) {
  expect(parsedResponses.success).toBe(false);
  expect(parsedResponses.error?.issues[0]).toEqual(issue);
}

describe("getBookingResponsesSchema", () => {
  test(`should parse booking responses`, async ({}) => {
    const schema = getBookingResponsesSchema({
      bookingFields: [
        {
          name: "name",
          type: "name",
          required: true,
        },
        {
          name: "email",
          type: "email",
          required: true,
        },
        {
          name: "testField",
          type: "text",
          required: true,
        },
      ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
      view: "ALL_VIEWS",
    });
    const parsedResponses = await schema.parseAsync({
      testField: "test",
      email: "test@test.com",
      name: "test",
    });
    expect(parsedResponses).toEqual(
      expect.objectContaining({
        testField: "test",
        email: "test@test.com",
        name: "test",
      })
    );
  });

  test(`should error if required fields are missing`, async ({}) => {
    const schema = getBookingResponsesSchema({
      bookingFields: [
        {
          name: "name",
          type: "name",
          required: true,
        },
        {
          name: "email",
          type: "email",
          required: true,
        },
        {
          name: "testField",
          type: "text",
          required: true,
        },
      ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
      view: "ALL_VIEWS",
    });
    const parsedResponses = await schema.safeParseAsync({
      email: "test@test.com",
      name: "test",
    });
    expect(parsedResponses.success).toBe(false);
    if (!parsedResponses.success) {
      expect(parsedResponses.error.issues[0]).toEqual(
        expect.objectContaining({
          code: "custom",
          message: `{testField}${CUSTOM_REQUIRED_FIELD_ERROR_MSG}`,
        })
      );
    }
  });

  describe("Field Type: name", () => {
    test(`'name' must be required`, async ({}) => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testField",
            type: "text",
            required: false,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponsesWithJustEmail = await schema.safeParseAsync({
        email: "john@example.com",
      });

      expectParsingToFail(
        parsedResponsesWithJustEmail,
        expect.objectContaining({
          message: "Invalid input",
          path: ["name"],
        })
      );
    });

    test(`firstName is required and lastName is optional by default`, async () => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
            variant: "firstAndLastName",
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testField",
            type: "text",
            required: false,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        name: {
          firstName: "John",
        },
        email: "john@example.com",
      });

      expectResponsesToBe(parsedResponses, {
        name: {
          firstName: "John",
          lastName: "",
        },
        email: "john@example.com",
      });
    });

    test(`should reject empty fullname`, async ({}) => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testField",
            type: "text",
            required: true,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        testField: "test",
        email: "test@test.com",
        name: "",
      });

      expectParsingToFail(
        parsedResponses,
        expect.objectContaining({
          code: "custom",
          message: `{name}${CUSTOM_REQUIRED_FIELD_ERROR_MSG}`,
        })
      );
    });

    test(`should reject empty firstName`, async ({}) => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
            variant: "firstAndLastName",
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testField",
            type: "text",
            required: true,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        testField: "test",
        email: "test@test.com",
        name: {
          firstName: "  ",
          lastName: "Doe",
        },
      });

      expectParsingToFail(
        parsedResponses,
        expect.objectContaining({
          code: "custom",
          message: `{name}Invalid string`,
        })
      );
    });

    test(`should accept empty lastname`, async ({}) => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
            variant: "firstAndLastName",
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testField",
            type: "text",
            required: true,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.parseAsync({
        testField: "test",
        email: "test@test.com",
        name: {
          firstName: "John",
          lastName: "",
        },
      });

      expect(parsedResponses).toEqual({
        testField: "test",
        email: "test@test.com",
        name: {
          firstName: "John",
          lastName: "",
        },
      });
    });

    describe("variant transformation", () => {
      test("`firstAndLastName` variant to `fullName`", async () => {
        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
            },
            {
              name: "email",
              type: "email",
              required: true,
            },
            {
              name: "testField",
              type: "text",
              required: false,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });
        const parsedResponses = await schema.safeParseAsync({
          name: {
            firstName: "John",
            lastName: "Doe",
          },
          email: "john@example.com",
        });

        expectResponsesToBe(
          parsedResponses,
          expect.objectContaining({
            name: "John Doe",
            email: "john@example.com",
          })
        );
      });

      test("`firstAndLastName` variant to `fullName` when passed as JSON string from URL prefill", async () => {
        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
            },
            {
              name: "email",
              type: "email",
              required: true,
            },
            {
              name: "testField",
              type: "text",
              required: false,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });
        // URL prefill passes name as JSON string
        const parsedResponses = await schema.safeParseAsync({
          name: '{"firstName":"John","lastName":"Doe"}',
          email: "john@example.com",
        });

        expectResponsesToBe(
          parsedResponses,
          expect.objectContaining({
            name: "John Doe",
            email: "john@example.com",
          })
        );
      });

      test("JSON string with only firstName (no lastName) from URL prefill", async () => {
        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
            },
            {
              name: "email",
              type: "email",
              required: true,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });
        const parsedResponses = await schema.safeParseAsync({
          name: '{"firstName":"John"}',
          email: "john@example.com",
        });

        expectResponsesToBe(
          parsedResponses,
          expect.objectContaining({
            name: "John",
            email: "john@example.com",
          })
        );
      });

      test("Invalid JSON string falls back to regular string handling", async () => {
        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
            },
            {
              name: "email",
              type: "email",
              required: true,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });
        const parsedResponses = await schema.safeParseAsync({
          name: "{not valid json}",
          email: "john@example.com",
        });

        expectResponsesToBe(
          parsedResponses,
          expect.objectContaining({
            name: "{not valid json}",
            email: "john@example.com",
          })
        );
      });

      test("JSON array falls back to regular string handling", async () => {
        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
            },
            {
              name: "email",
              type: "email",
              required: true,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });
        const parsedResponses = await schema.safeParseAsync({
          name: '["John", "Doe"]',
          email: "john@example.com",
        });

        expectResponsesToBe(
          parsedResponses,
          expect.objectContaining({
            name: '["John", "Doe"]',
            email: "john@example.com",
          })
        );
      });

      test("JSON object without firstName falls back to regular string handling", async () => {
        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
            },
            {
              name: "email",
              type: "email",
              required: true,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });
        const parsedResponses = await schema.safeParseAsync({
          name: '{"name":"John Doe"}',
          email: "john@example.com",
        });

        expectResponsesToBe(
          parsedResponses,
          expect.objectContaining({
            name: '{"name":"John Doe"}',
            email: "john@example.com",
          })
        );
      });

      test("`fullName` to `firstAndLastName` when there is a lastName(separated by space)", async () => {
        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
              variant: "firstAndLastName",
            },
            {
              name: "email",
              type: "email",
              required: true,
            },
            {
              name: "testField",
              type: "text",
              required: false,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });
        const parsedResponses = await schema.safeParseAsync({
          name: "John Doe",
          email: "john@example.com",
        });

        expectResponsesToBe(
          parsedResponses,
          expect.objectContaining({
            name: {
              firstName: "John",
              lastName: "Doe",
            },
            email: "john@example.com",
          })
        );
      });

      test("`fullName` to `firstAndLastName` when there is no lastName(separated by space)", async () => {
        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
              variant: "firstAndLastName",
            },
            {
              name: "email",
              type: "email",
              required: true,
            },
            {
              name: "testField",
              type: "text",
              required: false,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });
        const parsedResponses = await schema.safeParseAsync({
          name: "John",
          email: "john@example.com",
        });

        expectResponsesToBe(
          parsedResponses,
          expect.objectContaining({
            name: {
              firstName: "John",
              lastName: "",
            },
            email: "john@example.com",
          })
        );
      });
    });
  });

  describe("Field Type: email", () => {
    test(`'email' must be required`, async ({}) => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testField",
            type: "text",
            required: false,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponsesWithJustName = await schema.safeParseAsync({
        name: "John",
      });
      expectParsingToFail(
        parsedResponsesWithJustName,
        expect.objectContaining({
          path: ["email"],
          message: ZOD_REQUIRED_FIELD_ERROR_MSG,
        })
      );
    });

    test(`'email' must be validated `, async () => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testField",
            type: "text",
            required: false,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        name: "John",
        email: "john",
      });
      expectParsingToFail(
        parsedResponses,
        expect.objectContaining({
          // We don't get zod default email address validation error because `bookingResponses` schema defines email as z.string() only
          // So, the error comes from superRefine in getBookingResponsesSchema. We should change this to zod email validation error
          message: `{email}${CUSTOM_EMAIL_VALIDATION_ERROR_MSG}`,
          code: "custom",
        })
      );
    });

    test(`hidden required email field should not be validated`, async () => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
            hidden: true,
          },
          {
            name: "attendeePhoneNumber",
            type: "phone",
            required: true,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        name: "John",
        email: "",
        attendeePhoneNumber: "+919999999999",
      });
      expect(parsedResponses.success).toBe(true);
    });

    describe("conditional fields", () => {
      const buildSchema = () =>
        getBookingResponsesSchema({
          bookingFields: [
            { name: "name", type: "name", required: true },
            { name: "email", type: "email", required: true },
            { name: "how-did-you-hear", type: "text", required: false },
            {
              name: "referral-name",
              type: "text",
              required: true,
              parentQuestionName: "how-did-you-hear",
              triggerValue: "Referral",
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });

      test("does not require a hidden conditional field", async () => {
        const parsedResponses = await buildSchema().safeParseAsync({
          name: "John",
          email: "john@example.com",
          "how-did-you-hear": "Google",
          "referral-name": "",
        });

        expect(parsedResponses.success).toBe(true);
      });

      test("requires a conditional field when its parent matches", async () => {
        const parsedResponses = await buildSchema().safeParseAsync({
          name: "John",
          email: "john@example.com",
          "how-did-you-hear": "Referral",
          "referral-name": "",
        });

        expect(parsedResponses.success).toBe(false);
        expect(parsedResponses.error?.issues[0]?.message).toBe(`{referral-name}${CUSTOM_REQUIRED_FIELD_ERROR_MSG}`);
      });

      test("accepts a conditional field value when its parent matches", async () => {
        const parsedResponses = await buildSchema().safeParseAsync({
          name: "John",
          email: "john@example.com",
          "how-did-you-hear": "Referral",
          "referral-name": "Jane Doe",
        });

        expect(parsedResponses.success).toBe(true);
      });
    });

    describe("conditional fields - nesting is out of scope", () => {
      test("does not require a grandchild when its parent is conditional", async () => {
        const schema = getBookingResponsesSchema({
          bookingFields: [
            { name: "name", type: "name", required: true },
            { name: "email", type: "email", required: true },
            { name: "a", type: "text", required: false },
            { name: "b", type: "text", required: false, parentQuestionName: "a", triggerValue: "yes" },
            { name: "c", type: "text", required: true, parentQuestionName: "b", triggerValue: "yes" },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });

        const parsedResponses = await schema.safeParseAsync({
          name: "John",
          email: "john@example.com",
          a: "no",
          b: "yes",
          c: "",
        });

        expect(parsedResponses.success).toBe(true);
      });

      test("does not require a field with a dangling parent reference", async () => {
        const schema = getBookingResponsesSchema({
          bookingFields: [
            { name: "name", type: "name", required: true },
            { name: "email", type: "email", required: true },
            {
              name: "orphan",
              type: "text",
              required: true,
              parentQuestionName: "does-not-exist",
              triggerValue: "yes",
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });

        const parsedResponses = await schema.safeParseAsync({
          name: "John",
          email: "john@example.com",
          orphan: "",
        });

        expect(parsedResponses.success).toBe(true);
      });

      test("does not require a child when its parent is scoped to another view", async () => {
        const schema = getBookingResponsesSchema({
          bookingFields: [
            { name: "name", type: "name", required: true },
            { name: "email", type: "email", required: true },
            { name: "rescheduleReason", type: "textarea", required: false, views: [{ id: "reschedule" }] },
            {
              name: "sick-note",
              type: "text",
              required: true,
              parentQuestionName: "rescheduleReason",
              triggerValue: "sick",
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "",
        });

        const parsedResponses = await schema.safeParseAsync({
          name: "John",
          email: "john@example.com",
          rescheduleReason: "sick",
          "sick-note": "",
        });

        expect(parsedResponses.success).toBe(true);
      });

      test("does not require a child when its parent has one option", async () => {
        const schema = getBookingResponsesSchema({
          bookingFields: [
            { name: "name", type: "name", required: true },
            { name: "email", type: "email", required: true },
            {
              name: "plan",
              type: "select",
              required: false,
              hideWhenJustOneOption: true,
              options: [{ label: "Only", value: "only" }],
            },
            {
              name: "plan-detail",
              type: "text",
              required: true,
              parentQuestionName: "plan",
              triggerValue: "only",
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });

        const parsedResponses = await schema.safeParseAsync({
          name: "John",
          email: "john@example.com",
          plan: "only",
          "plan-detail": "",
        });

        expect(parsedResponses.success).toBe(true);
      });
    });

    describe("excluded email/domain validation", () => {
      test("should fail if the email is present in excluded emails", async () => {
        const excludedEmails = "spammer@cal.com, hotmail.com, yahoo.com, gmail.com";

        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
            },
            {
              name: "email",
              type: "email",
              required: true,
              excludeEmails: excludedEmails,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });

        const parsedResponses = await schema.safeParseAsync({
          name: "test",
          email: "harry@gmail.com",
        });
        expectParsingToFail(
          parsedResponses,
          expect.objectContaining({
            code: "custom",
            message: `{email}${CUSTOM_EMAIL_EXCLUDED_ERROR_MSG}`,
          })
        );
      });

      test("should pass if the email is not present in excluded emails", async () => {
        const excludedEmails = "spammer@cal.com, hotmail.com, yahoo.com, gmail.com";

        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
            },
            {
              name: "email",
              type: "email",
              required: true,
              excludeEmails: excludedEmails,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });

        const parsedResponses = await schema.safeParseAsync({
          name: "test",
          email: "harry@workmail.com",
        });

        expectResponsesToBe(parsedResponses, {
          name: "test",
          email: "harry@workmail.com",
        });
      });

      test("should not block email domains that contain excluded domain as substring", async () => {
        // This tests the fix for the bug where `includes` was used instead of `endsWith`
        // e.g., blocking "test.co" should not block "test.com"
        const excludedEmails = "test.co";

        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
            },
            {
              name: "email",
              type: "email",
              required: true,
              excludeEmails: excludedEmails,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });

        // test.com should NOT be blocked when test.co is excluded
        const parsedResponses = await schema.safeParseAsync({
          name: "test",
          email: "user@test.com",
        });

        expectResponsesToBe(parsedResponses, {
          name: "test",
          email: "user@test.com",
        });
      });

      test("should block exact domain match when using endsWith", async () => {
        const excludedEmails = "test.co";

        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
            },
            {
              name: "email",
              type: "email",
              required: true,
              excludeEmails: excludedEmails,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });

        // test.co should be blocked
        const parsedResponses = await schema.safeParseAsync({
          name: "test",
          email: "user@test.co",
        });

        expectParsingToFail(
          parsedResponses,
          expect.objectContaining({
            code: "custom",
            message: `{email}${CUSTOM_EMAIL_EXCLUDED_ERROR_MSG}`,
          })
        );
      });

      test("should not block emails where excluded domain appears in local part", async () => {
        // Ensures that the @ anchor prevents matching domains in the local part of email
        const excludedEmails = "blocked.com";

        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
            },
            {
              name: "email",
              type: "email",
              required: true,
              excludeEmails: excludedEmails,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });

        // Email with blocked.com in local part should not be blocked
        const parsedResponses = await schema.safeParseAsync({
          name: "test",
          email: "blocked.com@allowed.com",
        });

        expectResponsesToBe(parsedResponses, {
          name: "test",
          email: "blocked.com@allowed.com",
        });
      });

      test("should block full email match when exact email is excluded", async () => {
        const excludedEmails = "anik@cal.com";

        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
            },
            {
              name: "email",
              type: "email",
              required: true,
              excludeEmails: excludedEmails,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });

        // anik@cal.com should be blocked
        const parsedResponses = await schema.safeParseAsync({
          name: "test",
          email: "anik@cal.com",
        });

        expectParsingToFail(
          parsedResponses,
          expect.objectContaining({
            code: "custom",
            message: `{email}${CUSTOM_EMAIL_EXCLUDED_ERROR_MSG}`,
          })
        );
      });

      test("should block emails with domain when domain starts with @", async () => {
        const excludedEmails = "@gmail.com";

        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
            },
            {
              name: "email",
              type: "email",
              required: true,
              excludeEmails: excludedEmails,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });

        // anik@gmail.com should be blocked when @gmail.com is excluded
        const parsedResponses = await schema.safeParseAsync({
          name: "test",
          email: "anik@gmail.com",
        });

        expectParsingToFail(
          parsedResponses,
          expect.objectContaining({
            code: "custom",
            message: `{email}${CUSTOM_EMAIL_EXCLUDED_ERROR_MSG}`,
          })
        );
      });

      test("should block emails with domain when excluded email is just the domain without @", async () => {
        const excludedEmails = "gmail.com";

        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
            },
            {
              name: "email",
              type: "email",
              required: true,
              excludeEmails: excludedEmails,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });

        // test@gmail.com should be blocked when gmail.com is excluded
        const parsedResponses = await schema.safeParseAsync({
          name: "test",
          email: "test@gmail.com",
        });

        expectParsingToFail(
          parsedResponses,
          expect.objectContaining({
            code: "custom",
            message: `{email}${CUSTOM_EMAIL_EXCLUDED_ERROR_MSG}`,
          })
        );
      });
    });

    describe("require email/domain validation", () => {
      test("should fail if the required email/domain is not present", async () => {
        const requiredEmails = "gmail.com, user@hotmail.com, yahoo.com";
        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
            },
            {
              name: "email",
              type: "email",
              required: true,
              requireEmails: requiredEmails,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });

        const parsedResponses = await schema.safeParseAsync({
          name: "test",
          email: "test@test.com",
        });

        expectParsingToFail(
          parsedResponses,
          expect.objectContaining({
            code: "custom",
            message: `{email}${CUSTOM_EMAIL_REQUIRED_ERROR_MSG}`,
          })
        );
      });

      test("should pass if the required email/domain is present", async () => {
        const requiredEmails = "gmail.com, user@hotmail.com, yahoo.com";

        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
            },
            {
              name: "email",
              type: "email",
              required: true,
              requireEmails: requiredEmails,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });

        const parsedResponses = await schema.safeParseAsync({
          name: "test",
          email: "test@gmail.com",
        });

        expectResponsesToBe(parsedResponses, {
          name: "test",
          email: "test@gmail.com",
        });
      });

      test("should not match email domains that contain required domain as substring", async () => {
        // This tests the fix for the bug where `includes` was used instead of `endsWith`
        // e.g., requiring "test.co" should not match "test.com"
        const requiredEmails = "test.co";

        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
            },
            {
              name: "email",
              type: "email",
              required: true,
              requireEmails: requiredEmails,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });

        // test.com should NOT match when test.co is required
        const parsedResponses = await schema.safeParseAsync({
          name: "test",
          email: "user@test.com",
        });

        expectParsingToFail(
          parsedResponses,
          expect.objectContaining({
            code: "custom",
            message: `{email}${CUSTOM_EMAIL_REQUIRED_ERROR_MSG}`,
          })
        );
      });

      test("should match exact domain when using endsWith", async () => {
        const requiredEmails = "test.co";

        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
            },
            {
              name: "email",
              type: "email",
              required: true,
              requireEmails: requiredEmails,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });

        // test.co should match
        const parsedResponses = await schema.safeParseAsync({
          name: "test",
          email: "user@test.co",
        });

        expectResponsesToBe(parsedResponses, {
          name: "test",
          email: "user@test.co",
        });
      });

      test("should not match emails where required domain appears in local part", async () => {
        // Ensures that the @ anchor prevents matching domains in the local part of email
        const requiredEmails = "required.com";

        const schema = getBookingResponsesSchema({
          bookingFields: [
            {
              name: "name",
              type: "name",
              required: true,
            },
            {
              name: "email",
              type: "email",
              required: true,
              requireEmails: requiredEmails,
            },
          ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
          view: "ALL_VIEWS",
        });

        // Email with required.com in local part should not match
        const parsedResponses = await schema.safeParseAsync({
          name: "test",
          email: "required.com@other.com",
        });

        expectParsingToFail(
          parsedResponses,
          expect.objectContaining({
            code: "custom",
            message: `{email}${CUSTOM_EMAIL_REQUIRED_ERROR_MSG}`,
          })
        );
      });
    });
  });

  describe("Field Type: phone", () => {
    test(`should fail parsing if invalid phone provided`, async ({}) => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testPhone",
            type: "phone",
            required: true,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        email: "test@test.com",
        name: "test",
        testPhone: "1234567890",
      });
      expectParsingToFail(
        parsedResponses,
        expect.objectContaining({
          code: "custom",
          message: `{testPhone}${CUSTOM_PHONE_VALIDATION_ERROR_MSG}`,
        })
      );
    });
    test(`should successfully give responses if phone type field value is valid`, async ({}) => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testPhone",
            type: "phone",
            required: true,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        email: "test@test.com",
        name: "test",
        testPhone: "+919999999999",
      });
      expectResponsesToBe(parsedResponses, {
        email: "test@test.com",
        name: "test",
        testPhone: "+919999999999",
      });
    });

    test(`should give parsed response if phone type field value starts with a space`, async ({}) => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testPhone",
            type: "phone",
            required: true,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        email: "test@test.com",
        name: "test",
        // Space can come due to libraries considering + to be space
        testPhone: " 919999999999",
      });
      expectResponsesToBe(parsedResponses, {
        email: "test@test.com",
        name: "test",
        testPhone: "+919999999999",
      });

      const parsedResponses2 = await schema.safeParseAsync({
        email: "test@test.com",
        name: "test",
        // Space can come due to libraries considering + to be space
        testPhone: "     919999999999",
      });
      expectResponsesToBe(parsedResponses2, {
        email: "test@test.com",
        name: "test",
        testPhone: "+919999999999",
      });
    });

    test("should fail parsing if phone field value is empty", async ({}) => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testPhone",
            type: "phone",
            required: true,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        email: "test@test.com",
        name: "test",
        testPhone: "",
      });
      expectParsingToFail(
        parsedResponses,
        expect.objectContaining({
          code: "custom",
          message: `{testPhone}${CUSTOM_REQUIRED_FIELD_ERROR_MSG}`,
        })
      );
    });

    test("should fail parsing if phone field value isn't provided", async ({}) => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testPhone",
            type: "phone",
            required: true,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        email: "test@test.com",
        name: "test",
      });
      expectParsingToFail(
        parsedResponses,
        expect.objectContaining({
          code: "custom",
          message: `{testPhone}${CUSTOM_REQUIRED_FIELD_ERROR_MSG}`,
        })
      );
    });
  });

  test("should fail parsing when invalid field type is provided", async () => {
    const schema = getBookingResponsesSchema({
      bookingFields: [
        {
          name: "name",
          type: "name",
          required: true,
        },
        {
          name: "email",
          type: "email",
          required: true,
        },
        {
          name: "invalidField",
          type: "unknown-field-type",
          required: true,
        },
      ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
      view: "ALL_VIEWS",
    });
    const parsedResponses = await schema.safeParseAsync({
      email: "test@test.com",
      name: "test",
      invalidField: "1234567890",
    });
    expectParsingToFail(
      parsedResponses,
      expect.objectContaining({
        code: "custom",
        message: `Can't parse unknown booking field type: unknown-field-type`,
      })
    );
  });

  describe("Field Type: multiemail", () => {
    test("should successfully parse a multiemail type field", async () => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testEmailsList",
            type: "multiemail",
            required: true,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        email: "test@test.com",
        name: "test",
        testEmailsList: ["first@example.com"],
      });
      expectResponsesToBe(parsedResponses, {
        email: "test@test.com",
        name: "test",
        testEmailsList: ["first@example.com"],
      });
    });

    test("should fail parsing when one of the emails is invalid", async () => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testEmailsList",
            type: "multiemail",
            required: true,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        email: "test@test.com",
        name: "test",
        testEmailsList: ["first@example.com", "invalid@example"],
      });
      expectParsingToFail(
        parsedResponses,
        expect.objectContaining({
          code: "custom",
          message: `{testEmailsList}${CUSTOM_EMAIL_VALIDATION_ERROR_MSG}`,
        })
      );
    });

    test("should successfully parse a multiemail type field response, even when the value is just a string[Prefill needs it]", async () => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testEmailsList",
            type: "multiemail",
            required: true,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        email: "test@test.com",
        name: "test",
        testEmailsList: "first@example.com",
      });
      expectResponsesToBe(parsedResponses, {
        email: "test@test.com",
        name: "test",
        testEmailsList: ["first@example.com"],
      });
    });
  });

  describe("Field Type: multiselect", () => {
    test("should successfully parse a multiselect type field", async () => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testMultiselect",
            type: "multiselect",
            required: true,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        email: "test@test.com",
        name: "test",
        testMultiselect: ["option1", "option-2"],
      });
      expectResponsesToBe(parsedResponses, {
        email: "test@test.com",
        name: "test",
        testMultiselect: ["option1", "option-2"],
      });
    });
    test("should successfully parse a multiselect type field", async () => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testMultiselect",
            type: "multiselect",
            required: true,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        email: "test@test.com",
        name: "test",
        testMultiselect: "option1",
      });
      expectResponsesToBe(parsedResponses, {
        email: "test@test.com",
        name: "test",
        testMultiselect: ["option1"],
      });
    });
    test("should fail parsing if selected options aren't strings", async () => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testMultiselect",
            type: "multiselect",
            required: true,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        email: "test@test.com",
        name: "test",
        testMultiselect: [1, 2],
      });
      expectParsingToFail(
        parsedResponses,
        expect.objectContaining({
          code: "custom",
          message: `{testMultiselect}Invalid array of strings`,
        })
      );
    });
  });

  describe("Field Type: radioInput", () => {
    test(`should fail parsing if invalid phone number is provided`, async ({}) => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "radioInput",
            type: "radioInput",
            required: true,
            optionsInputs: {
              phone: {
                type: "phone",
              },
            },
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        email: "test@test.com",
        name: "test",
        radioInput: JSON.stringify({
          value: "phone",
          optionValue: " 9999999999",
        }),
      });
      expectParsingToFail(
        parsedResponses,
        expect.objectContaining({
          code: "custom",
          message: `{radioInput}${CUSTOM_PHONE_VALIDATION_ERROR_MSG}`,
        })
      );
    });

    test(`should correctly handle space in the beginning of phone number which could come from a + in prefill URL`, async ({}) => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "radioInput",
            type: "radioInput",
            required: true,
            optionsInputs: {
              // A field of type phone
              randomField: {
                type: "phone",
              },
            },
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        email: "test@test.com",
        name: "test",
        radioInput: JSON.stringify({
          value: "randomField",
          optionValue: " 919999999999",
        }),
      });
      expectResponsesToBe(parsedResponses, {
        email: "test@test.com",
        name: "test",
        radioInput: {
          value: "randomField",
          optionValue: "+919999999999",
        },
      });
    });
  });

  describe("Field Type: url", () => {
    test(`should pass parsing if protocol is missing`, async ({}) => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "url",
            type: "url",
            required: true,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        email: "test@test.com",
        name: "test",
        url: "www.example.com",
      });
      // Expect success because our logic now handles missing protocol
      expectResponsesToBe(parsedResponses, {
        email: "test@test.com",
        name: "test",
        url: "www.example.com",
      });
    });

    test(`should fail parsing if url is truly invalid`, async ({}) => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "url",
            type: "url",
            required: true,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        email: "test@test.com",
        name: "test",
        url: "http:/nope",
      });
      expectParsingToFail(
        parsedResponses,
        expect.objectContaining({
          code: "custom",
          message: `{url}${CUSTOM_URL_VALIDATION_ERROR_MSG}`,
        })
      );
    });

    test(`should successfully give responses if url type field value is valid`, async ({}) => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "url",
            type: "url",
            required: true,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        email: "test@test.com",
        name: "test",
        url: "https://8x8.vc/company",
      });
      expectResponsesToBe(parsedResponses, {
        email: "test@test.com",
        name: "test",
        url: "https://8x8.vc/company",
      });
    });

    test("should fail parsing if url field value is empty", async ({}) => {
      const schema = getBookingResponsesSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "url",
            type: "url",
            required: true,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      const parsedResponses = await schema.safeParseAsync({
        email: "test@test.com",
        name: "test",
        url: "",
      });
      expectParsingToFail(
        parsedResponses,
        expect.objectContaining({
          code: "custom",
          message: `{url}${CUSTOM_REQUIRED_FIELD_ERROR_MSG}`,
        })
      );
    });
  });
});

describe("getBookingResponsesPartialSchema - Prefill validation", () => {
  describe("Field Type: name - prefill", () => {
    test(`should accept object response with additional fields beyond firstName and lastName`, async ({}) => {
      const schema = getBookingResponsesPartialSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
            variant: "firstAndLastName",
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      // Additional fields like middleName, suffix, etc. should not cause errors
      const parsedResponses = await schema.parseAsync({
        name: {
          firstName: "John",
          lastName: "Doe",
          middleName: "William",
          suffix: "Jr.",
        },
      });
      // The additional fields are stripped/ignored, but the parsing should succeed
      expect(parsedResponses).toEqual(
        expect.objectContaining({
          name: {
            firstName: "John",
            lastName: "Doe",
          },
        })
      );
    });

    test(`should return empty string for name field with invalid array response during partial prefill`, async ({}) => {
      const schema = getBookingResponsesPartialSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testField",
            type: "text",
            required: false,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      // Array response is invalid for name field - should be skipped during partial prefill
      const parsedResponses = await schema.parseAsync({
        name: ["John", "Doe"],
        testField: "test value",
      });
      // Name field should be present with empty string, and testField should still be prefilled
      expect(parsedResponses).toEqual(
        expect.objectContaining({
          name: "",
          testField: "test value",
        })
      );
    });

    test(`should return empty string for name field with invalid number response during partial prefill`, async ({}) => {
      const schema = getBookingResponsesPartialSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testField",
            type: "text",
            required: false,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      // Number response is invalid for name field - should be skipped during partial prefill
      const parsedResponses = await schema.parseAsync({
        name: 12345,
        testField: "test value",
      });
      // Name field should be present with empty string, and testField should still be prefilled
      expect(parsedResponses).toEqual(
        expect.objectContaining({
          name: "",
          testField: "test value",
        })
      );
    });

    test(`should skip name field with object missing firstName during partial prefill`, async ({}) => {
      const schema = getBookingResponsesPartialSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
            variant: "firstAndLastName",
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testField",
            type: "text",
            required: false,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      // Object missing firstName is invalid - should be skipped during partial prefill
      const parsedResponses = await schema.parseAsync({
        name: { lastName: "Doe" },
        testField: "test value",
      });
      // Name field should be skipped (not included), but testField should still be prefilled
      expect(parsedResponses).toEqual(
        expect.objectContaining({
          testField: "test value",
        })
      );
      expect(parsedResponses).not.toHaveProperty("name");
    });
  });

  test(`should be able to get fields prefilled even when name is empty string`, async ({}) => {
    const schema = getBookingResponsesPartialSchema({
      bookingFields: [
        {
          name: "name",
          type: "name",
          required: true,
        },
        {
          name: "email",
          type: "email",
          required: true,
        },
        {
          name: "testField",
          type: "text",
          required: true,
        },
      ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
      view: "ALL_VIEWS",
    });
    const parsedResponses = await schema.parseAsync({
      name: "",
      testField: "test",
    });
    expect(parsedResponses).toEqual(
      expect.objectContaining({
        name: "",
        testField: "test",
      })
    );
  });

  test(`should prefill all valid fields`, async ({}) => {
    const schema = getBookingResponsesPartialSchema({
      bookingFields: [
        {
          name: "name",
          type: "name",
          required: true,
        },
        {
          name: "email",
          type: "email",
          required: true,
        },
        {
          name: "testPhone",
          type: "phone",
          required: true,
        },
        {
          name: "testField",
          type: "text",
          required: true,
        },
      ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
      view: "ALL_VIEWS",
    });
    const parsedResponses = await schema.parseAsync({
      name: "John Doe",
      email: "valid@email.com",
      testPhone: "+919999999999",
      testField: "test value",
    });
    expect(parsedResponses).toEqual(
      expect.objectContaining({
        name: "John Doe",
        email: "valid@email.com",
        testPhone: "+919999999999",
        testField: "test value",
      })
    );
  });

  test(`should prefill name and text fields when phone field has partial value (country code only)`, async ({}) => {
    const schema = getBookingResponsesPartialSchema({
      bookingFields: [
        {
          name: "name",
          type: "name",
          required: true,
        },
        {
          name: "email",
          type: "email",
          required: true,
        },
        {
          name: "testPhone",
          type: "phone",
          required: false,
        },
        {
          name: "testField",
          type: "text",
          required: true,
        },
      ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
      view: "ALL_VIEWS",
    });
    // Phone field with space at beginning (URL encoding of +) should be converted to +
    const parsedResponses = await schema.parseAsync({
      name: "John Doe",
      testPhone: " 91",
      testField: "test value",
    });
    expect(parsedResponses).toEqual(
      expect.objectContaining({
        name: "John Doe",
        testPhone: "+91",
        testField: "test value",
      })
    );
  });

  test(`should accept email field with any string value during partial prefill (validation relaxed for partial values)`, async ({}) => {
    const schema = getBookingResponsesPartialSchema({
      bookingFields: [
        {
          name: "name",
          type: "name",
          required: true,
        },
        {
          name: "email",
          type: "email",
          required: true,
        },
        {
          name: "testField",
          type: "text",
          required: false,
        },
      ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
      view: "ALL_VIEWS",
    });
    // During partial prefill, email validation is relaxed to z.string() to allow partial values
    // This is consistent with phone field behavior where partial values like "+91" are accepted
    const parsedResponses = await schema.parseAsync({
      name: "John Doe",
      email: "invalid-email",
      testField: "test value",
    });
    // Email field accepts any string during partial prefill (validation is relaxed)
    expect(parsedResponses).toEqual(
      expect.objectContaining({
        name: "John Doe",
        email: "invalid-email",
        testField: "test value",
      })
    );
  });

  test(`should prefill valid boolean field`, async ({}) => {
    const schema = getBookingResponsesPartialSchema({
      bookingFields: [
        {
          name: "name",
          type: "name",
          required: true,
        },
        {
          name: "email",
          type: "email",
          required: true,
        },
        {
          name: "testBoolean",
          type: "boolean",
          required: false,
        },
      ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
      view: "ALL_VIEWS",
    });
    const parsedResponses = await schema.parseAsync({
      name: "John",
      testBoolean: "true",
    });
    expect(parsedResponses).toEqual(
      expect.objectContaining({
        name: "John",
        testBoolean: true,
      })
    );
  });

  test(`should prefill valid multiselect field`, async ({}) => {
    const schema = getBookingResponsesPartialSchema({
      bookingFields: [
        {
          name: "name",
          type: "name",
          required: true,
        },
        {
          name: "email",
          type: "email",
          required: true,
        },
        {
          name: "testMultiselect",
          type: "multiselect",
          required: false,
          options: [
            { label: "Option 1", value: "option1" },
            { label: "Option 2", value: "option2" },
          ],
        },
      ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
      view: "ALL_VIEWS",
    });
    const parsedResponses = await schema.parseAsync({
      name: "John",
      testMultiselect: ["option1", "option2"],
    });
    expect(parsedResponses).toEqual(
      expect.objectContaining({
        name: "John",
        testMultiselect: ["option1", "option2"],
      })
    );
  });

  test(`should convert single value to array for multiselect field during prefill`, async ({}) => {
    const schema = getBookingResponsesPartialSchema({
      bookingFields: [
        {
          name: "name",
          type: "name",
          required: true,
        },
        {
          name: "email",
          type: "email",
          required: true,
        },
        {
          name: "testMultiselect",
          type: "multiselect",
          required: false,
          options: [
            { label: "Option 1", value: "option1" },
            { label: "Option 2", value: "option2" },
          ],
        },
      ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
      view: "ALL_VIEWS",
    });
    const parsedResponses = await schema.parseAsync({
      name: "John",
      testMultiselect: "option1",
    });
    expect(parsedResponses).toEqual(
      expect.objectContaining({
        name: "John",
        testMultiselect: ["option1"],
      })
    );
  });

  test(`should handle partial prefill with multiple field types`, async ({}) => {
    const schema = getBookingResponsesPartialSchema({
      bookingFields: [
        {
          name: "name",
          type: "name",
          required: true,
        },
        {
          name: "email",
          type: "email",
          required: true,
        },
        {
          name: "testText",
          type: "text",
          required: false,
        },
        {
          name: "testNumber",
          type: "number",
          required: false,
        },
        {
          name: "testTextarea",
          type: "textarea",
          required: false,
        },
      ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
      view: "ALL_VIEWS",
    });
    const parsedResponses = await schema.parseAsync({
      name: "John Doe",
      testText: "some text",
      testNumber: "42",
      testTextarea: "multi\nline\ntext",
    });
    expect(parsedResponses).toEqual(
      expect.objectContaining({
        name: "John Doe",
        testText: "some text",
        testNumber: "42",
        testTextarea: "multi\nline\ntext",
      })
    );
  });

  describe("superRefine error handling in partial prefill", () => {
    test(`should skip name field gracefully when superRefine throws due to invalid variant config`, async () => {
      const schema = getBookingResponsesPartialSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
            variant: "invalidVariant", // Invalid variant that will cause superRefine to throw
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testField",
            type: "text",
            required: false,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });

      // This should NOT throw - should gracefully skip the invalid field
      const parsedResponses = await schema.parseAsync({
        name: "John Doe",
        testField: "test value",
      });

      // Name field should be skipped due to superRefine error, but testField should still work
      expect(parsedResponses).toEqual(
        expect.objectContaining({
          testField: "test value",
        })
      );
    });

    test(`should skip field and still prefill other valid fields when superRefine throws`, async () => {
      const schema = getBookingResponsesPartialSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
            variant: "invalidVariant", // Will cause superRefine to throw
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "validPhone",
            type: "phone",
            required: false,
          },
          {
            name: "validText",
            type: "text",
            required: false,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });

      const parsedResponses = await schema.parseAsync({
        name: "John",
        validPhone: "+919999999999",
        validText: "some text",
      });

      // Should have the valid fields prefilled
      expect(parsedResponses).toEqual(
        expect.objectContaining({
          validPhone: "+919999999999",
          validText: "some text",
        })
      );
    });

    test(`should skip textarea field when text exceeds maxLength during partial prefill`, async () => {
      // This test verifies that when textarea value exceeds maxLength, the validation error is handled
      // gracefully during partial prefill and other fields are still prefilled
      const schema = getBookingResponsesPartialSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "notes",
            type: "textarea",
            required: false,
            maxLength: 5, // Set maxLength to 5 characters
          },
          {
            name: "validText",
            type: "text",
            required: false,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });

      // Provide text that exceeds maxLength (more than 5 chars)
      const parsedResponses = await schema.parseAsync({
        name: "John Doe",
        notes: "This text is way too long for maxLength of 5",
        validText: "test value",
      });

      // Parsing should succeed - partial prefill should handle validation errors gracefully
      expect(parsedResponses).toBeDefined();
      // Other valid fields should still be prefilled
      expect(parsedResponses).toEqual(
        expect.objectContaining({
          name: "John Doe",
          validText: "test value",
        })
      );
      // The invalid textarea field should NOT be included in the response
      expect(parsedResponses.notes).toBeUndefined();
    });

    test(`should skip name field with empty object during partial prefill`, async () => {
      const schema = getBookingResponsesPartialSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
            variant: "firstAndLastName",
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testField",
            type: "text",
            required: false,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      // Empty object {} is invalid for name field - should be skipped during partial prefill
      const parsedResponses = await schema.parseAsync({
        name: {},
        testField: "test value",
      });
      // Name field should be skipped (not included), but testField should still be prefilled
      expect(parsedResponses).toEqual(
        expect.objectContaining({
          testField: "test value",
        })
      );
      expect(parsedResponses).not.toHaveProperty("name");
    });

    test(`should skip url field with invalid format during partial prefill`, async () => {
      const schema = getBookingResponsesPartialSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "website",
            type: "url",
            required: false,
          },
          {
            name: "testField",
            type: "text",
            required: false,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      // Invalid URL should be skipped during partial prefill
      const parsedResponses = await schema.parseAsync({
        name: "John Doe",
        website: "not-a-valid-url",
        testField: "test value",
      });
      // URL field should be skipped due to validation error, but other fields should still be prefilled
      expect(parsedResponses).toEqual(
        expect.objectContaining({
          name: "John Doe",
          testField: "test value",
        })
      );
      expect(parsedResponses).not.toHaveProperty("website");
    });

    test(`should handle null responses gracefully during partial prefill`, async () => {
      const schema = getBookingResponsesPartialSchema({
        bookingFields: [
          {
            name: "name",
            type: "name",
            required: true,
          },
          {
            name: "email",
            type: "email",
            required: true,
          },
          {
            name: "testField",
            type: "text",
            required: false,
          },
        ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
        view: "ALL_VIEWS",
      });
      // Null responses should be handled gracefully
      const parsedResponses = await schema.parseAsync(null);
      // Should return empty object or null without crashing
      expect(parsedResponses).toBeDefined();
    });
  });

  test(`optional email field should fail if invalid input is provided`, async () => {
    const schema = getBookingResponsesSchema({
      bookingFields: [
        {
          name: "name",
          type: "name",
          required: true,
        },
        {
          name: "email",
          type: "email",
          required: true,
        },
        {
          name: "optionalEmail",
          type: "email",
          required: false,
        },
      ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
      view: "ALL_VIEWS",
    });

    const parsedResponses = await schema.safeParseAsync({
      name: "John Doe",
      email: "john@example.com",
      optionalEmail: "not-a-valid-email",
    });

    expectParsingToFail(
      parsedResponses,
      expect.objectContaining({
        message: `{optionalEmail}${CUSTOM_EMAIL_VALIDATION_ERROR_MSG}`,
      })
    );
  });

  test(`optional email field should pass if left empty`, async () => {
    const schema = getBookingResponsesSchema({
      bookingFields: [
        {
          name: "name",
          type: "name",
          required: true,
        },
        {
          name: "email",
          type: "email",
          required: true,
        },
        {
          name: "optionalEmail",
          type: "email",
          required: false,
        },
      ] as z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">,
      view: "ALL_VIEWS",
    });

    const parsedResponses = await schema.safeParseAsync({
      name: "John Doe",
      email: "john@example.com",
      optionalEmail: "",
    });

    expect(parsedResponses.success).toBe(true);
  });
});
