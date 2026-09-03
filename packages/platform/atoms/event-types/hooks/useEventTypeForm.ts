import checkForMultiplePaymentApps from "@calcom/app-store/_utils/payments/checkForMultiplePaymentApps";
import { locationsResolver } from "@calcom/app-store/locations";
import { stripChildrenForPayload } from "@calcom/features/eventtypes/lib/childrenEventType";
import { validateCustomEventName } from "@calcom/features/eventtypes/lib/eventNaming";
import type {
  EventTypeSetupProps,
  EventTypeUpdateInput,
  FormValues,
} from "@calcom/features/eventtypes/lib/types";
import { sortHosts } from "@calcom/lib/bookings/hostGroupUtils";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { validateIntervalLimitOrder } from "@calcom/lib/intervalLimits/validateIntervalLimitOrder";
import { validateBookerLayouts } from "@calcom/lib/validateBookerLayouts";
import { eventTypeBookingFields as eventTypeBookingFieldsSchema } from "@calcom/prisma/zod-utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type Fields = z.infer<typeof eventTypeBookingFieldsSchema>;

export const useEventTypeForm = ({
  eventType,
  onSubmit,
  onFormStateChange,
}: {
  eventType: EventTypeSetupProps["eventType"];
  onSubmit: (data: EventTypeUpdateInput) => void;
  onFormStateChange?: (formState: {
    isDirty: boolean;
    dirtyFields: Partial<FormValues>;
    values: FormValues;
  }) => void;
}) => {
  const { t } = useLocale();
  const [periodDates] = useState<{ startDate: Date; endDate: Date }>({
    startDate: new Date(eventType.periodStartDate || Date.now()),
    endDate: new Date(eventType.periodEndDate || Date.now()),
  });
  // this is a nightmare to type, will do in follow up PR
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const defaultValues: any = useMemo(() => {
    return {
      title: eventType.title,
      id: eventType.id,
      slug: eventType.slug,
      afterEventBuffer: eventType.afterEventBuffer,
      beforeEventBuffer: eventType.beforeEventBuffer,
      eventName: eventType.eventName || "",
      scheduleName: eventType.scheduleName,
      periodDays: eventType.periodDays,
      requiresBookerEmailVerification: eventType.requiresBookerEmailVerification,
      seatsPerTimeSlot: eventType.seatsPerTimeSlot,
      seatsShowAttendees: eventType.seatsShowAttendees,
      seatsShowAvailabilityCount: eventType.seatsShowAvailabilityCount,
      lockTimeZoneToggleOnBookingPage: eventType.lockTimeZoneToggleOnBookingPage,
      lockedTimeZone: eventType.lockedTimeZone || null,
      locations: eventType.locations || [],
      destinationCalendar: eventType.destinationCalendar,
      recurringEvent: eventType.recurringEvent || null,
      isInstantEvent: eventType.isInstantEvent,
      instantMeetingParameters: eventType.instantMeetingParameters || [],
      instantMeetingExpiryTimeOffsetInSeconds: eventType.instantMeetingExpiryTimeOffsetInSeconds,
      description: eventType.description ?? undefined,
      schedule: eventType.schedule || undefined,
      instantMeetingSchedule: eventType.instantMeetingSchedule || undefined,
      bookingLimits: eventType.bookingLimits || undefined,
      onlyShowFirstAvailableSlot: eventType.onlyShowFirstAvailableSlot || undefined,
      durationLimits: eventType.durationLimits || undefined,
      length: eventType.length,
      hidden: eventType.hidden,
      multiplePrivateLinks: eventType.hashedLink.map((link) => ({
        link: link.link,
        expiresAt: link.expiresAt,
        maxUsageCount: link.maxUsageCount,
      })),
      eventTypeColor: eventType.eventTypeColor || null,
      periodDates: {
        startDate: periodDates.startDate,
        endDate: periodDates.endDate,
      },
      hideCalendarNotes: eventType.hideCalendarNotes,
      hideCalendarEventDetails: eventType.hideCalendarEventDetails,
      offsetStart: eventType.offsetStart,
      bookingFields: eventType.bookingFields,
      periodType: eventType.periodType,
      periodCountCalendarDays: !!eventType.periodCountCalendarDays,
      schedulingType: eventType.schedulingType,
      requiresConfirmation: eventType.requiresConfirmation,
      canSendCalVideoTranscriptionEmails: eventType.canSendCalVideoTranscriptionEmails,
      requiresConfirmationWillBlockSlot: eventType.requiresConfirmationWillBlockSlot,
      requiresConfirmationForFreeEmail: eventType.requiresConfirmationForFreeEmail,
      slotInterval: eventType.slotInterval,
      minimumBookingNotice: eventType.minimumBookingNotice,
      minimumRescheduleNotice: eventType.minimumRescheduleNotice ?? null,
      disabledCancelling: eventType.disableCancelling ?? false,
      disabledRescheduling: eventType.disableRescheduling ?? false,
      allowReschedulingPastBookings: eventType.allowReschedulingPastBookings,
      hideOrganizerEmail: eventType.hideOrganizerEmail,
      metadata: eventType.metadata,
      hosts: eventType.hosts.sort((a, b) => sortHosts(a, b, eventType.isRRWeightsEnabled)),
      hostGroups: eventType.hostGroups || [],
      successRedirectUrl: eventType.successRedirectUrl || "",
      forwardParamsSuccessRedirect: eventType.forwardParamsSuccessRedirect,
      users: eventType.users,
      useEventTypeDestinationCalendarEmail: eventType.useEventTypeDestinationCalendarEmail,
      secondaryEmailId: eventType?.secondaryEmailId || -1,
      children: eventType.children.map((ch) => ({
        ...ch,
        created: true,
        owner: {
          ...ch.owner,
          eventTypeSlugs:
            eventType.team?.members
              .find((mem) => mem.user.id === ch.owner.id)
              ?.user.eventTypes.map((evTy) => evTy.slug)
              .filter((slug) => slug !== eventType.slug) ?? [],
        },
      })),
      seatsPerTimeSlotEnabled: eventType.seatsPerTimeSlot,
      autoTranslateDescriptionEnabled: eventType.autoTranslateDescriptionEnabled,
      autoTranslateInstantMeetingTitleEnabled: eventType.autoTranslateInstantMeetingTitleEnabled ?? true,
      rescheduleWithSameRoundRobinHost: eventType.rescheduleWithSameRoundRobinHost,
      assignAllTeamMembers: eventType.assignAllTeamMembers,
      assignRRMembersUsingSegment: eventType.assignRRMembersUsingSegment,
      rrSegmentQueryValue: eventType.rrSegmentQueryValue,
      isRRWeightsEnabled: eventType.isRRWeightsEnabled,
      maxLeadThreshold: eventType.maxLeadThreshold,
      includeNoShowInRRCalculation: eventType.includeNoShowInRRCalculation,
      useEventLevelSelectedCalendars: eventType.useEventLevelSelectedCalendars,
      customReplyToEmail: eventType.customReplyToEmail || null,
      calVideoSettings: eventType.calVideoSettings,
      maxActiveBookingsPerBooker: eventType.maxActiveBookingsPerBooker || null,
      maxActiveBookingPerBookerOfferReschedule: eventType.maxActiveBookingPerBookerOfferReschedule,
      showOptimizedSlots: eventType.showOptimizedSlots ?? false,
      enablePerHostLocations: eventType.enablePerHostLocations ?? false,
      requiresCancellationReason: eventType.requiresCancellationReason || null,
    };
  }, [eventType, periodDates]);

  const form = useForm<FormValues>({
    defaultValues,
    resolver: zodResolver(
      z
        .object({
          // Length if string, is converted to a number or it can be a number
          // Make it optional because it's not submitted from all tabs of the page
          eventName: z
            .string()
            .superRefine((val, ctx) => {
              const bookingFields: Record<string, Fields[number]["name"]> = {};
              const _bookingFields = form.getValues("bookingFields");
              _bookingFields.forEach(({ name }: { name: string }) => {
                bookingFields[name] = name;
              });

              const validationResult = validateCustomEventName(val, bookingFields);
              if (validationResult !== true) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: t("invalid_event_name_variables", { item: validationResult }),
                });
              }
            })
            .optional(),
          length: z.union([z.string().transform((val) => +val), z.number()]).optional(),
          offsetStart: z.union([z.string().transform((val) => +val), z.number()]).optional(),
          bookingFields: eventTypeBookingFieldsSchema,
          locations: locationsResolver(t),
          calVideoSettings: z
            .object({
              redirectUrlOnExit: z.string().url().nullish(),
              disableRecordingForOrganizer: z.boolean().nullable(),
              disableRecordingForGuests: z.boolean().nullable(),
              enableAutomaticTranscription: z.boolean().nullable(),
              enableAutomaticRecordingForOrganizer: z.boolean().nullable(),
              disableTranscriptionForGuests: z.boolean().nullable(),
              disableTranscriptionForOrganizer: z.boolean().nullable(),
              requireEmailForGuests: z.boolean().nullable(),
            })
            .optional()
            .nullable(),
        })
        // TODO: Add schema for other fields later.
        .passthrough()
    ),
  });

  const {
    formState: { isDirty: isFormDirty, dirtyFields },
  } = form;

  // Watch all form values to trigger onFormStateChange on any change
  const watchedValues = form.watch();

  const isObject = <T>(value: T): boolean => {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  };

  const isArray = <T>(value: T): boolean => {
    return Array.isArray(value);
  };

  const getNestedField = (obj: typeof dirtyFields, path: string) => {
    const keys = path.split(".");
    let current = obj;

    for (let i = 0; i < keys.length; i++) {
      // @ts-expect-error /—— currentKey could be any deeply nested fields thanks to recursion
      const currentKey = current[keys[i]];
      if (currentKey === undefined) return undefined;
      current = currentKey;
    }

    return current;
  };

  const getDirtyFields = (values: FormValues): Partial<FormValues> => {
    if (!isFormDirty) {
      return {};
    }

    const isFieldDirty = (fieldName: keyof FormValues) => {
      // If the field itself is directly marked as dirty
      if (dirtyFields[fieldName] === true) {
        return true;
      }

      // Check if the field is an object or an array
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fieldValue: any = getNestedField(dirtyFields, fieldName);
      if (isObject(fieldValue)) {
        for (const key in fieldValue) {
          if (fieldValue[key] === true) {
            return true;
          }

          if (isObject(fieldValue[key]) || isArray(fieldValue[key])) {
            const nestedFieldName = `${fieldName}.${key}` as keyof FormValues;
            // Recursive call for nested objects or arrays
            if (isFieldDirty(nestedFieldName)) {
              return true;
            }
          }
        }
      }
      if (isArray(fieldValue)) {
        for (const element of fieldValue) {
          // If element is an object, check each property of the object
          if (isObject(element)) {
            for (const key in element) {
              if (element[key] === true) {
                return true;
              }

              if (isObject(element[key]) || isArray(element[key])) {
                const nestedFieldName = `${fieldName}.${key}` as keyof FormValues;
                // Recursive call for nested objects or arrays within each element
                if (isFieldDirty(nestedFieldName)) {
                  return true;
                }
              }
            }
          } else if (element === true) {
            return true;
          }
        }
      }

      return false;
    };

    const updatedFields: Partial<FormValues> = {};
    Object.keys(dirtyFields).forEach((key) => {
      const typedKey = key as keyof typeof dirtyFields;
      updatedFields[typedKey] = undefined;
      const isDirty = isFieldDirty(typedKey);
      if (isDirty) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        updatedFields[typedKey] = values[typedKey];
      }
    });
    return updatedFields;
  };

  const handleSubmit = async (values: FormValues): Promise<boolean> => {
    if (!isFormDirty) {
      return false;
    }

    const { children } = values;
    const dirtyValues = getDirtyFields(values);
    const dirtyFieldExists = Object.keys(dirtyValues).length !== 0;
    const {
      periodDates,
      periodCountCalendarDays,
      beforeEventBuffer,
      afterEventBuffer,
      seatsPerTimeSlot,
      seatsShowAttendees,
      seatsShowAvailabilityCount,
      bookingLimits,
      onlyShowFirstAvailableSlot,
      durationLimits,
      recurringEvent,
      eventTypeColor,
      customReplyToEmail,
      locations,
      metadata,
      customInputs,
      assignAllTeamMembers,
      // We don't need to send send these values to the backend
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      seatsPerTimeSlotEnabled,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      minimumBookingNoticeInDurationType,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      bookerLayouts,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      multipleDurationEnabled,
      length,
      ...input
    } = dirtyValues;
    if (length && !Number(length)) throw new Error(t("event_setup_length_error"));

    const finalSeatsPerTimeSlot =
      seatsPerTimeSlot === undefined ? eventType.seatsPerTimeSlot : seatsPerTimeSlot;
    const finalRecurringEvent = recurringEvent === undefined ? eventType.recurringEvent : recurringEvent;

    if (finalSeatsPerTimeSlot && finalRecurringEvent) {
      throw new Error(t("recurring_event_seats_error"));
    }

    if (bookingLimits) {
      const isValid = validateIntervalLimitOrder(bookingLimits);
      if (!isValid) throw new Error(t("event_setup_booking_limits_error"));
    }

    if (durationLimits) {
      const isValid = validateIntervalLimitOrder(durationLimits);
      if (!isValid) throw new Error(t("event_setup_duration_limits_error"));
    }

    const layoutError = validateBookerLayouts(metadata?.bookerLayouts || null);
    if (layoutError) throw new Error(t(layoutError));

    if (metadata?.multipleDuration !== undefined) {
      if (metadata?.multipleDuration.length < 1) {
        throw new Error(t("event_setup_multiple_duration_error"));
      } else {
        // if length is unchanged, we skip this check
        if (length !== undefined) {
          if (!length && !metadata?.multipleDuration?.includes(length)) {
            //This would work but it leaves the potential of this check being useless. Need to check against length and not eventType.length, but length can be undefined
            throw new Error(t("event_setup_multiple_duration_default_error"));
          }
        }
      }
    }

    // Prevent two payment apps to be enabled
    // Ok to cast type here because this metadata will be updated as the event type metadata
    if (checkForMultiplePaymentApps(metadata)) throw new Error(t("event_setup_multiple_payment_apps_error"));

    if (metadata?.apps?.stripe?.paymentOption === "HOLD" && seatsPerTimeSlot) {
      throw new Error(t("seats_and_no_show_fee_error"));
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { availability, users, scheduleName, disabledCancelling, disabledRescheduling, ...rest } = input;
    // Strip children down to only the fields the server schema expects.
    // The full children objects contain avatar, profile, and other display-only
    // data that bloats the request payload. With many assigned users (~85+),
    // this can push the request body over the 1MB server limit.
    const strippedChildren = children ? stripChildrenForPayload(children) : undefined;

    const payload = {
      ...rest,
      length,
      locations,
      recurringEvent,
      periodStartDate: periodDates?.startDate,
      periodEndDate: periodDates?.endDate,
      periodCountCalendarDays,
      id: eventType.id,
      beforeEventBuffer,
      afterEventBuffer,
      bookingLimits,
      onlyShowFirstAvailableSlot,
      durationLimits,
      eventTypeColor,
      customReplyToEmail,
      seatsPerTimeSlot,
      seatsShowAttendees,
      seatsShowAvailabilityCount,
      metadata,
      customInputs,
      children: strippedChildren,
      assignAllTeamMembers,
      multiplePrivateLinks: values.multiplePrivateLinks,
      disableCancelling: disabledCancelling,
      disableRescheduling: disabledRescheduling,
    } satisfies EventTypeUpdateInput;
    // Filter out undefined values
    const filteredPayload = Object.entries(payload).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        // @ts-expect-error Element implicitly has any type
        acc[key] = value;
      }
      return acc;
    }, {}) as EventTypeUpdateInput;

    if (!dirtyFieldExists) {
      return false;
    }

    onSubmit({ ...filteredPayload, id: eventType.id });
    return true;
  };

  useEffect(() => {
    if (onFormStateChange) {
      onFormStateChange({
        isDirty: isFormDirty,
        dirtyFields: dirtyFields as Partial<FormValues>,
        values: watchedValues,
      });
    }
  }, [isFormDirty, dirtyFields, watchedValues, onFormStateChange]);

  return { form, handleSubmit };
};
