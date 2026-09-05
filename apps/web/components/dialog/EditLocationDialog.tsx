import { ErrorMessage } from "@hookform/error-message";
import { zodResolver } from "@hookform/resolvers/zod";
import { isValidPhoneNumber } from "libphonenumber-js/max";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch, useFormContext } from "react-hook-form";
import { z } from "zod";

import type { EventLocationType, LocationObject } from "@calcom/app-store/locations";
import {
  getLocationByType,
  getHumanReadableLocationValue,
  getMessageForOrganizer,
  isAttendeeInputRequired,
  LocationType,
  OrganizerDefaultConferencingAppType,
} from "@calcom/app-store/locations";
import { Dialog } from "@calcom/features/components/controlled-dialog";
import PhoneInput from "@calcom/web/components/phone-input";
import type { LocationOption } from "@calcom/features/form/components/LocationSelect";
import LocationSelect from "@calcom/features/form/components/LocationSelect";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { DialogContent, DialogFooter, DialogHeader } from "@calcom/ui/components/dialog";
import { Form, Input } from "@calcom/ui/components/form";
import { MapPinIcon } from "@coss/ui/icons";

import { QueryCell } from "../../lib/QueryCell";

interface ISetLocationDialog {
  saveLocation: ({
    newLocation,
    credentialId,
  }: {
    newLocation: string;
    credentialId: number | null;
  }) => Promise<void>;
  booking: {
    location: string | null;
  };
  setShowLocationModal: React.Dispatch<React.SetStateAction<boolean>>;
  isOpenDialog: boolean;
  teamId?: number;
}

const LocationInput = (props: {
  eventLocationType: EventLocationType;
  locationFormMethods: ReturnType<typeof useForm>;
  id: string;
  required: boolean;
  placeholder: string;
  className?: string;
}): JSX.Element | null => {
  const { eventLocationType, locationFormMethods, ...remainingProps } = props;
  const { control } = useFormContext() as typeof locationFormMethods;
  if (eventLocationType?.organizerInputType === "text") {
    return (
      <Input {...locationFormMethods.register(eventLocationType.variable)} type="text" {...remainingProps} />
    );
  } else if (eventLocationType?.organizerInputType === "phone") {
    return (
      <Controller
        name={eventLocationType.variable}
        control={control}
        render={({ field: { onChange, value } }) => {
          return <PhoneInput onChange={onChange} value={value} {...remainingProps} />;
        }}
      />
    );
  }
  return null;
};

export const EditLocationDialog = (props: ISetLocationDialog) => {
  const {
    saveLocation,
    booking,
    setShowLocationModal,
    isOpenDialog,
    teamId,
  } = props;
  const { t } = useLocale();
  const locationsQuery = trpc.viewer.apps.locationOptions.useQuery({ teamId });

  const locationFormSchema = z.object({
    locationType: z.string(),
    phone: z.string().optional().nullable(),
    locationAddress: z.string().optional(),
    credentialId: z.number().nullable().optional(),
    locationLink: z
      .string()
      .optional()
      .superRefine((val, ctx) => {
        if (
          eventLocationType &&
          !eventLocationType.default &&
          eventLocationType.linkType === "static" &&
          eventLocationType.urlRegExp
        ) {
          const valid = z.string().regex(new RegExp(eventLocationType.urlRegExp)).safeParse(val).success;
          if (!valid) {
            const sampleUrl = eventLocationType.organizerInputPlaceholder;
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Invalid URL for ${eventLocationType.label}. ${
                sampleUrl ? `Sample URL: ${sampleUrl}` : ""
              }`,
            });
          }
          return;
        }

        const valid = z.string().url().optional().safeParse(val).success;
        if (!valid) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid URL`,
          });
        }
        return;
      }),
    locationPhoneNumber: z
      .string()
      .nullable()
      .refine((val) => {
        if (val === null) return false;
        return isValidPhoneNumber(val);
      })
      .optional(),
  });

  const [isLocationUpdating, setIsLocationUpdating] = useState(false);

  const locationFormMethods = useForm({
    mode: "onSubmit",
    resolver: zodResolver(locationFormSchema),
  });

  const selectedLocation = useWatch({
    control: locationFormMethods.control,
    name: "locationType",
  });

  const selectedAddrValue = useWatch({
    control: locationFormMethods.control,
    name: "locationAddress",
  });

  const eventLocationType = getLocationByType(selectedLocation);

  /**
   * Depending on the location type that is selected, we show different input types or no input at all.
   */
  const SelectedLocationInput = (() => {
    if (eventLocationType && eventLocationType.organizerInputType && LocationInput) {
      if (!eventLocationType.variable) {
        console.error("eventLocationType.variable can't be undefined");
        return null;
      }

      return (
        <div>
          <label htmlFor="locationInput" className="text-default block text-sm font-medium">
            {t(eventLocationType.messageForOrganizer || "")}
          </label>
          <div className="mt-1">
            <LocationInput
              locationFormMethods={locationFormMethods}
              eventLocationType={eventLocationType}
              id="locationInput"
              placeholder={t(eventLocationType.organizerInputPlaceholder || "")}
              required
            />
            <ErrorMessage
              errors={locationFormMethods.formState.errors}
              name={eventLocationType.variable}
              className="text-error mt-1 text-sm"
              as="p"
            />
          </div>
        </div>
      );
    } else {
      return <p className="text-default text-sm">{getMessageForOrganizer(selectedLocation, t)}</p>;
    }
  })();

  return (
    <Dialog open={isOpenDialog} onOpenChange={(open) => setShowLocationModal(open)}>
      <DialogContent>
        <Form
          form={locationFormMethods}
          handleSubmit={async (values) => {
            const { locationType: newLocationType } = values;
            let newLocation;
            // For the locations that require organizer to type-in some values, we need the value
            if (eventLocationType?.organizerInputType) {
              newLocation = values[eventLocationType.variable];
            } else {
              // locationType itself can be used here e.g. For zoom we use the type itself which is "integrations:zoom". For Organizer's Default Conferencing App, it is OrganizerDefaultConferencingAppType constant
              newLocation = newLocationType;
            }

            setIsLocationUpdating(true);
            try {
              await saveLocation({
                newLocation,
                credentialId: values.credentialId ?? null,
              });
              setIsLocationUpdating(false);
              setShowLocationModal(false);
              locationFormMethods.unregister([
                "locationType",
                "locationLink",
                "locationAddress",
                "locationPhoneNumber",
              ]);
            } catch {
              // Let the user retry
              setIsLocationUpdating(false);
            }
          }}>
          <div className="flex flex-row md:space-x-3">
            <div className="bg-subtle hidden h-10 w-10 shrink-0 justify-center rounded-full md:flex">
              <MapPinIcon className="m-auto h-6 w-6" />
            </div>
            <div className="w-full md:pt-1">
              <DialogHeader title={t("edit_location")} />

              <p className="text-emphasis mb-2 ml-1 mt-6 text-sm font-bold">{t("current_location")}:</p>
              <p className="text-emphasis mb-2 ml-1 break-all text-sm">
                {getHumanReadableLocationValue(booking.location, t)}
              </p>
              <QueryCell
                query={locationsQuery}
                success={({ data }) => {
                  if (!data.length) return null;
                  let locationOptions = [...data].map((option) => {
                    if (teamId) {
                      // Let host's Default conferencing App option show for Team Event
                      return option;
                    }
                    return {
                      ...option,
                      options: option.options.filter((o) => o.value !== OrganizerDefaultConferencingAppType),
                    };
                  });

                  locationOptions = locationOptions.map((locationOption) =>
                    filterLocationOptionsForBooking(locationOption)
                  );

                  return (
                    <Controller
                      name="locationType"
                      control={locationFormMethods.control}
                      render={() => (
                        <div className="py-4">
                          <LocationSelect
                            maxMenuHeight={300}
                            name="location"
                            options={locationOptions}
                            isSearchable
                            onChange={(val) => {
                              if (val) {
                                locationFormMethods.setValue("locationType", val.value);
                                locationFormMethods.setValue("credentialId", val.credentialId);
                                locationFormMethods.unregister([
                                  "locationLink",
                                  "locationAddress",
                                  "locationPhoneNumber",
                                ]);
                                locationFormMethods.clearErrors([
                                  "locationLink",
                                  "locationPhoneNumber",
                                  "locationAddress",
                                ]);
                              }
                            }}
                          />
                        </div>
                      )}
                    />
                  );
                }}
              />
              {selectedLocation && SelectedLocationInput}
            </div>
          </div>
          <DialogFooter showDivider className="mt-8">
            <Button
              onClick={() => {
                setShowLocationModal(false);
                locationFormMethods.unregister(["locationType", "locationLink"]);
              }}
              type="button"
              color="secondary">
              {t("cancel")}
            </Button>
            <Button data-testid="update-location" type="submit" disabled={isLocationUpdating}>
              {t("update")}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

function filterLocationOptionsForBooking<T extends { options: { value: string }[] }>(locationOption: T) {
  return {
    ...locationOption,
    options: locationOption.options.filter((o) => !isAttendeeInputRequired(o.value)),
  };
}
