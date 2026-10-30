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

export type DisableCancellingCustomClassNames = SettingsToggleClassNames & {
  radioGroupContainer?: string;
  alwaysCancelRadio?: string;
  conditionalCancelRadio?: {
    container?: string;
    timeInput?: string;
  };
};

type DisableCancellingControllerProps = {
  eventType: EventTypeSetup;
  disableCancelling: boolean;
  onDisableCancelling: (val: boolean) => void;
  customClassNames?: DisableCancellingCustomClassNames;
};

export default function DisableCancellingController({
  eventType,
  disableCancelling,
  onDisableCancelling,
  customClassNames,
}: DisableCancellingControllerProps) {
  const { t } = useLocale();
  const formMethods = useFormContext<FormValues>();

  const currentMinimumCancellationNotice = formMethods.watch("minimumCancellationNotice");
  const [minimumCancellationNoticeValue, setMinimumCancellationNoticeValue] = useState<number>(
    currentMinimumCancellationNotice && currentMinimumCancellationNotice > 0
      ? currentMinimumCancellationNotice
      : 60
  );
  const radioGroupOnValueChangeRef = useRef<((val: string) => void) | null>(null);

  const [shouldShowRadioButtons, setShouldShowRadioButtons] = useState(
    disableCancelling ||
      (currentMinimumCancellationNotice !== null && currentMinimumCancellationNotice > 0) ||
      eventType.disableCancelling === true ||
      false
  );
  useEffect(() => {
    if (currentMinimumCancellationNotice && currentMinimumCancellationNotice > 0) {
      setMinimumCancellationNoticeValue(currentMinimumCancellationNotice);
    }
  }, [currentMinimumCancellationNotice]);

  const shouldLockDisableProps = (_field: string) => ({
    disabled: false,
    LockedIcon: false as const,
    isLocked: false,
  });
  const disableCancellingLocked = shouldLockDisableProps("disableCancelling");
  const minimumCancellationNoticeLocked = shouldLockDisableProps("minimumCancellationNotice");

  return (
    <div className="block items-start sm:flex">
      <div className="w-full">
        <Controller
          name="disabledCancelling"
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
              title={t("disable_cancelling")}
              data-testid="disable-cancelling-toggle"
              disabled={disableCancellingLocked.disabled}
              LockedIcon={disableCancellingLocked.LockedIcon}
              description={
                <LearnMoreLink
                  t={t}
                  i18nKey="description_disable_cancelling"
                  href="https://cal.com/help/event-types/disable-canceling-rescheduling#disable-cancelling"
                />
              }
              checked={shouldShowRadioButtons}
              onCheckedChange={(val) => {
                if (val) {
                  onChange(true);
                  onDisableCancelling(true);
                  formMethods.setValue("minimumCancellationNotice", null, { shouldDirty: true });
                  setShouldShowRadioButtons(true);
                } else {
                  onChange(false);
                  onDisableCancelling(false);
                  formMethods.setValue("minimumCancellationNotice", null, { shouldDirty: true });
                  setShouldShowRadioButtons(false);
                }
              }}>
              {shouldShowRadioButtons && (
                <div className="rounded-b-lg border border-subtle border-t-0 p-6">
                  <RadioGroup.Root
                    value={
                      disableCancelling
                        ? "always"
                        : currentMinimumCancellationNotice !== null &&
                            currentMinimumCancellationNotice > 0
                          ? "notice"
                          : "always"
                    }
                    onValueChange={(val) => {
                      const handler = (val: string) => {
                        if (val === "always") {
                          onChange(true);
                          onDisableCancelling(true);
                          formMethods.setValue("minimumCancellationNotice", null, { shouldDirty: true });
                          setMinimumCancellationNoticeValue(0);
                        } else if (val === "notice") {
                          onChange(false);
                          onDisableCancelling(false);
                          const valueToSet =
                            minimumCancellationNoticeValue > 0 ? minimumCancellationNoticeValue : 60;
                          formMethods.setValue("minimumCancellationNotice", valueToSet, {
                            shouldDirty: true,
                          });
                          setMinimumCancellationNoticeValue(valueToSet);
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
                        disabled={minimumCancellationNoticeLocked.disabled}
                        id="cancel-always"
                        value="always"
                        className={customClassNames?.alwaysCancelRadio}
                      />
                      <RadioField
                        disabled={minimumCancellationNoticeLocked.disabled}
                        className={classNames(
                          "items-center",
                          customClassNames?.conditionalCancelRadio?.container
                        )}
                        label={
                          <ServerTrans
                            t={t}
                            i18nKey="when_less_than_minutes_before_meeting"
                            components={[
                              <div
                                key="when_less_than_minutes_before_meeting"
                                className="mx-2 inline-flex items-center">
                                <Input
                                  type="number"
                                  min={1}
                                  disabled={minimumCancellationNoticeLocked.disabled}
                                  onChange={(evt) => {
                                    const val = Number(evt.target?.value);
                                    if (val > 0) {
                                      setMinimumCancellationNoticeValue(val);
                                      formMethods.setValue("minimumCancellationNotice", val, {
                                        shouldDirty: true,
                                      });
                                      radioGroupOnValueChangeRef.current?.("notice");
                                    }
                                  }}
                                  className={classNames(
                                    "m-0! block w-20 border-default text-sm [appearance:textfield] focus:z-10",
                                    customClassNames?.conditionalCancelRadio?.timeInput
                                  )}
                                  defaultValue={
                                    currentMinimumCancellationNotice && currentMinimumCancellationNotice > 0
                                      ? currentMinimumCancellationNotice
                                      : 60
                                  }
                                />
                              </div>,
                            ]}
                          />
                        }
                        id="cancel-notice"
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
