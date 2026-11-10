import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { LearnMoreLink } from "@calcom/features/eventtypes/components/LearnMoreLink";
import type { FormValues } from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import { SettingsToggle } from "@calcom/ui/components/form";
import { TextField, CheckboxField } from "@calcom/ui/components/form";

type maxActiveBookingsPerBookerLockedProps = {
  disabled: boolean;
  LockedIcon: false | JSX.Element;
  isLocked: boolean;
};

export default function MaxActiveBookingsPerBookerController({
  maxActiveBookingsPerBookerLocked,
}: {
  maxActiveBookingsPerBookerLocked: maxActiveBookingsPerBookerLockedProps;
}) {
  const { t } = useLocale();
  const formMethods = useFormContext<FormValues>();

  const [maxActiveBookingsPerBookerToggle, setMaxActiveBookingsPerBookerToggle] = useState(
    (formMethods.getValues("maxActiveBookingsPerBooker") ?? 0) > 0
  );

  const isRecurringEvent = !!formMethods.getValues("recurringEvent");
  const maxActiveBookingPerBookerOfferReschedule = formMethods.watch(
    "maxActiveBookingPerBookerOfferReschedule"
  );

  return (
    <Controller
      name="maxActiveBookingsPerBooker"
      render={({ field: { onChange, value } }) => {
        const isChecked = maxActiveBookingsPerBookerToggle;
        return (
          <SettingsToggle
            labelClassName={classNames("text-sm")}
            {...maxActiveBookingsPerBookerLocked}
            disabled={isRecurringEvent || maxActiveBookingsPerBookerLocked.disabled}
            tooltip={isRecurringEvent ? t("recurring_event_doesnt_support_booker_booking_limit") : ""}
            toggleSwitchAtTheEnd={true}
            switchContainerClassName={classNames(
              "border-subtle mt-6 rounded-lg border py-6 px-4 sm:px-6",
              isChecked && "rounded-b-none"
            )}
            childrenClassName={classNames("lg:ml-0")}
            title={t("booker_upcoming_limit")}
            description={
              <LearnMoreLink
                t={t}
                i18nKey="booker_booking_limit_description"
                href="https://github.com/OpenCal-Community/cal.diy/wiki/Booker-Active-Booking-Limit"
              />
            }
            checked={isChecked}
            onCheckedChange={(active) => {
              if (active) {
                onChange(1);
              } else {
                onChange(null);
              }
              setMaxActiveBookingsPerBookerToggle((state) => !state);
            }}>
            <div className="border-subtle rounded-b-lg border border-t-0 p-6">
              <TextField
                required
                type="number"
                value={value ?? ""}
                disabled={maxActiveBookingsPerBookerLocked.disabled}
                onChange={(e) => {
                  onChange(e.target.value === "" ? null : parseInt(e.target.value, 10));
                }}
                min={1}
                step={1}
                containerClassName={classNames("max-w-80")}
                addOnSuffix="bookings"
                data-testid="booker-booking-limit-input"
              />
              <CheckboxField
                checked={!!maxActiveBookingPerBookerOfferReschedule}
                descriptionAsLabel
                description={t("reschedule_last_booking_offer")}
                disabled={maxActiveBookingsPerBookerLocked.disabled}
                onChange={(e) => {
                  formMethods.setValue("maxActiveBookingPerBookerOfferReschedule", e.target.checked, {
                    shouldDirty: true,
                  });
                }}
              />
            </div>
          </SettingsToggle>
        );
      }}
    />
  );
}
