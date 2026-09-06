import type { LocationObject } from "@calcom/app-store/locations";
import { DefaultEventLocationTypeEnum, getOrganizerInputLocationTypes } from "@calcom/app-store/locations";
import type { GetBookingType } from "@calcom/features/bookings/lib/get-booking";
import getLocationOptionsForSelect from "@calcom/features/bookings/lib/getLocationOptionsForSelect";
import { fieldsThatSupportLabelAsSafeHtml } from "@calcom/features/form-builder/fieldsThatSupportLabelAsSafeHtml";
import { fieldTypesConfigMap } from "@calcom/features/form-builder/fieldTypes";
import { SystemField } from "@calcom/lib/bookings/SystemField";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { markdownToSafeHTML } from "@calcom/lib/markdownToSafeHTML";
import type { RouterOutputs } from "@calcom/trpc/react";
import { FormBuilderField } from "@calcom/web/modules/form-builder/components/FormBuilderField";
import { useMemo, useRef } from "react";
import { useFormContext } from "react-hook-form";
import { z } from "zod";

type TouchedFields = {
  responses?: Record<string, boolean>;
};

type Fields = NonNullable<RouterOutputs["viewer"]["public"]["event"]>["bookingFields"];
const PhoneLocationSchema = z.object({
  value: z.literal(DefaultEventLocationTypeEnum.Phone),
  optionValue: z.string().optional(),
});
export const BookingFields = ({
  fields,
  locations,
  rescheduleUid,
  isDynamicGroupBooking,
  bookingData,
  isPaidEvent,
  paymentCurrency = "USD",
}: {
  fields: Fields;
  locations: LocationObject[];
  rescheduleUid?: string;
  bookingData?: GetBookingType | null;
  isDynamicGroupBooking: boolean;
  isPaidEvent?: boolean;
  paymentCurrency?: string;
}) => {
  const { t, i18n } = useLocale();
  const { watch, setValue, formState } = useFormContext();
  const locationResponse = watch("responses.location");
  const responses = watch("responses");
  const currentView = rescheduleUid ? "reschedule" : "";
  // Identify all phone fields (except location field)
  const otherPhoneFieldNames = useMemo(
    () => fields.filter((f) => f.type === "phone" && f.name !== SystemField.Enum.location).map((f) => f.name),
    [fields]
  );

  // Track last synced value to avoid redundant updates
  const lastSyncedPhoneRef = useRef<string | null>(null);

  // Event-driven sync function
  const syncPhoneFields = (locationValue: unknown) => {
    const parsed = PhoneLocationSchema.safeParse(locationValue);
    if (!parsed.success) return;
    const { optionValue } = parsed.data;
    const phone = (optionValue ?? "").trim();

    // Skip if empty or same as last sync (avoid redundant updates during typing)
    if (!phone || phone === lastSyncedPhoneRef.current) return;

    // Copy phone to other phone fields (only if user hasn't manually touched them)
    otherPhoneFieldNames.forEach((name) => {
      const targetTouched = !!(formState.touchedFields as TouchedFields)?.responses?.[name];

      if (!targetTouched) {
        setValue(`responses.${name}`, phone, {
          shouldDirty: false,
          shouldValidate: false,
        });
      }
    });

    lastSyncedPhoneRef.current = phone;
  };

  const getPriceFormattedLabel = (label: string, price: number) =>
    `${label} (${Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency: paymentCurrency,
    }).format(price)})`;

  const getFieldWithDirectPricing = (field: Fields[number]) => {
    if (!fieldTypesConfigMap[field.type]?.supportsPricing || !field.label || !field.price) {
      return field;
    }

    const price = typeof field.price === "string" ? parseFloat(field.price) : field.price;
    const label = getPriceFormattedLabel(field.label, price);

    return {
      ...field,
      label,
      ...(fieldsThatSupportLabelAsSafeHtml.includes(field.type) && field.labelAsSafeHtml
        ? { labelAsSafeHtml: markdownToSafeHTML(label) }
        : { labelAsSafeHtml: undefined }),
    };
  };

  const getFieldWithOptionLevelPrices = (field: Fields[number]) => {
    if (!fieldTypesConfigMap[field.type]?.optionsSupportPricing || !field.options) return field;

    return {
      ...field,
      options: field.options.map((opt) => {
        const option = opt as { value: string; label: string; price?: number };
        const optionPrice = option.price;

        // Only add price to label if there's a price
        if (!optionPrice) return option;

        return {
          ...option,
          label: getPriceFormattedLabel(option.label, optionPrice),
        };
      }),
    };
  };

  const isParentVisible = (parent: Fields[number]) => {
    if (parent.views && !parent.views.find((view) => view.id === currentView)) return false;
    if (parent.hidden) return false;
    if (parent.hideWhenJustOneOption && (parent.options?.length ?? 0) <= 1) return false;
    if (parent.name === SystemField.Enum.guests && isDynamicGroupBooking) return false;
    return true;
  };

  return (
    // TODO: It might make sense to extract this logic into BookingFields config, that would allow to quickly configure system fields and their editability in fresh booking and reschedule booking view
    // The logic here intends to make modifications to booking fields based on the way we want to specifically show Booking Form
    <div>
      {fields.map((field, index) => {
        // During reschedule by default all system fields are readOnly. Make them editable on case by case basis.
        // Allowing a system field to be edited might require sending emails to attendees, so we need to be careful
        const rescheduleReadOnly =
          (field.editable === "system" || field.editable === "system-but-optional") &&
          !!rescheduleUid &&
          bookingData !== null;

        const bookingReadOnly = field.editable === "user-readonly";

        let readOnly = bookingReadOnly || rescheduleReadOnly;

        let hidden = !!field.hidden;
        const fieldViews = field.views;

        if (field.parentQuestionName && field.triggerValue !== undefined) {
          const parent = fields.find((parentField) => parentField.name === field.parentQuestionName);
          const parentValue = responses?.[field.parentQuestionName];
          hidden =
            hidden ||
            !parent ||
            !!parent.parentQuestionName ||
            (parent ? !isParentVisible(parent) : false) ||
            String(parentValue ?? "") !== String(field.triggerValue);
        }

        if (fieldViews && !fieldViews.find((view) => view.id === currentView)) {
          return null;
        }

        if (field.name === SystemField.Enum.rescheduleReason) {
          if (bookingData === null) {
            return null;
          }
          // rescheduleReason is a reschedule specific field and thus should be editable during reschedule
          readOnly = false;
        }

        if (field.name === SystemField.Enum.smsReminderNumber) {
          // `smsReminderNumber` and location.optionValue when location.value===phone are the same data point. We should solve it in a better way in the Form Builder itself.
          // I think we should have a way to connect 2 fields together and have them share the same value in Form Builder
          if (locationResponse?.value === "phone") {
            setValue(`responses.${SystemField.Enum.smsReminderNumber}`, locationResponse?.optionValue);
            // Just don't render the field now, as the value is already connected to attendee phone location
            return null;
          }
          // `smsReminderNumber` can be edited during reschedule even though it's a system field
          readOnly = false;
        }

        if (field.name === SystemField.Enum.guests) {
          readOnly = false;
          // No matter what user configured for Guests field, we don't show it for dynamic group booking as that doesn't support guests
          hidden = isDynamicGroupBooking ? true : !!field.hidden;
        }

        // We don't show `notes` field during reschedule but since it's a query param we better valid if rescheduleUid brought any bookingData
        if (field.name === SystemField.Enum.notes && bookingData !== null) {
          return null;
        }

        if (field.name === SystemField.Enum.location) {
          readOnly = false;
        }

        // Dynamically populate location field options
        if (field.name === SystemField.Enum.location && field.type === "radioInput") {
          if (!field.optionsInputs) {
            throw new Error("radioInput must have optionsInputs");
          }
          const optionsInputs = field.optionsInputs;

          // TODO: Instead of `getLocationOptionsForSelect` options should be retrieved from dataStore[field.getOptionsAt]. It would make it agnostic of the `name` of the field.
          const options = getLocationOptionsForSelect(locations, t);
          options.forEach((option) => {
            const optionInput = optionsInputs[option.value as keyof typeof optionsInputs];
            if (optionInput) {
              optionInput.placeholder = option.inputPlaceholder;
            }
          });
          field.options = options.filter(
            (location): location is NonNullable<(typeof options)[number]> => !!location
          );
        }

        if (field?.options) {
          const organizerInputTypes = getOrganizerInputLocationTypes();
          const organizerInputObj: Record<string, number> = {};

          field.options.forEach((f) => {
            if (f.value in organizerInputObj) {
              organizerInputObj[f.value]++;
            } else {
              organizerInputObj[f.value] = 1;
            }
          });

          field.options = field.options.map((field) => {
            return {
              ...field,
              value:
                organizerInputTypes.includes(field.value) && organizerInputObj[field.value] > 1
                  ? field.label
                  : field.value,
            };
          });
        }

        // Add price display for custom inputs with prices
        let fieldWithPrice = field;

        if (isPaidEvent) {
          // Handle number fields and boolean (single checkbox) fields
          if (fieldTypesConfigMap[field.type]?.supportsPricing) {
            fieldWithPrice = getFieldWithDirectPricing(field);
          }

          // Handle fields with option-level prices (select, multiselect, and checkbox group)
          if (fieldTypesConfigMap[field.type]?.optionsSupportPricing) {
            fieldWithPrice = getFieldWithOptionLevelPrices(fieldWithPrice);
          }
        }

        return (
          <FormBuilderField
            className="mb-4"
            field={{ ...fieldWithPrice, hidden }}
            readOnly={readOnly}
            key={index}
            {...(field.name === SystemField.Enum.location && {
              onValueChange: ({ value }) => {
                syncPhoneFields(value);
              },
            })}
          />
        );
      })}
    </div>
  );
};
