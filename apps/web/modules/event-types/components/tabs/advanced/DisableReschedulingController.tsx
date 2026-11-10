import { LearnMoreLink } from "@calcom/features/eventtypes/components/LearnMoreLink";
import type {
  EventTypeSetup,
  FormValues,
  SettingsToggleClassNames,
} from "@calcom/features/eventtypes/lib/types";
import ServerTrans from "@calcom/lib/components/ServerTrans";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import { Input, SettingsToggle } from "@calcom/ui/components/form";
import { RadioField } from "@calcom/ui/components/radio";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { useEffect, useRef, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";

export type DisableReschedulingCustomClassNames = SettingsToggleClassNames & {
  radioGroupContainer?: string;
  alwaysRescheduleRadio?: string;
  conditionalRescheduleRadio?: {
    container?: string;
    timeInput?: string;
  };
};

type DisableReschedulingControllerProps = {
  eventType: EventTypeSetup;
  disableRescheduling: boolean;
  onDisableRescheduling: (val: boolean) => void;
  customClassNames?: DisableReschedulingCustomClassNames;
};

export default function DisableReschedulingController({
  eventType,
  disableRescheduling,
  onDisableRescheduling,
  customClassNames,
}: DisableReschedulingControllerProps) {
  const { t } = useLocale();
  const formMethods = useFormContext<FormValues>();

  const currentMinimumRescheduleNotice = formMethods.watch("minimumRescheduleNotice");
  const [minimumRescheduleNoticeValue, setMinimumRescheduleNoticeValue] = useState<number>(
    currentMinimumRescheduleNotice && currentMinimumRescheduleNotice > 0 ? currentMinimumRescheduleNotice : 60
  );
  const radioGroupOnValueChangeRef = useRef<((val: string) => void) | null>(null);

  const [shouldShowRadioButtons, setShouldShowRadioButtons] = useState(
    disableRescheduling ||
      (currentMinimumRescheduleNotice !== null && currentMinimumRescheduleNotice > 0) ||
      eventType.disableRescheduling === true ||
      false
  );
  useEffect(() => {
    if (currentMinimumRescheduleNotice && currentMinimumRescheduleNotice > 0) {
      setMinimumRescheduleNoticeValue(currentMinimumRescheduleNotice);
    }
  }, [currentMinimumRescheduleNotice]);

  const shouldLockDisableProps = (_field: string) => ({ disabled: false, LockedIcon: false as const, isLocked: false });
  const shouldLockIndicator = (_field: string) => false;
  const disableReschedulingLocked = shouldLockDisableProps("disableRescheduling");
  const minimumRescheduleNoticeLocked = shouldLockDisableProps("minimumRescheduleNotice");

  return (
    <div className="block items-start sm:flex">
      <div className="w-full">
        <Controller
          name="disabledRescheduling"
          control={formMethods.control}
          render={({ field: { onChange } }) => (
            <SettingsToggle
              labelClassName={classNames("text-sm", customClassNames?.label)}
              toggleSwitchAtTheEnd={true}
              switchContainerClassName={classNames(
                "border-subtle rounded-lg border py-6 px-4 sm:px-6",
                shouldShowRadioButtons && "rounded-b-none",
                customClassNames?.container
              )}
              childrenClassName={classNames("lg:ml-0", customClassNames?.children)}
              descriptionClassName={customClassNames?.description}
              title={t("disable_rescheduling")}
              data-testid="disable-rescheduling-toggle"
              disabled={disableReschedulingLocked.disabled}
              LockedIcon={disableReschedulingLocked.LockedIcon}
              description={
                <LearnMoreLink
                  t={t}
                  i18nKey="description_disable_rescheduling"
                  href="https://github.com/OpenCal-Community/cal.diy/wiki/Disable-Canceling-Rescheduling#disable-rescheduling"
                />
              }
              checked={shouldShowRadioButtons}
              onCheckedChange={(val) => {
                if (val) {
                  onChange(true);
                  onDisableRescheduling(true);
                  formMethods.setValue("minimumRescheduleNotice", null, { shouldDirty: true });
                  setShouldShowRadioButtons(true);
                } else {
                  onChange(false);
                  onDisableRescheduling(false);
                  formMethods.setValue("minimumRescheduleNotice", null, { shouldDirty: true });
                  setShouldShowRadioButtons(false);
                }
              }}>
              {shouldShowRadioButtons && (
                <div className="rounded-b-lg border border-subtle border-t-0 p-6">
                  <RadioGroup.Root
                    value={
                      disableRescheduling
                        ? "always"
                        : currentMinimumRescheduleNotice !== null && currentMinimumRescheduleNotice > 0
                          ? "notice"
                          : "always"
                    }
                    onValueChange={(val) => {
                      const handler = (val: string) => {
                        if (val === "always") {
                          onChange(true);
                          onDisableRescheduling(true);
                          formMethods.setValue("minimumRescheduleNotice", null, { shouldDirty: true });
                          setMinimumRescheduleNoticeValue(0);
                        } else if (val === "notice") {
                          onChange(false);
                          onDisableRescheduling(false);
                          const valueToSet =
                            minimumRescheduleNoticeValue > 0 ? minimumRescheduleNoticeValue : 60;
                          formMethods.setValue("minimumRescheduleNotice", valueToSet, { shouldDirty: true });
                          setMinimumRescheduleNoticeValue(valueToSet);
                        }
                      };
                      radioGroupOnValueChangeRef.current = handler;
                      handler(val);
                    }}>
                    <div
                      className={classNames(
                        "flex flex-col flex-wrap justify-start gap-y-2",
                        customClassNames?.radioGroupContainer
                      )}>
                      <RadioField
                        label={t("always")}
                        disabled={minimumRescheduleNoticeLocked.disabled}
                        id="always"
                        value="always"
                        className={customClassNames?.alwaysRescheduleRadio}
                      />
                      <RadioField
                        disabled={minimumRescheduleNoticeLocked.disabled}
                        className={classNames(
                          "items-center",
                          customClassNames?.conditionalRescheduleRadio?.container
                        )}
                        label=<ServerTrans
                              t={t}
                              i18nKey="when_less_than_minutes_before_meeting"
                              components={[
                                <div
                                  key="when_less_than_minutes_before_meeting"
                                  className="mx-2 inline-flex items-center">
                                  <Input
                                    type="number"
                                    min={1}
                                    disabled={minimumRescheduleNoticeLocked.disabled}
                                    onChange={(evt) => {
                                      const val = Number(evt.target?.value);
                                      if (val > 0) {
                                        setMinimumRescheduleNoticeValue(val);
                                        formMethods.setValue("minimumRescheduleNotice", val, {
                                          shouldDirty: true,
                                        });
                                        radioGroupOnValueChangeRef.current?.("notice");
                                      }
                                    }}
                                    className={classNames(
                                  "m-0! block w-20 border-default text-sm [appearance:textfield] focus:z-10",
                                      customClassNames?.conditionalRescheduleRadio?.timeInput
                                    )}
                                    defaultValue={
                                      currentMinimumRescheduleNotice && currentMinimumRescheduleNotice > 0
                                        ? currentMinimumRescheduleNotice
                                        : 60
                                    }
                                  />
                                </div>,
                              ]}
                        />
                        id="notice"
                        value="notice"
                      />
                    </div>
                  </RadioGroup.Root>
                </div>
              )}
            </SettingsToggle>
          )}
        />
      </div>
    </div>
  );
}
