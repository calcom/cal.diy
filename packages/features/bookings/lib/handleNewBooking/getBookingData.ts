import { OrganizerDefaultConferencingAppType } from "@calcom/app-store/locations";
import dayjs from "@calcom/dayjs";
import { getCalEventResponses } from "@calcom/features/bookings/lib/getCalEventResponses";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { withReporting } from "@calcom/lib/sentryWrapper";
import type { EventTypeCustomInput } from "@calcom/prisma/client";
import type z from "zod";
import { bookingCreateSchemaLegacyPropsForApi } from "../bookingCreateBodySchema";
import type { TgetBookingDataSchema } from "../getBookingDataSchema";
import type { getEventTypeResponse } from "./getEventTypesFromDB";
import { handleCustomInputs } from "./handleCustomInputs";

type ReqBodyWithEnd = TgetBookingDataSchema & { end: string };

// Define the function with underscore prefix
const _getBookingData = async <T extends z.ZodType>({
  reqBody,
  eventType,
  schema,
}: {
  reqBody: Record<string, any>;
  eventType: getEventTypeResponse;
  schema: T;
}) => {
  const parsedBody = await schema.parseAsync(reqBody);
  const parsedBodyWithEnd = (body: TgetBookingDataSchema): body is ReqBodyWithEnd => {
    // Use the event length to auto-set the event end time.
    if (!Object.prototype.hasOwnProperty.call(body, "end")) {
      body.end = dayjs.utc(body.start).add(eventType.length, "minutes").format();
    }
    return true;
  };
  if (!parsedBodyWithEnd(parsedBody)) {
    throw new Error(ErrorCode.RequestBodyWithouEnd);
  }
  // parsedBody.end is no longer an optional property.
  if (parsedBody.customInputs) {
    // Check if required custom inputs exist
    handleCustomInputs(eventType.customInputs as EventTypeCustomInput[], parsedBody.customInputs);
    const reqBodyWithLegacyProps = bookingCreateSchemaLegacyPropsForApi.parse(parsedBody);
    return {
      ...parsedBody,
      name: reqBodyWithLegacyProps.name,
      email: reqBodyWithLegacyProps.email,
      guests: reqBodyWithLegacyProps.guests,
      location: reqBodyWithLegacyProps.location || "",
      smsReminderNumber: reqBodyWithLegacyProps.smsReminderNumber,
      notes: reqBodyWithLegacyProps.notes,
      rescheduleReason: reqBodyWithLegacyProps.rescheduleReason,
      // So TS doesn't complain about unknown properties
      calEventUserFieldsResponses: undefined,
      calEventResponses: undefined,
      customInputs: undefined,
      attendeePhoneNumber: undefined,
    };
  }
  if (!parsedBody.responses) {
    throw new Error("`responses` must not be nullish");
  }
  const responses = parsedBody.responses;

  const { userFieldsResponses: calEventUserFieldsResponses, responses: calEventResponses } =
    getCalEventResponses({
      bookingFields: eventType.bookingFields,
      responses,
      seatsEnabled: !!eventType.seatsPerTimeSlot,
    });
  // Extract location value, but ignore optionValue when location is organizer's default app
  let locationValue = "";
  if (responses.location) {
    const locationResponse = responses.location;
    const locationType = typeof locationResponse === "string" ? locationResponse : locationResponse.value;
    if (locationType === OrganizerDefaultConferencingAppType) {
      locationValue = locationType;
    } else {
      locationValue =
        (typeof locationResponse !== "string" ? locationResponse.optionValue : undefined) ||
        locationType ||
        "";
    }
  }

  return {
    ...parsedBody,
    name: responses.name,
    email: responses.email,
    attendeePhoneNumber: responses.attendeePhoneNumber,
    guests: responses.guests ? responses.guests : [],
    location: locationValue,
    smsReminderNumber: responses.smsReminderNumber,
    notes: responses.notes || "",
    calEventUserFieldsResponses,
    rescheduleReason: responses.rescheduleReason,
    calEventResponses,
    // So TS doesn't complain about unknown properties
    customInputs: undefined,
  };
};

export const getBookingData = withReporting(_getBookingData, "getBookingData");

export type AwaitedBookingData = Awaited<ReturnType<typeof _getBookingData>>;
export type RescheduleReason = AwaitedBookingData["rescheduleReason"];
export type NoEmail = AwaitedBookingData["noEmail"];
export type AdditionalNotes = AwaitedBookingData["notes"];
export type ReqAppsStatus = AwaitedBookingData["appsStatus"];
export type SmsReminderNumber = AwaitedBookingData["smsReminderNumber"];
export type EventTypeId = AwaitedBookingData["eventTypeId"];
export type ReqBodyMetadata = ReqBodyWithEnd["metadata"];
